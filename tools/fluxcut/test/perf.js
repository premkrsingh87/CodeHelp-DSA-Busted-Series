const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path');
const MEDIA=path.join(__dirname,'media');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--mute-audio']});
  const ctx=await b.newContext({viewport:{width:1366,height:768}});
  const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('ERR',e.message));
  await p.goto('file://'+path.join(__dirname,'..','FluxCut.html'));
  await p.waitForFunction(()=>window.FC&&FC.app);
  const files=['clip_a','clip_b','clip_c','clip_d','clip_e','clip_f'].map(f=>path.join(MEDIA,f+'.webm'))
    .concat(['still_1','still_2','still_3'].map(f=>path.join(MEDIA,f+'.jpg')))
    .concat([path.join(MEDIA,'music.wav')]);
  await p.setInputFiles('#filePicker',files);
  await p.waitForFunction(()=>FC.doc.assets.length===10,{timeout:20000});

  const r=await p.evaluate(async()=>{
    const t=[];const mark=(n,f)=>{const s=performance.now();const v=f();t.push([n,+(performance.now()-s).toFixed(1)]);return v;};
    Object.assign(FC.doc.build,{pattern:'range',min:0.8,max:2.5,target:'time',targetTime:1800,loopPool:true,order:'random',seed:1,xfType:'none'});
    mark('build 1800s (~1500 clips)',()=>FC.director.build());
    const m=FC.store.mainTrack();
    const n=FC.store.clipsOn(m.id).length;
    mark('reshuffle',()=>FC.director.reshuffle('order'));
    mark('transitions on every cut',()=>FC.store.edit('x',()=>FC.ops.applyTransitions(m.id,'cross',0.4,1)));
    const still=FC.doc.assets.find(a=>a.kind==='image');
    mark('overlay rule (interval 6s)',()=>FC.store.edit('o',()=>{FC.director.addOverlayRule(still.id,FC.store.videoTracks()[1].id,{mode:'interval',every:6,dur:2});FC.director.rebuildOverlays();}));
    mark('undo',()=>FC.store.undo());
    mark('redo',()=>FC.store.redo());
    const xml=mark('write FCP7 XML',()=>FC.exportXml.fcpxml({fitToFrame:true,sourceAudio:true,kenBurns:true,markers:true}));
    const ff=mark('write ffmpeg script',()=>FC.exportRender.ffmpeg({codec:'h264'}));
    mark('write OTIO',()=>FC.exportXml.otio());
    mark('project JSON',()=>FC.store.toJSON());
    // timeline paint cost across the whole edit
    FC.timeline.fit();
    const s=performance.now(); for(let i=0;i<30;i++){FC.timeline.invalidate();await new Promise(r=>requestAnimationFrame(r));}
    t.push(['30 timeline frames (fit view)',+(performance.now()-s).toFixed(1)]);
    FC.timeline.zoomTo(90); 
    const s2=performance.now(); for(let i=0;i<30;i++){FC.timeline.invalidate();await new Promise(r=>requestAnimationFrame(r));}
    t.push(['30 timeline frames (zoomed in)',+(performance.now()-s2).toFixed(1)]);
    return {t,clips:FC.doc.clips.length,v1:n,xmlKB:+(xml.length/1024).toFixed(0),ffInputs:ff.inputs,
      dur:+FC.store.duration().toFixed(1), mem:FC.media.memoryStats(),
      heap: performance.memory? +(performance.memory.usedJSHeapSize/1048576).toFixed(1):null};
  });
  console.log('clips:',r.clips,'(V1:',r.v1+')','duration:',r.dur+'s','XML:',r.xmlKB+'KB','ffmpeg inputs:',r.ffInputs);
  console.log('JS heap:',r.heap+'MB','· thumb cache:',r.mem.bitmaps,'bitmaps /',(r.mem.bitmapBytes/1048576).toFixed(1)+'MB','· object URLs:',r.mem.urls);
  console.log('\ntimings (ms):');
  r.t.forEach(([n,v])=>console.log('  '+String(v).padStart(8)+'  '+n));

  // playback smoothness on the big edit
  await p.evaluate(()=>{FC.player.seek(0);FC.player.play();});
  await p.waitForTimeout(3000);
  const pl=await p.evaluate(()=>{const s=FC.player.stats();const t=FC.player.time;FC.player.pause();return {t:+t.toFixed(2),...s};});
  console.log('\nplayback 3s on a 30-minute edit → playhead',pl.t+'s, monitor',pl.fps+'fps, decoders',pl.slots);
  await p.screenshot({path:path.join(__dirname,'shot_1366.png')});
  await b.close();
})();
