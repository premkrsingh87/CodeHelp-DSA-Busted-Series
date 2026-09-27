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
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
  await page.route(/googleapis|ytimg|youtube\.com/, r => r.abort());
  await page.goto(BASE + '/__blank');
  await page.evaluate(SEED + '; seedSignal({theme:"dark"})');
  await page.goto(BASE + '/' + FILE);
  await page.waitForFunction(() => window.__ready === true);
  const shot = n => page.screenshot({ path: `${H.SHOTS}/ix-${n}.png` });

  // 1. Command palette
  await page.keyboard.press('Control+k');
  await page.waitForSelector('#palQ');
  ok('palette opens on Ctrl+K', await page.isVisible('.pal'));
  await page.keyboard.type('wendy');
  await page.waitForTimeout(150);
  const palRows = await page.$$eval('.pal-row', r => r.map(x => x.textContent.replace(/\s+/g, ' ').trim()).slice(0, 12));
  ok('palette finds videos by title', palRows.some(t => /Wendy/i.test(t)), palRows.length + ' rows');
  await shot('palette');
  await page.keyboard.press('Escape');
  ok('palette closes on Esc', !(await page.$('.pal')));
  await page.keyboard.press('Control+k'); await page.keyboard.type('thumbnail board'); await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  ok('palette Enter navigates', await page.textContent('#pageTitle') === 'Thumbnail Board');

  // 2. single-key shortcuts still work
  await page.keyboard.press('f'); await page.waitForTimeout(150);
  ok('F → feed', await page.textContent('#pageTitle') === 'Competitor Feed');
  await page.keyboard.press('w'); await page.waitForTimeout(150);
  ok('W → swipe file', await page.textContent('#pageTitle') === 'Swipe File');
  await page.keyboard.press('1'); await page.waitForTimeout(150);
  ok('1 → dashboard', await page.textContent('#pageTitle') === 'Dashboard');
  await page.keyboard.press(']'); await page.waitForTimeout(150);
  ok('] → next range', await page.evaluate(() => S.range) === '180');
  await page.keyboard.press('['); await page.waitForTimeout(100);
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150);
  ok('↓ → next tab', await page.textContent('#pageTitle') === 'Competitor Feed');

  // 3. Export pull-down → download
  await page.click('[data-pop^="exp:export:feed"]');
  ok('export menu opens', await page.isVisible('#popMenu'));
  await page.waitForTimeout(250); await shot('exportmenu');
  const items = await page.$$eval('#popMenu .pm-item', r => r.map(x => x.dataset.export));
  ok('export menu has all 5 formats', JSON.stringify(items) === JSON.stringify(['feed|csv','feed|json','feed|txt','feed|md','feed|zip']), items.join(','));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#popMenu [data-export="feed|csv"]')]);
  ok('CSV download fires', /signal-feed-.*\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  ok('menu closes after pick', !(await page.$('#popMenu')));
  await page.click('[data-pop^="exp:export:feed"]'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Escape');
  ok('menu Esc closes + refocuses trigger', !(await page.$('#popMenu')) && await page.evaluate(() => document.activeElement.dataset.pop || ''));

  // 4. Star + undo keeps note & category
  await page.keyboard.press('w'); await page.waitForTimeout(150);
  const before = await page.evaluate(() => { const e = CFG.swipe[0]; return { id: e.id, n: e.n, g: e.g, len: CFG.swipe.length }; });
  await page.click(`.swipecard [data-vstar="${before.id}"]`);
  await page.waitForTimeout(120);
  ok('unstar removes entry', await page.evaluate(() => CFG.swipe.length) === before.len - 1);
  await shot('undotoast');
  await page.click('.toast .tact');
  await page.waitForTimeout(150);
  const after = await page.evaluate(id => { const i = CFG.swipe.findIndex(x => x.id === id); return { i, e: CFG.swipe[i] }; }, before.id);
  ok('undo restores at same index with note + category', after.i === 0 && after.e.n === before.n && after.e.g === before.g);

  // 5. Alert dialog replaces prompt(): new category
  await page.click('[data-act="newCat"]');
  await page.waitForSelector('.alert'); await page.waitForTimeout(400);
  ok('alert opens for new category', await page.isVisible('.alert'));
  await page.keyboard.type('To script');
  await shot('alert');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  ok('Return confirms prompt', await page.evaluate(() => CFG.swipeCats.includes('To script')));
  // destructive confirm: cancel with Esc
  await page.click('[data-act="manageCats"]');
  await page.click('[data-catdel="To script"]');
  await page.waitForSelector('.alert');
  ok('destructive alert is red', await page.$('.alert .al-d') !== null);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  ok('Esc cancels destructive alert', await page.evaluate(() => CFG.swipeCats.includes('To script')) && await page.isVisible('#modals .modal'));
  await page.click('[data-catdel="To script"]'); await page.waitForSelector('.alert');
  await page.click('.alert [data-al="1"]'); await page.waitForTimeout(150);
  ok('confirm deletes category', await page.evaluate(() => !CFG.swipeCats.includes('To script')));
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok('Esc closes sheet', !(await page.$('#modals .modal')));

  // 6. Profile rename with colour swatches
  await page.click('#profToggle'); await page.waitForTimeout(250);
  await shot('profmenu');
  await page.click('[data-pact="rename"]');
  await page.waitForSelector('.alert .al-sw');
  await page.fill('#alIn', 'Celebrity & drama');
  await page.click('.al-sw [data-alc="#ec4899"]');
  await page.click('.alert [data-al="1"]'); await page.waitForTimeout(150);
  const prof = await page.evaluate(() => ({ n: activeProfile().name, c: activeProfile().color }));
  ok('rename + recolour applied', prof.n === 'Celebrity & drama' && prof.c === '#ec4899', JSON.stringify(prof));

  // 7. Channel picker with filter
  await page.keyboard.press('1'); await page.waitForTimeout(150);
  await page.click('.mpick-btn'); await page.waitForTimeout(120);
  ok('picker filter focused', await page.evaluate(() => document.activeElement.id) === 'chPickQ');
  await page.keyboard.type('crime');
  const vis = await page.$$eval('#chPickMenu .mpick-item', r => r.filter(x => !x.hidden).length);
  ok('picker filter narrows list', vis === 1, vis + ' visible');
  await page.click('#chPickMenu .mpick-item:not([hidden]) .mpick-row');
  await page.waitForTimeout(150);
  ok('toggling a channel changes selection', await page.evaluate(() => Array.isArray(S.filters.chSel) && S.filters.chSel.length === 5));
  await shot('picker');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok('Esc closes picker', !(await page.$('#chPickMenu')));
  await page.evaluate(() => { S.filters.chSel = null; render(); });

  // 8. Video detail sheet + selection bar
  await page.keyboard.press('2'); await page.waitForTimeout(150);
  await page.click('tbody tr:first-child .a-info');
  await page.waitForSelector('#modals .modal'); await page.waitForTimeout(450);
  ok('detail sheet is a labelled dialog', await page.evaluate(() => { const m = document.querySelector('#modals .modal'); return m.getAttribute('role') === 'dialog' && !!m.getAttribute('aria-labelledby'); }));
  await shot('detail');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok('focus returns to the opener', await page.evaluate(() => document.activeElement.classList.contains('a-info')));
  await page.keyboard.press('a'); await page.waitForTimeout(150);
  ok('A selects all shown + bar appears', await page.isVisible('.selbar') && await page.evaluate(() => vselSet().size) === 50);
  await shot('selbar');
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  ok('Esc clears selection', await page.evaluate(() => vselSet().size) === 0);

  // 9. Sort header by keyboard
  await page.focus('th[data-sort="feed|views"]'); await page.keyboard.press('Enter'); await page.waitForTimeout(120);
  ok('Enter on header sorts', await page.evaluate(() => S.sort.feed.c) === 'views');

  // 10. Appearance cycle + persistence of sidebar collapse
  await page.click('#themeBtn'); await page.waitForTimeout(100);
  const th = await page.evaluate(() => [CFG.theme, document.documentElement.dataset.theme]);
  ok('theme button cycles', th[0] === 'auto', th.join('/'));
  await page.keyboard.press('Control+\\'); await page.waitForTimeout(400);
  ok('Ctrl+\\ hides sidebar', await page.evaluate(() => document.documentElement.classList.contains('side-off')));
  await shot('sidebaroff');
  await page.reload(); await page.waitForFunction(() => window.__ready === true);
  ok('sidebar state + view survive reload', await page.evaluate(() => document.documentElement.classList.contains('side-off')) && await page.textContent('#pageTitle') === 'Competitor Feed');
  await page.keyboard.press('Control+\\');

  // 11. settings: switch is a real button, draft/save flow intact
  await page.keyboard.press('0'); await page.waitForTimeout(150);
  ok('switches are role=switch buttons', await page.$$eval('.sw', s => s.every(x => x.tagName === 'BUTTON' && x.getAttribute('role') === 'switch')));
  await page.click('[data-toggle="autoSync"]'); await page.waitForTimeout(100);
  ok('switch toggles setting', await page.evaluate(() => CFG.autoSync) === true);
  await page.fill('#setPatterns', 'The [Adjective] Truth About [Subject]');
  await page.waitForTimeout(600);
  ok('draft marks unsaved', (await page.textContent('#topActions')).includes('Save 1 change'));
  await page.click('[data-act="discardDrafts"]'); await page.waitForSelector('.alert');
  await page.click('.alert [data-al="1"]'); await page.waitForTimeout(150);
  ok('discard via alert restores', !(await page.textContent('#topActions')).includes('Save 1'));

  // 12. trend switch + keyword mode in Trending
  await page.keyboard.press('5'); await page.waitForTimeout(150);
  await page.click('[data-trendmode="keyword"]'); await page.waitForTimeout(100);
  ok('trending keyword mode renders', await page.isVisible('#trendKw'));
  await page.click('[data-trendmode="charts"]');

  console.log(results.join('\n'));
  console.log('errors:', errors);
  await browser.close();
})().catch(e => { console.log(results.join('\n')); console.error(e); process.exit(1); }).finally(() => process.exit(process.exitCode || 0));
