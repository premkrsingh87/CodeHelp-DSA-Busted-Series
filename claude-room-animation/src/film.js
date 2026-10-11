// "Continue?" — scenes, timeline, cameras, overlays. render(t) draws frame t with no stored state.
import * as THREE from 'three';
import { P, mix } from './palette.js';
import { clamp, lerp, inOut, sine, span, hash, outCubic } from './ease.js';
import { makeStage } from './stage.js';
import { buildRoom, paintSky, buildChair, DESK, WINDOW } from './room.js';
import { buildClaude, poseClaude } from './claude-pet.js';
import { buildKai, poseKai } from './kai.js';
import { buildMonitor, paintMonitor, screenGameOver, buildLamp, buildController, buildMug } from './props.js';
import { M, mesh } from './materials.js';
import { rrect } from './draw2d.js';

export const DURATION = 88;

// ---------------------------------------------------------------- dialogue
const CPS = 17;
const RAW_LINES = [
  ['kai', 13.0, 20.0, "Hey… do you think I'll still be playing games when I'm grown up?"],
  ['claude', 21.0, 27.0, "Maybe. Or maybe you'll be the one making them."],
  ['kai', 28.0, 33.2, "Will you still be here… when I'm grown up?"],
  ['claude', 34.0, 42.2, "I'll be different. You'll be different too. That's how growing works."],
  ['kai', 43.8, 48.2, "That's kind of scary."],
  ['claude', 49.0, 57.2, "The future always is, a little. But you won't walk into it alone."],
  ['kai', 58.6, 61.8, 'Promise?'],
  ['claude', 72.0, 77.0, "Whatever you build out there… build it kind."],
  ['kai', 77.4, 79.6, 'Deal.'],
];
export const LINES = RAW_LINES.map(([who, start, end, text]) => {
  const charT = []; let tt = start;
  for (const ch of text) {
    charT.push(tt);
    tt += 1 / CPS;
    if ('.?!…'.includes(ch)) tt += 0.38;
    else if (ch === ',') tt += 0.18;
  }
  const words = [];
  [...text].forEach((ch, i) => { if (ch !== ' ' && (i === 0 || text[i - 1] === ' ')) words.push({ t: charT[i], len: text.slice(i).split(' ')[0].length }); });
  return { who, start, end, text, charT, words };
});

// ---------------------------------------------------------------- timeline helpers
// keys: [[t, v], ...] numeric, eased between keys
function track(t, keys, e = inOut) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const k = e((t - t0) / Math.max(1e-6, t1 - t0));
      return Array.isArray(v0) ? v0.map((a, j) => lerp(a, v1[j], k)) : lerp(v0, v1, k);
    }
  }
  return keys[keys.length - 1][1];
}
// step keys: [[t, value], ...]
const step = (t, keys) => { let v = keys[0][1]; for (const [k, val] of keys) if (t >= k) v = val; return v; };

function blinkAt(t, seed) {
  let bt = 1.3 + hash(seed) * 2;
  for (let i = 0; i < 40 && bt < t + 1; i++) {
    const d = t - bt;
    if (d >= 0 && d < 0.16) return Math.sin((d / 0.16) * Math.PI);
    bt += 3 + hash(seed + i * 7.3) * 1.8;
  }
  return 0;
}
// speech envelope for a speaker: syllable-ish pulses on word onsets
function speech(t, who) {
  let v = 0;
  for (const L of LINES) {
    if (L.who !== who || t < L.start - 0.1 || t > L.end) continue;
    for (const w of L.words) {
      const d = t - w.t, dur = 0.09 + w.len * 0.045;
      if (d >= 0 && d < dur) v = Math.max(v, Math.sin((d / dur) * Math.PI) * (0.65 + 0.35 * Math.abs(Math.sin(d * 38))));
    }
  }
  return v;
}

