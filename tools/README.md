# SceneCut Studio

A single-file, offline video scene splitter. Open `SceneCut-Studio.html` in any
modern browser — there is nothing to install, no server, and no upload: your
video never leaves the machine.

You load one or many videos, find the cuts (automatically or by hand), decide
which clips to keep, and download an FFmpeg script that produces the actual
files.

## Quick start

1. Open `SceneCut-Studio.html`.
2. Drop in your video files — as many as you like.
3. Hit **⚡ Detect all**, or press <kbd>M</kbd> while watching to mark cuts yourself.
4. Untick the clips you don't want.
5. **📦 Everything as ZIP**, unzip next to your videos, run the script.

FFmpeg is only needed for step 5:

```
winget install ffmpeg      # Windows
brew install ffmpeg        # macOS
sudo apt install ffmpeg    # Linux
```

## What it does

**Many videos at once.** Every video in the queue keeps its own cuts, names and
keep/drop choices. One batch script extracts all of them into per-video folders
in a single run.

**Fast detection.** Frames are collected while the video plays at up to 16×
rather than seeking to each one, then the few frames around each hit are
bisected for frame accuracy. Detection uses a per-quadrant colour histogram, so
a cut between two similarly-bright shots is caught and a camera pan is not
mistaken for one.

**Silence cutting.** Decodes the audio once, draws the waveform on the timeline,
and cuts where nobody is speaking — optionally dropping the silent parts, which
turns a rambling take into a tight one in two clicks.

**Scales.** The timeline is a canvas that only draws the visible time window and
the scene list only builds the rows on screen, so 5 000 scenes stay as
responsive as 5.

**Your work is remembered.** Cuts are saved against a fingerprint of the file;
re-add the same video later and they come back. `💾 Project` exports the same
data as a file you can keep or share.

## Exports

| Output | Use |
| --- | --- |
| `.bat` `.sh` `.ps1` `.py` | Run FFmpeg on Windows / macOS / Linux |
| Joined clip | Stitches the kept scenes into one file — deletes bad takes |
| `chapters.txt` | Paste straight into a YouTube description |
| `scenes.csv` | Every scene with times, keep flag and label |
| `scenes.edl` | Import into Resolve / Premiere / Avid |
| `project.json` | Reload in SceneCut Studio to carry on |

Encode presets cover stream copy, H.264 CRF, NVENC / QuickSync / VideoToolbox,
a 9:16 Shorts crop, audio-only and GIF.

The scripts find your video by name and fall back to matching its exact byte
size, so renaming the file afterwards is safe.

## Shortcuts

Press <kbd>?</kbd> in the app for the full list. The ones worth knowing:

| Key | Action |
| --- | --- |
| <kbd>Space</kbd> | Play / pause |
| <kbd>J</kbd> <kbd>K</kbd> <kbd>L</kbd> | Shuttle slower / stop / faster |
| <kbd>M</kbd> | Mark a cut |
| <kbd>X</kbd> | Delete the nearest cut |
| <kbd>S</kbd> / <kbd>D</kbd> | Keep / drop the scene under the playhead |
| <kbd>↑</kbd> <kbd>↓</kbd> | Jump between cuts |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | Command palette |

## Browser support

Chrome, Edge, Opera and Brave get the fast play-through scan. Firefox and Safari
fall back to seek sampling automatically — slower, same results. Audio decoding
depends on the browser supporting the container's audio codec; MP4 and WebM are
reliable, MKV often is not, and the app says so rather than failing silently.
