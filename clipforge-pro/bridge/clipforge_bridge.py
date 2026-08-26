#!/usr/bin/env python3
"""
ClipForge Bridge
================
Tiny local helper that lets the ClipForge Pro web app work with YouTube links.

Why it exists
-------------
A browser cannot download or scrub a YouTube video directly (CORS + YouTube's
player restrictions).  This bridge runs on your own machine, uses yt-dlp to grab
a *tiny low-resolution proxy copy* of the video (240p is usually 5-20 MB for a
10 minute video), and serves it back to the page with CORS + HTTP Range enabled
so the <video> element can seek instantly and the page can read frames off a
canvas (needed for the filmstrip, thumbnails and auto scene detection).

When you are done picking your clips, the same bridge can run the *real*
extraction: yt-dlp --download-sections pulls only the exact seconds you asked
for, at full quality, straight from YouTube.  The big file is never downloaded.

Usage
-----
    python clipforge_bridge.py                 # http://127.0.0.1:8765
    python clipforge_bridge.py --port 9000
    python clipforge_bridge.py --out "D:/Clips"

Requirements
------------
    yt-dlp     (pip install -U yt-dlp     or the standalone binary on PATH)
    ffmpeg     (optional but strongly recommended - needed to merge audio and
                to cut precisely at the requested timestamps)

Everything else is Python standard library.
"""

import argparse
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote, parse_qs

VERSION = "1.1.0"

# --------------------------------------------------------------------------
#  Paths
# --------------------------------------------------------------------------
HOME = os.path.expanduser("~")
CACHE_DIR = os.path.join(HOME, ".clipforge", "cache")


def default_output_dir():
    """Somewhere sane and writable - never the launch directory, which can be
    System32 if the bridge was started from an elevated prompt."""
    for candidate in (os.path.join(HOME, "Videos"), os.path.join(HOME, "Movies")):
        if os.path.isdir(candidate):
            return os.path.join(candidate, "ClipForge_Output")
    return os.path.join(HOME, "ClipForge_Output")


OUTPUT_DIR = default_output_dir()

# --------------------------------------------------------------------------
#  Tool discovery
# --------------------------------------------------------------------------
_TOOLS = {"ytdlp": None, "ytdlp_kind": None, "ffmpeg": None}


def find_tools(force=False):
    """Locate yt-dlp and ffmpeg. Result is cached unless force=True."""
    if _TOOLS["ytdlp"] and not force:
        return _TOOLS

    ytdlp, kind = None, None
    exe = shutil.which("yt-dlp") or shutil.which("yt-dlp.exe")
    if exe:
        ytdlp, kind = [exe], "binary"
    else:
        name = "yt-dlp.exe" if os.name == "nt" else "yt-dlp"
        here = os.path.dirname(os.path.abspath(__file__))
        local = next((c for c in (os.path.join(here, name), os.path.join(os.getcwd(), name))
                      if os.path.isfile(c)), None)
        if local:
            ytdlp, kind = [local], "local"
        else:
            try:
                subprocess.run([sys.executable, "-m", "yt_dlp", "--version"],
                               capture_output=True, timeout=25, check=True)
                ytdlp, kind = [sys.executable, "-m", "yt_dlp"], "module"
            except Exception:
                ytdlp, kind = None, None

    _TOOLS["ytdlp"] = ytdlp
    _TOOLS["ytdlp_kind"] = kind
    _TOOLS["ffmpeg"] = shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")
    return _TOOLS


def ytdlp_version():
    t = find_tools()
    if not t["ytdlp"]:
        return None
    try:
        r = subprocess.run(t["ytdlp"] + ["--version"], capture_output=True,
                           text=True, timeout=25)
        return (r.stdout or "").strip() or None
    except Exception:
        return None


YTDLP_EXE_URL = ("https://github.com/yt-dlp/yt-dlp/releases/latest/download/"
                 "yt-dlp.exe")


def install_ytdlp():
    """Install yt-dlp without the user opening a terminal.

    Tries pip first; if that fails on Windows, falls back to dropping the
    standalone yt-dlp.exe next to this script (no Python packaging involved).
    """
    log = []
    try:
        r = subprocess.run([sys.executable, "-m", "pip", "install", "-U", "yt-dlp"],
                           capture_output=True, text=True, timeout=420)
        log.append((r.stdout or "") + (r.stderr or ""))
        find_tools(force=True)
        if _TOOLS["ytdlp"]:
            return True, "\n".join(log)
    except Exception as e:
        log.append("pip failed: %s" % e)

    if os.name == "nt":
        log.append("Falling back to the standalone yt-dlp.exe ...")
        try:
            import urllib.request
            target = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                  "yt-dlp.exe")
            urllib.request.urlretrieve(YTDLP_EXE_URL, target)
            log.append("Downloaded %s" % target)
            _TOOLS["ytdlp"] = [target]
            _TOOLS["ytdlp_kind"] = "local"
            return True, "\n".join(log)
        except Exception as e:
            log.append("download failed: %s" % e)

    return False, "\n".join(log)


