# ClipForge Studio

One HTML file. Paste YouTube links, watch them, mark the bits you want, and get a
ready-to-run script that downloads **only those seconds**.

It merges two earlier prototypes — the YouTube multi-clip trimmer (`yt_scene_dow.html`)
and the local scene splitter (`scene_splitter_best.html`) — into a single tool where the
YouTube workflow and the frame-accurate local workflow share one clip model, one timeline,
one exporter.

```
tools/clipforge/ClipForge-Studio.html     ← open this in a browser. That is the whole app.
```

No install, no server, no build step. Nothing is uploaded anywhere.

---

## The 30-second version

1. Paste a YouTube URL in the left panel and press <kbd>Enter</kbd>.
2. Watch. Press <kbd>I</kbd> where a clip should start, <kbd>O</kbd> where it ends,
   <kbd>Enter</kbd> to keep it. Repeat.
3. Press **Download script** and run the file. yt-dlp fetches just those ranges.

Add as many videos as you like — one script handles the whole batch.

---

## What it does

**Getting video in**
- YouTube URL, bare ID, `youtu.be`, `/shorts/`, `/embed/`, `/live/`, `?t=` seek links
- Bulk paste of many URLs at once; whole playlists expand with an API key
- Local video files (drag anywhere) — these unlock the frame-accurate tools
- Optional YouTube Data API key for exact duration, chapters, views/likes, playlists.
  Without a key it falls back to oEmbed for the title and reads the duration off the player.

**Marking clips** — every tool below produces plain clips, so undo, selection, renaming
and export behave identically no matter how a clip was made.
- <kbd>I</kbd>/<kbd>O</kbd>/<kbd>Enter</kbd> while watching, <kbd>M</kbd> to split at the playhead,
  <kbd>Q</kbd> for a quick fixed-length clip
- Timeline: drag to move, drag edges to trim, drag ◆ markers to move a shared cut,
  double-click to preview, double-click a marker to merge. Snapping to clips, chapter
  starts, the playhead and whole seconds. Zoom to 400× with <kbd>Ctrl</kbd>+wheel.
- YouTube chapters → clips in one click
- Fixed interval · equal parts · Shorts builder (spreads N short clips, snapping to chapters)
- Paste timestamp ranges (`1:20-1:45 name`) or split points
- Transcript search: paste YouTube's transcript, search a phrase, turn every hit into a
  padded clip — the fastest way to find the moments worth cutting
- **Local files only:** two-pass visual scene detection (coarse scan → per-frame refinement),
  waveform + silence detection that cuts speech out of the gaps, filmstrip, hover frame preview

**Everything else**
- Per-clip include/exclude, bulk shift / pad / rename / merge / split / dedupe / fill-gaps
- Filename templates: `{i} {vi} {name} {title} {id} {start} {end} {dur} {ch} {date}`
- Validation that catches overlaps, sub-second clips, clips past the end and duplicate
  output names — each with a one-click fix
- Stats: coverage, runtime, median/longest/shortest, length histogram, gaps, estimated
  download size and time, plus channel/view/like intelligence
- Undo/redo per video, autosave to the browser, project export/import as JSON

**Export** — five formats (`.bat`, `.sh`, `.ps1`, `.py`, raw commands) × four strategies:

| Strategy | What it does | Use it when |
|---|---|---|
| Per-clip sections | one `yt-dlp --download-sections` call per clip | a handful of clips, exact names |
| Batched sections | all ranges of a video in one call | many clips, metadata resolved once |
| Download once, cut locally | one full download, then FFmpeg cuts | ~5+ clips per video, or you will re-cut |
| FFmpeg only | no downloading at all | you already have the files |

Plus quality/format (MP4/MKV/WebM/MP3/M4A/WAV), parallel jobs, resume-on-rerun,
browser cookies for age-restricted videos, SponsorBlock, subtitles, thumbnails,
a 9:16 Shorts re-frame pass, proxy, retries, and a ZIP with every format + CSV + JSON + README.

The generated scripts find yt-dlp (downloading it on Windows if missing), create a fresh
numbered output folder each run so nothing is ever overwritten, skip clips that already
exist, and print a summary.

---

## Why some features need a local file

A YouTube embed is cross-origin. The browser will not let the page read its pixels or its
audio, so visual scene detection, the filmstrip and silence-cutting cannot work on it —
no web app can do this, whatever it claims.

The practical workflow for a video you intend to cut heavily: export with the
**download once, cut locally** strategy, then drag the downloaded file back into ClipForge
for frame-accurate work.

---

## Requirements for the generated scripts

```
yt-dlp    winget install yt-dlp   |  brew install yt-dlp  |  pip install -U yt-dlp
ffmpeg    winget install ffmpeg   |  brew install ffmpeg   |  sudo apt install ffmpeg
```

The Windows `.bat` downloads yt-dlp for you if it is missing. If downloads start failing,
update yt-dlp first — it goes stale quickly.

Opening the app from `file://` works. If YouTube refuses to embed a particular video, the
player shows why and everything else still works: set the duration by hand and type
timestamps in.

---

## Verification

`smoke-test.js` drives the app in headless Chromium and checks boot, URL parsing, every
clip tool, undo/redo, timeline dragging/trimming/merging, all 20 script variants, all six
formats, every option combination, persistence across reload, the modals, validation fixes,
bulk edit and multi-video projects. It then records a real video in-page and feeds it in as
a `File` to exercise the local path end to end.

```bash
node smoke-test.js                    # needs playwright + a chromium build
```

The last run had every check green, with visual scene detection landing cuts at
1.53 / 3.03 / 4.53 s on a clip whose true cuts are at 1.5 / 3.0 / 4.5 s, and silence
detection recovering the speech either side of a 2.0–3.6 s silent gap. The generated
`.sh` and `.py` scripts were additionally executed against stub `yt-dlp`/`ffmpeg`
binaries to confirm the command lines they build are correct.
