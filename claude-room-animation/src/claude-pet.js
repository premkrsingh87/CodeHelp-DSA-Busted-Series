// Claude, in pet form: a small blocky clay creature with no mouth.
// Drawn from boxes so it turns cleanly (yaw: 0 front, +PI/2 faces screen-right, PI back).
import { P, S, LINE } from './palette.js';

const W = 200, H = 128, D = 120;   // body box
const LEG_H = 34, LEG_W = 22;
const ARM_W = 30, ARM_H = 34;
const LEGS = [[-76, 26], [-30, -26], [30, -26], [76, 26]]; // [x, z]

export function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawClaude(ctx, o = {}) {
  const {
    x = 0, y = 0, s = 1, yaw = 0, expr = 'neutral', blink = 0,
    lookX = 0, lookY = 0, squash = 0, armL = 0, armR = 0, reach = 0,
    blush = 0, rim = 0, line = LINE, hop = 0,
  } = o;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const px = (lx, lz) => lx * c + lz * sn;          // screen x of a local point
  const dep = (lx, lz) => -lx * sn + lz * c;         // toward camera = positive
  const lw = line / s;

  ctx.save();
  ctx.translate(x, y - hop * s);
  ctx.scale(s * (1 + squash * 0.08), s * (1 - squash * 0.1));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = P.ink;

  const top = -LEG_H - H, bot = -LEG_H;

  // ground contact shadow
  ctx.fillStyle = 'rgba(27,26,46,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 2, (Math.abs(W * c) + Math.abs(D * sn)) * 0.56, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs, far to near
  const legs = LEGS.map(([lx, lz]) => ({ sx: px(lx, lz), d: dep(lx, lz) })).sort((a, b) => a.d - b.d);
  for (const L of legs) {
    ctx.fillStyle = L.d < 0 ? S.clayShadow : P.clay;
    rrect(ctx, L.sx - LEG_W / 2, bot - 10, LEG_W, LEG_H + 10, 4);
    ctx.fill(); ctx.lineWidth = lw; ctx.stroke();
  }

  // arms: nubs on each side; raise swings them up/out, reach pushes them toward facing dir
  const xs = [px(-W / 2, D / 2), px(W / 2, D / 2), px(W / 2, -D / 2), px(-W / 2, -D / 2)];
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const arm = (side, raise) => {
    const ax = side * (W / 2 + ARM_W / 2 - 4);
    let sx = px(ax, reach * 70);
    const d = dep(ax, reach * 70);
    // in three-quarter views, slide the near nub to the silhouette edge so it reads as an arm
    if (Math.abs(sn) > 0.1 && Math.abs(c) > 0.3 && d > 1) sx = (side < 0 ? minX - 8 : maxX + 8) + px(0, reach * 70);
    return { side, raise, sx, d };
  };
  const arms = [arm(-1, armL), arm(1, armR)];
  const drawArm = (a) => {
    const ay = top + H * 0.56;
    ctx.save();
    // in front view raise lifts outward; in side view it lifts forward
    const dir = Math.abs(c) > 0.3 ? a.side : Math.sign(sn) || 1;
    ctx.translate(a.sx + dir * a.raise * 8, ay - a.raise * 30);
    ctx.rotate(dir * a.raise * 0.45);
    ctx.fillStyle = a.d < -1 ? S.clayShadow : P.clay;
    rrect(ctx, -ARM_W / 2, -ARM_H / 2, ARM_W, ARM_H, 5);
    ctx.fill(); ctx.lineWidth = lw; ctx.stroke();
    ctx.restore();
  };
  for (const a of arms) if (a.d < -1) drawArm(a);

  // body: silhouette, then lit/shadow side faces
  rrect(ctx, minX, top, maxX - minX, H, 12);
  ctx.fillStyle = P.clay; ctx.fill();
  ctx.save(); ctx.clip();
  // side faces: the one on screen-left catches the lamp, the one on screen-right is in shadow
  const faces = [];
  if (sn > 0.02) faces.push([px(-W / 2, -D / 2), px(-W / 2, D / 2)]);   // left face visible
  if (sn < -0.02) faces.push([px(W / 2, D / 2), px(W / 2, -D / 2)]);    // right face visible
  for (const [a, b] of faces) {
    const l = Math.min(a, b), r = Math.max(a, b);
    ctx.fillStyle = (l + r) / 2 < 0 ? S.clayLight : S.clayShadow;
    ctx.fillRect(l, top - 5, r - l, H + 10);
    ctx.beginPath();
    const edge = (l + r) / 2 < 0 ? r : l;
    ctx.moveTo(edge, top); ctx.lineTo(edge, bot);
    ctx.lineWidth = lw * 0.6; ctx.stroke();
  }
  // soft underside shade
  ctx.fillStyle = 'rgba(58,47,79,0.22)';
  ctx.fillRect(minX, bot - 16, maxX - minX, 16);
  // monitor rim light on the right edge
  if (rim > 0) {
    ctx.strokeStyle = P.teal; ctx.globalAlpha = rim;
    ctx.lineWidth = lw * 1.4;
    ctx.beginPath(); ctx.moveTo(maxX - lw * 1.2, top + 10); ctx.lineTo(maxX - lw * 1.2, bot - 8); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = P.ink;
  }
  ctx.restore();
  rrect(ctx, minX, top, maxX - minX, H, 12);
  ctx.lineWidth = lw; ctx.stroke();

  // face (front face only)
  if (c > 0.08) {
    const ey = top + 50 + lookY * 7;
    for (const side of [-1, 1]) {
      const ex = px(side * 42 + lookX * 9, D / 2);
      drawEye(ctx, ex, ey, c, side, expr, blink, lw);
      if (blush > 0) {
        ctx.fillStyle = P.rose; ctx.globalAlpha = blush * 0.85;
        ctx.beginPath(); ctx.ellipse(px(side * 70, D / 2), ey + 32, 14 * c, 7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  for (const a of arms) if (a.d >= -1) drawArm(a);
  ctx.restore();
}

function drawEye(ctx, ex, ey, c, side, expr, blink, lw) {
  const w = 21 * c;
  ctx.fillStyle = P.ink; ctx.strokeStyle = P.ink;
  const open = 1 - blink;
  if (expr === 'happy' || expr === 'peace') {
    // closed arcs: ^ for joy, ‿ for peaceful
    const up = expr === 'happy' ? -1 : 1;
    ctx.lineWidth = 9; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ex - w * 0.8, ey - up * 6);
    ctx.quadraticCurveTo(ex, ey + up * 12, ex + w * 0.8, ey - up * 6);
    ctx.stroke();
    return;
  }
  let h = 44, ww = w, cy = ey, topSlant = 0, cut = 0;
  if (expr === 'wonder') { h = 46; ww = w * 1.3; }
  if (expr === 'think') { cut = 0.45; }
  if (expr === 'sad') { h = 32; cy = ey + 4; topSlant = 9; }
  h *= Math.max(0.08, open);
  const t = cy - h / 2 + h * cut, b = cy + h / 2;
  // inner corner (toward centre) is higher when sad
  const innerX = ex - side * ww / 2, outerX = ex + side * ww / 2;
  ctx.beginPath();
  ctx.moveTo(innerX, t);
  ctx.lineTo(outerX, t + topSlant * open);
  ctx.lineTo(outerX, b);
  ctx.lineTo(innerX, b);
  ctx.closePath();
  ctx.fill();
  if (open > 0.4) {
    ctx.fillStyle = P.paper;
    const g = Math.min(7, ww * 0.38);
    ctx.fillRect(ex - ww / 2 + 2.5 * c, t + 4 + topSlant * 0.3, g, g);
    if (expr === 'wonder') ctx.fillRect(ex + ww / 2 - g * 0.9, b - g - 4, g * 0.6, g * 0.6);
  }
}
