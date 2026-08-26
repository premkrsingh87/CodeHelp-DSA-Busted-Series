# ClipForge Pro

**Paste a YouTube link → scrub it like a local file → export only the clips you want, at full quality.**

ClipForge Pro merges two tools into one workflow:

* a **scene splitter** — timeline, filmstrip, frame-accurate marking, automatic scene detection;
* a **clip extractor** — a `yt-dlp` script that downloads *only the marked seconds*, never the whole video.

The problem it solves: a browser can't scrub a YouTube video frame by frame, so picking exact
timestamps normally means downloading the whole file first. ClipForge instead pulls a **throwaway
240p proxy copy** (a few MB), lets you cut against that, and then fetches the real clips from
YouTube at full quality using the timestamps you picked.

```
YouTube URL ──► 240p proxy (few MB) ──► scrub / split / pick ──► yt-dlp --download-sections ──► full-quality clips
                    ~5 seconds                   the fun part              only the marked seconds
```

---

## Quick start

**You only need `index.html`.** Everything else it builds for you.

1. Open `index.html` (double-click it).
2. Click **❔ Setup** in the header → **⬇ Windows — ClipForge_Bridge.bat**
   (or **⬇ Mac / Linux — .command**).
3. Double-click that launcher and leave its window open.
4. Back in the page, the header chip turns **green**. Paste a YouTube URL, press
   **⚡ Get Proxy Copy**, and start cutting.

The launcher is a single self-extracting file: it carries the bridge inside it, finds Python,
downloads `yt-dlp.exe` on first run, and starts serving. Nothing to unzip, no folder structure to
get right.

> **Why is a launcher needed at all?** A web page is not permitted to download from YouTube —
> that's a browser security rule, not a missing feature. One small local process has to do it.
> The page generates that process on demand so you never manage more than one file.

If yt-dlp ever goes missing, the app shows a **🔧 Install yt-dlp (one click)** button that installs
it through the running bridge — no terminal.

Prefer to drive it yourself?

```bash
pip install -U yt-dlp
python clipforge_bridge.py        # Setup → "Plain clipforge_bridge.py"
```

## Three ways to get a preview

| Mode | Setup | Scrub | Filmstrip · thumbnails · auto-detect · waveform |
|---|---|---|---|
| **Proxy** (recommended) | bridge running | ✅ frame-accurate | ✅ all of it |
| **Local file** | drag any video in | ✅ frame-accurate | ✅ all of it |
| **YouTube embed** | nothing | ✅ (player seek) | ❌ — YouTube blocks canvas access |

No bridge and don't want one? **Get proxy download script** hands you a `.bat` that fetches the
240p copies for the whole queue; drop the files back on the page and they auto-match to the queued
videos by ID. Everything else works identically.

---

## Picking clips fast

That's the whole point, so there are a lot of ways in:

* **`M`** splits the clip under the playhead — mark while you watch.
* **`I` / `O` / `Enter`** set in-point, out-point, and commit them as a clip.
* **Auto Scene Detect** — two-pass frame analysis (coarse scan, then frame-precise refinement).
  Runs on the 240p proxy, so it's fast.
* **YouTube Chapters** — one click turns every chapter into a named clip.
* **Audio / Silence** — decodes the audio and cuts on speech pauses.
* **Fixed interval**, **equal parts**, **pasted timestamps** (`00:00-00:41` per line).

Then refine: drag clips, drag their edges, nudge by ±1 frame, click a red ✂ diamond to merge two
clips, or untick the ones you don't want. **Ripple edges** (on by default) keeps neighbouring clips
joined when you drag a shared boundary — turn it off to move clips freely.

Hovering anywhere on the timeline scrub-previews that frame below it without moving the playhead.

### Keyboard

| | | | |
|---|---|---|---|
| `M` split | `I`/`O` in / out | `Enter` add clip | `Space` play |
| `←` `→` ±1s | `⇧←` `⇧→` ±1 frame | `Ctrl←` `Ctrl→` ±5s | `↑` `↓` next / prev clip |
| `S`/`D` keep / skip clip | `Ctrl+Z` / `Ctrl+Y` undo / redo | `+` `-` `0` zoom | `1`–`9` switch video |

---

## Export

The default engine is **yt-dlp**, which downloads each clip straight from YouTube with
`--download-sections` — only the seconds you marked are transferred:

```bat
%YTDLP% -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" ^
  --download-sections "*00:00:12.500-00:00:41.250" --force-keyframes-at-cuts ^
  --merge-output-format mp4 --no-playlist --no-part --force-overwrites ^
  -o "!CLIPDIR!\V1_Clip_01.mp4" "https://www.youtube.com/watch?v=..."
```

Scripts come in `.bat`, `.sh`, `.ps1`, `.py`, raw commands and a timestamp `.csv`, or all of them
as a ZIP. Every script creates a fresh `Clips`, `Clips_1`, `Clips_2`… folder so nothing is ever
overwritten, and the Windows `.bat` downloads `yt-dlp.exe` itself if it isn't on `PATH`.

With the bridge running, **⚡ Extract now** skips the script entirely and does it in place.

Switch the engine to **FFmpeg** to cut from a video file you already have on disk instead.

Multiple videos in the queue are handled in one script; clips are named `V1_Clip_01`,
`V2_Clip_01`, … and any clip can be renamed inline.

---

## Layout

```
clipforge-pro/
├── index.html                    ← the whole app AND the bridge installer
├── bridge/                       (reference copy of what index.html embeds)
│   ├── clipforge_bridge.py
│   ├── start_bridge.bat
│   └── start_bridge.sh
└── README.md
```

`index.html` is fully standalone — it embeds the bridge source, has no CDN dependencies, its own
ZIP writer, and self-contained CSS. Copy that one file anywhere and it still works. The `bridge/`
folder is the same code kept unpacked for reading and editing; you do not need it to use the app.

Your queue and clips autosave to `localStorage`, and **Save** / **Load** write a `.json` project
file you can keep or move between machines.

## Bridge API

Handy if you want to script against it. Everything is `127.0.0.1`-only, CORS-enabled, and serves
media with HTTP Range so the browser can seek.

| Endpoint | Purpose |
|---|---|
| `GET /health` | version, yt-dlp / ffmpeg availability, cache and output paths |
| `POST /info` | title, duration, thumbnail, chapters |
| `POST /proxy` | download (or reuse) the low-res proxy — `{url, id, height}` |
| `GET /progress/<job>` | percent, speed, ETA, log tail |
| `GET /file/<job>` | the proxy, with Range support |
| `POST /extract` | download the final clips — `{clips[], quality, format}` |
| `GET /cancel/<job>` | stop a running job |

```bash
python clipforge_bridge.py --port 8765 --out "D:/Clips" --cache "D:/proxies"
```

Proxies are cached under `~/.clipforge/cache`, so re-opening a video you've already worked on is
instant. Delete that folder any time to reclaim the space.

Extracted clips go to `~/Videos/ClipForge_Output` (or `~/ClipForge_Output`), never the folder the
launcher happened to start in — override with `--out`.

## Notes

* **ffmpeg is optional but worth having.** Without it yt-dlp can't merge separate video/audio
  streams or land cuts exactly on your marks.
* Clip boundaries are millisecond-precise; `--force-keyframes-at-cuts` re-encodes around each cut
  so the output starts on the frame you chose rather than the nearest keyframe.
* Only download content you have the right to use.
