import { chromium } from 'playwright';
import path from 'path';
const FILE='file://'+path.resolve('competitor_intel.html');
let pass=0,fail=0; const ok=(n,c,x='')=>{c?pass++:fail++;console.log(`${c?'  ✓':'  ✗ FAIL'} ${n}${x?' — '+x:''}`)};
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext(); const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
page.on('console',m=>{const t=m.text(); if(m.type()==='error'&&!/net::|ERR_/.test(t))errs.push(t)});
await page.goto(FILE); await page.waitForTimeout(800);

const boot=async()=>{ await page.reload(); await page.waitForTimeout(1000); };

console.log('\n══ 1. YOUR SCREENSHOT: 23 listed vs 29 cached ══');
await page.evaluate(async()=>{
  const pid=PID();
  const chans=[...Array(29)].map((_,i)=>({id:'UC'+String(i).padStart(22,'a'), title:'Channel '+i,
    handle:'@chan'+i, subs:100000, totalViews:1e7, videoCount:100, uploads:'UU'+i, thumb:'',
    country:'US', desc:'', keywords:'', createdAt:new Date().toISOString(),
    lastScraped:Date.now(), scrapedCount:20, pid, _k:pid+'::UC'+String(i).padStart(22,'a')}));
  await idbPut(STORES.channels, chans);
  const vids=[];
  chans.forEach((c,ci)=>{ for(let i=0;i<20;i++){ const id='v'+ci+'_'+i;
    vids.push({id, channelId:c.id, channelTitle:c.title, title:'Vid '+ci+' '+i,
      views:1000, likes:10, comments:1, durationSec:300, isShort:false,
      publishedTs:Date.now()-i*864e5, thumb:'', tags:[], categoryId:'22',
      updatedAt:Date.now(), pid, _k:pid+'::'+id}); } });
  await idbPut(STORES.videos, vids);
  CFG.channels = chans.map(c=>c.id); CFG.ytKey='K'; saveCfg();
});
await boot();
let st = await page.evaluate(()=>({listed:CFG.channels.length, tracked:S.channels.length,
  vids:S.videos.length, picker:selCount()}));
ok('baseline 29/29 coherent', st.listed===29&&st.tracked===29&&st.vids===580&&st.picker===29, JSON.stringify(st));

// remove 6 from the list — exactly your case
await page.evaluate(()=>{ CFG.channels = CFG.channels.slice(0,23); refilterChannels(); saveCfg(); render(); });
await page.waitForTimeout(300);
st = await page.evaluate(()=>({listed:CFG.channels.length, tracked:S.channels.length,
  vids:S.videos.length, picker:selCount(), stale:S.staleChannels.length,
  onDisk:S.allVideos.length}));
ok('tracked follows the list (29 -> 23)', st.tracked===23, JSON.stringify(st));
ok('picker follows the list', st.picker===23, JSON.stringify(st));
ok('delisted videos excluded from metrics', st.vids===460, JSON.stringify(st));
ok('nothing deleted from disk', st.onDisk===580, JSON.stringify(st));
ok('the 6 are reported, not hidden', st.stale===6, JSON.stringify(st));

const kpi = await page.evaluate(()=>{ nav('dash');
  const m=document.getElementById('content').innerHTML.match(/<div class="v">([\d,]+)<\/div><div class="k">Channels tracked/);
  return m? m[1] : 'none'; });
ok('dashboard tile reads 23, not 29', kpi==='23', 'tile='+kpi);

const totals = await page.evaluate(()=>{ S.range='all';
  const v=enrichedInRange(); return {n:v.length, views:v.reduce((a,x)=>a+x.views,0)}; });
ok('combined views exclude delisted channels', totals.views===460000, JSON.stringify(totals));

// survives a refresh
await boot();
st = await page.evaluate(()=>({tracked:S.channels.length, vids:S.videos.length, stale:S.staleChannels.length}));
ok('still coherent after refresh', st.tracked===23&&st.vids===460&&st.stale===6, JSON.stringify(st));

// putting one back is a pure recompute, no data lost
await page.evaluate(()=>{ CFG.channels=[...CFG.channels,'UC'+String(23).padStart(22,'a')];
  refilterChannels(); saveCfg(); });
st = await page.evaluate(()=>({tracked:S.channels.length, vids:S.videos.length}));
ok('re-adding a channel restores its videos', st.tracked===24&&st.vids===480, JSON.stringify(st));

console.log('\n══ 2. Stale derived-cache bugs ══');
await page.evaluate(()=>{ CFG.channels=CFG.channels.slice(0,23); refilterChannels(); saveCfg(); });
const before = await page.evaluate(()=>{ S.range='all';
  const v=enrichedInRange().find(x=>x.id==='v0_0'); return {views:v.views, out:v.outlier}; });
