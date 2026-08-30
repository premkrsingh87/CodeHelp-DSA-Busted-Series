/* FluxCut Studio — storyboard strip.
   The coarse interface: clips as cards you drag between each other, with the
   duration editable in place. Every change lands on the same document the
   timeline edits, so the two views are always the same edit. */
(function (FC) {
  'use strict';
  const U = FC.util, S = FC.store, O = FC.ops, { $, el, esc, clamp } = U;

  const CARD = 124, GAP = 7, PAD = 8;
  const SB_H = 142;
  let host, inner, strip, visible = false, trackId = null;
  let cards = new Map(), list = [], drag = null, caret = null;

  function init() {
    host = $('#storyboard'); if (!host) return;
    strip = $('#sbScroll'); inner = $('#sbInner');
    strip.addEventListener('scroll', U.raf(render));
    strip.addEventListener('wheel', e => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); strip.scrollLeft += e.deltaY; }
    }, { passive: false });
    new ResizeObserver(U.raf(render)).observe(strip);
    $('#sbTrack').addEventListener('change', e => { trackId = e.target.value; layout(); });
    $('#sbClose').addEventListener('click', () => FC.app.toggleStoryboard(false));
    $('#sbShuffle').addEventListener('click', () => FC.app.doReshuffle('order'));
    $('#sbReverse').addEventListener('click', () => {
      S.edit('Reverse', () => { O.reverse(track().id); FC.director.rebuildOverlays(); });
    });
    $('#sbEven').addEventListener('click', evenOut);
    strip.addEventListener('dragover', e => { e.preventDefault(); caret = indexAt(e.clientX); paintCaret(); });
    strip.addEventListener('dragleave', () => { caret = null; paintCaret(); });
    strip.addEventListener('drop', e => {
      e.preventDefault();
      let ids = [];
      try { ids = JSON.parse(e.dataTransfer.getData('text/fluxcut-assets') || '[]'); } catch (x) { }
      const at = caret; caret = null; paintCaret();
      if (ids.length) insertAssets(ids, at);
    });
    U.bus.on('doc', U.raf(layout));
    U.bus.on('sel', U.raf(paintSel));
    U.bus.on('thumbs', U.raf(paintThumbs));
    U.bus.on('time', U.raf(paintPlayhead));
  }

  function track() { return S.trackById(trackId) || S.mainTrack(); }

  function setVisible(on) {
    visible = on;
    host.style.display = on ? 'flex' : 'none';
    document.documentElement.style.setProperty('--row-sb', on ? SB_H + 'px' : '0px');
    if (on) { layout(); FC.timeline.resize(); }
    else FC.timeline.resize();
  }

  function layout() {
    if (!visible) return;
    const t = track(); if (!t) return;
    trackId = t.id;
    const sel = $('#sbTrack');
    const opts = S.displayTracks().filter(x => x.kind === 'video');
    const sig = opts.map(x => x.id + x.name).join();
    if (sel._sig !== sig) {
      sel._sig = sig;
      sel.innerHTML = opts.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
    }
    sel.value = t.id;
    list = S.clipsOn(t.id);
    inner.style.width = (PAD * 2 + list.length * (CARD + GAP)) + 'px';
    $('#sbCount').textContent = list.length + (list.length === 1 ? ' clip' : ' clips') + ' · ' + U.dur(O.trackEnd(t.id));
    render();
  }

  function render() {
    if (!visible) return;
    const left = strip.scrollLeft, w = strip.clientWidth;
    const first = Math.max(0, Math.floor((left - PAD) / (CARD + GAP)) - 2);
    const last = Math.min(list.length, Math.ceil((left + w - PAD) / (CARD + GAP)) + 2);
    const need = new Set();
    for (let i = first; i < last; i++) {
      const c = list[i]; if (!c) continue;
      need.add(c.id);
      let n = cards.get(c.id);
      if (!n) { n = build(c); cards.set(c.id, n); inner.appendChild(n); }
      n.style.transform = `translateX(${PAD + i * (CARD + GAP)}px)`;
      fill(n, c, i);
    }
    for (const [id, n] of cards) if (!need.has(id)) { n.remove(); cards.delete(id); }
    // keep DOM order matching slot order so "the first card" really is clip 1
    let prev = null;
    for (let i = first; i < last; i++) {
      const c = list[i]; if (!c) continue;
      const n = cards.get(c.id); if (!n) continue;
      if (prev ? prev.nextSibling !== n : inner.firstChild !== n) inner.insertBefore(n, prev ? prev.nextSibling : inner.firstChild);
      prev = n;
    }
    paintSel(); paintPlayhead();
  }

  function build(clip) {
    // Every handler re-reads the clip by id: an undo replaces the document
    // wholesale, so a captured clip object would quietly edit a ghost.
    const id = clip.id;
    const live = () => S.clipById(id);
    const n = el('div', { class: 'sbc', 'data-id': id });
    n.innerHTML = `<div class="sbc-thumb"><canvas width="160" height="90"></canvas><span class="sbc-idx"></span><span class="sbc-lock">🔒</span></div>
      <div class="sbc-name"></div>
      <div class="sbc-foot"><input type="text" class="sbc-dur num" title="Length — type a new one and press Enter">
      <button class="sbc-x" title="Ripple delete">✕</button></div>`;
    n.addEventListener('pointerdown', e => { const c = live(); if (c) onDown(e, c, n); });
    n.addEventListener('dblclick', () => { const c = live(); if (c) { FC.player.seek(c.start); FC.timeline.scrollTo(c.start, true); } });
    const dur = n.querySelector('.sbc-dur');
    dur.addEventListener('pointerdown', e => e.stopPropagation());
    dur.addEventListener('change', () => {
      const c = live(); if (!c) return layout();
      const v = U.parseTc(dur.value, FC.doc.timebase, FC.doc.ntsc);
      if (!(v > 0)) return layout();
      S.edit('Set length', () => {
        c.dur = Math.max(O.frame(), O.q(v)); O.refit(c); O.closeGaps(c.track); FC.director.rebuildOverlays();
      });
    });
    dur.addEventListener('keydown', e => { if (e.key === 'Enter') dur.blur(); });
    n.querySelector('.sbc-x').addEventListener('pointerdown', e => e.stopPropagation());
    n.querySelector('.sbc-x').addEventListener('click', e => {
      e.stopPropagation();
      S.edit('Delete', () => { O.deleteClips([id], true); FC.director.rebuildOverlays(); });
    });
    n.querySelector('.sbc-lock').addEventListener('pointerdown', e => e.stopPropagation());
    n.querySelector('.sbc-lock').addEventListener('click', e => {
      e.stopPropagation(); const c = live(); if (c) S.edit('Lock', () => { c.locked = !c.locked; });
    });
    return n;
  }

  function fill(n, c, i) {
    const a = S.assetById(c.assetId);
    n.querySelector('.sbc-idx').textContent = i + 1;
    n.classList.toggle('locked', !!c.locked);
    const nm = n.querySelector('.sbc-name');
    const label = c.name || (a ? a.name : '—');
    if (nm.textContent !== label) { nm.textContent = label; nm.title = label; }
    const d = n.querySelector('.sbc-dur');
    if (document.activeElement !== d) d.value = U.dur(c.dur);
    const cnv = n.querySelector('canvas');
    const key = c.assetId + '@' + Math.round(c.in * 4);
    if (cnv._k !== key) {
      const b = a ? FC.media.thumb(a, c.in + c.dur / 2) : null;
      const g = cnv.getContext('2d');
      g.fillStyle = '#0a0b0d'; g.fillRect(0, 0, 160, 90);
      if (b) {
        const sc = Math.max(160 / b.width, 90 / b.height);
        g.drawImage(b, (160 - b.width * sc) / 2, (90 - b.height * sc) / 2, b.width * sc, b.height * sc);
        cnv._k = key;
      } else if (a) {
        g.fillStyle = a.color || '#1b1f26'; g.globalAlpha = .25; g.fillRect(0, 0, 160, 90); g.globalAlpha = 1;
      }
    }
  }
  function paintThumbs() { for (const [id, n] of cards) { const c = S.clipById(id); if (c) { n.querySelector('canvas')._k = null; fill(n, c, list.indexOf(c)); } } }
  function paintSel() { for (const [id, n] of cards) n.classList.toggle('sel', S.sel.has(id)); }
  function paintPlayhead() {
    if (!visible) return;
    const t = FC.player.time;
    for (const [id, n] of cards) {
      const c = S.clipById(id);
      n.classList.toggle('live', !!c && t >= c.start && t < c.start + c.dur);
    }
  }

  /* ── reorder by dragging a card ────────────────────────────────── */
  function onDown(e, c, n) {
    if (e.button !== 0) return;
    if (S.trackById(c.track) && S.trackById(c.track).locked) return U.toast('Track is locked', 'warn');
    if (e.shiftKey) S.sel.add(c.id); else if (!S.sel.has(c.id)) S.sel.set([c.id]);
    const startX = e.clientX;
    let moved = false;
    n.setPointerCapture(e.pointerId);
    const move = ev => {
      if (!moved && Math.abs(ev.clientX - startX) < 5) return;
      if (!moved) { moved = true; n.classList.add('dragging'); }
      caret = indexAt(ev.clientX);
      const edge = strip.getBoundingClientRect();
      if (ev.clientX > edge.right - 40) strip.scrollLeft += 14;
      else if (ev.clientX < edge.left + 40) strip.scrollLeft -= 14;
      paintCaret();
    };
    const up = () => {
      n.releasePointerCapture(e.pointerId);
      n.removeEventListener('pointermove', move); n.removeEventListener('pointerup', up); n.removeEventListener('pointercancel', up);
      n.classList.remove('dragging');
      const to = caret; caret = null; paintCaret();
      if (moved && to != null) {
        const from = list.indexOf(c);
        let target = to > from ? to - 1 : to;
        if (target !== from && target >= 0) {
          S.edit('Reorder', () => { O.reorder(c.track, from, target); FC.director.rebuildOverlays(); });
        }
      } else if (!moved) {
        FC.player.seek(c.start); FC.timeline.scrollTo(c.start, true);
      }
    };
    n.addEventListener('pointermove', move); n.addEventListener('pointerup', up); n.addEventListener('pointercancel', up);
  }

  /** Slot index the cursor sits between (0 .. list.length). */
  function indexAt(clientX) {
    const r = strip.getBoundingClientRect();
    const x = clientX - r.left + strip.scrollLeft - PAD;
    return clamp(Math.round(x / (CARD + GAP)), 0, list.length);
  }
  function paintCaret() {
    let c = $('#sbCaret');
    if (caret == null) { if (c) c.style.display = 'none'; return; }
    if (!c) { c = el('div', { id: 'sbCaret' }); inner.appendChild(c); }
    c.style.display = 'block';
    c.style.transform = `translateX(${PAD + caret * (CARD + GAP) - GAP / 2 - 1}px)`;
  }

  function insertAssets(ids, at) {
    const t = track(); if (!t) return;
    const assets = ids.map(id => S.assetById(id)).filter(a => a && a.kind !== 'audio');
    if (!assets.length) return U.toast('Video or images only on this track', 'warn');
    S.edit('Place clips', () => {
      const clips = assets.map(a => O.clipFromAsset(a, { track: t.id }));
      O.insertAt(t.id, clips, at == null ? list.length : at);
      S.sel.set(clips.map(c => c.id));
      FC.director.rebuildOverlays();
    });
    U.toast(assets.length + ' inserted at position ' + ((at == null ? list.length : at) + 1));
  }

  function evenOut() {
    const t = track(); const l = S.clipsOn(t.id);
    if (!l.length) return;
    const avg = l.reduce((s, c) => s + c.dur, 0) / l.length;
    S.edit('Even out', () => { O.evenOut(t.id, avg); FC.director.rebuildOverlays(); });
    U.toast('Every clip set to ' + U.dur(avg));
  }

  FC.storyboard = { init, setVisible, layout, render, get visible() { return visible; } };
})(window.FC);
