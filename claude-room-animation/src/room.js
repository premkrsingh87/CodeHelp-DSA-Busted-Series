// Kai's gaming room, low-poly: walls, rainy window (live texture), desk, gaming chair, shelf, posters, fairy lights.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M, mesh } from './materials.js';
import { P, mix } from './palette.js';
import { hash, clamp, lerp } from './ease.js';

const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, flatShading: true, roughness: 0.7, ...o });

export const DESK = { x0: 0.32, x1: 1.5, z0: -1.12, z1: 0.12, top: 0.74 };
export const WINDOW = { x: 0.05, y: 1.42, w: 1.25, h: 0.86, z: -1.5 };

export function buildRoom() {
  const room = new THREE.Group(); room.name = 'room';

  // floor planks
  const plankMats = [mat('#3b2f4a', { roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.35 }), mat('#352a43', { roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.35 })];
  for (let i = 0; i < 26; i++) {
    const p = mesh(new THREE.BoxGeometry(0.2, 0.02, 5), plankMats[i % 2], false);
    p.position.set(-2.6 + i * 0.205, -0.01, 0.9); room.add(p);
  }
  // rug
  const rug = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.012, 10), mat(mix(P.plum, P.rose, 0.25), { roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(P.rose) }), false);
  rug.position.set(-0.1, 0.006, -0.15); room.add(rug);

  // walls
  const wallMat = mat('#2c2442', { roughness: 0.9 });
  const back = new THREE.Group(); room.add(back);
  const wx0 = WINDOW.x - WINDOW.w / 2, wx1 = WINDOW.x + WINDOW.w / 2, wy0 = WINDOW.y - WINDOW.h / 2, wy1 = WINDOW.y + WINDOW.h / 2;
  const wallPiece = (x0, x1, y0, y1) => {
    const m = mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, 0.1), wallMat, false);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, WINDOW.z - 0.05); back.add(m);
  };
  wallPiece(-3, wx0, 0, 3); wallPiece(wx1, 1.65, 0, 3); wallPiece(wx0, wx1, 0, wy0); wallPiece(wx0, wx1, wy1, 3);
  const right = mesh(new THREE.BoxGeometry(0.1, 3, 4), wallMat, false); right.position.set(1.7, 1.5, 0.4); room.add(right);
  const left = mesh(new THREE.BoxGeometry(0.1, 3, 4.5), wallMat, false); left.position.set(-2.0, 1.5, 0.7); room.add(left);
  // bed against the left wall: low-poly mattress, rumpled blanket, pillow
  const bed = mesh(new RoundedBoxGeometry(0.95, 0.32, 1.9, 1, 0.04), mat('#4a3d63', { roughness: 0.6 })); bed.position.set(-1.48, 0.16, 0.2); room.add(bed);
  const blanket = mesh(new THREE.IcosahedronGeometry(0.5, 1), mat(P.rose, { roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(P.paper) }));
  blanket.scale.set(0.95, 0.2, 1.6); blanket.position.set(-1.45, 0.36, 0.45); room.add(blanket);
  const pillow = mesh(new RoundedBoxGeometry(0.6, 0.12, 0.3, 2, 0.05), mat(P.paper, { roughness: 0.8 })); pillow.position.set(-1.48, 0.38, -0.55); room.add(pillow);
  // poster on the left wall
  const lp = mesh(new RoundedBoxGeometry(0.02, 0.5, 0.38, 1, 0.006), M.rubber(), false); lp.position.set(-1.94, 1.55, -0.2); room.add(lp);
  const lpi = mesh(new THREE.BoxGeometry(0.01, 0.44, 0.32), new THREE.MeshPhysicalMaterial({ color: P.teal, emissive: P.teal, emissiveIntensity: 0.25, flatShading: true }), false); lpi.position.set(-1.925, 1.55, -0.2); room.add(lpi);
  // skirting
  const skirt = mesh(new THREE.BoxGeometry(4.7, 0.08, 0.03), mat(P.ink), false); skirt.position.set(-0.6, 0.04, WINDOW.z + 0.01); room.add(skirt);

  // window frame + sill + live sky
  const frameMat = mat('#4a3d63', { roughness: 0.5, clearcoat: 0.6 });
  const fr = (w, h, x, y) => { const m = mesh(new RoundedBoxGeometry(w, h, 0.07, 1, 0.01), frameMat, false); m.position.set(x, y, WINDOW.z + 0.01); room.add(m); };
  fr(WINDOW.w + 0.1, 0.06, WINDOW.x, wy1 + 0.02); fr(WINDOW.w + 0.1, 0.06, WINDOW.x, wy0 - 0.02);
  fr(0.06, WINDOW.h + 0.1, wx0 - 0.02, WINDOW.y); fr(0.06, WINDOW.h + 0.1, wx1 + 0.02, WINDOW.y);
  fr(0.035, WINDOW.h, WINDOW.x, WINDOW.y); fr(WINDOW.w, 0.035, WINDOW.x, WINDOW.y + 0.05);
  const sill = mesh(new RoundedBoxGeometry(WINDOW.w + 0.24, 0.04, 0.2, 1, 0.01), frameMat); sill.position.set(WINDOW.x, wy0 - 0.06, WINDOW.z + 0.08); room.add(sill);
  const skyCvs = document.createElement('canvas'); skyCvs.width = 768; skyCvs.height = 528;
  const skyTex = new THREE.CanvasTexture(skyCvs); skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(WINDOW.w, WINDOW.h), new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false }));
  sky.position.set(WINDOW.x, WINDOW.y, WINDOW.z - 0.04); room.add(sky);
  // little plant on the sill
  const pot = mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.08, 7), mat(P.clay, { roughness: 0.5, clearcoat: 0.5 })); pot.position.set(wx0 + 0.16, wy0 - 0.0, WINDOW.z + 0.1); room.add(pot);
  for (let i = 0; i < 5; i++) {
    const leaf = mesh(new THREE.ConeGeometry(0.025, 0.12, 4), mat(P.moss, { roughness: 0.5, clearcoat: 0.6 }));
    leaf.position.set(wx0 + 0.16 + Math.sin(i * 1.3) * 0.025, wy0 + 0.09, WINDOW.z + 0.1 + Math.cos(i * 1.3) * 0.025);
    leaf.rotation.set(Math.cos(i * 1.3) * 0.5, 0, -Math.sin(i * 1.3) * 0.5); room.add(leaf);
  }

  // desk (long side runs along z, against the right wall)
  const deskMat = mat('#5a4466', { roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  const top = mesh(new RoundedBoxGeometry(DESK.x1 - DESK.x0, 0.045, DESK.z1 - DESK.z0, 1, 0.012), deskMat);
  top.position.set((DESK.x0 + DESK.x1) / 2, DESK.top - 0.0225, (DESK.z0 + DESK.z1) / 2); room.add(top);
  for (const [x, z] of [[DESK.x0 + 0.05, DESK.z0 + 0.05], [DESK.x0 + 0.05, DESK.z1 - 0.05], [DESK.x1 - 0.05, DESK.z0 + 0.05], [DESK.x1 - 0.05, DESK.z1 - 0.05]]) {
    const leg = mesh(new THREE.BoxGeometry(0.05, DESK.top - 0.045, 0.05), M.rubber()); leg.position.set(x, (DESK.top - 0.045) / 2, z); room.add(leg);
  }
  // teal LED strip under the desk edge (glows)
  const led = mesh(new THREE.BoxGeometry(0.012, 0.012, DESK.z1 - DESK.z0 - 0.06), M.tealGlow(), false);
  led.position.set(DESK.x0 + 0.02, DESK.top - 0.055, (DESK.z0 + DESK.z1) / 2); room.add(led);
  // keyboard + mousepad
  const pad = mesh(new RoundedBoxGeometry(0.34, 0.006, 0.5, 1, 0.003), mat('#211c33', { roughness: 0.9 })); pad.position.set(0.62, DESK.top + 0.003, -0.55); room.add(pad);
  const kb = mesh(new RoundedBoxGeometry(0.14, 0.022, 0.4, 1, 0.006), M.rubber()); kb.position.set(0.6, DESK.top + 0.014, -0.6); room.add(kb);
  const keys = mesh(new THREE.BoxGeometry(0.11, 0.004, 0.36), new THREE.MeshPhysicalMaterial({ color: P.plum, emissive: P.rose, emissiveIntensity: 0.6 }), false);
  keys.position.set(0.6, DESK.top + 0.026, -0.6); room.add(keys);
  // books stacked on the desk
  const bookCols = [P.moss, P.ember, P.teal, P.rose];
  for (let i = 0; i < 4; i++) {
    const b = mesh(new RoundedBoxGeometry(0.2 - i * 0.012, 0.035, 0.27 - i * 0.01, 1, 0.005), mat(bookCols[i], { roughness: 0.5, clearcoat: 0.4 }));
    b.position.set(1.22, DESK.top + 0.018 + i * 0.036, 0.0); b.rotation.y = (hash(i) - 0.5) * 0.3; room.add(b);
  }

  // shelf on the back wall (left of window) with trinkets
  const shelf = mesh(new RoundedBoxGeometry(0.7, 0.03, 0.18, 1, 0.008), deskMat); shelf.position.set(-1.25, 1.45, WINDOW.z + 0.09); room.add(shelf);
  for (let i = 0; i < 6; i++) {
    const h = 0.14 + hash(i + 3) * 0.08;
    const b = mesh(new THREE.BoxGeometry(0.035, h, 0.13), mat(bookCols[i % 4], { roughness: 0.5, clearcoat: 0.4 }));
    b.position.set(-1.52 + i * 0.04, 1.465 + h / 2, WINDOW.z + 0.09); room.add(b);
  }
  const trophy = mesh(new THREE.OctahedronGeometry(0.06), mat(P.ember, { metalness: 0.7, roughness: 0.25, clearcoat: 1 })); trophy.position.set(-1.1, 1.53, WINDOW.z + 0.09); room.add(trophy);
  const cube = mesh(new THREE.IcosahedronGeometry(0.05, 0), mat(P.teal, { roughness: 0.3, clearcoat: 1 })); cube.position.set(-0.98, 1.515, WINDOW.z + 0.09); room.add(cube);

  // posters: abstract original shapes in frames, slightly emissive
  const poster = (x, y, w, h, draw) => {
    const c = document.createElement('canvas'); c.width = 256; c.height = Math.round(256 * h / w);
    draw(c.getContext('2d'), c.width, c.height);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const frame = mesh(new RoundedBoxGeometry(w + 0.04, h + 0.04, 0.02, 1, 0.006), M.rubber(), false); frame.position.set(x, y, WINDOW.z + 0.012); room.add(frame);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, emissive: '#fff', emissiveMap: t, emissiveIntensity: 0.35, roughness: 0.6 }));
    pm.position.set(x, y, WINDOW.z + 0.024); room.add(pm);
  };
  poster(-1.25, 2.0, 0.42, 0.56, (c, w, h) => {
    c.fillStyle = P.plum; c.fillRect(0, 0, w, h);
    c.fillStyle = P.ember; c.beginPath(); c.arc(w / 2, h * 0.42, w * 0.28, 0, 7); c.fill();
    c.fillStyle = P.ink; for (let i = 0; i < 6; i++) c.fillRect(0, h * 0.42 + i * 12, w, 5);
    c.fillStyle = P.teal; c.beginPath(); c.moveTo(0, h); c.lineTo(w * 0.35, h * 0.62); c.lineTo(w * 0.6, h * 0.8); c.lineTo(w, h * 0.55); c.lineTo(w, h); c.fill();
    c.fillStyle = P.paper; c.font = '700 22px Nunito'; c.textAlign = 'center'; c.fillText('LEVEL 99', w / 2, h - 18);
  });
  poster(-0.75, 1.15, 0.3, 0.4, (c, w, h) => {
    c.fillStyle = P.teal; c.fillRect(0, 0, w, h);
    c.fillStyle = P.ink; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (hash(x * 7 + y * 13) > 0.5) c.fillRect(30 + x * 33, 40 + y * 33, 30, 30);
  });

  // fairy lights draped along the top of the back wall and right wall
  const bulbMats = [M.emberGlow(), M.roseGlow(), M.emberGlow(), M.tealGlow()];
  const wire = [];
  for (let i = 0; i < 34; i++) {
    const u = i / 33;
    const x = lerp(-2.2, 1.6, u);
    const y = 2.28 - Math.abs(Math.sin(u * Math.PI * 5)) * 0.14;
    const b = mesh(new THREE.IcosahedronGeometry(0.018, 0), bulbMats[i % 4], false);
    b.position.set(x, y, WINDOW.z + 0.06); room.add(b);
    wire.push(new THREE.Vector3(x, y + 0.02, WINDOW.z + 0.06));
  }
  const wireLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire), new THREE.LineBasicMaterial({ color: P.ink }));
  room.add(wireLine);

  room.userData = { skyCvs, skyTex };
  return room;
}

