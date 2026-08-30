#!/usr/bin/env node
/* Bundles src/ into a single self-contained FluxCut.html that runs from file://  */
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'src');
const ORDER = fs.readdirSync(SRC).filter(f => /^\d\d-.*\.js$/.test(f)).sort();

const css = fs.readFileSync(path.join(SRC, 'app.css'), 'utf8');
const shell = fs.readFileSync(path.join(SRC, 'shell.html'), 'utf8');
const js = ORDER.map(f => `/* ═══════════ ${f} ═══════════ */\n` + fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>FluxCut Studio</title>
<meta name="description" content="Auto-sequencing timeline that exports straight to Premiere Pro, Media Encoder, Resolve and ffmpeg.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%233d9bff'/><text x='16' y='23' font-size='19' font-family='sans-serif' font-weight='700' text-anchor='middle' fill='%23041020'>F</text></svg>">
<style>
${css}
</style>
</head>
<body>
${shell}
<script>
${js}
</script>
</body>
</html>
`;
const out = path.join(__dirname, 'FluxCut.html');
fs.writeFileSync(out, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`built ${path.relative(process.cwd(), out)}  ${kb} KB  (${ORDER.length} modules)`);

// dev page: same modules, loaded separately for debugging
const dev = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FluxCut Studio · dev</title><link rel="stylesheet" href="src/app.css"></head>
<body>
${shell}
${ORDER.map(f => `<script src="src/${f}"></script>`).join('\n')}
</body></html>
`;
fs.writeFileSync(path.join(__dirname, 'index.html'), dev);
console.log('built index.html (dev)');
