/* FluxCut Studio — render-script writer and media collector.
   The ffmpeg script is the "no Adobe needed" escape hatch: it renders the exact
   same edit, including overlays, blend modes, fades and audio. */
(function (FC) {
  'use strict';
  const U = FC.util, S = FC.store, EX = FC.exportXml;
  const { clamp, round3 } = U;

  /* ── ffmpeg ────────────────────────────────────────────────────── */
  const XF_FFM = { cross: 'fade', additive: 'fadewhite', film: 'dissolve', dipblack: 'fadeblack', dipwhite: 'fadewhite', wipe: 'wipeleft', slide: 'slideleft' };
  const BLEND_ADDITIVE = { screen: 'black', add: 'black', lighten: 'black', 'color-dodge': 'black', difference: 'black', exclusion: 'black' };
  const BLEND_MULT = { multiply: 'white', darken: 'white', 'color-burn': 'white' };

  const CODECS = {
    h264: { v: '-c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p', a: '-c:a aac -b:a 320k', ext: 'mp4', label: 'H.264 · MP4 (delivery)' },
    h264hq: { v: '-c:v libx264 -preset slow -crf 14 -pix_fmt yuv420p', a: '-c:a aac -b:a 320k', ext: 'mp4', label: 'H.264 high quality · MP4' },
    hevc: { v: '-c:v libx265 -preset medium -crf 20 -pix_fmt yuv420p -tag:v hvc1', a: '-c:a aac -b:a 320k', ext: 'mp4', label: 'HEVC · MP4' },
    prores: { v: '-c:v prores_ks -profile:v 3 -vendor apl0 -pix_fmt yuv422p10le', a: '-c:a pcm_s16le', ext: 'mov', label: 'ProRes 422 HQ · MOV (edit-ready)' },
    dnxhr: { v: '-c:v dnxhd -profile:v dnxhr_hq -pix_fmt yuv422p', a: '-c:a pcm_s16le', ext: 'mov', label: 'DNxHR HQ · MOV (edit-ready)' },
    proxy: { v: '-c:v libx264 -preset veryfast -crf 26 -vf_scale 0.5 -pix_fmt yuv420p', a: '-c:a aac -b:a 128k', ext: 'mp4', label: 'Proxy · half-size MP4' }
  };

  function ffmpeg(opt) {
    opt = Object.assign({ codec: 'h264', out: null, sourceAudio: false, kenBurns: true }, opt || {});
    const d = FC.doc, fps = U.realFps(d.timebase, d.ntsc);
    const W = d.width, H = d.height;
    const main = S.mainTrack();
    const warn = [];
    if (!main) return { error: 'No video track' };
    const base = S.clipsOn(main.id);
    if (!base.length) return { error: 'Nothing on V1' };

    const inputs = [];   // {pre:[], path:string}
    const parts = [];    // filter graph lines
    const push = (pre, path) => { inputs.push({ pre, path }); return inputs.length - 1; };
    const P = a => EX.resolvePath(a).replace(/\\/g, '/');

    // NTSC rates are 30000/1001 — write the exact fraction so ffmpeg never drifts from the XML
    const rate = d.ntsc ? `${d.timebase * 1000}/1001` : String(d.timebase);
    const norm = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=${rate},format=yuv420p`;
    const normFit = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${rate},format=yuv420p`;

    /* base chain — transitions eat into the handles, exactly like Premiere */
    const segs = [];
    for (let i = 0; i < base.length; i++) {
      const c = base[i], a = S.assetById(c.assetId);
      if (!a) { warn.push('Missing asset for a clip on V1 — skipped'); continue; }
      const xin = c.xf && c.xf.dur > 0 ? c.xf.dur / 2 : 0;
      const nxt = base[i + 1];
      const xout = nxt && nxt.xf && nxt.xf.dur > 0 ? nxt.xf.dur / 2 : 0;
      let sIn = Math.max(0, c.in - xin);
      let sDur = c.dur + (c.in - sIn) + xout;
      if (a.kind === 'video' && a.duration) sDur = Math.min(sDur, Math.max(0.04, a.duration - sIn));
      segs.push({ c, a, sIn: round3(sIn), sDur: round3(sDur), xin: c.xf ? c.xf.dur : 0 });
    }

    segs.forEach((s, i) => {
      const lbl = 'v' + i;
      const fitMode = (s.c.motion && s.c.motion.fit) === 'fit' ? normFit : norm;
      if (s.a.kind === 'image') {
        if (s.c.kb && opt.kenBurns) {
          const N = Math.max(2, Math.round(s.sDur * fps));
          const z0 = s.c.kb.fromScale / 100, z1 = s.c.kb.toScale / 100;
          const dx = round3((s.c.kb.toX - s.c.kb.fromX) / 100 * W), dy = round3((s.c.kb.toY - s.c.kb.fromY) / 100 * H);
          push([], P(s.a));
          parts.push(`[${i}:v]scale=${W * 2}:-2,zoompan=z='${round3(z0)}+(${round3(z1 - z0)})*on/${N}':x='iw/2-(iw/zoom/2)+(${dx})*on/${N}':y='ih/2-(ih/zoom/2)+(${dy})*on/${N}':d=${N}:s=${W}x${H}:fps=${rate},setsar=1,format=yuv420p[${lbl}]`);
        } else {
          push(['-loop', '1', '-t', String(s.sDur)], P(s.a));
          parts.push(`[${i}:v]${fitMode},trim=duration=${s.sDur},setpts=PTS-STARTPTS[${lbl}]`);
        }
      } else {
        push(['-ss', String(s.sIn), '-t', String(s.sDur)], P(s.a));
        parts.push(`[${i}:v]${fitMode},trim=duration=${s.sDur},setpts=PTS-STARTPTS[${lbl}]`);
      }
      s.lbl = lbl; s.idx = i;
    });

    let baseLbl;
    const hasXf = segs.some(s => s.xin > 0);
    if (!hasXf) {
      parts.push(segs.map(s => `[${s.lbl}]`).join('') + `concat=n=${segs.length}:v=1:a=0[base]`);
      baseLbl = 'base';
    } else {
      let cur = segs[0].lbl, running = segs[0].sDur;
      for (let i = 1; i < segs.length; i++) {
        const D = segs[i].xin || 0, out = 'x' + i;
        if (D > 0) {
          const off = round3(Math.max(0, running - D));
          parts.push(`[${cur}][${segs[i].lbl}]xfade=transition=${XF_FFM[segs[i].c.xf.type] || 'fade'}:duration=${round3(D)}:offset=${off}[${out}]`);
          running = round3(running + segs[i].sDur - D);
        } else {
          parts.push(`[${cur}][${segs[i].lbl}]xfade=transition=fade:duration=0.04:offset=${round3(running - 0.04)}[${out}]`);
          running = round3(running + segs[i].sDur - 0.04);
        }
        cur = out;
      }
      baseLbl = cur;
    }

    /* per-clip video fades ride on the finished base via a single chain */
    const fades = [];
    let acc = 0;
    for (const s of segs) {
      const c = s.c;
      if (c.fadeIn > 0) fades.push(`fade=t=in:st=${round3(c.start)}:d=${round3(c.fadeIn)}:alpha=0`);
      if (c.fadeOut > 0) fades.push(`fade=t=out:st=${round3(c.start + c.dur - c.fadeOut)}:d=${round3(c.fadeOut)}:alpha=0`);
    }
    if (fades.length) { parts.push(`[${baseLbl}]${fades.join(',')}[basef]`); baseLbl = 'basef'; }

    /* overlays: every clip on the upper video tracks */
    const seqDur = S.duration();
    let ovN = 0;
    for (const t of S.videoTracks().slice(1)) {
      if (!t.enabled) continue;
      for (const c of S.clipsOn(t.id)) {
        const a = S.assetById(c.assetId); if (!a) continue;
        const op = clamp((c.opacity == null ? 100 : c.opacity) / 100, 0, 1);
        if (op <= 0.001) continue;
        const st = round3(c.start), du = round3(c.dur);
        const lbl = 'o' + (ovN++);
        let idx;
        if (a.kind === 'image') { idx = push(['-loop', '1', '-t', String(du)], P(a)); }
        else { idx = push(['-ss', String(round3(c.in)), '-t', String(du)], P(a)); }
        const mode = c.blend || 'normal';
        const padColor = BLEND_ADDITIVE[mode] ? 'black' : BLEND_MULT[mode] ? 'white' : null;
        if (mode === 'normal' || padColor === null) {
          parts.push(`[${idx}:v]${norm},trim=duration=${du},setpts=PTS-STARTPTS+${st}/TB,format=yuva420p,colorchannelmixer=aa=${round3(op)}[${lbl}]`);
          parts.push(`[${baseLbl}][${lbl}]overlay=0:0:enable='between(t,${st},${round3(st + du)})':eof_action=pass[b${ovN}]`);
        } else {
          // pad to full length with a neutral colour so `blend` can run edge to edge
          const after = round3(Math.max(0, seqDur - st - du));
          parts.push(`[${idx}:v]${norm},trim=duration=${du},setpts=PTS-STARTPTS,tpad=start_duration=${st}:start_mode=add:stop_duration=${after}:stop_mode=add:color=${padColor}[${lbl}]`);
          parts.push(`[${baseLbl}][${lbl}]blend=all_mode=${mode}:all_opacity=${round3(op)}:shortest=1[b${ovN}]`);
        }
        baseLbl = 'b' + ovN;
      }
    }

    /* audio */
    const aLbls = [];
    for (const t of S.audioTracks()) {
      if (!t.enabled || t.mute) continue;
      for (const c of S.clipsOn(t.id)) {
        const a = S.assetById(c.assetId); if (!a) continue;
        const idx = push(['-ss', String(round3(c.in)), '-t', String(round3(c.dur))], P(a));
        const lbl = 'a' + aLbls.length;
        const gain = Math.pow(10, (c.volume || 0) / 20);
        const f = [];
        f.push(`atrim=duration=${round3(c.dur)}`, 'asetpts=PTS-STARTPTS');
        if (c.fadeIn > 0) f.push(`afade=t=in:st=0:d=${round3(c.fadeIn)}`);
        if (c.fadeOut > 0) f.push(`afade=t=out:st=${round3(c.dur - c.fadeOut)}:d=${round3(c.fadeOut)}`);
        if (Math.abs(gain - 1) > 0.001) f.push(`volume=${round3(gain)}`);
        f.push(`adelay=${Math.round(c.start * 1000)}|${Math.round(c.start * 1000)}`);
        f.push('aresample=48000');
        parts.push(`[${idx}:a]${f.join(',')}[${lbl}]`);
        aLbls.push(lbl);
      }
    }
    if (opt.sourceAudio) {
      for (const s of segs) {
        if (s.a.kind !== 'video' || s.a.hasAudio === false) continue;
        const lbl = 'a' + aLbls.length;
        parts.push(`[${s.idx}:a]atrim=duration=${s.sDur},asetpts=PTS-STARTPTS,adelay=${Math.round(s.c.start * 1000)}|${Math.round(s.c.start * 1000)},aresample=48000[${lbl}]`);
        aLbls.push(lbl);
      }
      warn.push('Source audio is mixed in from the clips on V1; if a clip has no audio stream ffmpeg will stop — drop this option in that case.');
    }
    let aOut = null;
    if (aLbls.length === 1) { parts.push(`[${aLbls[0]}]anull[aout]`); aOut = 'aout'; }
    else if (aLbls.length > 1) { parts.push(aLbls.map(l => `[${l}]`).join('') + `amix=inputs=${aLbls.length}:duration=longest:dropout_transition=0:normalize=0[aout]`); aOut = 'aout'; }

    parts.push(`[${baseLbl}]trim=duration=${round3(seqDur)},setpts=PTS-STARTPTS[vout]`);

    const cod = CODECS[opt.codec] || CODECS.h264;
    const outName = (opt.out || U.sanitize(d.name)) + '.' + cod.ext;
    const scale = opt.codec === 'proxy' ? ` -vf scale=${Math.round(W / 2)}:${Math.round(H / 2)}` : '';
    const vcodec = cod.v.replace(/-vf_scale \S+/, '').trim();
    const faststart = cod.ext === 'mp4' ? ' -movflags +faststart' : '';

    const graph = parts.join(';\n');
    const inputArgs = inputs.map(i => i.pre.concat(['-i', i.path]));

    const shIn = inputArgs.map(a => '  ' + a.map(shq).join(' ')).join(' \\\n');
    const sh = `#!/usr/bin/env bash
# FluxCut Studio — render "${d.name}"
# Requires ffmpeg on PATH.  The filter graph lives in filtergraph.txt.
set -euo pipefail
cd "$(dirname "$0")"
ffmpeg -y \\
${shIn} \\
  -filter_complex_script filtergraph.txt \\
  -map '[vout]'${aOut ? ` -map '[${aOut}]'` : ''} \\
  -r ${rate} ${vcodec}${scale} ${aOut ? cod.a : '-an'}${faststart} \\
  ${shq(outName)}
echo "Done → ${outName}"
`;

    const psIn = inputArgs.map(a => '  ' + a.map(psq).join(', ')).join(',\n');
    const ps1 = `# FluxCut Studio — render "${d.name}"  (PowerShell avoids cmd.exe's command-length limit)
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot
$args = @(
  "-y",
${psIn},
  "-filter_complex_script", "filtergraph.txt",
  "-map", "[vout]"${aOut ? `,\n  "-map", "[${aOut}]"` : ''},
  "-r", "${rate}",
${vcodec.split(/\s+/).map(x => '  "' + x + '"').join(',\n')},
${aOut ? cod.a.split(/\s+/).map(x => '  "' + x + '"').join(',\n') : '  "-an"'},${faststart ? '\n  "-movflags", "+faststart",' : ''}
  "${outName}"
)
& ffmpeg @args
Write-Host "Done -> ${outName}"
`;
    const bat = `@echo off\r\nREM FluxCut Studio — render "${d.name}"\r\npowershell -ExecutionPolicy Bypass -File "%~dp0render.ps1"\r\npause\r\n`;

    if (segs.length > 60) warn.push(segs.length + ' clips means ' + inputs.length + ' ffmpeg inputs — the render works but will be slow to start. For very long edits, prefer the Premiere/AME route.');
    return { sh, ps1, bat, filters: graph + '\n', outName, inputs: inputs.length, warnings: warn, codecLabel: cod.label };

    function shq(s) { return /^[-\w.\/:=]+$/.test(s) ? s : "'" + String(s).replace(/'/g, `'\\''`) + "'"; }
    function psq(s) { return '"' + String(s).replace(/"/g, '`"') + '"'; }
  }

  /* ── STORE-mode ZIP, streamed (never loads a video into RAM) ───── */
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; }
    return t;
  })();
  async function crc32OfBlob(blob, onProgress) {
    let c = 0xFFFFFFFF, read = 0;
    const reader = blob.stream().getReader();
    for (; ;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let i = 0; i < value.length; i++) c = CRC_TABLE[(c ^ value[i]) & 0xFF] ^ (c >>> 8);
      read += value.length;
      if (onProgress) onProgress(read);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosTime(d) {
    return { t: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xFFFF, d: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF };
  }
  /** entries: [{name, blob}] — returns a Blob without ever buffering file bytes. */
  async function zipStore(entries, onProgress) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0, i = 0;
    for (const e of entries) {
      const nameBytes = enc.encode(e.name);
      const size = e.blob.size;
      if (size > 0xFFFFFFF0) throw new Error(e.name + ' is over 4 GB — use "Collect to folder" instead of a ZIP.');
      const crc = await crc32OfBlob(e.blob, null);
      const dt = dosTime(new Date(e.blob.lastModified || Date.now()));
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0, true);
      lh.setUint16(8, 0, true); lh.setUint16(10, dt.t, true); lh.setUint16(12, dt.d, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
      lh.setUint16(26, nameBytes.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, nameBytes, e.blob);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
      ch.setUint16(8, 0, true); ch.setUint16(10, 0, true); ch.setUint16(12, dt.t, true); ch.setUint16(14, dt.d, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
      ch.setUint16(28, nameBytes.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
      central.push(ch.buffer, nameBytes);
      offset += 30 + nameBytes.length + size;
      i++; if (onProgress) onProgress(i / entries.length, e.name);
    }
    const cdStart = offset;
    let cdSize = 0; for (const p of central) cdSize += p.byteLength;
    const eo = new DataView(new ArrayBuffer(22));
    eo.setUint32(0, 0x06054b50, true); eo.setUint16(8, entries.length, true); eo.setUint16(10, entries.length, true);
    eo.setUint32(12, cdSize, true); eo.setUint32(16, cdStart, true); eo.setUint16(20, 0, true);
    return new Blob(parts.concat(central, [eo.buffer]), { type: 'application/zip' });
  }

  /* ── collect to a real folder (File System Access API) ─────────── */
  const canFolder = () => typeof window.showDirectoryPicker === 'function';
  async function collectToFolder(textFiles, assets, onProgress) {
    const root = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'videos' });
    const dir = await root.getDirectoryHandle(U.sanitize(FC.doc.name) + '_export', { create: true });
    for (const f of textFiles) {
      const h = await dir.getFileHandle(f.name, { create: true });
      const w = await h.createWritable(); await w.write(f.text); await w.close();
    }
    let n = 0;
    if (assets && assets.length) {
      const md = await dir.getDirectoryHandle('media', { create: true });
      const used = new Set();
      for (const a of assets) {
        const file = FC.files.get(a.id);
        n++; onProgress && onProgress(n / assets.length, a.name);
        if (!file) continue;
        let name = a.name; let k = 1;
        while (used.has(name.toLowerCase())) { name = a.name.replace(/(\.[^.]+)$/, '_' + (++k) + '$1'); }
        used.add(name.toLowerCase()); a._collected = 'media/' + name;
        const h = await md.getFileHandle(name, { create: true });
        const w = await h.createWritable();
        await file.stream().pipeTo(w);
      }
    }
    return dir.name;
  }

  FC.exportRender = { ffmpeg, CODECS, zipStore, collectToFolder, canFolder, crc32OfBlob };
})(window.FC);
