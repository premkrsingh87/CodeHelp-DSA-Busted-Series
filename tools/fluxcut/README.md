# FluxCut Studio

An auto-sequencing timeline that turns a folder of clips into a finished edit and hands
Premiere Pro (or Media Encoder, Resolve, or ffmpeg) something it can open and export.

One HTML file. No install, no server, no upload — your media never leaves the machine.

```
open tools/fluxcut/FluxCut.html          # double-click it. That's the whole setup.
```

---

## What it is for

You have a pile of clips and stills. You want them laid end to end at sensible lengths,
in an order you can re-roll until it feels right, with an overlay repeating across the
whole thing and a music bed underneath — and then you want to *stop*, hand a file to
Premiere, and hit export.

That is the entire job FluxCut does. It is not an NLE; it is the thing that makes the
NLE unnecessary for this particular job.

---

## The loop

1. **Drop media in** — files or whole folders. Folder structure is preserved so
   relinking works later.
2. **Press `B`** — the Director builds a sequence from your rules.
3. **Press `S`** until the order feels right — every press re-rolls the running order
   while each clip keeps its own duration.
4. **Export** — `sequence.xml` → Premiere `File ▸ Import`. Done.

---

## Two interfaces onto the same edit

Both are always the same document — change one and the other updates immediately.

**Storyboard** (<kbd>Tab</kbd>) — the coarse pass. Clips are cards: drag one between
two others and a green caret shows where it lands, type a new length straight into the
card, lock a card to pin it, drop media from the bin at any position. This is the
"shuffle things around until the order is right" view.

**Timeline** — the fine pass. Frame-accurate trims, razor, slip, roll, transitions,
overlays, audio.

### Drag and trim modes

Because "what happens to the *other* clips" should be your choice, not a guess:

| Drag mode | Dropping a clip on another… |
|---|---|
| **Insert** | pushes the rest along — nothing is overwritten, no gaps appear |
| **Free** | leaves it exactly where you dropped it, gaps and all |
| **Swap** | trades the two clips; both keep their own length and slot |

| Trim mode | Dragging a clip edge… |
|---|---|
| **Ripple** | moves everything after it, so the cut never leaves a hole |
| **Roll** | takes frames from one clip and gives them to its neighbour — total length unchanged |
| **Leave gap** | changes only this clip |

<kbd>Alt</kbd> while dragging inverts whichever mode is active, so the other behaviour is
always one key away. <kbd>R</kbd> cycles the trim mode.

## Building

The bar under the monitor is the Director. It is deterministic: the same seed and the
same settings always produce the same edit, so re-rolling is a dial you can turn back.

| Control | What it does |
|---|---|
| **Build** | Rhythm of the cut: whole clips · fixed length · random range · a repeating pattern like `2,2,4` · beat-synced · accelerating · decelerating |
| **Order** | Bin order · shuffle · filename · longest first · shortest first · alternate folders (round-robins between source folders so material interleaves) |
| **No dupes** | Never places two clips from the same source back to back |
| **Take** | Which part of each source to use: head, middle, random, tail, or **spread** — each reuse of a source walks further along it, so one long file becomes many different shots |
| **Fill** | All media · the length of your audio track · a fixed running time. Clips are trimmed so the last one lands exactly on target |
| **Loop** | Cycle the pool until the target is filled |
| **Seed** | Change it to get a different edit; put it back to get the old one |

`Options…` adds shortest-clip floor, length jitter, still duration, how much of each
source's head and tail to avoid, Ken Burns amount, and the global transition.

### Shuffling — the two kinds

These are different operations and FluxCut gives you both:

- **`S` · Reshuffle order** — positions change, every clip keeps its own duration and
  its own source. This is the one you want when the clips are already the right lengths.
- **`⇧S` · Reshuffle content** — the slot grid stays exactly where it is and the
  *sources* move between slots. Use it when the rhythm is right and the material isn't.

Both respect locked clips, and both work on just the selection if you have one.

