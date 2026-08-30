# FluxCut tests

End-to-end, in a real browser, against the built `FluxCut.html`. No mocks: real files go
through the real import path, the real build runs, and the exported XML is parsed back
with `DOMParser` and asserted on.

## Run

```bash
npm i -D playwright          # or point the paths below at an existing install
node test/genmedia.js test/media    # generates 6 videos, 3 stills, a 120 BPM click track
node test/e2e.js                    # 70 assertions
node test/perf.js                   # 30-minute / ~1400-clip stress run
```

Both scripts take the app path and media folder as optional arguments:

```bash
node test/e2e.js /path/to/FluxCut.html /path/to/media
```

They resolve Playwright and Chromium from absolute paths at the top of each file — adjust
those two constants for your machine.

## What e2e.js covers

ingest and probing · thumbnail decode · auto-build (clip count, no gaps, frame alignment,
exact target length) · shuffle-order vs shuffle-content semantics · spreading one source
into many takes · beat detection and beat-synced cutting · fill-to-audio · overlay
generation and re-flow · transitions against available handles · playback (playhead
advance, real pixels on the monitor, frame rate) · split / ripple delete / ripple trim /
undo · FCP7 XML structure (frame contiguity, source-length match, single file definition
per asset, path URLs, transitions, scale filters, markers, links) · EDL / OTIO / CSV /
ffmpeg script · project round-trip · relink by fingerprint · UI smoke · console hygiene.
