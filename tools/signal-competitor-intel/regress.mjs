import { chromium } from 'playwright';
import path from 'path';
const FILE='file://'+path.resolve('competitor_intel.html');
let pass=0,fail=0; const ok=(n,c,x='')=>{c?pass++:fail++;console.log(`${c?'  ✓':'  ✗ FAIL'} ${n}${x?' — '+x:''}`)};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext(); const page=await ctx.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
// thumbnails can't reach i.ytimg.com from this sandbox; that isn't an app error
page.on('console',m=>{const t=m.text();
  if(m.type()==='error' && !/ERR_TUNNEL|ERR_NAME_NOT|ERR_INTERNET|net::/.test(t)) errors.push('console: '+t)});
page.on('requestfailed',()=>{});
await page.goto(FILE); await page.waitForTimeout(700);

// realistic dataset: 6 channels, 1200 videos, 400 snapshots, trending
console.log('\n── Seeding a realistic dataset ──');
const seedMs = await page.evaluate(async()=>{
  const t0=performance.now(); const pid=PID();
  const chans=[...Array(6)].map((_,i)=>({id:'UC'+String(i).padStart(22,'x'), title:'Channel '+i,
    handle:'@chan'+i, subs:100000*(i+1), totalViews:5e7, videoCount:400, uploads:'UU'+i,
    thumb:'', country:'US', desc:'d', keywords:'', createdAt:new Date().toISOString(),
    lastScraped:Date.now(), scrapedCount:200, pid, _k:pid+'::UC'+String(i).padStart(22,'x')}));
  await idbPut(STORES.channels, chans);
  const vids=[],snaps=[];
  for(let i=0;i<1200;i++){ const c=chans[i%6]; const id='vid'+i;
    vids.push({id, channelId:c.id, channelTitle:c.title, title:'How '+['AI','Space','Money','Cars','Food','Games'][i%6]+' really works '+i,
      desc:'x', views:Math.floor(Math.random()*900000)+1000, likes:500+i, comments:20+i,
      duration:60+(i%900), publishedTs:Date.now()-(i%300)*864e5, thumb:'', tags:['a','b'],
      categoryId:'22', isShort:(i%11===0), pid, _k:pid+'::'+id});
  }
  await idbPut(STORES.videos, vids);
  for(let i=0;i<400;i++){ const d=new Date(Date.now()-(i%30)*864e5).toISOString().slice(0,10);
    snaps.push({key:'vid'+i+'_'+d, videoId:'vid'+i, channelId:chans[i%6].id, date:d,
      views:1000*i, likes:10*i, comments:i, ts:Date.now(), pid, _k:pid+'::vid'+i+'_'+d}); }
  await idbPut(STORES.snapshots, snaps);
  await idbPut(STORES.trending, [{ts:Date.now(), pid, _k:pid+'::'+Date.now(), region:'US',
    region:'US', mode:'charts', label:'2 categories',
    videos:[...Array(40)].map((_,i)=>({id:'t'+i,title:'Taylor Swift Breaks Record '+i,channelTitle:'News '+i,
      views:99999+i,likes:100,comments:10,duration:300,publishedTs:Date.now()-864e5,thumb:'',
      categoryId:'22',rank:i+1,cat:'22',tags:[],desc:'',isShort:false}))}]);
  CFG.channels = chans.map(c=>c.id); CFG.ytKey='FAKE'; saveCfg();
  return Math.round(performance.now()-t0);
});
console.log(`  seeded in ${seedMs}ms`);
await page.reload(); await page.waitForTimeout(1200);
ok('1200 videos loaded after reload', (await page.evaluate(()=>S.videos.length))===1200);
ok('6 channels loaded', (await page.evaluate(()=>S.channels.length))===6);
ok('channel list preserved', (await page.evaluate(()=>CFG.channels.length))===6);

