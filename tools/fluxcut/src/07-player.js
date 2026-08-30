/* FluxCut Studio — program monitor.
   Plays the *timeline* (not a file): a small pool of <video> elements is
   scheduled ahead of the playhead and composited onto one canvas, so
   overlays, opacity, blend modes and dissolves are what you actually see. */
(function (FC) {
  'use strict';
  const U = FC.util, S = FC.store, O = FC.ops, { clamp, el, $ } = U;

  const P = {
    time: 0, playing: false, rate: 1, loop: false, quality: 0.5,
    srcAudio: false, guides: false, dropped: 0, fps: 0, scrubbing: false
  };
  let cv, cx, cw = 960, ch = 540, wall = 0, tAtWall = 0, lastDraw = 0, frames = 0, fpsT = 0;
  const PREROLL = 1.1;

  /* ── element pools ─────────────────────────────────────────────── */
  const vslots = [], aslots = [];
  const NV = 4, NA = 2;
  function mkVideo() {
    const v = el('video', { preload: 'auto', playsinline: '', muted: '' });
    v.muted = true; v.crossOrigin = 'anonymous'; v.style.display = 'none';
    v.addEventListener('error', () => { v._bad = true; });
    document.body.appendChild(v);
    return { v, assetId: null, use: 0, ready: false };
  }
  function mkAudio() {
    const a = new Audio(); a.preload = 'auto'; a.crossOrigin = 'anonymous';
    return { v: a, assetId: null, use: 0, ready: false, node: null };
  }
  function pool() {
    while (vslots.length < NV) vslots.push(mkVideo());
    while (aslots.length < NA) aslots.push(mkAudio());
  }

  function acquire(list, assetId, pinned) {
    let s = list.find(x => x.assetId === assetId);
    if (s) { s.use = performance.now(); return s; }
    let free = null, oldest = Infinity;
    for (const x of list) { if (pinned && pinned.has(x.assetId)) continue; if (x.use < oldest) { oldest = x.use; free = x; } }
    if (!free) free = list[0];
    if (free.assetId) FC.media.pinUrl(free.assetId, false);
    const url = FC.media.urlFor(assetId);
    if (!url) return null;
    FC.media.pinUrl(assetId, true);
    free.assetId = assetId; free.ready = false; free.use = performance.now();
    free.v.pause();
    free.v.src = url;
    free.v.addEventListener('loadeddata', () => { free.ready = true; }, { once: true });
    try { free.v.load(); } catch (e) { }
    return free;
  }

  /* ── still cache ───────────────────────────────────────────────────
     Byte-budgeted, least-recently-*used* eviction, and a bitmap that is on
     screen this frame is never closed — closing one mid-draw is what made
     stills flicker back to thumbnail resolution. */
  const imgCache = new Map();       // assetId -> {bm, bytes, t}
  const imgPending = new Set();
  const onScreen = new Set();
  let imgBytes = 0;
  const IMG_BUDGET = 180 * 1024 * 1024;

  function image(a) {
    const e = imgCache.get(a.id);
    if (e) { e.t = performance.now(); imgCache.delete(a.id); imgCache.set(a.id, e); return e.bm; }
    decodeImage(a);
    return FC.media.poster(a);      // thumbnail stands in until the full decode lands
  }
  function decodeImage(a) {
    if (!a || a.kind !== 'image' || imgCache.has(a.id) || imgPending.has(a.id)) return;
    const url = FC.media.urlFor(a.id); if (!url) return;
    imgPending.add(a.id);
    const targetW = Math.round(Math.min(a.w || 1920, Math.max(720, cw * 1.3)));
    fetch(url).then(r => r.blob())
      .then(bl => createImageBitmap(bl, { resizeWidth: targetW, resizeQuality: 'medium' }))
      .then(bm => { imgPending.delete(a.id); putImage(a.id, bm); if (!P.playing) draw(); })
      .catch(() => imgPending.delete(a.id));
  }
  function putImage(id, bm) {
    const bytes = (bm.width || 1) * (bm.height || 1) * 4;
    imgCache.set(id, { bm, bytes, t: performance.now() }); imgBytes += bytes;
    while (imgBytes > IMG_BUDGET && imgCache.size > 3) {
      let victim = null;
      for (const k of imgCache.keys()) if (!onScreen.has(k)) { victim = k; break; }
      if (victim == null) break;
      const e = imgCache.get(victim); imgCache.delete(victim); imgBytes -= e.bytes;
      if (e.bm.close) e.bm.close();
    }
  }
  /** Decode the stills the playhead is about to reach, so they never pop in. */
  function prefetchStills(t) {
    let budget = 3;
    for (const tr of S.videoTracks()) {
      if (!tr.enabled) continue;
      for (const c of S.clipsOn(tr.id)) {
        if (c.start + c.dur < t) continue;
        if (c.start > t + 14) break;
        const a = S.assetById(c.assetId);
        if (a && a.kind === 'image' && !imgCache.has(a.id) && !imgPending.has(a.id)) { decodeImage(a); if (--budget <= 0) return; }
      }
    }
  }

  /* ── init ──────────────────────────────────────────────────────── */
  function init() {
    cv = $('#monitor'); if (!cv) return;
    cx = cv.getContext('2d', { alpha: false, desynchronized: true });
    pool(); applyQuality();
    new ResizeObserver(() => { fitMonitor(); draw(); }).observe(cv.parentElement);
    U.bus.on('doc', () => { if (!P.playing) draw(); });
    U.bus.on('seq', applyQuality);
    requestAnimationFrame(tick);
  }
  function applyQuality() {
    const d = FC.doc;
    cw = Math.max(160, Math.round(d.width * P.quality));
    ch = Math.max(90, Math.round(d.height * P.quality));
    if (cv) { cv.width = cw; cv.height = ch; }
    fitMonitor();
    draw();
  }
  /** Letterbox the monitor by hand — CSS max-width + max-height together
      break the aspect ratio, which silently stretches the picture. */
  function fitMonitor() {
    if (!cv || !cv.parentElement) return;
    const r = cv.parentElement.getBoundingClientRect();
    const availW = Math.max(40, r.width - 16), availH = Math.max(30, r.height - 16);
    const k = Math.min(availW / FC.doc.width, availH / FC.doc.height);
    cv.style.width = Math.floor(FC.doc.width * k) + 'px';
    cv.style.height = Math.floor(FC.doc.height * k) + 'px';
  }

  /* ── transport ─────────────────────────────────────────────────── */
  function play() {
    if (P.playing) return;
    if (S.duration() <= 0) return U.toast('Nothing to play yet — build a sequence first', 'warn');
    if (P.time >= S.duration() - 1e-3) P.time = 0;
    P.playing = true; wall = performance.now(); tAtWall = P.time;
    ensureAudioCtx();
    U.bus.emit('play', true);
  }
  function pause() {
    if (!P.playing) return;
    P.playing = false;
    vslots.forEach(s => { try { s.v.pause(); } catch (e) { } });
    aslots.forEach(s => { try { s.v.pause(); } catch (e) { } });
    U.bus.emit('play', false);
  }
  function toggle() { P.playing ? pause() : play(); }
  let syncQueued = false;
  function seek(t) {
    P.time = clamp(t, 0, Math.max(0, S.duration()));
    tAtWall = P.time; wall = performance.now();
    U.bus.emit('time', P.time);
    if (!P.playing) requestSync();
  }
  /** Scrubbing fires dozens of seeks a second; collapse the media work into
      one per animation frame, and draw from thumbnails while the drag is live. */
  function requestSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      if (!P.scrubbing) { syncAll(); prefetchStills(P.time); }
      draw();
    });
  }
  function setScrubbing(on) {
    P.scrubbing = on;
    if (!on) requestSync();
  }
  function step(n) { seek(P.time + n / S.fps()); }
  function setRate(r) { P.rate = r; tAtWall = P.time; wall = performance.now(); }

  /* ── frame loop ────────────────────────────────────────────────── */
  function tick(now) {
    if (P.playing) {
      const dt = (now - wall) / 1000;
      let t = tAtWall + dt * P.rate;
      const D = S.duration();
      if (t >= D) { if (P.loop) { t = 0; tAtWall = 0; wall = now; } else { t = D; pause(); } }
      if (t < 0) { t = 0; tAtWall = 0; wall = now; }
      P.time = t;
      U.bus.emit('time', t);
      schedule();
      if ((frames & 15) === 0) prefetchStills(t);
      draw();
    }
    frames++;
    if (now - fpsT > 500) { P.fps = Math.round(frames * 1000 / (now - fpsT)); frames = 0; fpsT = now; U.bus.emit('pfps'); }
    requestAnimationFrame(tick);
  }

  /* ── what is on screen right now ───────────────────────────────── */
  /** Render list, bottom track first. Each entry: {clip, asset, alpha, src} */
  function renderList(t) {
    const out = [];
    for (const tr of S.videoTracks()) {
      if (!tr.enabled) continue;
      const list = S.clipsOn(tr.id);
      let cur = null, prev = null, mixT = 0;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (t >= c.start - 1e-6 && t < c.start + c.dur) { cur = c; prev = list[i - 1] || null; break; }
      }
      if (!cur) continue;
      if (!cur.enabled) continue;
      let alphaPrev = 0;
      if (cur.xf && cur.xf.dur > 0 && prev) {
        const half = cur.xf.dur / 2;
        if (t < cur.start + half) { mixT = (t - (cur.start - half)) / cur.xf.dur; alphaPrev = 1 - clamp(mixT, 0, 1); }
      }
      // the outgoing clip is still on screen for the back half of its own transition
      const nxt = list[list.indexOf(cur) + 1];
      if (nxt && nxt.xf && nxt.xf.dur > 0) {
        const half = nxt.xf.dur / 2;
        if (t > nxt.start - half) {
          const p = (t - (nxt.start - half)) / nxt.xf.dur;
          out.push(item(cur, t, 1));
          out.push(item(nxt, t, clamp(p, 0, 1), true));
          continue;
        }
      }
      if (alphaPrev > 0 && prev) out.push(item(prev, t, alphaPrev, false, true));
      out.push(item(cur, t, alphaPrev > 0 ? 1 - alphaPrev : 1));
    }
    return out.filter(Boolean);
  }
  function item(c, t, mix, early, tail) {
    const a = S.assetById(c.assetId); if (!a) return null;
    let local = t - c.start;
    if (early) local = Math.max(0, local);          // pre-rolling the incoming clip
    if (tail) local = Math.min(c.dur - 1e-3, local + 0);
    const src = c.in + clamp(local, 0, c.dur) * (c.speed || 1);
    let alpha = (c.opacity == null ? 100 : c.opacity) / 100;
    if (c.fadeIn > 0 && local < c.fadeIn) alpha *= clamp(local / c.fadeIn, 0, 1);
    if (c.fadeOut > 0 && local > c.dur - c.fadeOut) alpha *= clamp((c.dur - local) / c.fadeOut, 0, 1);
    return { clip: c, asset: a, src, alpha, mix: mix == null ? 1 : mix, local };
  }

  function audioList(t) {
    const out = [];
    for (const tr of S.audioTracks()) {
      if (!tr.enabled || tr.mute) continue;
      const c = S.clipAt(tr.id, t);
      if (c) out.push(item(c, t, 1));
    }
    return out.filter(Boolean);
  }

  /* ── scheduling media elements ─────────────────────────────────── */
  function schedule() {
    const t = P.time;
    const items = renderList(t).filter(i => i.asset.kind === 'video');
    const pinned = new Set(items.map(i => i.asset.id));
    // pre-roll: whatever starts within PREROLL seconds gets a slot early
    const soon = [];
    for (const tr of S.videoTracks()) {
      if (!tr.enabled) continue;
      for (const c of S.clipsOn(tr.id)) {
        if (c.start > t && c.start < t + PREROLL) {
          const a = S.assetById(c.assetId);
          if (a && a.kind === 'video') soon.push({ clip: c, asset: a });
        }
        if (c.start > t + PREROLL) break;
      }
    }
    for (const it of items) {
      const s = acquire(vslots, it.asset.id, pinned); if (!s) continue;
      syncSlot(s, it, true);
    }
    for (const it of soon.slice(0, 2)) {
      if (pinned.has(it.asset.id)) continue;
      const s = acquire(vslots, it.asset.id, pinned);
      if (s && s.ready && Math.abs(s.v.currentTime - it.clip.in) > 0.4) { try { s.v.currentTime = it.clip.in; s.v.pause(); } catch (e) { } }
    }
    // audio
    const al = audioList(t);
    const apin = new Set(al.map(i => i.asset.id));
    for (const it of al) {
      const s = acquire(aslots, it.asset.id, apin); if (!s) continue;
      syncSlot(s, it, true, true);
      s.v.volume = clamp(Math.pow(10, (it.clip.volume || 0) / 20) * it.alpha, 0, 1);
    }
    for (const s of aslots) if (!apin.has(s.assetId) && !s.v.paused) s.v.pause();
    for (const s of vslots) {
      const on = pinned.has(s.assetId);
      s.v.muted = !(P.srcAudio && on);
      if (!on && !s.v.paused) s.v.pause();
    }
  }

  function syncSlot(s, it, wantPlay, isAudio) {
    const v = s.v;
    if (!s.ready && v.readyState < 2) return;
    const want = it.src;
    const drift = v.currentTime - want;
    if (!isFinite(v.duration)) return;
    if (Math.abs(drift) > (P.playing ? 0.34 : 0.04)) {
      try { v.currentTime = clamp(want, 0, Math.max(0, v.duration - 0.02)); } catch (e) { }
      P.dropped++;
    }
    const rate = clamp((it.clip.speed || 1) * Math.abs(P.rate), 0.0625, 16);
    if (Math.abs(v.playbackRate - rate) > 0.01) { try { v.playbackRate = rate; } catch (e) { } }
    if (P.playing && wantPlay && P.rate > 0) { if (v.paused) v.play().catch(() => { }); }
    else if (!v.paused) v.pause();
  }
  function syncAll(hard) {
    const items = renderList(P.time);
    const pinned = new Set(items.filter(i => i.asset.kind === 'video').map(i => i.asset.id));
    for (const it of items) {
      if (it.asset.kind !== 'video') continue;
      // during a scrub, only touch decoders that already hold this asset
      if (P.scrubbing && !vslots.some(x => x.assetId === it.asset.id)) continue;
      const s = acquire(vslots, it.asset.id, pinned);
      if (s) { try { if (s.v.readyState >= 1) s.v.currentTime = clamp(it.src, 0, Math.max(0, s.v.duration - 0.02)); } catch (e) { } }
    }
    const al = audioList(P.time);
    for (const it of al) { const s = acquire(aslots, it.asset.id); if (s) { try { s.v.currentTime = it.src; } catch (e) { } } }
  }

  /* ── audio analyser for the VU meter ───────────────────────────── */
  let actx = null, analyser = null, buf = null;
  function ensureAudioCtx() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      actx = new AC();
      analyser = actx.createAnalyser(); analyser.fftSize = 256;
      buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.connect(actx.destination);
      for (const s of aslots) { s.node = actx.createMediaElementSource(s.v); s.node.connect(analyser); }
    } catch (e) { actx = null; }
  }
  function level() {
    if (!analyser) return 0;
    analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i] - 128) / 128; if (v > peak) peak = v; }
    return peak;
  }

  /* ── compositing ───────────────────────────────────────────────── */
  const BLEND = { normal: 'source-over', screen: 'screen', multiply: 'multiply', overlay: 'overlay', lighten: 'lighten', darken: 'darken', 'soft-light': 'soft-light', 'hard-light': 'hard-light', 'color-dodge': 'color-dodge', difference: 'difference', exclusion: 'exclusion', add: 'lighter' };

  function draw() {
    if (!cx) return;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
    cx.fillStyle = '#000'; cx.fillRect(0, 0, cw, ch);
    const items = renderList(P.time);
    onScreen.clear();
    for (const it of items) if (it.asset.kind === 'image') onScreen.add(it.asset.id);
    let painted = 0;
    for (const it of items) {
      const c = it.clip, a = it.asset;
      let alpha = it.alpha * it.mix;
      if (alpha <= 0.002) continue;
      let src = null;
      if (a.kind === 'video') {
        const s = vslots.find(x => x.assetId === a.id);
        if (s && s.v.readyState >= 2) src = s.v;
        else src = FC.media.thumb(a, it.src);
      } else if (a.kind === 'image') src = image(a);
      if (!src) continue;
      const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
      if (!sw || !sh) continue;

      cx.save();
      cx.globalAlpha = clamp(alpha, 0, 1);
      cx.globalCompositeOperation = painted === 0 ? 'source-over' : (BLEND[c.blend] || 'source-over');
      // Ken Burns / motion
      let scale = 1, ox = 0, oy = 0;
      if (c.kb) {
        const p = clamp(it.local / Math.max(0.001, c.dur), 0, 1);
        scale = U.lerp(c.kb.fromScale, c.kb.toScale, p) / 100;
        ox = U.lerp(c.kb.fromX, c.kb.toX, p) / 100 * cw;
        oy = U.lerp(c.kb.fromY, c.kb.toY, p) / 100 * ch;
      }
      if (c.motion) {
        scale *= (c.motion.scale != null ? c.motion.scale / 100 : 1);
        ox += (c.motion.x || 0) / 100 * cw; oy += (c.motion.y || 0) / 100 * ch;
      }
      const fit = (c.motion && c.motion.fit) || 'fill';
      const base = fit === 'fit' ? Math.min(cw / sw, ch / sh) : fit === 'stretch' ? 0 : Math.max(cw / sw, ch / sh);
      let dw, dh;
      if (base === 0) { dw = cw; dh = ch; } else { dw = sw * base * scale; dh = sh * base * scale; }
      cx.drawImage(src, (cw - dw) / 2 + ox, (ch - dh) / 2 + oy, dw, dh);
      cx.restore();
      painted++;
    }
    cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
    if (P.guides) drawGuides();
    if (!painted) { cx.fillStyle = '#000'; cx.fillRect(0, 0, cw, ch); }
    lastDraw = performance.now();
    const hint = $('#monHint'); if (hint) hint.style.display = painted ? 'none' : 'grid';
  }

  function drawGuides() {
    cx.save();
    cx.strokeStyle = 'rgba(255,255,255,.32)'; cx.lineWidth = 1;
    cx.strokeRect(cw * .05, ch * .05, cw * .9, ch * .9);        // action safe
    cx.strokeStyle = 'rgba(255,255,255,.22)';
    cx.strokeRect(cw * .1, ch * .1, cw * .8, ch * .8);          // title safe
    cx.setLineDash([4, 5]); cx.strokeStyle = 'rgba(255,255,255,.14)';
    cx.beginPath();
    cx.moveTo(cw / 3, 0); cx.lineTo(cw / 3, ch); cx.moveTo(cw * 2 / 3, 0); cx.lineTo(cw * 2 / 3, ch);
    cx.moveTo(0, ch / 3); cx.lineTo(cw, ch / 3); cx.moveTo(0, ch * 2 / 3); cx.lineTo(cw, ch * 2 / 3);
    cx.stroke(); cx.restore();
  }

  /* ── public ────────────────────────────────────────────────────── */
  Object.assign(P, {
    init, play, pause, toggle, seek, step, setRate, draw, level, fitMonitor, setScrubbing, prefetchStills,
    setQuality(q) { P.quality = q; applyQuality(); },
    currentClip() { const m = S.mainTrack(); return m ? S.clipAt(m.id, P.time) : null; },
    stats() { return { slots: vslots.filter(s => s.assetId).length, images: imgCache.size, imageBytes: imgBytes, dropped: P.dropped, fps: P.fps }; },
    releaseAll() {
      vslots.forEach(s => { if (s.assetId) FC.media.pinUrl(s.assetId, false); s.assetId = null; s.v.removeAttribute('src'); s.v.load(); });
      aslots.forEach(s => { s.assetId = null; s.v.removeAttribute('src'); });
      imgCache.forEach(e => e.bm && e.bm.close && e.bm.close()); imgCache.clear(); imgBytes = 0;
    }
  });
  FC.player = P;
})(window.FC);
