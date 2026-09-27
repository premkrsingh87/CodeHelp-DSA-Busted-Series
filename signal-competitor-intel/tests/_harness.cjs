// Shared test plumbing: a throwaway static server over the project folder and
// Playwright, resolved locally first and then from the global install.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const FILE = process.env.FILE || 'competitor_intel.html';
const SEED = fs.readFileSync(path.join(__dirname, 'seed.js'), 'utf8');
function playwright(){
  try { return require('playwright'); }
  catch (e) { return require(path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright')); }
}
function serve(){
  return new Promise(res => {
    const s = http.createServer((q, r) => {
      const url = decodeURIComponent(q.url.split('?')[0]);
      if (url === '/__blank') { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>seed</title>'); return; }
      const f = path.join(ROOT, url);
      if (!f.startsWith(ROOT)) { r.statusCode = 403; r.end(); return; }
      fs.readFile(f, (e, b) => { if (e) { r.statusCode = 404; r.end(); return; }
        r.setHeader('content-type', f.endsWith('.html') ? 'text/html' : 'text/plain'); r.end(b); });
    });
    s.listen(0, '127.0.0.1', () => res({ server: s, base: 'http://127.0.0.1:' + s.address().port }));
  });
}
module.exports = { ROOT, FILE, SEED, playwright, serve, SHOTS: path.join(__dirname, 'shots') };