# --------------------------------------------------------------------------
#  Job registry
# --------------------------------------------------------------------------
JOBS = {}
JOBS_LOCK = threading.Lock()


def new_job(kind, meta=None):
    jid = uuid.uuid4().hex[:12]
    with JOBS_LOCK:
        JOBS[jid] = {
            "id": jid, "kind": kind, "status": "queued", "pct": 0.0,
            "speed": "", "eta": "", "message": "Queued", "error": None,
            "file": None, "files": [], "log": [], "cancel": False,
            "created": time.time(), "meta": meta or {},
        }
    return jid


def job_set(jid, **kw):
    with JOBS_LOCK:
        j = JOBS.get(jid)
        if not j:
            return
        j.update(kw)


def job_log(jid, line):
    with JOBS_LOCK:
        j = JOBS.get(jid)
        if not j:
            return
        j["log"].append(line)
        if len(j["log"]) > 400:
            del j["log"][:-400]


def job_get(jid):
    with JOBS_LOCK:
        j = JOBS.get(jid)
        return dict(j) if j else None


# --------------------------------------------------------------------------
#  yt-dlp helpers
# --------------------------------------------------------------------------
PROGRESS_RE = re.compile(r"CFPROG\|([^|]*)\|([^|]*)\|([^|]*)")
PCT_RE = re.compile(r"([\d.]+)\s*%")

PROGRESS_TEMPLATE = "CFPROG|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s"


def run_ytdlp(jid, args, phase_label="Downloading", pct_from=0.0, pct_to=100.0):
    """Run yt-dlp streaming progress into the job. Returns the exit code."""
    tools = find_tools()
    if not tools["ytdlp"]:
        job_set(jid, status="error", error="yt-dlp not found")
        return 127

    cmd = tools["ytdlp"] + ["--newline", "--progress",
                            "--progress-template", PROGRESS_TEMPLATE] + args
    job_log(jid, "$ " + " ".join(cmd))

    creation = 0
    if os.name == "nt":
        creation = getattr(subprocess, "CREATE_NO_WINDOW", 0)

    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                            text=True, bufsize=1, encoding="utf-8",
                            errors="replace", creationflags=creation)

    with JOBS_LOCK:
        if jid in JOBS:
            JOBS[jid]["_proc"] = proc

    span = max(0.0, pct_to - pct_from)
    for line in proc.stdout:
        line = line.rstrip("\n")
        j = job_get(jid)
        if j and j.get("cancel"):
            try:
                proc.terminate()
            except Exception:
                pass
            job_set(jid, status="cancelled", message="Cancelled")
            return 130

        m = PROGRESS_RE.search(line)
        if m:
            raw_pct, speed, eta = m.group(1), m.group(2), m.group(3)
            pm = PCT_RE.search(raw_pct)
            local_pct = float(pm.group(1)) if pm else 0.0
            job_set(jid,
                    status="running",
                    pct=round(pct_from + span * local_pct / 100.0, 1),
                    speed=speed.strip(),
                    eta=eta.strip(),
                    message=phase_label)
            continue

        if line.strip():
            job_log(jid, line)
            low = line.lower()
            if "[merger]" in low or "merging" in low:
                job_set(jid, message="Merging audio + video...")
            elif "[extractaudio]" in low:
                job_set(jid, message="Extracting audio...")
            elif "[youtube]" in low and "downloading" in low:
                job_set(jid, message="Reading video info...")
            elif line.startswith("ERROR"):
                job_set(jid, error=line[:500])

    proc.wait()
    return proc.returncode


def proxy_format(height):
    """yt-dlp format selector for a small, seekable proxy copy."""
    h = int(height)
    return (
        "bv*[height<=%d][ext=mp4]+ba[ext=m4a]/"
        "b[height<=%d][ext=mp4]/"
        "bv*[height<=%d]+ba/"
        "b[height<=%d]/"
        "wv*+wa/w" % (h, h, h, h)
    )


