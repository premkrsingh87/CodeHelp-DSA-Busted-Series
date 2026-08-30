/* FluxCut Studio — timeline edit operations.
   Every op is frame-quantised and leaves the track in a legal state
   (sorted, no overlaps, no accidental sub-frame gaps). */
(function (FC) {
  'use strict';
  const U = FC.util, S = FC.store, { clamp, uid } = U;
  const EPS = 1e-6;

  const fps = () => S.fps();
  const q = s => Math.round(s * fps()) / fps();
  const frame = () => 1 / fps();

  /* ── layout ────────────────────────────────────────────────────── */
  /** Re-lay a track's clips end-to-end from `from`, preserving each clip's own duration. */
  function relayout(trackId, from) {
    const list = S.clipsOn(trackId);
    let t = q(from || 0);
    for (const c of list) { c.start = t; t = q(t + c.dur); }
    S.bump(); return t;
  }
  /** Close gaps without reordering (keeps the first clip where it is). */
  function closeGaps(trackId) {
    const list = S.clipsOn(trackId);
    if (!list.length) return;
    let t = list[0].start;
    for (const c of list) { c.start = q(t); t = c.start + c.dur; }
    S.bump();
  }
  /** Remove overlaps by pushing later clips right (used after a paste / insert). */
  function resolveOverlaps(trackId) {
    const list = S.clipsOn(trackId);
    for (let i = 1; i < list.length; i++) {
      const p = list[i - 1], c = list[i];
      if (c.start < p.start + p.dur - EPS) c.start = q(p.start + p.dur);
    }
    S.bump();
  }
  function trackEnd(trackId) {
    const list = S.clipsOn(trackId);
    return list.length ? list[list.length - 1].start + list[list.length - 1].dur : 0;
  }

  /* ── snapping ──────────────────────────────────────────────────── */
  /** All magnetic points: clip edges (other tracks too), playhead, markers, beats, 0. */
  function snapPoints(excludeIds) {
    const ex = excludeIds instanceof Set ? excludeIds : new Set(excludeIds || []);
    const pts = [0];
    for (const c of FC.doc.clips) {
      if (ex.has(c.id)) continue;
      pts.push(c.start, c.start + c.dur);
    }
    for (const m of FC.doc.markers) pts.push(m.t);
    if (FC.player) pts.push(FC.player.time);
    if (FC.doc.audioBeats) for (const b of FC.doc.audioBeats) pts.push(b);
    return pts;
  }
  function snapTo(t, pts, tol) {
    let best = t, bd = tol;
    for (let i = 0; i < pts.length; i++) { const d = Math.abs(pts[i] - t); if (d < bd) { bd = d; best = pts[i]; } }
    return best;
  }

  /* ── clip creation ─────────────────────────────────────────────── */
  function clipFromAsset(a, opts) {
    opts = opts || {};
    const isStill = a.kind !== 'video';
    const full = isStill ? (opts.dur || FC.doc.build.stillDur) : a.duration;
    let dur = q(clamp(opts.dur != null ? opts.dur : full, frame(), 1e5));
    let inp = 0;
    if (!isStill) {
      const maxIn = Math.max(0, a.duration - dur);
      inp = q(clamp(opts.in || 0, 0, maxIn));
      dur = q(Math.min(dur, Math.max(frame(), a.duration - inp)));
    }
    const c = {
      id: uid('clip'), assetId: a.id, track: opts.track, start: q(opts.start || 0),
      dur, in: inp, speed: 1, name: a.name, color: a.color,
      enabled: true, locked: false, opacity: 100, blend: 'normal',
      volume: 0, fadeIn: 0, fadeOut: 0, xf: null, motion: null, kb: opts.kb || null, rev: false, tag: a.tag || ''
    };
    for (const k of ['opacity', 'blend', 'fadeIn', 'fadeOut', 'volume', 'name', 'color', 'locked', 'enabled', 'motion'])
      if (opts[k] !== undefined) c[k] = opts[k];
    return c;
  }

  /* ── move / reorder ────────────────────────────────────────────── */
  /** Move a set of clips by delta seconds, optionally onto another track. */
  function moveBy(clips, dt, newTrackId) {
    for (const c of clips) {
      if (c.locked) continue;
      c.start = q(Math.max(0, c.start + dt));
      if (newTrackId) c.track = newTrackId;
    }
    S.bump();
  }
  /** Reorder within a track by index — durations travel with their clip. */
  function reorder(trackId, fromIdx, toIdx) {
    const list = S.clipsOn(trackId).slice();
    if (fromIdx < 0 || fromIdx >= list.length) return;
    const [c] = list.splice(fromIdx, 1);
    list.splice(clamp(toIdx, 0, list.length), 0, c);
    applyOrder(trackId, list);
  }
  /** Write a new order back onto the track, laying clips end to end. */
  function applyOrder(trackId, orderedClips) {
    const start = S.clipsOn(trackId)[0] ? S.clipsOn(trackId)[0].start : 0;
    let t = q(start);
    for (const c of orderedClips) { c.start = t; t = q(t + c.dur); }
    S.bump();
  }
  /** Insert clips into a track at a slot index (used by drag-and-drop from the bin). */
  function insertAt(trackId, clips, index) {
    const list = S.clipsOn(trackId).filter(c => clips.indexOf(c) < 0);
    const i = clamp(index, 0, list.length);
    const out = list.slice(0, i).concat(clips, list.slice(i));
    clips.forEach(c => { c.track = trackId; if (FC.doc.clips.indexOf(c) < 0) FC.doc.clips.push(c); });
    S.bump(); applyOrder(trackId, out);
  }
  /** Swap two clips' positions, keeping the timeline geometry (each takes the other's slot). */
  function swap(a, b) {
    if (!a || !b || a === b) return;
    const list = S.clipsOn(a.track);
    const ia = list.indexOf(a), ib = list.indexOf(b);
    if (ia < 0 || ib < 0) return;
    list[ia] = b; list[ib] = a;
    applyOrder(a.track, list);
  }

  /* ── shuffles ──────────────────────────────────────────────────── */
  /** Shuffle the order; every clip keeps its own duration, only positions change. */
  function shuffleOrder(trackId, seed, onlyIds) {
    const list = S.clipsOn(trackId).slice();
    const rand = U.rng(seed);
    const movable = [], fixed = new Map();
    list.forEach((c, i) => {
      const eligible = (!onlyIds || onlyIds.has(c.id)) && !c.locked;
      if (eligible) movable.push(c); else fixed.set(i, c);
    });
    const mixed = U.shuffled(movable, rand);
    const out = []; let mi = 0;
    for (let i = 0; i < list.length; i++) out.push(fixed.has(i) ? fixed.get(i) : mixed[mi++]);
    applyOrder(trackId, out);
    return out.length;
  }
  /** Keep the slot grid (durations at each position) and shuffle which source lands where. */
  function shuffleContent(trackId, seed, onlyIds) {
    const list = S.clipsOn(trackId);
    const idx = [], slots = list.map(c => ({ start: c.start, dur: c.dur }));
    list.forEach((c, i) => { if ((!onlyIds || onlyIds.has(c.id)) && !c.locked) idx.push(i); });
    const src = idx.map(i => ({ assetId: list[i].assetId, in: list[i].in, name: list[i].name, color: list[i].color, kb: list[i].kb, tag: list[i].tag }));
    // assign shuffled sources onto the original, untouched slots
    const shuffledSrc = U.shuffled(src, U.rng(seed ^ 0x9e37));
    idx.forEach((slotIdx, k) => {
      const c = list[slotIdx], s = shuffledSrc[k];
      c.assetId = s.assetId; c.name = s.name; c.color = s.color; c.kb = s.kb; c.tag = s.tag;
      const a = S.assetById(s.assetId);
      c.in = a && a.kind === 'video' ? clamp(s.in, 0, Math.max(0, a.duration - c.dur)) : 0;
      refit(c);
    });
    list.forEach((c, i) => { c.start = slots[i].start; c.dur = slots[i].dur; });
    S.bump();
    return idx.length;
  }
  /** Rotate the running order by n positions. */
  function rotate(trackId, n) {
    const list = S.clipsOn(trackId).slice();
    if (list.length < 2) return;
    const k = ((n % list.length) + list.length) % list.length;
    applyOrder(trackId, list.slice(k).concat(list.slice(0, k)));
  }
  function reverse(trackId) { applyOrder(trackId, S.clipsOn(trackId).slice().reverse()); }

  /** Clamp a clip's source window to the asset it points at. */
  function refit(c) {
    const a = S.assetById(c.assetId); if (!a) return;
    if (a.kind === 'video' && a.duration > 0) {
      const maxDur = Math.max(frame(), a.duration - c.in);
      if (c.dur > maxDur + EPS) {
        // not enough source — pull the in point back before shortening
        const need = c.dur - maxDur;
        c.in = Math.max(0, q(c.in - need));
        const maxDur2 = Math.max(frame(), a.duration - c.in);
        if (c.dur > maxDur2) c.short = true; else delete c.short;
      } else delete c.short;
    }
  }

  /* ── trim / split / delete ─────────────────────────────────────── */
  /** edge: 'in'|'out'. mode: 'normal' (leaves a gap) | 'ripple' (shifts the rest). */
  function trim(clip, edge, deltaSec, mode) {
    const a = S.assetById(clip.assetId);
    const isStill = !a || a.kind !== 'video';
    let d = q(deltaSec);
    if (edge === 'in') {
      const maxRight = clip.dur - frame();
      const maxLeft = isStill ? Infinity : -clip.in;
      d = clamp(d, Math.max(-1e6, maxLeft), maxRight);
      clip.start = q(clip.start + d); clip.dur = q(clip.dur - d);
      if (!isStill) clip.in = q(clip.in + d * (clip.speed || 1));
    } else {
      const room = isStill ? Infinity : (a.duration - S.srcOut(clip));
      d = clamp(d, frame() - clip.dur, room);
      clip.dur = q(clip.dur + d);
    }
    // Our tracks are always butt-cut, so a ripple trim is simply "re-butt everything".
    if (mode === 'ripple') closeGaps(clip.track);
    S.bump();
    return d;
  }
  /** Slip: change the source window without moving the clip on the timeline. */
  function slip(clip, deltaSec) {
    const a = S.assetById(clip.assetId); if (!a || a.kind !== 'video') return 0;
    const d = clamp(q(deltaSec), -clip.in, Math.max(0, a.duration - S.srcOut(clip)));
    clip.in = q(clip.in + d); S.bump(); return d;
  }
  /** Roll: move the cut between two neighbours, total length unchanged. */
  function roll(left, right, deltaSec) {
    const aL = S.assetById(left.assetId), aR = S.assetById(right.assetId);
    let d = q(deltaSec);
    const roomR = (!aR || aR.kind !== 'video') ? Infinity : right.in;
    const roomL = (!aL || aL.kind !== 'video') ? Infinity : (aL.duration - S.srcOut(left));
    d = clamp(d, -(left.dur - frame()), Math.min(roomL, right.dur - frame(), roomR));
    left.dur = q(left.dur + d);
    right.start = q(right.start + d); right.dur = q(right.dur - d);
    if (aR && aR.kind === 'video') right.in = q(right.in + d);
    S.bump(); return d;
  }
  function split(clip, atTime) {
    const t = q(atTime);
    if (t <= clip.start + EPS || t >= clip.start + clip.dur - EPS) return null;
    const off = t - clip.start;
    const b = Object.assign({}, clip, {
      id: uid('clip'), start: t, dur: q(clip.dur - off),
      in: q(clip.in + off * (clip.speed || 1)), xf: null, fadeIn: 0
    });
    clip.dur = q(off); clip.fadeOut = 0;
    FC.doc.clips.push(b); S.bump();
    return b;
  }
  function deleteClips(ids, ripple) {
    const clips = FC.doc.clips.filter(c => ids.has ? ids.has(c.id) : ids.indexOf(c.id) >= 0);
    const byTrack = new Map();
    clips.forEach(c => { if (!byTrack.has(c.track)) byTrack.set(c.track, []); byTrack.get(c.track).push(c); });
    S.removeClips(clips.map(c => c.id));
    if (ripple) for (const t of byTrack.keys()) closeGaps(t);
    return clips.length;
  }

  /* ── transitions ───────────────────────────────────────────────── */
  /** Apply a transition on every Nth cut of a track. Returns a report of what fit. */
  function applyTransitions(trackId, type, durSec, every) {
    const list = S.clipsOn(trackId);
    const rep = { applied: 0, shortened: 0, skipped: 0, cuts: Math.max(0, list.length - 1) };
    for (let i = 1; i < list.length; i++) {
      const cur = list[i], prev = list[i - 1];
      if (every > 1 && (i % every) !== 0) { cur.xf = null; continue; }
      if (type === 'none') { cur.xf = null; continue; }
      const hPrev = S.handles(prev), hCur = S.handles(cur);
      const room = Math.min(hPrev.tail, hCur.head) * 2;         // centred: half comes from each side
      const cap = Math.min(prev.dur, cur.dur) * 0.9;
      let d = Math.min(durSec, cap, room);
      d = Math.max(0, q(d));
      if (d < 2 / fps()) { cur.xf = null; rep.skipped++; continue; }
      if (d < durSec - EPS) rep.shortened++;
      cur.xf = { type, dur: d, align: 'center' };
      rep.applied++;
    }
    S.bump();
    return rep;
  }

  /* ── fit helpers ───────────────────────────────────────────────── */
  /** Scale every clip on a track so the track lands exactly on `target` seconds. */
  function fitTrackTo(trackId, target) {
    const list = S.clipsOn(trackId);
    const total = list.reduce((s, c) => s + c.dur, 0);
    if (!total || !target) return;
    const k = target / total;
    for (const c of list) {
      const a = S.assetById(c.assetId);
      let d = q(Math.max(frame(), c.dur * k));
      if (a && a.kind === 'video') {
        const room = a.duration - c.in;
        if (d > room) { c.in = Math.max(0, q(c.in - (d - room))); }
        d = Math.min(d, Math.max(frame(), a.duration - c.in));
      }
      c.dur = d;
    }
    relayout(trackId, list.length ? list[0].start : 0);
    // absorb rounding on the last clip
    const end = trackEnd(trackId), last = S.clipsOn(trackId).slice(-1)[0];
    if (last && Math.abs(end - target) > EPS) last.dur = q(Math.max(frame(), last.dur + (target - end)));
    S.bump();
  }
  /** Even out every clip on a track to the same duration. */
  function evenOut(trackId, dur) {
    const list = S.clipsOn(trackId);
    for (const c of list) { c.dur = q(Math.max(frame(), dur)); refit(c); }
    relayout(trackId, list.length ? list[0].start : 0);
  }

  FC.ops = {
    q, frame, relayout, closeGaps, resolveOverlaps, trackEnd, snapPoints, snapTo,
    clipFromAsset, moveBy, reorder, applyOrder, insertAt, swap,
    shuffleOrder, shuffleContent, rotate, reverse, refit,
    trim, slip, roll, split, deleteClips, applyTransitions, fitTrackTo, evenOut
  };
})(window.FC);