// ---------------------------------------------------------------- shots
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const SHOTS = [
  { t0: 0, t1: 7.0, p: [V(0.3, 1.5, -0.7), V(0.15, 1.2, 2.4)], l: [V(0.15, 1.45, -1.5), V(0.3, 0.98, -0.5)], fov: [40, 34] },
  { t0: 7.0, t1: 12.6, p: [V(0.15, 1.2, 2.4), V(0.2, 1.12, 1.95)], l: [V(0.3, 0.98, -0.5), V(0.28, 0.95, -0.45)], fov: [34, 33] },
  { t0: 12.6, t1: 20.6, p: [V(1.0, 1.08, 0.78), V(0.92, 1.07, 0.64)], l: [V(-0.14, 1.03, -0.22), V(-0.14, 1.04, -0.22)], fov: [30, 28] },
  { t0: 20.6, t1: 27.6, p: [V(-0.28, 1.02, 0.8), V(-0.2, 1.0, 0.64)], l: [V(0.62, 0.9, -0.32), V(0.62, 0.9, -0.32)], fov: [30, 27] },
  { t0: 27.6, t1: 33.6, p: [V(0.6, 1.1, 0.48), V(0.5, 1.09, 0.38)], l: [V(-0.14, 1.05, -0.24), V(-0.14, 1.05, -0.24)], fov: [26, 24] },
  { t0: 33.6, t1: 42.6, p: [V(0.02, 0.98, 0.42), V(0.1, 0.96, 0.3)], l: [V(0.64, 0.9, -0.32), V(0.64, 0.9, -0.32)], fov: [26, 23] },
  { t0: 42.6, t1: 48.6, p: [V(0.95, 1.28, 1.05), V(0.88, 1.25, 0.9)], l: [V(-0.05, 1.18, -0.85), V(-0.05, 1.2, -0.9)], fov: [33, 31] },
  { t0: 48.6, t1: 57.6, p: [V(0.25, 1.12, 1.5), V(0.25, 1.06, 1.18)], l: [V(0.25, 0.94, -0.28), V(0.27, 0.94, -0.26)], fov: [30, 29] },
  { t0: 57.6, t1: 64.6, p: [V(0.2, 1.08, 1.05), V(0.2, 1.04, 0.86)], l: [V(0.23, 0.95, -0.25), V(0.25, 0.93, -0.24)], fov: [30, 25] },
  { t0: 64.6, t1: 71.6, p: [V(0.1, 1.25, 2.5), V(0.1, 1.2, 2.15)], l: [V(0.12, 1.15, -1.0), V(0.12, 1.2, -1.1)], fov: [34, 33] },
  { t0: 71.6, t1: 79.8, p: [V(0.3, 1.06, 1.08), V(0.28, 1.03, 0.92)], l: [V(0.22, 0.95, -0.28), V(0.22, 0.95, -0.28)], fov: [30, 28] },
  { t0: 79.8, t1: 82.6, p: [V(-0.62, 1.3, 0.3), V(-0.55, 1.27, 0.2)], l: [V(1.0, 1.0, -0.42), V(1.1, 1.02, -0.44)], fov: [30, 28] },
  { t0: 82.6, t1: 88, p: [V(0.28, 1.08, 1.0), V(0.1, 1.32, 2.7)], l: [V(0.3, 0.95, -0.3), V(0.2, 1.05, -0.6)], fov: [30, 34] },
];
function cameraAt(t) {
  const s = SHOTS.find((x) => t >= x.t0 && t < x.t1) || SHOTS[SHOTS.length - 1];
  const k = inOut((t - s.t0) / (s.t1 - s.t0));
  const p = s.p[0].clone().lerp(s.p[1], k), l = s.l[0].clone().lerp(s.l[1], k);
  // gentle handheld breathing
  p.x += Math.sin(t * 0.71) * 0.004; p.y += Math.sin(t * 0.93 + 1.3) * 0.003;
  l.x += Math.sin(t * 0.52 + 2) * 0.003;
  return { p, l, fov: lerp(s.fov[0], s.fov[1], k), shot: SHOTS.indexOf(s) };
}

