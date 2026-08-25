import { chromium } from 'playwright';
import path from 'path';
const FILE = 'file://' + path.resolve('competitor_intel.html');
let pass=0, fail=0;
const ok  = (n,c,extra='') => { c?pass++:fail++; console.log(`${c?'  ✓':'  ✗ FAIL'} ${n}${extra?' — '+extra:''}`); };

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
// one persistent context so localStorage + IndexedDB survive "reloads"
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors=[];
page.on('pageerror', e=>errors.push(e.message));
page.on('console', m=>{ if(m.type()==='error') errors.push('console: '+m.text()); });

const boot = async () => { await page.goto(FILE); await page.waitForFunction(()=>window.__ready===true || document.getElementById('content')?.innerHTML.length>0, null, {timeout:15000}); await page.waitForTimeout(600); };

console.log('\n── 1. Boot & persistence basics ──');
await boot();
ok('page boots with no JS errors', errors.length===0, errors.slice(0,3).join(' | '));
ok('STORE has a profile', await page.evaluate(()=>STORE.profiles.length>0));
ok('storage marked ready (saving unlocked)', await page.evaluate(()=>STORE_READY===true));
ok('localStorage record written', await page.evaluate(()=>!!localStorage.getItem('signal_store_v2')));
ok('backup slot written', await page.evaluate(()=>!!localStorage.getItem('signal_store_v2_bak')));
ok('IndexedDB mirror written', await page.evaluate(async()=>{
  const m=(await idbAll('misc')).find(x=>x.k==='store_mirror'); return !!(m&&m.json); }));

console.log('\n── 2. Drafts: typing is kept, but never applied until you press Save ──');
await page.evaluate(()=>nav('settings'));
await page.waitForTimeout(300);
await page.fill('#setChannels', '@mrbeast\nUC_x5XG1OV2P6uZZ5FSM9Ttw\nhttps://youtube.com/@veritasium');
await page.dispatchEvent('#setChannels','input');
await page.waitForTimeout(800);   // debounce is 400ms
ok('typing does NOT touch the live list', (await page.evaluate(()=>CFG.channels.length))===0,
   'live='+await page.evaluate(()=>JSON.stringify(CFG.channels)));
ok('the draft is held', (await page.evaluate(()=>draftLines().length))===3);
ok('the app reports unsaved changes', await page.evaluate(()=>isDirty()));
const pidBefore = await page.evaluate(()=>PID());
await boot();   // hard reload, no Save ever pressed
ok('draft survives refresh (nothing typed is lost)', (await page.evaluate(()=>draftLines().length))===3,
   'got '+await page.evaluate(()=>JSON.stringify(draftLines())));
ok('live list still untouched after refresh', (await page.evaluate(()=>CFG.channels.length))===0);
await page.evaluate(()=>nav('settings')); await page.waitForTimeout(300);
ok('the box shows the draft, not the live list',
   (await page.evaluate(()=>document.getElementById('setChannels').value.split('\n').filter(Boolean).length))===3);
ok('unsaved bar is on screen', await page.evaluate(()=>!!document.querySelector('.dirtybar')));
await page.evaluate(()=>saveSettings()); await page.waitForTimeout(600);
ok('Save applies the draft', (await page.evaluate(()=>CFG.channels.length))===3);
ok('and clears the dirty state', !(await page.evaluate(()=>isDirty())));
await boot();
ok('applied list survives refresh', (await page.evaluate(()=>CFG.channels.length))===3);
ok('profile id is stable across reload', (await page.evaluate(()=>PID()))===pidBefore);

console.log('\n── 2b. An accidental edit cannot destroy the saved list ──');
await page.evaluate(()=>nav('settings')); await page.waitForTimeout(300);
await page.fill('#setChannels','');                       // select-all + delete
await page.dispatchEvent('#setChannels','input');
await page.waitForTimeout(800);
ok('emptying the box leaves the live list alone', (await page.evaluate(()=>CFG.channels.length))===3);
ok('cached channels untouched', (await page.evaluate(()=>S.channels.length))===(await page.evaluate(()=>S.channels.length)));
await boot();
ok('and still alone after a refresh', (await page.evaluate(()=>CFG.channels.length))===3);
await page.evaluate(()=>nav('settings')); await page.waitForTimeout(300);
await page.evaluate(()=>discardDrafts());
await page.evaluate(()=>render()); await page.waitForTimeout(200);
ok('Discard restores the box to the live list',
   (await page.evaluate(()=>document.getElementById('setChannels').value.split('\n').filter(Boolean).length))===3);

