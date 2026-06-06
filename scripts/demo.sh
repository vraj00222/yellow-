#!/usr/bin/env bash
# Capsule demo controller — one command to run the whole show.
#   ./scripts/demo.sh up      start store (:4100) + dashboard/API/Telegram (:4000)
#   ./scripts/demo.sh down    stop everything
#   ./scripts/demo.sh reset   clear the timeline / reseed the store (keeps Telegram link)
#   ./scripts/demo.sh status  show what's running + Telegram connection
cd "$(dirname "$0")/.." || exit 1

APP_LOG=/tmp/lumen-app.log
API_LOG=/tmp/capsule-api.log

bot_info() {
  curl -s http://localhost:4000/api/settings 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    s = 'connected as @' + str(d.get('chatName')) if d.get('connected') else 'NOT connected — /start the bot on the dev phone'
    print('  telegram: ' + ('enabled' if d.get('enabled') else 'no token') + ' · ' + s)
except Exception:
    print('  telegram: (API not up yet)')
" 2>/dev/null || echo "  telegram: (API not up yet)"
}

kill_all() {
  pkill -9 -f "src/api/index.ts" 2>/dev/null
  pkill -9 -f "demo/app/server.ts" 2>/dev/null
  for port in 4000 4100; do
    pids=$(lsof -ti:$port 2>/dev/null)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  done
  return 0
}

case "${1:-up}" in
  up)
    echo "▶ stopping any old servers…"; kill_all; sleep 3
    echo "▶ starting Lumen store on :4100…"; nohup npm run app > "$APP_LOG" 2>&1 & sleep 4
    echo "▶ starting Capsule dashboard + API + Telegram on :4000…"; nohup npm run api > "$API_LOG" 2>&1 & sleep 6
    echo ""
    echo "  ✅ Store (customers) → http://localhost:4100"
    echo "  ✅ Dashboard (you)   → http://localhost:4000"
    bot_info
    echo "  logs: tail -f $API_LOG   /   $APP_LOG"
    echo ""
    echo "  If telegram is NOT connected: open your bot on the dev phone and tap Start (/start)."
    ;;
  down)
    echo "▶ stopping all demo servers…"; kill_all; sleep 1; echo "  done."
    ;;
  reset)
    echo "▶ clearing the timeline + reseeding the store (keeps the Telegram link)…"
    pkill -9 -f "demo/app/server.ts" 2>/dev/null
    pids=$(lsof -ti:4100 2>/dev/null); [ -n "$pids" ] && kill -9 $pids 2>/dev/null
    sleep 2; nohup npm run app > "$APP_LOG" 2>&1 & sleep 3
    echo "  store reseeded; dashboard board cleared."
    ;;
  status)
    api_pid=$(pgrep -f "src/api/index.ts" | head -1)
    app_pid=$(pgrep -f "demo/app/server.ts" | head -1)
    echo "  api (:4000): ${api_pid:-not running}"
    echo "  app (:4100): ${app_pid:-not running}"
    bot_info
    echo "  conflicts in api log: $(grep -ci conflict "$API_LOG" 2>/dev/null || echo 0)  (should be 0)"
    ;;
  *)
    echo "usage: $0 {up|down|reset|status}"; exit 1 ;;
esac