console.log('\n── Every view renders ──');
const views=['dash','feed','outliers','momentum','trending','opps','compare','board','channels','analytics','comments','export','settings'];
for(const v of views){
  errors.length=0;
  const t0=Date.now();
  await page.evaluate(id=>nav(id), v);
  await page.waitForTimeout(220);
  const ms=Date.now()-t0;
  const html=await page.evaluate(()=>document.getElementById('content').innerHTML.length);
  ok(`${v.padEnd(10)} renders (${String(ms).padStart(4)}ms, ${String(html).padStart(6)} chars)`, html>200 && errors.length===0, errors.slice(0,2).join('|'));
}

console.log('\n── Interactions ──');
errors.length=0;
await page.evaluate(()=>nav('feed'));
await page.evaluate(()=>{ S.range='30'; render(); }); await page.waitForTimeout(150);
ok('range switch works', (await page.evaluate(()=>document.getElementById('content').innerHTML.length))>200);
await page.evaluate(()=>{ document.querySelector('[data-sort]')?.click(); }); await page.waitForTimeout(200);
ok('table sort works', errors.length===0, errors.join('|'));
await page.evaluate(()=>{ S.filters.q='AI'; render(); }); await page.waitForTimeout(200);
ok('search filter works', errors.length===0);
await page.evaluate(()=>{ S.filters.q=''; render(); });
await page.evaluate(()=>{ document.getElementById('themeBtn').click(); }); await page.waitForTimeout(120);
ok('theme toggle works', (await page.evaluate(()=>document.documentElement.dataset.theme))==='light');
await page.evaluate(()=>{ document.getElementById('themeBtn').click(); });
await page.evaluate(()=>nav('outliers'));
await page.evaluate(()=>{ CFG.outlierThreshold=2; S.page={}; render(); }); await page.waitForTimeout(200);
ok('outlier threshold change works', errors.length===0, errors.join('|'));

console.log('\n── Profiles ──');
errors.length=0;
const pid0=await page.evaluate(()=>PID());
await page.evaluate(()=>{ const p={id:uid(),name:'Second',color:'#ec4899',cfg:{...DEF_CFG,channels:['@x']}};
  STORE.profiles.push(p); saveCfg(); });
await page.evaluate(async()=>{ const p=STORE.profiles.find(x=>x.name==='Second'); await switchProfile(p.id); });
await page.waitForTimeout(400);
ok('switching profile isolates data', (await page.evaluate(()=>S.videos.length))===0);
ok('switched profile has its own list', (await page.evaluate(()=>CFG.channels.length))===1);
await page.evaluate(pid=>switchProfile(pid), pid0); await page.waitForTimeout(500);
ok('switching back restores 1200 videos', (await page.evaluate(()=>S.videos.length))===1200);
ok('switching back restores channel list', (await page.evaluate(()=>CFG.channels.length))===6);
await page.reload(); await page.waitForTimeout(1000);
ok('active profile persists across reload', (await page.evaluate(()=>PID()))===pid0);
ok('both profiles persist', (await page.evaluate(()=>STORE.profiles.length))===2);

console.log('\n── Export / import round-trip ──');
errors.length=0;
const pack=await page.evaluate(async()=>{
  const pids=STORE.profiles.map(p=>p.id);
  const pk={_signal:'profile-pack',version:2,exportedAt:new Date().toISOString(),
    global:{theme:STORE.global.theme,density:STORE.global.density,autoSync:STORE.global.autoSync},
    profiles:STORE.profiles.filter(p=>pids.includes(p.id)),data:{}};
  for(const [l,st] of Object.entries(STORES)) pk.data[l]=(await idbAll(st)).filter(r=>pids.includes(r.pid));
  pk.data.comments=[]; return JSON.stringify(pk);
});
ok('export produces a pack', pack.length>10000, 'size='+pack.length);
await page.evaluate(async(j)=>{ await importProfilePack(JSON.parse(j)); }, pack);
await page.waitForTimeout(700);
ok('import creates new profiles', (await page.evaluate(()=>STORE.profiles.length))===4);
ok('imported profile has its videos', (await page.evaluate(()=>S.videos.length))>0, 'v='+await page.evaluate(()=>S.videos.length));
ok('import raised no errors', errors.length===0, errors.slice(0,2).join('|'));

