#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
user_home="$HOME"
uid="$(/usr/bin/id -u)"
state_dir="$user_home/Library/Application Support/PIURA Modes"
agent_file="$user_home/Library/LaunchAgents/com.piura.modes.morning.plist"
stamp_file="$state_dir/last-auto-morning-date"

/bin/mkdir -p "$state_dir" "$user_home/Library/LaunchAgents" "$user_home/Library/Logs"
/bin/cp "$script_dir/auto-morning.sh" "$state_dir/auto-morning.sh"
/bin/chmod 755 "$state_dir/auto-morning.sh"
/bin/cp "$script_dir/com.piura.modes.morning.plist" "$agent_file"

# Installing during the day must not unexpectedly rearrange the current
# workspace. The first automatic run begins tomorrow; calendar runs remain on.
hour="$(/bin/date +%H)"
if ((10#$hour >= 7)); then
  /usr/bin/printf '%s' "$(/bin/date +%F)" > "$stamp_file"
fi

/bin/launchctl bootout "gui/$uid/com.piura.modes.morning" 2>/dev/null || true
/bin/launchctl bootstrap "gui/$uid" "$agent_file"
/bin/launchctl enable "gui/$uid/com.piura.modes.morning"
/bin/launchctl print "gui/$uid/com.piura.modes.morning" >/dev/null

# launchd's calendar trigger does not wake a sleeping Mac. Schedule a real
# hardware wake one minute earlier so the 07:00 user agent can run on time.
if [[ "$(/usr/bin/id -u)" == "0" ]]; then
  /usr/bin/pmset repeat wakeorpoweron MTWRFSU 06:59:00
elif /usr/bin/sudo -n /usr/bin/pmset repeat wakeorpoweron MTWRFSU 06:59:00 2>/dev/null; then
  :
else
  /usr/bin/printf '%s\n' 'Нужно один раз выполнить: sudo pmset repeat wakeorpoweron MTWRFSU 06:59:00' >&2
fi
