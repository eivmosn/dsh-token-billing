#!/usr/bin/env bash
# Render the component preview and screenshot it, in both themes.
#
#   preview/shot.sh [out.png] [width] [height]
#
# Override the browser with CHROME=/path/to/browser.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="${1:-preview/panel.png}"
W="${2:-1500}"
H="${3:-2300}"

CHROME="${CHROME:-}"
if [ -z "$CHROME" ]; then
  for candidate in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  do
    [ -x "$candidate" ] && CHROME="$candidate" && break
  done
fi
if [ -z "$CHROME" ]; then
  echo "no Chromium-family browser found; set CHROME=/path/to/browser" >&2
  exit 1
fi

npx vitest run --config vitest.preview.config.ts >/dev/null 2>&1

rm -f "$OUT"
"$CHROME" --headless=new --disable-gpu --no-sandbox --disable-crash-reporter \
  --crash-dumps-dir=/tmp/chrome-crash --user-data-dir=/tmp/chrome-headless-preview \
  --hide-scrollbars --force-device-scale-factor=2 \
  --window-size="$W,$H" --screenshot="$ROOT/$OUT" \
  "file://$ROOT/preview/out.html" >/dev/null 2>&1 &
PID=$!
for _ in $(seq 1 60); do [ -s "$ROOT/$OUT" ] && break; sleep 0.5; done
sleep 1.5
kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