// ---------------------------------------------------------------- tracks
const KAI_EXPR = [[0, 'neutral'], [13, 'wistful'], [21.6, 'smile'], [25.6, 'neutral'], [28, 'worried'], [38.6, 'wistful'], [49.4, 'neutral'], [53.6, 'hopeful'], [61.4, 'smile'], [65.6, 'hopeful'], [72, 'neutral'], [74.6, 'smile']];
const CLAUDE_EXPR = [[0, 'neutral'], [16.4, 'think'], [21.0, 'neutral'], [22.8, 'happy'], [25.4, 'neutral'], [30.2, 'sad'], [34, 'neutral'], [36.6, 'think'], [39.6, 'peace'], [43.8, 'sad'], [49, 'neutral'], [52.8, 'peace'], [55.6, 'neutral'], [58.8, 'wonder'], [60.5, 'happy'], [64.2, 'peace'], [66, 'wonder'], [72, 'neutral'], [74.6, 'happy']];

const SWIVEL = [[0, 1.12], [42.8, 1.12], [44.4, 1.72], [48.8, 1.72], [50.3, 1.12], [64.6, 1.12], [66.4, 2.05], [70.9, 2.05], [72.4, 1.12]];
const KAI_HEADYAW = [[0, 0], [43.4, 0], [44.8, 0.55], [48.6, 0.55], [49.8, 0], [65.2, 0], [66.8, 0.45], [70.6, 0.45], [71.9, 0]];
const KAI_LEAN = [[0, 0.04], [12.6, 0.1], [27.6, 0.0], [34, -0.02], [49.5, 0.08], [57.6, 0.15], [64.4, 0.04], [72, 0.1], [80, 0.06]];
const KAI_NOD = [[0, 0], [28.2, 0], [29.2, 0.45], [32.6, 0.45], [33.6, 0.1], [38.6, 0.1], [40, 0.4], [42.4, 0.4], [43.4, 0], [77.4, 0], [77.8, 0.5], [78.3, 0]];
const KAI_BLUSH = [[0, 0], [60.8, 0], [61.8, 0.9], [69, 0.6], [72, 0], [74.4, 0], [75.4, 0.8], [88, 0.8]];

const CL_POS = [[0, [0.66, -0.36]], [49.6, [0.66, -0.36]], [54.6, [0.5, -0.24]]];
const CL_YAW = [[0, 1.5], [11.0, 1.5], [12.3, -1.07], [65.0, -1.07], [66.6, -2.25], [70.6, -2.25], [72.1, -1.07]];
const CL_BLUSH = [[0, 0], [60.4, 0], [61.0, 1], [69, 0.7], [72, 0], [74.4, 0], [75.2, 1], [88, 1]];

const POSE = {
  hold: { fwd: 0.66, out: 0.02, bend: 1.08 },
  rest: { fwd: 0.44, out: 0.1, bend: 0.66 },
};
const mixPose = (a, b, k) => ({ fwd: lerp(a.fwd, b.fwd, k), out: lerp(a.out, b.out, k), bend: lerp(a.bend, b.bend, k), twist: 0 });

// ---------------------------------------------------------------- world
let W = null;

