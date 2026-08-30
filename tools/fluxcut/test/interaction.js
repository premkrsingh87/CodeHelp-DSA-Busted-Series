const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const path=require('path'),fs=require('fs');
const MEDIA=process.argv[2]||path.join(__dirname,'stills');
let pass=0,fail=0;const F=[];
const ok=(n,c,x)=>{c?(pass++,console.log('  ✓ '+n)):(fail++,F.push(n),console.log('  ✗ '+n+(x?'  '+JSON.stringify(x):'')));};
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--mute-audio']});
  const ctx=await b.newContext({viewport:{width:1600,height:900}});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,140));});
  await p.goto('file://'+path.join(__dirname,'..','FluxCut.html'));
  await p.waitForFunction(()=>window.FC&&FC.app);
  await p.setInputFiles('#filePicker',fs.readdirSync(MEDIA).map(f=>path.join(MEDIA,f)));
  await p.waitForFunction(()=>FC.doc.assets.length===22,{timeout:60000});
  await p.evaluate(()=>{
    const a=FC.doc.assets.find(x=>x.kind==='audio');
    FC.store.edit('a',()=>{FC.doc.clips.push(FC.ops.clipFromAsset(a,{track:FC.store.audioTracks()[0].id,start:0,dur:a.duration}));});
    Object.assign(FC.doc.build,{pattern:'fixed',fixed:3,target:'media',order:'random',seed:30});
    FC.director.build(); FC.timeline.fit();
  });
  await p.waitForTimeout(2200);

  console.log('\n── storyboard ──');
  await p.click('#sbToggle'); await p.waitForTimeout(500);
  const vis=await p.evaluate(()=>({shown:document.getElementById('storyboard').style.display!=='none',
    cards:document.querySelectorAll('.sbc').length, clips:FC.store.clipsOn(FC.store.mainTrack().id).length,
    tlH:document.getElementById('tlCanvas').getBoundingClientRect().height}));
  ok('strip opens with cards',vis.shown&&vis.cards>4,vis);
  ok('timeline keeps room below it',vis.tlH>150,vis);

  const before=await p.evaluate(()=>FC.store.clipsOn(FC.store.mainTrack().id).map(c=>c.assetId));
  // drag card #1 to slot 5
  const boxes=await p.evaluate(()=>{
    const n=[...document.querySelectorAll('.sbc')].slice(0,6).map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+22,id:e.dataset.id};});
    return n;
  });
  await p.mouse.move(boxes[0].x,boxes[0].y);
  await p.mouse.down();
  for(let i=1;i<=12;i++) await p.mouse.move(boxes[0].x+(boxes[4].x-boxes[0].x)*i/12,boxes[0].y);
  const caret=await p.evaluate(()=>{const c=document.getElementById('sbCaret');return c&&c.style.display!=='none';});
  await p.mouse.up(); await p.waitForTimeout(400);
  const after=await p.evaluate(()=>FC.store.clipsOn(FC.store.mainTrack().id).map(c=>c.assetId));
  ok('insertion caret shows while dragging',caret);
  ok('card drag reorders the clip',before[0]!==after[0]&&after.indexOf(before[0])>=3,{was:before.slice(0,6).map(x=>x.slice(-4)),now:after.slice(0,6).map(x=>x.slice(-4))});
  const gaps=await p.evaluate(()=>{const l=FC.store.clipsOn(FC.store.mainTrack().id);let g=0;
    for(let i=1;i<l.length;i++) if(Math.abs(l[i].start-(l[i-1].start+l[i-1].dur))>1e-6)g++;return g;});
  ok('no gaps after the reorder',gaps===0,{gaps});

  // duration edit in a card
  const durOk=await p.evaluate(async()=>{
    const first=[...document.querySelectorAll('.sbc')].find(e=>e.querySelector('.sbc-idx').textContent==='1');
    const inp=first.querySelector('.sbc-dur');
    inp.value='1.5'; inp.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    const c=FC.store.clipsOn(FC.store.mainTrack().id)[0];
    let g=0;const l=FC.store.clipsOn(FC.store.mainTrack().id);
    for(let i=1;i<l.length;i++) if(Math.abs(l[i].start-(l[i-1].start+l[i-1].dur))>1e-6)g++;
    return {dur:+c.dur.toFixed(2),gaps:g};
  });
  ok('typing a length in a card retimes the edit',Math.abs(durOk.dur-1.5)<0.05&&durOk.gaps===0,durOk);

  const undone=await p.evaluate(()=>{FC.store.undo();return +FC.store.clipsOn(FC.store.mainTrack().id)[0].dur.toFixed(2);});
  ok('card edits are undoable',Math.abs(undone-3)<0.05,{undone});

  console.log('\n── drag modes on the timeline ──');
  const swap=await p.evaluate(()=>{
    FC.timeline.view.dragMode='swap';
    const m=FC.store.mainTrack(),l=FC.store.clipsOn(m.id);
    const a=l[1],c=l[5];const aId=a.assetId,cId=c.assetId,aStart=a.start,cStart=c.start;
    FC.store.edit('t',()=>FC.ops.swap(a,c));
    const l2=FC.store.clipsOn(m.id);
    return {ok:l2[1].assetId===cId&&l2[5].assetId===aId, keptGeometry:Math.abs(l2[1].start-aStart)<1e-6&&Math.abs(l2[5].start-cStart)<1e-6};
  });
  ok('swap trades two clips',swap.ok,swap);
  ok('swap keeps the slot positions',swap.keptGeometry,swap);

  const roll=await p.evaluate(()=>{
    const m=FC.store.mainTrack(),l=FC.store.clipsOn(m.id);
    const total0=FC.ops.trackEnd(m.id);
    const A=l[2],B=l[3];const aD=A.dur,bD=B.dur;
    FC.store.edit('r',()=>FC.ops.roll(A,B,0.5));
    return {total:Math.abs(FC.ops.trackEnd(m.id)-total0)<1e-6, a:+(A.dur-aD).toFixed(3), b:+(B.dur-bD).toFixed(3)};
  });
  ok('roll keeps total length identical',roll.total,roll);
  ok('roll moves frames between neighbours',Math.abs(roll.a+roll.b)<1e-6&&roll.a>0,roll);

  console.log('\n── overlay end to end ──');
  const ovr=await p.evaluate(async()=>{
    FC.inspector.show('overlay');
    await new Promise(r=>setTimeout(r,150));
    const srcSel=document.querySelector('#inspBody [data-k="newOvSource"]');
    const opts=srcSel?srcSel.options.length:0;
    document.querySelector('#inspBody [data-a="addOverlay"]').click();
    await new Promise(r=>setTimeout(r,250));
    const r2=FC.doc.overlays[0];
    const gen=FC.doc.clips.filter(c=>c.ruleId===r2.id);
    // does it actually composite?
    FC.player.seek(gen[1]?gen[1].start+0.3:0.3);
    await new Promise(r=>setTimeout(r,900));
    FC.player.draw();
    const cv=document.getElementById('monitor'),g=cv.getContext('2d');
    const d=g.getImageData(0,0,cv.width,cv.height).data;
    let lit=0;for(let i=0;i<d.length;i+=4*61) if(d[i]+d[i+1]+d[i+2]>40) lit++;
    return {opts,rules:FC.doc.overlays.length,gen:gen.length,lit,samples:Math.ceil(d.length/(4*61)),
            xml:FC.exportXml.fcpxml({fitToFrame:true}).match(/<parameterid>opacity<\/parameterid>/g||[])};
  });
  ok('source dropdown is populated',ovr.opts>=21,{opts:ovr.opts});
  ok('rule creates instances across the edit',ovr.rules===1&&ovr.gen>=4,ovr);
  ok('overlay actually composites in the monitor',ovr.lit/ovr.samples>0.3,{lit:ovr.lit,of:ovr.samples});
  ok('overlay opacity reaches the XML',ovr.xml&&ovr.xml.length>=4,{n:ovr.xml&&ovr.xml.length});

  await p.screenshot({path:path.join(__dirname,'out_interaction.png')});
  console.log('\n── errors ──'); console.log(' ',errs.length?errs.slice(0,5):'none');
  ok('no console errors',errs.length===0,errs.slice(0,3));
  await b.close();
  console.log('\n'+(fail?'FAILED: '+F.join(', '):'all '+pass+' storyboard/mode checks passed')+'\n');
  process.exit(fail?1:0);
})();
