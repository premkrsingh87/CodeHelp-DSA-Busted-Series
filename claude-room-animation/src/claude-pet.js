// Claude in pet form, low-poly 3D: a chamfered clay block, glossy tall eyes, two arm nubs, four stubby legs.
// No mouth. Origin = floor under the centre of the body. Faces +Z. Units are metres.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M, mesh } from './materials.js';

export const CLAUDE = { W: 0.40, H: 0.25, D: 0.26, LEG: 0.07 };
const { W, H, D, LEG } = CLAUDE;

export function buildClaude() {
  const root = new THREE.Group(); root.name = 'claude';
  const turn = new THREE.Group(); root.add(turn);          // yaw
  const hop = new THREE.Group(); turn.add(hop);            // vertical hop
  const squash = new THREE.Group(); squash.position.y = 0; hop.add(squash);

  // legs: staggered so all four read from the front
  const legGeo = new RoundedBoxGeometry(0.052, LEG + 0.03, 0.052, 1, 0.012);
  for (const [x, z] of [[-0.15, 0.055], [-0.055, -0.055], [0.055, -0.055], [0.15, 0.055]]) {
    const l = mesh(legGeo, M.clay()); l.position.set(x, (LEG + 0.03) / 2, z); squash.add(l);
  }

  const bodyPivot = new THREE.Group(); bodyPivot.position.y = LEG; squash.add(bodyPivot);
  const body = mesh(new RoundedBoxGeometry(W, H, D, 2, 0.04), M.clay());
  body.position.y = H / 2; bodyPivot.add(body);

  // eyes: three shapes per eye, toggled by expression
  const face = new THREE.Group(); face.position.set(0, 0.025, D / 2 + 0.004); body.add(face);
  const eyes = [-1, 1].map((side) => {
    const g = new THREE.Group(); g.position.x = side * 0.085; face.add(g);
    const rect = mesh(new RoundedBoxGeometry(0.042, 0.092, 0.022, 1, 0.006), M.eye(), false);
    const glint = mesh(new THREE.BoxGeometry(0.012, 0.012, 0.01), M.glint(), false);
    glint.position.set(-0.009, 0.03, 0.012); rect.add(glint);
    const glint2 = mesh(new THREE.BoxGeometry(0.007, 0.007, 0.01), M.glint(), false);
    glint2.position.set(0.01, -0.03, 0.012); glint2.visible = false; rect.add(glint2);
    const arc = mesh(new THREE.TorusGeometry(0.03, 0.009, 4, 8, Math.PI), M.eye(), false);  // ∩ joy
    const arcDown = mesh(new THREE.TorusGeometry(0.03, 0.009, 4, 8, Math.PI), M.eye(), false); // ∪ peace
    arcDown.rotation.z = Math.PI;
    g.add(rect, arc, arcDown);
    const blush = mesh(new THREE.IcosahedronGeometry(0.026, 0), M.blush(), false);
    blush.scale.set(1.2, 0.6, 0.25); blush.position.set(side * 0.06, -0.075, 0); g.add(blush);
    return { g, rect, arc, arcDown, glint2, blush };
  });

  // arm nubs on pivots at the body sides
  const arms = [-1, 1].map((side) => {
    const pivot = new THREE.Group(); pivot.position.set(side * W / 2, -0.02, 0); body.add(pivot);
    const a = mesh(new RoundedBoxGeometry(0.075, 0.08, 0.08, 1, 0.016), M.clay());
    a.position.x = side * 0.034; pivot.add(a);
    return { side, pivot };
  });

  root.userData = { turn, hop, squash, bodyPivot, body, face, eyes, arms };
  return root;
}

// o: yaw, expr, blink, lookX, lookY, squash, hop, armL, armR (raise 0..1), reach (0..1), blush, lean
export function poseClaude(root, o = {}) {
  const u = root.userData;
  const {
    yaw = 0, expr = 'neutral', blink = 0, lookX = 0, lookY = 0, squash = 0, hop = 0,
    armL = 0, armR = 0, reachL = 0, reachR = 0, blush = 0, lean = 0, tilt = 0,
  } = o;
  u.turn.rotation.y = yaw;
  u.hop.position.y = hop;
  u.squash.scale.set(1 + squash * 0.07, 1 - squash * 0.1, 1 + squash * 0.07);
  u.bodyPivot.rotation.x = lean;
  u.bodyPivot.rotation.z = tilt;
  u.face.position.x = lookX * 0.022;
  u.face.position.y = 0.025 + lookY * 0.018;

  const open = Math.max(0.08, 1 - blink);
  for (const [i, e] of u.eyes.entries()) {
    const side = i === 0 ? -1 : 1;
    const closed = expr === 'happy' || expr === 'peace';
    e.rect.visible = !closed; e.arc.visible = expr === 'happy'; e.arcDown.visible = expr === 'peace';
    e.glint2.visible = expr === 'wonder';
    let sy = 1, sx = 1, y = 0, rz = 0;
    if (expr === 'wonder') { sy = 1.2; sx = 1.25; }
    if (expr === 'think') { sy = 0.5; y = 0.02; }
    if (expr === 'sad') { sy = 0.72; y = -0.008; rz = side * -0.28; }
    e.rect.scale.set(sx, sy * open, 1);
    e.rect.position.y = y;
    e.rect.rotation.z = rz;
    e.blush.visible = blush > 0.02;
    e.blush.scale.set(1.2 * blush, 0.6 * blush, 0.25);
  }
  for (const a of u.arms) {
    const raise = a.side < 0 ? armL : armR;
    const reach = a.side < 0 ? reachL : reachR;
    a.pivot.rotation.z = a.side * raise * 0.9;     // lift outward
    a.pivot.rotation.y = -a.side * reach * 1.2;    // swing forward
    a.pivot.position.z = reach * 0.05;
  }
}
