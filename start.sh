#!/bin/sh
# Starts Receipt Tracker on http://localhost:8770/ and opens it in your browser.
# Needs Python 3. Press Ctrl+C to stop.
cd "$(dirname "$0")" || exit 1
PORT="${PORT:-8770}"
URL="http://localhost:$PORT/"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 was not found. Install it from https://www.python.org/downloads/" >&2
  exit 1
fi

( sleep 1
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1
  fi ) &

echo "Receipt Tracker is running at $URL (Ctrl+C to stop)"
exec python3 -m http.server "$PORT" --bind 127.0.0.1