def quality_format(quality, container):
    """yt-dlp format selector for the final, full quality clips."""
    if quality == "audio":
        return "bestaudio/best"
    if quality == "best":
        if container == "webm":
            return "bv*+ba/b"
        return "bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b[ext=mp4]/b"
    h = int(quality)
    return ("bv*[height<=%d][ext=mp4]+ba[ext=m4a]/"
            "bv*[height<=%d]+ba/"
            "b[height<=%d][ext=mp4]/b[height<=%d]" % (h, h, h, h))


def sanitize(name, fallback="clip"):
    name = re.sub(r"[^\w\-. ]+", "_", (name or "").strip())
    name = re.sub(r"\s+", "_", name).strip("._ ")
    return name[:80] or fallback


# --------------------------------------------------------------------------
#  Workers
# --------------------------------------------------------------------------
def worker_info(jid, url):
    tools = find_tools()
    if not tools["ytdlp"]:
        job_set(jid, status="error", error="yt-dlp not found. Run: pip install -U yt-dlp")
        return
    job_set(jid, status="running", message="Reading video info...", pct=10)
    try:
        cmd = tools["ytdlp"] + ["-J", "--no-playlist", "--skip-download",
                                "--no-warnings", url]
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=180,
                           encoding="utf-8", errors="replace")
        if r.returncode != 0:
            job_set(jid, status="error",
                    error=(r.stderr or "yt-dlp failed").strip()[:500])
            return
        data = json.loads(r.stdout)
        heights = sorted({f.get("height") for f in (data.get("formats") or [])
                          if f.get("height")})
        info = {
            "id": data.get("id"),
            "title": data.get("title"),
            "duration": data.get("duration"),
            "uploader": data.get("uploader") or data.get("channel"),
            "thumbnail": data.get("thumbnail"),
            "webpage_url": data.get("webpage_url") or url,
            "is_live": bool(data.get("is_live")),
            "heights": heights,
            "chapters": [
                {"title": c.get("title"),
                 "start": c.get("start_time"),
                 "end": c.get("end_time")}
                for c in (data.get("chapters") or [])
                if c.get("start_time") is not None
            ],
        }
        job_set(jid, status="done", pct=100, message="Info ready",
                meta={"info": info})
    except subprocess.TimeoutExpired:
        job_set(jid, status="error", error="Timed out reading video info")
    except Exception as e:
        job_set(jid, status="error", error=str(e)[:500])


def worker_proxy(jid, url, video_id, height):
    os.makedirs(CACHE_DIR, exist_ok=True)
    stem = os.path.join(CACHE_DIR, "%s_%dp" % (sanitize(video_id, "video"), height))

    # Already cached? Serve instantly.
    for ext in (".mp4", ".mkv", ".webm"):
        if os.path.isfile(stem + ext) and os.path.getsize(stem + ext) > 1024:
            job_set(jid, status="done", pct=100, message="Proxy ready (cached)",
                    file=stem + ext,
                    meta={"cached": True, "size": os.path.getsize(stem + ext)})
            return

    tools = find_tools()
    args = ["-f", proxy_format(height), "--no-playlist", "--no-part",
            "--force-overwrites", "--no-warnings", "-o", stem + ".%(ext)s"]
    if tools["ffmpeg"]:
        # faststart moves the moov atom to the front -> instant seeking
        args += ["--merge-output-format", "mp4",
                 "--postprocessor-args", "ffmpeg:-movflags +faststart"]
    args += [url]

    job_set(jid, status="running", message="Downloading %dp proxy..." % height)
    code = run_ytdlp(jid, args, phase_label="Downloading %dp proxy..." % height,
                     pct_from=0, pct_to=96)

    j = job_get(jid)
    if j and j.get("status") == "cancelled":
        return
    if code != 0:
        job_set(jid, status="error",
                error=(j or {}).get("error") or "yt-dlp exited with code %d" % code)
        return

    found = None
    for ext in (".mp4", ".mkv", ".webm", ".m4v"):
        if os.path.isfile(stem + ext):
            found = stem + ext
            break
    if not found:
        # yt-dlp may have chosen another extension
        base = os.path.basename(stem)
        for f in os.listdir(CACHE_DIR):
            if f.startswith(base):
                found = os.path.join(CACHE_DIR, f)
                break
    if not found:
        job_set(jid, status="error", error="Proxy file not found after download")
        return

    job_set(jid, status="done", pct=100, message="Proxy ready", file=found,
            meta={"cached": False, "size": os.path.getsize(found)})


