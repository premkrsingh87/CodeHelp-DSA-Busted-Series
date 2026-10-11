// Gate 1 character sheet (3D low-poly). Each cell is a real WebGL render pasted onto a 2D sheet.
import * as THREE from 'three';
import { P, mix } from './palette.js';
import { makeStage, addRig, addFloor } from './stage.js';
import { buildClaude, poseClaude } from './claude-pet.js';
import { buildKai, poseKai } from './kai.js';
import { buildMonitor, paintMonitor, screenGameOver, buildLamp, buildController, buildHeadset, buildMug } from './props.js';
import { rrect } from './draw2d.js';

const VIEWS = [['Front', 0], ['Three-quarter', -Math.PI / 4], ['Side', -Math.PI / 2], ['Back', Math.PI]];

function label(ctx, text, x, y, size = 14, align = 'center', alpha = 0.7, col = P.paper) {
  ctx.fillStyle = col; ctx.globalAlpha = alpha; ctx.textAlign = align;
  ctx.font = `700 ${size}px Nunito`; ctx.fillText(text.toUpperCase(), x, y); ctx.globalAlpha = 1;
}
function heading(ctx, text, x, y, size = 30) {
  ctx.fillStyle = P.paper; ctx.textAlign = 'left'; ctx.font = `italic 600 ${size}px Fraunces`; ctx.fillText(text, x, y);
}

