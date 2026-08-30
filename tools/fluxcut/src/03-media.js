/* FluxCut Studio — media ingest, probing, filmstrip thumbnails, waveforms.
   Design rules:
     · never read a whole video into memory (object URLs only, revoked by LRU)
     · decode each thumbnail once, then keep it in IndexedDB forever
     · every cache has a hard byte budget and evicts least-recently-used */
(function (FC) {
  'use strict';
  const U = FC.util, S = FC.store, { el, uid, clamp } = U;

  const cfg = {
    thumbW: 160, thumbH: 90,
    bitmapBudget: 220 * 1024 * 1024,   // decoded thumbnails held in RAM
    urlBudget: 28,                     // simultaneous object URLs
    maxSlots: 24, minSlots: 3, slotEvery: 4   // one filmstrip frame per 4s of source
  };

  /* ── identity ──────────────────────────────────────────────────── */
  const srcKey = f => `${f.name}|${f.size}|${f.lastModified || 0}`;
  function relPathOf(f) {
    const p = f.webkitRelativePath || f._rel || '';
    return p || f.name;
  }

  /* ── object URL pool ───────────────────────────────────────────── */
  const urlLru = new Map();  // assetId -> {url, t, pin}
  function urlFor(id) {
    let e = urlLru.get(id);
    if (e) { e.t = performance.now(); urlLru.delete(id); urlLru.set(id, e); return e.url; }
    const f = FC.files.get(id); if (!f) return null;
    const url = URL.createObjectURL(f);
    e = { url, t: performance.now(), pin: 0 };
    urlLru.set(id, e); trimUrls();
    return url;
  }
  function pinUrl(id, on) { const e = urlLru.get(id) || (urlFor(id), urlLru.get(id)); if (e) e.pin += on ? 1 : -1; }
  function trimUrls() {
    if (urlLru.size <= cfg.urlBudget) return;
    for (const [id, e] of urlLru) {
      if (urlLru.size <= cfg.urlBudget) break;
      if (e.pin > 0) continue;
      URL.revokeObjectURL(e.url); urlLru.delete(id);
    }
  }
  function dropUrl(id) { const e = urlLru.get(id); if (e) { URL.revokeObjectURL(e.url); urlLru.delete(id); } }

  /* ── bitmap LRU ────────────────────────────────────────────────── */
  const bmp = new Map();   // key -> {img, bytes, t}
  let bmpBytes = 0;
  function bmpGet(k) { const e = bmp.get(k); if (!e) return null; e.t = performance.now(); bmp.delete(k); bmp.set(k, e); return e.img; }
  function bmpPut(k, img) {
    if (bmp.has(k)) return;
    const bytes = (img.width || cfg.thumbW) * (img.height || cfg.thumbH) * 4;
    bmp.set(k, { img, bytes, t: performance.now() }); bmpBytes += bytes;
    while (bmpBytes > cfg.bitmapBudget && bmp.size > 8) {
      const first = bmp.keys().next().value; const e = bmp.get(first);
      bmp.delete(first); bmpBytes -= e.bytes; if (e.img.close) e.img.close();
    }
  }
  function bmpClear() { for (const e of bmp.values()) if (e.img.close) e.img.close(); bmp.clear(); bmpBytes = 0; }

  /* ── slots ─────────────────────────────────────────────────────── */
  function slotCount(a) {
    if (a.kind !== 'video') return 1;
    return clamp(Math.ceil((a.duration || 1) / cfg.slotEvery), cfg.minSlots, cfg.maxSlots);
  }
  function slotOf(a, t) {
    const n = slotCount(a); if (n <= 1) return 0;
    return clamp(Math.round((t / Math.max(0.001, a.duration)) * (n - 1)), 0, n - 1);
  }
  const slotKey = (a, i) => a.key + '#' + i + '/' + slotCount(a);
  const slotTime = (a, i) => { const n = slotCount(a); return n <= 1 ? 0 : (i / (n - 1)) * Math.max(0, a.duration - 0.05); };

  /* ── probing ───────────────────────────────────────────────────── */
  function probeVideo(url) {
    return new Promise(res => {
      const v = el('video', { preload: 'metadata', muted: true, playsinline: true });
      v.crossOrigin = 'anonymous';
      const done = (r) => { v.removeAttribute('src'); v.load(); res(r); };
      const to = setTimeout(() => done(null), 15000);
      v.onloadedmetadata = () => { clearTimeout(to); done({ duration: v.duration, w: v.videoWidth, h: v.videoHeight }); };
      v.onerror = () => { clearTimeout(to); done(null); };
      v.src = url;
    });
  }
  function probeImage(url) {
    return new Promise(res => {
      const i = new Image();
      i.onload = () => res({ duration: 0, w: i.naturalWidth, h: i.naturalHeight });
      i.onerror = () => res(null);
      i.src = url;
    });
  }
  function probeAudio(url) {
    return new Promise(res => {
      const a = new Audio();
      a.preload = 'metadata';
      const to = setTimeout(() => res(null), 15000);
      a.onloadedmetadata = () => { clearTimeout(to); res({ duration: a.duration, w: 0, h: 0 }); };
      a.onerror = () => { clearTimeout(to); res(null); };
      a.src = url;
    });
  }

  /* ── ingest ────────────────────────────────────────────────────── */
  async function ingest(fileList, opts) {
    opts = opts || {};
    const files = Array.from(fileList).filter(f => U.kindOf(f));
    if (!files.length) { U.toast('No supported media in that drop', 'warn'); return []; }

    const existing = new Map(FC.doc.assets.map(a => [a.key, a]));
    const added = [], relinked = [];
    let done = 0;

    for (const f of files) {
      const key = srcKey(f);
      const prev = existing.get(key);
      if (prev) {                                   // same file again → just re-attach the handle
        if (!FC.files.has(prev.id)) { FC.files.set(prev.id, f); relinked.push(prev); }
        done++; U.busy(done / files.length); continue;
      }
      const kind = U.kindOf(f);
      const a = {
        id: uid('as'), key, name: f.name, rel: relPathOf(f), kind,
        size: f.size, mtime: f.lastModified || 0,
        duration: kind === 'image' ? 0 : 0, w: 0, h: 0, fps: null,
        hasAudio: kind === 'video', color: U.hashColor(f.name), tag: '', added: Date.now(),
        pathOverride: '', missing: false
      };
      FC.files.set(a.id, f);
      const url = urlFor(a.id);
      let info = null;
      try {
        info = kind === 'video' ? await probeVideo(url) : kind === 'image' ? await probeImage(url) : await probeAudio(url);
      } catch (e) { info = null; }
      if (info) { a.duration = info.duration || 0; a.w = info.w; a.h = info.h; }
      else { a.broken = true; }
      FC.doc.assets.push(a); added.push(a);
      done++; U.busy(done / files.length);
      if (done % 8 === 0) await U.sleep(0);          // keep the UI responsive on big folders
    }
    U.busy(null);
    S.bump();
    U.bus.emit('assets');
    if (added.length) queuePosters(added);
    if (opts.silent !== true) {
      const msg = [added.length ? added.length + ' imported' : '', relinked.length ? relinked.length + ' relinked' : ''].filter(Boolean).join(' · ');
      if (msg) U.toast(msg);
    }
    // first folder import auto-fills the media root guess
    if (!FC.doc.mediaRoot && added.length && added[0].rel.includes('/')) {
      const top = added[0].rel.split('/')[0];
      FC.doc.mediaRoot = (FC.doc.winPaths ? 'C:\\Media\\' : '/Users/you/Media/') + top.replace(/\//g, '');
      U.bus.emit('rootguess');
    }
    return added;
  }

  /* ── thumbnail generation queue ────────────────────────────────── */
  const wanted = new Map();     // assetId -> Set(slotIdx)
  const inflight = new Set();
  let workerBusy = false;
  const canvas = document.createElement('canvas');
  canvas.width = cfg.thumbW; canvas.height = cfg.thumbH;
  const cx = canvas.getContext('2d', { alpha: false, willReadFrequently: false });

  function request(a, slot) {
    if (!a || a.broken) return;
    const k = slotKey(a, slot);
    if (bmp.has(k) || inflight.has(k)) return;
    let s = wanted.get(a.id); if (!s) { s = new Set(); wanted.set(a.id, s); }
    s.add(slot); pump();
  }
  function queuePosters(assets) { assets.forEach(a => request(a, a.kind === 'video' ? Math.floor(slotCount(a) / 2) : 0)); }

  async function pump() {
    if (workerBusy) return;
    const next = wanted.entries().next();
    if (next.done) return;
    workerBusy = true;
    const [assetId, slots] = next.value;
    wanted.delete(assetId);
    const a = S.assetById(assetId);
    try { if (a) await makeThumbs(a, Array.from(slots).sort((x, y) => x - y)); }
    catch (e) { console.warn('thumb', e); }
    workerBusy = false;
    if (wanted.size) setTimeout(pump, 0); else U.bus.emit('thumbs');
  }

  async function makeThumbs(a, slots) {
    // 1. try the persistent cache first — zero decoding
    const missing = [];
    for (const i of slots) {
      const k = slotKey(a, i);
      if (bmp.has(k)) continue;
      inflight.add(k);
      const rec = await FC.idb.get('thumbs', k);
      if (rec && rec.b) {
        try { bmpPut(k, await createImageBitmap(rec.b)); inflight.delete(k); continue; } catch (e) { }
      }
      missing.push(i);
    }
    if (!missing.length) { U.bus.emit('thumbs'); return; }
    if (!FC.files.has(a.id)) { missing.forEach(i => inflight.delete(slotKey(a, i))); a.missing = true; return; }

    if (a.kind === 'image') {
      const url = urlFor(a.id);
      try {
        const img = await loadImage(url);
        drawFit(img, img.naturalWidth || img.width, img.naturalHeight || img.height);
        await store(a, 0);
      } catch (e) { }
      inflight.delete(slotKey(a, 0));
    } else if (a.kind === 'video') {
      const url = urlFor(a.id); pinUrl(a.id, true);
      const v = el('video', { preload: 'auto', muted: true, playsinline: true });
      v.muted = true; v.src = url;
      try {
        await once(v, 'loadeddata', 12000);
        for (const i of missing) {
          const t = slotTime(a, i);
          try {
            await seek(v, t);
            drawFit(v, v.videoWidth, v.videoHeight);
            await store(a, i);
          } catch (e) { }
          inflight.delete(slotKey(a, i));
          if (!a.fps && v.videoWidth) a.w = a.w || v.videoWidth;
          await U.sleep(0);
        }
      } catch (e) { missing.forEach(i => inflight.delete(slotKey(a, i))); }
      v.removeAttribute('src'); v.load(); pinUrl(a.id, false);
    } else if (a.kind === 'audio') {
      inflight.delete(slotKey(a, 0));
      ensureWave(a);
    }
    U.bus.emit('thumbs');
  }

  function drawFit(src, sw, sh) {
    const cw = cfg.thumbW, ch = cfg.thumbH;
    cx.fillStyle = '#0a0b0d'; cx.fillRect(0, 0, cw, ch);
    if (!sw || !sh) return;
    const s = Math.min(cw / sw, ch / sh);
    const w = sw * s, h = sh * s;
    cx.drawImage(src, (cw - w) / 2, (ch - h) / 2, w, h);
  }
  async function store(a, slot) {
    const k = slotKey(a, slot);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.72));
    if (blob) { bmpPut(k, await createImageBitmap(blob)); FC.idb.put('thumbs', k, { b: blob, at: Date.now() }); }
  }
  function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
  function once(node, ev, ms) {
    return new Promise((res, rej) => {
      const to = setTimeout(() => { cleanup(); rej(new Error('timeout ' + ev)); }, ms || 8000);
      function ok() { cleanup(); res(); }
      function bad() { cleanup(); rej(new Error('error ' + ev)); }
      function cleanup() { clearTimeout(to); node.removeEventListener(ev, ok); node.removeEventListener('error', bad); }
      node.addEventListener(ev, ok, { once: true }); node.addEventListener('error', bad, { once: true });
    });
  }
  function seek(v, t) {
    return new Promise((res, rej) => {
      const to = setTimeout(() => { v.removeEventListener('seeked', ok); rej(new Error('seek timeout')); }, 6000);
      function ok() { clearTimeout(to); res(); }
      v.addEventListener('seeked', ok, { once: true });
      try { v.currentTime = Math.max(0, Math.min(t, (v.duration || 1) - 0.05)); } catch (e) { clearTimeout(to); rej(e); }
    });
  }

  /** Synchronous read for renderers: returns a bitmap now, or queues one and returns null. */
  function thumb(a, tSec) {
    if (!a) return null;
    const i = slotOf(a, tSec || 0);
    const k = slotKey(a, i);
    const b = bmpGet(k);
    if (b) return b;
    request(a, i);
    // fall back to any neighbouring slot we already have so the UI never flashes empty
    const n = slotCount(a);
    for (let d = 1; d < n; d++) {
      const l = bmpGet(slotKey(a, i - d)), r = bmpGet(slotKey(a, i + d));
      if (l) return l; if (r) return r;
    }
    return null;
  }
  function poster(a) { return thumb(a, a.kind === 'video' ? a.duration / 2 : 0); }

  /* ── waveform + beat detection ─────────────────────────────────── */
  const waves = new Map();   // assetId -> {peaks:Float32Array, n, dur, beats:[], bpm}
  const waveJobs = new Set();
  async function ensureWave(a) {
    if (!a || a.kind !== 'audio' || waves.has(a.id) || waveJobs.has(a.id)) return waves.get(a.id);
    waveJobs.add(a.id);
    try {
      const cached = await FC.idb.get('waves', a.key);
      if (cached && cached.peaks) {
        waves.set(a.id, { peaks: new Float32Array(cached.peaks), n: cached.n, dur: cached.dur, beats: cached.beats || [], bpm: cached.bpm || null });
        U.bus.emit('wave', a.id); waveJobs.delete(a.id); return waves.get(a.id);
      }
      const f = FC.files.get(a.id); if (!f) { waveJobs.delete(a.id); return null; }
      const AC = window.AudioContext || window.webkitAudioContext;
      const ac = new AC();
      const buf = await ac.decodeAudioData(await f.arrayBuffer());
      const res = analyse(buf);
      waves.set(a.id, res);
      a.duration = a.duration || buf.duration;
      FC.idb.put('waves', a.key, { peaks: Array.from(res.peaks), n: res.n, dur: res.dur, beats: res.beats, bpm: res.bpm });
      ac.close();
      U.bus.emit('wave', a.id);
    } catch (e) { console.warn('wave', e); }
    waveJobs.delete(a.id);
    return waves.get(a.id);
  }
  function getWave(id) { return waves.get(id) || null; }

  /** Peaks for drawing + energy-onset beat grid for beat-synced cutting. */
  function analyse(buf) {
    const N = 2400;                                  // peak buckets across the whole file
    const ch = buf.numberOfChannels, len = buf.length;
    const data = buf.getChannelData(0);
    const d2 = ch > 1 ? buf.getChannelData(1) : null;
    const peaks = new Float32Array(N);
    const step = Math.max(1, Math.floor(len / N));
    for (let i = 0; i < N; i++) {
      let mx = 0; const s = i * step, e = Math.min(len, s + step);
      for (let j = s; j < e; j += 2) {
        let v = Math.abs(data[j]); if (d2) v = Math.max(v, Math.abs(d2[j]));
        if (v > mx) mx = v;
      }
      peaks[i] = mx;
    }
    // onset envelope @ ~86 Hz
    const hop = 512, frames = Math.floor(len / hop);
    const env = new Float32Array(frames);
    for (let i = 0; i < frames; i++) {
      let s = 0; const o = i * hop;
      for (let j = 0; j < hop; j += 2) { const v = data[o + j] || 0; s += v * v; }
      env[i] = Math.sqrt(s / (hop / 2));
    }
    const flux = new Float32Array(frames);
    for (let i = 1; i < frames; i++) flux[i] = Math.max(0, env[i] - env[i - 1]);
    // adaptive peak pick
    const W = 20, onsets = [], sr = buf.sampleRate;
    for (let i = W; i < frames - W; i++) {
      let sum = 0, mx = 0;
      for (let j = i - W; j <= i + W; j++) { sum += flux[j]; if (flux[j] > mx) mx = flux[j]; }
      const mean = sum / (W * 2 + 1);
      if (flux[i] === mx && flux[i] > mean * 1.9 && flux[i] > 1e-4) { onsets.push(i * hop / sr); i += 4; }
    }
    // tempo via inter-onset autocorrelation (0.3–1.2 s → 50–200 BPM)
    let bpm = null;
    if (onsets.length > 8) {
      const bins = new Map();
      for (let i = 0; i < onsets.length; i++)
        for (let j = i + 1; j < Math.min(onsets.length, i + 8); j++) {
          let d = onsets[j] - onsets[i];
          if (d < 0.28 || d > 1.3) continue;
          while (d < 0.36) d *= 2;
          const k = Math.round(d * 100) / 100;
          bins.set(k, (bins.get(k) || 0) + 1);
        }
      let best = 0, bd = 0;
      for (const [k, v] of bins) if (v > best) { best = v; bd = k; }
      if (bd) bpm = Math.round(60 / bd * 10) / 10;
    }
    // build a regular grid locked to the first strong onset, nudged onto real onsets
    let beats = [];
    if (bpm) {
      const period = 60 / bpm, t0 = onsets.length ? onsets[0] : 0;
      for (let t = t0; t < buf.duration; t += period) {
        let bestT = t, bestD = 0.09;
        for (const o of onsets) { const d = Math.abs(o - t); if (d < bestD) { bestD = d; bestT = o; } }
        beats.push(Math.round(bestT * 1000) / 1000);
      }
    } else beats = onsets;
    return { peaks, n: N, dur: buf.duration, beats, bpm };
  }

  /* ── stats / housekeeping ──────────────────────────────────────── */
  function memoryStats() {
    return {
      bitmaps: bmp.size, bitmapBytes: bmpBytes, urls: urlLru.size,
      assets: FC.doc.assets.length, files: FC.files.size, waves: waves.size
    };
  }
  function trim(hard) {
    bmpClear();
    for (const [id, e] of urlLru) if (!e.pin) { URL.revokeObjectURL(e.url); urlLru.delete(id); }
    if (hard) { waves.clear(); }
    U.bus.emit('thumbs');
    return memoryStats();
  }
  function forget(assetIds) {
    assetIds.forEach(id => { dropUrl(id); FC.files.delete(id); waves.delete(id); });
    for (const k of Array.from(bmp.keys())) { /* keys are content-hashed, safe to keep */ }
  }

  FC.media = {
    cfg, ingest, urlFor, pinUrl, dropUrl, thumb, poster, request, slotCount, slotOf, slotTime, slotKey,
    ensureWave, getWave, memoryStats, trim, forget, srcKey, probeVideo
  };
})(window.FC);
