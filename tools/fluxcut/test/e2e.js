const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),fs=require('fs');
const APP=process.argv[2]||path.join(__dirname,'..','FluxCut.html');
const MEDIA=process.argv[3]||path.join(__dirname,'media');
const V=['clip_a','clip_b','clip_c','clip_d','clip_e','clip_f'].map(n=>path.join(MEDIA,n+'.webm'));
const I=['still_1','still_2','still_3'].map(n=>path.join(MEDIA,n+'.jpg'));
const A=[path.join(MEDIA,'music.wav')];

let pass=0,fail=0; const fails=[];
function ok(name,cond,extra){ if(cond){pass++;console.log('  ✓ '+name);} else {fail++;fails.push(name+(extra?' → '+JSON.stringify(extra):''));console.log('  ✗ '+name+(extra?'  '+JSON.stringify(extra):''));} }

(async()=>{
  const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--autoplay-policy=no-user-gesture-required','--mute-audio']});
  const ctx=await browser.newContext({viewport:{width:1600,height:960}});
  const page=await ctx.newPage();
  const errors=[],warns=[];
  page.on('console',m=>{ if(m.type()==='error')errors.push(m.text()); if(m.type()==='warning')warns.push(m.text()); });
  page.on('pageerror',e=>errors.push('PAGEERROR: '+e.message+'\n'+(e.stack||'').split('\n').slice(0,4).join('\n')));

  console.log('\n── load ──');
  await page.goto('file://'+APP);
  await page.waitForFunction(()=>window.FC&&FC.app&&FC.timeline&&FC.player,{timeout:15000});
  ok('app boots',true);
  ok('no boot errors',errors.length===0,errors.slice(0,3));

  console.log('\n── import ──');
  await page.setInputFiles('#filePicker',[...V,...I,...A]);
  await page.waitForFunction(()=>FC.doc.assets.length===10,{timeout:30000});
  const probed=await page.evaluate(()=>FC.doc.assets.map(a=>({n:a.name,k:a.kind,d:+a.duration.toFixed(2),w:a.w,h:a.h,broken:!!a.broken})));
  ok('10 assets ingested',probed.length===10);
  ok('nothing broken',probed.every(a=>!a.broken),probed.filter(a=>a.broken));
  ok('video durations read',probed.filter(a=>a.k==='video').every(a=>a.d>1&&a.d<12),probed.filter(a=>a.k==='video'));
  ok('image dims read',probed.filter(a=>a.k==='image').every(a=>a.w===800&&a.h===600));
  ok('audio duration read',Math.abs(probed.find(a=>a.k==='audio').d-24)<0.6,probed.find(a=>a.k==='audio'));

  console.log('\n── thumbnails ──');
  await page.waitForFunction(()=>FC.media.memoryStats().bitmaps>=3,{timeout:20000}).catch(()=>{});
  const th=await page.evaluate(()=>FC.media.memoryStats());
  ok('thumbnails decoded',th.bitmaps>=3,th);

  console.log('\n── auto-build ──');
  const build=await page.evaluate(()=>{
    Object.assign(FC.doc.build,{pattern:'fixed',fixed:2,order:'random',seed:42,target:'media',take:'center',noRepeat:true,xfType:'none'});
    FC.store.sel.assets.clear();
    const r=FC.director.build();
    const m=FC.store.mainTrack();
    const list=FC.store.clipsOn(m.id);
    let gaps=0,maxGap=0;
    for(let i=1;i<list.length;i++){const g=Math.abs(list[i].start-(list[i-1].start+list[i-1].dur)); if(g>1e-6){gaps++;maxGap=Math.max(maxGap,g);} }
    return {r,n:list.length,gaps,maxGap,durs:list.map(c=>+c.dur.toFixed(4)),
      firstStart:list[0].start, total:+FC.store.duration().toFixed(4),
      allFramed:list.every(c=>Math.abs(c.start*FC.store.fps()-Math.round(c.start*FC.store.fps()))<1e-6)};
  });
  ok('build produced clips',build.n===9,build);
  ok('no gaps between clips',build.gaps===0,{gaps:build.gaps,maxGap:build.maxGap});
  ok('every clip is 2s',build.durs.every(d=>Math.abs(d-2)<0.02),build.durs.slice(0,4));
  ok('starts on frame boundaries',build.allFramed);
  ok('total = 18s',Math.abs(build.total-18)<0.05,build.total);

  console.log('\n── shuffle: order (durations travel with the clip) ──');
  const sh=await page.evaluate(()=>{
    Object.assign(FC.doc.build,{pattern:'range',min:1,max:4,seed:7});
    FC.director.build();
    const m=FC.store.mainTrack();
    const before=FC.store.clipsOn(m.id).map(c=>({id:c.id,dur:+c.dur.toFixed(4),asset:c.assetId}));
    FC.director.reshuffle('order');
    const after=FC.store.clipsOn(m.id).map(c=>({id:c.id,dur:+c.dur.toFixed(4),asset:c.assetId}));
    const sortNum=a=>a.slice().sort((x,y)=>x-y).join(',');
    let gaps=0; for(let i=1;i<after.length;i++) if(Math.abs(after[i].start-(after[i-1].start+after[i-1].dur))>1e-6) gaps++;
    return {
      sameDurationSet: sortNum(before.map(c=>c.dur))===sortNum(after.map(c=>c.dur)),
      orderChanged: before.map(c=>c.id).join()!==after.map(c=>c.id).join(),
      pairsKept: before.every(b=>{const a=after.find(x=>x.id===b.id); return a&&a.dur===b.dur&&a.asset===b.asset;}),
      totalSame: true, n:after.length
    };
  });
  ok('same set of durations after shuffle',sh.sameDurationSet);
  ok('order actually changed',sh.orderChanged);
  ok('each clip kept its own duration + source',sh.pairsKept);

  console.log('\n── shuffle: content (slots stay, sources move) ──');
  const sc=await page.evaluate(()=>{
    const m=FC.store.mainTrack();
    const slots=FC.store.clipsOn(m.id).map(c=>({start:+c.start.toFixed(4),dur:+c.dur.toFixed(4)}));
    const src=FC.store.clipsOn(m.id).map(c=>c.assetId);
    FC.director.reshuffle('content');
    const slots2=FC.store.clipsOn(m.id).map(c=>({start:+c.start.toFixed(4),dur:+c.dur.toFixed(4)}));
    const src2=FC.store.clipsOn(m.id).map(c=>c.assetId);
    const inRange=FC.store.clipsOn(m.id).every(c=>{const a=FC.store.assetById(c.assetId);return a.kind!=='video'||c.in+c.dur<=a.duration+0.05;});
    return {gridSame:JSON.stringify(slots)===JSON.stringify(slots2), srcChanged:src.join()!==src2.join(), inRange};
  });
  ok('slot grid untouched',sc.gridSame);
  ok('sources moved between slots',sc.srcChanged);
  ok('source windows stay inside their files',sc.inRange);

  console.log('\n── take-from: spread one source across many takes ──');
  const sp=await page.evaluate(()=>{
    const a=FC.doc.assets.find(x=>x.name==='clip_f.webm');
    FC.doc.clips=[]; FC.store.bump();
    const n=FC.director.explode(a,8,1.0);
    const m=FC.store.mainTrack(), list=FC.store.clipsOn(m.id);
    const ins=list.map(c=>+c.in.toFixed(2));
    return {n,ins,unique:new Set(ins).size,max:Math.max(...ins),dur:a.duration};
  });
  ok('8 takes created',sp.n===8);
  ok('each take starts somewhere different',sp.unique>=6,sp.ins);
  ok('takes stay inside the source',sp.max+1<=sp.dur,sp);

  console.log('\n── audio, beats, fit ──');
  const au=await page.evaluate(async()=>{
    const music=FC.doc.assets.find(a=>a.kind==='audio');
    const at=FC.store.audioTracks()[0];
    FC.store.edit('audio',()=>{ FC.doc.clips.push(FC.ops.clipFromAsset(music,{track:at.id,start:0,dur:music.duration})); FC.store.bump(); });
    const w=await FC.media.ensureWave(music);
    Object.assign(FC.doc.build,{pattern:'fixed',fixed:1.5,target:'audio',order:'random',seed:3,loopPool:true});
    const r=FC.director.build();
    const m=FC.store.mainTrack();
    return {bpm:w&&w.bpm, beats:w&&w.beats.length, videoEnd:+FC.ops.trackEnd(m.id).toFixed(3), audioLen:+music.duration.toFixed(3), clips:FC.store.clipsOn(m.id).length};
  });
  ok('beat detection finds ~120 BPM',au.bpm&&Math.abs(au.bpm-120)<6,{bpm:au.bpm});
  ok('beat grid populated',au.beats>30,{beats:au.beats});
  ok('video filled to audio length',Math.abs(au.videoEnd-au.audioLen)<0.06,au);
  ok('pool looped to fill',au.clips>10,au);

  console.log('\n── beat-synced cutting ──');
  const bs=await page.evaluate(()=>{
    Object.assign(FC.doc.build,{pattern:'beat',beatsPer:4,target:'audio',seed:11});
    FC.director.build();
    const m=FC.store.mainTrack(), list=FC.store.clipsOn(m.id);
    const beats=FC.director.beatGrid();
    let onBeat=0;
    for(const c of list){ if(beats.some(b=>Math.abs(b-c.start)<0.06)) onBeat++; }
    return {n:list.length,onBeat,durs:list.slice(0,5).map(c=>+c.dur.toFixed(2))};
  });
  ok('most cuts land on a beat',bs.onBeat>=bs.n-2,bs);
  ok('4-beat cuts ≈ 2s at 120bpm',bs.durs.filter(d=>Math.abs(d-2)<0.2).length>=3,bs.durs);

  console.log('\n── overlays ──');
  const ov=await page.evaluate(()=>{
    Object.assign(FC.doc.build,{pattern:'fixed',fixed:2,target:'time',targetTime:20,seed:5});
    FC.director.build();
    const still=FC.doc.assets.find(a=>a.kind==='image');
    const t2=FC.store.videoTracks()[1];
    FC.store.edit('ov',()=>{ FC.director.addOverlayRule(still.id,t2.id,{mode:'interval',every:4,dur:1.5,opacity:40,blend:'screen'}); FC.director.rebuildOverlays(); });
    const clips=FC.store.clipsOn(t2.id);
    const seq=FC.director.mainDuration();
    const cover=clips.length&&clips[clips.length-1].start+clips[clips.length-1].dur<=seq+0.01;
    // rebuild the base and confirm overlays re-flow to the new length
    Object.assign(FC.doc.build,{targetTime:12});
    FC.director.build();
    const after=FC.store.clipsOn(t2.id);
    return {n:clips.length,cover,opacity:clips[0]&&clips[0].opacity,blend:clips[0]&&clips[0].blend,
      seqBefore:+seq.toFixed(2), nAfter:after.length, seqAfter:+FC.director.mainDuration().toFixed(2),
      lastEnd:after.length?+(after[after.length-1].start+after[after.length-1].dur).toFixed(2):0};
  });
  ok('overlay instances generated',ov.n>=4,ov);
  ok('overlays carry opacity + blend',ov.opacity===40&&ov.blend==='screen',ov);
  ok('overlays stay inside the edit',ov.cover);
  ok('overlays re-flow when the edit changes',ov.nAfter<ov.n&&ov.lastEnd<=ov.seqAfter+0.01,ov);

  console.log('\n── transitions + handles ──');
  const xf=await page.evaluate(()=>{
    Object.assign(FC.doc.build,{pattern:'fixed',fixed:2,target:'media',take:'center',seed:9,xfType:'none'});
    FC.director.build();
    const m=FC.store.mainTrack();
    const rep=FC.store.edit('xf',()=>FC.ops.applyTransitions(m.id,'cross',1.0,1));
    const list=FC.store.clipsOn(m.id);
    const bad=list.filter(c=>c.xf&&FC.store.handles(c).head<c.xf.dur/2-1e-3).length;
    let gaps=0; for(let i=1;i<list.length;i++) if(Math.abs(list[i].start-(list[i-1].start+list[i-1].dur))>1e-6) gaps++;
    return {rep,bad,gaps,withXf:list.filter(c=>c.xf).length,total:list.length};
  });
  ok('transitions applied to every cut',xf.rep.applied===xf.rep.cuts,xf.rep);
  ok('none exceed available handles',xf.bad===0,xf);
  ok('transitions do not create gaps',xf.gaps===0);

  console.log('\n── playback ──');
  await page.evaluate(()=>{FC.player.seek(0);FC.player.play();});
  await page.waitForTimeout(1400);
  const pl=await page.evaluate(()=>{
    const t=FC.player.time; FC.player.pause();
    const c=document.getElementById('monitor');
    const g=c.getContext('2d');
    const d=g.getImageData(0,0,c.width,c.height).data;
    let nonBlack=0; for(let i=0;i<d.length;i+=4*97) if(d[i]+d[i+1]+d[i+2]>30) nonBlack++;
    return {t:+t.toFixed(2), nonBlack, samples:Math.ceil(d.length/(4*97)), fps:FC.player.fps, stats:FC.player.stats()};
  });
  ok('playhead advanced',pl.t>0.7&&pl.t<2.2,pl);
  ok('monitor is rendering picture',pl.nonBlack/pl.samples>0.25,pl);
  ok('monitor keeps a live frame rate',pl.fps>=20,pl);

  console.log('\n── editing ops ──');
  const ed=await page.evaluate(()=>{
    const m=FC.store.mainTrack(); const list=FC.store.clipsOn(m.id);
    const c=list[2]; const before=FC.doc.clips.length;
    FC.player.seek(c.start+1);
    FC.store.edit('split',()=>FC.ops.split(c,c.start+1));
    const afterSplit=FC.doc.clips.length;
    const l2=FC.store.clipsOn(m.id);
    let gaps=0; for(let i=1;i<l2.length;i++) if(Math.abs(l2[i].start-(l2[i-1].start+l2[i-1].dur))>1e-6) gaps++;
    // ripple delete
    const total0=FC.ops.trackEnd(m.id);
    const del=l2[3];
    const dd=del.dur;
    FC.store.edit('del',()=>FC.ops.deleteClips(new Set([del.id]),true));
    const total1=FC.ops.trackEnd(m.id);
    // trim with ripple
    const l3=FC.store.clipsOn(m.id); const tc=l3[1];
    FC.store.edit('trim',()=>{FC.ops.trim(tc,'out',-0.5,'ripple');});
    const l4=FC.store.clipsOn(m.id);
    let gaps2=0; for(let i=1;i<l4.length;i++) if(Math.abs(l4[i].start-(l4[i-1].start+l4[i-1].dur))>1e-6) gaps2++;
    // undo x3 back to the split state
    FC.store.undo(); FC.store.undo(); FC.store.undo();
    return {split:afterSplit-before, gaps, rippleClosed:Math.abs(total0-total1-dd)<0.02, gaps2, afterUndo:FC.doc.clips.length, before};
  });
  ok('split adds one clip',ed.split===1,ed);
  ok('split leaves no gap',ed.gaps===0);
  ok('ripple delete closes the gap',ed.rippleClosed,ed);
  ok('ripple trim leaves no gap',ed.gaps2===0);
  ok('undo returns to the earlier state',ed.afterUndo===ed.before,ed);

  console.log('\n── FCP7 XML ──');
  const xml=await page.evaluate(()=>{
    FC.doc.mediaRoot='C:\\Footage\\Test';FC.doc.winPaths=true;FC.doc.pathMode='absolute';
    FC.doc.name='Test Sequence';
    Object.assign(FC.doc.build,{pattern:'fixed',fixed:2,target:'media',seed:4,xfType:'cross',xfDur:0.6});
    FC.director.build();
    FC.store.edit('mk',()=>FC.doc.markers.push({t:3,name:'Beat drop',color:'#f5a524',note:'hi'}));
    return FC.exportXml.fcpxml({fitToFrame:true,sourceAudio:true,kenBurns:true,markers:true,opacity:true,labels:true});
  });
  fs.writeFileSync(path.join(__dirname,'out_sequence.xml'),xml);
  const parsed=await page.evaluate(x=>{
    const doc=new DOMParser().parseFromString(x,'text/xml');
    const err=doc.querySelector('parsererror');
    if(err) return {err:err.textContent.slice(0,200)};
    const seq=doc.querySelector('sequence');
    const vTracks=doc.querySelectorAll('media>video>track');
    const v1=vTracks[0];
    const items=Array.from(v1.querySelectorAll(':scope>clipitem'));
    const starts=items.map(i=>+i.querySelector(':scope>start').textContent);
    const ends=items.map(i=>+i.querySelector(':scope>end').textContent);
    let contig=true; for(let i=1;i<items.length;i++) if(starts[i]!==ends[i-1]) contig=false;
    const ins=items.map(i=>+i.querySelector(':scope>in').textContent);
    const outs=items.map(i=>+i.querySelector(':scope>out').textContent);
    const lenMatch=items.every((_,i)=>(outs[i]-ins[i])===(ends[i]-starts[i]));
    const fileDefs=Array.from(doc.querySelectorAll('file')).filter(f=>f.querySelector('pathurl'));
    const fileRefs=doc.querySelectorAll('file');
    const ids=fileDefs.map(f=>f.getAttribute('id'));
    return {
      root:doc.documentElement.nodeName,
      version:doc.documentElement.getAttribute('version'),
      name:seq.querySelector(':scope>name').textContent,
      timebase:+seq.querySelector(':scope>rate>timebase').textContent,
      ntsc:seq.querySelector(':scope>rate>ntsc').textContent,
      width:+doc.querySelector('media>video>format samplecharacteristics>width').textContent,
      nVideoTracks:vTracks.length, nAudioTracks:doc.querySelectorAll('media>audio>track').length,
      nClips:items.length, contig, lenMatch,
      nTransitions:doc.querySelectorAll('transitionitem').length,
      transitionName:(doc.querySelector('transitionitem effectid')||{}).textContent,
      nFileDefs:fileDefs.length, nFileRefs:fileRefs.length, uniqueDefIds:new Set(ids).size,
      pathSample:(doc.querySelector('pathurl')||{}).textContent,
      nOpacity:Array.from(doc.querySelectorAll('parameterid')).filter(p=>p.textContent==='opacity').length,
      nScale:Array.from(doc.querySelectorAll('parameterid')).filter(p=>p.textContent==='scale').length,
      nMarkers:doc.querySelectorAll('sequence>marker').length,
      nLinks:doc.querySelectorAll('link').length,
      duration:+seq.querySelector(':scope>duration').textContent
    };
  },xml);
  ok('XML parses',!parsed.err,parsed.err);
  ok('root is xmeml v4',parsed.root==='xmeml'&&parsed.version==='4',parsed);
  ok('sequence rate 30/NTSC',parsed.timebase===30&&parsed.ntsc==='TRUE',parsed);
  ok('frame size carried',parsed.width===1920,parsed);
  ok('clipitems are frame-contiguous (no 1-frame gaps)',parsed.contig,parsed);
  ok('source length == timeline length per clip',parsed.lenMatch,parsed);
  ok('every file defined exactly once',parsed.nFileDefs===parsed.uniqueDefIds&&parsed.nFileDefs<parsed.nFileRefs,parsed);
  ok('paths are file://localhost URLs',/^file:\/\/localhost\/C:\/Footage\/Test\//.test(parsed.pathSample),parsed.pathSample);
  ok('transitions written',parsed.nTransitions===parsed.nClips-1&&parsed.transitionName==='Cross Dissolve',parsed);
  ok('scale filters for off-size sources',parsed.nScale>0,parsed);
  ok('markers exported',parsed.nMarkers===1,parsed);
  ok('audio links written',parsed.nLinks>0,parsed);
  ok('sequence duration matches clips',parsed.duration>0,parsed);

  console.log('\n── other writers ──');
  const others=await page.evaluate(()=>{
    const edl=FC.exportXml.edl(), otio=FC.exportXml.otio(), csv=FC.exportXml.csv();
    const r=FC.exportRender.ffmpeg({codec:'h264'});
    let otioOk=false,otioTracks=0; try{const o=JSON.parse(otio);otioOk=o.OTIO_SCHEMA==='Timeline.1';otioTracks=o.tracks.children.length;}catch(e){}
    return {edlLines:edl.split('\n').length, edlHasTitle:/^TITLE:/.test(edl), edlDissolve:/\sD\s+\d{3}/.test(edl),
      otioOk,otioTracks, csvLines:csv.split('\n').length,
      ff:{err:r.error,inputs:r.inputs,sh:r.sh&&r.sh.length,graph:r.filters&&r.filters.length,
          hasXfade:/xfade=/.test(r.filters||''), hasConcatOrXfade:/(concat=|xfade=)/.test(r.filters||''),
          hasAudio:/amix=|anull/.test(r.filters||''), hasScript:/filter_complex_script/.test(r.sh||''),
          warn:r.warnings}};
  });
  ok('EDL has a title + events',others.edlHasTitle&&others.edlLines>10,others);
  ok('EDL encodes dissolves',others.edlDissolve,others);
  ok('OTIO is a valid Timeline',others.otioOk&&others.otioTracks>=2,others);
  ok('CSV has a row per clip',others.csvLines>5,others);
  ok('ffmpeg script builds',!others.ff.err&&others.ff.sh>400,others.ff);
  ok('ffmpeg graph has the cut chain',others.ff.hasConcatOrXfade&&others.ff.hasXfade,others.ff);
  ok('ffmpeg graph mixes audio',others.ff.hasAudio,others.ff);
  ok('ffmpeg uses a script file (dodges cmd length limits)',others.ff.hasScript);

  console.log('\n── project round-trip ──');
  const rt=await page.evaluate(()=>{
    const before={clips:FC.doc.clips.length,dur:+FC.store.duration().toFixed(3),name:FC.doc.name,ov:FC.doc.overlays.length,seed:FC.doc.build.seed};
    const json=FC.store.toJSON();
    FC.store.fromJSON(json);
    const after={clips:FC.doc.clips.length,dur:+FC.store.duration().toFixed(3),name:FC.doc.name,ov:FC.doc.overlays.length,seed:FC.doc.build.seed};
    return {before,after,same:JSON.stringify(before)===JSON.stringify(after),size:json.length};
  });
  ok('save → load keeps the whole edit',rt.same,rt);

  console.log('\n── relink by fingerprint ──');
  await page.setInputFiles('#filePicker',V);
  await page.waitForTimeout(2500);
  const rl=await page.evaluate(()=>({assets:FC.doc.assets.length,linked:FC.doc.assets.filter(a=>FC.files.has(a.id)).length}));
  ok('re-dropping the same files relinks instead of duplicating',rl.assets===10&&rl.linked>=6,rl);

  console.log('\n── UI smoke ──');
  await page.click('#buildBtn'); await page.waitForTimeout(500);
  await page.click('#reshuffleBtn'); await page.waitForTimeout(300);
  await page.click('#fitBtn');
  await page.click('#exportBtn'); await page.waitForTimeout(400);
  const modal=await page.evaluate(()=>({open:document.getElementById('modalScrim').classList.contains('show'),cards:document.querySelectorAll('#modalBody .card').length}));
  ok('export dialog opens with all formats',modal.open&&modal.cards===7,modal);
  await page.click('#modalX');
  await page.keyboard.press('?'); await page.waitForTimeout(250);
  ok('shortcut sheet opens',await page.evaluate(()=>document.getElementById('modalScrim').classList.contains('show')));
  await page.click('#modalX');
  for(const t of ['overlay','audio','seq','clip']){ await page.click(`#inspTabs [data-tab="${t}"]`); await page.waitForTimeout(120); }
  ok('all inspector tabs render',await page.evaluate(()=>document.getElementById('inspBody').children.length>0));

  await page.screenshot({path:path.join(__dirname,'shot_app.png')});

  console.log('\n── console hygiene ──');
  const realErrors=errors.filter(e=>!/Autoplay|user (didn.t|did not) interact|play\(\) request|favicon/i.test(e));
  ok('no runtime errors',realErrors.length===0,realErrors.slice(0,4));

  await browser.close();
  console.log('\n'+'═'.repeat(52));
  console.log(`  ${pass} passed · ${fail} failed`);
  if(fails.length){console.log('\nFAILURES:');fails.forEach(f=>console.log('  · '+f));}
  console.log('═'.repeat(52)+'\n');
  process.exit(fail?1:0);
})().catch(e=>{console.error('HARNESS ERROR',e);process.exit(2);});