// sky: night rain -> dawn. rain 0..1, dawn 0..1
export function paintSky(room, t, rain, dawn) {
  const { skyCvs: c, skyTex } = room.userData;
  const ctx = c.getContext('2d'), w = c.width, h = c.height;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, mix('#0e0d22', '#3b3a74', dawn));
  g.addColorStop(0.55, mix('#1d1a3c', P.rose, dawn * 0.9));
  g.addColorStop(1, mix('#2c2650', P.ember, dawn));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // stars (fade with dawn)
  for (let i = 0; i < 70; i++) {
    const tw = 0.5 + 0.5 * Math.sin(t * (0.6 + hash(i) * 1.5) + i);
    ctx.globalAlpha = (1 - dawn) * (0.25 + 0.6 * tw) * (1 - rain * 0.5);
    ctx.fillStyle = P.paper;
    const s = hash(i + 40) > 0.85 ? 4 : 2.5;
    ctx.fillRect(hash(i) * w, hash(i + 100) * h * 0.55, s, s);
  }
  ctx.globalAlpha = 1;
  // moon / sun
  ctx.fillStyle = mix(P.paper, P.ember, dawn);
  ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.arc(w * 0.78, lerp(h * 0.22, h * 0.62, dawn), lerp(26, 46, dawn), 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  // far city skyline with lit windows
  for (let layer = 0; layer < 2; layer++) {
    const base = layer === 0 ? '#2a2650' : '#191632';
    ctx.fillStyle = mix(base, layer === 0 ? P.rose : P.plum, dawn * 0.45);
    let x = -10;
    let k = layer * 50;
    while (x < w) {
      const bw = 40 + hash(k) * 70, bh = (layer === 0 ? 120 : 70) + hash(k + 7) * (layer === 0 ? 170 : 120);
      ctx.fillRect(x, h - bh, bw, bh);
      if (layer === 1) {
        for (let wy = h - bh + 12; wy < h - 10; wy += 18) for (let wx = x + 8; wx < x + bw - 10; wx += 14) {
          const on = hash(wx * 3.1 + wy * 1.7);
          if (on > 0.72) {
            ctx.fillStyle = on > 0.9 ? P.teal : P.ember;
            ctx.globalAlpha = (0.85 - dawn * 0.6) * (0.7 + 0.3 * Math.sin(t * 0.5 + on * 20));
            ctx.fillRect(wx, wy, 6, 8);
          }
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = mix(base, P.plum, dawn * 0.45);
      }
      x += bw + 4; k++;
    }
  }
  // rain streaks
  if (rain > 0.01) {
    ctx.strokeStyle = mix(P.paper, P.teal, 0.4); ctx.lineWidth = 1.6;
    const n = Math.floor(160 * rain);
    for (let i = 0; i < n; i++) {
      const sp = 0.9 + hash(i) * 0.6;
      const y = ((hash(i + 7) * h + t * 900 * sp) % (h + 60)) - 30;
      const x = (hash(i + 3) * (w + 80) - 40) - y * 0.12;
      ctx.globalAlpha = 0.18 + 0.3 * hash(i + 11);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 26 + 20 * hash(i)); ctx.stroke();
    }
    // droplets sliding on the glass
    for (let i = 0; i < 26 * rain; i++) {
      const y = (hash(i + 70) * h + t * (12 + 30 * hash(i + 80))) % h;
      const x = hash(i + 90) * w;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = mix(P.paper, P.teal, 0.3);
      ctx.beginPath(); ctx.arc(x, y, 2 + 3 * hash(i + 60), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // glass sheen
  const sh = ctx.createLinearGradient(0, 0, w, h);
  sh.addColorStop(0, 'rgba(255,255,255,0.06)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(255,255,255,0.03)');
  ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
  skyTex.needsUpdate = true;
  void clamp;
}

// gaming chair; origin = floor under the seat centre, faces +Z
export function buildChair() {
  const g = new THREE.Group(); g.name = 'chair';
  const shell = mat('#2c2a44', { roughness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.15 });
  const accent = mat(P.clay, { roughness: 0.35, clearcoat: 1 });
  const base = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 6), M.rubber()); base.position.y = 0.17; g.add(base);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const leg = mesh(new THREE.BoxGeometry(0.035, 0.03, 0.28), M.rubber()); leg.position.set(Math.sin(a) * 0.13, 0.06, Math.cos(a) * 0.13); leg.rotation.y = a; g.add(leg);
    const wheel = mesh(new THREE.IcosahedronGeometry(0.028, 0), M.ink()); wheel.position.set(Math.sin(a) * 0.26, 0.028, Math.cos(a) * 0.26); g.add(wheel);
  }
  const seat = mesh(new RoundedBoxGeometry(0.46, 0.08, 0.46, 2, 0.03), shell); seat.position.set(0, 0.32, 0.06); g.add(seat);
  const back = mesh(new RoundedBoxGeometry(0.46, 0.72, 0.09, 2, 0.04), shell); back.position.set(0, 0.72, -0.2); back.rotation.x = -0.12; g.add(back);
  const stripe = mesh(new RoundedBoxGeometry(0.08, 0.6, 0.095, 1, 0.02), accent); stripe.position.set(0, 0.72, -0.198); stripe.rotation.x = -0.12; g.add(stripe);
  const pillow = mesh(new RoundedBoxGeometry(0.26, 0.1, 0.07, 2, 0.03), accent); pillow.position.set(0, 1.0, -0.14); pillow.rotation.x = -0.12; g.add(pillow);
  for (const s of [-1, 1]) {
    const arm = mesh(new RoundedBoxGeometry(0.06, 0.04, 0.3, 1, 0.015), shell); arm.position.set(s * 0.27, 0.5, 0.05); g.add(arm);
    const post = mesh(new THREE.BoxGeometry(0.03, 0.16, 0.03), M.rubber()); post.position.set(s * 0.27, 0.41, -0.02); g.add(post);
  }
  return g;
}
