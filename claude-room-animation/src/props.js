// Low-poly props: monitor (live screen texture), desk lamp, controller, headset, mug.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M, mesh } from './materials.js';
import { P, mix } from './palette.js';

// ---- monitor: origin = bottom centre of the foot. screen.draw(ctx, w, h) paints the display.
export function buildMonitor() {
  const g = new THREE.Group(); g.name = 'monitor';
  const foot = mesh(new RoundedBoxGeometry(0.26, 0.02, 0.16, 1, 0.008), M.rubber()); foot.position.y = 0.01; g.add(foot);
  const post = mesh(new RoundedBoxGeometry(0.05, 0.16, 0.03, 1, 0.01), M.rubber()); post.position.set(0, 0.09, -0.03); g.add(post);
  const bezel = mesh(new RoundedBoxGeometry(0.66, 0.40, 0.035, 2, 0.015), M.rubber()); bezel.position.set(0, 0.36, 0); g.add(bezel);
  const cvs = document.createElement('canvas'); cvs.width = 1024; cvs.height = 600;
  const tex = new THREE.CanvasTexture(cvs); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const screenMat = new THREE.MeshStandardMaterial({ color: '#000', emissive: '#fff', emissiveMap: tex, emissiveIntensity: 1.25, roughness: 0.2 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.36), screenMat);
  screen.position.set(0, 0.36, 0.0185); g.add(screen);
  g.userData = { cvs, tex, screenMat, screen };
  return g;
}
export function paintMonitor(mon, draw) {
  const { cvs, tex } = mon.userData;
  const ctx = cvs.getContext('2d');
  draw(ctx, cvs.width, cvs.height);
  tex.needsUpdate = true;
}

export function screenGameOver(ctx, w, h, t = 0, opts = {}) {
  const { title = 'CONTINUE?', sub = 'YES          NO', select = 0, pulse = 1, dawn = 0 } = opts;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, mix(P.ink, P.plum, 0.6)); g.addColorStop(1, mix(mix(P.ink, P.teal, 0.25), P.rose, dawn * 0.5));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // pixel skyline of the paused game
  ctx.fillStyle = mix(P.ink, P.teal, 0.42);
  for (let i = 0; i < 16; i++) ctx.fillRect(i * 64, h - 120 - ((i * 37) % 70), 64, 200);
  ctx.fillStyle = P.teal;
  for (let i = 0; i < 40; i++) ctx.fillRect((i * 151) % w, h - 60 - ((i * 71) % 140), 8, 8);
  // stars
  ctx.fillStyle = P.paper;
  for (let i = 0; i < 30; i++) ctx.fillRect((i * 263) % w, (i * 97) % (h * 0.45), 4, 4);
  ctx.textAlign = 'center';
  ctx.fillStyle = P.paper; ctx.font = '600 104px Fraunces';
  ctx.fillText(title, w / 2, h / 2 - 10);
  if (sub) {
    ctx.font = '700 40px Nunito';
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.fillText(sub, w / 2, h / 2 + 80);
    ctx.globalAlpha = 1;
    if (select >= 0) { ctx.fillStyle = P.ember; ctx.fillText('▶', w / 2 - 190 + select * 270, h / 2 + 80); }
  }
}

// ---- desk lamp, shade aims down-right. Origin = bottom of base.
export function buildLamp() {
  const g = new THREE.Group(); g.name = 'lamp';
  const base = mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.03, 8), M.rubber()); base.position.y = 0.015; g.add(base);
  const a1 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), M.rubber());
  a1.position.set(-0.05, 0.16, 0); a1.rotation.z = 0.35; g.add(a1);
  const j = mesh(new THREE.IcosahedronGeometry(0.022, 0), M.ember()); j.position.set(-0.1, 0.3, 0); g.add(j);
  const a2 = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6), M.rubber());
  a2.position.set(0.0, 0.38, 0); a2.rotation.z = -1.0; g.add(a2);
  const head = new THREE.Group(); head.position.set(0.11, 0.44, 0); head.rotation.z = 0.55; g.add(head);
  const shade = mesh(new THREE.ConeGeometry(0.085, 0.12, 8, 1, true), M.ember()); shade.material.side = THREE.DoubleSide; head.add(shade);
  const bulb = mesh(new THREE.IcosahedronGeometry(0.035, 1), M.emberGlow(), false); bulb.position.y = -0.04; head.add(bulb);
  g.userData = { head, bulb };
  return g;
}

// ---- controller. Origin = centre.
export function buildController() {
  const g = new THREE.Group(); g.name = 'controller';
  const body = mesh(new RoundedBoxGeometry(0.15, 0.035, 0.075, 2, 0.015), M.ink()); g.add(body);
  for (const s of [-1, 1]) {
    const grip = mesh(new THREE.CylinderGeometry(0.026, 0.02, 0.07, 7), M.ink());
    grip.position.set(s * 0.058, -0.004, 0.04); grip.rotation.x = Math.PI / 2 - 0.3; grip.rotation.z = s * 0.25; g.add(grip);
  }
  const dpadH = mesh(new THREE.BoxGeometry(0.03, 0.008, 0.009), M.tealGlow(), false); dpadH.position.set(-0.04, 0.019, 0); g.add(dpadH);
  const dpadV = mesh(new THREE.BoxGeometry(0.009, 0.008, 0.03), M.tealGlow(), false); dpadV.position.set(-0.04, 0.019, 0); g.add(dpadV);
  const b1 = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.008, 6), M.clayGlow(), false); b1.position.set(0.04, 0.019, -0.008); g.add(b1);
  const b2 = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.008, 6), M.emberGlow(), false); b2.position.set(0.055, 0.019, 0.007); g.add(b2);
  return g;
}

export function buildHeadset() {
  const g = new THREE.Group(); g.name = 'headset';
  const band = mesh(new THREE.TorusGeometry(0.1, 0.014, 5, 14, Math.PI), M.rubber()); g.add(band);
  for (const s of [-1, 1]) {
    const cup = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 8), M.rubber());
    cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.1, -0.01, 0); g.add(cup);
    const ring = mesh(new THREE.TorusGeometry(0.036, 0.008, 4, 10), M.tealGlow(), false);
    ring.rotation.y = Math.PI / 2; ring.position.set(s * 0.122, -0.01, 0); g.add(ring);
  }
  return g;
}

export function buildMug() {
  const g = new THREE.Group(); g.name = 'mug';
  const cup = mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.1, 9), M.teal()); cup.position.y = 0.05; g.add(cup);
  const handle = mesh(new THREE.TorusGeometry(0.025, 0.008, 4, 8, Math.PI), M.teal());
  handle.rotation.z = -Math.PI / 2; handle.position.set(0.04, 0.05, 0); g.add(handle);
  const cocoa = mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.005, 9), M.mouth()); cocoa.position.y = 0.092; g.add(cocoa);
  return g;
}