---

## Overlays

Inspector ▸ **Overlays**. Pick a file in the bin — a light leak, grain, dust, a logo —
and add it as a rule. A rule is not a clip; it is an instruction that regenerates itself
every time the edit underneath changes.

| Repeat mode | Behaviour |
|---|---|
| Cover whole edit | Tiles end to end across the full running time, with an optional gap |
| Every N seconds | A hit every N seconds, with optional random jitter |
| On every cut | One hit on each cut in the main track — re-flows when you reshuffle |
| Random hits | N per minute, seeded so you can re-roll |

Each rule carries opacity, blend mode, fades and scale mode. Reshuffle the edit and the
overlays follow automatically.

**Opacity exports to Premiere as a real Opacity effect.** Blend modes do not — FCP7 XML
has no blend-mode field. They are honoured in the preview and baked by the ffmpeg render
script; in Premiere you set them yourself, or render with ffmpeg instead. The app tells
you this rather than letting you find out at the finish line.

---

## Audio and rhythm

Drop a music bed or a voiceover in the bin and place it from Inspector ▸ **Audio**.

- **Fill → Audio length** makes the picture end exactly with the track.
- **Detect beats** analyses the file (onset envelope + tempo autocorrelation) and shows
  the grid on the waveform.
- **Build → Beat-synced** cuts every N beats.
- **Snap cuts to beats** pulls an *existing* edit onto the grid without changing the
  running order.
- **Fit video to audio** / **Trim audio to video** for everything else.

---

## The timeline

Canvas-rendered, so 1,400 clips scroll as smoothly as 20.

- **Drag a clip between two others and it inserts** — everything re-flows, no gaps, no
  overwriting. Hold <kbd>Alt</kbd> to move freely instead.
- Drag clip edges to trim (ripple by default), <kbd>Alt</kbd>-drag an edge to roll the cut.
- Tools: <kbd>V</kbd> select · <kbd>C</kbd> razor · <kbd>Y</kbd> slip · <kbd>H</kbd> pan.
- Snapping catches clip edges, the playhead, markers and detected beats.
- Locked clips are anchors — rebuilds and shuffles flow around them.
- <kbd>↑</kbd>/<kbd>↓</kbd> walk the cuts of the whole edit, not just one track.
- Typing in a field never disarms the shortcuts: <kbd>Enter</kbd> or a click on the
  picture, timeline or storyboard hands the keyboard straight back, and a number field
  passes letter shortcuts through untouched.

### Keyboard

| | |
|---|---|
| <kbd>Space</kbd> · <kbd>J</kbd><kbd>K</kbd><kbd>L</kbd> | Play/pause · shuttle |
| <kbd>←</kbd> <kbd>→</kbd> · <kbd>⇧←</kbd> <kbd>⇧→</kbd> | Step a frame · a second |
| <kbd>↑</kbd> <kbd>↓</kbd> | Previous / next cut |
| <kbd>B</kbd> · <kbd>S</kbd> · <kbd>⇧S</kbd> | Build · reshuffle order · reshuffle content |
| <kbd>⌥←</kbd> <kbd>⌥→</kbd> | Rotate the running order |
| <kbd>⌘K</kbd> · <kbd>⌫</kbd> · <kbd>⇧⌫</kbd> | Split · delete · ripple delete |
| <kbd>[</kbd> <kbd>]</kbd> · <kbd>⌘D</kbd> · <kbd>M</kbd> | Nudge a frame · duplicate · marker |
| <kbd>N</kbd> · <kbd>R</kbd> | Snapping · cycle trim mode |
| <kbd>A</kbd> <kbd>D</kbd> · <kbd>⇧Z</kbd> | Zoom out · zoom in · zoom to fit |
| <kbd>Tab</kbd> | Show / hide the storyboard |
| <kbd>⌘S</kbd> <kbd>⌘O</kbd> <kbd>⌘E</kbd> <kbd>⌘I</kbd> | Save · open · export · import |

