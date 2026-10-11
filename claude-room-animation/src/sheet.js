// Gate 1 character sheet.
import { P, mix } from './palette.js';
import { drawClaude } from './claude-pet.js';
import { drawKai, drawController } from './kai.js';
import { drawMonitor, drawLamp, drawMug, drawHeadset, screenGameOver, drawPalette } from './props.js';

const VIEWS = [['Front', 0], ['Three-quarter', Math.PI / 4], ['Side', Math.PI / 2], ['Back', Math.PI]];

function label(ctx, text, x, y, size = 15, align = 'center', alpha = 0.75) {
  ctx.fillStyle = P.ink; ctx.globalAlpha = alpha; ctx.textAlign = align;
  ctx.font = `700 ${size}px Nunito`; ctx.fillText(text.toUpperCase(), x, y); ctx.globalAlpha = 1;
}
function heading(ctx, text, x, y) {
  ctx.fillStyle = P.ink; ctx.textAlign = 'left'; ctx.font = 'italic 600 30px Fraunces'; ctx.fillText(text, x, y);
}

export function renderSheet(ctx) {
  const W = 1920, H = 1080;
  ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
  // faint drafting grid
  ctx.strokeStyle = mix(P.paper, P.plum, 0.08); ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  // header
  ctx.fillStyle = P.ink; ctx.fillRect(0, 0, W, 78);
  ctx.fillStyle = P.paper; ctx.textAlign = 'left'; ctx.font = '600 40px Fraunces';
  ctx.fillText('Continue?', 40, 52);
  ctx.font = '600 17px Nunito'; ctx.globalAlpha = 0.75;
  ctx.fillText('CHARACTER SHEET  ·  a short film about a boy, his gaming room, and Claude in pet form', 250, 49);
  ctx.globalAlpha = 1;

  // divider
  ctx.strokeStyle = mix(P.paper, P.ink, 0.25); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(1170, 110); ctx.lineTo(1170, 1050); ctx.stroke();

  // --- Claude turnaround
  heading(ctx, 'Claude — pet form', 40, 130);
  label(ctx, 'clay body, no mouth, four stubby legs, two arm nubs', 340, 128, 13, 'left', 0.55);
  VIEWS.forEach(([name, yaw], i) => {
    const cx = 170 + i * 270;
    drawClaude(ctx, { x: cx, y: 400, s: 0.95, yaw, rim: 0.7 });
    label(ctx, name, cx, 440);
  });

  // --- Kai turnaround
  heading(ctx, 'Kai, 12', 40, 500);
  label(ctx, 'moss hoodie, headphones round his neck, messy hair', 170, 498, 13, 'left', 0.55);
  VIEWS.forEach(([name, yaw], i) => {
    const cx = 170 + i * 270;
    drawKai(ctx, { x: cx, y: 1000, s: 1.0, yaw, rim: 0.6 });
    label(ctx, name, cx, 1036);
  });

  // --- expressions
  heading(ctx, 'Expressions', 1210, 130);
  const ce = [['neutral', 'neutral'], ['happy', 'happy'], ['thinking', 'think'], ['sad', 'sad'], ['wonder', 'wonder']];
  ce.forEach(([name, expr], i) => {
    const cx = 1270 + i * 136;
    drawClaude(ctx, {
      x: cx, y: 290, s: 0.52, expr, blush: expr === 'happy' ? 1 : 0,
      squash: expr === 'sad' ? 0.9 : (expr === 'wonder' ? -0.6 : 0),
      armL: expr === 'happy' ? 0.7 : 0, armR: expr === 'happy' ? 0.7 : 0,
      lookY: expr === 'think' ? -1 : (expr === 'sad' ? 0.6 : 0), lookX: expr === 'think' ? 1 : 0,
    });
    label(ctx, name, cx, 318, 13);
  });
  const ke = [['neutral', 'neutral'], ['smile', 'smile'], ['wistful', 'wistful'], ['worried', 'worried'], ['hopeful', 'hopeful']];
  ke.forEach(([name, expr], i) => {
    const cx = 1270 + i * 136;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - 66, 340, 132, 150); ctx.clip();
    ctx.fillStyle = mix(P.paper, P.plum, 0.06); ctx.fillRect(cx - 66, 340, 132, 150);
    drawKai(ctx, {
      x: cx, y: 340 + 150 + 300 * 0.62 * 0.62 + 20, s: 0.62, expr, yaw: 0,
      blush: expr === 'smile' || expr === 'hopeful' ? 1 : 0,
      lookY: expr === 'wistful' ? 1 : (expr === 'hopeful' ? -1 : 0),
      headTilt: expr === 'wistful' ? -0.12 : (expr === 'hopeful' ? 0.08 : 0),
    });
    ctx.restore();
    label(ctx, name, cx, 512, 13);
  });

  // --- palette
  heading(ctx, 'Palette', 1210, 572);
  drawPalette(ctx, 1210, 592, [
    ['Ink', P.ink], ['Dusk Plum', P.plum], ['Clay', P.clay], ['Ember', P.ember],
    ['Monitor Teal', P.teal], ['Paper', P.paper], ['Moss', P.moss], ['Dawn Rose', P.rose],
  ]);
  label(ctx, 'Type: Fraunces (display, titles)  ·  Nunito (dialogue, labels)', 1210, 714, 12, 'left', 0.6);

  // --- props
  heading(ctx, 'Props', 1210, 764);
  drawMonitor(ctx, 1300, 900, 0.36, (c, w, h) => screenGameOver(c, w, h, 0.9));
  drawLamp(ctx, 1440, 900, 0.62, 1);
  drawController(ctx, 1560, 870, 0.95, 5);
  drawHeadset(ctx, 1690, 860, 0.62);
  drawMug(ctx, 1810, 900, 0.75);
  [['monitor', 1300], ['lamp', 1440], ['controller', 1560], ['headset', 1690], ['mug', 1810]]
    .forEach(([n, x]) => label(ctx, n, x, 926, 12));

  // --- rules
  heading(ctx, 'Rules', 1210, 976);
  const rules = [
    '1  Claude has no mouth: it emotes with eyes, squash, arm nubs and blush.',
    '2  Every shape has a 5 px Ink outline at 1080p, at any camera zoom.',
    '3  Lamp key light from upper-left (Ember); monitor rim light on right edges (Teal).',
    '4  Claude is as wide as Kai’s shoulders and sits on the desk at his eye level.',
    '5  Slow film: no move faster than 0.5 s, blink every 3–5 s, breathing never stops.',
  ];
  ctx.font = '600 14.5px Nunito'; ctx.fillStyle = P.ink; ctx.textAlign = 'left';
  rules.forEach((r, i) => ctx.fillText(r, 1210, 1000 + i * 17));
}
