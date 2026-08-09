#!/usr/bin/env python3
"""Local PIURA ERP bridge for Elgato Light Strip Pro devices."""

from __future__ import annotations

import colorsys
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import URLError
from urllib.request import Request, urlopen


HOST = "127.0.0.1"
PORT = 45831
DEVICES = (
    ("Elgato Light Strip Pro D026", "elgato-light-strip-pro-d026.local"),
    ("Elgato Light Strip Pro 8C54", "elgato-light-strip-pro-8c54.local"),
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
    }


def control(command: str, value: object) -> dict:
    if command not in {"power", "color"}:
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
            else:
                light.update({"on": 1, "hue": hue, "saturation": saturation})
            request_device(hostname, {"numberOfLights": 1, "lights": [light]})
            updated.append(name)
        except (OSError, URLError, ValueError, json.JSONDecodeError) as error:
            errors.append({"name": name, "error": str(error)})
    if not updated:
        raise RuntimeError("Elgato lights are unavailable")
    return {"ok": True, "updated": updated, "errors": errors, "command": command, "value": value}


class Handler(BaseHTTPRequestHandler):
    server_version = "PiuraElgatoBridge/1.0"

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
        if self.path.rstrip("/") not in {"", "/health", "/status"}:
            self.json_response({"ok": False, "error": "Not found"}, 404)
            return
        self.json_response(status())

    def do_POST(self) -> None:  # noqa: N802
        if self.path.rstrip("/") != "/lights":
            self.json_response({"ok": False, "error": "Not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            self.json_response(control(str(payload.get("command", "")), payload.get("value")))
        except (ValueError, RuntimeError, json.JSONDecodeError) as error:
            self.json_response({"ok": False, "error": str(error)}, 400)

    def log_message(self, format: str, *args: object) -> None:
        return


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
