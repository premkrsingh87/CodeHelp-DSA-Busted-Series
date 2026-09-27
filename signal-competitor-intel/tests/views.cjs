const H = require('./_harness.cjs');
const { chromium } = H.playwright();
const fs = require('fs');
let BASE = '';
const FILE = H.FILE;
const OUT = H.SHOTS;
const SEED = H.SEED;
const VIEWS = ['dash','feed','calendar','swipe','outliers','momentum','opps','board','trending','compare','channels','analytics','comments','export','settings'];

async function run(label, viewport, theme, extra){
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: !!(extra&&extra.touch), isMobile: !!(extra&&extra.touch) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/googleapis|ytimg|youtube\.com/, r => r.abort());
  await page.goto(BASE + '/__blank');
  await page.evaluate(SEED + `; seedSignal({theme:${JSON.stringify(theme)}})`);
  await page.goto(BASE + '/' + FILE);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const report = [];
  fs.mkdirSync(OUT, { recursive: true });
  for (const v of VIEWS) {
    const t0 = Date.now();
    await page.evaluate(id => nav(id), v);
    const ms = Date.now() - t0;
    await page.waitForTimeout(350);
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const over = de.scrollWidth - window.innerWidth;
      // any element whose right edge pokes out past the viewport (and is not inside a scroller)
      const bad = [];
      for (const el of document.querySelectorAll('.content *')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0) continue;
        if (r.right > window.innerWidth + 1) {
          let p = el.parentElement, clipped = false;
          while (p && p !== document.body) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(cs.overflowX)) { clipped = true; break; } p = p.parentElement; }
          if (!clipped) bad.push(el.tagName.toLowerCase() + '.' + [...el.classList].join('.') + ' r=' + Math.round(r.right));
        }
      }
      // text smaller than 10px
      let tiny = 0; const tinyEx = [];
      for (const el of document.querySelectorAll('body *')) {
        if (!el.childNodes.length) continue;
        const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (!hasText) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 10.5 && el.getClientRects().length) { tiny++; if (tinyEx.length < 4) tinyEx.push(el.className + ':' + fs + ':' + el.textContent.trim().slice(0, 20)); }
      }
      const tblOver=[...document.querySelectorAll('.content .tbl-wrap')].map(w=>w.scrollWidth-w.clientWidth).filter(x=>x>0);
      const navFits = (()=>{ const n=document.getElementById('sideNav'); return n.scrollHeight<=n.clientHeight; })();
      return { over, tblOver, navFits, bad: bad.slice(0, 6), badN: bad.length, tiny, tinyEx, title: document.getElementById('pageTitle').textContent };
    });
    report.push({ v, ms, ...m });
    await page.screenshot({ path: `${OUT}/${label}-${v}.png`, fullPage: !!(extra && extra.full) });
  }
  await browser.close();
  return { label, errors, report };
}

(async () => {
  const srv = await H.serve(); BASE = srv.base; require('fs').mkdirSync(H.SHOTS, {recursive:true});
  const which = process.argv[2] || 'desktop';
  const cfg = {
    desktop: [{ w: 1440, h: 900 }, 'dark'],
    light: [{ w: 1440, h: 900 }, 'light'],
    laptop: [{ w: 1280, h: 800 }, 'light'],
    narrow: [{ w: 900, h: 800 }, 'dark'],
  }[which];
  const res = await run(which, { width: cfg[0].w, height: cfg[0].h }, cfg[1], cfg[2]);
  console.log(JSON.stringify(res, null, 1));
})().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(process.exitCode || 0));
