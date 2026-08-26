#!/usr/bin/env bash
# ClipForge Bridge launcher (macOS / Linux)
set -u
cd "$(dirname "$0")"

echo "=============================================================="
echo "  ClipForge Bridge - starting"
echo "=============================================================="
echo

PY=""
command -v python3 >/dev/null 2>&1 && PY=python3
[ -z "$PY" ] && command -v python >/dev/null 2>&1 && PY=python
if [ -z "$PY" ]; then
    echo "[ERROR] Python 3 not found. Install it and try again."
    exit 1
fi

if ! command -v yt-dlp >/dev/null 2>&1 && ! $PY -m yt_dlp --version >/dev/null 2>&1; then
    echo "[SETUP] yt-dlp not found - installing it now..."
    $PY -m pip install -U yt-dlp || \
        echo "[WARN] pip install failed - install yt-dlp manually."
    echo
fi

echo "[OK] Starting bridge on http://127.0.0.1:8765"
echo "     Leave this terminal OPEN while you use ClipForge Pro."
echo
exec $PY ./clipforge_bridge.py --port 8765 --out "../ClipForge_Output"
