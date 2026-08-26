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

Then refine on the timeline, which behaves like the scene-splitter reference:

* **Drag anywhere to move the playhead.** That is the primary gesture — press and the head jumps
  there and follows your mouse.
* **Drag a red ● to move that cut**; both neighbouring clips follow. **Click it to merge** the two.
* **Drag a band** to move a clip, **its edges** to trim. Edges snap to the playhead and to
  neighbouring cuts.
* **Shift+drag** carves a brand-new clip out of an empty stretch.
* **Ctrl+wheel** zooms at the cursor, **Shift+wheel** scrolls.

Clips are drawn as translucent colour bands so the ruler and waveform stay readable and the cut
markers remain what your eye goes to.

The picture sits directly above the timeline and is capped to the viewport height, so the frame,
the cut you are making and the transport controls are all on screen at once. Hovering the timeline
pops a scrub preview above the cursor without moving the playhead.

### Keyboard

Press <kbd>?</kbd> in the app for the full sheet.

| | | | |
|---|---|---|---|
| `M` split | `I`/`O` in / out | `Enter` add clip | `Space` play |
| `[` `]` trim start / end to playhead | `L` loop this clip | `Z` zoom to clip | `Ctrl+D` duplicate |
| `←` `→` ±1s | `⇧←` `⇧→` ±1 frame | `Ctrl←` `Ctrl→` ±5s | `↑` `↓` next / prev clip |
| `S`/`D` keep / skip | `A` / `⇧A` all / none | `⇧I` invert | `Del` delete clip |
| `+` `−` `0` zoom | `Ctrl`+wheel zoom at cursor | `⇧`+wheel scroll | `Z` zoom to clip |
| `1`–`9` switch video | `Ctrl↑` `Ctrl↓` prev / next video | `P` proxy this video | `E` download script |
| `Ctrl+Z` / `Ctrl+Y` undo / redo | `Ctrl+S` save project | `?` shortcuts | `Esc` clear IN/OUT |

### Working on several videos at once

Downloads run in the background and in parallel — start a proxy on one video and
keep cutting another while it works. Every running task gets its own row in the dock
at the bottom right with its own progress and cancel button, and each queue card shows
its own download bar. Nothing a background job does can disturb the video you are
editing.

### Speed and memory

* **Proxies are re-encoded with a keyframe every second.** Seeking a video costs a
  decode from the previous keyframe; yt-dlp's source usually has them ~10s apart, which
  is why scrubbing a long video feels sluggish even at 240p. Measured on a 20:50 clip,
  this takes the median seek from **76 ms to 25 ms**. The extra pass takes ~15s, runs in
  the background, and is cached. Turn it off by sending `scrub: false` if you prefer.
* **The filmstrip is off by default.** Building one costs a seek per frame — the single
  most expensive thing the app can do. Switch it on per session with the
  **🎞 Filmstrip** button; switching it off frees every frame it held.
* **One decoder per video, shared** by thumbnails, the filmstrip and the hover preview,
  with seeks serialised. At most two videos keep a decoder alive at a time.
* **Clip thumbnails are lazy** — only cards you can actually see are captured, and if a
  filmstrip exists the nearest frame is reused for free.
* **Scrubbing is decoupled from decoding.** The playhead tracks your cursor every frame
  while the actual seek is throttled and uses `fastSeek`, so the bar never lags behind
  the mouse.

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
