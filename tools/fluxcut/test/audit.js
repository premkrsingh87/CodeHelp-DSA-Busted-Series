/* Clicks every control in the main chrome and reports anything that errors or does nothing. */
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),fs=require('fs');
const MEDIA=process.argv[2]||path.join(__dirname,'stills');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--mute-audio','--autoplay-policy=no-user-gesture-required']});
  const p=await(await b.newContext({viewport:{width:1600,height:900}})).newPage();
  const errs=[];
  p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,150));});
  await p.goto('file://'+path.join(__dirname,'..','FluxCut.html'));
  await p.waitForFunction(()=>window.FC&&FC.app);
  await p.setInputFiles('#filePicker',fs.readdirSync(MEDIA).map(f=>path.join(MEDIA,f)));
  await p.waitForFunction(()=>FC.doc.assets.length===22,{timeout:60000});
  await p.evaluate(()=>{
    const a=FC.doc.assets.find(x=>x.kind==='audio');
    FC.store.edit('a',()=>{FC.doc.clips.push(FC.ops.clipFromAsset(a,{track:FC.store.audioTracks()[0].id,start:0,dur:a.duration}));});
    Object.assign(FC.doc.build,{pattern:'fixed',fixed:3,target:'media',seed:30});
    FC.director.build();FC.timeline.fit();
    FC.store.sel.set(FC.store.clipsOn(FC.store.mainTrack().id).slice(0,3).map(c=>c.id));
  });
  await p.waitForTimeout(2500);

  const SKIP=new Set(['addFilesBtn','addFolderBtn','openBtn','saveBtn','exportBtn','fsBtn','binRemoveBtn','newProject','clearIdb']);
  const ids=await p.evaluate(()=>[...document.querySelectorAll('#topbar button[id],#transport button[id],#director button[id],#tlTools button[id],#binTools button[id],#binPanel button[id],#sbHead button[id]')].map(b=>b.id).filter(Boolean));
  console.log('probing',ids.length,'chrome buttons\n');
  const bad=[];
  for(const id of ids){
    if(SKIP.has(id)) continue;
    const n=errs.length;
    const state=await p.evaluate(()=>({t:FC.player.time,clips:FC.doc.clips.length,pps:FC.timeline.view.pps,
      sig:JSON.stringify(FC.store.clipsOn(FC.store.mainTrack().id).map(c=>[c.assetId,+c.start.toFixed(2)]))}));
    try{ await p.click('#'+id,{timeout:2500}); }catch(e){ bad.push(id+' (not clickable)'); continue; }
    await p.waitForTimeout(180);
    const after=await p.evaluate(()=>({t:FC.player.time,clips:FC.doc.clips.length,pps:FC.timeline.view.pps,
      sig:JSON.stringify(FC.store.clipsOn(FC.store.mainTrack().id).map(c=>[c.assetId,+c.start.toFixed(2)])),
      modal:document.getElementById('modalScrim').classList.contains('show'),
      toast:document.querySelectorAll('.toast').length}));
    const changed = after.t!==state.t||after.clips!==state.clips||after.pps!==state.pps||after.sig!==state.sig||after.modal||after.toast>0;
    if(errs.length>n) bad.push(id+' → ERROR: '+errs[n]);
    else if(!changed) bad.push(id+' → no visible effect');
    if(after.modal) await p.click('#modalX').catch(()=>{});
    await p.evaluate(()=>{document.querySelectorAll('.toast').forEach(t=>t.remove());FC.player.pause();});
  }
  console.log(bad.length?'NEEDS A LOOK:\n  '+bad.join('\n  '):'every chrome button did something and threw nothing');

  console.log('\nprobing inspector tabs + their actions');
  const bad2=[];
  for(const tab of ['clip','overlay','audio','seq']){
    await p.click(`#inspTabs [data-tab="${tab}"]`); await p.waitForTimeout(250);
    const acts=await p.evaluate(()=>[...document.querySelectorAll('#inspBody [data-a]')].map(b=>b.dataset.a));
    for(const a of acts){
      if(/newProject|clearIdb|clearTimeline|ovDel/.test(a)) continue;
      const n=errs.length;
      await p.evaluate(a=>{const b=[...document.querySelectorAll('#inspBody [data-a]')].find(x=>x.dataset.a===a);if(b)b.click();},a);
      await p.waitForTimeout(160);
      if(errs.length>n) bad2.push(tab+'/'+a+' → '+errs[n]);
      if(await p.evaluate(()=>document.getElementById('modalScrim').classList.contains('show'))) await p.click('#modalX').catch(()=>{});
    }
    console.log('  '+tab+': '+acts.length+' actions');
  }
  console.log(bad2.length?'  ERRORS:\n   '+bad2.join('\n   '):'  all inspector actions ran clean');

  console.log('\nprobing every build pattern');
  const bad3=[];
  for(const pat of ['full','fixed','range','pattern','beat','accel','decel']){
    const n=errs.length;
    const r=await p.evaluate(pt=>{
      Object.assign(FC.doc.build,{pattern:pt,target:'media',seed:5});
      const res=FC.director.build();
      const m=FC.store.mainTrack(),l=FC.store.clipsOn(m.id);
      let gaps=0;for(let i=1;i<l.length;i++)if(Math.abs(l[i].start-(l[i-1].start+l[i-1].dur))>1e-6)gaps++;
      return {err:res.error,clips:l.length,gaps,dur:+FC.ops.trackEnd(m.id).toFixed(2)};
    },pat);
    if(errs.length>n||r.err||!r.clips||r.gaps) bad3.push(pat+' → '+JSON.stringify(r));
    else console.log('  '+pat.padEnd(8),r.clips+' clips,',r.dur+'s, 0 gaps');
  }
  if(bad3.length) console.log('  BROKEN: '+bad3.join('; '));

  console.log('\nprobing every overlay repeat mode');
  for(const mode of ['cover','interval','cuts','random']){
    const r=await p.evaluate(m=>{
      FC.doc.overlays=[];FC.doc.clips=FC.doc.clips.filter(c=>!c.gen);FC.store.bump();
      const img=FC.doc.assets.find(a=>a.kind==='image');
      FC.store.edit('o',()=>{FC.director.addOverlayRule(img.id,FC.store.videoTracks()[1].id,{mode:m,every:5,dur:2,perMinute:8});FC.director.rebuildOverlays();});
      const g=FC.doc.clips.filter(c=>c.gen);
      const seq=FC.director.mainDuration();
      return {n:g.length,inside:g.every(c=>c.start>=-1e-6&&c.start+c.dur<=seq+0.02)};
    },mode);
    console.log('  '+mode.padEnd(9),r.n+' instances, inside the edit:',r.inside);
  }

  console.log('\ntotal console errors during the whole audit:',errs.length);
  if(errs.length) console.log(errs.slice(0,8).join('\n'));
  await b.close();
})();