def worker_extract(jid, payload):
    """Download the selected clips at full quality via --download-sections."""
    items = payload.get("clips") or []
    quality = str(payload.get("quality", "best"))
    container = str(payload.get("format", "mp4"))
    outdir = payload.get("outdir") or OUTPUT_DIR

    # Unique folder so nothing is ever overwritten - same behaviour as the
    # exported .bat script.
    base, n = os.path.join(outdir, "Clips"), 1
    target = base
    while os.path.exists(target):
        target = "%s_%d" % (base, n)
        n += 1
    os.makedirs(target, exist_ok=True)

    tools = find_tools()
    fmt = quality_format(quality, container)
    total = len(items)
    done_files = []

    job_set(jid, status="running", message="Extracting %d clip(s)..." % total,
            meta={"outdir": target, "total": total})

    for i, clip in enumerate(items):
        j = job_get(jid)
        if j and j.get("cancel"):
            job_set(jid, status="cancelled", message="Cancelled")
            return

        name = sanitize(clip.get("name") or "clip_%02d" % (i + 1))
        out = os.path.join(target, name + ".%(ext)s")
        section = "*%s-%s" % (clip.get("start"), clip.get("end"))

        args = ["-f", fmt, "--download-sections", section, "--no-playlist",
                "--no-part", "--force-overwrites", "--no-warnings",
                "-o", out]
        if quality == "audio":
            args += ["-x", "--audio-format", "mp3", "--audio-quality", "0"]
        else:
            if tools["ffmpeg"]:
                args += ["--force-keyframes-at-cuts"]
            args += ["--merge-output-format", container]
        args += [clip.get("url")]

        lo = 100.0 * i / max(1, total)
        hi = 100.0 * (i + 1) / max(1, total)
        job_set(jid, message="Clip %d/%d - %s" % (i + 1, total, name))
        code = run_ytdlp(jid, args,
                         phase_label="Clip %d/%d - %s" % (i + 1, total, name),
                         pct_from=lo, pct_to=hi)
        if code == 130:
            return
        if code == 0:
            for f in os.listdir(target):
                if f.startswith(name + "."):
                    p = os.path.join(target, f)
                    if p not in done_files:
                        done_files.append(p)
        else:
            job_log(jid, "[WARN] clip %s failed (exit %d)" % (name, code))

        job_set(jid, files=list(done_files))

    job_set(jid, status="done", pct=100,
            message="Saved %d/%d clip(s) to %s" % (len(done_files), total, target),
            files=done_files, meta={"outdir": target, "total": total})