// refresh view counts WITHOUT changing how many videos exist — the length-key blind spot
await page.evaluate(async()=>{
  const pid=PID();
  const ch0 = S.allVideos.find(v=>v.id==='v0_0').channelId;
  const rows=(await idbByPid(STORES.videos,pid)).filter(v=>v.channelId===ch0);
  rows.forEach(v=>{ v.views = v.id==='v0_0'? 500000 : 1000; v.updatedAt=Date.now(); });
  await idbPut(STORES.videos, rows);
  await loadAll();
});
const after = await page.evaluate(()=>{ S.range='all';
  const v=enrichedInRange().find(x=>x.id==='v0_0'); return {views:v.views, out:v.outlier}; });
ok('refreshed views are picked up', after.views===500000, JSON.stringify({before,after}));
ok('outlier recomputed from new figures', after.out>100, JSON.stringify({before,after}));

// the exact collision: delete one, add one -> identical length
const collide = await page.evaluate(async()=>{
  S.range='all';
  const medBefore = median(enrichedInRange().map(v=>v.views));
  const pid=PID();
  await idbDelete(STORES.videos, [pid+'::v1_0']);
  const ch0b = S.allVideos.find(v=>v.id==='v0_1').channelId;
  await idbPut(STORES.videos, [{id:'vNEW', channelId:ch0b, channelTitle:'Channel 0',
    title:'New one', views:9000000, likes:1, comments:1, durationSec:300, isShort:false,
    publishedTs:Date.now(), thumb:'', tags:[], categoryId:'22', updatedAt:Date.now(),
    pid, _k:pid+'::vNEW'}]);
  await loadAll();
  const v=enrichedInRange();
  return {len:v.length, medBefore, medAfter:median(v.map(x=>x.views)),
    hasNew:v.some(x=>x.id==='vNEW'), hasOld:v.some(x=>x.id==='v1_0')};
});
ok('same-length swap is detected', collide.hasNew && !collide.hasOld, JSON.stringify(collide));

console.log('\n══ 3. Cross-profile sync corruption ══');
await page.evaluate(()=>{ localStorage.clear(); });
await page.evaluate(async()=>{ for(const st of Object.values(STORES)) await idbClear(st); });
await boot();
const ids = await page.evaluate(()=>{
  const A=activeProfile(); A.name='Alpha'; A.cfg.channels=['@a1','@a2']; A.cfg.ytKey='K';
  const B={id:uid(), name:'Beta', color:'#ec4899', cfg:{...DEF_CFG, channels:['@b1']}};
  STORE.profiles.push(B); STORE.global.ytKey='K'; saveCfg();
  return {a:A.id, b:B.id};
});
// stub the three network boundaries, with a gate so we can switch mid-sync
await page.evaluate(()=>{
  window.__gate = new Promise(r=>{ window.__open = r; });
  window.resolveChannels = async lines => lines.map((l,i)=>({id:'UC'+l.replace('@','')+'x'.repeat(20),
    title:'Ch '+l, handle:l, subs:1000, totalViews:1, videoCount:5, uploads:'UU', thumb:'',
    country:'US', desc:'', keywords:'', createdAt:new Date().toISOString(), lastScraped:0, scrapedCount:0}));
  window.fetchUploadIds = async ch => [ch.id+'_v1', ch.id+'_v2'];
  window.fetchVideos = async (idlist, chId) => { await window.__gate;
    return idlist.map(id=>({id, channelId:chId, channelTitle:'Ch', title:'T '+id, desc:'',
      publishedAt:new Date().toISOString(), publishedTs:Date.now(), thumb:'', thumbHi:'', tags:[],
      categoryId:'22', lang:'', views:100, likes:1, comments:1, durationSec:300, isShort:false,
      definition:'hd', caption:false, licensed:false, madeForKids:false, license:'',
      topics:[], isLive:false, updatedAt:Date.now()})); };
});
await page.evaluate(()=>{ window.__sync = syncAll(); });   // starts on Alpha, blocks in fetchVideos
await page.waitForTimeout(300);
await page.evaluate(pid=>switchProfile(pid), ids.b);       // switch to Beta mid-sync
await page.waitForTimeout(300);
await page.evaluate(()=>window.__open());                  // let the sync finish
await page.evaluate(()=>window.__sync);
await page.waitForTimeout(800);
const split = await page.evaluate(async(x)=>{
  const av=await idbByPid(STORES.videos,x.a), bv=await idbByPid(STORES.videos,x.b);
  const ac=await idbByPid(STORES.channels,x.a), bc=await idbByPid(STORES.channels,x.b);
  return {aV:av.length, bV:bv.length, aC:ac.length, bC:bc.length,
    strayPid: av.concat(ac).some(r=>r.pid!==x.a) || bv.concat(bc).some(r=>r.pid!==x.b),
    beta:{tracked:S.channels.length, vids:S.videos.length}};
}, ids);
ok('Alpha kept all its synced rows', split.aV===4 && split.aC===2, JSON.stringify(split));
ok('nothing leaked into Beta', split.bV===0 && split.bC===0, JSON.stringify(split));
ok('no row carries the wrong profile id', split.strayPid===false, JSON.stringify(split));
ok('Beta on screen shows Beta data (empty)', split.beta.vids===0, JSON.stringify(split));
await page.evaluate(pid=>switchProfile(pid), ids.a); await page.waitForTimeout(500);
ok('switching back to Alpha shows its 4 videos', (await page.evaluate(()=>S.videos.length))===4);