console.log('\n── Export formats ──');
errors.length=0;
await page.evaluate(pid=>switchProfile(pid), pid0); await page.waitForTimeout(500);
for(const f of ['csv','json','md','txt']){
  const n = await page.evaluate(fmt=>{ try{ const rows=buildRows('feed');
    const s = fmt==='csv'?toCSV(rows):fmt==='json'?JSON.stringify(rows):fmt==='md'?toMD(rows,'t'):toTXT(rows,'t');
    return s.length; }catch(e){ return -1; } }, f);
  ok(`${f} export builds`, n>100, 'len='+n);
}
ok('zip writer works', await page.evaluate(()=>{ try{ return makeZip([{name:'a.txt',content:'hello'}]).size>50; }catch(e){ return false; } }));

console.log('\n── Briefings ──');
for(const b of ['ideas','summary']){
  const n=await page.evaluate(k=>{ try{ return briefing(k).length; }catch(e){ return -1; } }, b);
  ok(`briefing "${b}"`, n>50, 'len='+n);
}

console.log('\n── Depth trim & prune still work when asked ──');
errors.length=0;
const trimmed=await page.evaluate(async()=>{ CFG.scrapeDepth=50; return await trimToDepth(); });
ok('trimToDepth removes excess', trimmed>0, 'trimmed='+trimmed);
ok('trim left the newest per channel', (await page.evaluate(()=>S.videos.length))<=300);
const pr=await page.evaluate(async()=>{ CFG.channels=CFG.channels.slice(0,3); saveCfg();
  return await pruneOrphans({silent:true}); });
ok('prune removes genuinely-removed channels', pr===3, 'pruned='+pr);
ok('remaining channels intact', (await page.evaluate(()=>S.channels.length))===3);

console.log('\n── Keyboard shortcuts ──');
errors.length=0;
await page.evaluate(()=>nav('dash'));
await page.keyboard.press('2'); await page.waitForTimeout(200);
ok('number key navigates', (await page.evaluate(()=>S.view))==='feed');
await page.keyboard.press('?'); await page.waitForTimeout(200);
ok('? opens shortcuts', (await page.evaluate(()=>document.getElementById('modals').innerHTML.length))>100);
await page.keyboard.press('Escape'); await page.waitForTimeout(150);
ok('Esc closes modal', (await page.evaluate(()=>document.getElementById('modals').innerHTML.length))===0);
ok('no errors from shortcuts', errors.length===0, errors.join('|'));

console.log('\n── Storage tools ──');
errors.length=0;
await page.evaluate(()=>runStorageScan()); await page.waitForTimeout(400);
ok('storage scan modal opens', (await page.evaluate(()=>document.getElementById('modals').innerHTML.includes('Storage')))); 
await page.evaluate(()=>showBackups()); await page.waitForTimeout(300);
ok('recovery points modal opens', (await page.evaluate(()=>document.getElementById('modals').innerHTML.includes('Recovery point'))));
await page.evaluate(()=>{document.getElementById('modals').innerHTML='';});
ok('storage tools raised no errors', errors.length===0, errors.slice(0,2).join('|'));

console.log('\n── Render performance ──');
const perf=await page.evaluate(()=>{ const out={};
  for(const v of ['dash','feed','outliers','analytics','board']){
    S.view=v; const t0=performance.now(); render(); out[v]=Math.round(performance.now()-t0); }
  return out; });
Object.entries(perf).forEach(([v,ms])=>ok(`${v.padEnd(10)} renders in ${ms}ms`, ms<3000, ms+'ms'));

console.log(`\n${'═'.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'═'.repeat(46)}`);
if(errors.length) console.log('\nresidual errors:\n'+[...new Set(errors)].slice(0,8).join('\n'));
await browser.close(); process.exit(fail?1:0);
