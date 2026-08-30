/* FluxCut Studio — timeline interchange writers.
   FCP7 XML (xmeml v4) is the workhorse: Premiere Pro, Media Encoder, Resolve and
   Vegas all read it. EDL / OTIO / CSV cover conform, Resolve-native and paperwork. */
(function (FC) {
  'use strict';
  const U = FC.util, S = FC.store, O = FC.ops;
  const X = s => U.esc(s);

  /* ── paths ─────────────────────────────────────────────────────── */
  function resolvePath(a) {
    if (!a) return '';
    if (a.pathOverride) return a.pathOverride;
    const rel = a.rel || a.name;
    if (FC.doc.pathMode === 'relative') return rel;
    return U.joinPath(FC.doc.mediaRoot, rel, FC.doc.winPaths);
  }
  function pathUrl(a) { return U.pathToUrl(resolvePath(a)); }

  /** Pre-flight: everything that could make Premiere show offline media. */
  function validate() {
    const used = new Set(FC.doc.clips.map(c => c.assetId));
    const assets = FC.doc.assets.filter(a => used.has(a.id));
    const issues = [];
    if (FC.doc.pathMode === 'absolute' && !FC.doc.mediaRoot)
      issues.push({ level: 'err', msg: 'No media root set — Premiere will not find any file. Set it in Sequence ▸ Media root, or switch to relative paths and keep the XML next to your media.' });
    const dupes = new Map();
    for (const a of assets) {
      const p = resolvePath(a);
      if (!p) issues.push({ level: 'err', msg: 'No path for ' + a.name });
      dupes.set(a.name, (dupes.get(a.name) || 0) + 1);
      if (a.broken) issues.push({ level: 'warn', msg: a.name + ' could not be decoded by this browser — the XML still points at it, Premiere may handle it fine.' });
      if (a.kind === 'video' && !a.duration) issues.push({ level: 'warn', msg: a.name + ' has no readable duration.' });
    }
    for (const [n, c] of dupes) if (c > 1) issues.push({ level: 'info', msg: c + ' different files are named "' + n + '" — they stay distinct because each keeps its own full path.' });
    let short = 0;
    for (const c of FC.doc.clips) { const a = S.assetById(c.assetId); if (a && a.kind === 'video' && a.duration && S.srcOut(c) > a.duration + 1e-3) short++; }
    if (short) issues.push({ level: 'warn', msg: short + ' clip(s) ask for more source than the file holds; Premiere will shorten them.' });
    const xf = FC.doc.clips.filter(c => c.xf && c.xf.dur > 0);
    let thin = 0;
    for (const c of xf) { const h = S.handles(c); if (h.head < c.xf.dur / 2 - 1e-3) thin++; }
    if (thin) issues.push({ level: 'warn', msg: thin + ' transition(s) have less handle than they need; Premiere will shorten those dissolves.' });
    if (!assets.length) issues.push({ level: 'err', msg: 'The sequence is empty.' });
    return { issues, assets };
  }

  /* ── frame helpers ─────────────────────────────────────────────── */
  function ctx() {
    const d = FC.doc;
    const fps = U.realFps(d.timebase, d.ntsc);
    return {
      d, fps, tb: d.timebase, ntsc: d.ntsc ? 'TRUE' : 'FALSE',
      F: s => Math.round(s * fps),
      ticks: s => Math.round(s * U.PPRO_TICKS_PER_SEC)
    };
  }
  const RATE = c => `<rate><timebase>${c.tb}</timebase><ntsc>${c.ntsc}</ntsc></rate>`;

  /* ── transitions ───────────────────────────────────────────────── */
  const XF = {
    cross: { name: 'Cross Dissolve', id: 'Cross Dissolve', cat: 'Dissolve' },
    additive: { name: 'Additive Dissolve', id: 'Additive Dissolve', cat: 'Dissolve' },
    film: { name: 'Non-Additive Dissolve', id: 'Non-Additive Dissolve', cat: 'Dissolve' },
    dipblack: { name: 'Dip to Color Dissolve', id: 'Dip to Color Dissolve', cat: 'Dissolve', color: [0, 0, 0] },
    dipwhite: { name: 'Dip to Color Dissolve', id: 'Dip to Color Dissolve', cat: 'Dissolve', color: [255, 255, 255] },
    wipe: { name: 'Edge Wipe', id: 'SMPTE Wipe', cat: 'Wipe', wipecode: 1 },
    slide: { name: 'Slide', id: 'Slide', cat: 'Slide' }
  };
  const XF_LABEL = { cross: 'Cross Dissolve', additive: 'Additive Dissolve', film: 'Film Dissolve', dipblack: 'Dip to Black', dipwhite: 'Dip to White', wipe: 'Wipe', slide: 'Slide' };

  function transitionXml(c, cur, prevEndF) {
    const t = XF[c.xf.type] || XF.cross;
    const halfF = Math.round(c.xf.dur * cur.fps / 2);
    const cut = cur.F(c.start);
    const s = Math.max(0, cut - halfF), e = cut + halfF;
    const colorParam = t.color ? `
          <parameter authoringApp="PremierePro"><parameterid>color</parameterid><name>Color</name>
            <value><alpha>255</alpha><red>${t.color[0]}</red><green>${t.color[1]}</green><blue>${t.color[2]}</blue></value>
          </parameter>` : '';
    return `        <transitionitem>
          ${RATE(cur)}
          <start>${s}</start>
          <end>${e}</end>
          <alignment>center</alignment>
          <cutPointTicks>${cur.ticks(c.start)}</cutPointTicks>
          <rate><timebase>${cur.tb}</timebase><ntsc>${cur.ntsc}</ntsc></rate>
          <effect>
            <name>${X(t.name)}</name>
            <effectid>${X(t.id)}</effectid>
            <effectcategory>${X(t.cat)}</effectcategory>
            <effecttype>transition</effecttype>
            <mediatype>video</mediatype>
            <wipecode>${t.wipecode || 0}</wipecode>
            <wipeaccuracy>100</wipeaccuracy>
            <startratio>0</startratio>
            <endratio>1</endratio>
            <reverse>FALSE</reverse>${colorParam}
          </effect>
        </transitionitem>
`;
  }

  /* ── filters ───────────────────────────────────────────────────── */
  function opacityFilter(v) {
    return `          <filter>
            <effect>
              <name>Opacity</name><effectid>opacity</effectid>
              <effectcategory>motion</effectcategory><effecttype>motion</effecttype>
              <mediatype>video</mediatype><pproBypass>false</pproBypass>
              <parameter authoringApp="PremierePro">
                <parameterid>opacity</parameterid><name>opacity</name>
                <valuemin>0</valuemin><valuemax>100</valuemax><value>${U.round2(v)}</value>
              </parameter>
            </effect>
          </filter>
`;
  }
  /** Basic Motion — static scale/position, or keyframed for Ken Burns. */
  function motionFilter(scalePct, kb, inF, outF, centerX, centerY) {
    const kf = (id, name, min, max, pairs) =>
      `              <parameter authoringApp="PremierePro">
                <parameterid>${id}</parameterid><name>${name}</name>${min != null ? `<valuemin>${min}</valuemin><valuemax>${max}</valuemax>` : ''}
${pairs}              </parameter>
`;
    let scaleP, centerP;
    if (kb) {
      scaleP = kf('scale', 'Scale', 0, 1000,
        `                <keyframe><when>${inF}</when><value>${U.round2(scalePct * kb.fromScale / 100)}</value></keyframe>
                <keyframe><when>${outF}</when><value>${U.round2(scalePct * kb.toScale / 100)}</value></keyframe>
`);
      centerP = kf('center', 'Center', null, null,
        `                <keyframe><when>${inF}</when><value><horiz>${U.round3(centerX + kb.fromX / 100)}</horiz><vert>${U.round3(centerY + kb.fromY / 100)}</vert></value></keyframe>
                <keyframe><when>${outF}</when><value><horiz>${U.round3(centerX + kb.toX / 100)}</horiz><vert>${U.round3(centerY + kb.toY / 100)}</vert></value></keyframe>
`);
    } else {
      scaleP = kf('scale', 'Scale', 0, 1000, `                <value>${U.round2(scalePct)}</value>\n`);
      centerP = kf('center', 'Center', null, null, `                <value><horiz>${U.round3(centerX)}</horiz><vert>${U.round3(centerY)}</vert></value>\n`);
    }
    return `          <filter>
            <effect>
              <name>Basic Motion</name><effectid>basic</effectid>
              <effectcategory>motion</effectcategory><effecttype>motion</effecttype>
              <mediatype>video</mediatype><pproBypass>false</pproBypass>
${scaleP}${centerP}            </effect>
          </filter>
`;
  }
  function fadeFilter(kind, sec, cur, inF, outF) {
    // audio level keyframes give real fades that Premiere shows on the rubber band
    const f = Math.max(1, Math.round(sec * cur.fps));
    const kfs = kind === 'in'
      ? `                <keyframe><when>${inF}</when><value>0</value></keyframe>
                <keyframe><when>${inF + f}</when><value>1</value></keyframe>\n`
      : `                <keyframe><when>${outF - f}</when><value>1</value></keyframe>
                <keyframe><when>${outF}</when><value>0</value></keyframe>\n`;
    return `          <filter>
            <effect>
              <name>Audio Levels</name><effectid>audiolevels</effectid>
              <effectcategory>audiolevels</effectcategory><effecttype>audiolevels</effecttype>
              <mediatype>audio</mediatype><pproBypass>false</pproBypass>
              <parameter authoringApp="PremierePro">
                <parameterid>level</parameterid><name>Level</name><valuemin>0</valuemin><valuemax>3.98107</valuemax>
${kfs}              </parameter>
            </effect>
          </filter>
`;
  }

  const LABELS = ['Violet', 'Iris', 'Caribbean', 'Lavender', 'Cerulean', 'Forest', 'Rose', 'Mango', 'Purple', 'Blue'];

  /* ── the main writer ───────────────────────────────────────────── */
  function fcpxml(opt) {
    opt = Object.assign({ fitToFrame: true, sourceAudio: true, kenBurns: true, opacity: true, markers: true, labels: true }, opt || {});
    const cur = ctx(), d = FC.doc;
    const usedAssets = [];
    const assetIndex = new Map();
    for (const c of d.clips) if (!assetIndex.has(c.assetId)) { assetIndex.set(c.assetId, usedAssets.length + 1); usedAssets.push(S.assetById(c.assetId)); }

    const emitted = new Set();
    let cid = 0;
    const links = [];

    function fileXml(a, fileId, forceAudio) {
      if (emitted.has(fileId)) return `            <file id="${fileId}"/>\n`;
      emitted.add(fileId);
      const durF = Math.max(1, cur.F(a.duration || (a.kind === 'image' ? 3600 : 1)));
      const w = a.w || d.width, h = a.h || d.height;
      const audio = (a.kind === 'video' && (a.hasAudio !== false)) || a.kind === 'audio' || forceAudio;
      const video = a.kind !== 'audio';
      return `            <file id="${fileId}">
              <name>${X(a.name)}</name>
              <pathurl>${X(pathUrl(a))}</pathurl>
              ${RATE(cur)}
              <duration>${durF}</duration>
              <timecode>${RATE(cur)}<string>00:00:00:00</string><frame>0</frame><displayformat>${d.ntsc && d.df ? 'DF' : 'NDF'}</displayformat></timecode>
              <media>
${video ? `                <video>
                  <samplecharacteristics>
                    ${RATE(cur)}
                    <width>${w}</width><height>${h}</height>
                    <anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance>
                  </samplecharacteristics>
                </video>
` : ''}${audio ? `                <audio>
                  <samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics>
                  <channelcount>2</channelcount>
                </audio>
` : ''}              </media>
            </file>
`;
    }

    /** One video clipitem (+ its transition, if any). */
    function videoClip(c, trackIdx, clipIndex) {
      const a = S.assetById(c.assetId); if (!a) return '';
      const ai = assetIndex.get(c.assetId);
      const fileId = 'file-' + ai, mcId = 'masterclip-' + ai;
      const id = 'clipitem-' + (++cid);
      c._xmlId = id;
      const startF = cur.F(c.start), endF = cur.F(c.start + c.dur);
      const inF = cur.F(c.in), outF = inF + (endF - startF);
      const fileDurF = Math.max(outF, cur.F(a.duration || 0), 1);

      let filters = '';
      if (opt.opacity && c.opacity != null && c.opacity < 100) filters += opacityFilter(c.opacity);
      const needFit = opt.fitToFrame && a.w && a.h && (a.w !== d.width || a.h !== d.height);
      const fit = (c.motion && c.motion.fit) || 'fill';
      if (needFit || (c.kb && opt.kenBurns)) {
        const k = fit === 'fit' ? Math.min(d.width / a.w, d.height / a.h) : Math.max(d.width / a.w, d.height / a.h);
        const scalePct = (a.w && a.h) ? k * 100 : 100;
        filters += motionFilter(scalePct, opt.kenBurns ? c.kb : null, inF, outF, 0, 0);
      }
      const label = opt.labels && c.color ? `            <labels><label2>${LABELS[U.CLIP_COLORS.indexOf(c.color) % LABELS.length] || 'Iris'}</label2></labels>\n` : '';

      // A video clip and its own audio must be linked, or Premiere treats them as strangers.
      let linkXml = '';
      let audioId = null;
      if (opt.sourceAudio && a.kind === 'video' && a.hasAudio !== false) {
        audioId = 'clipitem-' + (++cid) + '-a';
        linkXml =
          `            <link><linkclipref>${id}</linkclipref><mediatype>video</mediatype><trackindex>${trackIdx + 1}</trackindex><clipindex>${clipIndex}</clipindex></link>
            <link><linkclipref>${audioId}</linkclipref><mediatype>audio</mediatype><trackindex>1</trackindex><clipindex>${clipIndex}</clipindex><groupindex>1</groupindex></link>
`;
      }

      let out = `          <clipitem id="${id}">
            <masterclipid>${mcId}</masterclipid>
            <name>${X(c.name || a.name)}</name>
            <enabled>${c.enabled ? 'TRUE' : 'FALSE'}</enabled>
            <duration>${fileDurF}</duration>
            ${RATE(cur)}
            <start>${startF}</start>
            <end>${endF}</end>
            <in>${inF}</in>
            <out>${outF}</out>
            <pproTicksIn>${cur.ticks(c.in)}</pproTicksIn>
            <pproTicksOut>${cur.ticks(c.in + c.dur)}</pproTicksOut>
            <alphatype>${a.kind === 'image' ? 'straight' : 'none'}</alphatype>
            <pixelaspectratio>square</pixelaspectratio>
            <anamorphic>FALSE</anamorphic>
${label}${fileXml(a, fileId)}            <sourcetrack><mediatype>video</mediatype><trackindex>1</trackindex></sourcetrack>
${filters}${linkXml}          </clipitem>
`;
      if (audioId) {
        srcAudioItems.push({ xml: audioClip(c, a, fileId, mcId, audioId, 1, startF, endF, inF, outF, fileDurF, linkXml), id: audioId });
        links.push([id, audioId]);
      }
      return out;
    }

    function audioClip(c, a, fileId, mcId, id, srcTrack, startF, endF, inF, outF, fileDurF, linkXml) {
      let filters = '';
      if (c.fadeIn > 0) filters += fadeFilter('in', c.fadeIn, cur, inF, outF);
      if (c.fadeOut > 0) filters += fadeFilter('out', c.fadeOut, cur, inF, outF);
      return `          <clipitem id="${id}">
            <masterclipid>${mcId}</masterclipid>
            <name>${X(c.name || a.name)}</name>
            <enabled>${c.enabled ? 'TRUE' : 'FALSE'}</enabled>
            <duration>${fileDurF}</duration>
            ${RATE(cur)}
            <start>${startF}</start>
            <end>${endF}</end>
            <in>${inF}</in>
            <out>${outF}</out>
            <pproTicksIn>${cur.ticks(c.in)}</pproTicksIn>
            <pproTicksOut>${cur.ticks(c.in + c.dur)}</pproTicksOut>
${fileXml(a, fileId, true)}            <sourcetrack><mediatype>audio</mediatype><trackindex>${srcTrack}</trackindex></sourcetrack>
${filters}${linkXml || ''}          </clipitem>
`;
    }

    const srcAudioItems = [];

    /* video tracks */
    let videoTracksXml = '';
    const vts = S.videoTracks();
    for (const t of vts) {
      const list = S.clipsOn(t.id);
      let body = '';
      list.forEach((c, i) => {
        if (c.xf && c.xf.dur > 0) body += transitionXml(c, cur);
        body += videoClip(c, t.idx, i + 1);
      });
      videoTracksXml += `        <track>
${body}          <enabled>${t.enabled ? 'TRUE' : 'FALSE'}</enabled>
          <locked>${t.locked ? 'TRUE' : 'FALSE'}</locked>
        </track>
`;
    }

    /* audio tracks: the document's own, then one per source-audio channel pair */
    let audioTracksXml = '';
    for (const t of S.audioTracks()) {
      const list = S.clipsOn(t.id);
      let body = '';
      for (const c of list) {
        const a = S.assetById(c.assetId); if (!a) continue;
        const ai = assetIndex.get(c.assetId);
        const startF = cur.F(c.start), endF = cur.F(c.start + c.dur);
        const inF = cur.F(c.in), outF = inF + (endF - startF);
        body += audioClip(c, a, 'file-' + ai, 'masterclip-' + ai, 'clipitem-' + (++cid), 1, startF, endF, inF, outF, Math.max(outF, cur.F(a.duration || 0), 1));
      }
      audioTracksXml += `        <track>
${body}          <enabled>${t.enabled && !t.mute ? 'TRUE' : 'FALSE'}</enabled>
          <locked>${t.locked ? 'TRUE' : 'FALSE'}</locked>
          <outputchannelindex>1</outputchannelindex>
        </track>
`;
    }
    if (srcAudioItems.length) {
      audioTracksXml += `        <track>
${srcAudioItems.map(x => x.xml).join('')}          <enabled>TRUE</enabled>
          <locked>FALSE</locked>
          <outputchannelindex>1</outputchannelindex>
        </track>
`;
    }

    /* markers */
    let markersXml = '';
    if (opt.markers) for (const m of d.markers) {
      markersXml += `      <marker><comment>${X(m.note || '')}</comment><name>${X(m.name || 'Marker')}</name><in>${cur.F(m.t)}</in><out>-1</out></marker>\n`;
    }
    const totalF = cur.F(S.duration());
    const uuid = (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, ch => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); }));

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<!-- Generated by FluxCut Studio · ${new Date().toISOString()} -->
<xmeml version="4">
  <sequence id="sequence-1" TL.SQAudioVisibleBase="0" TL.SQVideoVisibleBase="0" MZ.Sequence.PreviewFrameSizeHeight="${d.height}" MZ.Sequence.PreviewFrameSizeWidth="${d.width}">
    <uuid>${uuid}</uuid>
    <name>${X(d.name)}</name>
    <duration>${totalF}</duration>
    ${RATE(cur)}
    <timecode>${RATE(cur)}<string>00:00:00:00</string><frame>0</frame><displayformat>${d.ntsc && d.df ? 'DF' : 'NDF'}</displayformat></timecode>
    <in>-1</in><out>-1</out>
    <media>
      <video>
        <format>
          <samplecharacteristics>
            ${RATE(cur)}
            <codec><name>Apple None</name><appspecificdata><appname>Final Cut Pro</appname><appmanufacturer>Apple Inc.</appmanufacturer><appversion>7.0</appversion>
              <data><qtcodec/></data></appspecificdata></codec>
            <width>${d.width}</width><height>${d.height}</height>
            <anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio>
            <fielddominance>none</fielddominance><colordepth>24</colordepth>
          </samplecharacteristics>
        </format>
