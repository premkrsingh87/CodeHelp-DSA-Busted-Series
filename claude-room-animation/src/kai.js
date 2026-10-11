// Kai, 12, low-poly 3D: faceted head, spiky glossy hair, moss hoodie, glowing headphones round his neck.
// Origin = floor between the feet. Faces +Z. Units are metres.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M, mesh } from './materials.js';

const HEAD_R = 0.16;
const HIP_Y = 0.62, THIGH = 0.28, SHIN = 0.27;
const SHOULDER_Y = 1.03, UPPER = 0.24, FORE = 0.22;
const Z = new THREE.Vector3(0, 0, 1);

// point on the head sphere: a = yaw angle around Y (0 = front), b = elevation
function onHead(a, b, r = HEAD_R) {
  return new THREE.Vector3(r * Math.sin(a) * Math.cos(b), r * Math.sin(b), r * Math.cos(a) * Math.cos(b));
}
function face(m, a, b, r = HEAD_R) {
  const p = onHead(a, b, r); m.position.copy(p);
  m.quaternion.setFromUnitVectors(Z, p.clone().normalize());
  return m;
}

function limb(r0, r1, len, mat, seg = 6) {
  const g = new THREE.CylinderGeometry(r0, r1, len, seg, 1);
  g.translate(0, -len / 2, 0);              // hangs down from its pivot
  return mesh(g, mat);
}