export function renderSheet(ctx) {
  const W = 1920, H = 1080;
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#16152a'); bg.addColorStop(1, '#2a2140');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

  const st = makeStage(320, 320);
  const { scene, camera } = st;
  scene.background = new THREE.Color('#231d38');
  addRig(scene);
  const floor = addFloor(scene, 4);

  const claude = buildClaude(); scene.add(claude);
  const kai = buildKai(); scene.add(kai);
  const props = new THREE.Group(); scene.add(props);
  const mon = buildMonitor(); paintMonitor(mon, (c, w, h) => screenGameOver(c, w, h, 0));
  mon.position.set(-0.78, 0, 0); mon.rotation.y = 0.25; mon.scale.setScalar(0.8);
  const lamp = buildLamp(); lamp.position.set(-0.28, 0, 0);
  const pad = buildController(); pad.position.set(0.05, 0.04, 0.05); pad.rotation.x = 0.5;
  const hs = buildHeadset(); hs.position.set(0.36, 0.12, 0); hs.rotation.y = 0.5;
  const mug = buildMug(); mug.position.set(0.65, 0, 0);
  props.add(mon, lamp, pad, hs, mug);

  const show = (who) => { claude.visible = who === 'claude'; kai.visible = who === 'kai'; props.visible = who === 'props'; };
  const cell = (x, y, w, h, camPos, look, r = 14) => {
    st.setSize(w, h);
    camera.position.set(...camPos); camera.lookAt(...look);
    const img = st.render();
    ctx.save(); rrect(ctx, x, y, w, h, r); ctx.clip(); ctx.drawImage(img, x, y, w, h); ctx.restore();
    ctx.strokeStyle = 'rgba(244,235,221,0.12)'; ctx.lineWidth = 1.5; rrect(ctx, x, y, w, h, r); ctx.stroke();
  };

  // header
  ctx.fillStyle = P.paper; ctx.textAlign = 'left'; ctx.font = '600 44px Fraunces';
  ctx.fillText('Continue?', 40, 62);
  label(ctx, 'Character sheet  ·  low-poly 3D  ·  a boy, his gaming room, and Claude in pet form', 262, 58, 15, 'left', 0.6);

  // --- Claude turnaround
  heading(ctx, 'Claude — pet form', 40, 124);
  label(ctx, 'faceted clay body · no mouth · glossy eyes · arm nubs · four stubby legs', 330, 122, 12, 'left', 0.5);
  show('claude');
  VIEWS.forEach(([name, yaw], i) => {
    poseClaude(claude, { yaw });
    const x = 40 + i * 278;
    cell(x, 142, 262, 232, [0.0, 0.34, 1.3], [0, 0.17, 0]);
    label(ctx, name, x + 131, 398);
  });

  // --- Kai turnaround
  heading(ctx, 'Kai, 12', 40, 452);
  label(ctx, 'moss hoodie · glowing headphones round his neck · spiky hair', 168, 450, 12, 'left', 0.5);
  show('kai');
  VIEWS.forEach(([name, yaw], i) => {
    poseKai(kai, { yaw });
    const x = 40 + i * 278;
    cell(x, 470, 262, 560, [0, 0.95, 3.6], [0, 0.74, 0]);
    label(ctx, name, x + 131, 1056);
  });

  // --- expressions
  heading(ctx, 'Expressions', 1180, 124);
  show('claude');
  const ce = [
    ['neutral', { expr: 'neutral' }],
    ['happy', { expr: 'happy', blush: 1, armL: 0.6, armR: 0.6, hop: 0.02 }],
    ['thinking', { expr: 'think', lookX: 1, lookY: 1, tilt: 0.08 }],
    ['sad', { expr: 'sad', squash: 1, lookY: -0.8 }],
    ['wonder', { expr: 'wonder', squash: -0.7 }],
  ];
  ce.forEach(([name, o], i) => {
    poseClaude(claude, { yaw: -0.25, ...o });
    const x = 1180 + i * 142;
    cell(x, 142, 130, 128, [0.0, 0.32, 0.95], [0, 0.18, 0], 12);
    label(ctx, name, x + 65, 290, 12);
  });
  show('kai');
  const ke = [
    ['neutral', { expr: 'neutral' }],
    ['smile', { expr: 'smile', blush: 1, headTilt: 0.08 }],
    ['wistful', { expr: 'wistful', lookY: -1, headNod: 0.6, headTilt: -0.1 }],
    ['worried', { expr: 'worried' }],
    ['hopeful', { expr: 'hopeful', lookY: 1, headNod: -0.5, blush: 0.6 }],
  ];
  ke.forEach(([name, o], i) => {
    poseKai(kai, { yaw: -0.3, ...o });
    const x = 1180 + i * 142;
    cell(x, 306, 130, 150, [0.0, 1.3, 0.95], [0, 1.27, 0], 12);
    label(ctx, name, x + 65, 476, 12);
  });

  // --- palette
  heading(ctx, 'Palette', 1180, 534, 26);
  const pal = [['Ink', P.ink], ['Dusk Plum', P.plum], ['Clay', P.clay], ['Ember', P.ember], ['Monitor Teal', P.teal], ['Paper', P.paper], ['Moss', P.moss], ['Dawn Rose', P.rose]];
  pal.forEach(([n, col], i) => {
    const x = 1180 + i * 88;
    ctx.fillStyle = col; rrect(ctx, x, 550, 76, 44, 8); ctx.fill();
    ctx.strokeStyle = 'rgba(244,235,221,0.25)'; ctx.lineWidth = 1.5; ctx.stroke();
    label(ctx, n, x, 614, 11, 'left', 0.8);
    ctx.font = '400 11px Nunito'; ctx.globalAlpha = 0.5; ctx.fillText(col, x, 629); ctx.globalAlpha = 1;
  });
  label(ctx, 'Type: Fraunces (titles) · Nunito (dialogue)  ·  Material: flat-shaded facets + clearcoat gloss + bloom on emissives', 1180, 654, 11, 'left', 0.55);

  // --- props
  heading(ctx, 'Props', 1180, 708, 26);
  show('props');
  cell(1180, 724, 700, 190, [-0.05, 0.42, 1.3], [-0.06, 0.2, 0]);
  [['monitor', 1262], ['lamp', 1440], ['controller', 1550], ['headset', 1666], ['mug', 1790]].forEach(([n, x]) => label(ctx, n, x, 934, 11));

  // --- rules
  heading(ctx, 'Rules', 1180, 978, 26);
  const rules = [
    '1  Claude never has a mouth: it emotes with eyes, squash, arm nubs and a glowing blush.',
    '2  Everything is low-poly: flat-shaded facets, never smooth-shaded spheres.',
    '3  Lamp key light upper-left (Ember); monitor rim light from the right (Teal). Only emissives bloom.',
    '4  Claude is as wide as Kai’s shoulders and sits on the desk at his eye level.',
    '5  Slow film: no move faster than 0.5 s, blink every 3–5 s, breathing never stops.',
  ];
  ctx.font = '600 13.5px Nunito'; ctx.fillStyle = P.paper; ctx.textAlign = 'left'; ctx.globalAlpha = 0.85;
  rules.forEach((r, i) => ctx.fillText(r, 1180, 1000 + i * 17.5));
  ctx.globalAlpha = 1;
  void floor; void mix;
}
