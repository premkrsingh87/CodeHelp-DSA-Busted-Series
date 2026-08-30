/* FluxCut Studio — media bin: virtualised grid, drag source for the timeline. */
(function (FC) {
  'use strict';
  const U = FC.util, S = FC.store, { $, el, clamp } = U;

  const SIZES = [96, 132, 176, 220];
  let sizeIdx = 1, filtered = [], lastClick = -1, scroller, grid, cols = 1, cw = 132, chh = 96;
  const nodes = new Map();   // assetId -> element (recycled)

  function init() {
    scroller = $('#binScroll'); grid = $('#binGrid');
    scroller.addEventListener('scroll', U.raf(render));
    new ResizeObserver(U.raf(layout)).observe(scroller);
    $('#binSearch').addEventListener('input', U.debounce(() => { layout(); }, 120));
    $('#binSort').addEventListener('change', layout);
    $('#binSizeBtn').addEventListener('click', () => { sizeIdx = (sizeIdx + 1) % SIZES.length; layout(); });
    U.bus.on('assets', layout); U.bus.on('thumbs', paintThumbs); U.bus.on('doc', markUsed);
    // dropping onto the bin imports
    scroller.addEventListener('dragover', e => { e.preventDefault(); scroller.style.background = 'rgba(61,155,255,.05)'; });
    scroller.addEventListener('dragleave', () => scroller.style.background = '');
    scroller.addEventListener('drop', async e => {
      e.preventDefault(); scroller.style.background = '';
      if (e.dataTransfer.items && e.dataTransfer.items.length) {
        const files = await filesFromDataTransfer(e.dataTransfer);
        if (files.length) FC.app.importFiles(files);
      }
    });
    layout();
  }

  /* Walk dropped directories so folder structure survives (webkitGetAsEntry). */
  async function filesFromDataTransfer(dt) {
    const items = Array.from(dt.items || []);
    const entries = items.map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
    if (!entries.length) return Array.from(dt.files || []);
    const out = [];
    async function walk(entry, path) {
      if (entry.isFile) {
        const f = await new Promise(res => entry.file(res, () => res(null)));
        if (f) { try { f._rel = path + f.name; } catch (e) { } out.push(f); }
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (; ;) {
          const batch = await new Promise(res => reader.readEntries(res, () => res([])));
          if (!batch.length) break;
          for (const e2 of batch) await walk(e2, path + entry.name + '/');
        }
      }
    }
    for (const e of entries) await walk(e, '');
    return out.length ? out : Array.from(dt.files || []);
  }

  function query() {
    const q = ($('#binSearch').value || '').trim().toLowerCase();
    let list = FC.doc.assets.slice();
    if (q) {
      const kinds = [];
      const words = q.split(/\s+/).filter(w => {
        if (w[0] === ':') { kinds.push(w.slice(1)); return false; }
        return true;
      });
      list = list.filter(a => {
        if (kinds.length && !kinds.some(k => a.kind.startsWith(k) || (k === 'used' && isUsed(a.id)) || (k === 'unused' && !isUsed(a.id)))) return false;
        const hay = (a.name + ' ' + (a.rel || '') + ' ' + (a.tag || '')).toLowerCase();
        return words.every(w => hay.includes(w));
      });
    }
    const sort = $('#binSort').value;
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    else if (sort === 'dur') list.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    else if (sort === 'type') list.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    else if (sort === 'random') list = U.shuffled(list, U.rng(Date.now() & 0xffff));
    return list;
  }
  let usedSet = new Set();
  function markUsed() { usedSet = new Set(FC.doc.clips.map(c => c.assetId)); render(); }
  const isUsed = id => usedSet.has(id);

  function layout() {
    if (!grid) return;
    filtered = query();
    const w = scroller.clientWidth - 12;
    const target = SIZES[sizeIdx];
    cols = Math.max(1, Math.round((w + 6) / (target + 6)));
    cw = clamp(Math.floor((w - (cols - 1) * 6) / cols), Math.round(target * 0.75), Math.round(target * 1.45));
    chh = Math.round(cw * 9 / 16) + 16;
    const rows = Math.ceil(filtered.length / cols);
    grid.style.height = Math.max(0, rows * (chh + 6)) + 'px';
    $('#binEmpty').style.display = FC.doc.assets.length ? 'none' : 'block';
    $('#binCount').textContent = filtered.length + (filtered.length !== FC.doc.assets.length ? ' / ' + FC.doc.assets.length : '');
    usedSet = new Set(FC.doc.clips.map(c => c.assetId));
    render();
  }

  function render() {
    if (!grid) return;
    const top = scroller.scrollTop, h = scroller.clientHeight;
    const rowH = chh + 6;
    const first = Math.max(0, Math.floor(top / rowH) - 1);
    const last = Math.min(Math.ceil(filtered.length / cols), Math.ceil((top + h) / rowH) + 1);
    const need = new Set();
    for (let r = first; r < last; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c; if (i >= filtered.length) break;
        const a = filtered[i]; need.add(a.id);
        let n = nodes.get(a.id);
        if (!n) { n = build(a); nodes.set(a.id, n); grid.appendChild(n); }
        n.style.transform = `translate(${c * (cw + 6)}px,${r * rowH}px)`;
        n.style.width = cw + 'px'; n.style.height = chh + 'px';
        n.classList.toggle('sel', S.sel.assets.has(a.id));
        n.classList.toggle('used', usedSet.has(a.id));
        paint(n, a);
      }
    }
    for (const [id, n] of nodes) if (!need.has(id)) { n.remove(); nodes.delete(id); }
  }

  function build(a) {
    const n = el('div', { class: 'mi', draggable: 'true', 'data-id': a.id, title: (a.rel || a.name) + '\n' + (a.kind === 'image' ? 'still' : U.dur(a.duration)) + (a.w ? ' · ' + a.w + '×' + a.h : '') });
    const cnv = el('canvas', { width: 160, height: 90 });
    n.appendChild(cnv);
    n.appendChild(el('div', { class: 'kind', style: 'background:' + (a.kind === 'video' ? '#3d9bff' : a.kind === 'image' ? '#f5a524' : '#31c48d') }));
    n.appendChild(el('div', { class: 'badge', text: a.kind === 'image' ? 'IMG' : U.dur(a.duration) }));
    n.appendChild(el('div', { class: 'meta', text: a.name }));
    n.addEventListener('mousedown', e => pick(a, e));
    n.addEventListener('dblclick', () => FC.app.appendAsset(a));
    n.addEventListener('contextmenu', e => { e.preventDefault(); if (!S.sel.assets.has(a.id)) pick(a, e); FC.app.assetMenu(e, a); });
    n.addEventListener('dragstart', e => {
      if (!S.sel.assets.has(a.id)) pick(a, e);
      const ids = Array.from(S.sel.assets);
      e.dataTransfer.setData('text/fluxcut-assets', JSON.stringify(ids));
      e.dataTransfer.effectAllowed = 'copy';
      n.classList.add('drag-ghost');
    });
    n.addEventListener('dragend', () => n.classList.remove('drag-ghost'));
    return n;
  }

  function paint(n, a) {
    const cnv = n.firstChild;
    if (cnv._done === a.id + ':' + (a._tv || 0)) return;
    const b = FC.media.poster(a);
    const g = cnv.getContext('2d');
    g.fillStyle = '#0a0b0d'; g.fillRect(0, 0, 160, 90);
    if (b) {
      const sc = Math.max(160 / b.width, 90 / b.height);
      g.drawImage(b, (160 - b.width * sc) / 2, (90 - b.height * sc) / 2, b.width * sc, b.height * sc);
      cnv._done = a.id + ':' + (a._tv || 0);
    } else if (a.kind === 'audio') {
      const w = FC.media.getWave(a.id);
      g.fillStyle = '#31c48d';
      if (w) { for (let x = 0; x < 160; x++) { const v = w.peaks[Math.floor(x / 160 * w.n)] || 0; g.fillRect(x, 45 - v * 40, 1, v * 80); } cnv._done = a.id + ':w'; }
      else { g.fillRect(0, 44, 160, 2); FC.media.ensureWave(a); }
    } else {
      g.fillStyle = '#1b1f26'; g.fillRect(0, 0, 160, 90);
      g.fillStyle = '#39414d'; g.font = '11px Inter'; g.textAlign = 'center';
      g.fillText(a.broken ? 'unreadable' : 'decoding…', 80, 48);
    }
  }
  function paintThumbs() { for (const [id, n] of nodes) { const a = S.assetById(id); if (a) paint(n, a); } }

  function pick(a, e) {
    const i = filtered.indexOf(a);
    if (e.shiftKey && lastClick >= 0) {
      const [x, y] = [Math.min(lastClick, i), Math.max(lastClick, i)];
      for (let k = x; k <= y; k++) S.sel.assets.add(filtered[k].id);
    } else if (e.ctrlKey || e.metaKey) {
      S.sel.assets.has(a.id) ? S.sel.assets.delete(a.id) : S.sel.assets.add(a.id);
    } else {
      if (!S.sel.assets.has(a.id) || S.sel.assets.size <= 1) { S.sel.assets.clear(); S.sel.assets.add(a.id); }
    }
    lastClick = i;
    render(); U.bus.emit('selassets');
  }

  function selectAll() { filtered.forEach(a => S.sel.assets.add(a.id)); render(); U.bus.emit('selassets'); }
  function selectNone() { S.sel.assets.clear(); render(); U.bus.emit('selassets'); }
  function selectedAssets() { return FC.doc.assets.filter(a => S.sel.assets.has(a.id)); }

  FC.bin = { init, layout, render, selectAll, selectNone, selectedAssets, filesFromDataTransfer, query: () => filtered };
})(window.FC);
