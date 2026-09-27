// Runs inside the page: seeds a realistic profile into localStorage + IndexedDB.
async function seedSignal(opts={}){
  const pid = 'pTestNiche1';
  const now = Date.now(), D = 864e5;
  let seed = 7; const rnd = ()=>{ seed = (seed*16807)%2147483647; return (seed-1)/2147483646; };
  const names = ['Nightfall Stories','True Crime Daily','Celebrity Files Uncovered','Midnight Archive','The Documentary Lab','Fame & Fortune Weekly'];
  const hues = [210,340,28,265,150,48];
  const svg = (h, t, w=320, hh=180) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hh}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},70%,45%)"/><stop offset="1" stop-color="hsl(${(h+50)%360},75%,22%)"/></linearGradient></defs><rect width="${w}" height="${hh}" fill="url(#g)"/><circle cx="${w*.78}" cy="${hh*.42}" r="${hh*.3}" fill="hsla(${h},80%,80%,.35)"/><text x="16" y="${hh-22}" font-family="Arial" font-weight="900" font-size="30" fill="#fff">${t}</text></svg>`);
  const chans = names.map((n,i)=>{
    const id = 'UC' + ('Qx7'+i+'abcdefghijklmnopqrstu').slice(0,22);
    return { id, title:n, handle:'@'+n.toLowerCase().replace(/[^a-z]/g,''), desc:'', country:'US',
      createdAt:new Date(now-(500+i*170)*D).toISOString(), thumb:svg(hues[i], n.split(' ').map(w=>w[0]).join(''), 88, 88),
      uploads:'UU'+i, subs:[120000,850000,43000,2100000,9800,330000][i], totalViews:[4e7,2.1e8,9e6,6.3e8,1.2e6,7.7e7][i],
      videoCount:[310,520,140,890,60,260][i], keywords:'', lastScraped:now-[0.2,1,3,0.5,9,2][i]*D, scrapedCount:100,
      pid, _k:pid+'::'+id };
  });
  const ents = ['Diddy','Wendy Williams','Michael Jackson','Britney Spears','Elon Musk','Taylor Swift','The Menendez Brothers','Oprah','Kanye West','Marilyn Monroe'];
  const tpl = [e=>`The Dark Truth About ${e} Nobody Talks About`, e=>`What Really Happened to ${e}`, e=>`${e}: The Untold Story (Full Documentary)`,
    e=>`Why ${e} Disappeared From Hollywood`, e=>`10 Secrets ${e} Tried To Hide`, e=>`The Rise and Fall of ${e}`, e=>`${e} vs The Media — Who Actually Won?`,
    e=>`Inside the Strange World of ${e}`, e=>`${e} Finally Breaks Silence!`, e=>`The Real Reason ${e} Quit`];
  const videos=[], snaps=[];
  const today = new Date();
  const dk = d => d.toLocaleDateString('en-CA',{timeZone:'America/Los_Angeles'});
  chans.forEach((c,ci)=>{
    for(let j=0;j<110;j++){
      const age = j<6? rnd()*6 : j*1.9 + rnd()*2;
      const ts = now - age*D - rnd()*6*36e5;
      const e = ents[Math.floor(rnd()*ents.length)];
      const title = tpl[Math.floor(rnd()*tpl.length)](e);
      const base = c.subs*0.15;
      const mult = Math.exp((rnd()-0.5)*2.4) * (rnd()<0.06? 6 : 1);
      const views = Math.max(120, Math.round(base*mult*Math.min(1, (age+0.5)/10)));
      const isShort = rnd()<0.12;
      const id = ('v'+ci+'_'+j+'xxxxxxxxxxx').slice(0,11);
      const v = { id, channelId:c.id, channelTitle:c.title, title, desc:'A documentary about '+e,
        publishedAt:new Date(ts).toISOString(), publishedTs:ts,
        thumb:svg((hues[ci]+j*23)%360, e.split(' ').pop().toUpperCase()), thumbHi:svg((hues[ci]+j*23)%360, e.split(' ').pop().toUpperCase(), 640, 360),
        tags:['documentary', e.toLowerCase(), 'celebrity'], categoryId:'24', lang:'en',
        views, likes:Math.round(views*(0.02+rnd()*0.03)), comments:Math.round(views*(0.002+rnd()*0.004)),
        durationSec: isShort? 20+Math.floor(rnd()*40) : 300+Math.floor(rnd()*2400), isShort,
        definition:'hd', caption:false, licensed:true, madeForKids:false, license:'youtube', topics:['Entertainment'],
        isLive:false, updatedAt:now, pid, _k:pid+'::'+id };
      videos.push(v);
      if(age<25){
        for(let s=3;s>=0;s--){
          const d = new Date(now - s*D); const key = `${id}_${dk(d)}`;
          snaps.push({key, _k:pid+'::'+key, pid, videoId:id, channelId:c.id, date:dk(d),
            views:Math.round(views*(1 - s*0.06*(1+rnd()))), likes:v.likes, comments:v.comments, ts:now - s*D});
        }
      }
    }
  });
  const trend = {ts:now-3*36e5, _k:pid+'::'+(now-3*36e5), pid, region:'US', mode:'charts', label:'2 categories',
    videos: videos.slice(0,40).map((v,i)=>({...v, rank:(i%20)+1, cat:i<20?'24':'25'}))};
  const trend0 = {ts:now-30*36e5, _k:pid+'::'+(now-30*36e5), pid, region:'US', mode:'charts', label:'2 categories',
    videos: videos.slice(5,45).map((v,i)=>({...v, rank:((i+3)%20)+1, cat:i<20?'24':'25'}))};
  const swipe = videos.slice(0,14).filter((_,i)=>i%2===0).map((v,i)=>({id:v.id, t:v.title, c:v.channelTitle, ci:v.channelId, th:v.thumbHi,
    v:Math.round(v.views*0.8), o:1.5+i, p:v.publishedTs, du:v.durationSec, s:v.isShort?1:0,
    n: i%3===0? 'Great cold open — the first 8 seconds name the stakes. Steal the red-arrow thumbnail move.' : '',
    g: i%2===0? 'Hooks worth stealing' : (i%3===0? 'Thumbnail formats':''), at:now - i*36e5}));
  swipe.push({id:'gone1234567', t:'A saved video that has left the cache', c:'Old Channel', ci:'UCgone', th:svg(10,'GONE'), v:55000, o:3.2, p:now-400*D, du:900, s:0, n:'Kept even though it is uncached', g:'', at:now-99*36e5});
  const store = { _rev:40, _savedAt:now,
    global:{ ytKey:'AIzaFAKE-KEY-FOR-TESTS', theme: opts.theme||'dark', density:'normal', textSize:'m', autoSync:false,
      quota:{date:dk(new Date()), units:3120, search:4} },
    active: pid,
    profiles:[
      { id:pid, name:'Celebrity news', color:'#6366f1', cfg:{ channels: chans.map(c=>c.id), scrapeDepth:200, snapshotDays:120, outlierThreshold:3,
          region:'US', trendCats:[24,25], lastSync: now-2*36e5, includeShorts:true, swipe, swipeCats:['Hooks worth stealing','Thumbnail formats'], perPage:50 } },
      { id:'pFinance2', name:'Finance channels', color:'#22c55e', cfg:{ channels:[], lastSync:0 } },
    ]};
  localStorage.setItem('signal_store_v2', JSON.stringify(store));
  localStorage.setItem('signal_store_v2_bak', JSON.stringify(store));
  const db = await new Promise((res,rej)=>{ const r = indexedDB.open('signal_db', 2);
    r.onupgradeneeded = e=>{ const db=e.target.result;
      ['videos','channels','snapshots','trending','misc'].forEach(n=>{ if(!db.objectStoreNames.contains(n)) db.createObjectStore(n,{keyPath: n==='snapshots'?'key':n==='trending'?'ts':n==='misc'?'k':'id'}); });
      ['v2_videos','v2_channels','v2_snapshots','v2_trending'].forEach(n=>{ if(!db.objectStoreNames.contains(n)){ const s=db.createObjectStore(n,{keyPath:'_k'}); s.createIndex('pid','pid'); s.createIndex('channelId','channelId'); } });
    };
    r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); });
  const put = (store, rows)=>new Promise((res,rej)=>{ const tx=db.transaction(store,'readwrite'); const os=tx.objectStore(store); rows.forEach(r=>os.put(r)); tx.oncomplete=res; tx.onerror=()=>rej(tx.error); });
  await put('v2_channels', chans); await put('v2_videos', videos); await put('v2_snapshots', snaps); await put('v2_trending', [trend0, trend]);
  await put('misc', [{k:'migrated_v2', v:true}, {k:'comments_'+pid, v:{ts:now, total:900, videoIds:[videos[0].id], data:{
    requests:[{text:'Please make a video about the Menendez brothers retrial!', likes:812, author:'@truecrimefan'},{text:'Can you do a video on Wendy Williams next?', likes:430, author:'@wendywatch'}],
    questions:[{text:'Why did nobody talk about the 2003 interview?', likes:220, author:'@curious'}],
    entities:[{text:'Diddy', likes:14, author:'14 mentions'},{text:'Oprah', likes:9, author:'9 mentions'}],
    reactions:[{text:'This channel never misses. The editing on this one is unreal.', likes:1500, author:'@fan'}]}}}]);
  db.close();
  return {videos:videos.length, snaps:snaps.length};
}