console.log('\n── 3. THE BUG: localStorage wiped, IndexedDB intact ──');
// seed real cached rows for this profile, exactly as a sync would
await page.evaluate(async()=>{
  const pid=PID();
  const chans=[
    {id:'UCX6OQ3DkcsbYNE6H8uQQuVA', title:'MrBeast', handle:'@mrbeast', subs:300000000, pid, _k:pid+'::UCX6OQ3DkcsbYNE6H8uQQuVA'},
    {id:'UC_x5XG1OV2P6uZZ5FSM9Ttw', title:'Google Devs', handle:'@googledevelopers', subs:2400000, pid, _k:pid+'::UC_x5XG1OV2P6uZZ5FSM9Ttw'},
    {id:'UCHnyfMqiRRG1u-2MsSQLbXA', title:'Veritasium', handle:'@veritasium', subs:16000000, pid, _k:pid+'::UCHnyfMqiRRG1u-2MsSQLbXA'},
  ];
  await idbPut(STORES.channels, chans);
  const vids=[];
  for(let i=0;i<30;i++) vids.push({id:'v'+i, channelId:chans[i%3].id, channelTitle:chans[i%3].title,
    title:'Video '+i, views:1000*i, likes:10*i, comments:i, duration:300, publishedTs:Date.now()-i*864e5,
    pid, _k:pid+'::v'+i});
  await idbPut(STORES.videos, vids);
});
await boot();
ok('seeded data is visible', (await page.evaluate(()=>S.videos.length))===30);
ok('seeded channels visible', (await page.evaluate(()=>S.channels.length))===3);

// now reproduce the reported failure: settings gone, bulk data still on disk
await page.evaluate(()=>{ localStorage.clear(); });
await boot();
const after = await page.evaluate(()=>({v:S.videos.length, c:S.channels.length, list:CFG.channels.length, pid:PID()}));
ok('videos still reachable after localStorage wipe', after.v===30, JSON.stringify(after));
ok('channels still reachable', after.c===3, JSON.stringify(after));
ok('channel LIST rebuilt (was the "0 channels" bug)', after.list===3, 'list='+after.list);
ok('re-adopted the original profile id', after.pid===pidBefore, after.pid+' vs '+pidBefore);

console.log('\n── 4. Orphan adoption: settings point at a stranger ──');
await page.evaluate(()=>{
  const s=JSON.parse(localStorage.getItem('signal_store_v2'));
  s.profiles=[{id:'pZZZZZZ', name:'Unrelated', color:'#6366f1', cfg:{channels:[]}}];
  s.active='pZZZZZZ'; s._rev=(s._rev|0)+50;
  localStorage.setItem('signal_store_v2', JSON.stringify(s));
  localStorage.setItem('signal_store_v2_bak', JSON.stringify(s));
});
await page.evaluate(async()=>{ await idbPut('misc',{k:'store_mirror',json:localStorage.getItem('signal_store_v2'),rev:999,at:Date.now()});
  for(let i=0;i<12;i++) await idbPut('misc',{k:'store_bak_'+i, json:localStorage.getItem('signal_store_v2'), rev:999, at:Date.now()}); });
await boot();
const ad = await page.evaluate(()=>({profiles:STORE.profiles.length, active:PID(), v:S.videos.length, list:CFG.channels.length}));
ok('orphaned data adopted into a profile', ad.profiles>=2, JSON.stringify(ad));
ok('switched to the profile that actually has data', ad.v===30, JSON.stringify(ad));
ok('its channel list was rebuilt too', ad.list===3, JSON.stringify(ad));

console.log('\n── 5. pruneOrphans no longer mass-deletes ──');
await page.evaluate(()=>nav('settings'));
await page.waitForTimeout(300);
await page.evaluate(()=>{ CFG.channels=[]; saveCfg(); });
const pruned = await page.evaluate(()=>pruneOrphans());
ok('empty list does not delete cached channels', pruned===0);
ok('cached channels untouched', (await page.evaluate(()=>S.channels.length))===3);

