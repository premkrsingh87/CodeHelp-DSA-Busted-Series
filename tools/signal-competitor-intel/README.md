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

## Data accuracy and speed revision

### The header said 23 channels, the dashboard said 29

Two independent answers to "how many channels?". The profile chip read
`CFG.channels.length` (the list in Settings) while the dashboard, the channel
picker, every median, every total and every outlier baseline read `S.channels` —
whatever happened to be cached. Remove six channels from the list and their
videos stayed inside every number.

`CFG.channels` is now the single source of truth. `loadAll` splits cached rows
into active and delisted once, and everything downstream reads the filtered
arrays, so the numbers cannot describe a different set of channels than the list
on screen. Delisted rows are kept on disk, excluded from every metric, and
reported in a banner with a one-click cleanup — never deleted silently.

### Switching profiles mid-sync destroyed data

`syncAll` read `PID()` live, at write time, inside a loop that awaits the network
per channel. Switching profiles while a sync ran stamped the remaining rows with
the *new* profile's id. Worse, the prune step at the end of the sync then saw
those rows as orphans of the new profile and deleted them — along with their
videos. Verified against the original build: a sync of 4 videos across 2
channels ended with 0 rows anywhere.

A sync now binds to the profile that started it, captured once. Every write uses
that id, and in-memory state is only touched while that profile is still on
screen. This also makes concurrent syncs safe, so a sync on one profile no
longer blocks working in another.

### Derived caches served stale numbers

Baselines, outliers, topics, upload gaps and momentum all keyed their memoisation
on `S.videos.length`, which is not a fingerprint. A sync that refreshed 200 view
counts without adding a video left the length identical, so every derived figure
kept serving the previous numbers. Trimming N and adding N collapsed the same
way. All of them now key on a monotonic `S.dataVer` bumped on every mutation.

### Slow load

`loadAll` called `getAll()` on each store — every row belonging to every profile
— then discarded ~80% with a filter, and fetching one `comments_<pid>` blob
dragged every profile's comments through memory. The stores already carried a
`pid` index that nothing used.

Reads now go through that index, all five in parallel, with targeted `get()` for
single keys. The boot integrity check walks distinct index keys (no records
deserialised) inside one transaction, and runs *after* first paint — a healthy
boot reads nothing extra and writes nothing at all. The data read starts
optimistically in parallel with the check rather than queueing behind it.

With 5 profiles / 15,000 videos / 5,000 snapshots on disk:

| | original | this revision |
|---|---|---|
| boot to interactive | 300ms | 217ms |
| profile switch | 213–287ms | 96–122ms |
| indexed read of one profile's videos | 105ms (full scan) | 35ms |

Also: `Array.includes` per video replaced with Set lookups in the range filter,
the channel lookup map is built once per data change instead of once per
`enrich()` call, and `channelTrend` reads the pre-sorted channel index instead of
re-filtering and re-sorting the whole catalogue per channel.

## Tests

Requires Playwright and a Chromium binary.

    npm i playwright
    node test.mjs      # 35 — storage, recovery, paste/copy, autosave
    node regress.mjs   # 54 — every view, profiles, export/import, perf
    node torture.mjs   # 17 — wiped/corrupted storage, two tabs, mid-edit repaint
    node accuracy.mjs  # 29 — listed-vs-cached coherence, stale caches,
                       #      cross-profile sync, concurrency, load speed
    node bench.mjs <file>   # timings against a 15,000-row database

The suites point at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; change
`executablePath` at the top of each file to match your install.
