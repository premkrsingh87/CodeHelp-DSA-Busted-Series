// Props shared by the sheet and the film.
import { P, S, LINE, mix } from './palette.js';
import { rrect } from './claude-pet.js';

// Monitor: origin = bottom centre of the stand. screen(ctx, w, h) draws the screen contents.
export function drawMonitor(ctx, x, y, s, screen, line = LINE) {
  const W = 360, H = 220;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineWidth = line / s; ctx.strokeStyle = P.ink; ctx.lineJoin = 'round';
  // stand
  ctx.fillStyle = '#2c2a44';
  rrect(ctx, -70, -12, 140, 12, 5); ctx.fill(); ctx.stroke();
  rrect(ctx, -16, -70, 32, 60, 4); ctx.fill(); ctx.stroke();
  // bezel
  rrect(ctx, -W / 2, -70 - H, W, H, 14); ctx.fillStyle = '#2c2a44'; ctx.fill(); ctx.stroke();
  ctx.save();
  rrect(ctx, -W / 2 + 14, -70 - H + 14, W - 28, H - 28, 6); ctx.clip();
  ctx.translate(-W / 2 + 14, -70 - H + 14);
  if (screen) screen(ctx, W - 28, H - 28); else { ctx.fillStyle = mix(P.ink, P.teal, 0.25); ctx.fillRect(0, 0, W, H); }
  ctx.restore();
  rrect(ctx, -W / 2 + 14, -70 - H + 14, W - 28, H - 28, 6); ctx.lineWidth = line / s * 0.6; ctx.stroke();
  ctx.restore();
}

export function drawLamp(ctx, x, y, s, on = 1, line = LINE) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineWidth = line / s; ctx.strokeStyle = P.ink; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.fillStyle = '#2c2a44';
  rrect(ctx, -44, -14, 88, 14, 6); ctx.fill(); ctx.stroke();
  // arm
  ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(-30, -110); ctx.lineTo(30, -170); ctx.stroke();
  ctx.lineWidth = line / s;
  // shade
  ctx.save(); ctx.translate(30, -170); ctx.rotate(0.55);
  ctx.fillStyle = P.ember;
  ctx.beginPath(); ctx.moveTo(-26, -10); ctx.lineTo(26, -10); ctx.lineTo(48, 44); ctx.lineTo(-48, 44); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = on > 0 ? mix(P.paper, P.ember, 0.3) : '#2c2a44';
  ctx.beginPath(); ctx.ellipse(0, 44, 46, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.restore();
}

export function drawMug(ctx, x, y, s, line = LINE) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineWidth = line / s; ctx.strokeStyle = P.ink;
  ctx.fillStyle = P.teal;
  ctx.beginPath(); ctx.arc(30, -32, 15, -1.3, 1.3); ctx.lineWidth = 9; ctx.stroke();
  ctx.lineWidth = line / s;
  rrect(ctx, -26, -66, 52, 66, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.paper; ctx.fillRect(-14, -44, 28, 4);
  ctx.restore();
}

export function drawHeadset(ctx, x, y, s, line = LINE) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineWidth = 12; ctx.strokeStyle = P.ink; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(0, 0, 52, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
  ctx.lineWidth = 5; ctx.strokeStyle = P.teal;
  ctx.beginPath(); ctx.arc(0, 0, 52, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.lineWidth = line / s; ctx.strokeStyle = P.ink;
  for (const sx of [-1, 1]) {
    ctx.fillStyle = P.ink; rrect(ctx, sx * 52 - 16, -14, 32, 50, 10); ctx.fill();
    ctx.fillStyle = P.teal; rrect(ctx, sx * 52 - 10, -6, 20, 34, 6); ctx.fill();
    rrect(ctx, sx * 52 - 16, -14, 32, 50, 10); ctx.stroke();
  }
  ctx.restore();
}

// The game's screens, used inside drawMonitor.
export function screenGameOver(ctx, w, h, t = 0, glow = 1) {
  ctx.fillStyle = mix(P.ink, P.teal, 0.18); ctx.fillRect(0, 0, w, h);
  // pixel hills of the paused game
  ctx.fillStyle = mix(P.ink, P.teal, 0.35);
  for (let i = 0; i < 12; i++) ctx.fillRect(i * 30, h - 40 - ((i * 37) % 30), 30, 60);
  ctx.fillStyle = P.paper; ctx.textAlign = 'center';
  ctx.font = '600 34px Fraunces';
  ctx.fillText('CONTINUE?', w / 2, h / 2 - 2);
  ctx.font = '700 15px Nunito';
  ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(t * 1.6)) * glow;
  ctx.fillText('YES        NO', w / 2, h / 2 + 34);
  ctx.globalAlpha = 1;
}

export function drawPalette(ctx, x, y, list) {
  list.forEach(([name, col], i) => {
    const sx = x + i * 86;
    ctx.fillStyle = col; ctx.strokeStyle = P.ink; ctx.lineWidth = 3;
    rrect(ctx, sx, y, 74, 56, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = P.ink; ctx.textAlign = 'left';
    ctx.font = '700 14px Nunito'; ctx.fillText(name, sx, y + 76);
    ctx.font = '400 13px Nunito'; ctx.globalAlpha = 0.7; ctx.fillText(col, sx, y + 93); ctx.globalAlpha = 1;
  });
}

export { S };
