#!/usr/bin/env python3
"""Local PIURA ERP bridge for lights and smart-home devices."""

from __future__ import annotations

import asyncio
import colorsys
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import socket
import struct
import subprocess
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen


VENDOR_DIR = Path(__file__).resolve().parent / "vendor"
if VENDOR_DIR.is_dir():
    sys.path.insert(0, str(VENDOR_DIR))

try:
    from kasa import Credentials as KasaCredentials
    from kasa import Discover as KasaDiscover
except ImportError:  # The rest of the bridge still works without python-kasa.
    KasaCredentials = None
    KasaDiscover = None


HOST = "127.0.0.1"
PORT = 45831
DEVICES = (
    ("Elgato Light Strip Pro D026", "elgato-light-strip-pro-d026.local"),
    ("341", "elgato-light-strip-pro-8c54.local"),
)
SMART_PLUGS = (
    ("1", "Основное", "192.168.4.36", "HS103"),
    ("2", "Шкаф", "192.168.4.33", "HS103"),
    ("3", "Карта", "192.168.4.34", "HS103"),
    ("5", "Голова", "192.168.4.35", "HS103"),
)
SMART_STRIP = ("4", "Удлинитель", "192.168.4.67", "HS300")
PURIFIER = ("purifier", "Очиститель", "192.168.4.39", "Levoit")
TPLINK_KEYCHAIN_SERVICE = "com.piura.tp-link-local"
# Docker Desktop publishes Home Assistant on localhost's IPv6 listener here;
# forcing 127.0.0.1 makes the configuration flow fail with connection refused.
HA_URL = "http://localhost:8123"
HA_AUTH_PATH = Path("/Users/Nikolay/homeassistant/.storage/auth")
HA_CONFIG_ENTRIES_PATH = Path("/Users/Nikolay/homeassistant/.storage/core.config_entries")
HA_ENTITY_REGISTRY_PATH = Path("/Users/Nikolay/homeassistant/.storage/core.entity_registry")
PENDING_DEVICES = (
    {
        "id": "garage",
        "name": "Гараж",
        "ip": "192.168.4.45",
        "model": "Не определён",
        "kind": "garage",
        "status": "Нужно определить устройство",
    },
    {
        "id": "fan",
        "name": "Вентилятор",
        "ip": "192.168.4.23",
        "model": "Smart Switch 9",
        "kind": "fan",
        "status": "Нужен ключ Smart Life",
    },
)
ALLOWED_ORIGINS = {
    "https://nikolaypiura.github.io",
    "http://127.0.0.1",
    "http://localhost",
    "null",
}


def device_url(hostname: str) -> str:
    return f"http://{hostname}:9123/elgato/lights"


def request_device(hostname: str, payload: dict | None = None) -> dict:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        device_url(hostname),
        data=body,
        method="GET" if body is None else "PUT",
        headers={"Content-Type": "application/json"},
    )
    with urlopen(request, timeout=3) as response:
        return json.loads(response.read().decode("utf-8"))


def request_device_with_retry(hostname: str, payload: dict | None = None) -> dict:
    error: Exception | None = None
    for attempt in range(3):
        try:
            return request_device(hostname, payload)
        except (OSError, URLError, ValueError, json.JSONDecodeError) as caught:
            error = caught
            if attempt < 2:
                time.sleep(0.25)
    raise error or RuntimeError("Elgato light is unavailable")


def first_light(data: dict) -> dict:
    lights = data.get("lights") if isinstance(data, dict) else None
    return dict(lights[0]) if isinstance(lights, list) and lights else {}


def rgb_hex(hue: float, saturation: float, brightness: float = 100) -> str:
    red, green, blue = colorsys.hsv_to_rgb(
        (float(hue) % 360) / 360,
        max(0, min(100, float(saturation))) / 100,
        max(0, min(100, float(brightness))) / 100,
    )
    return "#{:02x}{:02x}{:02x}".format(round(red * 255), round(green * 255), round(blue * 255))


def hex_hs(value: str) -> tuple[float, float]:
    raw = value.strip().lstrip("#")
    if len(raw) != 6:
        raise ValueError("Expected a six-digit HEX colour")
    red, green, blue = (int(raw[index : index + 2], 16) / 255 for index in (0, 2, 4))
    hue, saturation, _ = colorsys.rgb_to_hsv(red, green, blue)
    return round(hue * 360, 1), round(saturation * 100, 1)