console.log('\n══ 4. Two profiles syncing at once ══');
await page.evaluate(()=>{ window.__gate=Promise.resolve(); });
const conc = await page.evaluate(async(x)=>{
  await switchProfile(x.a); const p1 = syncAll();
  await switchProfile(x.b); const p2 = syncAll();
  await Promise.all([p1,p2]);
  const av=await idbByPid(STORES.videos,x.a), bv=await idbByPid(STORES.videos,x.b);
  return {a:av.length, b:bv.length,
    aClean:av.every(r=>r.pid===x.a), bClean:bv.every(r=>r.pid===x.b)};
}, ids);
ok('both profiles synced independently', conc.a===4 && conc.b===2, JSON.stringify(conc));
ok('neither profile contaminated the other', conc.aClean && conc.bClean, JSON.stringify(conc));

console.log('\n══ 5. Load speed with 5 profiles ══');
await page.evaluate(async()=>{
  for(const st of Object.values(STORES)) await idbClear(st);
  STORE.profiles = [...Array(5)].map((_,i)=>({id:'prof'+i, name:'P'+i, color:'#6366f1',
    cfg:{...DEF_CFG, channels:[...Array(25)].map((_,c)=>'UC'+i+String(c).padStart(21,'z'))}}));
  STORE.active='prof0'; saveCfg();
  for(let p=0;p<5;p++){
    const pid='prof'+p;
    const chans=[...Array(25)].map((_,c)=>({id:'UC'+p+String(c).padStart(21,'z'), title:'C'+c,
      handle:'@c'+c, subs:1000, totalViews:1, videoCount:80, uploads:'UU', thumb:'', country:'US',
      desc:'', keywords:'', createdAt:'', lastScraped:0, scrapedCount:0,
      pid, _k:pid+'::UC'+p+String(c).padStart(21,'z')}));
    await idbPut(STORES.channels, chans);
    const vids=[];
    chans.forEach((c,ci)=>{ for(let i=0;i<80;i++){ const id='p'+p+'c'+ci+'v'+i;
      vids.push({id, channelId:c.id, channelTitle:c.title, title:'V '+i, views:1000+i, likes:1,
        comments:1, durationSec:300, isShort:false, publishedTs:Date.now()-i*36e5, thumb:'',
        tags:[], categoryId:'22', updatedAt:Date.now(), pid, _k:pid+'::'+id}); } });
    await idbPut(STORES.videos, vids);
  }
});
const t0=Date.now(); await boot(); const bootMs=Date.now()-t0;
const loaded = await page.evaluate(()=>({v:S.videos.length, c:S.channels.length, total:5*2000}));
ok('loads only this profile (2,000 of 10,000 rows)', loaded.v===2000&&loaded.c===25, JSON.stringify(loaded));
ok(`boot with 10,000 rows on disk: ${bootMs}ms`, bootMs<4000, bootMs+'ms');
const swMs = await page.evaluate(async()=>{ const t=performance.now();
  await switchProfile('prof3'); return Math.round(performance.now()-t); });
ok(`profile switch: ${swMs}ms`, swMs<1200, swMs+'ms');
ok('switched profile has its own 2,000', (await page.evaluate(()=>S.videos.length))===2000);
const renderMs = await page.evaluate(()=>{ const o={};
  for(const v of ['dash','feed','outliers','channels','analytics']){ S.view=v;
    const t=performance.now(); render(); o[v]=Math.round(performance.now()-t); } return o; });
Object.entries(renderMs).forEach(([v,ms])=>ok(`${v.padEnd(10)} ${ms}ms`, ms<1500, ms+'ms'));

console.log(`\n${'═'.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'═'.repeat(46)}`);
if(errs.length) console.log('errors:\n'+[...new Set(errs)].slice(0,6).join('\n'));
await browser.close(); process.exit(fail?1:0);
