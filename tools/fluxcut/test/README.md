# FluxCut tests

End-to-end, in a real browser, against the built `FluxCut.html`. No mocks: real files go
through the real import path, the real build runs, and the exported XML is parsed back
with `DOMParser` and asserted on.

## Run

```bash
npm i -D playwright                  # or point the paths below at an existing install
node test/genmedia.js  test/media    # 6 videos, 3 stills, a 120 BPM click track
node test/genstills.js test/stills   # 21 full-size vertical stills + a 2:04 bed
node test/e2e.js                     # 70 assertions — model, edit ops, exporters
node test/interaction.js             # 16 assertions — storyboard, drag modes, overlays
node test/audit.js                   # clicks every control, reports anything silent
node test/perf.js                    # 30-minute / ~1400-clip stress run
```

Both scripts take the app path and media folder as optional arguments:

```bash
node test/e2e.js /path/to/FluxCut.html /path/to/media
```

They resolve Playwright and Chromium from absolute paths at the top of each file — adjust
those two constants for your machine.

`interaction.js` and `audit.js` use the `test/stills` set, which reproduces the hard
case: large vertical photos in a wide sequence, over a long music bed.

## What e2e.js covers

ingest and probing · thumbnail decode · auto-build (clip count, no gaps, frame alignment,
exact target length) · shuffle-order vs shuffle-content semantics · spreading one source
into many takes · beat detection and beat-synced cutting · fill-to-audio · overlay
generation and re-flow · transitions against available handles · playback (playhead
advance, real pixels on the monitor, frame rate) · split / ripple delete / ripple trim /
undo · FCP7 XML structure (frame contiguity, source-length match, single file definition
per asset, path URLs, transitions, scale filters, markers, links) · EDL / OTIO / CSV /
ffmpeg script · project round-trip · relink by fingerprint · UI smoke · console hygiene.

## What interaction.js covers

storyboard opens and leaves the timeline room · insertion caret · card drag reorders
without gaps · typing a length retimes the edit · card edits undo · swap trades two
clips keeping their slots · roll keeps total length and moves frames between neighbours ·
overlay source dropdown is populated · a rule creates instances across the edit ·
the overlay actually composites in the monitor · its opacity reaches the XML.

## What audit.js covers

Clicks all 42 chrome buttons and every inspector action, then builds with all seven
rhythm patterns and all four overlay repeat modes, asserting no console errors, no gaps,
and that every overlay instance lands inside the edit.
