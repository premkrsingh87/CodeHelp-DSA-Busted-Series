import { chromium } from 'playwright';
import path from 'path';
const FILE='file://'+path.resolve(process.argv[2]);
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await browser.newContext(); const page=await ctx.newPage();
page.on('pageerror',e=>console.log('  pageerror:', e.message));
await page.goto(FILE); await page.waitForTimeout(900);
// 5 profiles x 25 channels x 120 videos = 15,000 video rows + 15,000 snapshots
await page.evaluate(async()=>{
  STORE.profiles=[...Array(5)].map((_,i)=>({id:'prof'+i,name:'P'+i,color:'#6366f1',
    cfg:{...DEF_CFG, channels:[...Array(25)].map((_,c)=>'UC'+i+String(c).padStart(21,'z')), ytKey:''}}));
  STORE.active='prof0'; STORE.global.ytKey='K'; saveCfg();
  for(let p=0;p<5;p++){ const pid='prof'+p;
    const chans=[...Array(25)].map((_,c)=>({id:'UC'+p+String(c).padStart(21,'z'),title:'C'+c,
      handle:'@c'+p+'_'+c,subs:1000,totalViews:1,videoCount:200,uploads:'UU',thumb:'',country:'US',
      desc:'',keywords:'',createdAt:'',lastScraped:0,scrapedCount:0,
      pid,_k:pid+'::UC'+p+String(c).padStart(21,'z')}));
    await idbPut(STORES.channels,chans);
    const vids=[],snaps=[];
    chans.forEach((c,ci)=>{ for(let i=0;i<120;i++){ const id='p'+p+'c'+ci+'v'+i;
      vids.push({id,channelId:c.id,channelTitle:c.title,title:'Video about things '+i,
        views:1000+i*7,likes:10,comments:2,durationSec:200+i,isShort:false,
        publishedTs:Date.now()-i*36e5,thumb:'',tags:[],categoryId:'22',updatedAt:Date.now(),
        pid,_k:pid+'::'+id});
      if(i<40){ const d=new Date(Date.now()-i*864e5).toISOString().slice(0,10);
        snaps.push({key:id+'_'+d,videoId:id,channelId:c.id,date:d,views:900+i,likes:5,comments:1,
          ts:Date.now(),pid,_k:pid+'::'+id+'_'+d}); } } });
    await idbPut(STORES.videos,vids); await idbPut(STORES.snapshots,snaps);
  }
});
const runs=[];
for(let i=0;i<4;i++){
  const t=Date.now();
  await page.goto(FILE);
  // fair "ready": all four datasets in memory AND the first paint done.
  // Waiting on S.videos alone catches a sequential loader mid-flight and
  // flatters it, because videos land before snapshots do.
  await page.waitForFunction(()=>typeof S!=='undefined' && S.videos.length>0
    && S.snapshots.length>0 && (document.getElementById('content')||{}).innerHTML?.length>500,
    null,{timeout:30000});
  runs.push(Date.now()-t);
}
const loaded = await page.evaluate(()=>({v:S.videos.length,c:S.channels.length,s:S.snapshots.length}));
runs.sort((a,b)=>a-b);
console.log(`  boot (median of 4): ${runs[2]}ms   [${runs.join(', ')}]`);
console.log(`  in memory: ${loaded.v} videos, ${loaded.c} channels, ${loaded.s} snapshots (of 15,000 / 125 / 5,000 on disk)`);
const sw = await page.evaluate(async()=>{ const o=[];
  for(const p of ['prof2','prof4','prof1']){ const t=performance.now(); await switchProfile(p);
    o.push(Math.round(performance.now()-t)); } return o; });
console.log(`  profile switch: ${sw.join('ms, ')}ms`);
const r = await page.evaluate(()=>{ const o={};
  for(const v of ['dash','feed','outliers','channels','analytics','opps']){ S.view=v;
    const t=performance.now(); render(); o[v]=Math.round(performance.now()-t); } return o; });
console.log('  render: '+Object.entries(r).map(([k,v])=>`${k} ${v}ms`).join(' · '));
await browser.close();
