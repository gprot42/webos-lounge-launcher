#!/bin/sh
# Enable Lounge Home-button watcher (run as root via hbchannel exec).
# Packaged next to home-watcher.sh in the app directory.

WATCH="/media/developer/apps/usr/palm/applications/org.webosbrew.lounge.launcher/home-watcher.sh"
PIDF="/tmp/lounge-home-watcher.pid"
LOG="/tmp/lounge-home-watcher.log"
INITD="/var/lib/webosbrew/init.d/40-lounge-home"

if [ ! -f "$WATCH" ]; then
  echo missing_watcher
  exit 1
fi

chmod 755 "$WATCH"
mkdir -p /var/lib/webosbrew/init.d

# Boot hook — always detach (never "&;" which busybox rejects).
printf '%s\n' \
  '#!/bin/sh' \
  "setsid nohup \"$WATCH\" >>\"$LOG\" 2>&1 </dev/null &" \
  'exit 0' >"$INITD"
chmod 755 "$INITD"

# Stop prior instances (pidfile + process name). Use killall by short name so
# we never match this enable script or the shell that invoked us.
if [ -f "$PIDF" ]; then
  old=$(cat "$PIDF" 2>/dev/null)
  if [ -n "$old" ]; then
    kill "$old" 2>/dev/null || true
  fi
fi
killall home-watcher.sh 2>/dev/null || true
rm -f "$PIDF"
sleep 1

# Detach watcher. Newline after & is required for busybox ash.
setsid nohup "$WATCH" >>"$LOG" 2>&1 </dev/null &
sleep 1

i=0
while [ "$i" -lt 6 ]; do
  if [ -f "$PIDF" ]; then
    pid=$(cat "$PIDF" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      echo enabled pid=$pid
      exit 0
    fi
  fi
  i=$((i + 1))
  sleep 1
done

echo start_failed
echo ---log---
tail -20 "$LOG" 2>/dev/null || true
exit 1
