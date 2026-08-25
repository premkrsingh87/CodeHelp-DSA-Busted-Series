import { chromium } from 'playwright';
import path from 'path';
const FILE='file://'+path.resolve('competitor_intel.html');
let pass=0,fail=0; const ok=(n,c,x='')=>{c?pass++:fail++;console.log(`${c?'  ✓':'  ✗ FAIL'} ${n}${x?' — '+x:''}`)};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:1500,height:950}}); const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
page.on('console',m=>{const t=m.text(); if(m.type()==='error'&&!/net::|ERR_/.test(t))errs.push(t)});
await page.goto(FILE); await page.waitForTimeout(800);
await page.evaluate(async()=>{
  const pid=PID();
  const chans=[...Array(12)].map((_,i)=>({id:'UC'+String(i).padStart(22,'a'),title:'Channel '+i,
    handle:'@ch'+i,subs:[1400000,90000,250000,12000,3300000,45000,780000,5600,120000,900,66000,2100000][i],
    totalViews:1e7,videoCount:120,uploads:'UU',thumb:'',country:'US',desc:'',keywords:'',createdAt:'',
    lastScraped:Date.now()-i*36e5*20,scrapedCount:60,pid,_k:pid+'::UC'+String(i).padStart(22,'a')}));
  await idbPut(STORES.channels,chans);
  const vids=[];
  chans.forEach((c,ci)=>{ for(let i=0;i<60;i++){ const id='v'+ci+'_'+i;
    vids.push({id,channelId:c.id,channelTitle:c.title,title:'Video '+ci+'-'+i,
      views:(ci+1)*1000+i*50,likes:10,comments:2,durationSec:600,isShort:false,
      publishedTs:Date.now()-((i%40)+1)*864e5,thumb:'',tags:[],categoryId:'22',
      updatedAt:Date.now(),pid,_k:pid+'::'+id}); } });
  await idbPut(STORES.videos,vids);
  CFG.channels=chans.map(c=>c.id); CFG.ytKey='K'; CFG.lastSync=Date.now(); saveCfg();
});
await page.reload(); await page.waitForTimeout(1200);

console.log('\n── Thumbnail board ──');
await page.evaluate(()=>{ S.range='90'; nav('board'); }); await page.waitForTimeout(400);
ok('default size is L', (await page.evaluate(()=>S.filters.boardSize||BOARD_DEFAULT_SIZE))==='lg');
const cols = async()=>page.evaluate(()=>{
  const g=document.querySelector('.boardgrid');
  return getComputedStyle(g).gridTemplateColumns.split(' ').length; });
ok(`L renders 4 per row at 1500px (${await cols()})`, (await cols())===4);
await page.click('[data-boardsize="xl"]'); await page.waitForTimeout(300);
ok(`XL option exists and renders 3 per row (${await cols()})`, (await cols())===3);
ok('XL button is marked active', await page.evaluate(()=>document.querySelector('[data-boardsize="xl"]').classList.contains('on')));
await page.click('[data-boardsize="lg"]'); await page.waitForTimeout(250);
ok('back to 4 per row', (await cols())===4);

const sorts = await page.evaluate(()=>[...document.querySelectorAll('[data-boardsort]')].map(b=>b.textContent.trim()));
ok('four sort options present', sorts.length===4, JSON.stringify(sorts));
ok('Views / day is one of them', sorts.some(s=>/day/i.test(s)), JSON.stringify(sorts));
await page.click('[data-boardsort="vpd"]'); await page.waitForTimeout(350);
const ordered = await page.evaluate(()=>boardRows().slice(0,12).map(v=>v.vpd));
ok('views/day sort is actually descending', ordered.every((v,i)=>i===0||ordered[i-1]>=v), JSON.stringify(ordered.slice(0,5)));
ok('cards show views/day', await page.evaluate(()=>!!document.querySelector('.boardcard .vpd')));
ok('sort switch kept the toolbar (no full repaint)', await page.evaluate(()=>!!document.querySelector('[data-boardsort="vpd"]').classList.contains('on')));
await page.click('[data-boardsort="outlier"]'); await page.waitForTimeout(250);

console.log('\n── Channel picker ──');
await page.evaluate(()=>{ nav('feed'); }); await page.waitForTimeout(300);
await page.click('[data-mpick]'); await page.waitForTimeout(350);
ok('picker shows subscriber counts', await page.evaluate(()=>{
  const t=document.querySelector('.mpick-sub'); return !!t && /subs/.test(t.textContent); }),
  await page.evaluate(()=>document.querySelector('.mpick-sub')?.textContent||'none'));
ok('picker shows scrape recency', await page.evaluate(()=>
  /ago|never|just now/.test(document.querySelector('.mpick-sub')?.textContent||'')));
ok('freshness dot rendered', await page.evaluate(()=>!!document.querySelector('.freshdot')));
await page.click('[data-chpicksort="subs"]'); await page.waitForTimeout(350);
const bySubs = await page.evaluate(()=>[...document.querySelectorAll('.mpick-row .mpick-name')].map(e=>e.textContent));
const subsOrder = await page.evaluate(()=>{
  const by=S.filters.chPickSort; const l=S.channels.slice().sort((a,b)=>(b.subs||0)-(a.subs||0));
  return {by, first:l[0].title, last:l[l.length-1].title}; });
ok('sorting by subs works', bySubs[0]===subsOrder.first, `${bySubs[0]} vs ${subsOrder.first}`);
await page.click('[data-chpicksort="fresh"]'); await page.waitForTimeout(300);
ok('sorting by scraped works', await page.evaluate(()=>S.filters.chPickSort==='fresh'));
ok('picker stayed open through sorting', await page.evaluate(()=>!!document.getElementById('chPickMenu')));

console.log('\n── Text size ──');
await page.evaluate(()=>{ document.body.click(); nav('settings'); }); await page.waitForTimeout(400);
const base = await page.evaluate(()=>getComputedStyle(document.body).fontSize);
await page.click('[data-textsize="xl"]'); await page.waitForTimeout(300);
const big = await page.evaluate(()=>getComputedStyle(document.body).fontSize);
ok(`text size changes body type (${base} -> ${big})`, parseFloat(big)>parseFloat(base));
ok('choice is stored', (await page.evaluate(()=>CFG.textSize))==='xl');
await page.reload(); await page.waitForTimeout(1100);
ok('and survives a refresh', (await page.evaluate(()=>getComputedStyle(document.body).fontSize))===big);
await page.evaluate(()=>{ CFG.textSize='m'; document.documentElement.dataset.text='m'; saveCfg(); });
ok('density is a separate control', await page.evaluate(()=>{
  const before=getComputedStyle(document.documentElement).getPropertyValue('--pad');
  CFG.density='compact'; document.documentElement.dataset.density='compact';
  const after=getComputedStyle(document.documentElement).getPropertyValue('--pad');
  CFG.density='normal'; document.documentElement.dataset.density='normal';
  return before!==after; }));

console.log('\n── Tabular numerals (metric columns stop shimmering) ──');
ok('numeric cells use tabular figures', await page.evaluate(()=>{
  nav('channels'); const el=document.querySelector('.kv b')||document.querySelector('.kpi .v');
  return el? /tabular-nums/.test(getComputedStyle(el).fontVariantNumeric) : false; }));

console.log(`\n${'═'.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'═'.repeat(46)}`);
if(errs.length) console.log('errors:\n'+[...new Set(errs)].slice(0,6).join('\n'));
await b.close(); process.exit(fail?1:0);
