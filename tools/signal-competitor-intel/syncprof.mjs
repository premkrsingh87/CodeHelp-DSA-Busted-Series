import { chromium } from 'playwright';
import path from 'path';
const FILE='file://'+path.resolve(process.argv[2]||'competitor_intel.html');
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const page=await (await b.newContext()).newPage();
page.on('pageerror',e=>console.log('  ERR',e.message));
await page.goto(FILE); await page.waitForTimeout(700);
const out = await page.evaluate(async()=>{
  const N_CH=34,N_VID=250;
  window.__drift = 0;   // fraction of videos whose stats move between syncs
  window.resolveChannels = async lines => lines.map((l,i)=>({id:'UC'+String(i).padStart(22,'a'),
    title:'Channel '+i, handle:'@ch'+i, subs:50000, totalViews:1e7, videoCount:N_VID, uploads:'UU',
    thumb:'', country:'US', desc:'', keywords:'', createdAt:'', lastScraped:0, scrapedCount:0}));
  window.fetchUploadIds = async ch => [...Array(N_VID)].map((_,i)=>ch.id+'_v'+i);
  let seed=1; const rnd=()=>{ seed=(seed*1103515245+12345)&0x7fffffff; return seed/0x7fffffff; };
  window.fetchVideos = async (idlist, chId) => idlist.map(id=>{
    const n = [...id].reduce((a,c)=>a+c.charCodeAt(0),0);
    const moved = (n % 100) < window.__drift*100;
    return {id, channelId:chId, channelTitle:'Ch',
      title:'A realistic sleep history video title '+id, desc:'x'.repeat(600),
      publishedAt:'', publishedTs:Date.now()-(n%150)*864e5, thumb:'', thumbHi:'',
      tags:['a','b','c'], categoryId:'22', lang:'en',
      views: 1000 + n*37 + (moved? window.__gen*1000 : 0),
      likes:50, comments:5, durationSec:900, isShort:false, definition:'hd', caption:false,
      licensed:false, madeForKids:false, license:'', topics:[], isLive:false, updatedAt:Date.now()};
  });
  CFG.channels=[...Array(N_CH)].map((_,i)=>'@ch'+i); CFG.ytKey='K'; CFG.scrapeDepth=N_VID; saveCfg();
  const r={};
  window.__gen=1; let t=performance.now(); await syncAll({deep:true}); r['1. first sync (all new)']=Math.round(performance.now()-t);
  window.__gen=1; window.__drift=0;    t=performance.now(); await syncAll(); r['2. re-sync, nothing changed']=Math.round(performance.now()-t);
  window.__gen=2; window.__drift=0.10; t=performance.now(); await syncAll(); r['3. daily sync, 10% moved']=Math.round(performance.now()-t);
  window.__gen=3; window.__drift=1.0;  t=performance.now(); await syncAll(); r['4. everything moved']=Math.round(performance.now()-t);
  r['videos stored']=S.videos.length;
  const est=await navigator.storage.estimate(); r['disk used']=(est.usage/1048576).toFixed(1)+'MB';
  return r;
});
console.log(`  ${process.argv[3]||'build'}`);
for(const [k,v] of Object.entries(out)) console.log(`    ${k.padEnd(30)} ${typeof v==='number'?v+'ms':v}`);
await b.close();
