// Kai, 12: oversized moss hoodie, headphones round his neck, messy dark hair.
// yaw: 0 front, +PI/2 faces screen-right, PI back. Origin = floor between feet.
import { P, S, LINE } from './palette.js';
import { rrect } from './claude-pet.js';

const R = 62;                // head radius
const TOR_W = 128, TOR_HEM = 148, TOR_D = 78;
const SHOULDER_Y = -282, HEM_Y = -150;
const HEAD_Y = -350;
const UPPER = 70, FORE = 60, SLEEVE = 30, HAND = 15;

export function drawKai(ctx, o = {}) {
  const {
    x = 0, y = 0, s = 1, yaw = 0, pose = 'stand', expr = 'neutral',
    blink = 0, lookX = 0, lookY = 0, talk = 0, headYaw = 0, headTilt = 0,
    headNod = 0, lean = 0, blush = 0, line = LINE, rim = 0,
    armL = { sh: -0.1, el: 0.06 }, armR = { sh: 0.1, el: -0.06 },
    armsFront = false, holding = null, breathe = 0,
  } = o;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const px = (lx, lz) => lx * c + lz * sn;
  const dep = (lx, lz) => -lx * sn + lz * c;
  const lw = line / s;
  const sit = pose === 'sit';
  const dy = sit ? 26 : 0;   // upper body sits lower

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = P.ink; ctx.lineWidth = lw;

  // floor shadow
  ctx.fillStyle = 'rgba(27,26,46,0.28)';
  ctx.beginPath(); ctx.ellipse(sit ? sn * 60 : 0, 2, 90, 12, 0, 0, Math.PI * 2); ctx.fill();

  // ---- legs
  const legs = [-1, 1].map((side) => ({ side, lx: side * 28, d: dep(side * 28, 0) })).sort((a, b) => a.d - b.d);
  for (const L of legs) drawLeg(ctx, L, px, sit, sn, c, lw, dy);

  // ---- upper body (lean rotates about the hip)
  const hipY = HEM_Y + dy + 10;
  ctx.save();
  ctx.translate(0, hipY); ctx.rotate(lean); ctx.translate(0, -hipY);
  ctx.translate(0, dy - breathe * 2);

  const shoulderX = (side) => px(side * (TOR_W / 2 - 6), 0);
  const armList = [
    { side: -1, a: armL, d: dep(-TOR_W / 2, 0) },
    { side: 1, a: armR, d: dep(TOR_W / 2, 0) },
  ];
  const back = (A) => !armsFront && A.d < -2;
  for (const A of armList) if (back(A)) drawArm(ctx, shoulderX(A.side), A, lw, true);

  // hood behind the neck when facing us
  const hoodFront = c < 0;
  if (!hoodFront) drawHood(ctx, px, c, lw);

  // torso
  const sw = Math.abs(TOR_W * c) + Math.abs(TOR_D * sn);
  const hw = Math.abs(TOR_HEM * c) + Math.abs((TOR_D + 10) * sn);
  const cx0 = 0;
  ctx.beginPath();
  ctx.moveTo(cx0 - sw / 2 + 14, SHOULDER_Y);
  ctx.quadraticCurveTo(cx0 - sw / 2 - 4, SHOULDER_Y + 2, cx0 - sw / 2 - 6, SHOULDER_Y + 30);
  ctx.lineTo(cx0 - hw / 2, HEM_Y - 14);
  ctx.quadraticCurveTo(cx0 - hw / 2, HEM_Y, cx0 - hw / 2 + 14, HEM_Y);
  ctx.lineTo(cx0 + hw / 2 - 14, HEM_Y);
  ctx.quadraticCurveTo(cx0 + hw / 2, HEM_Y, cx0 + hw / 2, HEM_Y - 14);
  ctx.lineTo(cx0 + sw / 2 + 6, SHOULDER_Y + 30);
  ctx.quadraticCurveTo(cx0 + sw / 2 + 4, SHOULDER_Y + 2, cx0 + sw / 2 - 14, SHOULDER_Y);
  ctx.closePath();
  ctx.fillStyle = P.moss; ctx.fill();
  ctx.save(); ctx.clip();
  // shadow on the side away from the lamp
  ctx.fillStyle = S.mossShadow;
  const shadeFrom = sn < -0.15 ? px(TOR_W / 2, TOR_D / 2) : (sn > 0.15 ? px(TOR_W / 2, -TOR_D / 2) : sw * 0.22);
  ctx.fillRect(Math.min(shadeFrom, sw * 0.3), SHOULDER_Y - 10, 200, 200);
  // hem band
  ctx.fillStyle = 'rgba(27,26,46,0.18)';
  ctx.fillRect(-200, HEM_Y - 16, 400, 16);
  if (rim > 0) {
    ctx.globalAlpha = rim; ctx.strokeStyle = P.teal; ctx.lineWidth = lw * 1.5;
    ctx.beginPath(); ctx.moveTo(hw / 2 - 3, HEM_Y - 18); ctx.lineTo(sw / 2 + 2, SHOULDER_Y + 26); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = P.ink; ctx.lineWidth = lw;
  }
  // front details: pocket + drawstrings
  if (c > 0.15) {
    const pz = TOR_D / 2;
    ctx.lineWidth = lw * 0.7;
    ctx.beginPath();
    ctx.moveTo(px(-44, pz), HEM_Y - 14); ctx.lineTo(px(-34, pz), HEM_Y - 58);
    ctx.lineTo(px(34, pz), HEM_Y - 58); ctx.lineTo(px(44, pz), HEM_Y - 14);
    ctx.stroke();
    ctx.lineWidth = lw * 0.55; ctx.strokeStyle = P.paper;
    for (const sx of [-14, 14]) {
      ctx.beginPath(); ctx.moveTo(px(sx, pz), SHOULDER_Y + 14); ctx.lineTo(px(sx * 1.15, pz), SHOULDER_Y + 58); ctx.stroke();
    }
    ctx.strokeStyle = P.ink;
  }
  ctx.restore();
  ctx.lineWidth = lw; ctx.stroke();

  // neck
  ctx.fillStyle = S.skinShadow;
  rrect(ctx, -15, SHOULDER_Y - 26, 30, 34, 8); ctx.fill(); ctx.stroke();

  // headphones resting round the neck
  drawHeadphones(ctx, yaw, lw, 'back');
  if (hoodFront) drawHood(ctx, px, c, lw);

  // head
  ctx.save();
  ctx.translate(0, SHOULDER_Y - 18);
  ctx.rotate(headTilt);
  ctx.translate(0, HEAD_Y - SHOULDER_Y + 18 + headNod * 8);
  drawHead(ctx, yaw + headYaw, expr, blink, lookX, lookY, talk, blush, lw, rim);
  ctx.restore();

  drawHeadphones(ctx, yaw, lw, 'front');

  for (const A of armList) if (!back(A)) drawArm(ctx, shoulderX(A.side), A, lw, false);
  if (holding === 'controller') {
    const hands = armList.map((A) => armEnd(shoulderX(A.side), A.a));
    const hx = (hands[0][0] + hands[1][0]) / 2, hy = (hands[0][1] + hands[1][1]) / 2;
    drawController(ctx, hx, hy + 4, 0.8, lw, Math.abs(c) < 0.5 ? 0.45 : 1);
    for (const h of hands) { ctx.fillStyle = P.paper; drawHand(ctx, h[0], h[1], lw); }
  }
  ctx.restore();
  ctx.restore();
}