export function buildKai() {
  const root = new THREE.Group(); root.name = 'kai';
  const turn = new THREE.Group(); root.add(turn);
  const lower = new THREE.Group(); turn.add(lower);   // moves down when sitting

  // ---- legs
  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group(); hip.position.set(side * 0.075, HIP_Y, 0); lower.add(hip);
    hip.add(limb(0.064, 0.056, THIGH, M.denim()));
    const knee = new THREE.Group(); knee.position.y = -THIGH; hip.add(knee);
    knee.add(limb(0.056, 0.05, SHIN, M.denim()));
    const kneeCap = mesh(new THREE.IcosahedronGeometry(0.058, 0), M.denim()); knee.add(kneeCap);
    const ankle = new THREE.Group(); ankle.position.y = -SHIN; knee.add(ankle);
    const shoe = mesh(new RoundedBoxGeometry(0.1, 0.075, 0.19, 1, 0.025), M.paper());
    shoe.position.set(0, -0.035, 0.035); ankle.add(shoe);
    const sole = mesh(new THREE.BoxGeometry(0.104, 0.018, 0.192), M.clay());
    sole.position.set(0, -0.066, 0.035); ankle.add(sole);
    return { hip, knee, ankle };
  });

  // ---- upper body (lean pivots at the hips)
  const spine = new THREE.Group(); spine.position.y = HIP_Y - 0.02; lower.add(spine);
  const chest = new THREE.Group(); spine.add(chest);

  const torsoGeo = new THREE.CylinderGeometry(0.15, 0.185, 0.46, 7, 2);
  const torso = mesh(torsoGeo, M.moss()); torso.scale.z = 0.7; torso.position.y = 0.23; chest.add(torso);
  const hem = mesh(new THREE.CylinderGeometry(0.188, 0.188, 0.05, 7, 1), M.mossDark()); hem.scale.z = 0.71; hem.position.y = 0.02; chest.add(hem);
  const pocket = mesh(new RoundedBoxGeometry(0.2, 0.1, 0.03, 1, 0.01), M.mossDark());
  pocket.position.set(0, 0.12, 0.118); pocket.rotation.x = -0.08; chest.add(pocket);
  for (const sx of [-0.035, 0.035]) {
    const str = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.13, 4), M.paper());
    str.position.set(sx, 0.36, 0.105); str.rotation.x = -0.15; chest.add(str);
    const tip = mesh(new THREE.OctahedronGeometry(0.011), M.paper()); tip.position.set(sx, 0.295, 0.115); chest.add(tip);
  }
  const hood = mesh(new THREE.TorusGeometry(0.105, 0.05, 5, 9), M.mossDark());
  hood.rotation.x = Math.PI / 2 - 0.25; hood.position.set(0, 0.45, -0.025); chest.add(hood);
  const hoodBack = mesh(new THREE.IcosahedronGeometry(0.11, 0), M.mossDark());
  hoodBack.scale.set(1.15, 0.9, 0.55); hoodBack.position.set(0, 0.38, -0.115); chest.add(hoodBack);

  // headphones resting round the neck (glowing rings)
  const phones = new THREE.Group(); phones.position.set(0, 0.47, 0.01); chest.add(phones);
  const band = mesh(new THREE.TorusGeometry(0.12, 0.016, 5, 14, Math.PI), M.rubber());
  band.rotation.x = Math.PI / 2; band.rotation.z = Math.PI; phones.add(band);
  for (const side of [-1, 1]) {
    const cup = new THREE.Group(); cup.position.set(side * 0.115, -0.025, 0.035); cup.rotation.z = side * 0.35; cup.rotation.y = side * 0.5; phones.add(cup);
    const shell = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 8), M.rubber()); shell.rotation.z = Math.PI / 2; cup.add(shell);
    const ring = mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 10), M.tealGlow(), false);
    ring.rotation.y = Math.PI / 2; ring.position.x = side * 0.022; cup.add(ring);
  }

  // ---- neck + head
  const neck = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 6), M.skin()); neck.position.y = 0.5; chest.add(neck);
  const headPivot = new THREE.Group(); headPivot.position.y = 0.53; chest.add(headPivot);
  const head = new THREE.Group(); head.position.y = 0.15; headPivot.add(head);
  const skull = mesh(new THREE.IcosahedronGeometry(HEAD_R, 1), M.skin()); skull.scale.set(1, 1.0, 0.94); head.add(skull);
  const jaw = mesh(new THREE.IcosahedronGeometry(HEAD_R * 0.78, 1), M.skin()); jaw.position.set(0, -0.045, 0.02); jaw.scale.set(1, 0.85, 0.95); head.add(jaw);

  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.IcosahedronGeometry(0.04, 0), M.skin());
    ear.scale.set(0.5, 1, 0.8); ear.position.set(side * HEAD_R * 0.98, -0.005, -0.01); head.add(ear);
  }
  const nose = mesh(new THREE.TetrahedronGeometry(0.022), M.skin());
  face(nose, 0, -0.17, HEAD_R * 0.98); nose.rotateX(0.4); head.add(nose);

  // eyes, brows, mouth
  const eyes = [-1, 1].map((side) => {
    const g = new THREE.Group(); face(g, side * 0.4, -0.02, HEAD_R * 0.93); head.add(g);
    const ball = mesh(new THREE.IcosahedronGeometry(0.03, 1), M.eye(), false); ball.scale.set(0.82, 1.15, 0.5); g.add(ball);
    const gl = mesh(new THREE.IcosahedronGeometry(0.009, 0), M.glint(), false); gl.position.set(-0.008, 0.013, 0.016); g.add(gl);
    const gl2 = mesh(new THREE.IcosahedronGeometry(0.005, 0), M.glint(), false); gl2.position.set(0.009, -0.012, 0.016); g.add(gl2);
    const smile = mesh(new THREE.TorusGeometry(0.024, 0.007, 4, 8, Math.PI), M.eye(), false); smile.position.z = 0.008; g.add(smile);
    const lid = mesh(new THREE.IcosahedronGeometry(0.033, 1), M.skin(), false); lid.scale.set(0.95, 0.7, 0.55); lid.position.set(0, 0.03, 0.004); g.add(lid);
    const browPivot = new THREE.Group(); face(browPivot, side * 0.4, 0.2, HEAD_R * 0.99); head.add(browPivot);
    const brow = mesh(new RoundedBoxGeometry(0.058, 0.014, 0.014, 1, 0.005), M.hair(), false); browPivot.add(brow);
    const blush = mesh(new THREE.IcosahedronGeometry(0.025, 0), M.blush(), false);
    face(blush, side * 0.62, -0.2, HEAD_R * 0.95); blush.scale.set(1.2, 0.65, 0.3); head.add(blush);
    return { side, g, ball, gl, gl2, smile, lid, browPivot, brow, blush };
  });
  const mouthG = new THREE.Group(); face(mouthG, 0, -0.42, HEAD_R * 0.95); head.add(mouthG);
  const smileArc = mesh(new THREE.TorusGeometry(0.028, 0.0065, 4, 8, Math.PI), M.mouth(), false);
  smileArc.rotation.z = Math.PI; mouthG.add(smileArc);
  const open = mesh(new THREE.IcosahedronGeometry(0.024, 1), M.mouth(), false); open.scale.set(1.1, 0.6, 0.35); mouthG.add(open);

  // hair: faceted cap + spikes + fringe
  const hair = new THREE.Group(); head.add(hair);
  const cap = mesh(new THREE.SphereGeometry(HEAD_R * 1.08, 9, 6, 0, Math.PI * 2, 0, 1.95), M.hair());
  cap.rotation.x = -0.75; cap.position.set(0, 0.01, -0.01); hair.add(cap);
  const spikeGeo = new THREE.ConeGeometry(0.05, 0.13, 4);
  const spikes = [
    [0, 1.25, 1.0], [0.6, 1.0, 0.95], [-0.6, 1.05, 1.0], [1.4, 0.7, 0.85], [-1.4, 0.75, 0.9],
    [2.3, 0.6, 0.9], [-2.3, 0.65, 0.85], [3.1, 0.55, 1.0], [2.8, 0.2, 0.8], [-2.8, 0.25, 0.8], [3.14, -0.1, 0.75],
  ];
  for (const [a, b, s] of spikes) {
    const sp = mesh(spikeGeo, M.hair());
    const p = onHead(a, b, HEAD_R * 1.02); sp.position.copy(p);
    sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
    sp.scale.setScalar(s); hair.add(sp);
  }
  // fringe: cones pointing down over the forehead
  for (const [a, len] of [[-0.62, 0.9], [-0.3, 1.1], [0.02, 0.95], [0.34, 1.15], [0.64, 0.85]]) {
    const f = mesh(spikeGeo, M.hair());
    f.position.copy(onHead(a, 0.42, HEAD_R * 1.05));
    f.rotation.set(Math.PI - 0.55, a, 0, 'YXZ');
    f.scale.set(0.85, len, 0.6); hair.add(f);
  }

  // ---- arms
  const arms = [-1, 1].map((side) => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * 0.17, SHOULDER_Y - HIP_Y + 0.02, 0); spine.add(shoulder);
    const cap = mesh(new THREE.IcosahedronGeometry(0.06, 0), M.moss()); shoulder.add(cap);
    shoulder.add(limb(0.056, 0.05, UPPER, M.moss()));
    const elbow = new THREE.Group(); elbow.position.y = -UPPER; shoulder.add(elbow);
    elbow.add(mesh(new THREE.IcosahedronGeometry(0.05, 0), M.moss()));
    elbow.add(limb(0.05, 0.052, FORE, M.moss()));
    const cuff = mesh(new THREE.CylinderGeometry(0.054, 0.054, 0.04, 6), M.mossDark()); cuff.position.y = -FORE + 0.01; elbow.add(cuff);
    const hand = mesh(new THREE.IcosahedronGeometry(0.045, 1), M.skin()); hand.position.y = -FORE - 0.04; elbow.add(hand);
    const finger = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 5), M.skin());
    finger.position.y = -FORE - 0.1; finger.visible = false; elbow.add(finger);
    const tip = mesh(new THREE.IcosahedronGeometry(0.013, 0), M.skin()); tip.position.y = -0.035; finger.add(tip);
    return { side, shoulder, elbow, hand, finger };
  });

  root.userData = { turn, lower, legs, spine, chest, headPivot, head, eyes, mouthG, smileArc, open, arms };
  return root;
}

