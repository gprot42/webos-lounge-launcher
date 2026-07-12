#!/bin/sh
# Lounge Launcher — intercept stock Home and open Lounge instead.
#
# webOS always opens stock Home on the Home button first. We react when Home
# is foreground, bring Lounge forward, close Home, then launch Lounge AGAIN so
# webOS routes remote INPUT to our surface (launch alone often leaves input on
# Home even though Lounge is painted on top — dock appears dead).
#
# Start detached only:
#   setsid nohup home-watcher.sh >/tmp/lounge-home-watcher.log 2>&1 </dev/null &

APP_ID="org.webosbrew.lounge.launcher"
PIDFILE="/tmp/lounge-home-watcher.pid"
LOG="/tmp/lounge-home-watcher.log"
COOLDOWN_SEC=1

log() {
  echo "$(date '+%H:%M:%S' 2>/dev/null) $*" >>"$LOG" 2>/dev/null || true
}

if [ -f "$PIDFILE" ]; then
  oldpid=$(cat "$PIDFILE" 2>/dev/null)
  if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null; then
    if [ "$oldpid" != "$$" ]; then
      log "already running pid=$oldpid, exiting"
      exit 0
    fi
  fi
fi
echo $$ >"$PIDFILE"
log "start pid=$$"

trap 'rm -f "$PIDFILE"; log "exit"; exit 0' INT TERM HUP

is_home() {
  case "$1" in
    com.webos.app.home|com.webos.app.launcher|com.webos.app.homelauncher|\
    com.webos.app.homeupdater|com.webos.app.dashboard|com.palm.app.home|\
    com.webos.app.gamehome|com.webos.app.seniorhome)
      return 0
      ;;
  esac
  return 1
}

extract_app_id() {
  printf '%s' "$1" | tr '\n' ' ' | sed -n 's/.*"appId"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
}

subscribe_fg() {
  luna-send -i \
    'luna://com.webos.applicationManager/getForegroundAppInfo' \
    '{"subscribe":true}' 2>/dev/null
}

launch_lounge() {
  log "launch $APP_ID"
  luna-send -i -n 1 -w 3000 -f \
    'luna://com.webos.applicationManager/launch' \
    "{\"id\":\"${APP_ID}\"}" >>"$LOG" 2>&1
}

close_home() {
  for id in com.webos.app.home com.webos.app.launcher com.webos.app.homelauncher \
            com.webos.app.dashboard com.palm.app.home; do
    luna-send -i -n 1 -w 1500 -f \
      'luna://com.webos.applicationManager/closeByAppId' \
      "{\"id\":\"${id}\"}" >/dev/null 2>&1
  done
}

# Bring Lounge to front AND own input. Order matters on webOS 25:
#   1) launch Lounge (graphics)
#   2) close stock Home (drop its input surface)
#   3) launch Lounge again (reclaim input after Home is gone)
activate_lounge() {
  log "activate lounge"
  launch_lounge
  sleep 0.25
  close_home
  sleep 0.15
  launch_lounge
}

now_sec() {
  date +%s 2>/dev/null || echo 0
}

last_app=""
last_action=0
primed=0

handle_fg() {
  appId=$1
  [ -n "$appId" ] || return 0

  if [ "$primed" -eq 0 ]; then
    primed=1
    last_app="$appId"
    log "primed fg=$appId"
    return 0
  fi

  if [ "$appId" = "$APP_ID" ]; then
    last_app="$appId"
    return 0
  fi

  if is_home "$appId"; then
    now=$(now_sec)
    elapsed=$((now - last_action))
    if [ "$last_action" -ne 0 ] && [ "$elapsed" -lt "$COOLDOWN_SEC" ]; then
      return 0
    fi
    last_action=$now
    prev="$last_app"
    last_app="$appId"
    log "home after $prev -> activate lounge"
    activate_lounge
    return 0
  fi

  last_app="$appId"
}

run_subscribe() {
  log "subscribe start"
  buf=""
  subscribe_fg | while IFS= read -r line || [ -n "$line" ]; do
    buf="$buf $line"
    case "$buf" in
      *returnValue*)
        appId=$(extract_app_id "$buf")
        buf=""
        if [ -n "$appId" ]; then
          handle_fg "$appId"
        fi
        ;;
    esac
  done
  log "subscribe ended"
  return 0
}

while true; do
  run_subscribe
  sleep 0.5
  i=0
  while [ "$i" -lt 15 ]; do
    raw=$(luna-send -i -n 1 -w 2000 \
      'luna://com.webos.applicationManager/getForegroundAppInfo' \
      '{"subscribe":true}' 2>/dev/null)
    handle_fg "$(extract_app_id "$raw")"
    i=$((i + 1))
    sleep 0.4
  done
done
