const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const body = fs.readFileSync(path.join(DIR, 'scriptcut-app.html'), 'utf8');
fs.writeFileSync(path.join(DIR, 'app-wrapped.html'), `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>*{margin:0;padding:0}</style>
</head><body>${body}</body></html>`);

const ok = (c, m) => console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`);

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 940 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));

  await page.goto('file://' + path.join(DIR, 'app-wrapped.html'));
  await page.waitForTimeout(900);

  // 1. Boot parses the sample into real beats.
  const boot = await page.evaluate(() => ({
    beats: document.querySelectorAll('#beats .beat').length,
    clips: document.querySelectorAll('.cl').length,
    dur: document.querySelector('#ro-dur').textContent,
    words: document.querySelector('#ro-words').textContent,
    info: document.querySelector('#tl-info').textContent
  }));
  console.log('boot:', JSON.stringify(boot));
  ok(boot.beats >= 8, `parsed ${boot.beats} beats from the sample`);
  ok(boot.clips > boot.beats, `built ${boot.clips} timeline clips across tracks`);
  ok(boot.dur !== '0:00', `runtime computed: ${boot.dur}`);

  // 2. Canvas actually renders something (not a blank frame).
  const painted = await page.evaluate(() => {
    const c = document.querySelector('#view');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4000) seen.add(`${d[i]},${d[i+1]},${d[i+2]}`);
    return seen.size;
  });
  ok(painted > 8, `canvas renders a real frame (${painted} distinct sampled colours)`);

  // 3. Playback advances the clock.
  await page.click('#btn-play');
  await page.waitForTimeout(1600);
  const t1 = await page.evaluate(() => document.querySelector('#tc').textContent);
  await page.click('#btn-play'); // pause
  ok(!t1.startsWith('0:00.0'), `clock advanced during playback: ${t1}`);

  // 4. Seeking by clicking the timeline.
  await page.evaluate(() => {
    const lane = document.querySelector('#lane-a');
    const r = lane.getBoundingClientRect();
    document.querySelector('#tlinner').dispatchEvent(
      new MouseEvent('click', { clientX: r.left + r.width * 0.5, clientY: r.top, bubbles: true }));
  });
  await page.waitForTimeout(300);
  const t2 = await page.evaluate(() => document.querySelector('#tc').textContent);
  ok(!t2.startsWith('0:00.0'), `timeline click seeks: ${t2}`);

  // 5. Selecting a clip drives the inspector.
  await page.click('.cl.cl--a');
  await page.waitForTimeout(250);
  const hasInsp = await page.evaluate(() => !!document.querySelector('#i-text'));
  ok(hasInsp, 'clicking a clip opens that beat in the inspector');

  // 6. Editing duration actually retimes the cut.
  const before = await page.evaluate(() => document.querySelector('#ro-dur').textContent);
  await page.evaluate(() => {
    const s = document.querySelector('#i-dur');
    s.value = '12'; s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => document.querySelector('#ro-dur').textContent);
  ok(before !== after, `duration edit retimes the whole cut: ${before} -> ${after}`);

  // 7. Split increases the beat count.
  const bc1 = await page.evaluate(() => document.querySelectorAll('#beats .beat').length);
  await page.click('#i-split');
  await page.waitForTimeout(250);
  const bc2 = await page.evaluate(() => document.querySelectorAll('#beats .beat').length);
  ok(bc2 === bc1 + 1, `split works: ${bc1} -> ${bc2} beats`);

  // 8. Delete decreases it.
  await page.click('#i-del');
  await page.waitForTimeout(250);
  const bc3 = await page.evaluate(() => document.querySelectorAll('#beats .beat').length);
  ok(bc3 === bc2 - 1, `delete works: ${bc2} -> ${bc3} beats`);

  // 9. Retyping the script rebuilds the cut.
  await page.fill('#src', 'First line here. Second line follows.\n\nA new section entirely.');
  await page.click('#btn-cut');
  await page.waitForTimeout(300);
  const recut = await page.evaluate(() => document.querySelectorAll('#beats .beat').length);
  ok(recut === 3, `re-cutting a new script yields ${recut} beats`);

  // 10. SRT + EDL are real downloadable files.
  const dl1 = page.waitForEvent('download');
  await page.click('#btn-srt');
  const srt = await dl1;
  const srtPath = path.join(DIR, 'out.srt');
  await srt.saveAs(srtPath);
  const srtTxt = fs.readFileSync(srtPath, 'utf8');
  ok(/00:00:00,000 --> /.test(srtTxt) && srtTxt.includes('First line here.'), `SRT exported (${srt.suggestedFilename()})`);

  const dl2 = page.waitForEvent('download');
  await page.click('#btn-json');
  const j = await dl2;
  const jPath = path.join(DIR, 'out.json');
  await j.saveAs(jPath);
  const edl = JSON.parse(fs.readFileSync(jPath, 'utf8'));
  ok(edl.events.length === 3 && edl.duration > 0, `EDL exported with ${edl.events.length} events, ${edl.duration}s`);

  // 11. The actual video render.
  const dl3 = page.waitForEvent('download', { timeout: 90000 });
  await page.click('#btn-render');
  const vid = await dl3;
  const vPath = path.join(DIR, 'out.webm');
  await vid.saveAs(vPath);
  const size = fs.statSync(vPath).size;
  ok(size > 20000, `rendered a real video file: ${vid.suggestedFilename()}, ${(size/1024).toFixed(0)} KB`);

  // 12. Persistence across reload — and the app must still be LIVE afterwards.
  await page.reload();
  await page.waitForTimeout(800);
  const kept = await page.evaluate(() => document.querySelector('#src').value.slice(0, 16));
  ok(kept.startsWith('First line here'), 'project survives a reload via localStorage');

  const restored = await page.evaluate(() => ({
    beats: document.querySelectorAll('#beats .beat').length,
    clips: document.querySelectorAll('.cl').length
  }));
  ok(restored.beats === 3 && restored.clips > 3, `restored cut rebuilt: ${restored.beats} beats, ${restored.clips} clips`);

  // The render loop must be running after a restore, not dead from a boot throw.
  await page.click('#btn-play');
  await page.waitForTimeout(1500);
  const liveAfterReload = await page.evaluate(() => document.querySelector('#tc').textContent);
  await page.click('#btn-play');
  ok(!liveAfterReload.startsWith('0:00.0'), `playback still runs after reload: ${liveAfterReload}`);

  await page.screenshot({ path: path.join(DIR, 'app-shot.png') });

  console.log(errs.length ? '\nCONSOLE ERRORS:\n' + errs.join('\n') : '\nNo console errors.');
  await browser.close();
})();
