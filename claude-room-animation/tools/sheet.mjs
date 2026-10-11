// Gate 1: render the character sheet to out/character-sheet.png
import fs from 'node:fs';
import { openPage, ROOT } from './page.mjs';
const { browser, page } = await openPage({ module: 'sheet.js' });
const url = await page.evaluate(() => { M.renderSheet(ctx); return ctx.canvas.toDataURL('image/png'); });
fs.mkdirSync(`${ROOT}/out`, { recursive: true });
fs.writeFileSync(`${ROOT}/out/character-sheet.png`, Buffer.from(url.split(',')[1], 'base64'));
await browser.close();
console.log('wrote out/character-sheet.png');
