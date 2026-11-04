#!/usr/bin/env bash
# Starts a local web server and opens the game in the browser.
cd "$(dirname "$0")"
PORT=${1:-8000}
URL="http://localhost:$PORT"
echo "משמר הפירמידה השחורה  →  $URL   (Ctrl+C לעצירה)"
( sleep 1; (xdg-open "$URL" || open "$URL") >/dev/null 2>&1 ) &
python3 -m http.server "$PORT"
