// Low-poly "polymer" look: flat-shaded facets, glossy clearcoat, emissive accents that feed the bloom.
import * as THREE from 'three';
import { P, S } from './palette.js';

const cache = new Map();
function phys(key, opts) {
  if (!cache.has(key)) cache.set(key, new THREE.MeshPhysicalMaterial({ flatShading: true, ...opts }));
  return cache.get(key);
}

export const M = {
  clay:      () => phys('clay', { color: '#c8603f', roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.18, emissive: P.clay, emissiveIntensity: 0.06 }),
  clayDark:  () => phys('clayDark', { color: S.clayShadow, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
  eye:       () => phys('eye', { color: P.ink, roughness: 0.08, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 }),
  glint:     () => phys('glint', { color: P.paper, emissive: P.paper, emissiveIntensity: 2.4 }),
  glintSoft: () => phys('glintSoft', { color: P.paper, emissive: P.paper, emissiveIntensity: 1.55 }),
  blush:     () => phys('blush', { color: P.rose, emissive: P.rose, emissiveIntensity: 0.6, roughness: 0.5, transparent: true, opacity: 0.9 }),
  skin:      () => phys('skin', { color: S.skin, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4, sheen: 0.5, sheenColor: new THREE.Color(P.rose) }),
  hair:      () => phys('hair', { color: S.hair, roughness: 0.4, clearcoat: 0.5, clearcoatRoughness: 0.3, envMapIntensity: 0.3, sheen: 1, sheenColor: new THREE.Color(P.plum) }),
  moss:      () => phys('moss', { color: '#5d7d61', roughness: 0.66, sheen: 0.5, sheenColor: new THREE.Color(P.paper), sheenRoughness: 0.6 }),
  mossDark:  () => phys('mossDark', { color: S.mossShadow, roughness: 0.7, sheen: 0.5, sheenColor: new THREE.Color(P.paper) }),
  denim:     () => phys('denim', { color: S.denim, roughness: 0.7, sheen: 0.4, sheenColor: new THREE.Color(P.teal) }),
  paper:     () => phys('paper', { color: '#d9cfc0', roughness: 0.5, clearcoat: 0.4 }),
  rubber:    () => phys('rubber', { color: '#2c2a44', roughness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.1 }),
  mouth:     () => phys('mouth', { color: '#5a2b33', roughness: 0.4 }),
  ink:       () => phys('ink', { color: P.ink, roughness: 0.3, clearcoat: 0.8 }),
  tealGlow:  () => phys('tealGlow', { color: P.teal, emissive: P.teal, emissiveIntensity: 3.8 }),
  emberGlow: () => phys('emberGlow', { color: P.ember, emissive: P.ember, emissiveIntensity: 4.0 }),
  roseGlow:  () => phys('roseGlow', { color: P.rose, emissive: P.rose, emissiveIntensity: 3.2 }),
  clayGlow:  () => phys('clayGlow', { color: P.clay, emissive: P.clay, emissiveIntensity: 3.4 }),
  ember:     () => phys('ember', { color: P.ember, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
  teal:      () => phys('teal', { color: P.teal, roughness: 0.3, clearcoat: 1 }),
  floor:     () => phys('floor', { color: '#2a2340', roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3, flatShading: false }),
};

export function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = true;
  return m;
}