def kasa_encrypt(payload: dict) -> bytes:
    """Encode a legacy TP-Link Kasa request for TCP port 9999."""
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    key = 171
    encrypted = bytearray()
    for byte in raw:
        cipher = key ^ byte
        key = cipher
        encrypted.append(cipher)
    return struct.pack(">I", len(encrypted)) + encrypted


def kasa_decrypt(payload: bytes) -> dict:
    key = 171
    decrypted = bytearray()
    for byte in payload:
        plain = key ^ byte
        key = byte
        decrypted.append(plain)
    return json.loads(decrypted.decode("utf-8"))


def kasa_request(ip: str, payload: dict) -> dict:
    with socket.create_connection((ip, 9999), timeout=2) as connection:
        connection.sendall(kasa_encrypt(payload))
        header = connection.recv(4)
        if len(header) != 4:
            raise OSError("Smart plug returned an incomplete response")
        expected = struct.unpack(">I", header)[0]
        response = bytearray()
        while len(response) < expected:
            chunk = connection.recv(expected - len(response))
            if not chunk:
                raise OSError("Smart plug closed the connection")
            response.extend(chunk)
    return kasa_decrypt(bytes(response))


def kasa_request_with_retry(ip: str, payload: dict) -> dict:
    error: Exception | None = None
    for attempt in range(3):
        try:
            return kasa_request(ip, payload)
        except (OSError, ValueError, json.JSONDecodeError) as caught:
            error = caught
            if attempt < 2:
                time.sleep(0.25)
    raise error or RuntimeError("Smart plug is unavailable")


def smart_plug_status(device: tuple[str, str, str, str]) -> dict:
    device_id, name, ip, model = device
    result = {
        "id": device_id,
        "name": name,
        "ip": ip,
        "model": model,
        "kind": "plug",
        "controllable": True,
        "online": False,
        "power": False,
    }
    try:
        response = kasa_request(ip, {"system": {"get_sysinfo": {}}})
        info = response.get("system", {}).get("get_sysinfo", {})
        if int(info.get("err_code", 0)) != 0:
            raise RuntimeError(info.get("err_msg") or "Smart plug status error")
        result.update(
            {
                "online": True,
                "power": bool(info.get("relay_state")),
                "model": str(info.get("model") or model).split("(", 1)[0],
                "rssi": info.get("rssi"),
            }
        )
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        result["error"] = str(error)
    return result