${videoTracksXml}      </video>
      <audio>
        <numOutputChannels>2</numOutputChannels>
        <format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>
        <outputs>
          <group><index>1</index><numchannels>1</numchannels><downmix>0</downmix><channel><index>1</index></channel></group>
          <group><index>2</index><numchannels>1</numchannels><downmix>0</downmix><channel><index>2</index></channel></group>
        </outputs>
${audioTracksXml}      </audio>
    </media>
${markersXml}  </sequence>
</xmeml>
`;
  }

  /* ── EDL (CMX 3600) ────────────────────────────────────────────── */
  function edl() {
    const cur = ctx(), d = FC.doc;
    const t = (s) => U.tc(s, d.timebase, d.ntsc, d.ntsc && d.df);
    const main = S.mainTrack(); if (!main) return '';
    let out = `TITLE: ${d.name}\nFCM: ${d.ntsc && d.df ? 'DROP FRAME' : 'NON-DROP FRAME'}\n\n`;
    const reelOf = a => (a.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'REEL').slice(0, 8).padEnd(8, ' ');
    const list = S.clipsOn(main.id);
    let n = 0;
    list.forEach((c, i) => {
      const a = S.assetById(c.assetId); if (!a) return;
      n++;
      const num = String(n).padStart(3, '0');
      const srcIn = t(c.in), srcOut = t(c.in + c.dur), recIn = t(c.start), recOut = t(c.start + c.dur);
      if (c.xf && c.xf.dur > 0 && list[i - 1]) {
        // CMX 3600 writes a dissolve as a zero-length cut from the outgoing reel
        // followed by the D event — one line alone confuses conform tools.
        const p = list[i - 1], pa = S.assetById(p.assetId);
        const pOut = t(p.in + p.dur);
        out += `${num}  ${reelOf(pa || a)} V     C        ${pOut} ${pOut} ${recIn} ${recIn}\n`;
        out += `${num}  ${reelOf(a)} V     D    ${String(Math.round(c.xf.dur * cur.fps)).padStart(3, '0')} ${srcIn} ${srcOut} ${recIn} ${recOut}\n`;
      } else {
        out += `${num}  ${reelOf(a)} V     C        ${srcIn} ${srcOut} ${recIn} ${recOut}\n`;
      }
      out += `* FROM CLIP NAME: ${a.name}\n`;
      if (FC.doc.pathMode === 'absolute') out += `* SOURCE FILE: ${resolvePath(a)}\n`;
      out += '\n';
    });
    return out;
  }

  /* ── OpenTimelineIO (Resolve, Flow, otiotool) ──────────────────── */
  function otio() {
    const d = FC.doc, fps = U.realFps(d.timebase, d.ntsc);
    const rt = (s) => ({ OTIO_SCHEMA: 'RationalTime.1', rate: fps, value: Math.round(s * fps) });
    const range = (st, du) => ({ OTIO_SCHEMA: 'TimeRange.1', start_time: rt(st), duration: rt(du) });
    const tracks = S.displayTracks().slice().reverse().map(t => {
      const children = []; let cursor = 0;
      for (const c of S.clipsOn(t.id)) {
        if (c.start > cursor + 1e-4) { children.push({ OTIO_SCHEMA: 'Gap.1', name: 'gap', source_range: range(0, c.start - cursor) }); cursor = c.start; }
        const a = S.assetById(c.assetId);
        children.push({
          OTIO_SCHEMA: 'Clip.1', name: c.name || (a ? a.name : 'clip'),
          source_range: range(c.in, c.dur),
          media_reference: {
            OTIO_SCHEMA: 'ExternalReference.1',
            target_url: a ? U.pathToUrl(resolvePath(a)) : '',
            available_range: a && a.duration ? range(0, a.duration) : null
          },
          metadata: { fluxcut: { opacity: c.opacity, blend: c.blend, transition: c.xf ? c.xf.type : null } }
        });
        cursor = c.start + c.dur;
      }
      return { OTIO_SCHEMA: 'Track.1', name: t.name, kind: t.kind === 'video' ? 'Video' : 'Audio', children };
    });
    return JSON.stringify({
      OTIO_SCHEMA: 'Timeline.1', name: d.name,
      global_start_time: rt(0),
      tracks: { OTIO_SCHEMA: 'Stack.1', name: 'tracks', children: tracks },
      metadata: { fluxcut: { version: 3, width: d.width, height: d.height, fps } }
    }, null, 1);
  }

  /* ── paperwork ─────────────────────────────────────────────────── */
  function csv() {
    const d = FC.doc;
    const t = s => U.tc(s, d.timebase, d.ntsc, d.ntsc && d.df);
    let out = 'Track,#,Clip,Rec In,Rec Out,Duration (s),Src In,Src Out,Opacity,Blend,Transition,Path\n';
    for (const tr of S.displayTracks()) {
      let i = 0;
      for (const c of S.clipsOn(tr.id)) {
        const a = S.assetById(c.assetId); i++;
        out += [tr.name, i, q(c.name || (a && a.name) || ''), t(c.start), t(c.start + c.dur), U.round3(c.dur),
        t(c.in), t(c.in + c.dur), c.opacity, c.blend, c.xf ? XF_LABEL[c.xf.type] + ' ' + U.round2(c.xf.dur) + 's' : 'Cut',
        q(a ? resolvePath(a) : '')].join(',') + '\n';
      }
    }
    return out;
    function q(s) { return /[",\n]/.test(s) ? '"' + String(s).replace(/"/g, '""') + '"' : s; }
  }

  function readme(files) {
    const d = FC.doc, v = validate();
    return `FluxCut Studio export — ${d.name}