Press <kbd>?</kbd> in the app for the full sheet.

---

## Preview

The monitor plays the **timeline**, not a file: a pool of decoders is scheduled ahead of
the playhead and composited onto one canvas, so overlays, opacity, blend modes, fades,
dissolves and Ken Burns are what you actually see.

Quality (Proxy ¼ · ½ · Full) only changes the *preview* canvas size — a smaller canvas
means less decoding pressure while you work. **Export always references your original
files at full resolution.** There is no proxy round-trip to remember and nothing to
relink at the end.

---

## Where your media lives  ← read this once

A browser is never told the real path of a file you drop on it. So FluxCut asks you once,
in Inspector ▸ **Sequence ▸ Where your media lives**:

- **Absolute** — set **Media root** to the folder those files came from
  (`C:\Footage\ProjectX`). Every export then points straight at them and Premiere links
  on import. Pick the Windows or macOS separator to match the machine that will open it.
- **Relative** — paths stay relative to the XML. Combine with **Copy the media
  alongside it** at export and you get a self-contained folder that links anywhere.

**Check paths** in the export dialog shows exactly what will be written before you commit.

---

## Exporting

<kbd>⌘E</kbd>. Pick any combination:

| Output | For |
|---|---|
| `sequence.xml` | **Premiere Pro, Media Encoder, Resolve, Vegas.** FCP7 XML (xmeml v4): all tracks, trims, opacity, dissolves, Ken Burns keyframes, scale-to-frame, markers, linked source audio, clip labels |
| `render.sh` · `render.ps1` · `render.bat` · `filtergraph.txt` | **ffmpeg — no Adobe at all.** Renders this exact edit: cuts, xfade transitions, overlays with real blend modes, video and audio fades, and the audio mix. H.264 / HEVC / ProRes / DNxHR / proxy |
| `timeline.otio` | OpenTimelineIO — native conform for Resolve and the otio toolchain |
| `sequence.edl` | CMX 3600, correct two-event dissolves, for online conform |
| `shotlist.csv` | Every clip with timecode, source in/out, opacity, blend, transition, path |
| `project.fluxcut` | The whole session — rules, seeds, overlays, paths — to reopen later |
| `README.txt` | Import steps written for whoever opens the folder |

Delivered as separate downloads, one ZIP, or written straight into a folder on disk
(Chrome/Edge). Tick **Copy the media alongside it** for a self-contained package.

### Getting it into Premiere

1. `File ▸ Import…` → `sequence.xml`
2. Premiere creates a bin and a sequence. Open it — the edit is already there.
3. Export as usual, or `File ▸ Export ▸ Media ▸ Queue` to hand it to Media Encoder.

If everything comes in offline, the media root didn't match this machine: right-click the
bin ▸ **Link Media**, point at one file, and Premiere finds the rest.

### Getting it into Media Encoder

- **Reliable:** open in Premiere, `Export ▸ Media ▸ Queue`. AME picks it up.
- **Direct:** AME `File ▸ Add Source ▸ sequence.xml`. Recent AME builds read Final Cut
  Pro XML; if yours refuses the file, use the Premiere route.
- **Neither:** run `render.sh` (macOS/Linux) or `render.bat` (Windows). You get the
  finished video without opening an Adobe app.

### Transitions and handles

A centred dissolve borrows unused source from both sides of the cut. Where a clip has no
spare frames, FluxCut shortens *that* dissolve to what actually fits rather than writing
something Premiere will silently mangle — and the apply reports how many were shortened
or skipped. The transition wedge on the timeline shows you the real length.

---

## Speed and memory

Measured on a 30-minute edit, 1,397 clips, in Chromium (and separately on the harder
case of 21 full-size vertical stills over a 2-minute music bed):