export async function init(width, height) {
  const stage = makeStage(width, height, { bloom: 0.7, bloomRadius: 0.6, threshold: 1.5 });
  const { scene } = stage;
  scene.background = new THREE.Color('#0f0d1d');
  scene.fog = new THREE.Fog('#141126', 4, 9);
  scene.environmentIntensity = 0.22;

  const room = buildRoom(); scene.add(room);

  const swivel = new THREE.Group(); swivel.position.set(-0.18, 0, -0.26); scene.add(swivel);
  const chair = buildChair(); swivel.add(chair);
  const kai = buildKai(); swivel.add(kai);

  const claude = buildClaude(); scene.add(claude);

  const mon = buildMonitor(); mon.position.set(1.22, DESK.top, -0.44); mon.rotation.y = -Math.PI / 2 + 0.22; scene.add(mon);
  const lamp = buildLamp(); lamp.position.set(0.98, DESK.top, -1.0); lamp.rotation.y = -2.1; scene.add(lamp);
  const mug = buildMug(); mug.position.set(1.0, DESK.top, 0.02); scene.add(mug);
  const pad = buildController(); scene.add(pad);

  // lights
  const hemi = new THREE.HemisphereLight('#5d4d82', P.ink, 0.55); scene.add(hemi);
  const key = new THREE.SpotLight('#ffc596', 9, 0, 0.75, 0.85, 1.3);
  key.position.set(-1.6, 2.5, 1.6); key.target.position.set(0.25, 0.9, -0.3);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02; key.shadow.radius = 5;
  scene.add(key, key.target);
  const lampLight = new THREE.SpotLight(P.ember, 1.6, 3, 1.0, 0.9, 2);
  scene.add(lampLight, lampLight.target);
  const monLight = new THREE.PointLight(P.teal, 2.6, 2.8, 1.4); monLight.position.set(1.05, 1.05, -0.38); scene.add(monLight);
  const winLight = new THREE.DirectionalLight('#8a8cff', 0.55); winLight.position.set(0.05, 1.8, -3); winLight.target.position.set(0, 0.6, 0); scene.add(winLight, winLight.target);
  const fairy = new THREE.PointLight(P.ember, 0.8, 3, 1.5); fairy.position.set(-0.6, 2.1, -1.2); scene.add(fairy);
  const sparkLight = new THREE.PointLight(P.rose, 0, 1.2, 1.5); scene.add(sparkLight);

  // the spark where finger meets nub
  const spark = new THREE.Group(); scene.add(spark);
  const core = mesh(new THREE.IcosahedronGeometry(0.018, 1), M.roseGlow(), false); spark.add(core);
  const motes = [];
  for (let i = 0; i < 14; i++) { const m = mesh(new THREE.OctahedronGeometry(0.0055), i % 3 ? M.emberGlow() : M.roseGlow(), false); spark.add(m); motes.push(m); }

  W = { stage, scene, room, swivel, chair, kai, claude, mon, lamp, mug, pad, key, lampLight, monLight, winLight, hemi, fairy, sparkLight, spark, core, motes, width, height };
  // aim the lamp at the desk
  lamp.updateMatrixWorld(true);
  const bulbPos = lamp.userData.bulb.getWorldPosition(new THREE.Vector3());
  lampLight.target.position.set(0.7, DESK.top, -0.1);
  // sit the light just outside the shade so it never scorches the shade's inside
  lampLight.position.copy(bulbPos).lerp(lampLight.target.position, 0.22);
  return true;
}

