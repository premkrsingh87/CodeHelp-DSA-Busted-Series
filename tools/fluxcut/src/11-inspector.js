/* FluxCut Studio — inspector: clip / overlays / audio / sequence.
   Rebuilt from the document on every change, but never while you are typing in it. */
(function (FC) {
  'use strict';
  const U = FC.util, S = FC.store, O = FC.ops, { $, $$, el, esc, clamp } = U;
  let tab = 'clip', body;

  const BLENDS = ['normal', 'screen', 'multiply', 'overlay', 'lighten', 'darken', 'soft-light', 'hard-light', 'color-dodge', 'difference', 'exclusion', 'add'];

  function init() {
    body = $('#inspBody');
    $$('#inspTabs button').forEach(b => b.onclick = () => show(b.dataset.tab));
    U.bus.on('sel', render); U.bus.on('doc', softRender); U.bus.on('assets', softRender); U.bus.on('selassets', softRender);
    body.addEventListener('input', onInput);
    body.addEventListener('change', onInput);
    body.addEventListener('click', onClick);
    render();
  }
  function show(t) {
    tab = t;
    $$('#inspTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    render();
  }
  function softRender() { if (body && body.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return; render(); }
  const rerender = U.raf(() => render());

  function render() {
    if (!body) return;
    const scroll = body.scrollTop;
    body.innerHTML = tab === 'clip' ? clipTab() : tab === 'overlay' ? overlayTab() : tab === 'audio' ? audioTab() : seqTab();
    body.scrollTop = scroll;
    bindScrubbers();
  }

  /* ── small builders ────────────────────────────────────────────── */
  const sect = (title, inner, open) => `<details class="sect" ${open === false ? '' : 'open'}><summary>${title}</summary><div class="inner">${inner}</div></details>`;
  const row = (label, ctrl) => `<div class="row"><label>${label}</label>${ctrl}</div>`;
  const num = (k, v, step, min, max, extra) => `<input type="number" class="scrub" data-k="${k}" value="${v}" step="${step || 1}"${min != null ? ` min="${min}"` : ''}${max != null ? ` max="${max}"` : ''} ${extra || ''}>`;
  const txt = (k, v, extra) => `<input type="text" data-k="${k}" value="${esc(v)}" ${extra || ''}>`;
  const sel = (k, v, opts) => `<select data-k="${k}">${opts.map(o => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(lab)}</option>`; }).join('')}</select>`;
  const rng = (k, v, min, max, step) => `<input type="range" data-k="${k}" value="${v}" min="${min}" max="${max}" step="${step || 1}">`;
  const cbx = (k, v, label) => `<label class="cbx"><input type="checkbox" data-k="${k}"${v ? ' checked' : ''}> ${label}</label>`;
  const btn = (a, label, cls, title) => `<button class="btn ${cls || 'sm'}" data-a="${a}"${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
  const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${esc(v)}</b></div>`;

  /* ── CLIP ──────────────────────────────────────────────────────── */
  function clipTab() {
    const list = S.sel.list();
    if (!list.length) return emptyClip();
    if (list.length > 1) return multiClip(list);
    const c = list[0], a = S.assetById(c.assetId), d = FC.doc;
    const t = s => U.tc(s, d.timebase, d.ntsc, d.df);
    const hs = S.handles(c);
    return sect('Clip', `
      ${row('Name', txt('name', c.name || (a ? a.name : '')))}
      ${row('Start', `<input type="text" class="num" data-k="start" value="${t(c.start)}">`)}
      ${row('Duration', `<input type="text" class="num" data-k="dur" value="${t(c.dur)}">`)}
      ${row('Source in', `<input type="text" class="num" data-k="in" value="${t(c.in)}">`)}
      <div class="row"><label>Handles</label><div class="hint grow">${a && a.kind !== 'video' ? 'unlimited — a still can be any length' : 'head ' + U.dur(hs.head) + ' · tail ' + U.dur(hs.tail)}</div></div>
      <div class="row"><div class="split grow">${btn('nudgeL', '◂ frame')}${btn('nudgeR', 'frame ▸')}</div></div>
      <div class="row"><div class="split grow">${cbx('enabled', c.enabled, 'Enabled')}${cbx('locked', c.locked, 'Locked')}</div></div>
    `) + sect('Video', `
      ${row('Opacity', `${rng('opacity', c.opacity, 0, 100)}<span class="pill">${c.opacity}%</span>`)}
      ${row('Blend', sel('blend', c.blend, BLENDS))}
      ${row('Scale', sel('fit', (c.motion && c.motion.fit) || 'fill', [['fill', 'Fill frame (crop)'], ['fit', 'Fit inside (bars)'], ['stretch', 'Stretch']]))}
      ${row('Fade in', num('fadeIn', U.round2(c.fadeIn), 0.1, 0) + '<span class="pill">s</span>')}
      ${row('Fade out', num('fadeOut', U.round2(c.fadeOut), 0.1, 0) + '<span class="pill">s</span>')}
      ${a && a.kind !== 'video' ? `<div class="row">${cbx('kb', !!c.kb, 'Ken Burns move')}</div>` : ''}
    `) + sect('Transition in', `
      ${row('Type', sel('xfType', c.xf ? c.xf.type : 'none', [['none', 'Cut']].concat(Object.keys(FC.exportXml.XF_LABEL).map(k => [k, FC.exportXml.XF_LABEL[k]]))))}
      ${c.xf ? row('Length', num('xfDur', U.round2(c.xf.dur), 0.1, 0.04) + '<span class="pill">s</span>') : ''}
      <div class="hint">${a && a.kind === 'video' && hs.head < 0.5 ? '⚠ Only ' + U.dur(hs.head) + ' of handle before this clip — long dissolves will be trimmed by Premiere.' : 'Centred on the cut; uses handle from both sides.'}</div>
      <div class="row" style="margin-top:6px">${btn('xfAll', 'Apply to every cut', 'sm')}</div>
    `, false) + sect('Source', `
      ${a ? kv('File', a.name) + kv('Type', a.kind + (a.w ? ' · ' + a.w + '×' + a.h : '')) + kv('Length', U.dur(a.duration)) + kv('Path', FC.exportXml.resolvePath(a)) : '<div class="hint">Missing source</div>'}
      <div class="row" style="margin-top:8px">${btn('revealBin', 'Find in bin')}${btn('replace', 'Swap source…', 'sm', 'Replace this clip with the asset selected in the bin')}</div>
    `, false);
  }

  function emptyClip() {
    const d = FC.doc, dur = S.duration();
    const m = S.mainTrack(), n = m ? S.clipsOn(m.id).length : 0;
    return `<div class="insp-empty">Select a clip to edit it.<div class="hint" style="margin-top:6px">Or drag one on the timeline — clips push each other aside automatically.</div></div>` +
      sect('Sequence at a glance', `
      ${kv('Length', U.tc(dur, d.timebase, d.ntsc, d.df))}
      ${kv('Cuts on V1', n)}
      ${kv('Average clip', n ? U.dur(dur / n) : '—')}
      ${kv('Media used', new Set(FC.doc.clips.map(c => c.assetId)).size + ' of ' + FC.doc.assets.length)}
      <div class="row" style="margin-top:8px">${btn('selAllClips', 'Select all clips')}${btn('fitZoom', 'Zoom to fit')}</div>
    `);
  }

  function multiClip(list) {
    const total = list.reduce((s, c) => s + c.dur, 0);
    const opac = list[0].opacity;
    return sect(list.length + ' clips selected', `
      ${kv('Total', U.dur(total))}
      ${kv('Average', U.dur(total / list.length))}
      ${row('Set each to', num('multiDur', U.round2(list[0].dur), 0.1, 0.04) + `<span class="pill">s</span>` + btn('applyDur', 'Set'))}
      ${row('Fit into', `<input type="text" class="num" data-k="multiFit" value="${U.tc(total, FC.doc.timebase, FC.doc.ntsc, false)}">` + btn('applyFit', 'Fit'))}
      ${row('Opacity', rng('multiOpacity', opac, 0, 100) + `<span class="pill">${opac}%</span>`)}
      ${row('Blend', sel('multiBlend', list[0].blend, BLENDS))}
    `) + sect('Arrange', `
      <div class="split">${btn('shuffleSel', '⤮ Shuffle order')}${btn('reverseSel', '⇄ Reverse')}</div>
      <div class="split" style="margin-top:6px">${btn('rotL', '↤ Rotate')}${btn('rotR', 'Rotate ↦')}</div>
      <div class="split" style="margin-top:6px">${btn('swapSel', '⇋ Swap two')}${btn('evenSel', '≡ Even out')}</div>
      <div class="split" style="margin-top:6px">${btn('lockSel', '🔒 Lock')}${btn('unlockSel', '🔓 Unlock')}</div>
      <div class="row" style="margin-top:6px">${btn('delSel', 'Ripple delete', 'sm')}</div>
    `) + sect('Transitions', `
      ${row('Type', sel('multiXf', 'cross', Object.keys(FC.exportXml.XF_LABEL).map(k => [k, FC.exportXml.XF_LABEL[k]])))}
      ${row('Length', num('multiXfDur', FC.doc.build.xfDur, 0.1, 0.04) + '<span class="pill">s</span>')}
      <div class="split">${btn('xfSel', 'Apply to selection')}${btn('xfNone', 'Remove')}</div>
    `, false);
  }

  /* ── OVERLAYS ──────────────────────────────────────────────────── */
  function overlayTab() {
    const rules = FC.doc.overlays;
    const vtracks = S.videoTracks().slice(1);
    const selAsset = FC.bin ? FC.bin.selectedAssets()[0] : null;
    let out = sect('Add an overlay', `
      <div class="hint" style="margin-bottom:6px">Pick a file in the bin (a light leak, grain, dust, logo, LUT-style texture…), then add it as a rule. It repeats itself across the whole edit and re-flows whenever the cut changes.</div>
      ${row('Source', selAsset ? `<b style="font-size:11px">${esc(selAsset.name)}</b>` : '<span class="hint">nothing selected in the bin</span>')}
      ${row('Track', vtracks.length ? sel('newOvTrack', vtracks[0].id, vtracks.map(t => [t.id, t.name])) : '<span class="hint">add a V2 track first</span>')}
      <div class="row">${btn('addOverlay', '+ Add overlay rule', 'sm')}${btn('addVTrack', '+ Track')}</div>
    `);
    if (!rules.length) return out + `<div class="insp-empty">No overlay rules yet.</div>`;
    rules.forEach((r, i) => {
      const a = S.assetById(r.assetId);
      const t = S.trackById(r.track);
      out += sect(`${i + 1}. ${esc(a ? a.name : 'missing')} <span class="pill">${esc(t ? t.name : '?')}</span>`, `
        ${row('Enabled', cbx('ov.enabled.' + r.id, r.enabled, r.enabled ? 'on' : 'off'))}
        ${row('Repeat', sel('ov.mode.' + r.id, r.mode, [['cover', 'Cover whole edit'], ['interval', 'Every N seconds'], ['cuts', 'On every cut'], ['random', 'Random hits']]))}
        ${r.mode === 'interval' ? row('Every', num('ov.every.' + r.id, r.every, 0.5, 0.2) + '<span class="pill">s</span>') : ''}
        ${r.mode === 'random' ? row('Per minute', num('ov.perMinute.' + r.id, r.perMinute, 1, 1)) : ''}
        ${r.mode !== 'cover' ? row('Length', num('ov.dur.' + r.id, r.dur, 0.1, 0.1) + '<span class="pill">s</span>') : row('Gap', num('ov.gap.' + r.id, r.gap, 0.1, 0) + '<span class="pill">s</span>')}
        ${row('Offset', num('ov.offset.' + r.id, r.offset, 0.1) + '<span class="pill">s</span>')}
        ${row('Opacity', rng('ov.opacity.' + r.id, r.opacity, 0, 100) + `<span class="pill">${r.opacity}%</span>`)}
        ${row('Blend', sel('ov.blend.' + r.id, r.blend, BLENDS))}
        ${row('Fade', num('ov.fadeIn.' + r.id, r.fadeIn, 0.05, 0) + num('ov.fadeOut.' + r.id, r.fadeOut, 0.05, 0))}
        ${row('Scale', sel('ov.scaleFit.' + r.id, r.scaleFit, [['fill', 'Fill'], ['fit', 'Fit'], ['stretch', 'Stretch']]))}
        <div class="row" style="margin-top:6px">${btn('ovReroll.' + r.id, '⚄ Re-roll')}${btn('ovDel.' + r.id, 'Remove')}</div>
        <div class="hint">${countFor(r)} instances · opacity exports to Premiere, blend mode is preview + ffmpeg only.</div>
      `, i === 0);
    });
    return out;
  }
  function countFor(r) { return FC.doc.clips.filter(c => c.ruleId === r.id).length; }

  /* ── AUDIO ─────────────────────────────────────────────────────── */
  function audioTab() {
    const aTracks = S.audioTracks();
    const selAsset = (FC.bin ? FC.bin.selectedAssets() : []).filter(a => a.kind === 'audio')[0];
    const clips = [].concat(...aTracks.map(t => S.clipsOn(t.id)));
    let beatInfo = '';
    for (const c of clips) {
      const w = FC.media.getWave(c.assetId);
      if (w && w.bpm) { beatInfo = `${w.bpm} BPM · ${w.beats.length} beats detected`; break; }
    }
    let out = sect('Add audio', `
      <div class="hint" style="margin-bottom:6px">Drop a music bed or a voiceover in the bin, select it here, then place it. Set “Fill to → Audio length” in the Build bar and every cut lands inside the track.</div>
      ${row('Source', selAsset ? `<b style="font-size:11px">${esc(selAsset.name)}</b>` : '<span class="hint">select an audio file in the bin</span>')}
      ${row('Track', sel('newAudioTrack', aTracks[0] ? aTracks[0].id : '', aTracks.map(t => [t.id, t.name])))}
      <div class="row">${btn('addAudio', '+ Place at start', 'sm')}${btn('addAudioHere', '+ Place at playhead')}</div>
    `);
    out += sect('Rhythm', `
      ${kv('Analysis', beatInfo || 'no beat grid yet')}
      <div class="row">${btn('analyse', 'Detect beats')}${btn('snapCuts', 'Snap cuts to beats')}</div>
      <div class="hint">Build ▸ pattern “Beat-synced” cuts every N beats. Snapping moves existing cuts onto the nearest beat without changing the running order.</div>
    `);
    if (clips.length) {
      out += sect('Audio clips', clips.map((c, i) => {
        const a = S.assetById(c.assetId);
        return `<div style="border-bottom:1px solid var(--line);padding:6px 0">
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:4px"><b style="font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a ? a.name : '?')}</b>${btn('acSel.' + c.id, 'Select')}</div>
          ${row('Start', `<input type="text" class="num" data-k="ac.start.${c.id}" value="${U.tc(c.start, FC.doc.timebase, FC.doc.ntsc, false)}">`)}
          ${row('Length', `<input type="text" class="num" data-k="ac.dur.${c.id}" value="${U.tc(c.dur, FC.doc.timebase, FC.doc.ntsc, false)}">`)}
          ${row('Gain dB', num('ac.volume.' + c.id, c.volume, 1, -60, 12))}
          ${row('Fades', num('ac.fadeIn.' + c.id, c.fadeIn, 0.1, 0) + num('ac.fadeOut.' + c.id, c.fadeOut, 0.1, 0))}
        </div>`;
      }).join(''));
    }
    out += sect('Fit', `
      <div class="split">${btn('fitToAudio', 'Fit video to audio')}${btn('fitAudioToVideo', 'Trim audio to video')}</div>
      <div class="hint" style="margin-top:6px">“Fit video to audio” stretches every clip on V1 proportionally so the picture ends exactly with the track.</div>
    `, false);
    return out;
  }

  /* ── SEQUENCE ──────────────────────────────────────────────────── */
  function seqTab() {
    const d = FC.doc, m = FC.media.memoryStats(), p = FC.player.stats();
    return sect('Output', `
      ${row('Name', txt('seqName', d.name))}
      ${row('Frame rate', sel('seqFps', d.ntsc ? (d.timebase * 1000 / 1001).toFixed(3).replace(/0+$/, '') : String(d.timebase), Object.keys(U.FPS_TABLE)))}
      ${row('Size', `${num('seqW', d.width, 2, 16)}${num('seqH', d.height, 2, 16)}`)}
      ${row('Timecode', cbx('seqDf', d.df, 'Drop-frame (NTSC)'))}
    `) + sect('Where your media lives', `
      <div class="hint" style="margin-bottom:6px">Browsers never reveal a real folder path, so tell FluxCut once where these files sit and every export points straight at them.</div>
      ${row('Path style', sel('pathMode', d.pathMode, [['absolute', 'Absolute (media stays put)'], ['relative', 'Relative (XML next to media)']]))}
      ${d.pathMode === 'absolute' ? row('Media root', txt('mediaRoot', d.mediaRoot, 'placeholder="C:\\\\Footage\\\\ProjectX"')) : ''}
      ${d.pathMode === 'absolute' ? row('Separator', sel('winPaths', d.winPaths ? '1' : '0', [['1', 'Windows  \\'], ['0', 'macOS / Linux  /']])) : ''}
      <div class="hint field-mono" style="margin-top:6px;word-break:break-all">${esc(samplePath())}</div>
      <div class="row" style="margin-top:6px">${btn('checkPaths', 'Check every path')}</div>
    `) + sect('Markers', `
      ${d.markers.length ? d.markers.map((mk, i) => `<div class="kv"><span>${U.tc(mk.t, d.timebase, d.ntsc, d.df)}</span><b>${esc(mk.name || '—')} <button class="btn sm icon" data-a="mkDel.${i}">✕</button></b></div>`).join('') : '<div class="hint">None yet — press M on the timeline.</div>'}
    `, false) + sect('Performance', `
      ${kv('Thumbnails in RAM', m.bitmaps + ' · ' + U.bytes(m.bitmapBytes))}
      ${kv('Decoders open', p.slots + ' video · ' + p.images + ' image')}
      ${kv('Object URLs', m.urls)}
      ${kv('Monitor', p.fps + ' fps drawn')}
      ${kv('Assets / files', m.assets + ' / ' + m.files)}
      <div class="row" style="margin-top:8px">${btn('trimCache', 'Release cached frames')}${btn('clearIdb', 'Clear disk cache')}</div>
      <div class="hint">Thumbnails live on disk in IndexedDB, so reopening this project costs no decoding at all.</div>
    `, false) + sect('Danger', `
      <div class="split">${btn('clearTimeline', 'Clear timeline')}${btn('newProject', 'New project')}</div>
    `, false);
  }
  function samplePath() {
    const a = FC.doc.assets[0];
    return a ? FC.exportXml.resolvePath(a) : 'C:\\Footage\\ProjectX\\shot_001.mp4';
  }

  /* ── input handling ────────────────────────────────────────────── */
  function onInput(e) {
    const k = e.target.dataset.k; if (!k) return;
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const d = FC.doc;
    const num = parseFloat(v), tcv = () => U.parseTc(v, d.timebase, d.ntsc);
    const one = S.sel.list()[0];
    const live = e.type === 'input';

    // ov.<field>.<id> and ac.<field>.<id>
    if (k.startsWith('ov.')) {
      const [, f, id] = k.split('.');
      const r = d.overlays.find(x => x.id === id); if (!r) return;
      S.edit('Overlay', () => { r[f] = e.target.type === 'checkbox' ? v : (isNaN(num) ? v : num); FC.director.rebuildOverlays(); });
      if (!live) rerender(); else updatePill(e.target);
      return;
    }
    if (k.startsWith('ac.')) {
      const [, f, id] = k.split('.');
      const c = S.clipById(id); if (!c) return;
      S.edit('Audio clip', () => { c[f] = (f === 'start' || f === 'dur') ? O.q(tcv()) : num; });
      return;
    }
    switch (k) {
      case 'name': S.edit('Rename', () => one && (one.name = v)); break;
      case 'start': S.edit('Move', () => { if (one) { one.start = O.q(tcv()); O.resolveOverlaps(one.track); } }); break;
      case 'dur': S.edit('Duration', () => { if (one) { one.dur = Math.max(O.frame(), O.q(tcv())); O.refit(one); O.closeGaps(one.track); FC.director.rebuildOverlays(); } }); break;
      case 'in': S.edit('Slip', () => { if (one) { one.in = Math.max(0, O.q(tcv())); O.refit(one); } }); break;
      case 'enabled': S.edit('Enable', () => one && (one.enabled = v)); break;
      case 'locked': S.edit('Lock', () => one && (one.locked = v)); break;
      case 'opacity': S.edit('Opacity', () => one && (one.opacity = num)); updatePill(e.target); break;
      case 'blend': S.edit('Blend', () => one && (one.blend = v)); break;
      case 'fit': S.edit('Scale', () => { if (one) { one.motion = Object.assign({}, one.motion, { fit: v }); } }); break;
      case 'fadeIn': S.edit('Fade', () => one && (one.fadeIn = Math.max(0, num))); break;
      case 'fadeOut': S.edit('Fade', () => one && (one.fadeOut = Math.max(0, num))); break;
      case 'kb': S.edit('Ken Burns', () => { if (one) one.kb = v ? FC.director.kenBurns(U.rng(Date.now() & 255), FC.doc.build.kbAmount) : null; }); break;
      case 'xfType': S.edit('Transition', () => {
        if (!one) return;
        one.xf = v === 'none' ? null : { type: v, dur: Math.min(FC.doc.build.xfDur, one.dur * .9), align: 'center' };
        if (one.xf) O.applyTransitions(one.track, v, one.xf.dur, 0) && 0;
      }); rerender(); break;
      case 'xfDur': S.edit('Transition', () => { if (one && one.xf) one.xf.dur = Math.max(0.04, num); }); break;
      case 'multiOpacity': S.edit('Opacity', () => S.sel.list().forEach(c => c.opacity = num)); updatePill(e.target); break;
      case 'multiBlend': S.edit('Blend', () => S.sel.list().forEach(c => c.blend = v)); break;
      case 'seqName': FC.doc.name = v; $('#projName').value = v; break;
      case 'seqFps': FC.app.setFps(v); break;
      case 'seqW': S.edit('Resolution', () => { d.width = Math.round(num); }); FC.player.setQuality(FC.player.quality); break;
      case 'seqH': S.edit('Resolution', () => { d.height = Math.round(num); }); FC.player.setQuality(FC.player.quality); break;
      case 'seqDf': d.df = v; U.bus.emit('doc'); break;
      case 'pathMode': S.edit('Paths', () => d.pathMode = v); rerender(); break;
      case 'mediaRoot': d.mediaRoot = v; FC.doc.dirty = true; updateSample(); break;
      case 'winPaths': S.edit('Paths', () => d.winPaths = v === '1'); rerender(); break;
    }
    U.bus.emit('doc');
  }
  function updatePill(input) {
    const p = input.parentElement.querySelector('.pill');
    if (p) p.textContent = input.value + (input.dataset.k.includes('pacity') ? '%' : '');
  }
  function updateSample() { const n = body.querySelector('.field-mono'); if (n) n.textContent = samplePath(); }

  function onClick(e) {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const [a, arg] = b.dataset.a.split('.');
    FC.app.inspectorAction(a, arg, b);
  }

  /* ── drag-to-scrub on number fields ────────────────────────────── */
  function bindScrubbers() {
    $$('#inspBody input.scrub').forEach(inp => {
      inp.onmousedown = (e) => {
        if (e.target !== inp) return;
        const startX = e.clientX, v0 = parseFloat(inp.value) || 0, step = parseFloat(inp.step) || 1;
        let moved = false;
        const mv = (ev) => {
          const dx = ev.clientX - startX;
          if (Math.abs(dx) < 3 && !moved) return;
          moved = true; document.body.style.cursor = 'ew-resize';
          const mult = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
          inp.value = U.round3(v0 + Math.round(dx / 3) * step * mult);
          inp.dispatchEvent(new Event('input', { bubbles: true }));
        };
        const up = () => {
          window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up);
          document.body.style.cursor = '';
          if (moved) inp.dispatchEvent(new Event('change', { bubbles: true }));
        };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      };
    });
  }

  FC.inspector = { init, show, render, get tab() { return tab; } };
})(window.FC);
