#!/bin/bash
set -euo pipefail

user_home="$HOME"
state_dir="$user_home/Library/Application Support/PIURA Modes"
stamp_file="$state_dir/last-noon-lights-off-date"
today="$(/bin/date +%F)"

/bin/mkdir -p "$state_dir"
if [[ -f "$stamp_file" ]] && [[ "$(/bin/cat "$stamp_file")" == "$today" ]]; then
  exit 0
fi

# PIURA Modes reuses the already-open ERP tab. It never opens a second browser
# just to switch the office lights off.
/usr/bin/open -g "piura-modes://lights?action=off&request=noon-$today"
/usr/bin/printf '%s' "$today" > "$stamp_file"
