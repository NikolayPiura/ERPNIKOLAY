#!/usr/bin/env python3
"""Local PIURA ERP bridge for lights and smart-home devices."""

from __future__ import annotations

import colorsys
from concurrent.futures import ThreadPoolExecutor
import json
import socket
import struct
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = 45831
DEVICES = (
    ("Elgato Light Strip Pro D026", "elgato-light-strip-pro-d026.local"),
    ("341", "elgato-light-strip-pro-8c54.local"),
)
SMART_PLUGS = (
    ("1", "192.168.4.36", "HS103"),
    ("2", "192.168.4.33", "HS103"),
    ("3", "192.168.4.34", "HS103"),
    ("5", "192.168.4.35", "HS103"),
)
PENDING_DEVICES = (
    {
        "id": "4",
        "name": "4",
        "ip": "192.168.4.59",
        "model": "HS300",
        "kind": "strip",
        "status": "Нужен вход TP-Link",
    },
    {
        "id": "purifier",
        "name": "Очиститель",
        "ip": "192.168.4.39",
        "model": "Levoit",
        "kind": "purifier",
        "status": "Нужен вход VeSync",
    },
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


def smart_plug_status(device: tuple[str, str, str]) -> dict:
    device_id, ip, model = device
    result = {
        "id": device_id,
        "name": device_id,
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


def smart_home_status() -> dict:
    with ThreadPoolExecutor(max_workers=len(SMART_PLUGS)) as executor:
        plugs = list(executor.map(smart_plug_status, SMART_PLUGS))
    pending = [
        {
            **device,
            "controllable": False,
            "online": False,
            "power": False,
        }
        for device in PENDING_DEVICES
    ]
    online = sum(1 for device in plugs if device["online"])
    powered = sum(1 for device in plugs if device["online"] and device["power"])
    return {
        "ok": True,
        "online": online,
        "powered": powered,
        "controllable": len(plugs),
        "devices": plugs + pending,
    }


def control_smart_plug(device_id: str, power: object) -> dict:
    device = next((item for item in SMART_PLUGS if item[0] == device_id), None)
    if not device:
        raise ValueError("Устройство пока недоступно для управления")
    desired = power is True or str(power).lower() in {"on", "1", "true"}
    response = kasa_request(
        device[1],
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
            light = first_light(request_device(hostname))
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
        "power": bool(sample and sample["on"]),
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
            current = first_light(request_device(hostname))
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
            request_device(hostname, {"numberOfLights": 1, "lights": [light]})
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
        if self.path.rstrip("/") == "/smart-home/status":
            self.json_response(smart_home_status())
            return
        if self.path.rstrip("/") not in {"", "/health", "/status"}:
            self.json_response({"ok": False, "error": "Not found"}, 404)
            return
        self.json_response(status())

    def do_POST(self) -> None:  # noqa: N802
        path = self.path.rstrip("/")
        if path not in {"/lights", "/smart-home"}:
            self.json_response({"ok": False, "error": "Not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            if path == "/smart-home":
                result = control_smart_plug(str(payload.get("device", "")), payload.get("power"))
            else:
                result = control(str(payload.get("command", "")), payload.get("value"))
            self.json_response(result)
        except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
            self.json_response({"ok": False, "error": str(error)}, 400)

    def log_message(self, format: str, *args: object) -> None:
        return


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