# --------------------------------------------------------------------------
#  HTTP layer
# --------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "ClipForgeBridge/" + VERSION
    protocol_version = "HTTP/1.1"   # keep-alive: much smoother video seeking

    # ---- plumbing ----
    def log_message(self, fmt, *args):
        if QUIET:
            return
        sys.stderr.write("  %s - %s\n" % (self.address_string(), fmt % args))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Expose-Headers",
                         "Content-Length, Content-Range, Accept-Ranges")

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
            return json.loads(self.rfile.read(n) or b"{}")
        except Exception:
            return {}

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    # ---- routes ----
    def do_GET(self):
        path = urlparse(self.path).path

        if path in ("/", "/health"):
            t = find_tools()
            return self._json({
                "ok": True, "app": "clipforge-bridge", "version": VERSION,
                "ytdlp": bool(t["ytdlp"]), "ytdlp_kind": t["ytdlp_kind"],
                "ytdlp_version": ytdlp_version(),
                "ffmpeg": bool(t["ffmpeg"]),
                "cache": CACHE_DIR, "output": OUTPUT_DIR,
                "python": sys.version.split()[0],
            })

        if path.startswith("/progress/"):
            j = job_get(path.rsplit("/", 1)[-1])
            if not j:
                return self._json({"error": "no such job"}, 404)
            j.pop("_proc", None)
            j["log"] = j["log"][-25:]
            return self._json(j)

        if path.startswith("/cancel/"):
            jid = path.rsplit("/", 1)[-1]
            job_set(jid, cancel=True)
            with JOBS_LOCK:
                p = (JOBS.get(jid) or {}).get("_proc")
            if p:
                try:
                    p.terminate()
                except Exception:
                    pass
            return self._json({"ok": True})

        if path.startswith("/file/"):
            return self.serve_media(unquote(path[len("/file/"):]))

        if path == "/reveal":
            q = parse_qs(urlparse(self.path).query)
            folder = (q.get("path") or [""])[0]
            return self._json({"ok": reveal(folder)})

        return self._json({"error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        data = self._body()

        if path == "/info":
            url = (data.get("url") or "").strip()
            if not url:
                return self._json({"error": "url required"}, 400)
            jid = new_job("info", {"url": url})
            threading.Thread(target=worker_info, args=(jid, url), daemon=True).start()
            return self._json({"job": jid})

        if path == "/proxy":
            url = (data.get("url") or "").strip()
            if not url:
                return self._json({"error": "url required"}, 400)
            height = int(data.get("height") or 240)
            vid = data.get("id") or re.sub(r"\W+", "", url)[-11:]
            jid = new_job("proxy", {"url": url, "height": height, "id": vid})
            threading.Thread(target=worker_proxy, args=(jid, url, vid, height),
                             daemon=True).start()
            return self._json({"job": jid})

        if path == "/extract":
            if not data.get("clips"):
                return self._json({"error": "clips required"}, 400)
            jid = new_job("extract", {"count": len(data["clips"])})
            threading.Thread(target=worker_extract, args=(jid, data),
                             daemon=True).start()
            return self._json({"job": jid})

        if path == "/install-ytdlp":
            ok, out = install_ytdlp()
            return self._json({"ok": ok, "output": out[-2000:]})

        return self._json({"error": "not found"}, 404)

    # ---- media streaming with Range support (needed for <video> seeking) ----
    def serve_media(self, jid):
        j = job_get(jid)
        fpath = (j or {}).get("file")
        if not fpath or not os.path.isfile(fpath):
            return self._json({"error": "file not ready"}, 404)

        size = os.path.getsize(fpath)
        ctype = mimetypes.guess_type(fpath)[0] or "video/mp4"
        rng = self.headers.get("Range")

        start, end = 0, size - 1
        status = 200
        if rng:
            m = re.match(r"bytes=(\d*)-(\d*)", rng.strip())
            if m:
                g1, g2 = m.group(1), m.group(2)
                if g1:
                    start = int(g1)
                    end = int(g2) if g2 else size - 1
                elif g2:                      # suffix range: bytes=-500
                    start = max(0, size - int(g2))
                if start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", "bytes */%d" % size)
                    self._cors()
                    self.end_headers()
                    return
                end = min(end, size - 1)
                status = 206

        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
        self.send_header("Cache-Control", "public, max-age=3600")
        self._cors()
        self.end_headers()

        try:
            with open(fpath, "rb") as fh:
                fh.seek(start)
                left = length
                while left > 0:
                    chunk = fh.read(min(256 * 1024, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass          # the browser aborted the range - completely normal


def reveal(folder):
    try:
        if os.name == "nt":
            os.startfile(folder)                                  # noqa: S606
        elif sys.platform == "darwin":
            subprocess.Popen(["open", folder])
        else:
            subprocess.Popen(["xdg-open", folder])
        return True
    except Exception:
        return False


QUIET = False


def main():
    global OUTPUT_DIR, CACHE_DIR, QUIET
    ap = argparse.ArgumentParser(description="ClipForge Bridge")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--out", default=None, help="where extracted clips go")
    ap.add_argument("--cache", default=CACHE_DIR, help="where proxy copies live")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    OUTPUT_DIR = os.path.abspath(args.out) if args.out else default_output_dir()
    CACHE_DIR = os.path.abspath(args.cache)
    QUIET = args.quiet
    os.makedirs(CACHE_DIR, exist_ok=True)
    try:
        os.makedirs(OUTPUT_DIR, exist_ok=True)
    except OSError:
        OUTPUT_DIR = os.path.join(HOME, "ClipForge_Output")
        os.makedirs(OUTPUT_DIR, exist_ok=True)

    t = find_tools()
    print("=" * 62)
    print("  ClipForge Bridge v%s" % VERSION)
    print("=" * 62)
    print("  Listening : http://%s:%d" % (args.host, args.port))
    print("  Proxies   : %s" % CACHE_DIR)
    print("  Clips     : %s" % OUTPUT_DIR)
    print("  yt-dlp    : %s" % (ytdlp_version() or "NOT FOUND  ->  pip install -U yt-dlp"))
    print("  ffmpeg    : %s" % (t["ffmpeg"] or "NOT FOUND  (recommended)"))
    print("=" * 62)
    print("  Leave this window open, then use ClipForge Pro in your browser.")
    print("  Press Ctrl+C to stop.")
    print()

    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    srv.daemon_threads = True
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\n  Bridge stopped.")
        srv.shutdown()


if __name__ == "__main__":
    main()
