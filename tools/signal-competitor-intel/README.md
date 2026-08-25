# Signal — YouTube Competitor Intelligence

Single-file offline app. Open `competitor_intel.html` in a browser; there is no build step.

## What changed in this revision

The app used to lose its channel list on refresh — the profile chip would read
`0 channels · 30 videos` even though every cached video was still on disk.

### Root cause

Settings (profiles, channel lists, API key) lived in a single localStorage key.
Bulk rows lived in IndexedDB, keyed `pid::id` and read back through
`r.pid === PID()`. The bulk data was therefore only reachable *through* the small
fragile record. Three things then compounded:

1. Boot fell through to minting a brand-new profile with a fresh random id
   whenever that record couldn't be read, which orphaned every existing row.
2. The next `saveCfg()` wrote that empty store over the real one, making the
   loss permanent.
3. `saveCfg()` had no error handling, so a quota failure was silently reported
   as success.

Separately, the channel textarea was only read on an explicit Save press, and any
re-render (including a background sync finishing) repainted it from disk —
so typed-but-unsaved text was routinely destroyed.

### Fix

- Every localStorage write is read back and verified; failures surface in the UI.
- The store is mirrored into IndexedDB with the last 12 revisions kept.
- A boot that finds no settings starts *provisional* and cannot save until
  reconcile has run, so it can never overwrite good data with nothing.
- Reconcile self-heals: orphaned profile ids are re-adopted, and a profile whose
  channel list is empty while its cached channel rows are not gets the list
  rebuilt from those rows.
- `navigator.storage.persist()` is requested so the origin isn't treated as
  disposable.
- `pruneOrphans` refuses to mass-delete on an empty list.
- Settings fields autosave on a debounce, on blur, on view change and on page hide.
- Focus and caret survive re-renders, so a background sync can't eat your typing.
- Cross-tab convergence via BroadcastChannel instead of last-write-wins.

Also added: Paste / Paste & replace / Copy all / Save .txt / Clean / Undo / Clear
on the channel list, and a Storage & durability panel with scan-and-repair plus
restorable recovery points.

## Tests

Requires Playwright and a Chromium binary.

    npm i playwright
    node test.mjs      # 35 — storage, recovery, paste/copy, autosave
    node regress.mjs   # 54 — every view, profiles, export/import, perf
    node torture.mjs   # 17 — wiped/corrupted storage, two tabs, mid-edit repaint

The suites point at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; change
`executablePath` at the top of each file to match your install.
