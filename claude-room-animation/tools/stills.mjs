// Render chosen times into one contact sheet: node tools/stills.mjs out.png scale cols t1 t2 ...
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openPage, ROOT } from './page.mjs';
const [out, scaleS, colsS, ...times] = process.argv.slice(2);
const scale = Number(scaleS), cols = Number(colsS);
const w = Math.round(1920 * scale), h = Math.round(1080 * scale);
const { browser, page } = await openPage({ module: 'film.js', width: w, height: h });
await page.evaluate(([w, h]) => M.init(w, h), [w, h]);
const dir = `${ROOT}/out/stills`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
let i = 0;
for (const t of times.map(Number)) {
  const t0 = Date.now();
  const url = await page.evaluate((t) => { M.render(ctx, t); return ctx.canvas.toDataURL('image/jpeg', 0.9); }, t);
  fs.writeFileSync(`${dir}/${String(i++).padStart(3, '0')}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`t=${t} ${Date.now() - t0}ms`);
}
await browser.close();
const rows = Math.ceil(times.length / cols);
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', `${dir}/%03d.jpg`, '-vf', `tile=${cols}x${rows}:padding=6:color=black`, '-frames:v', '1', out]);
console.log('wrote', out);