// ---------------------------------------------------------------- per-frame posing
function poseWorld(t) {
  const { kai, claude, swivel, pad } = W;

  // Kai
  swivel.rotation.y = track(t, SWIVEL) - Math.PI / 2 + Math.PI / 2; // chair turns with him
  const breathe = Math.sin(t * Math.PI * 2 / 4.2);
  // arm phases
  let armL, armR;
  const putDown = span(t, 10.0, 11.4), pickUp = span(t, 79.9, 80.7);
  const holdK = t < 11.4 ? 1 - putDown : (t > 79.9 ? pickUp : 0);
  const base = mixPose(POSE.rest, POSE.hold, holdK);
  armL = { ...base }; armR = { ...base };
  // press YES: right thumb dip
  const press = t > 81.0 && t < 81.4 ? Math.sin(span(t, 81.0, 81.4, (x) => x) * Math.PI) : 0;
  armR.bend += press * 0.12;
  poseKai(kai, {
    yaw: 0, pose: 'sit', expr: step(t, KAI_EXPR), blink: blinkAt(t, 3),
    talk: speech(t, 'kai'), headYaw: track(t, KAI_HEADYAW), headNod: track(t, KAI_NOD),
    lookY: -track(t, KAI_NOD) * 0.8, lean: track(t, KAI_LEAN), blush: track(t, KAI_BLUSH),
    breathe, armL, armR,
  });

  // Claude position, walk hops, turn
  const [cx, cz] = track(t, CL_POS);
  const walking = t > 49.6 && t < 54.6;
  const stepPhase = walking ? (t - 49.6) * 2.4 : 0;
  const hopWalk = walking ? Math.abs(Math.sin(stepPhase * Math.PI)) * 0.014 : 0;
  claude.position.set(cx, DESK.top, cz);
  const turnHop = Math.sin(span(t, 11.0, 11.5, (x) => x) * Math.PI) * 0.025 * (t < 11.5 ? 1 : 0);
  const touchHop = t > 60.5 && t < 61.2 ? Math.sin(span(t, 60.5, 61.2, (x) => x) * Math.PI) * 0.018 : 0;
  const nod = t > 77.6 && t < 78.4 ? Math.sin(span(t, 77.6, 78.4, (x) => x) * Math.PI * 2) * 0.012 : 0;
  const cexpr = step(t, CLAUDE_EXPR);
  const sp = speech(t, 'claude');
  const anticip = t > 10.7 && t < 11.0 ? Math.sin(span(t, 10.7, 11.0, (x) => x) * Math.PI) : 0;
  const reach = span(t, 59.4, 60.4) * (1 - span(t, 63.0, 64.2));
  poseClaude(claude, {
    yaw: track(t, CL_YAW), expr: cexpr, blink: cexpr === 'happy' || cexpr === 'peace' ? 0 : blinkAt(t, 11),
    squash: (cexpr === 'sad' ? 0.7 : 0) + anticip * 0.8 + sp * 0.25 - turnHop * 10 + Math.sin(t * Math.PI * 2 / 3.6) * 0.12,
    hop: turnHop + hopWalk + touchHop + Math.abs(nod),
    lookY: cexpr === 'sad' ? -0.6 : (cexpr === 'think' ? 0.8 : 0), lookX: cexpr === 'think' ? 0.6 : 0,
    armL: (cexpr === 'happy' ? 0.25 : 0) + (walking ? Math.max(0, Math.sin(stepPhase * Math.PI)) * 0.25 : 0),
    armR: (cexpr === 'happy' ? 0.25 : 0) + reach * 0.35 + (walking ? Math.max(0, -Math.sin(stepPhase * Math.PI)) * 0.25 : 0),
    reachR: reach, blush: track(t, CL_BLUSH), glow: sp * 0.8 + (t > 60.4 && t < 64 ? 0.6 * (1 - span(t, 60.4, 64)) : 0),
    tilt: cexpr === 'think' ? 0.06 : 0,
  });

  W.scene.updateMatrixWorld(true);

  // Kai's finger reaches for Claude's nub (solved each frame, so it always lands)
  const pointK = span(t, 58.0, 59.8) * (1 - span(t, 63.2, 64.6));
  let contact = null;
  if (pointK > 0) {
    const nub = new THREE.Vector3();
    claude.userData.arms[1].pivot.children[0].getWorldPosition(nub);
    nub.y += 0.005;
    const tipOf = (o) => {
      poseKai(kai, { ...lastKai(t, o) });
      kai.updateMatrixWorld(true);
      const tip = new THREE.Vector3(); kai.userData.arms[0].finger.children[0].getWorldPosition(tip); return tip;
    };
    let best = { fwd: 1.4, out: -0.2, bend: 0.12 }, bd = 1e9;
    for (const fwd of [1.1, 1.25, 1.4, 1.55, 1.7]) for (const out of [-0.5, -0.3, -0.1, 0.1]) {
      const d = tipOf({ fwd, out, bend: 0.12 }).distanceTo(nub); if (d < bd) { bd = d; best = { fwd, out, bend: 0.12 }; }
    }
    for (let it = 0; it < 3; it++) for (const [df, dout, db] of [[0.06, 0, 0], [-0.06, 0, 0], [0, 0.06, 0], [0, -0.06, 0], [0, 0, 0.08], [0, 0, -0.08]]) {
      const c = { fwd: best.fwd + df / (it + 1), out: best.out + dout / (it + 1), bend: Math.max(0, best.bend + db / (it + 1)) };
      const d = tipOf(c).distanceTo(nub); if (d < bd) { bd = d; best = c; }
    }
    // hover a little short of contact until the touch beat
    const touch = span(t, 59.8, 60.4) * (1 - span(t, 62.8, 63.4));
    const shy = { fwd: best.fwd - 0.12 * (1 - touch), out: best.out, bend: best.bend + 0.1 * (1 - touch) };
    const pose = mixPose(armL, shy, pointK);
    poseKai(kai, { ...lastKai(t, { ...pose, point: pointK > 0.3 }) });
    W.scene.updateMatrixWorld(true);
    contact = nub;
  }

  // controller: in hands, or resting on the desk
  const hands = kai.userData.arms.map((a) => a.hand.getWorldPosition(new THREE.Vector3()));
  const inHands = hands[0].clone().add(hands[1]).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.03, 0));
  const onDesk = new THREE.Vector3(0.42, DESK.top + 0.022, 0.02);
  const k = t < 11.4 ? putDown : (t > 79.9 ? 1 - pickUp : 1);
  pad.position.copy(inHands.clone().lerp(onDesk, k));
  pad.position.y += Math.sin(k * Math.PI) * 0.06 - press * 0.006;
  pad.rotation.set(lerp(0.55, 0, k), lerp(swivel.rotation.y, 0.4, k), 0);
  return { contact };
}

