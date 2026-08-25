import { chromium } from 'playwright';
import path from 'path';
const FILE='file://'+path.resolve('competitor_intel.html');
let pass=0,fail=0; const ok=(n,c,x='')=>{c?pass++:fail++;console.log(`${c?'  ✓':'  ✗ FAIL'} ${n}${x?' — '+x:''}`)};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
const errs=[]; const watch=p=>{p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{const t=m.text(); if(m.type()==='error'&&!/net::|ERR_/.test(t))errs.push(t)})};

const A=await ctx.newPage(); watch(A);
await A.goto(FILE); await A.waitForTimeout(800);

console.log('\n── Exact reported scenario: "0 channels · 30 videos" after refresh ──');
await A.evaluate(async()=>{
  const pid=PID();
  CFG.channels=['@mrbeast','@veritasium','@kurzgesagt']; CFG.ytKey='K'; saveCfg();
  const chans=['UCX6OQ3DkcsbYNE6H8uQQuVA','UCHnyfMqiRRG1u-2MsSQLbXA','UCsXVk37bltHxD1rDPwtNM8Q']
    .map((id,i)=>({id,title:['MrBeast','Veritasium','Kurzgesagt'][i],handle:['@mrbeast','@veritasium','@kurzgesagt'][i],
      subs:1e6,totalViews:1e8,videoCount:100,uploads:'UU',thumb:'',country:'US',desc:'',keywords:'',
      createdAt:new Date().toISOString(),lastScraped:Date.now(),scrapedCount:10,pid,_k:pid+'::'+id}));
  await idbPut(STORES.channels,chans);
  await idbPut(STORES.videos,[...Array(30)].map((_,i)=>({id:'v'+i,channelId:chans[i%3].id,
    channelTitle:chans[i%3].title,title:'Video '+i,views:1000*i,likes:i,comments:i,duration:300,
    publishedTs:Date.now()-i*864e5,thumb:'',tags:[],categoryId:'22',isShort:false,pid,_k:pid+'::v'+i})));
});
await A.reload(); await A.waitForTimeout(900);
const good=await A.evaluate(()=>({ch:CFG.channels.length,v:S.videos.length}));
ok('baseline: 3 channels, 30 videos', good.ch===3&&good.v===30, JSON.stringify(good));

// the failure mode: settings blob gone, IndexedDB untouched
await A.evaluate(()=>localStorage.clear());
await A.reload(); await A.waitForTimeout(1200);
const chip=await A.evaluate(()=>document.querySelector('.profmeta')?.textContent||'');
const rec=await A.evaluate(()=>({ch:CFG.channels.length,v:S.videos.length,c:S.channels.length}));
ok('profile chip no longer says "0 channels"', !/^0 channels/.test(chip.trim()), 'chip="'+chip.trim()+'"');
ok('channel list recovered', rec.ch===3, JSON.stringify(rec));
ok('all 30 videos still reachable', rec.v===30, JSON.stringify(rec));

console.log('\n── Same, but only the primary key is corrupted ──');
await A.evaluate(()=>localStorage.setItem('signal_store_v2','{"profiles":[' ));  // truncated JSON
await A.reload(); await A.waitForTimeout(1000);
ok('falls back to the backup slot', (await A.evaluate(()=>CFG.channels.length))===3);
ok('data still reachable', (await A.evaluate(()=>S.videos.length))===30);

console.log('\n── Both localStorage slots corrupted, IndexedDB mirror intact ──');
await A.evaluate(()=>{ localStorage.setItem('signal_store_v2','garbage');
  localStorage.setItem('signal_store_v2_bak','also garbage'); });
await A.reload(); await A.waitForTimeout(1100);
ok('recovers from the IndexedDB mirror', (await A.evaluate(()=>CFG.channels.length))===3,
   'got '+await A.evaluate(()=>JSON.stringify(CFG.channels)));
ok('data still reachable', (await A.evaluate(()=>S.videos.length))===30);

console.log('\n── Two tabs open at once ──');
const B=await ctx.newPage(); watch(B);
await B.goto(FILE); await B.waitForTimeout(900);
ok('second tab sees the same data', (await B.evaluate(()=>S.videos.length))===30);
await B.evaluate(()=>{ CFG.channels=[...CFG.channels,'@newFromTabB']; saveCfg(); });
await B.waitForTimeout(1000);
await A.waitForTimeout(1200);
ok('tab A picks up tab B\'s edit', (await A.evaluate(()=>CFG.channels.length))===4,
   'A='+await A.evaluate(()=>CFG.channels.length));
await A.evaluate(()=>{ CFG.channels=[...CFG.channels,'@newFromTabA']; saveCfg(); });
await A.waitForTimeout(1200);
ok('neither edit was lost', (await A.evaluate(()=>CFG.channels.length))===5);
await B.waitForTimeout(1200);
ok('tab B converges too', (await B.evaluate(()=>CFG.channels.length))===5,
   'B='+await B.evaluate(()=>CFG.channels.length));
await B.close();

console.log('\n── Rapid typing then instant close (no Save, no blur) ──');
await A.evaluate(()=>nav('settings')); await A.waitForTimeout(400);
await A.focus('#setChannels');
await A.evaluate(()=>{document.getElementById('setChannels').value='';});
await A.type('#setChannels','@rapid1\n@rapid2\n@rapid3', {delay:15});
await A.waitForTimeout(800);
await A.reload(); await A.waitForTimeout(900);
ok('typed-then-refreshed text survived', (await A.evaluate(()=>CFG.channels.length))===3,
   JSON.stringify(await A.evaluate(()=>CFG.channels)));

console.log('\n── Sync repainting mid-edit ──');
await A.evaluate(()=>nav('settings')); await A.waitForTimeout(300);
await A.focus('#setChannels');
await A.evaluate(()=>{ const el=document.getElementById('setChannels');
  el.value='@half-typed-entry'; el.setSelectionRange(6,6);
  // simulate what a background sync completing does to the DOM
  render(); render(); renderProfBar(); });
await A.waitForTimeout(200);
const mid=await A.evaluate(()=>{const el=document.getElementById('setChannels');
  return {v:el.value,f:document.activeElement===el,c:el.selectionStart};});
ok('half-typed entry survived 2 repaints', mid.v==='@half-typed-entry', JSON.stringify(mid));
ok('still focused with caret intact', mid.f&&mid.c===6, JSON.stringify(mid));

console.log('\n── Wipe is still deliberate and still works ──');
await A.evaluate(()=>{ window.confirm=()=>true; });
await A.evaluate(()=>wipe()); await A.waitForTimeout(700);
ok('explicit wipe clears cached rows', (await A.evaluate(()=>S.videos.length))===0);
ok('but keeps settings + channel list', (await A.evaluate(()=>CFG.channels.length))>0);

console.log(`\n${'═'.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'═'.repeat(46)}`);
if(errs.length) console.log('errors:\n'+[...new Set(errs)].slice(0,6).join('\n'));
await browser.close(); process.exit(fail?1:0);
