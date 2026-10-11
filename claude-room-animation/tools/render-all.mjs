// node tools/render-all.mjs <out.mp4> <fps> <scale> [workers]
// Splits the timeline into small interleaved chunks across workers, then joins them and adds score.wav.
import fs from 'node:fs';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { openPage, ROOT } from './page.mjs';

const [out, fpsS = '30', scaleS = '1', workersS] = process.argv.slice(2);
const fps = Number(fpsS), scale = Number(scaleS);
const workers = Number(workersS || Math.max(1, os.cpus().length - 1));
const w = Math.round(1920 * scale / 2) * 2, h = Math.round(1080 * scale / 2) * 2;
const CHUNK = 20;
const dir = `${ROOT}/out/chunks-${w}`; fs.mkdirSync(dir, { recursive: true });

const probe = await openPage({ module: 'film.js', width: 64, height: 36 });
const duration = await probe.page.evaluate(() => M.DURATION);
const ev = await probe.page.evaluate(() => M.events());
fs.writeFileSync(`${ROOT}/events.json`, JSON.stringify(ev, null, 1));
await probe.browser.close();

const total = Math.round(duration * fps);
const chunks = []; for (let s = 0; s < total; s += CHUNK) chunks.push([s, Math.min(total, s + CHUNK)]);
const file = (i) => `${dir}/c${String(i).padStart(5, '0')}.mp4`;
let done = 0; const t0 = Date.now();

async function worker(id) {
  const { browser, page } = await openPage({ module: 'film.js', width: w, height: h });
  await page.evaluate(([w, h]) => M.init(w, h), [w, h]);
  for (let ci = id; ci < chunks.length; ci += workers) {
    if (fs.existsSync(file(ci))) { done += chunks[ci][1] - chunks[ci][0]; continue; }  // resume
    const [a, b] = chunks[ci];
    const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(fps), file(ci) + '.tmp.mp4']);
    for (let f = a; f < b; f++) {
      const url = await page.evaluate((t) => { M.render(ctx, t); return ctx.canvas.toDataURL('image/jpeg', 0.94); }, f / fps);
      if (!ff.stdin.write(Buffer.from(url.split(',')[1], 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
      done++;
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    fs.renameSync(file(ci) + '.tmp.mp4', file(ci));
    const el = (Date.now() - t0) / 1000;
    if (ci % 5 === id) console.log(`${done}/${total} frames  ${el.toFixed(0)}s  eta ${((total - done) * el / Math.max(1, done)).toFixed(0)}s`);
  }
  await browser.close();
}
await Promise.all([...Array(workers)].map((_, i) => worker(i)));

fs.writeFileSync(`${dir}/list.txt`, chunks.map((_, i) => `file '${file(i)}'`).join('\n'));
const score = `${ROOT}/score.wav`;
const args = ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', `${dir}/list.txt`];
if (fs.existsSync(score)) args.push('-i', score, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest');
else args.push('-c:v', 'copy');
args.push('-movflags', '+faststart', out);
execFileSync('ffmpeg', args);
console.log(`wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
