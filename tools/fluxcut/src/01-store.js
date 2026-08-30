/* FluxCut Studio — document model, selection and history.
   The document is plain JSON so it can be saved, diffed and re-opened exactly.
   Binary File handles live outside it in FC.files (never serialised). */
(function (FC) {
  'use strict';
  const U = FC.util, { uid, clamp, qf } = U;

  FC.files = new Map();          // assetId -> File
  FC.objUrls = new Map();        // assetId -> object URL (lazily created, LRU-revoked)

  const DEFAULTS = {
    build: {
      pattern: 'fixed', fixed: 3, min: 1.5, max: 5, patternStr: '2,2,4', beatsPer: 4, accelFrom: 5, accelTo: 1,
      order: 'random', noRepeat: true, take: 'center', target: 'media', targetTime: 60, loopPool: true,
      seed: 1, stillDur: 4, kenBurns: false, kbAmount: 12, avoidHeadTail: 8,
      xfType: 'none', xfDur: 0.5, xfEvery: 1, respectLocks: true, keepManual: false,
      minClip: 0.4, jitter: 0
    },
    overlays: []
  };

  function newDoc(partial) {
    const d = Object.assign({
      v: 3, id: uid('proj'), name: 'Untitled Sequence', created: Date.now(),
      timebase: 30, ntsc: true, df: true, width: 1920, height: 1080, par: 'square',
      mediaRoot: '', winPaths: true, pathMode: 'absolute',
      assets: [], tracks: [], clips: [], markers: [],
      build: Object.assign({}, DEFAULTS.build), overlays: [],
      audioBeats: null, bpm: null
    }, partial || {});
    if (!d.tracks.length) {
      d.tracks = [
        mkTrack('video', 0, 'V1', 'main'),
        mkTrack('video', 1, 'V2', 'overlay'),
        mkTrack('audio', 0, 'A1', 'music'),
        mkTrack('audio', 1, 'A2', 'vo')
      ];
    }
    return d;
  }
  function mkTrack(kind, idx, name, role) {
    return {
      id: uid('trk'), kind, idx, name: name || (kind === 'video' ? 'V' : 'A') + (idx + 1),
      role: role || 'main', enabled: true, locked: false, solo: false, mute: false,
      h: kind === 'video' ? 58 : 42
    };
  }

  FC.doc = newDoc();

  /* ── selection ─────────────────────────────────────────────────── */
  const sel = {
    clips: new Set(), assets: new Set(), marker: null, targetTrack: null,
    has(id) { return this.clips.has(id); },
    set(ids) { this.clips = new Set(ids); U.bus.emit('sel'); },
    add(id) { this.clips.add(id); U.bus.emit('sel'); },
    toggle(id) { this.clips.has(id) ? this.clips.delete(id) : this.clips.add(id); U.bus.emit('sel'); },
    clear() { if (this.clips.size) { this.clips.clear(); U.bus.emit('sel'); } },
    list() { return FC.doc.clips.filter(c => this.clips.has(c.id)); }
  };

  /* ── derived lookups (memoised on a version counter) ───────────── */
  let ver = 0, cache = {};
  function bump() { ver++; cache = {}; }

  function trackById(id) { return FC.doc.tracks.find(t => t.id === id); }
  function assetById(id) { return FC.doc.assets.find(a => a.id === id); }
  function clipById(id) { return FC.doc.clips.find(c => c.id === id); }

  /** Clips on a track, ordered by start. Cached per version. */
  function clipsOn(trackId) {
    const k = 'ct' + trackId;
    if (cache[k]) return cache[k];
    const list = FC.doc.clips.filter(c => c.track === trackId).sort((a, b) => a.start - b.start);
    cache[k] = list; return list;
  }
  function clipAt(trackId, t) {
    const list = clipsOn(trackId);
    for (let i = 0; i < list.length; i++) { const c = list[i]; if (t >= c.start - 1e-6 && t < c.start + c.dur - 1e-6) return c; }
    return null;
  }
  /** Video tracks in stacking order (V1 first = bottom). */
  function videoTracks() { return FC.doc.tracks.filter(t => t.kind === 'video').sort((a, b) => a.idx - b.idx); }
  function audioTracks() { return FC.doc.tracks.filter(t => t.kind === 'audio').sort((a, b) => a.idx - b.idx); }
  /** Display order top→bottom: highest video first, then audio. */
  function displayTracks() { return videoTracks().slice().reverse().concat(audioTracks()); }
  function mainTrack() { return videoTracks()[0]; }

  /** Every cut across the enabled video tracks — what ↑/↓ navigate between. */
  function editPoints() {
    if (cache.eps) return cache.eps;
    const set = new Set([0]);
    for (const t of videoTracks()) {
      if (!t.enabled) continue;
      for (const c of clipsOn(t.id)) { set.add(Math.round(c.start * 1000) / 1000); set.add(Math.round((c.start + c.dur) * 1000) / 1000); }
    }
    if (set.size <= 1) for (const t of audioTracks())
      for (const c of clipsOn(t.id)) { set.add(Math.round(c.start * 1000) / 1000); set.add(Math.round((c.start + c.dur) * 1000) / 1000); }
    const list = Array.from(set).sort((a, b) => a - b);
    cache.eps = list; return list;
  }

  function duration() {
    if (cache.dur != null) return cache.dur;
    let e = 0;
    for (const c of FC.doc.clips) { const x = c.start + c.dur; if (x > e) e = x; }
    cache.dur = e; return e;
  }
  function fps() { return U.realFps(FC.doc.timebase, FC.doc.ntsc); }
  function snap(sec) { return qf(sec, fps()); }

  /** Source out point of a clip in its asset's own timebase. */
  function srcOut(c) { return c.in + c.dur * (c.speed || 1); }
  /** How much unused source sits before / after a clip — needed for real transitions. */
  function handles(c) {
    const a = assetById(c.assetId);
    if (!a || a.kind === 'image') return { head: 1e6, tail: 1e6 };
    return { head: Math.max(0, c.in), tail: Math.max(0, a.duration - srcOut(c)) };
  }

  /* ── history ───────────────────────────────────────────────────── */
  const HIST_MAX = 120;
  const hist = { past: [], future: [], label: null, group: 0 };
  const SNAP_KEYS = ['name', 'timebase', 'ntsc', 'df', 'width', 'height', 'par', 'mediaRoot', 'winPaths', 'pathMode',
    'assets', 'tracks', 'clips', 'markers', 'build', 'overlays', 'audioBeats', 'bpm'];

  function snapshot() { const o = {}; for (const k of SNAP_KEYS) o[k] = FC.doc[k]; return JSON.stringify(o); }
  function restore(str) {
    const o = JSON.parse(str);
    for (const k of SNAP_KEYS) FC.doc[k] = o[k];
    baseline = str;
    // drop selections that no longer exist
    const ids = new Set(FC.doc.clips.map(c => c.id));
    sel.clips = new Set(Array.from(sel.clips).filter(id => ids.has(id)));
    bump(); U.bus.emit('doc'); U.bus.emit('sel');
  }

  // The previous committed state, kept serialised so an edit costs ONE stringify
  // instead of two. Serialising twice per edit is what made long sessions crawl.
  let baseline = null;
  let markAtBegin = -1;
  function ensureBaseline() { if (baseline == null) baseline = snapshot(); }

  /** Call *before* mutating. Pairs with commit(). Nested calls collapse into one undo step. */
  function begin(label) {
    if (hist.group++ === 0) { ensureBaseline(); markAtBegin = ver; hist.label = label; }
    return true;
  }
  function commit(label) {
    if (--hist.group > 0) return;
    if (baseline == null) return;
    if (ver === markAtBegin) { hist.group = 0; return; }   // nothing touched the document
    const now = snapshot();
    if (now !== baseline) {
      hist.past.push({ s: baseline, label: label || hist.label || 'edit' });
      if (hist.past.length > HIST_MAX) hist.past.shift();
      hist.future.length = 0;
      FC.doc.dirty = true;
      baseline = now;
    }
    bump();
    U.bus.emit('doc'); U.bus.emit('hist');
  }
  /** Convenience: wrap a mutating function in one undo step. */
  function edit(label, fn) { begin(label); try { return fn(); } finally { commit(label); } }
  function abort() { if (--hist.group <= 0) { if (baseline != null) restore(baseline); hist.group = 0; } }

  function undo() {
    if (!hist.past.length) return U.toast('Nothing to undo', 'warn');
    ensureBaseline();
    const st = hist.past.pop();
    hist.future.push({ s: baseline, label: st.label });
    restore(st.s); U.bus.emit('hist'); U.toast('Undo · ' + st.label, 'info', 1400);
  }
  function redo() {
    if (!hist.future.length) return U.toast('Nothing to redo', 'warn');
    ensureBaseline();
    const st = hist.future.pop();
    hist.past.push({ s: baseline, label: st.label });
    restore(st.s); U.bus.emit('hist'); U.toast('Redo · ' + st.label, 'info', 1400);
  }

  /* ── mutation helpers (all assume begin/commit around them) ────── */
  function addClip(c) {
    const clip = Object.assign({
      id: uid('clip'), assetId: null, track: null, start: 0, dur: 1, in: 0, speed: 1,
      enabled: true, locked: false, opacity: 100, blend: 'normal', volume: 0, fadeIn: 0, fadeOut: 0,
      xf: null, motion: null, kb: null, rev: false, name: '', color: null, tag: ''
    }, c);
    FC.doc.clips.push(clip); bump(); return clip;
  }
  function removeClips(ids) {
    const s = new Set(ids);
    FC.doc.clips = FC.doc.clips.filter(c => !s.has(c.id));
    ids.forEach(id => sel.clips.delete(id));
    bump();
  }
  function addTrack(kind) {
    const list = kind === 'video' ? videoTracks() : audioTracks();
    const t = mkTrack(kind, list.length, null, kind === 'video' ? (list.length ? 'overlay' : 'main') : 'music');
    FC.doc.tracks.push(t); bump(); return t;
  }
  function removeTrack(id) {
    const t = trackById(id); if (!t) return;
    const kind = t.kind;
    FC.doc.clips = FC.doc.clips.filter(c => c.track !== id);
    FC.doc.tracks = FC.doc.tracks.filter(x => x.id !== id);
    (kind === 'video' ? videoTracks() : audioTracks()).forEach((x, i) => { x.idx = i; x.name = (kind === 'video' ? 'V' : 'A') + (i + 1); });
    bump();
  }

  /* ── (de)serialisation ─────────────────────────────────────────── */
  function toJSON() {
    const o = { app: 'FluxCut', v: FC.doc.v, savedAt: Date.now() };
    for (const k of SNAP_KEYS) o[k] = FC.doc[k];
    o.id = FC.doc.id;
    // assets keep their identity fingerprint so re-linking after a reopen is automatic
    o.assets = FC.doc.assets.map(a => {
      const c = Object.assign({}, a); delete c._url; delete c._thumb; delete c._probing; return c;
    });
    return JSON.stringify(o, null, 1);
  }
  function fromJSON(str) {
    const o = typeof str === 'string' ? JSON.parse(str) : str;
    if (!o || !o.clips) throw new Error('Not a FluxCut project');
    const d = newDoc({});
    for (const k of SNAP_KEYS) if (o[k] !== undefined) d[k] = o[k];
    d.id = o.id || uid('proj');
    d.build = Object.assign({}, DEFAULTS.build, d.build || {});
    FC.doc = d; FC.files.clear(); sel.clips.clear(); hist.past.length = 0; hist.future.length = 0; baseline = null;
    bump(); U.bus.emit('doc'); U.bus.emit('assets'); U.bus.emit('sel'); U.bus.emit('hist');
    return d;
  }

  FC.store = {
    newDoc, mkTrack, sel, bump, get ver() { return ver; },
    trackById, assetById, clipById, clipsOn, clipAt, videoTracks, audioTracks, displayTracks, mainTrack,
    duration, editPoints, fps, snap, srcOut, handles,
    begin, commit, edit, abort, undo, redo, hist,
    addClip, removeClips, addTrack, removeTrack, toJSON, fromJSON, DEFAULTS
  };
})(window.FC);