console.log('\n── 6. Paste / copy / clean / undo (all draft-scoped) ──');
await page.evaluate(()=>{ CFG.channels=[]; discardDrafts(); saveCfg(); nav('settings'); });
await page.waitForTimeout(300);
await page.evaluate(()=>applyPastedChannels('@a, @b\t@c\nhttps://youtube.com/@d\n@a\n\n#comment\n1. @e', 'add'));
const list = await page.evaluate(()=>draftLines());
ok('paste parses commas/tabs/newlines/URLs', list.length===5, JSON.stringify(list));
ok('paste drops duplicates', new Set(list.map(x=>x.toLowerCase())).size===list.length, JSON.stringify(list));
ok('paste strips list numbering', list.some(x=>x==='@e'), JSON.stringify(list));
ok('paste did NOT apply on its own', (await page.evaluate(()=>CFG.channels.length))===0);
await page.evaluate(()=>applyPastedChannels('@z','replace'));
ok('paste & replace swaps the draft', (await page.evaluate(()=>draftLines().length))===1);
await page.evaluate(()=>undoChannels());
ok('undo restores the previous draft', (await page.evaluate(()=>draftLines().length))===5);
await page.evaluate(()=>clearChannels());
ok('Clear empties the box only', (await page.evaluate(()=>draftLines().length))===0);
ok('Clear left the live list alone', (await page.evaluate(()=>CFG.channels.length))===0);
await page.evaluate(()=>undoChannels());
await page.evaluate(()=>saveSettings()); await page.waitForTimeout(500);
ok('Save applies what the box holds', (await page.evaluate(()=>CFG.channels.length))===5);
ok('canonical dedupe collapses URL forms', await page.evaluate(()=>
  normalizeChannelLines('@mrbeast\nhttps://www.youtube.com/@MrBeast?x=1\nyoutube.com/@mrbeast').length===1));

console.log('\n── 7. Recovery points ──');
await page.evaluate(()=>{ CFG.channels=['@one','@two']; saveCfg(); });
await page.waitForTimeout(900);
const revA = await page.evaluate(()=>STORE._rev);
await page.evaluate(()=>{ CFG.channels=[]; saveCfg(); });
await page.waitForTimeout(900);
const baks = await page.evaluate(async()=>(await idbAll('misc')).filter(m=>/^store_bak_\d+$/.test(m.k)&&m.json).length);
ok('rolling recovery points exist', baks>0, 'count='+baks);
ok('an older revision still holds the lost list', await page.evaluate(async(rev)=>{
  const m=(await idbAll('misc')).find(x=>/^store_bak_\d+$/.test(x.k) && (x.rev|0)===rev);
  if(!m) return false; const p=parseStore(m.json);
  return p.profiles.some(pr=>(pr.cfg?.channels||[]).length===2);
}, revA));

console.log('\n── 8. Quota failure is reported, not swallowed ──');
await page.evaluate(()=>{ window.__origSet = Storage.prototype.setItem;
  Storage.prototype.setItem = function(){ const e=new Error('QuotaExceededError'); e.name='QuotaExceededError'; throw e; }; });
const degraded = await page.evaluate(()=>{ const r=saveCfg(); return {r, degraded:HEALTH.degraded, lsOk:HEALTH.lsOk}; });
ok('failed write returns false', degraded.r===false, JSON.stringify(degraded));
ok('failure is flagged in HEALTH', degraded.degraded===true && degraded.lsOk===false, JSON.stringify(degraded));
await page.evaluate(()=>{ Storage.prototype.setItem = window.__origSet; });
ok('IndexedDB mirror still received the write', await page.evaluate(async()=>{ await flushMirror();
  const m=(await idbAll('misc')).find(x=>x.k==='store_mirror'); return !!(m&&m.json); }));

console.log('\n── 9. A blank boot never overwrites good data ──');
ok('provisional store refuses to save', await page.evaluate(()=>{
  const keep=STORE_READY; STORE_READY=false; const r=saveCfg(); STORE_READY=keep; return r===false; }));

console.log('\n── 10. Focus/caret survives a background re-render ──');
await page.evaluate(()=>{ CFG.channels=['@a']; saveCfg(); nav('settings'); });
await page.waitForTimeout(300);
await page.focus('#setChannels');
await page.evaluate(()=>{ const el=document.getElementById('setChannels'); el.value='@typing-in-progress'; el.setSelectionRange(5,5); });
await page.evaluate(()=>render());
const kept = await page.evaluate(()=>{ const el=document.getElementById('setChannels');
  return {v:el.value, focused:document.activeElement===el, caret:el.selectionStart}; });
ok('uncommitted text survives re-render', kept.v==='@typing-in-progress', JSON.stringify(kept));
ok('focus is retained', kept.focused===true, JSON.stringify(kept));
ok('caret position is retained', kept.caret===5, JSON.stringify(kept));

console.log(`\n${'═'.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'═'.repeat(46)}`);
if(errors.length) console.log('\nJS errors seen:\n' + [...new Set(errors)].slice(0,10).join('\n'));
await browser.close();
process.exit(fail?1:0);
