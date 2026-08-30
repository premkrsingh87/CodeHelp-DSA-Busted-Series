/* FluxCut Studio — canvas timeline: render + direct manipulation.
   One canvas, no DOM per clip, so 2000 clips scroll as smoothly as 20. */
(function (FC) {
  'use strict';
  const U = FC.util, S = FC.store, O = FC.ops, { clamp, el, $ } = U;

  const RULER_H = 22, MIN_PPS = 0.2, MAX_PPS = 900;
  const view = { pps: 60, scroll: 0, vscroll: 0, tool: 'select', snap: true, ripple: true, insert: true };
  let cv, cx, W = 0, H = 0, dpr = 1, dirty = true, layout = [], hover = null, drag = null, marquee = null, snapLine = null, dropAt = null;

  function init() {
    cv = $('#tlCanvas'); if (!cv) return;
    cx = cv.getContext('2d', { alpha: false });
    resize();
    new ResizeObserver(resize).observe(cv.parentElement);
    bindMouse(); initScrollbar();
    U.bus.on('doc', invalidate); U.bus.on('sel', invalidate);
    U.bus.on('thumbs', invalidate); U.bus.on('wave', invalidate); U.bus.on('time', invalidate);
    requestAnimationFrame(frame);
  }
  function invalidate() { dirty = true; }

  /* ── horizontal scrollbar ──────────────────────────────────────── */
  function initScrollbar() {
    const bar = document.getElementById('tlHScroll'), thumb = document.getElementById('tlHThumb');
    if (!bar || !thumb) return;
    let drag2 = null;
    thumb.addEventListener('mousedown', e => {
      e.preventDefault();
      drag2 = { x: e.clientX, scroll: view.scroll, span: span() };
      const mv = ev => {
        const w = bar.clientWidth || 1;
        view.scroll = Math.max(0, drag2.scroll + ((ev.clientX - drag2.x) / w) * drag2.span);
        invalidate();
      };
      const up = () => { drag2 = null; window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
    });
    bar.addEventListener('mousedown', e => {
      if (e.target === thumb) return;
      const w = bar.clientWidth || 1;
      view.scroll = Math.max(0, (e.offsetX / w) * span() - (W / view.pps) / 2);
      invalidate();
    });
    function span() { return Math.max(S.duration(), view.scroll + W / view.pps, 1); }
    setInterval(() => {
      const total = span(), visible = W / view.pps, w = bar.clientWidth || 1;
      const frac = Math.min(1, visible / total);
      thumb.style.width = Math.max(24, frac * w) + 'px';
      thumb.style.left = Math.min(w - 24, (view.scroll / total) * w) + 'px';
      thumb.style.opacity = frac >= 0.999 ? '.25' : '1';
    }, 120);
  }
  function resize() {
    if (!cv) return;
    const r = cv.parentElement.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(10, r.width); H = Math.max(10, r.height);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dirty = true;
  }

  /* ── coordinate helpers ────────────────────────────────────────── */
  const t2x = t => (t - view.scroll) * view.pps;
  const x2t = x => view.scroll + x / view.pps;
  function buildLayout() {
    layout = [];
    let y = RULER_H - view.vscroll;
    for (const t of S.displayTracks()) { layout.push({ t, y, h: t.h }); y += t.h + 1; }
    return y;
  }
  function trackAtY(y) { for (const L of layout) if (y >= L.y && y < L.y + L.h) return L; return null; }
  function contentHeight() { return S.displayTracks().reduce((s, t) => s + t.h + 1, 0) + RULER_H + 20; }

  /* ── painting ──────────────────────────────────────────────────── */
  function frame() { if (dirty) { dirty = false; draw(); } requestAnimationFrame(frame); }

  function draw() {
    if (!cx) return;
    buildLayout();
    cx.fillStyle = '#0d0f12'; cx.fillRect(0, 0, W, H);
    drawTrackBeds();
    drawRuler();
    drawClips();
    drawMarkers();
    drawOverlaysHint();
    if (marquee) drawMarquee();
    if (dropAt) drawDropMarker();
    drawPlayhead();
    if (snapLine != null) { cx.strokeStyle = '#f5a524'; cx.lineWidth = 1; cx.beginPath(); const x = Math.round(t2x(snapLine)) + .5; cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
    syncHeads();
    updateStatus();
  }

  function drawTrackBeds() {
    for (const L of layout) {
      const isV = L.t.kind === 'video';
      cx.fillStyle = L.t.role === 'main' ? '#14171c' : isV ? '#111419' : '#101512';
      cx.fillRect(0, L.y, W, L.h);
      cx.fillStyle = '#0a0c0f'; cx.fillRect(0, L.y + L.h, W, 1);
      if (S.sel.targetTrack === L.t.id) { cx.fillStyle = 'rgba(61,155,255,.05)'; cx.fillRect(0, L.y, W, L.h); }
      if (L.t.locked) {
        cx.save(); cx.globalAlpha = .05; cx.strokeStyle = '#fff'; cx.lineWidth = 8;
        for (let x = -L.h; x < W; x += 22) { cx.beginPath(); cx.moveTo(x, L.y + L.h); cx.lineTo(x + L.h, L.y); cx.stroke(); }
        cx.restore();
      }
    }
  }

  const TICKS = [1 / 60, 1 / 30, .1, .2, .5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];
  function niceStep(minPx) {
    for (const s of TICKS) if (s * view.pps >= minPx) return s;
    return 3600;
  }
  function drawRuler() {
    cx.fillStyle = '#15181d'; cx.fillRect(0, 0, W, RULER_H);
    cx.fillStyle = '#0a0c0f'; cx.fillRect(0, RULER_H - 1, W, 1);
    const major = niceStep(78), minor = niceStep(9);
    const t0 = Math.max(0, view.scroll), t1 = view.scroll + W / view.pps;
    cx.strokeStyle = '#262b33'; cx.lineWidth = 1; cx.beginPath();
    for (let t = Math.floor(t0 / minor) * minor; t < t1; t += minor) {
      const x = Math.round(t2x(t)) + .5; if (x < -2) continue;
      cx.moveTo(x, RULER_H - 5); cx.lineTo(x, RULER_H - 1);
    }
    cx.stroke();
    cx.fillStyle = '#8b9198'; cx.font = '10px ui-monospace,Menlo,monospace'; cx.textBaseline = 'middle';
    cx.strokeStyle = '#39414d'; cx.beginPath();
    for (let t = Math.floor(t0 / major) * major; t < t1; t += major) {
      const x = Math.round(t2x(t)) + .5; if (x < -40) continue;
      cx.moveTo(x, 4); cx.lineTo(x, RULER_H - 1);
      cx.fillText(labelFor(t, major), x + 4, 9);
    }
    cx.stroke();
    // in/out region shading could live here later
  }
  function labelFor(t, step) {
    const d = FC.doc;
    if (step >= 1) {
      const m = Math.floor(t / 60), s = Math.floor(t % 60);
      return (m >= 60 ? Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    }
    return U.tc(t, d.timebase, d.ntsc, false).slice(3);
  }

  function drawClips() {
    const t0 = view.scroll, t1 = view.scroll + W / view.pps;
    for (const L of layout) {
      if (L.y + L.h < RULER_H || L.y > H) continue;
      const list = S.clipsOn(L.t.id);
      // binary-ish scan: clips are sorted, so bail out early
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.start > t1) break;
        if (c.start + c.dur < t0) continue;
        drawClip(c, L);
      }
    }
  }

  function rr(x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    cx.beginPath();
    cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r);
    cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath();
  }

  function drawClip(c, L) {
    const a = S.assetById(c.assetId);
    const x = t2x(c.start), w = Math.max(2, c.dur * view.pps);
    const y = L.y + 2, h = L.h - 4;
    const vx = Math.max(-4, x), vw = Math.min(W + 8, x + w) - vx;
    if (vw <= 0) return;
    const selected = S.sel.has(c.id);
    const col = c.color || (a && a.color) || '#3d9bff';
    const isAudio = L.t.kind === 'audio';
    const dim = !c.enabled || !L.t.enabled;

    // Clipping is the expensive part, so only pay for it when there is imagery to mask.
    const rich = w >= 18;
    cx.save();
    if (rich) { rr(x, y, w, h, 4); cx.clip(); }

    // body
    cx.fillStyle = isAudio ? '#12241c' : U.mix('#12151a', col, .18);
    cx.fillRect(vx, y, vw, h);

    if (rich) {
      if (isAudio || (a && a.kind === 'audio')) drawWave(c, a, x, y, w, h);
      else drawFilmstrip(c, a, x, y, w, h, vx, vw);
    }

    // top colour rail
    cx.fillStyle = col; cx.globalAlpha = dim ? .35 : 1; cx.fillRect(vx, y, vw, 2.5); cx.globalAlpha = 1;

    // fades
    if (c.fadeIn > 0 || c.fadeOut > 0) {
      cx.fillStyle = 'rgba(0,0,0,.55)';
      if (c.fadeIn > 0) { const fw = Math.min(w, c.fadeIn * view.pps); cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + fw, y); cx.lineTo(x, y + h); cx.closePath(); cx.fill(); }
      if (c.fadeOut > 0) { const fw = Math.min(w, c.fadeOut * view.pps); cx.beginPath(); cx.moveTo(x + w, y); cx.lineTo(x + w - fw, y); cx.lineTo(x + w, y + h); cx.closePath(); cx.fill(); }
    }

    if (!rich) {
      cx.restore();
      cx.fillStyle = col; cx.globalAlpha = dim ? .3 : .85; cx.fillRect(vx, y, vw, 2.5); cx.globalAlpha = 1;
      cx.strokeStyle = selected ? '#fff' : 'rgba(0,0,0,.5)'; cx.lineWidth = selected ? 1.5 : 1;
      cx.strokeRect(x + .5, y + .5, Math.max(1, w - 1), h - 1);
      return;
    }

    // label
    if (w > 34) {
      const name = c.name || (a ? a.name : '—');
      cx.fillStyle = 'rgba(6,8,11,.72)';
      const label = name.length > 40 ? name.slice(0, 38) + '…' : name;
      cx.font = '10px Inter,system-ui,sans-serif';
      const tw = cx.measureText(label).width;
      cx.fillRect(vx + 3, y + h - 14, Math.min(tw + 8, vw - 6), 12);
      cx.fillStyle = dim ? '#6d7683' : '#dde3ea'; cx.textBaseline = 'middle';
      cx.fillText(label, vx + 7, y + h - 8);
    }
    if (w > 70) {
      const s = U.dur(c.dur);
      cx.font = '9.5px ui-monospace,Menlo,monospace';
      const tw = cx.measureText(s).width;
      cx.fillStyle = 'rgba(6,8,11,.72)'; cx.fillRect(x + w - tw - 10, y + 4, tw + 7, 12);
      cx.fillStyle = '#9aa4b1'; cx.fillText(s, x + w - tw - 6, y + 10);
    }
    // badges
    let bx = vx + 5, by = y + 10;
    if (c.locked) { cx.fillStyle = '#f5a524'; cx.font = '9px sans-serif'; cx.fillText('🔒', bx, by); bx += 13; }
    if (c.gen) { cx.fillStyle = '#a855f7'; cx.font = '8px ui-monospace'; cx.fillText('AUTO', bx, by); bx += 26; }
    if (c.short) { cx.fillStyle = '#f5576c'; cx.font = '8px ui-monospace'; cx.fillText('SHORT', bx, by); }
    if (c.opacity < 100 && !isAudio) { cx.fillStyle = '#9aa4b1'; cx.font = '8px ui-monospace'; cx.fillText(c.opacity + '%', vx + vw - 24, by); }

    cx.restore();

    // border + selection
    rr(x + .5, y + .5, w - 1, h - 1, 4);
    cx.lineWidth = selected ? 2 : 1;
    cx.strokeStyle = selected ? '#ffffff' : 'rgba(0,0,0,.55)';
    cx.stroke();
    if (selected) { rr(x - 1.5, y - 1.5, w + 3, h + 3, 5); cx.strokeStyle = U.withAlpha('#3d9bff', .9); cx.lineWidth = 1; cx.stroke(); }

    // transition wedge at the head of this clip
    if (c.xf && c.xf.dur > 0) drawTransition(c, L, x, y, h);
  }

  function drawTransition(c, L, x, y, h) {
    const hw = c.xf.dur * view.pps / 2;
    if (hw < 1.2) return;
    cx.save();
    cx.fillStyle = 'rgba(61,155,255,.28)';
    cx.strokeStyle = '#7cc0ff'; cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(x - hw, y); cx.lineTo(x + hw, y); cx.lineTo(x + hw, y + h); cx.lineTo(x - hw, y + h); cx.closePath();
    cx.fill(); cx.stroke();
    cx.beginPath(); cx.moveTo(x - hw, y + h); cx.lineTo(x + hw, y); cx.stroke();
    cx.restore();
  }

  function drawFilmstrip(c, a, x, y, w, h, vx, vw) {
    if (!a) return;
    const tw = Math.round(h * 16 / 9);
    if (tw < 6) return;
    const n = Math.max(1, Math.ceil(w / tw));
    const seams = tw > 14 && n > 1;
    const speed = c.speed || 1;
    cx.save();
    cx.globalAlpha = c.enabled ? .96 : .4;
    for (let i = 0; i < n; i++) {
      const px = x + i * tw;
      if (px + tw < vx - tw || px > vx + vw) continue;
      const frac = (i * tw + tw / 2) / w;
      const st = c.in + clamp(frac, 0, 1) * c.dur * speed;
      const b = FC.media.thumb(a, st);
      if (b) {
        const sw = b.width, sh = b.height;
        const sc = Math.max(tw / sw, h / sh);
        const dw = sw * sc, dh = sh * sc;
        cx.drawImage(b, px + (tw - dw) / 2, y + (h - dh) / 2, dw, dh);
      } else {
        cx.fillStyle = i % 2 ? '#171b21' : '#141820'; cx.fillRect(px, y, tw, h);
      }
      if (seams && i) { cx.strokeStyle = 'rgba(0,0,0,.35)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(px + .5, y); cx.lineTo(px + .5, y + h); cx.stroke(); }
    }
    cx.restore();
    // darken so text stays readable
    cx.fillStyle = 'rgba(8,10,13,.28)'; cx.fillRect(vx, y, vw, h);
  }

  function drawWave(c, a, x, y, w, h) {
    const wave = a ? FC.media.getWave(a.id) : null;
    const mid = y + h / 2;
    if (!wave) {
      if (a) FC.media.ensureWave(a);
      cx.strokeStyle = 'rgba(49,196,141,.4)'; cx.beginPath(); cx.moveTo(Math.max(0, x), mid); cx.lineTo(Math.min(W, x + w), mid); cx.stroke();
      return;
    }
    const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(W, Math.ceil(x + w));
    cx.fillStyle = 'rgba(49,196,141,.75)';
    const amp = h / 2 - 3;
    for (let px = x0; px < x1; px++) {
      const t = c.in + ((px - x) / w) * c.dur * (c.speed || 1);
      const idx = clamp(Math.floor((t / Math.max(0.001, wave.dur)) * wave.n), 0, wave.n - 1);
      const v = wave.peaks[idx] || 0;
      const hh = Math.max(0.6, v * amp);
      cx.fillRect(px, mid - hh, 1, hh * 2);
    }
    if (wave.beats && view.pps > 14) {
      cx.strokeStyle = 'rgba(245,165,36,.35)'; cx.lineWidth = 1; cx.beginPath();
      for (const b of wave.beats) {
        const bt = c.start + (b - c.in);
        if (bt < c.start || bt > c.start + c.dur) continue;
        const bx = Math.round(t2x(bt)) + .5;
        if (bx < 0 || bx > W) continue;
        cx.moveTo(bx, y + 2); cx.lineTo(bx, y + h - 2);
      }
      cx.stroke();
    }
  }

  function drawMarkers() {
    if (!FC.doc.markers.length) return;
    for (const m of FC.doc.markers) {
      const x = t2x(m.t); if (x < -8 || x > W + 8) continue;
      cx.fillStyle = m.color || '#f5a524';
      cx.beginPath(); cx.moveTo(x, 2); cx.lineTo(x + 5, 8); cx.lineTo(x, 14); cx.lineTo(x - 5, 8); cx.closePath(); cx.fill();
      if (m.name && view.pps > 8) { cx.fillStyle = '#c9d1da'; cx.font = '9px Inter,sans-serif'; cx.fillText(m.name, x + 7, 8); }
      cx.strokeStyle = U.withAlpha(m.color || '#f5a524', .25); cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(x + .5, RULER_H); cx.lineTo(x + .5, H); cx.stroke();
    }
  }

  function drawOverlaysHint() {
    // faint tint on tracks driven by a rule, so generated content reads as generated
    const ruleTracks = new Set(FC.doc.overlays.filter(r => r.enabled).map(r => r.track));
    for (const L of layout) if (ruleTracks.has(L.t.id)) {
      cx.fillStyle = 'rgba(168,85,247,.05)'; cx.fillRect(0, L.y, W, L.h);
    }
  }

  function drawPlayhead() {
    const t = FC.player ? FC.player.time : 0;
    const x = Math.round(t2x(t)) + .5;
    if (x < -20 || x > W + 20) return;
    cx.strokeStyle = '#ff4d5e'; cx.lineWidth = 1;
    cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke();
    cx.fillStyle = '#ff4d5e';
    cx.beginPath(); cx.moveTo(x - 6, 0); cx.lineTo(x + 6, 0); cx.lineTo(x + 6, 8); cx.lineTo(x, 14); cx.lineTo(x - 6, 8); cx.closePath(); cx.fill();
  }

  function drawMarquee() {
    const { x0, y0, x1, y1 } = marquee;
    cx.fillStyle = 'rgba(61,155,255,.12)'; cx.strokeStyle = '#3d9bff'; cx.lineWidth = 1;
    const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    cx.fillRect(x, y, w, h); cx.strokeRect(x + .5, y + .5, w, h);
  }

  function drawDropMarker() {
    const x = Math.round(t2x(dropAt.t)) + .5;
    const L = layout.find(l => l.t.id === dropAt.track);
    if (!L) return;
    cx.strokeStyle = '#31c48d'; cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(x, L.y); cx.lineTo(x, L.y + L.h); cx.stroke();
    cx.fillStyle = '#31c48d';
    cx.beginPath(); cx.moveTo(x - 4, L.y); cx.lineTo(x + 4, L.y); cx.lineTo(x, L.y + 6); cx.closePath(); cx.fill();
  }

  /* ── track headers (DOM, kept in sync with the canvas) ─────────── */
  let headSig = '';
  function syncHeads() {
    const host = $('#trackHeadsInner'); if (!host) return;
    const sig = S.displayTracks().map(t => [t.id, t.name, t.h, t.enabled, t.locked, t.mute, t.solo, t.role].join(',')).join('|') + '|' + view.vscroll + '|' + S.sel.targetTrack;
    if (sig === headSig) return; headSig = sig;
    host.innerHTML = '';
    host.style.transform = 'translateY(' + (RULER_H - view.vscroll) + 'px)';
    for (const t of S.displayTracks()) {
      const isV = t.kind === 'video';
      const color = t.role === 'main' ? '#3d9bff' : isV ? '#a855f7' : '#31c48d';
      const d = el('div', { class: 'th' + (S.sel.targetTrack === t.id ? ' target' : ''), style: 'height:' + t.h + 'px', 'data-track': t.id });
      d.appendChild(el('div', { class: 'bar', style: 'background:' + color + ';color:' + color }));
      d.appendChild(el('div', { class: 'nm', text: t.name, style: 'color:' + (t.enabled ? '#e7eaee' : '#697280') }));
      const mk = (txt, on, title, act) => {
        const b = el('button', { class: 'tb' + (on ? ' on' : ''), text: txt, title });
        b.onclick = (e) => { e.stopPropagation(); act(); };
        return b;
      };
      d.appendChild(mk(t.enabled ? '👁' : '⊘', t.enabled, 'Show / hide track', () => S.edit('Toggle track', () => { t.enabled = !t.enabled; })));
      if (!isV) d.appendChild(mk(t.mute ? '🔇' : '🔊', !t.mute, 'Mute', () => S.edit('Mute track', () => { t.mute = !t.mute; })));
      d.appendChild(mk('🔒', t.locked, 'Lock track', () => S.edit('Lock track', () => { t.locked = !t.locked; })));
      d.onclick = () => { S.sel.targetTrack = t.id; headSig = ''; invalidate(); };
      d.oncontextmenu = (e) => { e.preventDefault(); FC.app && FC.app.trackMenu(e, t); };
      host.appendChild(d);
    }
  }

  function updateStatus() {
    const s = $('#tlStatus'); if (!s) return;
    const d = S.duration();
    s.textContent = `${FC.doc.clips.length} clips · ${U.dur(d)} · ${view.pps.toFixed(1)} px/s`;
  }

  /* ── hit testing ───────────────────────────────────────────────── */
  const EDGE = 7;
  function hit(px, py) {
    if (py < RULER_H) return { kind: 'ruler', t: x2t(px) };
    const L = trackAtY(py); if (!L) return null;
    const t = x2t(px);
    const list = S.clipsOn(L.t.id);
    for (const c of list) {
      const x0 = t2x(c.start), x1 = t2x(c.start + c.dur);
      if (px < x0 - EDGE || px > x1 + EDGE) continue;
      if (px > x1 + 1) continue;
      let zone = 'body';
      if (px - x0 <= EDGE && x1 - x0 > 3 * EDGE) zone = 'in';
      else if (x1 - px <= EDGE && x1 - x0 > 3 * EDGE) zone = 'out';
      // transition handle sits on the cut
      if (c.xf && c.xf.dur > 0 && Math.abs(px - x0) <= Math.max(4, c.xf.dur * view.pps / 2)) zone = px < x0 ? 'xf' : zone;
      return { kind: 'clip', clip: c, track: L.t, zone, t };
    }
    return { kind: 'track', track: L.t, t };
  }

  /* ── interaction ───────────────────────────────────────────────── */
  function bindMouse() {
    cv.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', onCtx);
    cv.addEventListener('dblclick', onDbl);
    cv.addEventListener('mouseleave', () => { hover = null; invalidate(); });
    // drag & drop from the bin
    cv.addEventListener('dragover', e => {
      e.preventDefault();
      const p = pos(e); const L = trackAtY(p.y);
      dropAt = L ? { track: L.t.id, t: Math.max(0, snapT(x2t(p.x), null)) } : null;
      $('#dropHint').classList.add('show'); invalidate();
    });
    cv.addEventListener('dragleave', () => { dropAt = null; $('#dropHint').classList.remove('show'); invalidate(); });
    cv.addEventListener('drop', e => {
      e.preventDefault(); $('#dropHint').classList.remove('show');
      const at = dropAt; dropAt = null;
      let ids = [];
      try { ids = JSON.parse(e.dataTransfer.getData('text/fluxcut-assets') || '[]'); } catch (x) { }
      if (at && ids.length) FC.app.dropAssets(ids, at.track, at.t);
      else if (e.dataTransfer.files && e.dataTransfer.files.length) FC.app.importFiles(e.dataTransfer.files);
      invalidate();
    });
  }
  function pos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  function snapT(t, exclude) {
    if (!view.snap) return O.q(t);
    const pts = O.snapPoints(exclude);
    const tol = 9 / view.pps;
    const s = O.snapTo(t, pts, tol);
    snapLine = Math.abs(s - t) > 1e-9 ? s : null;
    return O.q(s);
  }

  function onDown(e) {
    if (e.button === 1) { drag = { kind: 'pan', x: e.clientX, scroll: view.scroll }; return; }
    if (e.button === 2) return;
    const p = pos(e), h = hit(p.x, p.y);
    cv.focus();
    if (!h) return;

    if (h.kind === 'ruler') { FC.player.seek(Math.max(0, O.q(h.t))); drag = { kind: 'scrub' }; return; }
    if (view.tool === 'hand') { drag = { kind: 'pan', x: e.clientX, scroll: view.scroll }; return; }

    if (h.kind === 'clip' && view.tool === 'razor') {
      S.edit('Razor', () => { const b = O.split(h.clip, O.q(h.t)); if (b) S.sel.set([b.id]); });
      return;
    }
    if (h.kind === 'clip' && view.tool === 'slip') {
      drag = { kind: 'slip', clip: h.clip, x: p.x, in0: h.clip.in }; S.begin('Slip'); return;
    }
    if (h.kind === 'clip') {
      if (h.track.locked) { U.toast('Track is locked', 'warn'); return; }
      if (!S.sel.has(h.clip.id)) {
        if (e.shiftKey) S.sel.add(h.clip.id); else S.sel.set([h.clip.id]);
      } else if (e.shiftKey) S.sel.toggle(h.clip.id);
      S.sel.targetTrack = h.track.id; headSig = '';
      const clips = S.sel.list().filter(c => !c.locked);
      if (h.zone === 'in' || h.zone === 'out') {
        S.begin('Trim');
        drag = { kind: 'trim', edge: h.zone, clip: h.clip, x: p.x, start0: h.clip.start, dur0: h.clip.dur, in0: h.clip.in, roll: e.altKey };
      } else {
        S.begin('Move');
        drag = {
          kind: 'move', clips, x: p.x, y: p.y, t0: h.t, moved: false,
          starts: clips.map(c => c.start), track0: h.track.id,
          insert: view.insert && !e.altKey && clips.length >= 1
        };
      }
      invalidate(); return;
    }
    if (h.kind === 'track') {
      if (!e.shiftKey) S.sel.clear();
      S.sel.targetTrack = h.track.id; headSig = '';
      marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, add: e.shiftKey, base: new Set(S.sel.clips) };
      drag = { kind: 'marquee' };
      invalidate();
    }
  }

  function onMove(e) {
    const p = pos(e);
    if (!drag) {
      const h = hit(p.x, p.y);
      const cur = !h ? 'default' : h.kind === 'ruler' ? 'ew-resize'
        : view.tool === 'razor' ? 'crosshair' : view.tool === 'hand' ? 'grab' : view.tool === 'slip' ? 'ew-resize'
          : h.kind === 'clip' ? (h.zone === 'in' || h.zone === 'out' ? 'ew-resize' : 'grab') : 'default';
      cv.style.cursor = cur;
      const nh = h && h.kind === 'clip' ? h.clip.id : null;
      if (nh !== hover) { hover = nh; invalidate(); }
      return;
    }
    switch (drag.kind) {
      case 'pan': { view.scroll = Math.max(0, drag.scroll - (e.clientX - drag.x) / view.pps); invalidate(); break; }
      case 'scrub': { FC.player.seek(Math.max(0, O.q(x2t(p.x)))); break; }
      case 'marquee': {
        marquee.x1 = p.x; marquee.y1 = p.y;
        const tA = x2t(Math.min(marquee.x0, marquee.x1)), tB = x2t(Math.max(marquee.x0, marquee.x1));
        const yA = Math.min(marquee.y0, marquee.y1), yB = Math.max(marquee.y0, marquee.y1);
        const ids = new Set(marquee.add ? marquee.base : []);
        for (const L of layout) {
          if (L.y + L.h < yA || L.y > yB) continue;
          for (const c of S.clipsOn(L.t.id)) if (c.start + c.dur > tA && c.start < tB) ids.add(c.id);
        }
        S.sel.set(Array.from(ids)); invalidate(); break;
      }
      case 'trim': {
        const dt = (p.x - drag.x) / view.pps;
        const c = drag.clip;
        const raw = drag.edge === 'in' ? drag.start0 + dt : drag.start0 + drag.dur0 + dt;
        const snapped = snapT(raw, new Set([c.id]));
        c.start = drag.start0; c.dur = drag.dur0; c.in = drag.in0;
        const delta = snapped - (drag.edge === 'in' ? drag.start0 : drag.start0 + drag.dur0);
        if (drag.roll) {
          const list = S.clipsOn(c.track); const i = list.indexOf(c);
          const other = drag.edge === 'in' ? list[i - 1] : list[i + 1];
          if (other) { drag.edge === 'in' ? O.roll(other, c, delta) : O.roll(c, other, delta); }
        } else {
          O.trim(c, drag.edge, delta, view.ripple ? 'ripple' : 'normal');
        }
        invalidate(); break;
      }
      case 'slip': {
        const dt = -(p.x - drag.x) / view.pps;
        drag.clip.in = drag.in0; O.slip(drag.clip, dt); invalidate(); break;
      }
      case 'move': {
        const dx = p.x - drag.x;
        if (!drag.moved && Math.abs(dx) < 3 && Math.abs(p.y - drag.y) < 4) return;
        drag.moved = true;
        const dt = dx / view.pps;
        const L = trackAtY(p.y);
        const targetTrack = L && L.t.kind === (S.trackById(drag.track0).kind) && !L.t.locked ? L.t.id : drag.track0;
        if (drag.insert && drag.clips.length) {
          // magnetic: compute an insertion index and re-flow
          const c0 = drag.clips[0];
          const t = x2t(p.x) - (drag.t0 - drag.starts[0]);
          const others = S.clipsOn(targetTrack).filter(c => drag.clips.indexOf(c) < 0);
          let idx = others.length;
          for (let i = 0; i < others.length; i++) { if (t < others[i].start + others[i].dur / 2) { idx = i; break; } }
          drag.pendingIndex = idx; drag.pendingTrack = targetTrack;
          const out = others.slice(0, idx).concat(drag.clips, others.slice(idx));
          drag.clips.forEach(c => c.track = targetTrack);
          O.applyOrder(targetTrack, out);
        } else {
          drag.clips.forEach((c, i) => { c.start = Math.max(0, O.q(drag.starts[i] + dt)); if (targetTrack !== drag.track0) c.track = targetTrack; });
          if (drag.clips.length === 1) {
            const c = drag.clips[0];
            const s = snapT(c.start, new Set(drag.clips.map(x => x.id)));
            const e2 = snapT(c.start + c.dur, new Set(drag.clips.map(x => x.id)));
            if (Math.abs(s - c.start) < Math.abs(e2 - (c.start + c.dur))) c.start = Math.max(0, s);
            else c.start = Math.max(0, e2 - c.dur);
          }
        }
        S.bump(); invalidate(); break;
      }
    }
  }

  function onUp(e) {
    if (!drag) return;
    const k = drag.kind;
    if (k === 'trim') { if (view.ripple) O.closeGaps(drag.clip.track); S.commit('Trim'); FC.director.rebuildOverlays(); }
    else if (k === 'slip') S.commit('Slip');
    else if (k === 'move') {
      if (drag.moved) {
        if (!drag.insert) { O.resolveOverlaps(drag.pendingTrack || drag.track0); }
        S.commit('Move'); FC.director.rebuildOverlays();
      } else S.abort();
    }
    if (k === 'marquee') marquee = null;
    drag = null; snapLine = null; invalidate();
    U.bus.emit('sel');
  }

  function onDbl(e) {
    const p = pos(e), h = hit(p.x, p.y);
    if (h && h.kind === 'clip') { FC.player.seek(h.clip.start); FC.app.showTab('clip'); }
    else if (h && h.kind === 'ruler') FC.app.addMarker();
  }
  function onCtx(e) {
    e.preventDefault();
    const p = pos(e), h = hit(p.x, p.y);
    if (h && h.kind === 'clip') {
      if (!S.sel.has(h.clip.id)) S.sel.set([h.clip.id]);
      FC.app.clipMenu(e, h.clip);
    } else if (h) FC.app.trackMenu(e, h.track);
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.altKey) {
      const p = pos(e), tAt = x2t(p.x);
      zoomBy(Math.pow(1.0022, -e.deltaY), tAt);
    } else if (e.shiftKey) {
      view.scroll = Math.max(0, view.scroll + e.deltaY / view.pps);
    } else {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) view.scroll = Math.max(0, view.scroll + e.deltaX / view.pps);
      else {
        const maxV = Math.max(0, contentHeight() - H);
        view.vscroll = clamp(view.vscroll + e.deltaY, 0, maxV);
        headSig = '';
      }
    }
    invalidate();
  }

  /* ── public view controls ──────────────────────────────────────── */
  function zoomBy(k, anchorT) {
    const a = anchorT != null ? anchorT : view.scroll + (W / 2) / view.pps;
    const np = clamp(view.pps * k, MIN_PPS, MAX_PPS);
    view.scroll = Math.max(0, a - (a - view.scroll) * (view.pps / np));
    view.pps = np; invalidate(); U.bus.emit('view');
  }
  function zoomTo(pps, anchorT) { zoomBy(pps / view.pps, anchorT); }
  function fit() {
    const d = Math.max(1, S.duration());
    view.pps = clamp((W - 30) / d, MIN_PPS, MAX_PPS);
    view.scroll = 0; invalidate(); U.bus.emit('view');
  }
  function scrollTo(t, center) {
    if (center) view.scroll = Math.max(0, t - (W / 2) / view.pps);
    else {
      const x = t2x(t);
      if (x < 40) view.scroll = Math.max(0, t - 40 / view.pps);
      else if (x > W - 60) view.scroll = Math.max(0, t - (W - 60) / view.pps);
    }
    invalidate();
  }
  function ensureVisible(t) { const x = t2x(t); if (x < 0 || x > W - 4) scrollTo(t, true); }

  FC.timeline = {
    init, invalidate, view, zoomBy, zoomTo, fit, scrollTo, ensureVisible, t2x, x2t,
    get width() { return W; }, resize, RULER_H,
    setTool(t) { view.tool = t; cv && (cv.className = t === 'razor' ? 'razor' : ''); invalidate(); }
  };
})(window.FC);
