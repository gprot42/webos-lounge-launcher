#!/bin/sh
# Disable Lounge Home-button watcher (run as root via hbchannel exec).

PIDF="/tmp/lounge-home-watcher.pid"
INITD="/var/lib/webosbrew/init.d/40-lounge-home"

if [ -f "$PIDF" ]; then
  old=$(cat "$PIDF" 2>/dev/null)
  if [ -n "$old" ]; then
    kill "$old" 2>/dev/null || true
  fi
fi
killall home-watcher.sh 2>/dev/null || true
rm -f "$PIDF"
rm -f "$INITD"
echo disabled
