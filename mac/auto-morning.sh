#!/bin/bash
set -euo pipefail

user_home="$HOME"
state_dir="$user_home/Library/Application Support/PIURA Modes"
stamp_file="$state_dir/last-auto-morning-date"
today="$(/bin/date +%F)"
hour="$(/bin/date +%H)"

# At login before 07:00, wait for launchd's calendar event. At login after
# 07:00, catch up immediately. A daily stamp prevents duplicate wake events.
if ((10#$hour < 7)); then
  exit 0
fi
if [[ -f "$stamp_file" ]] && [[ "$(/bin/cat "$stamp_file")" == "$today" ]]; then
  exit 0
fi

/bin/mkdir -p "$state_dir"
/usr/bin/open -g "piura-modes://morning?request=auto-$today"
/usr/bin/printf '%s' "$today" > "$stamp_file"
