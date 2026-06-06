#!/usr/bin/env bash
# One command for the whole local demo:
#   Capsule dashboard/API/Telegram (:4000)  +  Lumen store (:4100, auto-pulls fixes)
#   ./scripts/demo.sh up | down | reset | status
cd "$(dirname "$0")/.." || exit 1            # capsule repo root
LUMEN_DIR="${LUMEN_DIR:-$HOME/Developer/lumen-store}"
API_LOG=/tmp/capsule-api.log
LUMEN_LOG=/tmp/lumen.log

bot_info() {
  curl -s http://localhost:4000/api/settings 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    s = 'connected as @' + str(d.get('chatName')) if d.get('connected') else 'NOT connected — /start the bot'
    print('  telegram: ' + ('enabled' if d.get('enabled') else 'no token') + ' · ' + s)
except Exception:
    print('  telegram: (API not up yet)')
" 2>/dev/null || echo "  telegram: (API not up yet)"
}

kill_all() {
  pkill -9 -f "src/api/index.ts" 2>/dev/null
  pkill -9 -f "tsx watch src/server.ts" 2>/dev/null
  pkill -9 -f "tsx src/server.ts" 2>/dev/null
  pkill -9 -f "dev-auto.sh" 2>/dev/null
  pkill -9 -f "git pull --ff-only" 2>/dev/null
  pkill -9 -f "demo/app/server.ts" 2>/dev/null
  for port in 4000 4100; do
    pids=$(lsof -ti:$port 2>/dev/null)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  done
  return 0
}

case "${1:-up}" in
  up)
    [ -d "$LUMEN_DIR" ] || { echo "✗ store not found at $LUMEN_DIR (set LUMEN_DIR=…)"; exit 1; }
    echo "▶ stopping any old servers…"; kill_all; sleep 3
    echo "▶ Capsule dashboard + API + Telegram on :4000…"
    nohup npm run api > "$API_LOG" 2>&1 & sleep 5
    echo "▶ Lumen store on :4100 (auto-pull merged fixes + watch)…"
    ( cd "$LUMEN_DIR" && CAPSULE_API=http://localhost:4000 PORT=4100 nohup npm run dev:auto > "$LUMEN_LOG" 2>&1 & )
    sleep 5
    echo ""
    echo "  ✅ Store (customers) → http://localhost:4100"
    echo "  ✅ Dashboard (you)   → http://localhost:4000"
    bot_info
    echo "  logs: tail -f $API_LOG   /   $LUMEN_LOG"
    echo "  If Telegram is NOT connected: /start @yellowhelpingbot on the dev phone."
    ;;
  down)
    echo "▶ stopping store + dashboard…"; kill_all; sleep 1; echo "  done."
    ;;
  reset)
    echo "▶ restocking the store catalog…"
    curl -s -X POST http://localhost:4100/api/admin/restock >/dev/null && echo "  catalog restored." || echo "  (store not up)"
    ;;
  status)
    echo "  api (:4000):   $(pgrep -f 'src/api/index.ts' | head -1 || echo 'not running')"
    echo "  store (:4100): $(pgrep -f 'tsx watch src/server.ts' | head -1 || echo 'not running')"
    bot_info
    echo "  conflicts in api log: $(grep -ci conflict "$API_LOG" 2>/dev/null || echo 0)  (should be 0)"
    ;;
  *)
    echo "usage: $0 {up|down|reset|status}"; exit 1 ;;
esac
