/* FluxCut Studio — application shell: wiring, shortcuts, modals, export. */
(function (FC) {
  'use strict';
  const U = FC.util, S = FC.store, O = FC.ops, D = () => FC.doc;
  const { $, $$, el, esc, clamp } = U;

  const app = {};
  let autosaveTimer = null;

  /* ══════════ init ══════════ */
  function init() {
    FC.timeline.init();
    FC.player.init();
    FC.bin.init();
    FC.inspector.init();
    FC.storyboard.init();
    bindTop(); bindTransport(); bindDirector(); bindTimelineTools(); bindResizers(); bindKeys(); bindGlobalDnD(); bindFocus();
    syncChrome();
    U.bus.on('doc', U.raf(() => { syncChrome(); syncTime(); }));
    U.bus.on('sel', U.raf(syncSelInfo));
    U.bus.on('time', U.raf(syncTime));
    U.bus.on('play', p => { $('#playBtn').textContent = p ? '⏸' : '▶'; });
    U.bus.on('hist', () => {
      $('#undoBtn').disabled = !S.hist.past.length;
      $('#redoBtn').disabled = !S.hist.future.length;
    });
    U.bus.on('rootguess', () => FC.inspector.render());
    setInterval(vuTick, 90);
    autosaveTimer = setInterval(autosave, 20000);
    window.addEventListener('beforeunload', e => { if (FC.doc.dirty && FC.doc.clips.length) { e.preventDefault(); e.returnValue = ''; } });
    restoreLast();
    patternArgs();
    U.toast('FluxCut ready — drop media anywhere to start', 'ok', 2600);
  }

  /* ══════════ top bar ══════════ */
  function bindTop() {
    $('#projName').oninput = e => { FC.doc.name = e.target.value; FC.doc.dirty = true; };
    $$('#fpsSeg button').forEach(b => b.onclick = () => setFps(b.dataset.fps));
    $('#resSel').onchange = e => {
      if (e.target.value === 'custom') { FC.inspector.show('seq'); return; }
      const [w, h] = e.target.value.split('x').map(Number);
      S.edit('Resolution', () => { FC.doc.width = w; FC.doc.height = h; });
      FC.player.setQuality(FC.player.quality);
    };
    $('#undoBtn').onclick = () => S.undo();
    $('#redoBtn').onclick = () => S.redo();
    $('#addFilesBtn').onclick = () => $('#filePicker').click();
    $('#addFolderBtn').onclick = () => $('#folderPicker').click();
    $('#filePicker').onchange = e => { importFiles(e.target.files); e.target.value = ''; };
    $('#folderPicker').onchange = e => { importFiles(e.target.files); e.target.value = ''; };
    $('#projPicker').onchange = e => { const f = e.target.files[0]; if (f) openProjectFile(f); e.target.value = ''; };
    $('#saveBtn').onclick = saveProject;
    $('#openBtn').onclick = openDialog;
    $('#exportBtn').onclick = exportDialog;
    $('#helpBtn').onclick = helpDialog;
    $('#settingsBtn').onclick = () => FC.inspector.show('seq');
    $('#chipMem').onclick = () => { const s = FC.media.trim(); U.toast('Released ' + s.bitmaps + ' cached frames'); syncChrome(); };
    $('#selAllBtn').onclick = () => FC.bin.selectAll();
    $('#selNoneBtn').onclick = () => FC.bin.selectNone();
    $('#binShuffleBtn').onclick = () => { $('#binSort').value = 'random'; FC.bin.layout(); };
    $('#binRemoveBtn').onclick = removeSelectedAssets;
    $('#modalX').onclick = closeModal;
    $('#modalScrim').onclick = e => { if (e.target.id === 'modalScrim') closeModal(); };
  }

  function setFps(v) {
    const f = U.FPS_TABLE[v]; if (!f) return;
    S.edit('Frame rate', () => { FC.doc.timebase = f.tb; FC.doc.ntsc = f.ntsc; FC.doc.df = f.ntsc; });
    $$('#fpsSeg button').forEach(b => b.classList.toggle('on', b.dataset.fps === v));
    syncChrome();
  }

  /* ══════════ transport ══════════ */
  function bindTransport() {
    $('#playBtn').onclick = () => FC.player.toggle();
    $('#goStartBtn').onclick = () => FC.player.seek(0);
    $('#goEndBtn').onclick = () => FC.player.seek(S.duration());
    $('#frameBackBtn').onclick = () => FC.player.step(-1);
    $('#frameFwdBtn').onclick = () => FC.player.step(1);
    $('#loopBtn').onclick = e => { FC.player.loop = !FC.player.loop; e.currentTarget.classList.toggle('on', FC.player.loop); };
    $('#srcAudioChk').onchange = e => FC.player.srcAudio = e.target.checked;
    $('#qualitySel').onchange = e => { FC.player.setQuality(parseFloat(e.target.value)); $('#monQualTag').textContent = e.target.selectedOptions[0].textContent; };
    $('#safeBtn').onclick = e => { FC.player.guides = !FC.player.guides; e.currentTarget.classList.toggle('on', FC.player.guides); FC.player.draw(); };
    $('#fsBtn').onclick = () => { const w = $('#monitorWrap'); (document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen()).catch(() => { }); };
  }
  function vuTick() {
    const v = FC.player.level();
    const bar = $('#vuBar'); if (bar) bar.style.right = (100 - Math.min(100, v * 130)) + '%';
  }
  function syncTime() {
    const d = FC.doc, t = FC.player.time;
    $('#tc').textContent = U.tc(t, d.timebase, d.ntsc, d.df);
    const c = FC.player.currentClip();
    const tag = $('#monClipTag');
    if (tag) tag.textContent = c ? (c.name || '—') : '—';
    FC.timeline.invalidate();
    if (FC.player.playing) FC.timeline.follow(t);
  }

  /* ══════════ director strip ══════════ */
  function bindDirector() {
    const b = () => FC.doc.build;
    $('#dirPattern').onchange = e => { b().pattern = e.target.value; patternArgs(); };
    $('#dirOrder').onchange = e => b().order = e.target.value;
    $('#dirNoRepeat').onchange = e => b().noRepeat = e.target.checked;
    $('#dirTake').onchange = e => b().take = e.target.value;
    $('#dirTarget').onchange = e => {
      b().target = e.target.value;
      $('#dirTargetTime').style.display = e.target.value === 'time' ? '' : 'none';
    };
    $('#dirTargetTime').onchange = e => b().targetTime = U.parseTc(e.target.value, FC.doc.timebase, FC.doc.ntsc);
    $('#dirLoopPool').onchange = e => b().loopPool = e.target.checked;
    $('#dirSeed').oninput = e => b().seed = parseInt(e.target.value) || 1;
    $('#dirReseed').onclick = () => { b().seed = Math.floor(Math.random() * 99999); $('#dirSeed').value = b().seed; doBuild(); };
    $('#buildBtn').onclick = () => doBuild();
    $('#reshuffleBtn').onclick = () => doReshuffle('order');
    $('#dirMoreBtn').onclick = buildOptionsDialog;
  }
  function patternArgs() {
    const b = FC.doc.build, host = $('#dirPatternArgs');
    const n = (k, v, step, min, suffix) => `<input type="number" data-b="${k}" value="${v}" step="${step}" ${min != null ? 'min=' + min : ''}>${suffix ? `<label>${suffix}</label>` : ''}`;
    const map = {
      full: '<label style="color:var(--txt-3)">whole clips</label>',
      fixed: n('fixed', b.fixed, 0.5, 0.1, 'sec'),
      range: n('min', b.min, 0.5, 0.1, 'to') + n('max', b.max, 0.5, 0.1, 'sec'),
      pattern: `<input type="text" data-b="patternStr" value="${esc(b.patternStr)}" style="width:96px" title="Comma-separated lengths, repeated">`,
      beat: n('beatsPer', b.beatsPer, 1, 1, 'beats'),
      accel: n('accelFrom', b.accelFrom, 0.5, 0.1, '→') + n('accelTo', b.accelTo, 0.5, 0.1, 'sec'),
      decel: n('accelFrom', b.accelFrom, 0.5, 0.1, '→') + n('accelTo', b.accelTo, 0.5, 0.1, 'sec')
    };
    host.innerHTML = map[b.pattern] || '';
    $$('#dirPatternArgs [data-b]').forEach(i => i.onchange = e => {
      const k = e.target.dataset.b;
      b[k] = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
    });
    $('#dirTargetTime').style.display = b.target === 'time' ? '' : 'none';
  }

  function doBuild() {
    const r = FC.director.build();
    if (r.error) return U.toast(r.error, 'err');
    FC.timeline.fit();
    U.toast(`Built ${r.clips} clips · ${U.dur(r.duration)}`);
    FC.player.seek(0);
  }
  function doReshuffle(mode) {
    const n = FC.director.reshuffle(mode);
    $('#dirSeed').value = FC.doc.build.seed;
    if (!n) return U.toast('Nothing to shuffle', 'warn');
    U.toast((mode === 'content' ? 'Reshuffled sources in ' : 'Reshuffled ') + n + ' clips · seed ' + FC.doc.build.seed);
  }

  /* ══════════ timeline tools ══════════ */
  function bindTimelineTools() {
    $$('#toolSeg button').forEach(b => b.onclick = () => {
      $$('#toolSeg button').forEach(x => x.classList.toggle('on', x === b));
      FC.timeline.setTool(b.dataset.tool);
    });
    const v = FC.timeline.view;
    $('#snapBtn').classList.toggle('on', v.snap);
    $('#snapBtn').onclick = e => { v.snap = !v.snap; e.currentTarget.classList.toggle('on', v.snap); };
    $('#dragModeSel').value = v.dragMode;
    $('#trimModeSel').value = v.trimMode;
    $('#dragModeSel').onchange = e => { v.dragMode = e.target.value; e.target.blur(); U.toast(DRAG_HELP[v.dragMode], 'info', 3000); };
    $('#trimModeSel').onchange = e => { v.trimMode = e.target.value; e.target.blur(); U.toast(TRIM_HELP[v.trimMode], 'info', 3000); };
    $('#sbToggle').onclick = () => toggleStoryboard();
    $('#fitAudioQuick').onclick = () => inspectorAction('fitToAudio');
    $('#splitBtn').onclick = splitAtPlayhead;
    $('#delBtn').onclick = () => deleteSelection(true);
    $('#lockClipBtn').onclick = () => {
      const l = S.sel.list();
      if (!l.length) return U.toast('Select the clips you want to pin in place first', 'warn');
      const on = !l.every(c => c.locked);
      S.edit('Lock', () => l.forEach(c => c.locked = on));
      U.toast(on ? l.length + ' clip' + (l.length > 1 ? 's' : '') + ' locked — builds and shuffles flow around them' : 'Unlocked');
    };
    $('#markerBtn').onclick = addMarker;
    $('#addVBtn').onclick = () => { S.edit('Add track', () => S.addTrack('video')); FC.inspector.render(); };
    $('#addABtn').onclick = () => { S.edit('Add track', () => S.addTrack('audio')); FC.inspector.render(); };
    $('#zoomInBtn').onclick = () => FC.timeline.zoomBy(1.4, FC.player.time);
    $('#zoomOutBtn').onclick = () => FC.timeline.zoomBy(1 / 1.4, FC.player.time);
    $('#fitBtn').onclick = () => FC.timeline.fit();
    $('#zoomRange').oninput = e => {
      const p = e.target.value / 1000;
      FC.timeline.zoomTo(Math.exp(U.lerp(Math.log(0.25), Math.log(600), p)), FC.player.time);
    };
    U.bus.on('view', U.raf(() => {
      const p = (Math.log(FC.timeline.view.pps) - Math.log(0.25)) / (Math.log(600) - Math.log(0.25));
      $('#zoomRange').value = Math.round(clamp(p, 0, 1) * 1000);
    }));
  }

  const DRAG_HELP = {
    insert: 'Insert — dropping a clip between two others pushes the rest along. Hold Alt to move freely.',
    overwrite: 'Free — clips go exactly where you drop them and can leave gaps. Hold Alt to insert instead.',
    swap: 'Swap — drag one clip onto another and the two trade places, keeping every length.'
  };
  const TRIM_HELP = {
    ripple: 'Ripple — dragging an edge moves everything after it, so the cut never leaves a hole.',
    roll: 'Roll — dragging a cut takes frames from one clip and gives them to its neighbour. Total length never changes.',
    gap: 'Leave gap — only this clip changes; the hole stays where it is.'
  };

  function toggleStoryboard(force) {
    const on = force == null ? !FC.storyboard.visible : force;
    FC.storyboard.setVisible(on);
    $('#sbToggle').classList.toggle('on', on);
  }

  function splitAtPlayhead() {
    const t = FC.player.time;
    S.edit('Split', () => {
      const targets = S.sel.clips.size ? S.sel.list() : FC.doc.clips.filter(c => t > c.start && t < c.start + c.dur);
      const made = [];
      targets.forEach(c => { if (t > c.start && t < c.start + c.dur) { const b = O.split(c, t); if (b) made.push(b.id); } });
      if (made.length) S.sel.set(made);
      if (!made.length) U.toast('Playhead is not over a clip', 'warn');
    });
  }
  function deleteSelection(ripple) {
    if (!S.sel.clips.size) return U.toast('Select a clip first — click one on the timeline or a storyboard card', 'warn');
    S.edit('Delete', () => {
      const n = O.deleteClips(new Set(S.sel.clips), ripple);
      S.sel.clear(); FC.director.rebuildOverlays();
      U.toast(n + ' clip' + (n > 1 ? 's' : '') + ' removed');
    });
  }
  function addMarker() {
    S.edit('Marker', () => FC.doc.markers.push({ t: O.q(FC.player.time), name: 'M' + (FC.doc.markers.length + 1), color: '#f5a524', note: '' }));
  }

  /* ══════════ import / placement ══════════ */
  async function importFiles(files) {
    const added = await FC.media.ingest(files);
    FC.bin.layout();
    if (added.length && !FC.doc.clips.length) U.toast('Press B to auto-build a sequence from these', 'info', 4200);
    return added;
  }
  function appendAsset(a) {
    const t = a.kind === 'audio' ? S.audioTracks()[0] : (S.trackById(S.sel.targetTrack) || S.mainTrack());
    S.edit('Add clip', () => {
      const c = O.clipFromAsset(a, { track: t.id, start: O.trackEnd(t.id) });
      FC.doc.clips.push(c); S.bump(); S.sel.set([c.id]);
      FC.director.rebuildOverlays();
    });
    FC.timeline.scrollTo(O.trackEnd(t.id));
  }
  function dropAssets(ids, trackId, t) {
    const track = S.trackById(trackId); if (!track) return;
    const assets = ids.map(id => S.assetById(id)).filter(a => a && (track.kind === 'audio' ? a.kind === 'audio' : a.kind !== 'audio'));
    if (!assets.length) return U.toast(track.kind === 'audio' ? 'Audio track takes audio files' : 'Video track takes video or images', 'warn');
    S.edit('Place clips', () => {
      const clips = assets.map(a => O.clipFromAsset(a, { track: trackId }));
      const others = S.clipsOn(trackId);
      let idx = others.length;
      for (let i = 0; i < others.length; i++) if (t < others[i].start + others[i].dur / 2) { idx = i; break; }
      if (FC.timeline.view.insert && others.length) O.insertAt(trackId, clips, idx);
      else { let x = O.q(t); clips.forEach(c => { c.start = x; x = O.q(x + c.dur); FC.doc.clips.push(c); }); S.bump(); O.resolveOverlaps(trackId); }
      S.sel.set(clips.map(c => c.id));
      FC.director.rebuildOverlays();
    });
    U.toast(assets.length + ' placed on ' + track.name);
  }
  function removeSelectedAssets() {
    const ids = Array.from(S.sel.assets);
    if (!ids.length) return U.toast('Nothing selected in the bin', 'warn');
    const used = ids.filter(id => FC.doc.clips.some(c => c.assetId === id));
    confirmDialog('Remove ' + ids.length + ' file' + (ids.length > 1 ? 's' : '') + ' from the bin?',
      used.length ? used.length + ' of them are used on the timeline — those clips will be removed too.' : 'They stay on your disk; only the bin entry goes.',
      () => {
        S.edit('Remove media', () => {
          FC.doc.clips = FC.doc.clips.filter(c => ids.indexOf(c.assetId) < 0);
          FC.doc.assets = FC.doc.assets.filter(a => ids.indexOf(a.id) < 0);
          FC.doc.overlays = FC.doc.overlays.filter(r => ids.indexOf(r.assetId) < 0);
          FC.media.forget(ids); S.sel.assets.clear(); S.bump();
        });
        FC.bin.layout();
      });
  }

  function bindGlobalDnD() {
    window.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', async e => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      if (e.target.closest('#tlCanvas') || e.target.closest('#binScroll')) return;
      const files = await FC.bin.filesFromDataTransfer(e.dataTransfer);
      if (files.length) importFiles(files);
    });
  }

  /* ══════════ chrome sync ══════════ */
  function syncChrome() {
    const d = FC.doc;
    $('#chipClips').innerHTML = '<b>' + d.clips.length + '</b> clips';
    $('#chipDur').innerHTML = '<b>' + U.tc(S.duration(), d.timebase, d.ntsc, d.df) + '</b>';
    $('#tcTotal').textContent = '/ ' + U.tc(S.duration(), d.timebase, d.ntsc, d.df);
    const m = FC.media.memoryStats();
    $('#chipMem').innerHTML = '<span class="dot" style="background:' + (m.bitmapBytes > 190e6 ? 'var(--warn)' : 'var(--ok)') + '"></span><b>' + Math.round(m.bitmapBytes / 1048576) + '</b> MB';
    $('#monResTag').textContent = d.width + '×' + d.height;
    $('#monFpsTag').textContent = U.realFps(d.timebase, d.ntsc).toFixed(2) + ' fps';
    const fpsKey = d.ntsc ? (d.timebase === 24 ? '23.976' : d.timebase === 30 ? '29.97' : '59.94') : String(d.timebase);
    $$('#fpsSeg button').forEach(b => b.classList.toggle('on', b.dataset.fps === fpsKey));
    const rv = d.width + 'x' + d.height;
    if ($('#resSel').value !== rv) { const has = Array.from($('#resSel').options).some(o => o.value === rv); if (has) $('#resSel').value = rv; }
    if ($('#projName').value !== d.name) $('#projName').value = d.name;
    syncSelInfo();
  }
  function syncSelInfo() {
    const n = S.sel.clips.size;
    const total = S.sel.list().reduce((s, c) => s + c.dur, 0);
    $('#selInfo').textContent = n ? n + ' selected · ' + U.dur(total) : '0 selected';
  }

  /* ══════════ keyboard ══════════ */
  /** Typing in a field must not permanently disarm the app's shortcuts. */
  function bindFocus() {
    // a select hands the keyboard back the moment you pick something
    document.addEventListener('change', e => {
      if (e.target.tagName === 'SELECT' && !e.target.closest('#modal')) e.target.blur();
    }, true);
    // clicking the picture, the timeline or the storyboard means "I'm editing again"
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest('#tlCanvas, #monitorWrap, #sbScroll, #binScroll, #trackHeads')) return;
      const a = document.activeElement;
      if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) a.blur();
    }, true);
  }

  const NUM_KEYS = /^([0-9.,\-+eE]|Arrow|Backspace|Delete|Tab|Home|End|Page)/;
  const SELECT_OWNED = [' ', 'Enter', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  function bindKeys() {
    window.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape' || e.key === 'Enter') { e.target.blur(); e.preventDefault(); return; }
        // A number field only needs digits and arrows. Letting Space or B or S sit
        // there doing nothing is how the whole app appears to stop responding.
        const numeric = tag === 'INPUT' && e.target.type === 'number';
        if (!numeric || NUM_KEYS.test(e.key) || e.ctrlKey || e.metaKey || e.altKey) return;
        e.target.blur();
      }
      if (tag === 'SELECT') {
        // the select keeps the keys it genuinely uses; everything else reaches the app
        if (SELECT_OWNED.indexOf(e.key) >= 0) { if (e.key === 'Escape') e.target.blur(); return; }
      }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key;
      if (mod) {
        switch (k.toLowerCase()) {
          case 'z': e.preventDefault(); e.shiftKey ? S.redo() : S.undo(); return;
          case 'y': e.preventDefault(); S.redo(); return;
          case 's': e.preventDefault(); saveProject(); return;
          case 'o': e.preventDefault(); openDialog(); return;
          case 'e': e.preventDefault(); exportDialog(); return;
          case 'a': e.preventDefault(); S.sel.set(FC.doc.clips.map(c => c.id)); return;
          case 'k': e.preventDefault(); splitAtPlayhead(); return;
          case 'd': e.preventDefault(); duplicateSelection(); return;
          case 'i': e.preventDefault(); $('#filePicker').click(); return;
        }
        return;
      }
      switch (k) {
        case ' ': e.preventDefault(); FC.player.toggle(); break;
        case 'ArrowLeft': e.preventDefault(); e.altKey ? rotateSel(-1) : FC.player.step(e.shiftKey ? -Math.round(S.fps()) : -1); break;
        case 'ArrowRight': e.preventDefault(); e.altKey ? rotateSel(1) : FC.player.step(e.shiftKey ? Math.round(S.fps()) : 1); break;
        case 'ArrowUp': e.preventDefault(); jumpCut(-1); break;
        case 'ArrowDown': e.preventDefault(); jumpCut(1); break;
        case 'Home': FC.player.seek(0); break;
        case 'End': FC.player.seek(S.duration()); break;
        case 'Delete': case 'Backspace': e.preventDefault(); deleteSelection(e.shiftKey || FC.timeline.view.ripple); break;
        case 'Escape': S.sel.clear(); closeModal(); break;
        case '?': helpDialog(); break;
        case '+': case '=': FC.timeline.zoomBy(1.4, FC.player.time); break;
        case '-': case '_': FC.timeline.zoomBy(1 / 1.4, FC.player.time); break;
        case '[': nudge(-1); break;
        case ']': nudge(1); break;
        case 'Tab': e.preventDefault(); toggleStoryboard(); break;
      }
      const low = k.toLowerCase();
      if (low === 'j') { FC.player.setRate(FC.player.rate > 0 ? -1 : Math.max(-4, FC.player.rate * 2)); FC.player.play(); }
      else if (low === 'k') { FC.player.pause(); FC.player.setRate(1); }
      else if (low === 'l' && !e.shiftKey) { FC.player.setRate(FC.player.rate < 1 ? 1 : Math.min(4, FC.player.rate * 2)); FC.player.play(); }
      else if (low === 'b') doBuild();
      else if (low === 's') doReshuffle(e.shiftKey ? 'content' : 'order');
      else if (low === 'v') pickTool('select');
      else if (low === 'c') pickTool('razor');
      else if (low === 'y') pickTool('slip');
      else if (low === 'h') pickTool('hand');
      else if (low === 'a') FC.timeline.zoomBy(1 / 1.45, FC.player.time);
      else if (low === 'd') FC.timeline.zoomBy(1.45, FC.player.time);
      else if (low === 'n') $('#snapBtn').click();
      else if (low === 'r') cycleTrimMode();
      else if (low === 'm') addMarker();
      else if (low === 'f') $('#fsBtn').click();
      else if (low === 'z' && e.shiftKey) FC.timeline.fit();
    });
  }
  function pickTool(t) { const b = $('#toolSeg button[data-tool="' + t + '"]'); if (b) b.click(); }
  function cycleTrimMode() {
    const order = ['ripple', 'roll', 'gap'];
    const v = FC.timeline.view;
    v.trimMode = order[(order.indexOf(v.trimMode) + 1) % 3];
    $('#trimModeSel').value = v.trimMode;
    U.toast(TRIM_HELP[v.trimMode], 'info', 3000);
  }
  function nudge(dir) {
    if (!S.sel.clips.size) return;
    S.edit('Nudge', () => { O.moveBy(S.sel.list(), dir / S.fps()); const t = S.sel.list()[0]; if (t) O.resolveOverlaps(t.track); });
  }
  function rotateSel(dir) {
    const t = S.trackById(S.sel.targetTrack) || S.mainTrack(); if (!t) return;
    S.edit('Rotate order', () => { O.rotate(t.id, dir); FC.director.rebuildOverlays(); });
  }
  /** ↑/↓ walk the cuts of the whole edit, never a single track you happened to click. */
  function jumpCut(dir) {
    const pts = S.editPoints();
    if (pts.length < 2) return;
    const now = FC.player.time;
    let best = null;
    if (dir > 0) { for (const p of pts) if (p > now + 1e-3) { best = p; break; } }
    else { for (let i = pts.length - 1; i >= 0; i--) if (pts[i] < now - 1e-3) { best = pts[i]; break; } }
    if (best == null) best = dir > 0 ? pts[pts.length - 1] : 0;
    FC.player.seek(best);
    FC.timeline.ensureVisible(best);
  }
  function duplicateSelection() {
    const list = S.sel.list(); if (!list.length) return;
    S.edit('Duplicate', () => {
      const made = list.map(c => { const n = Object.assign({}, c, { id: U.uid('clip'), start: O.q(c.start + c.dur) }); FC.doc.clips.push(n); return n; });
      S.bump(); made.forEach(c => O.resolveOverlaps(c.track));
      S.sel.set(made.map(c => c.id));
    });
  }

  /* ══════════ context menus ══════════ */
  function menu(e, items) {
    const m = $('#ctxMenu');
    m.innerHTML = '';
    for (const it of items) {
      if (it === '-') { m.appendChild(el('div', { class: 'sep' })); continue; }
      const b = el('button', { disabled: it.off ? 'disabled' : null }, [el('span', { text: it.label }), it.key ? el('kbd', { text: it.key }) : null]);
      b.onclick = () => { hideMenu(); it.act(); };
      m.appendChild(b);
    }
    m.classList.add('show');
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.min(e.clientX, innerWidth - w - 8) + 'px';
    m.style.top = Math.min(e.clientY, innerHeight - h - 8) + 'px';
    setTimeout(() => window.addEventListener('mousedown', hideMenu, { once: true }), 0);
  }
  function hideMenu() { $('#ctxMenu').classList.remove('show'); }

  function clipMenu(e, c) {
    const many = S.sel.clips.size > 1;
    menu(e, [
      { label: many ? 'Shuffle selected' : 'Reshuffle track', key: 'S', act: () => doReshuffle('order') },
      { label: 'Swap with next', act: () => S.edit('Swap', () => { const l = S.clipsOn(c.track); const i = l.indexOf(c); if (l[i + 1]) O.swap(c, l[i + 1]); FC.director.rebuildOverlays(); }) },
      { label: 'Split at playhead', key: '⌘K', act: splitAtPlayhead },
      '-',
      { label: c.locked ? 'Unlock' : 'Lock', act: () => S.edit('Lock', () => S.sel.list().forEach(x => x.locked = !c.locked)) },
      { label: c.enabled ? 'Disable' : 'Enable', act: () => S.edit('Enable', () => S.sel.list().forEach(x => x.enabled = !c.enabled)) },
      { label: 'Duplicate', key: '⌘D', act: duplicateSelection },
      '-',
      { label: 'Match duration to this', off: !many, act: () => S.edit('Match', () => { S.sel.list().forEach(x => { x.dur = c.dur; O.refit(x); }); O.closeGaps(c.track); FC.director.rebuildOverlays(); }) },
      { label: 'Select all on track', act: () => S.sel.set(S.clipsOn(c.track).map(x => x.id)) },
      { label: 'Reveal in bin', act: () => revealInBin(c.assetId) },
      '-',
      { label: 'Ripple delete', key: '⇧⌫', act: () => deleteSelection(true) }
    ]);
  }
  function trackMenu(e, t) {
    menu(e, [
      { label: 'Reshuffle this track', act: () => S.edit('Reshuffle', () => { FC.doc.build.seed++; O.shuffleOrder(t.id, FC.doc.build.seed); FC.director.rebuildOverlays(); }) },
      { label: 'Reverse order', act: () => S.edit('Reverse', () => { O.reverse(t.id); FC.director.rebuildOverlays(); }) },
      { label: 'Close gaps', act: () => S.edit('Close gaps', () => O.closeGaps(t.id)) },
      '-',
      { label: t.enabled ? 'Hide track' : 'Show track', act: () => S.edit('Track', () => t.enabled = !t.enabled) },
      { label: t.locked ? 'Unlock track' : 'Lock track', act: () => S.edit('Track', () => t.locked = !t.locked) },
      { label: 'Select all clips', act: () => S.sel.set(S.clipsOn(t.id).map(c => c.id)) },
      { label: 'Clear track', act: () => S.edit('Clear track', () => { S.removeClips(S.clipsOn(t.id).map(c => c.id)); }) },
      '-',
      { label: 'Add video track', act: () => S.edit('Add track', () => S.addTrack('video')) },
      { label: 'Add audio track', act: () => S.edit('Add track', () => S.addTrack('audio')) },
      { label: 'Delete this track', off: t.role === 'main', act: () => S.edit('Delete track', () => S.removeTrack(t.id)) }
    ]);
  }
  function assetMenu(e, a) {
    const n = S.sel.assets.size;
    menu(e, [
      { label: 'Append to timeline', act: () => FC.bin.selectedAssets().forEach(appendAsset) },
      { label: 'Build sequence from selection', act: () => doBuild() },
      { label: 'Spread across timeline…', off: a.kind !== 'video', act: () => explodeDialog(a) },
      '-',
      { label: 'Use as overlay', act: () => { S.sel.assets.clear(); S.sel.assets.add(a.id); FC.inspector.show('overlay'); } },
      { label: 'Set path override…', act: () => pathDialog(a) },
      '-',
      { label: 'Remove from bin' + (n > 1 ? ' (' + n + ')' : ''), act: removeSelectedAssets }
    ]);
  }
  function revealInBin(assetId) {
    S.sel.assets.clear(); S.sel.assets.add(assetId);
    FC.bin.render(); U.bus.emit('selassets');
  }

  /* ══════════ modals ══════════ */
  function openModal(title, html, buttons, wide) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modal').classList.toggle('wide', !!wide);
    const f = $('#modalFoot'); f.innerHTML = '';
    (buttons || []).forEach(b => {
      if (b === '-') { f.appendChild(el('div', { class: 'spacer' })); return; }
      const n = el('button', { class: 'btn ' + (b.cls || ''), text: b.label });
      n.onclick = () => b.act(n);
      f.appendChild(n);
    });
    $('#modalScrim').classList.add('show');
    return $('#modalBody');
  }
  function closeModal() { $('#modalScrim').classList.remove('show'); }
  function confirmDialog(title, msg, onYes) {
    openModal(title, `<p style="font-size:12px;color:var(--txt-2);line-height:1.6">${esc(msg)}</p>`, [
      '-', { label: 'Cancel', act: closeModal }, { label: 'Confirm', cls: 'primary', act: () => { closeModal(); onYes(); } }
    ]);
  }

  function helpDialog() {
    const K = (k, d) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`;
    openModal('Keyboard', `<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
      <div><h4 style="font-size:11px;text-transform:uppercase;color:var(--txt-3);margin-bottom:6px">Transport</h4><table class="grid">
      ${K('Space', 'Play / pause')}${K('J K L', 'Shuttle back / stop / forward')}${K('← →', 'Step one frame')}${K('⇧ ← →', 'Step one second')}
      ${K('↑ ↓', 'Jump to previous / next cut')}${K('Home End', 'Start / end')}${K('F', 'Fullscreen monitor')}</table>
      <h4 style="font-size:11px;text-transform:uppercase;color:var(--txt-3);margin:14px 0 6px">Build</h4><table class="grid">
      ${K('B', 'Auto-build the sequence')}${K('S', 'Reshuffle order (durations stay)')}${K('⇧ S', 'Reshuffle sources into the same slots')}
      ${K('⌥ ← →', 'Rotate the running order')}</table></div>
      <div><h4 style="font-size:11px;text-transform:uppercase;color:var(--txt-3);margin-bottom:6px">Editing</h4><table class="grid">
      ${K('V C Y H', 'Select · Razor · Slip · Pan')}${K('⌘K', 'Split at playhead')}${K('⌫', 'Delete')}${K('⇧⌫', 'Ripple delete')}
      ${K('[ ]', 'Nudge one frame')}${K('⌘D', 'Duplicate')}${K('N', 'Snapping')}${K('R', 'Cycle trim mode')}${K('M', 'Marker')}${K('⌘A', 'Select all clips')}
      ${K('Tab', 'Show / hide the storyboard')}</table>
      <h4 style="font-size:11px;text-transform:uppercase;color:var(--txt-3);margin:14px 0 6px">Project</h4><table class="grid">
      ${K('⌘S', 'Save project')}${K('⌘O', 'Open project')}${K('⌘E', 'Export')}${K('⌘I', 'Import media')}${K('⌘Z', 'Undo')}${K('⇧⌘Z', 'Redo')}
      ${K('A  D', 'Zoom out · zoom in')}${K('+ −', 'Zoom')}${K('⇧Z', 'Zoom to fit')}</table></div></div>
      <div class="hint" style="margin-top:14px">On the timeline: drag a clip between two others to insert it — everything re-flows. Hold <kbd>Alt</kbd> while dragging to move freely, <kbd>Alt</kbd> on a clip edge to roll the cut, and scroll with <kbd>Ctrl</kbd> to zoom.</div>`,
      ['-', { label: 'Close', cls: 'primary', act: closeModal }], true);
  }

  function buildOptionsDialog() {
    const b = FC.doc.build;
    const n = (k, label, step, min, max, hint) => `<div class="row"><label style="width:120px">${label}</label><input type="number" data-o="${k}" value="${b[k]}" step="${step}" ${min != null ? 'min=' + min : ''} ${max != null ? 'max=' + max : ''}>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
    const c = (k, label, hint) => `<div class="row"><label style="width:120px"></label><label class="cbx"><input type="checkbox" data-o="${k}"${b[k] ? ' checked' : ''}> ${label}</label>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
    openModal('Build options', `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:22px">
        <div>
          <h4 style="font-size:11px;text-transform:uppercase;color:var(--txt-3);margin-bottom:8px">Timing</h4>
          ${n('minClip', 'Shortest clip', 0.1, 0.04, null, 'seconds')}
          ${n('jitter', 'Length jitter', 5, 0, 90, '% random variation')}
          ${n('stillDur', 'Still duration', 0.5, 0.1, null, 'seconds')}
          ${n('avoidHeadTail', 'Avoid head/tail', 1, 0, 45, '% skipped at each end of a source')}
          <h4 style="font-size:11px;text-transform:uppercase;color:var(--txt-3);margin:16px 0 8px">Stills</h4>
          ${c('kenBurns', 'Ken Burns move on stills', 'exports as real keyframes')}
          ${n('kbAmount', 'Move amount', 1, 0, 60, '%')}
        </div>
        <div>
          <h4 style="font-size:11px;text-transform:uppercase;color:var(--txt-3);margin-bottom:8px">Transitions</h4>
          <div class="row"><label style="width:120px">Type</label><select data-o="xfType">
            ${['none'].concat(Object.keys(FC.exportXml.XF_LABEL)).map(k => `<option value="${k}"${b.xfType === k ? ' selected' : ''}>${k === 'none' ? 'Straight cuts' : FC.exportXml.XF_LABEL[k]}</option>`).join('')}
          </select></div>
          ${n('xfDur', 'Length', 0.1, 0.04, null, 'seconds')}
          ${n('xfEvery', 'On every', 1, 1, null, 'cut (2 = every other cut)')}
          <div class="hint" style="margin-top:6px">A dissolve borrows unused source from both sides. Where a clip has no spare frames FluxCut shortens that dissolve instead of leaving Premiere to guess.</div>
          <h4 style="font-size:11px;text-transform:uppercase;color:var(--txt-3);margin:16px 0 8px">Rebuild behaviour</h4>
          ${c('respectLocks', 'Keep locked clips in place', '')}
        </div>
      </div>`, ['-', { label: 'Close', act: closeModal }, { label: 'Build now', cls: 'primary', act: () => { closeModal(); doBuild(); } }], true);
    $$('#modalBody [data-o]').forEach(i => i.onchange = e => {
      const k = e.target.dataset.o;
      b[k] = e.target.type === 'checkbox' ? e.target.checked : (e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value);
    });
  }

  function explodeDialog(a) {
    openModal('Spread “' + esc(a.name) + '” across the timeline', `
      <p class="hint" style="margin-bottom:10px">Cuts this one source into evenly spaced takes — a 5-minute interview becomes twenty different 4-second shots, each from a different part of the file.</p>
      <div class="row"><label style="width:110px">Number of takes</label><input type="number" id="expN" value="12" min="1" max="500"></div>
      <div class="row"><label style="width:110px">Each lasts</label><input type="number" id="expD" value="${FC.doc.build.fixed}" step="0.5" min="0.2"><span class="hint">seconds — total ${U.dur(a.duration)} available</span></div>
    `, ['-', { label: 'Cancel', act: closeModal }, {
      label: 'Spread', cls: 'primary', act: () => {
        const n = parseInt($('#expN').value) || 1, d = parseFloat($('#expD').value) || 2;
        closeModal();
        U.toast(FC.director.explode(a, n, d) + ' takes added');
        FC.timeline.fit();
      }
    }]);
  }

  function pathDialog(a) {
    openModal('Path for ' + esc(a.name), `
      <p class="hint" style="margin-bottom:8px">Override the full path for this one file. Everything else keeps using the media root.</p>
      <input type="text" id="povr" value="${esc(a.pathOverride || FC.exportXml.resolvePath(a))}" style="font-family:var(--mono)">
    `, ['-', { label: 'Cancel', act: closeModal }, {
      label: 'Save', cls: 'primary', act: () => {
        a.pathOverride = $('#povr').value.trim(); closeModal(); FC.inspector.render(); U.toast('Path set');
      }
    }]);
  }

  /* ══════════ inspector actions ══════════ */
  function inspectorAction(a, arg, node) {
    const one = S.sel.list()[0];
    const t = () => S.trackById(S.sel.targetTrack) || S.mainTrack();
    const acts = {
      nudgeL: () => nudge(-1), nudgeR: () => nudge(1),
      selAllClips: () => S.sel.set(FC.doc.clips.map(c => c.id)),
      fitZoom: () => FC.timeline.fit(),
      revealBin: () => one && revealInBin(one.assetId),
      replace: () => {
        const a2 = FC.bin.selectedAssets()[0];
        if (!a2 || !one) return U.toast('Select a replacement in the bin first', 'warn');
        S.edit('Swap source', () => { one.assetId = a2.id; one.name = a2.name; one.color = a2.color; one.in = 0; O.refit(one); });
      },
      xfAll: () => {
        if (!one) return;
        const type = one.xf ? one.xf.type : 'cross', d = one.xf ? one.xf.dur : FC.doc.build.xfDur;
        S.edit('Transitions', () => { const r = O.applyTransitions(one.track, type, d, 1); U.toast(`${r.applied} of ${r.cuts} cuts · ${r.shortened} shortened · ${r.skipped} skipped`); });
      },
      applyDur: () => {
        const v = parseFloat($('#inspBody [data-k="multiDur"]').value);
        S.edit('Set duration', () => { S.sel.list().forEach(c => { c.dur = Math.max(O.frame(), v); O.refit(c); }); const tr = one && one.track; if (tr) O.closeGaps(tr); FC.director.rebuildOverlays(); });
      },
      applyFit: () => {
        const v = U.parseTc($('#inspBody [data-k="multiFit"]').value, FC.doc.timebase, FC.doc.ntsc);
        S.edit('Fit', () => { O.fitTrackTo(one.track, v); FC.director.rebuildOverlays(); });
      },
      shuffleSel: () => doReshuffle('order'),
      reverseSel: () => S.edit('Reverse', () => { O.reverse(t().id); FC.director.rebuildOverlays(); }),
      rotL: () => rotateSel(-1), rotR: () => rotateSel(1),
      swapSel: () => { const l = S.sel.list(); if (l.length !== 2) return U.toast('Select exactly two clips', 'warn'); S.edit('Swap', () => { O.swap(l[0], l[1]); FC.director.rebuildOverlays(); }); },
      evenSel: () => { const l = S.sel.list(); const avg = l.reduce((s, c) => s + c.dur, 0) / l.length; S.edit('Even out', () => { l.forEach(c => { c.dur = avg; O.refit(c); }); O.closeGaps(l[0].track); FC.director.rebuildOverlays(); }); },
      lockSel: () => S.edit('Lock', () => S.sel.list().forEach(c => c.locked = true)),
      unlockSel: () => S.edit('Unlock', () => S.sel.list().forEach(c => c.locked = false)),
      delSel: () => deleteSelection(true),
      xfSel: () => {
        const type = $('#inspBody [data-k="multiXf"]').value, d = parseFloat($('#inspBody [data-k="multiXfDur"]').value);
        S.edit('Transitions', () => {
          let n = 0, skip = 0;
          S.sel.list().forEach(c => {
            const list = S.clipsOn(c.track), i = list.indexOf(c);
            if (i <= 0) return;
            const room = Math.min(S.handles(list[i - 1]).tail, S.handles(c).head) * 2;
            const dd = Math.min(d, room, Math.min(list[i - 1].dur, c.dur) * 0.9);
            if (dd < 2 / S.fps()) { skip++; return; }
            c.xf = { type, dur: O.q(dd), align: 'center' }; n++;
          });
          U.toast(n + ' transitions applied' + (skip ? ' · ' + skip + ' skipped for lack of handles' : ''));
        });
      },
      xfNone: () => S.edit('Remove transitions', () => S.sel.list().forEach(c => c.xf = null)),
      addVTrack: () => S.edit('Add track', () => S.addTrack('video')),
      addOverlay: () => {
        const srcSel = $('#inspBody [data-k="newOvSource"]');
        const id = (srcSel && srcSel.value) || FC.inspector.overlaySource;
        const a2 = S.assetById(id);
        if (!a2) return U.toast('Import a video or image to use as an overlay', 'warn');
        const trk = $('#inspBody [data-k="newOvTrack"]');
        let tid = trk && trk.value;
        if (!tid || !S.trackById(tid)) S.edit('Add track', () => { tid = S.addTrack('video').id; });
        S.edit('Add overlay', () => { FC.director.addOverlayRule(a2.id, tid); FC.director.rebuildOverlays(); });
        const made = FC.doc.clips.filter(c => c.gen).length;
        U.toast(`Overlay added · ${made} instance${made === 1 ? '' : 's'} across the edit`);
        FC.inspector.render();
      },
      ovReroll: () => { const r = FC.doc.overlays.find(x => x.id === arg); if (r) S.edit('Re-roll', () => { r.seed = Math.floor(Math.random() * 9999); FC.director.rebuildOverlays(); }); },
      ovDel: () => S.edit('Remove overlay', () => { FC.doc.overlays = FC.doc.overlays.filter(x => x.id !== arg); FC.doc.clips = FC.doc.clips.filter(c => c.ruleId !== arg); S.bump(); }),
      addAudio: () => placeAudio(0),
      addAudioHere: () => placeAudio(FC.player.time),
      analyse: async () => {
        const list = [];
        for (const tr of S.audioTracks()) for (const c of S.clipsOn(tr.id)) list.push(S.assetById(c.assetId));
        const a2 = list[0] || FC.bin.selectedAssets().filter(x => x.kind === 'audio')[0];
        if (!a2) return U.toast('Place an audio clip first', 'warn');
        U.toast('Analysing…', 'info');
        const w = await FC.media.ensureWave(a2);
        if (w && w.bpm) { FC.doc.bpm = w.bpm; U.toast(w.bpm + ' BPM · ' + w.beats.length + ' beats'); }
        else U.toast('No clear beat found — try Fixed or Pattern instead', 'warn');
        FC.inspector.render();
      },
      snapCuts: () => {
        const beats = FC.director.beatGrid();
        if (!beats || beats.length < 2) return U.toast('Detect beats first', 'warn');
        const tr = S.mainTrack();
        S.edit('Snap to beats', () => {
          const list = S.clipsOn(tr.id);
          let prev = 0;
          for (let i = 1; i < list.length; i++) {
            const c = list[i];
            let best = c.start, bd = 0.35;
            for (const b of beats) { const d = Math.abs(b - c.start); if (d < bd && b > prev + 0.15) { bd = d; best = b; } }
            list[i - 1].dur = O.q(best - list[i - 1].start);
            c.start = O.q(best); prev = best;
          }
          O.closeGaps(tr.id); list.forEach(O.refit);
          FC.director.rebuildOverlays();
        });
        U.toast('Cuts pulled onto the beat');
      },
      fitToAudio: () => {
        const len = FC.director.audioLength();
        if (!len) return U.toast('No audio on the timeline', 'warn');
        S.edit('Fit to audio', () => { O.fitTrackTo(S.mainTrack().id, len); FC.director.rebuildOverlays(); });
        U.toast('Picture now ends with the track · ' + U.dur(len));
      },
      fitAudioToVideo: () => {
        const len = FC.director.mainDuration();
        S.edit('Trim audio', () => {
          for (const tr of S.audioTracks()) for (const c of S.clipsOn(tr.id)) {
            if (c.start >= len) { c.dur = 0.04; continue; }
            c.dur = O.q(Math.min(c.dur, len - c.start));
            if (c.fadeOut <= 0) c.fadeOut = Math.min(1.5, c.dur * 0.2);
          }
        });
        U.toast('Audio trimmed to picture');
      },
      acSel: () => { const c = S.clipById(arg); if (c) { S.sel.set([c.id]); FC.player.seek(c.start); } },
      mkDel: () => S.edit('Marker', () => FC.doc.markers.splice(parseInt(arg), 1)),
      checkPaths: () => showValidation(),
      trimCache: () => { const s = FC.media.trim(); U.toast('Released ' + s.bitmaps + ' frames'); FC.inspector.render(); },
      clearIdb: async () => { await FC.idb.clear('thumbs'); await FC.idb.clear('waves'); U.toast('Disk cache cleared'); },
      clearTimeline: () => confirmDialog('Clear the timeline?', 'Media stays in the bin. This can be undone.', () => S.edit('Clear timeline', () => { FC.doc.clips = []; FC.doc.markers = []; S.sel.clear(); S.bump(); })),
      newProject: () => confirmDialog('Start a new project?', 'Unsaved changes are lost.', () => { FC.doc = S.newDoc(); FC.files.clear(); S.bump(); U.bus.emit('doc'); U.bus.emit('assets'); FC.bin.layout(); FC.inspector.render(); })
    };
    (acts[a] || (() => { }))();
  }
  function placeAudio(at) {
    const srcSel = $('#inspBody [data-k="newAudioSource"]');
    const a = S.assetById((srcSel && srcSel.value) || FC.inspector.audioSourceId);
    if (!a) return U.toast('Import an audio file first', 'warn');
    const trkSel = $('#inspBody [data-k="newAudioTrack"]');
    const tid = (trkSel && trkSel.value) || (S.audioTracks()[0] || {}).id;
    S.edit('Place audio', () => {
      const c = O.clipFromAsset(a, { track: tid, start: O.q(at), dur: a.duration });
      FC.doc.clips.push(c); S.bump(); S.sel.set([c.id]);
    });
    FC.media.ensureWave(a);
    U.toast('Audio placed · ' + U.dur(a.duration));
    FC.inspector.render();
  }

  /* ══════════ save / open ══════════ */
  async function saveProject() {
    const json = S.toJSON();
    U.download(U.sanitize(FC.doc.name) + '.fluxcut', json, 'application/json');
    await FC.idb.saveProject(FC.doc.id, json, { name: FC.doc.name, clips: FC.doc.clips.length, dur: S.duration() });
    FC.doc.dirty = false;
    U.toast('Saved · the .fluxcut file remembers every clip, rule and path');
  }
  async function autosave() {
    if (!FC.doc.dirty || !FC.doc.clips.length) return;
    try { await FC.idb.saveProject('autosave', S.toJSON(), { name: FC.doc.name, at: Date.now(), auto: true }); } catch (e) { }
  }
  async function restoreLast() {
    try {
      const json = await FC.idb.loadProject('autosave');
      if (!json) return;
      const o = JSON.parse(json);
      if (!o.clips || !o.clips.length) return;
      U.toast(`Recovered “${esc(o.name)}” from your last session — <a href="#" id="recLink" style="color:var(--acc)">restore</a>`, 'info', 12000);
      setTimeout(() => {
        const a = document.getElementById('recLink');
        if (a) a.onclick = (e) => { e.preventDefault(); loadJson(json); U.toast('Restored — now re-import the media folder to relink', 'ok', 6000); };
      }, 30);
    } catch (e) { }
  }
  function openDialog() { $('#projPicker').click(); }
  function openProjectFile(f) {
    const r = new FileReader();
    r.onload = () => { try { loadJson(r.result); } catch (e) { U.toast('Could not read that project: ' + e.message, 'err'); } };
    r.readAsText(f);
  }
  function loadJson(json) {
    S.fromJSON(json);
    $('#projName').value = FC.doc.name;
    FC.bin.layout(); FC.inspector.render(); FC.timeline.fit(); syncChrome(); patternArgs();
    const missing = FC.doc.assets.filter(a => !FC.files.has(a.id)).length;
    if (missing) U.toast(missing + ' file' + (missing > 1 ? 's' : '') + ' need relinking — drop the same folder in and everything reconnects by name + size', 'warn', 9000);
  }

  /* ══════════ export ══════════ */
  function showValidation() {
    const v = FC.exportXml.validate();
    const rows = v.issues.length
      ? v.issues.map(i => `<tr><td><span class="badge2 ${i.level === 'err' ? 'err' : i.level === 'warn' ? 'warn' : 'ok'}">${i.level}</span></td><td>${esc(i.msg)}</td></tr>`).join('')
      : '<tr><td><span class="badge2 ok">ok</span></td><td>Everything resolves. Ready to export.</td></tr>';
    openModal('Path & sequence check', `<table class="grid">${rows}</table>
      <div class="hint" style="margin-top:12px">Sample path: <span class="field-mono">${esc(FC.doc.assets[0] ? FC.exportXml.resolvePath(FC.doc.assets[0]) : '—')}</span></div>`,
      ['-', { label: 'Close', cls: 'primary', act: closeModal }]);
  }

  const EXPORTS = [
    { k: 'xml', name: 'Premiere Pro / AME', file: 'sequence.xml', tag: 'FCP7 XML', desc: 'Tracks, trims, opacity, dissolves, Ken Burns keyframes and markers. Also opens in Resolve and Vegas.', on: true },
    { k: 'render', name: 'ffmpeg render script', file: 'render.sh + .ps1', tag: 'no Adobe needed', desc: 'Renders this exact edit — overlays, blend modes, fades and audio mix included.', on: true },
    { k: 'otio', name: 'OpenTimelineIO', file: 'timeline.otio', tag: 'OTIO', desc: 'Native conform for Resolve, Flow and the otio toolchain.', on: false },
    { k: 'edl', name: 'EDL', file: 'sequence.edl', tag: 'CMX 3600', desc: 'Cuts-and-dissolves list for online conform. V1 only.', on: false },
    { k: 'csv', name: 'Shot list', file: 'shotlist.csv', tag: 'CSV', desc: 'Every clip with timecode, source in/out and full path.', on: false },
    { k: 'proj', name: 'FluxCut project', file: 'project.fluxcut', tag: 'reopen later', desc: 'The whole session: rules, seeds, overlays, paths.', on: true },
    { k: 'readme', name: 'Import instructions', file: 'README.txt', tag: 'txt', desc: 'Step-by-step for Premiere, AME and Resolve.', on: true }
  ];

  function exportDialog() {
    const v = FC.exportXml.validate();
    const errs = v.issues.filter(i => i.level === 'err');
    const cards = EXPORTS.map(x => `<div class="card${x.on ? ' on' : ''}" data-x="${x.k}">
      <h4>${esc(x.name)} <span class="tag">${esc(x.tag)}</span></h4>
      <p>${esc(x.desc)}</p>
      <p style="margin-top:4px;color:var(--txt-2);font-family:var(--mono);font-size:10px">${esc(x.file)}</p></div>`).join('');
    const codecs = Object.keys(FC.exportRender.CODECS).map(k => `<option value="${k}">${esc(FC.exportRender.CODECS[k].label)}</option>`).join('');

    openModal('Export', `
      <div class="cards">${cards}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px">
        <div>
          <h4 style="font-size:11px;text-transform:uppercase;color:var(--txt-3);margin-bottom:8px">XML options</h4>
          <label class="cbx" style="margin-bottom:5px"><input type="checkbox" id="oFit" checked> Scale sources to the frame</label>
          <label class="cbx" style="margin-bottom:5px"><input type="checkbox" id="oSrcA" checked> Bring clip audio along on its own track</label>
          <label class="cbx" style="margin-bottom:5px"><input type="checkbox" id="oKb" checked> Export Ken Burns as keyframes</label>
          <label class="cbx" style="margin-bottom:5px"><input type="checkbox" id="oMk" checked> Include markers</label>
          <h4 style="font-size:11px;text-transform:uppercase;color:var(--txt-3);margin:14px 0 8px">Render script</h4>
          <div class="row"><label style="width:56px">Codec</label><select id="oCodec">${codecs}</select></div>
          <label class="cbx"><input type="checkbox" id="oRendSrcA"> Mix in the clips' own audio</label>
        </div>
        <div>
          <h4 style="font-size:11px;text-transform:uppercase;color:var(--txt-3);margin-bottom:8px">Delivery</h4>
          <div class="row"><label style="width:56px">As</label><select id="oDeliver" style="width:auto">
            <option value="files">Separate downloads</option>
            <option value="zip">One ZIP</option>
            <option value="folder"${FC.exportRender.canFolder() ? '' : ' disabled'}>Folder on disk${FC.exportRender.canFolder() ? '' : ' (needs Chrome/Edge)'}</option>
          </select></div>
          <label class="cbx" style="margin-top:4px"><input type="checkbox" id="oCollect"> Copy the media alongside it <span class="hint">(makes the export self-contained)</span></label>
          <div id="expReport" style="margin-top:12px"></div>
        </div>
      </div>`, [
      { label: 'Preview XML', act: previewXml },
      { label: 'Check paths', act: showValidation },
      '-',
      { label: 'Cancel', act: closeModal },
      { label: errs.length ? 'Export anyway' : 'Export', cls: 'primary', act: runExport }
    ], true);

    $$('#modalBody .card').forEach(c => c.onclick = () => c.classList.toggle('on'));
    $('#oCodec').value = 'h264';
    const rep = $('#expReport');
    rep.innerHTML = v.issues.length
      ? v.issues.slice(0, 5).map(i => `<div style="margin-bottom:4px"><span class="badge2 ${i.level === 'err' ? 'err' : i.level === 'warn' ? 'warn' : 'ok'}">${i.level}</span> <span class="hint">${esc(i.msg)}</span></div>`).join('')
      : '<span class="badge2 ok">ready</span> <span class="hint">All paths resolve.</span>';
  }

  function previewXml() {
    const xml = FC.exportXml.fcpxml(xmlOpts());
    openModal('sequence.xml', `<pre class="code">${esc(xml.slice(0, 14000))}${xml.length > 14000 ? '\n… ' + (xml.length - 14000) + ' more characters' : ''}</pre>`,
      [{ label: 'Copy all', act: () => U.copyText(xml) }, '-', { label: 'Back', cls: 'primary', act: exportDialog }], true);
  }
  function xmlOpts() {
    return {
      fitToFrame: chk('oFit', true), sourceAudio: chk('oSrcA', true),
      kenBurns: chk('oKb', true), markers: chk('oMk', true), opacity: true, labels: true
    };
  }
  function chk(id, dflt) { const n = document.getElementById(id); return n ? n.checked : dflt; }

  async function runExport() {
    const picked = $$('#modalBody .card.on').map(c => c.dataset.x);
    if (!picked.length) return U.toast('Pick at least one thing to export', 'warn');
    const deliver = $('#oDeliver').value;
    const collect = $('#oCollect').checked;
    const codec = $('#oCodec').value;
    const rendSrcA = $('#oRendSrcA').checked;
    const base = U.sanitize(FC.doc.name);
    closeModal();
    U.busy(0.1);

    const files = [];
    const opts = xmlOpts();
    if (collect) { FC.doc._prevPathMode = FC.doc.pathMode; FC.doc.pathMode = 'relative'; }
    try {
      if (picked.includes('xml')) files.push({ name: 'sequence.xml', text: FC.exportXml.fcpxml(opts) });
      if (picked.includes('edl')) files.push({ name: base + '.edl', text: FC.exportXml.edl() });
      if (picked.includes('otio')) files.push({ name: base + '.otio', text: FC.exportXml.otio() });
      if (picked.includes('csv')) files.push({ name: 'shotlist.csv', text: FC.exportXml.csv() });
      if (picked.includes('proj')) files.push({ name: base + '.fluxcut', text: S.toJSON() });
      U.busy(0.35);
      if (picked.includes('render')) {
        const r = FC.exportRender.ffmpeg({ codec, sourceAudio: rendSrcA });
        if (r.error) U.toast('Render script: ' + r.error, 'warn');
        else {
          files.push({ name: 'render.sh', text: r.sh }, { name: 'render.ps1', text: r.ps1 },
            { name: 'render.bat', text: r.bat }, { name: 'filtergraph.txt', text: r.filters });
          if (r.warnings.length) r.warnings.forEach(w => U.toast(w, 'warn', 7000));
        }
      }
      if (picked.includes('readme')) files.push({ name: 'README.txt', text: FC.exportXml.readme(files.map(f => f.name).concat(collect ? ['media/…'] : [])) });
      U.busy(0.55);

      const usedAssets = collect ? FC.exportXml.validate().assets : [];
      if (collect) {
        // relative paths point into media/
        usedAssets.forEach(a => a.pathOverride = 'media/' + a.name);
        const i = files.findIndex(f => f.name === 'sequence.xml');
        if (i >= 0) files[i].text = FC.exportXml.fcpxml(opts);
      }

      if (deliver === 'folder') {
        const dir = await FC.exportRender.collectToFolder(files, collect ? usedAssets : null, (p, n) => { U.busy(0.55 + p * 0.44); });
        U.toast('Written to “' + esc(dir) + '” — open sequence.xml in Premiere', 'ok', 6000);
      } else if (deliver === 'zip') {
        const entries = files.map(f => ({ name: f.name, blob: new Blob([f.text], { type: 'text/plain' }) }));
        if (collect) for (const a of usedAssets) { const file = FC.files.get(a.id); if (file) entries.push({ name: 'media/' + a.name, blob: file }); }
        const blob = await FC.exportRender.zipStore(entries, (p, n) => U.busy(0.55 + p * 0.44));
        U.download(base + '_export.zip', blob);
        U.toast('ZIP ready · ' + U.bytes(blob.size), 'ok', 5000);
      } else {
        files.forEach((f, i) => setTimeout(() => U.download(f.name, f.text), i * 160));
        if (collect) U.toast('Media copies need the ZIP or folder option', 'warn');
        U.toast(files.length + ' file' + (files.length > 1 ? 's' : '') + ' downloaded', 'ok', 4000);
      }
    } catch (e) {
      console.error(e);
      U.toast('Export failed: ' + e.message, 'err', 7000);
    } finally {
      if (collect) {
        FC.doc.pathMode = FC.doc._prevPathMode || 'absolute';
        FC.exportXml.validate().assets.forEach(a => { if (a.pathOverride && a.pathOverride.startsWith('media/')) a.pathOverride = ''; });
      }
      U.busy(null);
    }
  }

  /* ══════════ panel resizing ══════════ */
  function bindResizers() {
    const root = document.documentElement;
    drag($('#binResizer'), (dx, start) => root.style.setProperty('--col-bin', clamp(start + dx, 190, 520) + 'px'), () => parseInt(getComputedStyle(root).getPropertyValue('--col-bin')) || 268);
    drag($('#inspResizer'), (dx, start) => root.style.setProperty('--col-insp', clamp(start - dx, 220, 520) + 'px'), () => parseInt(getComputedStyle(root).getPropertyValue('--col-insp')) || 300);
    dragY($('#tlResizer'), (dy, start) => root.style.setProperty('--row-tl', clamp(start - dy, 140, innerHeight - 280) + 'px'), () => parseInt(getComputedStyle(root).getPropertyValue('--row-tl')) || 318);
    // position the vertical handles
    const place = () => {
      const b = $('#binPanel').getBoundingClientRect(), i = $('#inspPanel').getBoundingClientRect();
      $('#binResizer').style.left = (b.right - 2) + 'px'; $('#binResizer').style.top = b.top + 'px'; $('#binResizer').style.height = b.height + 'px';
      $('#inspResizer').style.left = (i.left - 2) + 'px'; $('#inspResizer').style.top = i.top + 'px'; $('#inspResizer').style.height = i.height + 'px';
    };
    new ResizeObserver(place).observe(document.body);
    setTimeout(place, 50);
    window.addEventListener('resize', () => { place(); FC.timeline.resize(); });
    function drag(node, apply, get) {
      if (!node) return;
      node.style.position = 'fixed';
      node.onmousedown = e => {
        e.preventDefault(); const x0 = e.clientX, s = get();
        const mv = ev => { apply(ev.clientX - x0, s); FC.timeline.resize(); place(); };
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      };
    }
    function dragY(node, apply, get) {
      if (!node) return;
      node.onmousedown = e => {
        e.preventDefault(); const y0 = e.clientY, s = get();
        const mv = ev => { apply(ev.clientY - y0, s); FC.timeline.resize(); };
        const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); };
        window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up);
      };
    }
  }

  Object.assign(app, {
    init, importFiles, appendAsset, dropAssets, setFps, doBuild, doReshuffle,
    clipMenu, trackMenu, assetMenu, inspectorAction, addMarker, showTab: t => FC.inspector.show(t), toggleStoryboard,
    openModal, closeModal, confirmDialog, exportDialog, helpDialog, saveProject, loadJson
  });
  FC.app = app;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.FC);