def ping_host(ip: str) -> bool:
    """Return whether a local host answers one short ICMP probe."""
    try:
        completed = subprocess.run(
            ["/sbin/ping", "-c", "1", "-W", "750", ip],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=2,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return completed.returncode == 0


def tplink_credentials() -> tuple[str, str] | None:
    try:
        completed = subprocess.run(
            ["/usr/bin/security", "find-generic-password", "-s", TPLINK_KEYCHAIN_SERVICE, "-w"],
            capture_output=True,
            text=True,
            timeout=2,
            check=False,
        )
        if completed.returncode != 0:
            return None
        payload = json.loads(completed.stdout)
        username = str(payload.get("username") or "").strip()
        password = str(payload.get("password") or "")
        return (username, password) if username and password else None
    except (OSError, subprocess.TimeoutExpired, ValueError, json.JSONDecodeError):
        return None


def save_tplink_credentials(username: str, password: str) -> None:
    payload = json.dumps({"username": username, "password": password}, separators=(",", ":"))
    completed = subprocess.run(
        [
            "/usr/bin/security",
            "add-generic-password",
            "-U",
            "-s",
            TPLINK_KEYCHAIN_SERVICE,
            "-a",
            username,
            "-w",
            payload,
        ],
        capture_output=True,
        text=True,
        timeout=5,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError("Не удалось сохранить локальный вход в Связке ключей macOS")


def ha_access_token() -> str:
    """Exchange Home Assistant's newest local refresh token for a short-lived token."""
    auth = json.loads(HA_AUTH_PATH.read_text(encoding="utf-8"))
    owner_ids = {
        str(user["id"])
        for user in auth.get("data", {}).get("users", [])
        if user.get("is_owner") and user.get("is_active")
    }
    tokens = [
        token
        for token in auth.get("data", {}).get("refresh_tokens", [])
        if token.get("token_type") == "normal"
        and token.get("user_id") in owner_ids
        and token.get("client_id")
        and token.get("token")
    ]
    if not tokens:
        raise RuntimeError("Home Assistant: локальная сессия не найдена")
    refresh = max(tokens, key=lambda item: str(item.get("created_at") or ""))
    body = urlencode(
        {
            "grant_type": "refresh_token",
            "client_id": refresh["client_id"],
            "refresh_token": refresh["token"],
        }
    ).encode("utf-8")
    request = Request(
        f"{HA_URL}/auth/token",
        data=body,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urlopen(request, timeout=8) as response:
        result = json.loads(response.read().decode("utf-8"))
    token = str(result.get("access_token") or "")
    if not token:
        raise RuntimeError("Home Assistant: не удалось открыть локальную сессию")
    return token


def ha_api_request(path: str, payload: dict | None = None) -> dict | list:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = Request(
        f"{HA_URL}/api/{path.lstrip('/')}",
        data=body,
        method="GET" if payload is None else "POST",
        headers={
            "Authorization": f"Bearer {ha_access_token()}",
            "Content-Type": "application/json",
            "HA-Frontend-Base": HA_URL,
        },
    )
    with urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def ha_delete_config_flow(flow_id: str) -> None:
    request = Request(
        f"{HA_URL}/api/config/config_entries/flow/{flow_id}",
        method="DELETE",
        headers={
            "Authorization": f"Bearer {ha_access_token()}",
            "HA-Frontend-Base": HA_URL,
        },
    )
    with urlopen(request, timeout=8):
        return


def vesync_purifier_entities() -> dict[str, str]:
    """Return the useful entities owned by the VeSync config entry."""
    if not HA_CONFIG_ENTRIES_PATH.exists() or not HA_ENTITY_REGISTRY_PATH.exists():
        return {}
    entries = json.loads(HA_CONFIG_ENTRIES_PATH.read_text(encoding="utf-8"))
    vesync_ids = {
        str(entry["entry_id"])
        for entry in entries.get("data", {}).get("entries", [])
        if entry.get("domain") == "vesync"
    }
    if not vesync_ids:
        return {}
    registry = json.loads(HA_ENTITY_REGISTRY_PATH.read_text(encoding="utf-8"))
    candidates = [
        str(entity["entity_id"])
        for entity in registry.get("data", {}).get("entities", [])
        if entity.get("config_entry_id") in vesync_ids
        and not entity.get("disabled_by")
    ]
    result: dict[str, str] = {}
    for entity_id in candidates:
        lowered = entity_id.lower()
        if entity_id.startswith("fan.") and "fan" not in result:
            result["fan"] = entity_id
        elif entity_id.startswith("select.") and "night_light" in lowered:
            result["night_light"] = entity_id
        elif entity_id.startswith("switch.") and "child_lock" in lowered:
            result["child_lock"] = entity_id
        elif entity_id.startswith("switch.") and "display" in lowered:
            result["display"] = entity_id
        elif entity_id.startswith("sensor.") and "filter_lifetime" in lowered:
            result["filter_lifetime"] = entity_id
    return result


def vesync_purifier_entity() -> str | None:
    return vesync_purifier_entities().get("fan")


def configure_vesync(username: object, password: object) -> dict:
    username = str(username or "").strip()
    password = str(password or "")
    if not username or not password:
        raise ValueError("Введите почту и пароль VeSync")
    flow = ha_api_request("config/config_entries/flow", {"handler": "vesync"})
    if not isinstance(flow, dict) or not flow.get("flow_id"):
        if isinstance(flow, dict) and flow.get("reason") in {"already_configured", "single_instance_allowed"}:
            return {"ok": True, "device": purifier_status()}
        raise RuntimeError("Home Assistant не открыл настройку VeSync")
    result = ha_api_request(
        f"config/config_entries/flow/{flow['flow_id']}",
        {"username": username, "password": password},
    )
    if not isinstance(result, dict) or result.get("type") != "create_entry":
        errors = result.get("errors", {}) if isinstance(result, dict) else {}
        try:
            ha_delete_config_flow(str(flow["flow_id"]))
        except OSError:
            pass
        if errors:
            raise ValueError("VeSync не принял почту или пароль")
        raise RuntimeError("Home Assistant не завершил подключение VeSync")
    time.sleep(2)
    return {"ok": True, "device": purifier_status()}


async def async_strip_snapshot(username: str, password: str) -> dict:
    if KasaCredentials is None or KasaDiscover is None:
        raise RuntimeError("Локальный модуль TP-Link не установлен")
    device = await KasaDiscover.discover_single(
        SMART_STRIP[2],
        credentials=KasaCredentials(username, password),
        discovery_timeout=3,
        timeout=4,
    )
    try:
        await device.update()
        outlets = [
            {
                "id": f"{SMART_STRIP[0]}:{child.device_id}",
                "name": str(child.alias or f"Розетка {index}"),
                "power": bool(child.is_on),
                "online": True,
            }
            for index, child in enumerate(device.children, 1)
        ]
        return {
            "model": str(device.model or SMART_STRIP[3]),
            "power": any(outlet["power"] for outlet in outlets),
            "outlets": outlets,
        }
    finally:
        await device.protocol.close()


def smart_strip_status(credentials: tuple[str, str] | None = None) -> dict:
    device_id, name, ip, model = SMART_STRIP
    credentials = credentials or tplink_credentials()
    online = ping_host(ip)
    result = {
        "id": device_id,
        "name": name,
        "ip": ip,
        "model": model,
        "kind": "strip",
        "controllable": False,
        "online": online,
        "power": False,
        "outlets": [],
        "auth_required": False,
        "status": "Подключаем локально" if online else "Не найден в сети",
    }
    if not online:
        return result
    try:
        snapshot = asyncio.run(async_strip_snapshot(*(credentials or ("", ""))))
        result.update(
            {
                "online": True,
                "controllable": bool(snapshot["outlets"]),
                "power": snapshot["power"],
                "model": snapshot["model"],
                "outlets": snapshot["outlets"],
                "auth_required": False,
                "status": "Подключён локально",
            }
        )
    except Exception as error:  # python-kasa exposes several protocol-specific errors.
        result["auth_required"] = True
        result["status"] = "Проверьте локальный вход TP-Link"
        result["error"] = str(error)
    return result


def configure_smart_strip(username: object, password: object) -> dict:
    username = str(username or "").strip()
    password = str(password or "")
    if not username or not password:
        raise ValueError("Введите почту и пароль TP-Link")
    result = smart_strip_status((username, password))
    if not result["controllable"]:
        raise ValueError("TP-Link не принял данные для локального управления")
    save_tplink_credentials(username, password)
    return {"ok": True, "device": result}


def purifier_status() -> dict:
    device_id, name, ip, model = PURIFIER
    online = ping_host(ip)
    result = {
        "id": device_id,
        "name": name,
        "ip": ip,
        "model": model,
        "kind": "purifier",
        "controllable": False,
        "online": online,
        "power": False,
        "auth_required": True,
        "status": "Подключите VeSync к Home Assistant" if online else "Не найден в сети",
    }
    entities = vesync_purifier_entities()
    entity_id = entities.get("fan")
    if not entity_id:
        return result
    try:
        states = ha_api_request("states")
        if not isinstance(states, list):
            raise RuntimeError("Некорректный ответ Home Assistant")
        state_by_id = {
            str(item.get("entity_id")): item
            for item in states
            if isinstance(item, dict) and item.get("entity_id")
        }
        state = state_by_id.get(entity_id, {})
        available = state.get("state") not in {"unavailable", "unknown", None}
        attributes = state.get("attributes", {}) if isinstance(state, dict) else {}
        night_state = state_by_id.get(entities.get("night_light", ""), {})
        display_state = state_by_id.get(entities.get("display", ""), {})
        lock_state = state_by_id.get(entities.get("child_lock", ""), {})
        filter_state = state_by_id.get(entities.get("filter_lifetime", ""), {})
        result.update(
            {
                "online": available,
                "controllable": available,
                "power": state.get("state") == "on",
                "auth_required": False,
                "entity_id": entity_id,
                "status": "Подключён через Home Assistant" if available else "VeSync временно недоступен",
                "settings": {
                    "percentage": attributes.get("percentage"),
                    "percentage_step": attributes.get("percentage_step"),
                    "preset_mode": attributes.get("preset_mode"),
                    "night_light": night_state.get("state", "off"),
                    "night_light_options": night_state.get("attributes", {}).get(
                        "options", ["off", "dim", "on"]
                    ),
                    "display": display_state.get("state") == "on",
                    "child_lock": lock_state.get("state") == "on",
                    "filter_lifetime": filter_state.get("state"),
                },
            }
        )
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError) as error:
        result["error"] = str(error)
        result["status"] = "Home Assistant не получил состояние VeSync"
    return result


def control_purifier(power: object) -> dict:
    entity_id = vesync_purifier_entity()
    if not entity_id:
        raise ValueError("Сначала подключите VeSync к Home Assistant")
    desired = power is True or str(power).lower() in {"on", "1", "true"}
    ha_api_request(
        f"services/fan/{'turn_on' if desired else 'turn_off'}",
        {"entity_id": entity_id},
    )
    time.sleep(0.6)
    return {"ok": True, "device": purifier_status()}


def control_purifier_setting(setting: object, value: object) -> dict:
    entities = vesync_purifier_entities()
    fan_id = entities.get("fan")
    setting = str(setting or "")
    if not fan_id:
        raise ValueError("Очиститель не подключён к Home Assistant")
    if setting == "speed":
        if str(value) == "sleep":
            ha_api_request(
                "services/fan/set_preset_mode",
                {"entity_id": fan_id, "preset_mode": "sleep"},
            )
        else:
            percentage = int(value)
            if percentage not in {33, 66, 100}:
                raise ValueError("Недоступная скорость")
            ha_api_request(
                "services/fan/set_percentage",
                {"entity_id": fan_id, "percentage": percentage},
            )
    elif setting == "night_light":
        option = str(value)
        if option not in {"off", "dim", "on"} or not entities.get("night_light"):
            raise ValueError("Недоступный режим ночного света")
        ha_api_request(
            "services/select/select_option",
            {"entity_id": entities["night_light"], "option": option},
        )
    elif setting in {"display", "child_lock"}:
        entity_id = entities.get(setting)
        if not entity_id:
            raise ValueError("Настройка недоступна")
        desired = value is True or str(value).lower() in {"on", "1", "true"}
        ha_api_request(
            f"services/switch/{'turn_on' if desired else 'turn_off'}",
            {"entity_id": entity_id},
        )
    else:
        raise ValueError("Неизвестная настройка очистителя")
    time.sleep(0.8)
    return {"ok": True, "device": purifier_status()}


def smart_home_status(device_ids: set[str] | None = None) -> dict:
    selected = [
        device for device in SMART_PLUGS
        if device_ids is None or device[0] in device_ids
    ]
    with ThreadPoolExecutor(max_workers=max(1, len(selected))) as executor:
        plugs = list(executor.map(smart_plug_status, selected))
    include_all = device_ids is None
    extra_devices = []
    if include_all or SMART_STRIP[0] in device_ids:
        extra_devices.append(smart_strip_status())
    if include_all or PURIFIER[0] in device_ids:
        extra_devices.append(purifier_status())
    pending = [] if device_ids is not None else [
        {
            **device,
            "controllable": False,
            "online": False,
            "power": False,
        }
        for device in PENDING_DEVICES
    ]
    devices = plugs + extra_devices + pending
    online = sum(1 for device in devices if device["online"])
    powered = sum(1 for device in devices if device["online"] and device["power"])
    return {
        "ok": True,
        "online": online,
        "powered": powered,
        "controllable": sum(1 for device in devices if device["controllable"]),
        "devices": devices,
    }


async def async_control_smart_strip(device_id: str, desired: bool, username: str, password: str) -> None:
    if KasaCredentials is None or KasaDiscover is None:
        raise RuntimeError("Локальный модуль TP-Link не установлен")
    device = await KasaDiscover.discover_single(
        SMART_STRIP[2],
        credentials=KasaCredentials(username, password),
        discovery_timeout=3,
        timeout=4,
    )
    try:
        await device.update()
        child_id = device_id.split(":", 1)[1] if ":" in device_id else None
        children = [
            child for child in device.children if child_id is None or child.device_id == child_id
        ]
        if not children:
            raise ValueError("Розетка удлинителя не найдена")
        for child in children:
            if desired:
                await child.turn_on()
            else:
                await child.turn_off()
    finally:
        await device.protocol.close()


def control_smart_plug(device_id: str, power: object) -> dict:
    device = next((item for item in SMART_PLUGS if item[0] == device_id), None)
    desired = power is True or str(power).lower() in {"on", "1", "true"}
    if device_id == SMART_STRIP[0] or device_id.startswith(f"{SMART_STRIP[0]}:"):
        credentials = tplink_credentials() or ("", "")
        asyncio.run(async_control_smart_strip(device_id, desired, *credentials))
        return {"ok": True, "device": smart_strip_status()}
    if not device:
        raise ValueError("Устройство недоступно для локального управления")
    response = kasa_request_with_retry(
        device[2],
        {"system": {"set_relay_state": {"state": int(desired)}}},
    )
    result = response.get("system", {}).get("set_relay_state", {})
    if int(result.get("err_code", 0)) != 0:
        raise RuntimeError(result.get("err_msg") or "Не удалось переключить розетку")
    return {"ok": True, "device": smart_plug_status(device)}


def status() -> dict:
    devices = []
    errors = []
    for name, hostname in DEVICES:
        try:
            light = first_light(request_device_with_retry(hostname))
            devices.append(
                {
                    "name": name,
                    "hostname": hostname,
                    "on": bool(light.get("on")),
                    "hue": float(light.get("hue", 0)),
                    "saturation": float(light.get("saturation", 0)),
                    "brightness": int(light.get("brightness", 100)),
                }
            )
        except (OSError, URLError, ValueError, json.JSONDecodeError) as error:
            errors.append({"name": name, "error": str(error)})
    sample = devices[0] if devices else None
    return {
        "ok": bool(devices),
        "count": len(devices),
        "devices": devices,
        "errors": errors,
        "power": any(device["on"] for device in devices),
        "colorHex": rgb_hex(sample["hue"], sample["saturation"]) if sample else None,
        "brightness": sample["brightness"] if sample else None,
    }


def control(command: str, value: object) -> dict:
    if command not in {"power", "color", "brightness"}:
        raise ValueError("Unsupported command")
    hue = saturation = None
    if command == "color":
        hue, saturation = hex_hs(str(value))
    updated = []
    errors = []
    for name, hostname in DEVICES:
        try:
            current = first_light(request_device_with_retry(hostname))
            light = {
                "on": int(bool(current.get("on"))),
                "hue": float(current.get("hue", 0)),
                "saturation": float(current.get("saturation", 0)),
                "brightness": int(current.get("brightness", 100)),
            }
            if command == "power":
                light["on"] = 1 if str(value).lower() in {"on", "1", "true"} else 0
            elif command == "color":
                light.update({"on": 1, "hue": hue, "saturation": saturation})
            else:
                light.update({"on": 1, "brightness": max(1, min(100, int(value)))})
            request_device_with_retry(hostname, {"numberOfLights": 1, "lights": [light]})
            updated.append(name)
        except (OSError, URLError, ValueError, json.JSONDecodeError) as error:
            errors.append({"name": name, "error": str(error)})
    if not updated:
        raise RuntimeError("Elgato lights are unavailable")
    return {"ok": True, "updated": updated, "errors": errors, "command": command, "value": value}


class Handler(BaseHTTPRequestHandler):
    server_version = "PiuraSpaceBridge/2.0"

    def cors(self) -> None:
        origin = self.headers.get("Origin", "null")
        if origin in ALLOWED_ORIGINS or origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:"):
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")

    def json_response(self, payload: dict, code: int = 200) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        request = urlsplit(self.path)
        path = request.path.rstrip("/")
        if path == "/smart-home/status":
            raw_devices = parse_qs(request.query).get("devices", [])
            device_ids = {
                device_id
                for value in raw_devices
                for device_id in value.split(",")
                if device_id
            }
            self.json_response(smart_home_status(device_ids or None))
            return
        if path not in {"", "/health", "/status"}:
            self.json_response({"ok": False, "error": "Not found"}, 404)
            return
        self.json_response(status())

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.rstrip("/")
        if path not in {
            "/lights",
            "/smart-home",
            "/smart-home/credentials",
            "/smart-home/vesync",
            "/smart-home/purifier",
        }:
            self.json_response({"ok": False, "error": "Not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            if path == "/smart-home/credentials":
                result = configure_smart_strip(payload.get("username"), payload.get("password"))
            elif path == "/smart-home/vesync":
                result = configure_vesync(payload.get("username"), payload.get("password"))
            elif path == "/smart-home/purifier":
                result = control_purifier_setting(payload.get("setting"), payload.get("value"))
            elif path == "/smart-home":
                device_id = str(payload.get("device", ""))
                result = (
                    control_purifier(payload.get("power"))
                    if device_id == PURIFIER[0]
                    else control_smart_plug(device_id, payload.get("power"))
                )
            else:
                result = control(str(payload.get("command", "")), payload.get("value"))
            self.json_response(result)
        except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
            self.json_response({"ok": False, "error": str(error)}, 400)

    def log_message(self, format: str, *args: object) -> None:
        return


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