function drawLeg(ctx, L, px, sit, sn, c, lw, dy) {
  const hipX = px(L.lx, 0), hipY = HEM_Y + dy - 4;
  const shade = L.d < -5;
  ctx.fillStyle = shade ? S.denimShadow : S.denim;
  ctx.lineWidth = lw;
  if (!sit) {
    rrect(ctx, hipX - 21, hipY - 10, 42, -HEM_Y - 14, 12); ctx.fill(); ctx.stroke();
    drawShoe(ctx, hipX, -2, sn, c, lw, shade);
  } else {
    // thigh forward (toward facing dir), shin down to the floor
    const fwd = sn * 92;
    const kx = hipX + fwd, ky = hipY + 6 + (1 - Math.abs(sn)) * 30;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY - 18); ctx.lineTo(kx, ky - 20);
    ctx.lineTo(kx, ky + 22); ctx.lineTo(hipX, hipY + 22);
    ctx.lineTo(hipX, hipY - 18);
    ctx.lineWidth = 0;
    ctx.save(); ctx.lineWidth = 44; ctx.strokeStyle = shade ? S.denimShadow : S.denim;
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(kx, ky); ctx.lineTo(kx + sn * 6, -24); ctx.stroke();
    ctx.restore();
    // outline the leg as a thick path
    ctx.save(); ctx.globalCompositeOperation = 'destination-over';
    ctx.lineWidth = 44 + lw * 2; ctx.strokeStyle = P.ink;
    ctx.beginPath(); ctx.moveTo(hipX, hipY); ctx.lineTo(kx, ky); ctx.lineTo(kx + sn * 6, -24); ctx.stroke();
    ctx.restore();
    drawShoe(ctx, kx + sn * 6, -2, sn, c, lw, shade);
  }
}

