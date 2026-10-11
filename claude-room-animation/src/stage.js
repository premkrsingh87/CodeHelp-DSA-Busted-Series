// Renderer, light rig and bloom shared by the sheet, storyboard and film.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { P } from './palette.js';

export function makeStage(w, h, { bloom = 0.65, bloomRadius = 0.55, threshold = 1.5 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.28;

  const camera = new THREE.PerspectiveCamera(28, w / h, 0.05, 60);
  const target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), bloom, bloomRadius, threshold);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const stage = {
    renderer, scene, camera, composer, bloomPass,
    setSize(nw, nh) {
      renderer.setSize(nw, nh, false);
      composer.setSize(nw, nh);
      camera.aspect = nw / nh; camera.updateProjectionMatrix();
    },
    render() { composer.render(); return renderer.domElement; },
  };
  return stage;
}

// Lamp key from upper-left (Ember), monitor rim from the right (Teal), plum sky fill.
export function addRig(scene, { key = 1, rim = 1, fill = 1 } = {}) {
  const rig = new THREE.Group(); rig.name = 'rig';
  const hemi = new THREE.HemisphereLight('#7a6a9c', P.ink, 0.9 * fill); rig.add(hemi);

  const keyL = new THREE.SpotLight('#ffc596', 15 * key, 0, 0.62, 0.75, 1.4);
  keyL.position.set(-1.7, 2.6, 2.1); keyL.target.position.set(0, 0.5, 0);
  keyL.castShadow = true; keyL.shadow.mapSize.set(2048, 2048);
  keyL.shadow.bias = -0.0003; keyL.shadow.normalBias = 0.015; keyL.shadow.radius = 4;
  rig.add(keyL, keyL.target);

  const rimL = new THREE.DirectionalLight(P.teal, 3.2 * rim);
  rimL.position.set(2.2, 1.5, -1.6); rig.add(rimL);

  const front = new THREE.DirectionalLight('#f4ebdd', 0.45 * fill);
  front.position.set(0.4, 1.2, 3); rig.add(front);
  scene.add(rig);
  return { rig, hemi, keyL, rimL, front };
}

export function addFloor(scene, r = 3) {
  const m = new THREE.MeshPhysicalMaterial({ color: '#2a2340', roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(r, 48), m);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  return floor;
}