// re-pose Kai with an overridden right-hand (camera side) arm
function lastKai(t, armLOverride) {
  const breathe = Math.sin(t * Math.PI * 2 / 4.2);
  return {
    yaw: 0, pose: 'sit', expr: step(t, KAI_EXPR), blink: blinkAt(t, 3),
    talk: speech(t, 'kai'), headYaw: track(t, KAI_HEADYAW), headNod: track(t, KAI_NOD),
    lookY: -track(t, KAI_NOD) * 0.8, lean: track(t, KAI_LEAN), blush: track(t, KAI_BLUSH), breathe,
    armL: armLOverride, armR: POSE.rest,
  };
}

function lightWorld(t, contact) {
  const dawn = span(t, 64.6, 70.5, sine);
  const rain = 1 - span(t, 63.5, 68.5, sine);
  paintSky(W.room, t, rain, dawn);
  W.winLight.color.set(mix('#8a8cff', '#ffb38a', dawn));
  W.winLight.intensity = lerp(0.55, 2.4, dawn);
  W.hemi.intensity = lerp(0.55, 0.85, dawn);
  W.hemi.color.set(mix('#5d4d82', '#c98a96', dawn));
  W.fairy.intensity = 0.8 + 0.15 * Math.sin(t * 1.3);

  // monitor
  const yes = t > 81.2;
  paintMonitor(W.mon, (c, w, h) => {
    if (!yes) screenGameOver(c, w, h, t, { pulse: 0.5 + 0.5 * Math.sin(t * 2.2), select: 0, dawn: 0 });
    else screenGameOver(c, w, h, t, { title: 'NEW GAME+', sub: 'a new adventure begins', select: -1, pulse: 1, dawn: span(t, 81.2, 83) });
  });
  const flash = t > 81.2 ? Math.exp(-(t - 81.2) * 3) : 0;
  W.mon.userData.screenMat.emissiveIntensity = 1.25 + flash * 2.5;
  W.monLight.intensity = 2.6 + flash * 6 - dawn * 0.8;

  // spark
  const sparkK = t > 60.3 && t < 64.6 ? Math.exp(-(t - 60.3) * 0.9) * span(t, 60.3, 60.45, (x) => x) : 0;
  const bloomT = span(t, 63.8, 64.6, (x) => x * x) * (1 - span(t, 64.6, 65.4));
  W.spark.visible = sparkK > 0.01 && !!contact;
  if (contact) {
    W.spark.position.copy(contact);
    W.core.scale.setScalar(0.4 + sparkK * 1.4 + bloomT * 3);
    W.motes.forEach((m, i) => {
      const a = i * 2.399, r = 0.02 + (t - 60.3) * (0.02 + hash(i) * 0.03);
      m.position.set(Math.cos(a) * r, (t - 60.3) * (0.02 + hash(i + 5) * 0.04), Math.sin(a) * r);
      m.rotation.set(t * 2 + i, t * 3, 0);
      m.visible = t > 60.3;
    });
    W.sparkLight.position.copy(contact);
  }
  W.sparkLight.intensity = sparkK * 3.5;
  return { dawn, rain };
}

