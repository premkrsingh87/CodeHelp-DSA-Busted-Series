/* FluxCut Studio — the Director: turns a pile of media into a cut sequence.
   Deterministic: the same seed + the same settings always produce the same edit,
   so "re-roll" is a dial you can turn back. */
(function (FC) {
  'use strict';
  const U = FC.util, S = FC.store, O = FC.ops, { clamp } = U;

  /* ── source ordering ───────────────────────────────────────────── */
  function orderAssets(assets, mode, rand) {
    const a = assets.slice();
    switch (mode) {
      case 'name': return a.sort((x, y) => x.name.localeCompare(y.name, undefined, { numeric: true }));
      case 'dur-desc': return a.sort((x, y) => (y.duration || 0) - (x.duration || 0));
      case 'dur-asc': return a.sort((x, y) => (x.duration || 0) - (y.duration || 0));
      case 'random': return U.shuffled(a, rand);
      case 'alternate': {                       // round-robin across folders so sources interleave
        const groups = new Map();
        for (const x of a) {
          const g = (x.rel || x.name).split('/').slice(0, -1).join('/') || '·';
          if (!groups.has(g)) groups.set(g, []); groups.get(g).push(x);
        }
        const lists = Array.from(groups.values()).map(l => U.shuffled(l, rand));
        const out = []; let i = 0, left = a.length;
        while (left > 0) { for (const l of lists) { if (l[i]) { out.push(l[i]); left--; } } i++; if (i > 5000) break; }
        return out;
      }
      default: return a;                        // bin order
    }
  }

  /* ── slot durations ────────────────────────────────────────────── */
  /** Returns a function (index, asset, total) -> duration in seconds. */
  function durationPlanner(b, rand, beats, targetTotal, estCount) {
    const pat = String(b.patternStr || '2,2,4').split(/[,\s]+/).map(parseFloat).filter(x => x > 0);
    let beatIdx = 0;
    return function (i, asset, tSoFar) {
      switch (b.pattern) {
        case 'full': return asset.kind === 'video' ? asset.duration : b.stillDur;
        case 'fixed': return b.fixed;
        case 'range': return U.lerp(b.min, b.max, rand());
        case 'pattern': return pat.length ? pat[i % pat.length] : b.fixed;
        case 'accel': { const t = estCount > 1 ? i / (estCount - 1) : 0; return U.lerp(b.accelFrom, b.accelTo, t); }
        case 'decel': { const t = estCount > 1 ? i / (estCount - 1) : 0; return U.lerp(b.accelTo, b.accelFrom, t); }
        case 'beat': {
          if (beats && beats.length > 2) {
            // walk the beat grid from where we are, n beats at a time
            let k = 0; while (k < beats.length - 1 && beats[k] <= tSoFar + 1e-3) k++;
            const n = Math.max(1, b.beatsPer | 0);
            const endIdx = Math.min(beats.length - 1, k + n - 1);
            const d = beats[endIdx] - tSoFar;
            if (d > 0.05) return d;
          }
          const bpm = FC.doc.bpm || 120;
          return (60 / bpm) * Math.max(1, b.beatsPer | 0);
        }
        default: return b.fixed;
      }
    };
  }

  /* ── source window picking ─────────────────────────────────────── */
  function pickIn(a, dur, take, rand, useCount, b) {
    if (a.kind !== 'video') return 0;
    const total = a.duration || 0;
    if (total <= dur) return 0;
    const pad = clamp((b.avoidHeadTail || 0) / 100, 0, 0.4) * total;
    const lo = Math.min(pad, Math.max(0, total - dur));
    const hi = Math.max(lo, total - dur - pad);
    switch (take) {
      case 'start': return lo;
      case 'end': return Math.max(lo, total - dur - 0.01);
      case 'random': return lo + rand() * Math.max(0, hi - lo);
      case 'spread': {                    // each reuse of a source walks further along it
        const slots = Math.max(1, Math.floor((hi - lo) / Math.max(0.2, dur)) + 1);
        const k = useCount % slots;
        return clamp(lo + k * ((hi - lo) / Math.max(1, slots - 1 || 1)), lo, hi);
      }
      default: return clamp((total - dur) / 2, lo, hi);   // centre
    }
  }

  function kenBurns(rand, amount) {
    const dirs = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
    const d = dirs[Math.floor(rand() * 4)];
    const z = 1 + (amount || 12) / 100;
    const zoomIn = rand() > 0.5;
    return {
      fromScale: zoomIn ? 100 : 100 * z, toScale: zoomIn ? 100 * z : 100,
      fromX: 0, toX: d[0] * (amount || 12) * 0.35, fromY: 0, toY: d[1] * (amount || 12) * 0.2
    };
  }

  /* ── target length ─────────────────────────────────────────────── */
  function audioLength() {
    let m = 0;
    for (const t of S.audioTracks())
      for (const c of S.clipsOn(t.id)) m = Math.max(m, c.start + c.dur);
    return m;
  }
  function resolveTarget(b) {
    if (b.target === 'time') return Math.max(1, b.targetTime || 60);
    if (b.target === 'audio') { const l = audioLength(); return l > 0.1 ? l : 0; }
    return 0;   // 0 = "use the media, however long that turns out"
  }

  /* ── build ─────────────────────────────────────────────────────── */
  function build(opts) {
    opts = opts || {};
    const b = Object.assign({}, FC.doc.build, opts.build || {});
    const track = opts.track || S.mainTrack();
    if (!track) return { error: 'No video track' };

    let pool = opts.assets || pickPool();
    pool = pool.filter(a => a.kind !== 'audio' && !a.broken);
    if (!pool.length) return { error: 'Add some video or image files first' };

    const rand = U.rng(b.seed || 1);
    const ordered = orderAssets(pool, b.order, rand);
    const target = resolveTarget(b);
    const beats = beatGrid();

    // rough count so accel/decel can shape the whole run
    const avg = b.pattern === 'full'
      ? (pool.reduce((s, a) => s + (a.kind === 'video' ? a.duration : b.stillDur), 0) / pool.length)
      : b.pattern === 'range' ? (b.min + b.max) / 2
        : b.pattern === 'pattern' ? (String(b.patternStr).split(',').map(parseFloat).filter(x => x > 0).reduce((s, x) => s + x, 0) / Math.max(1, String(b.patternStr).split(',').length))
          : b.fixed;
    const estCount = target ? Math.max(1, Math.round(target / Math.max(0.2, avg))) : ordered.length;
    const plan = durationPlanner(b, rand, beats, target, estCount);

    // keep locked clips exactly where they are
    const kept = b.respectLocks ? S.clipsOn(track.id).filter(c => c.locked) : [];
    const keptIds = new Set(kept.map(c => c.id));

    const useCount = new Map();
    const out = [];
    let t = 0, i = 0, guard = 0, lastAsset = null;
    const maxClips = 4000;

    while (guard++ < maxClips) {
      // stop conditions
      if (target) { if (t >= target - 1e-3) break; }
      else if (i >= ordered.length) break;
      if (!target && i >= ordered.length) break;
      if (target && !b.loopPool && i >= ordered.length) break;

      let a = ordered[i % ordered.length];
      if (b.noRepeat && ordered.length > 1 && lastAsset && a.id === lastAsset.id) {
        a = ordered[(i + 1) % ordered.length]; i++;
      }
      const n = useCount.get(a.id) || 0;

      let d = plan(out.length, a, t);
      if (b.jitter) d *= 1 + (rand() - 0.5) * 2 * (b.jitter / 100);
      d = Math.max(b.minClip || 0.4, d);
      if (a.kind === 'video' && b.pattern !== 'full') d = Math.min(d, Math.max(b.minClip || 0.4, a.duration));
      if (a.kind === 'video' && b.pattern === 'full') d = a.duration;
      if (target && t + d > target) d = target - t;                 // last clip lands exactly on target
      if (d < (b.minClip || 0.4) * 0.5 && out.length) break;
      d = O.q(d);
      if (d <= 0) break;

      const inp = pickIn(a, d, b.take, rand, n, b);
      const clip = O.clipFromAsset(a, { track: track.id, start: t, dur: d, in: inp });
      if (a.kind !== 'video' && b.kenBurns) clip.kb = kenBurns(rand, b.kbAmount);
      out.push(clip);
      useCount.set(a.id, n + 1);
      lastAsset = a; t = O.q(t + clip.dur); i++;
    }

    // commit
    S.begin('Auto-build');
    const others = FC.doc.clips.filter(c => c.track !== track.id || keptIds.has(c.id));
    FC.doc.clips = others.concat(out);
    S.bump();
    if (kept.length) reflowAroundLocked(track.id);
    if (b.xfType && b.xfType !== 'none') O.applyTransitions(track.id, b.xfType, b.xfDur, b.xfEvery || 1);
    rebuildOverlays();
    S.commit('Auto-build');

    return { clips: out.length, duration: O.trackEnd(track.id), target, pool: pool.length };
  }

  /** Locked clips are anchors: everything else flows around them. */
  function reflowAroundLocked(trackId) {
    const list = S.clipsOn(trackId);
    let t = 0;
    for (const c of list) {
      if (c.locked) { t = Math.max(t, c.start + c.dur); continue; }
      c.start = O.q(t); t = O.q(t + c.dur);
      // if we now sit on top of a locked clip, jump past it
      for (const l of list) if (l.locked && c.start < l.start + l.dur - 1e-6 && c.start + c.dur > l.start + 1e-6) { c.start = O.q(l.start + l.dur); t = O.q(c.start + c.dur); }
    }
    S.bump();
  }

  function pickPool() {
    const selIds = S.sel.assets;
    const all = FC.doc.assets.filter(a => a.kind !== 'audio');
    if (selIds && selIds.size) { const s = all.filter(a => selIds.has(a.id)); if (s.length) return s; }
    return all;
  }

  function beatGrid() {
    if (FC.doc.audioBeats && FC.doc.audioBeats.length) return FC.doc.audioBeats;
    for (const t of S.audioTracks())
      for (const c of S.clipsOn(t.id)) {
        const w = FC.media.getWave(c.assetId);
        if (w && w.beats && w.beats.length > 2) return w.beats.map(x => O.q(x + c.start - c.in));
      }
    return null;
  }

  /* ── overlays ──────────────────────────────────────────────────── */
  const OVERLAY_DEFAULT = {
    mode: 'cover', every: 8, dur: 3, gap: 0, opacity: 45, blend: 'screen',
    fadeIn: 0.25, fadeOut: 0.25, seed: 7, perMinute: 6, offset: 0, jitter: 0, enabled: true, scaleFit: 'fill'
  };
  function addOverlayRule(assetId, trackId, patch) {
    const r = Object.assign({ id: U.uid('ov'), assetId, track: trackId }, OVERLAY_DEFAULT, patch || {});
    FC.doc.overlays.push(r);
    return r;
  }
  /** Rebuild every overlay track from its rule — cheap, so it re-runs on any timeline change. */
  function rebuildOverlays() {
    const seqDur = mainDuration();
    const ruleTracks = new Set(FC.doc.overlays.map(r => r.track));
    // clear generated clips (manual ones are marked man:true and survive)
    FC.doc.clips = FC.doc.clips.filter(c => !(ruleTracks.has(c.track) && c.gen));
    for (const r of FC.doc.overlays) {
      if (!r.enabled) continue;
      const a = S.assetById(r.assetId); if (!a) continue;
      const t = S.trackById(r.track); if (!t) continue;
      const rand = U.rng(r.seed || 1);
      const spans = [];
      const unit = a.kind === 'video' ? Math.max(0.1, a.duration) : Math.max(0.2, r.dur);
      if (r.mode === 'cover') {
        let x = r.offset || 0, guard = 0;
        while (x < seqDur - 0.02 && guard++ < 2000) {
          const d = Math.min(unit, seqDur - x);
          spans.push([x, d, 0]); x += d + (r.gap || 0);
        }
      } else if (r.mode === 'interval') {
        let x = r.offset || 0, guard = 0;
        while (x < seqDur - 0.02 && guard++ < 2000) {
          const jit = r.jitter ? (rand() - 0.5) * 2 * r.jitter : 0;
          const st = clamp(x + jit, 0, Math.max(0, seqDur - 0.05));
          spans.push([st, Math.min(r.dur, unit, seqDur - st), 0]);
          x += Math.max(0.2, r.every);
        }
      } else if (r.mode === 'cuts') {
        const main = S.mainTrack();
        const cuts = main ? S.clipsOn(main.id).slice(1).map(c => c.start) : [];
        for (const cu of cuts) {
          const st = clamp(cu + (r.offset || 0), 0, Math.max(0, seqDur - 0.05));
          spans.push([st, Math.min(r.dur, unit, seqDur - st), 0]);
        }
      } else if (r.mode === 'random') {
        const n = Math.max(1, Math.round((seqDur / 60) * (r.perMinute || 6)));
        for (let k = 0; k < n; k++) {
          const st = rand() * Math.max(0, seqDur - r.dur);
          spans.push([st, Math.min(r.dur, unit, seqDur - st), rand() * Math.max(0, (a.duration || 0) - r.dur)]);
        }
        spans.sort((x, y) => x[0] - y[0]);
      }
      for (const [st, d, srcIn] of spans) {
        if (d <= 0.02) continue;
        const c = O.clipFromAsset(a, { track: r.track, start: O.q(st), dur: O.q(d), in: srcIn || 0 });
        c.gen = true; c.ruleId = r.id;
        c.opacity = r.opacity; c.blend = r.blend;
        c.fadeIn = r.fadeIn; c.fadeOut = r.fadeOut;
        c.motion = { fit: r.scaleFit || 'fill' };
        FC.doc.clips.push(c);
      }
    }
    S.bump();
  }
  function mainDuration() {
    const m = S.mainTrack();
    let d = m ? O.trackEnd(m.id) : 0;
    if (!d) d = S.duration();
    return d;
  }

  /* ── one-shot helpers used by the UI ───────────────────────────── */
  function reshuffle(mode) {
    const t = S.mainTrack(); if (!t) return 0;
    const b = FC.doc.build;
    const only = S.sel.clips.size > 1 ? S.sel.clips : null;
    S.begin('Reshuffle');
    b.seed = (b.seed | 0) + 1;
    const n = mode === 'content' ? O.shuffleContent(t.id, b.seed, only) : O.shuffleOrder(t.id, b.seed, only);
    rebuildOverlays();
    S.commit('Reshuffle');
    return n;
  }
  /** Spread one long source across the whole timeline as N separate takes. */
  function explode(asset, count, dur, trackId) {
    const t = S.trackById(trackId) || S.mainTrack();
    const b = FC.doc.build, rand = U.rng(b.seed || 1);
    S.begin('Explode source');
    const clips = [];
    let start = O.trackEnd(t.id);
    for (let i = 0; i < count; i++) {
      const inp = pickIn(asset, dur, 'spread', rand, i, b);
      const c = O.clipFromAsset(asset, { track: t.id, start, dur, in: inp });
      FC.doc.clips.push(c); clips.push(c); start = O.q(start + dur);
    }
    S.bump(); S.commit('Explode source');
    return clips.length;
  }

  FC.director = {
    build, reshuffle, rebuildOverlays, addOverlayRule, OVERLAY_DEFAULT,
    orderAssets, pickIn, kenBurns, resolveTarget, audioLength, beatGrid, explode, mainDuration, pickPool
  };
})(window.FC);