| | |
|---|---|
| Build the whole sequence | 17 ms |
| Reshuffle | 7 ms |
| Dissolve on every cut | 9 ms |
| Write the FCP7 XML (4 MB) | 14 ms |
| Write the ffmpeg script | 11 ms |
| Timeline paint | 60 fps |
| Scrubbing the playhead | 17 ms per move |
| Playback frame pacing | 16.7 ms median, one dropped frame in 12 s |
| JS heap | 13.6 MB |

How it stays there:

- **Nothing is read into memory.** Media is referenced by object URL; the old approach of
  zipping every video through RAM is gone. Even the ZIP export streams — it CRCs each
  file in chunks and lets the browser assemble the archive from file handles.
- **Thumbnails are decoded once, ever.** They go to IndexedDB keyed by name + size +
  modified-time, so reopening a project costs zero decoding. Reload the page with no
  files attached and the filmstrips are still there.
- **Hard caps with LRU eviction** on decoded frames (220 MB), object URLs (28) and video
  decoders (4). The MB chip in the title bar is live — click it to release frames.
- **No DOM per clip.** The timeline is one canvas; the bin is virtualised.
- **Re-dropping the same folder relinks by fingerprint** instead of creating duplicates.
- **One serialisation per edit.** Undo used to stringify the whole document twice for
  every change, which is what made a long session feel progressively heavier.
- **Scrubbing draws from the filmstrip cache** and only re-syncs decoders when you let
  go, so dragging the playhead stays at frame rate however long the edit is.
- **Stills are decoded ahead of the playhead** and evicted least-recently-*used*, never
  while they are on screen.

---

## Project files

`⌘S` writes a `.fluxcut` file (and an autosave into the browser every 20 s, offered back
on the next visit). It holds the whole document: assets and their paths, every clip and
trim, overlay rules, seeds, markers, build settings.

Reopen it, drop the same media folder back in, and everything relinks by fingerprint.

---

## Known limits

Stated plainly, so nothing surprises you at the finish line:

- **Blend modes don't survive FCP7 XML.** Preview and ffmpeg honour them; Premiere needs
  you to set them by hand. (Opacity *does* export.)
- **Speed ramps aren't in this version.** Every clip plays at 1×.
- **Preview decodes what your browser can decode.** ProRes, DNxHR, R3D and BRAW won't
  preview in a browser — they still import, sequence and export correctly, you just
  won't see them in the monitor. The XML points Premiere at the originals regardless.
- **A very long edit makes a very long ffmpeg command.** Past ~60 clips the render script
  still works but is slow to start; the graph is written to `filtergraph.txt` and Windows
  goes through PowerShell precisely to dodge `cmd.exe`'s length limit. For feature-length
  work, prefer the Premiere route.
- **The EDL is V1 only**, as EDLs are.

---

## Working on the source

```
tools/fluxcut/
  FluxCut.html      ← the built app. This is the file you open.
  index.html        ← same modules loaded separately, for debugging
  build.js          ← node build.js  → rebuilds both
  src/
    00-util.js        maths, timecode (incl. drop-frame), seeded RNG, event bus
    01-store.js       document model, selection, undo/redo
    02-idb.js         IndexedDB cache
    03-media.js       ingest, probing, filmstrips, waveforms, beat detection
    04-ops.js         edit primitives — trim, roll, slip, split, ripple, shuffles
    05-director.js    the auto-sequencer and the overlay engine
    06-timeline.js    canvas timeline: render + direct manipulation
    07-player.js      program monitor — decoder pool and compositor
    08-export-xml.js  FCP7 XML, EDL, OTIO, CSV, path validation
    09-export-render.js  ffmpeg script writer, streaming ZIP, folder collector
    10-bin.js         virtualised media bin
    11-inspector.js   the four inspector tabs
    12-app.js         wiring, shortcuts, modals, export dialog
    13-storyboard.js  the card strip: drag to reorder, type a length
```

Edit anything in `src/`, run `node build.js`, reload. Modules are plain classic scripts
sharing one `window.FC` namespace — deliberately, so the built file runs from `file://`
with no server and no toolchain.
