const H = require('./_harness.cjs');
const { chromium } = H.playwright();
const fs = require('fs');
const SEED = H.SEED;
let BASE = '';
const FILE = H.FILE;
const results = []; const ok = (name, cond, extra='') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
(async () => {
  const srv = await H.serve(); BASE = srv.base; require('fs').mkdirSync(H.SHOTS, {recursive:true});
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/googleapis|ytimg|youtube\.com/, r => r.abort());
  await page.goto(BASE + '/__blank');
  await page.evaluate(SEED + '; seedSignal({theme:"light"})');
  await page.goto(BASE + '/' + FILE);
  await page.waitForFunction(() => window.__ready === true);
  const T = ms => page.waitForTimeout(ms || 150);
  const dl = async (sel) => { const [d] = await Promise.all([page.waitForEvent('download', {timeout:5000}), page.click(sel)]); return d.suggestedFilename(); };

  // channel teardown + its export pull-down (data-chexport)
  await page.evaluate(() => nav('channels')); await T();
  await page.click('.chcard'); await T();
  ok('channel card opens teardown', await page.isVisible('[data-chback]'));
  await page.click('[data-chtab="bottom"]'); await T();
  ok('teardown tabs switch', await page.evaluate(() => S.filters.chTab) === 'bottom');
  await page.click('[data-pop="exp:chexport:ch"]'); await T(250);
  await page.screenshot({ path: H.SHOTS + '/ix2-chexport.png' });
  const f1 = await dl('#popMenu [data-chexport="csv"]');
  ok('teardown export (chexport) downloads', /signal-feed-.*\.csv$/.test(f1), f1);
  await page.click('[data-chback]'); await T();
  ok('back to all channels', await page.isVisible('.chcard'));

  // opportunities tabs
  await page.evaluate(() => nav('opps')); await T();
  for (const t of ['lanes','heating','cooling','breakout']) { await page.click(`[data-opptab="${t}"]`); await T(80); }
  ok('opportunity tabs cycle', await page.evaluate(() => S.filters.oppTab) === 'breakout');

  // calendar: day drill-down, metric, window, size/sort, open day everywhere
  await page.evaluate(() => nav('calendar')); await T();
  await page.click('.calday.has'); await T();
  ok('calendar day opens panel', await page.isVisible('#tblhost-calday'));
  await page.click('[data-calmetric="views"]'); await T(80);
  await page.click('[data-calmonths="1"]'); await T(80);
  ok('calendar metric + window', await page.evaluate(() => CFG.calMetric==='views' && CFG.calMonths===1));
  if(!(await page.$('#tblhost-calday'))){ await page.click('.calday.has'); await T(); }
  await page.click('[data-calsize="sm"]'); await T(80);
  await page.click('[data-calsort="views"]'); await T(80);
  ok('calendar day sort/size', await page.evaluate(() => S.filters.calSize==='sm' && S.filters.calSort==='views'));
  await page.click('[data-calfeed]'); await T();
  ok('open this day everywhere → custom range', await page.evaluate(() => S.range==='custom' && S.view==='feed'));
  await page.click('[data-act="clearRangeDates"]'); await T();
  await page.click('[data-range="90"]'); await T();

  // feed thumbnails + board size/sort + star shown
  await page.click('[data-feedview="thumbs"]'); await T();
  ok('feed thumbnail view', await page.isVisible('#tblhost-feed .boardgrid'));
  await page.click('[data-feedview="rows"]'); await T();
  await page.evaluate(() => nav('board')); await T();
  await page.click('[data-boardsize="xl"]'); await page.click('[data-boardsort="views"]'); await T();
  ok('board size + sort', await page.evaluate(() => S.filters.boardSize==='xl' && S.filters.boardSort==='views'));
  const before = await page.evaluate(() => CFG.swipe.length);
  await page.click('[data-act="starShown"]'); await T();
  ok('star whole page', await page.evaluate(() => CFG.swipe.length) > before);
  await page.click('[data-page="board|2"]'); await T();
  ok('pager moves', await page.evaluate(() => S.page.board) === 2);
  await page.click('[data-perpage="25"]'); await T();
  ok('per-page', await page.evaluate(() => CFG.perPage) === 25);

  // swipe: views, K cycling, compare top, file shown, pack export
  await page.keyboard.press('w'); await T();
  await page.click('[data-swipeview="rows"]'); await T(); await page.click('[data-swipeview="thumbs"]'); await T();
  await page.click('[data-swipesize="md"]'); await T();
  ok('swipe views + size', await page.evaluate(() => CFG.swipeView==='thumbs' && S.filters.swipeSize==='md'));
  await page.click('[data-swipeview="notes"]'); await T();
  await page.keyboard.press('k'); await T();
  ok('K cycles categories', await page.evaluate(() => S.filters.swipeCat) === 'Hooks worth stealing');
  await page.keyboard.press('Shift+K'); await T();
  await page.click('[data-act="cmpTop"]'); await T(400);
  ok('compare top thumbnails sheet', await page.isVisible('#modals .cmpcell'));
  await page.screenshot({ path: H.SHOTS + '/ix2-compare.png' });
  await page.keyboard.press('Escape'); await T();
  await page.click('[data-pop="swipepack"]'); await T(200);
  const f2 = await dl('#popMenu [data-act="swipeExport"]');
  ok('swipe pack export', /signal-swipe-.*\.json$/.test(f2), f2);
  await page.fill('.swipecard .swipenote', 'A brand new note'); await T(600);
  ok('notes save as you type', await page.evaluate(() => CFG.swipe.some(e => e.n === 'A brand new note')));

  // trending search, export view briefs, comments, storage tools, shortcuts sheet
  await page.evaluate(() => nav('trending')); await T();
  await page.fill('.content [data-search]', 'Wendy'); await T(400);
  ok('trending search filters', (await page.textContent('.content')).includes('Wendy'));
  await page.fill('.content [data-search]', ''); await T(300);
  await page.evaluate(() => nav('export')); await T();
  await page.click('[data-brief="ideas"]'); await T();
  ok('AI briefing pack renders', (await page.textContent('#briefOut')).includes('TASK'));
  const f3 = await dl('[data-export="analytics|md"]');
  ok('export hub download', /analytics.*\.md$/.test(f3), f3);
  await page.evaluate(() => nav('comments')); await T();
  ok('comment mining results', (await page.textContent('.content')).includes('Menendez'));
  await page.evaluate(() => nav('settings')); await T();
  await page.click('[data-act="storageScan"]'); await page.waitForSelector('#modals .modal'); await T(400);
  ok('storage scan sheet', (await page.textContent('#modals')).includes('Data found on disk'));
  await page.screenshot({ path: H.SHOTS + '/ix2-storage.png' });
  await page.click('#modals [data-act="storageBackups"]'); await T(400);
  ok('recovery points sheet', (await page.textContent('#modals')).includes('Recovery points'));
  await page.keyboard.press('Escape'); await T();
  await page.click('[data-act="chPaste"]'); await T(500);
  ok('paste falls back to sheet when clipboard blocked', await page.isVisible('#pasteBox'));
  await page.fill('#pasteBox', '@newchannel, youtube.com/@another/videos'); await T();
  await page.click('[data-act="pasteBoxAdd"]'); await T();
  ok('pasted channels become a draft', (await page.textContent('#topActions')).includes('Save 1 change'));
  await page.click('[data-act="chUndo"]'); await T();
  ok('undo channel paste', !(await page.textContent('#topActions')).includes('Save 1'));
  await page.keyboard.press('?'); await T(400);
  ok('shortcuts sheet', (await page.textContent('#modals')).includes('Search views'));
  await page.screenshot({ path: H.SHOTS + '/ix2-shortcuts.png' });
  await page.keyboard.press('Escape'); await T();
  // profile switching
  await page.click('#profToggle'); await T(); await page.click('[data-pswitch="pFinance2"]'); await T(400);
  ok('switch profile', await page.evaluate(() => STORE.active) === 'pFinance2');
  await page.screenshot({ path: H.SHOTS + '/ix2-emptyprofile.png' });
  await page.keyboard.press('Control+k'); await page.keyboard.type('celebrity'); await T(); await page.keyboard.press('Enter'); await T(500);
  ok('palette switches profile back', await page.evaluate(() => STORE.active) === 'pTestNiche1');

  console.log(results.join('\n'));
  console.log('errors:', errors);
  await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(1); }).finally(() => process.exit(process.exitCode || 0));
