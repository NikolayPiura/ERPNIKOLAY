#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STAGE_DIR="$(mktemp -d /private/tmp/piura-modes.XXXXXX)"
APP_DIR="$STAGE_DIR/PIURA Modes.app"

mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
cp "$SCRIPT_DIR/Info.plist" "$APP_DIR/Contents/Info.plist"
cp "$REPO_DIR/modes.html" "$APP_DIR/Contents/Resources/modes.html"
cp "$SCRIPT_DIR/resources/Magic-Morning.png" "$APP_DIR/Contents/Resources/Magic-Morning.png"

/usr/bin/swiftc \
  "$SCRIPT_DIR/PIURAModes.swift" \
  -framework Cocoa \
  -framework WebKit \
  -o "$APP_DIR/Contents/MacOS/PIURA Modes"

/usr/bin/xattr -cr "$APP_DIR"
# Keep the same designated identity across local rebuilds. The default ad-hoc
# requirement contains a changing cdhash, invalidating remembered permissions.
/usr/bin/codesign --force --deep --sign - --identifier com.piura.modes \
  --requirements '=designated => identifier "com.piura.modes"' "$APP_DIR"
/usr/bin/codesign --verify --deep --strict "$APP_DIR"
echo "$APP_DIR"
