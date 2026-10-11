// Shared headless-Chromium page: serves src/ at http://film.local/ and inlines fonts as base64.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const font = (pkg, file) => fs.readFileSync(path.join(ROOT, 'node_modules/@fontsource', pkg, 'files', file)).toString('base64');

function fontCSS() {
  const faces = [
    ['Fraunces', 'fraunces', 'fraunces-latin-400-normal.woff2', 400, 'normal'],
    ['Fraunces', 'fraunces', 'fraunces-latin-400-italic.woff2', 400, 'italic'],
    ['Fraunces', 'fraunces', 'fraunces-latin-600-normal.woff2', 600, 'normal'],
    ['Fraunces', 'fraunces', 'fraunces-latin-600-italic.woff2', 600, 'italic'],
    ['Nunito', 'nunito', 'nunito-latin-400-normal.woff2', 400, 'normal'],
    ['Nunito', 'nunito', 'nunito-latin-600-normal.woff2', 600, 'normal'],
    ['Nunito', 'nunito', 'nunito-latin-700-normal.woff2', 700, 'normal'],
  ];
  return faces.map(([fam, pkg, file, w, st]) =>
    `@font-face{font-family:'${fam}';font-weight:${w};font-style:${st};src:url(data:font/woff2;base64,${font(pkg, file)}) format('woff2');}`).join('\n');
}

export async function openPage({ width = 1920, height = 1080, module = 'film.js' } = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  const page = await browser.newPage();
  await page.route('http://film.local/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    if (p === '/') {
      return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><style>${fontCSS()} body{margin:0}</style></head>
 <script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<body><canvas id="c" width="${width}" height="${height}"></canvas>
<script type="module">
  import * as M from '/${module}';
  window.M = M;
  const ctx = document.getElementById('c').getContext('2d');
  window.ctx = ctx;
  const probe = ['400 20px Fraunces','italic 400 20px Fraunces','600 20px Fraunces','italic 600 20px Fraunces','400 20px Nunito','600 20px Nunito','700 20px Nunito'];
  Promise.all(probe.map(f => document.fonts.load(f))).then(() => { window.ready = true; });
</script></body></html>` });
    }
    const file = p.startsWith('/three/') ? path.join(ROOT, 'node_modules', p) : path.join(ROOT, 'src', p);
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(file) });
  });
  page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('console:', m.text()); });
  await page.goto('http://film.local/');
  await page.waitForFunction(() => window.ready === true);
  return { browser, page };
}
export { ROOT };