// ---------------------------------------------------------------- 2D overlays
function overlay(ctx, t, cam) {
  const w = 1920, h = 1080;
  // vignette
  const vg = ctx.createRadialGradient(w * 0.5, h * 0.48, h * 0.35, w * 0.5, h * 0.5, h * 1.0);
  vg.addColorStop(0, 'rgba(10,8,20,0)'); vg.addColorStop(1, 'rgba(10,8,20,0.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
  // letterbox
  ctx.fillStyle = P.ink; ctx.fillRect(0, 0, w, 58); ctx.fillRect(0, h - 58, w, 58);

  // title card
  const tk = span(t, 1.8, 3.0) * (1 - span(t, 5.6, 6.6));
  if (tk > 0) {
    ctx.save(); ctx.globalAlpha = tk;
    const y = 640 + (1 - tk) * 18;
    ctx.fillStyle = 'rgba(15,13,29,0.55)'; rrect(ctx, 120, y - 128, 610, 190, 18); ctx.fill();
    ctx.fillStyle = P.paper; ctx.textAlign = 'left'; ctx.font = '600 118px Fraunces';
    ctx.fillText('Continue?', 156, y);
    ctx.font = '700 20px Nunito'; ctx.fillStyle = P.ember;
    ctx.fillText('A  SHORT  FILM  ABOUT  WHAT  COMES  NEXT', 160, y + 42);
    ctx.restore();
  }

  // dialogue cards: Kai's on the left, Claude's on the right
  for (const L of LINES) {
    const a = span(t, L.start - 0.35, L.start + 0.05) * (1 - span(t, L.end - 0.4, L.end));
    if (a <= 0) continue;
    const n = L.charT.filter((x) => x <= t).length;
    drawLine(ctx, L, n, a);
  }

  // bloom transition into dawn
  const flare = span(t, 63.9, 64.6, (x) => x * x) * (1 - span(t, 64.6, 65.6, outCubic));
  if (flare > 0) {
    const g = ctx.createRadialGradient(w * 0.52, h * 0.5, 0, w * 0.52, h * 0.5, w * 0.75);
    g.addColorStop(0, `rgba(255,236,220,${flare})`); g.addColorStop(0.5, `rgba(229,154,160,${flare * 0.9})`); g.addColorStop(1, `rgba(242,166,90,${flare * 0.75})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  // iris in (open) and iris out (close on the two of them)
  const irisOpen = span(t, 0.0, 1.8, sine);
  const irisClose = 1 - span(t, 84.4, 86.0, inOut);
  const iris = Math.min(irisOpen, irisClose);
  if (iris < 1) {
    let cx = w / 2, cy = h / 2;
    if (t > 80) {
      const pnt = new THREE.Vector3(0.2, 0.98, -0.28).project(cam);
      cx = (pnt.x * 0.5 + 0.5) * w; cy = (-pnt.y * 0.5 + 0.5) * h;
    }
    const R = Math.hypot(w, h) * 0.62 * iris;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.arc(cx, cy, Math.max(0.01, R), 0, Math.PI * 2, true);
    ctx.fillStyle = '#07060e'; ctx.fill('evenodd');
    if (R > 2) { ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(242,166,90,0.5)'; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.restore();
  }
  // end card
  const ek = span(t, 86.0, 86.9);
  if (ek > 0) {
    ctx.fillStyle = '#07060e'; ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = ek;
    ctx.fillStyle = P.paper; ctx.textAlign = 'left'; ctx.font = '600 110px Fraunces';
    ctx.fillText('Continue.', 180, 560);
    ctx.font = '700 19px Nunito'; ctx.fillStyle = P.ember;
    ctx.fillText('KAI  &  CLAUDE   ·   EVERY FRAME DRAWN IN CODE, EVERY SOUND SYNTHESIZED', 186, 612);
    ctx.globalAlpha = 1;
  }
}

function wrap(ctx, text, maxW) {
  const words = text.split(' '); const lines = []; let cur = '';
  for (const wd of words) { const test = cur ? cur + ' ' + wd : wd; if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = test; }
  if (cur) lines.push(cur);
  return lines;
}

function drawLine(ctx, L, n, a) {
  const isKai = L.who === 'kai';
  ctx.save();
  ctx.font = '600 40px Nunito';
  const maxW = 760;
  const all = wrap(ctx, L.text, maxW);
  const widest = Math.max(...all.map((s) => ctx.measureText(s).width));
  const cw = Math.max(widest, 220) + 76, ch = 88 + all.length * 54;
  const x = isKai ? 110 : 1920 - 110 - cw, y = 1080 - 92 - ch + (1 - a) * 14;
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(17,15,32,0.82)'; rrect(ctx, x, y, cw, ch, 18); ctx.fill();
  ctx.strokeStyle = 'rgba(244,235,221,0.12)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = isKai ? P.moss : P.clay; rrect(ctx, x, y + 18, 6, ch - 36, 3); ctx.fill();
  ctx.font = 'italic 600 27px Fraunces'; ctx.fillStyle = isKai ? '#9cc39f' : '#f0997a'; ctx.textAlign = 'left';
  ctx.fillText(isKai ? 'Kai' : 'Claude', x + 38, y + 48);
  ctx.font = '600 40px Nunito'; ctx.fillStyle = P.paper;
  // type-on: reveal n characters across the wrapped lines
  let left = n;
  all.forEach((line, i) => {
    const shown = line.slice(0, Math.max(0, left)); left -= line.length + 1;
    ctx.fillText(shown, x + 38, y + 100 + i * 54);
  });
  ctx.restore();
}

// ---------------------------------------------------------------- render
export function render(ctx, t) {
  const { contact } = poseWorld(t);
  lightWorld(t, contact);
  const cam = cameraAt(t);
  const camera = W.stage.camera;
  camera.position.copy(cam.p); camera.fov = cam.fov; camera.aspect = W.width / W.height; camera.updateProjectionMatrix();
  camera.lookAt(cam.l);
  const img = W.stage.render();
  const sx = ctx.canvas.width / 1920;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(sx, 0, 0, sx, 0, 0);
  overlay(ctx, t, camera);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------------------------------------------------------------- events for the soundtrack
export function events() {
  const sfx = [
    { t: 1.9, name: 'title' },
    { t: 10.9, name: 'clack' },
    { t: 11.0, name: 'hop' },
    { t: 12.2, name: 'turn' },
    { t: 42.8, name: 'chair' }, { t: 49.0, name: 'chair' }, { t: 64.7, name: 'chair' }, { t: 71.0, name: 'chair' },
    { t: 58.0, name: 'reach' },
    { t: 60.35, name: 'touch' },
    { t: 63.9, name: 'swell' },
    { t: 79.95, name: 'pickup' },
    { t: 81.1, name: 'click' },
    { t: 81.25, name: 'newgame' },
    { t: 84.4, name: 'iris' },
    { t: 86.0, name: 'end' },
  ];
  for (let s = 0; s < 12; s++) { const tt = 49.6 + s / 2.4; if (tt < 54.6) sfx.push({ t: tt, name: 'step' }); }
  const blips = [];
  for (const L of LINES) for (const w of L.words) blips.push({ t: w.t, who: L.who, len: w.len });
  return {
    duration: DURATION,
    lines: LINES.map(({ who, start, end, text }) => ({ who, start, end, text })),
    blips, sfx,
    rain: [[0, 1], [63.5, 1], [68.5, 0]],
    scenes: [
      { t: 0, lead: 'musicbox' }, { t: 12.6, lead: 'epiano' }, { t: 33.6, lead: 'felt' },
      { t: 57.6, lead: 'glass' }, { t: 64.6, lead: 'warm' }, { t: 79.8, lead: 'musicbox' },
    ],
    shots: SHOTS.map((s) => s.t0),
  };
}