function drawShoe(ctx, x, y, sn, c, lw, shade) {
  const len = 30 + Math.abs(sn) * 30;
  const off = sn * 16;
  ctx.fillStyle = shade ? S.clayShadow : P.paper;
  rrect(ctx, x - len / 2 + off, y - 24, len, 24, 10); ctx.fill(); ctx.lineWidth = lw; ctx.stroke();
  ctx.fillStyle = P.clay;
  ctx.fillRect(x - len / 2 + off + 3, y - 9, len - 6, 5);
}

function armEnd(sx, a) {
  const ex = sx + Math.sin(a.sh) * UPPER, ey = SHOULDER_Y + 14 + Math.cos(a.sh) * UPPER;
  const a2 = a.sh + a.el;
  return [ex + Math.sin(a2) * FORE, ey + Math.cos(a2) * FORE, ex, ey];
}

function drawArm(ctx, sx, A, lw, far) {
  const [hx, hy, ex, ey] = armEnd(sx, A.a);
  const sy = SHOULDER_Y + 14;
  const col = far ? S.mossShadow : P.moss;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = P.ink; ctx.lineWidth = SLEEVE + lw * 2;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = SLEEVE;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.restore();
  if (A.a.point) drawPointHand(ctx, hx, hy, A.a.sh + A.a.el, lw);
  else drawHand(ctx, hx, hy, lw);
}