// arm: { fwd, out, bend, twist, point } in radians; fwd swings the arm forward, out lifts it sideways
export function poseKai(root, o = {}) {
  const u = root.userData;
  const {
    yaw = 0, pose = 'stand', expr = 'neutral', blink = 0, lookX = 0, lookY = 0, talk = 0,
    headYaw = 0, headTilt = 0, headNod = 0, lean = 0, blush = 0, breathe = 0,
    armL = { fwd: 0.05, out: 0.12, bend: 0.12 }, armR = { fwd: 0.05, out: 0.12, bend: 0.12 },
  } = o;
  u.turn.rotation.y = yaw;
  const sit = pose === 'sit';
  u.lower.position.y = sit ? -(THIGH - 0.06) : 0;
  for (const L of u.legs) {
    L.hip.rotation.x = sit ? -Math.PI / 2 + 0.08 : 0;
    L.knee.rotation.x = sit ? Math.PI / 2 - 0.02 : 0;
    L.ankle.rotation.x = 0;
    L.hip.rotation.z = sit ? (L.hip.position.x > 0 ? -0.05 : 0.05) : 0;
  }
  u.spine.rotation.x = lean;
  u.chest.scale.set(1 + breathe * 0.012, 1 + breathe * 0.01, 1 + breathe * 0.02);
  u.headPivot.rotation.set(headNod * 0.25 + lookY * 0.06, headYaw, headTilt, 'YXZ');

  const lids = { neutral: 0, smile: 0, wistful: 0.55, worried: 0.05, hopeful: 0 }[expr] ?? 0;
  const brow = { neutral: [0, 0], smile: [0.005, 0], wistful: [0.004, 0.3], worried: [0.008, 0.38], hopeful: [0.012, -0.05] }[expr] ?? [0, 0];
  for (const e of u.eyes) {
    const smiling = expr === 'smile';
    e.ball.visible = !smiling; e.gl.visible = !smiling && blink < 0.5; e.gl2.visible = (expr === 'hopeful' || expr === 'worried') && blink < 0.5;
    e.smile.visible = smiling;
    const shut = Math.max(lids, blink);
    e.lid.visible = shut > 0.02 && !smiling;
    e.lid.scale.set(0.95, 0.7, 0.55);
    e.lid.position.y = 0.03 - shut * 0.034;
    e.ball.position.set(lookX * 0.006, lookY * 0.006 - (expr === 'wistful' ? 0.004 : 0), 0);
    e.ball.scale.set(0.82, 1.15 * (expr === 'hopeful' ? 1.08 : 1), 0.5);
    e.brow.position.y = brow[0];
    e.brow.rotation.z = -e.side * brow[1];
    e.blush.visible = blush > 0.02; e.blush.scale.set(1.2 * blush, 0.65 * blush, 0.3);
  }
  const curve = { neutral: 0.35, smile: 1, wistful: 0.15, worried: -0.55, hopeful: 0.75 }[expr] ?? 0.3;
  u.smileArc.visible = talk < 0.08;
  u.smileArc.scale.set(expr === 'smile' ? 1.15 : 0.9, curve, 1);
  u.open.visible = talk >= 0.08;
  u.open.scale.set(1.0, 0.25 + talk * 0.75, 0.35);

  for (const a of u.arms) {
    const p = a.side < 0 ? armL : armR;
    a.shoulder.rotation.set(-(p.fwd || 0), p.twist || 0, a.side * (p.out || 0), 'XYZ');
    a.elbow.rotation.set(-(p.bend || 0), 0, 0);
    a.finger.visible = !!p.point;
  }
}