${'='.repeat(40)}
Generated ${new Date().toLocaleString()}
Sequence   ${d.width}x${d.height} @ ${U.realFps(d.timebase, d.ntsc).toFixed(3)} fps${d.ntsc ? ' (NTSC)' : ''}
Length     ${U.tc(S.duration(), d.timebase, d.ntsc, d.df)}  ·  ${FC.doc.clips.length} clips  ·  ${v.assets.length} source files
Paths      ${d.pathMode === 'relative' ? 'relative to this folder' : d.mediaRoot || '(none set)'}

In this export
${files.map(f => '  · ' + f).join('\n')}

Premiere Pro
  1. File ▸ Import…  ▸  pick sequence.xml
  2. Premiere builds a bin and a sequence with the same name.
  3. Open the sequence — cuts, opacity, dissolves and markers are already in place.
  If clips come in offline, the media root above did not match this machine:
  right-click the bin ▸ Link Media, point at one file, and Premiere finds the rest.

Adobe Media Encoder
  · Reliable route: open the sequence in Premiere ▸ File ▸ Export ▸ Media ▸ Queue.
  · Direct route: in AME, File ▸ Add Source ▸ sequence.xml (recent AME builds read
    Final Cut Pro XML; if yours refuses the file, use the Premiere route above).
  · No Adobe at all: run the render script in this folder — it renders the same
    edit with ffmpeg, transitions, overlays and audio included.

DaVinci Resolve
  File ▸ Import ▸ Timeline ▸ Pre-conformed EDL / Final Cut Pro 7 XML (sequence.xml),
  or import timeline.otio for a native OpenTimelineIO conform.

Notes
  · Blend modes are previewed in FluxCut and baked by the ffmpeg script, but FCP7 XML
    has no blend-mode field: in Premiere set them by hand, or render with ffmpeg.
  · Transitions need handles. Anything the report flagged as short was shortened
    to fit rather than silently dropped.
`;
  }

  FC.exportXml = { fcpxml, edl, otio, csv, readme, validate, resolvePath, pathUrl, XF, XF_LABEL };
})(window.FC);