function drawHand(ctx, x, y, lw) {
  ctx.fillStyle = S.skin; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.arc(x, y, HAND, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

function drawPointHand(ctx, x, y, ang, lw) {
  drawHand(ctx, x, y, lw);
  // extended index finger
  const fx = x + Math.sin(ang) * 26, fy = y + Math.cos(ang) * 26;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = P.ink; ctx.lineWidth = 11 + lw * 2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(fx, fy); ctx.stroke();
  ctx.strokeStyle = S.skin; ctx.lineWidth = 11;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(fx, fy); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = S.skin; ctx.beginPath(); ctx.arc(x, y, HAND - lw / 2, 0, Math.PI * 2); ctx.fill();
}

function drawHood(ctx, px, c, lw) {
  ctx.fillStyle = S.mossShadow; ctx.lineWidth = lw;
  const w = 104 * (0.55 + 0.45 * Math.abs(c));
  const y0 = SHOULDER_Y - 28;
  ctx.beginPath();
  if (c >= 0) {
    // collar ring peeking behind the neck
    ctx.ellipse(0, SHOULDER_Y - 4, w / 2, 24, 0, Math.PI, 0);
    ctx.closePath();
  } else {
    rrect(ctx, -w / 2, y0 + 6, w, 82, 30);
  }
  ctx.fill(); ctx.stroke();
}

function drawHeadphones(ctx, yaw, lw, layer) {
  const r = 46, y = SHOULDER_Y - 6;
  const cups = [-1, 1].map((side) => {
    const a = side * 1.15 + yaw;
    return { x: r * Math.sin(a), d: Math.cos(a) };
  });
  if (layer === 'back') {
    // band loops behind the neck
    ctx.strokeStyle = P.ink; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.ellipse(0, y - 4, r * 0.98, 16, 0, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = P.teal; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(0, y - 4, r * 0.98, 16, 0, Math.PI, 0); ctx.stroke();
  }
  for (const cp of cups) {
    if ((layer === 'front') !== (cp.d >= -0.1)) continue;
    const w = 16 + 12 * Math.abs(cp.d);
    ctx.fillStyle = P.ink;
    rrect(ctx, cp.x - w / 2, y - 4, w, 34, 9); ctx.fill();
    ctx.fillStyle = P.teal;
    rrect(ctx, cp.x - w / 2 + 4, y + 2, w - 8, 22, 5); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = lw;
    rrect(ctx, cp.x - w / 2, y - 4, w, 34, 9); ctx.stroke();
  }
}

function drawHead(ctx, yaw, expr, blink, lookX, lookY, talk, blush, lw, rim) {
  const vis = (a) => Math.cos(a + yaw);
  const sx = (a, r = R) => r * Math.sin(a + yaw);

  ctx.strokeStyle = P.ink; ctx.lineWidth = lw;
  const ear = (side) => {
    const a = side * Math.PI / 2, v = vis(a);
    ctx.fillStyle = v > 0.3 ? S.skin : S.skinShadow;
    ctx.beginPath(); ctx.ellipse(sx(a, R * (v > 0.3 ? 0.86 : 0.98)), 16, 8 + 6 * Math.abs(v), 15, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.lineWidth = lw; ctx.stroke();
  };
  // far ears peek out behind the skull
  for (const side of [-1, 1]) { const v = vis(side * Math.PI / 2); if (v > -0.35 && v <= 0.3) ear(side); }
  // skull
  ctx.fillStyle = S.skin;
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = S.skinShadow;
  ctx.beginPath(); ctx.arc(R * 0.55, R * 0.25, R * 0.95, -0.4, 1.9); ctx.fill();
  if (rim > 0) {
    ctx.globalAlpha = rim; ctx.strokeStyle = P.teal; ctx.lineWidth = lw * 1.5;
    ctx.beginPath(); ctx.arc(0, 0, R - lw * 0.8, -0.9, 0.9); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.restore();

  // side-on: a soft nose bump on the silhouette
  if (Math.abs(Math.sin(yaw)) > 0.6 && vis(0) > -0.1) {
    const dir = Math.sign(Math.sin(yaw));
    ctx.fillStyle = S.skin;
    ctx.beginPath();
    if (dir > 0) ctx.arc(R - 4, 26, 9, -Math.PI / 2, Math.PI / 2); else ctx.arc(-R + 4, 26, 9, Math.PI / 2, Math.PI * 1.5);
    ctx.fill(); ctx.stroke();
  }
  // face features (only on the visible hemisphere)
  const faceVis = vis(0);
  if (faceVis > -0.2) drawFace(ctx, yaw, expr, blink, lookX, lookY, talk, blush, lw);

  // hair: dome over the top + hairline that drops lower at the back
  ctx.fillStyle = S.hair;
  const hairline = (a) => R * (-0.28 + 0.92 * (1 - Math.cos(a)) / 2);
  const pts = [];
  const a0 = -Math.PI / 2 - yaw, a1 = Math.PI / 2 - yaw;
  for (let i = 0; i <= 40; i++) {
    const a = a1 + (a0 - a1) * (i / 40);
    pts.push([R * Math.sin(a + yaw) * 1.04, hairline(a)]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) ctx.lineTo(p[0], p[1]);
  ctx.arc(0, 0, R + 6, Math.PI - 0.15, 0.15, false);
  ctx.closePath();
  ctx.fill(); ctx.lineWidth = lw; ctx.stroke();
  // near ears sit on top of the hair edge
  for (const side of [-1, 1]) { if (vis(side * Math.PI / 2) > 0.3) ear(side); }
  ctx.fillStyle = S.hair;
  // fringe tufts across the front
  for (let i = 0; i < 5; i++) {
    const a = -0.85 + i * 0.42, v = vis(a);
    if (v < 0.05) continue;
    const bx = sx(a, R * 1.02), by = hairline(a) - 2;
    const w = 22 * v;
    ctx.beginPath();
    ctx.moveTo(bx - w, by - 6);
    ctx.quadraticCurveTo(bx + w * 0.2, by + 4, bx + w * 0.35, by + 18 + (i % 2) * 6);
    ctx.quadraticCurveTo(bx + w * 0.7, by + 2, bx + w, by - 6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // crown tufts
  ctx.beginPath();
  ctx.moveTo(-18, -R - 2); ctx.quadraticCurveTo(-4, -R - 26, 6, -R - 18);
  ctx.quadraticCurveTo(14, -R - 30, 26, -R - 4);
  ctx.fill(); ctx.stroke();
}

function drawFace(ctx, yaw, expr, blink, lookX, lookY, talk, blush, lw) {
  const vis = (a) => Math.cos(a + yaw);
  const sx = (a, r = R) => r * Math.sin(a + yaw);
  const eyeY = 12 + lookY * 3;
  const open = 1 - blink;
  for (const side of [-1, 1]) {
    const a = side * 0.42, v = vis(a);
    if (v < 0.12) continue;
    const ex = sx(a) + lookX * 4 * v;
    const w = 13 * v, h = 19;
    // brows
    let bTilt = 0, bLift = 0;
    if (expr === 'worried' || expr === 'wistful') { bTilt = side * 0.28; bLift = 3; }
    if (expr === 'hopeful') bLift = 6;
    ctx.save();
    ctx.translate(sx(a, R * 0.98), eyeY - 25 - bLift);
    ctx.rotate(-bTilt);
    ctx.strokeStyle = S.hair; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-11 * v, 0); ctx.lineTo(11 * v, 0); ctx.stroke();
    ctx.restore();

    ctx.fillStyle = P.ink;
    if (expr === 'smile') {
      ctx.strokeStyle = P.ink; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(ex - w, eyeY + 3); ctx.quadraticCurveTo(ex, eyeY - 10, ex + w, eyeY + 3); ctx.stroke();
      continue;
    }
    const hh = h * Math.max(0.1, open);
    ctx.beginPath(); ctx.ellipse(ex, eyeY, w, hh / 2 + 2, 0, 0, Math.PI * 2); ctx.fill();
    if (open > 0.4) {
      ctx.fillStyle = P.paper;
      ctx.beginPath(); ctx.arc(ex - w * 0.3, eyeY - 4, 3.5, 0, Math.PI * 2); ctx.fill();
      if (expr === 'hopeful' || expr === 'worried') {
        ctx.beginPath(); ctx.arc(ex + w * 0.35, eyeY + 4, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (expr === 'wistful' && open > 0.3) {
      // heavy upper lid
      ctx.fillStyle = S.skin;
      ctx.fillRect(ex - w - 3, eyeY - hh / 2 - 4, w * 2 + 6, hh * 0.38 + 4);
      ctx.strokeStyle = P.ink; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(ex - w - 2, eyeY - hh * 0.1); ctx.quadraticCurveTo(ex, eyeY - hh * 0.2, ex + w + 2, eyeY - hh * 0.1); ctx.stroke();
    }
  }
  // blush
  if (blush > 0) {
    ctx.fillStyle = P.rose; ctx.globalAlpha = 0.75 * blush;
    for (const side of [-1, 1]) {
      const a = side * 0.62, v = vis(a);
      if (v > 0.15) { ctx.beginPath(); ctx.ellipse(sx(a), 34, 11 * v, 6, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  // nose
  const nv = vis(0);
  if (nv > 0.1) {
    ctx.strokeStyle = S.skinShadow; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(sx(0.08, R * 1.02), 22); ctx.lineTo(sx(0.12, R * 1.04), 30); ctx.stroke();
  }
  // mouth
  if (nv > 0.05) {
    const mx = sx(0, R * 0.98), my = 44;
    const mw = 12 * nv;
    ctx.strokeStyle = P.ink; ctx.lineWidth = 4.5; ctx.fillStyle = mix2();
    if (talk > 0.05) {
      ctx.beginPath(); ctx.ellipse(mx, my + 1, mw * 0.8, 2 + talk * 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#5a2b33'; ctx.fill(); ctx.stroke();
    } else {
      let curve = 3;
      if (expr === 'smile') curve = 8;
      if (expr === 'hopeful') curve = 6;
      if (expr === 'worried') curve = -4;
      if (expr === 'wistful') curve = 0.5;
      ctx.beginPath(); ctx.moveTo(mx - mw, my); ctx.quadraticCurveTo(mx, my + curve, mx + mw, my); ctx.stroke();
    }
  }
}
function mix2() { return '#5a2b33'; }

export function drawController(ctx, x, y, s, lw, flat = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s * (0.55 + 0.45 * flat));
  ctx.fillStyle = mixInk(); ctx.strokeStyle = P.ink; ctx.lineWidth = lw / s;
  ctx.beginPath();
  ctx.moveTo(-40, -14); ctx.lineTo(40, -14);
  ctx.quadraticCurveTo(62, -14, 62, 10); ctx.quadraticCurveTo(62, 30, 46, 26);
  ctx.lineTo(28, 10); ctx.lineTo(-28, 10); ctx.lineTo(-46, 26);
  ctx.quadraticCurveTo(-62, 30, -62, 10); ctx.quadraticCurveTo(-62, -14, -40, -14);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = P.teal;
  ctx.fillRect(-42, -4, 18, 5); ctx.fillRect(-35.5, -10.5, 5, 18);
  ctx.fillStyle = P.clay; ctx.beginPath(); ctx.arc(36, -5, 4.5, 0, 7); ctx.fill();
  ctx.fillStyle = P.ember; ctx.beginPath(); ctx.arc(46, 3, 4.5, 0, 7); ctx.fill();
  ctx.restore();
}
function mixInk() { return '#2c2a44'; }
