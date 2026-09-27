// Traffic vehicle models built from primitives: Corolla-style sedans, Mehran-style
// hatchbacks, Bolan carry vans, Ravi pickups, truck-art wagons and CD70 motorbikes.
import * as THREE from 'three';
import { Builder, mat4, col } from './builder.js';
import { pick, rand, chance } from './util.js';
import { truckArtTexture, tajArtTexture } from './textures.js';
import { Person, randomLook } from './people.js';

let VM = null;

export function vehicleMaterials() {
  if (VM) return VM;
  VM = {
    paint: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x1a232b, roughness: 0.08, metalness: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x1c1c1c, roughness: 0.92 }),
    chrome: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 1 }),
    dark: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x2a2a2a, roughness: 0.7 }),
    head: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xeeeeee, emissive: 0xfff2d0, emissiveIntensity: 0.05, roughness: 0.1 }),
    tail: new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x8a0000, emissive: 0xff1a00, emissiveIntensity: 0.1, roughness: 0.2 }),
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
    bulb0: new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1a1a, emissiveIntensity: 1, roughness: 0.3 }),
    bulb1: new THREE.MeshStandardMaterial({ color: 0x20ff40, emissive: 0x19ff40, emissiveIntensity: 1, roughness: 0.3 }),
    bulb2: new THREE.MeshStandardMaterial({ color: 0xffd020, emissive: 0xffc81a, emissiveIntensity: 1, roughness: 0.3 }),
    bulb3: new THREE.MeshStandardMaterial({ color: 0x40a0ff, emissive: 0x2f8cff, emissiveIntensity: 1, roughness: 0.3 }),
    taj: [
      new THREE.MeshStandardMaterial({ map: tajArtTexture('ماشاءاللہ', '#8b0000'), roughness: 0.45, vertexColors: true }),
      new THREE.MeshStandardMaterial({ map: tajArtTexture('یا علی مدد', '#0b3d91'), roughness: 0.45, vertexColors: true }),
      new THREE.MeshStandardMaterial({ map: tajArtTexture('خیبر سے کراچی', '#0a5d2a'), roughness: 0.45, vertexColors: true }),
    ],
    art: [
      new THREE.MeshStandardMaterial({ map: truckArtTexture('اللہ ہو', '#0b3d91'), roughness: 0.5, vertexColors: true }),
      new THREE.MeshStandardMaterial({ map: truckArtTexture('پپو یار تنگ نہ کر', '#8b0000'), roughness: 0.5, vertexColors: true }),
      new THREE.MeshStandardMaterial({ map: truckArtTexture('دیکھ مگر پیار سے', '#0a5d2a'), roughness: 0.5, vertexColors: true }),
      new THREE.MeshStandardMaterial({ map: truckArtTexture('ماں کی دعا جنت کی ہوا', '#6a1b9a'), roughness: 0.5, vertexColors: true }),
      new THREE.MeshStandardMaterial({ map: truckArtTexture('جلنے والے کا منہ کالا', '#e65100'), roughness: 0.5, vertexColors: true }),
    ],
  };
  return VM;
}

let nightLevel = 0;
export function setVehicleNight(n) {
  nightLevel = n;
  if (!VM) return;
  VM.head.emissiveIntensity = 0.05 + n * 3;
  VM.tail.emissiveIntensity = 0.1 + n * 2.5;
}

// Chasing coloured bulbs on the jingle trucks
export function animateVehicleLights(t) {
  if (!VM) return;
  const phase = Math.floor(t * 5) % 4;
  for (let k = 0; k < 4; k++) {
    VM['bulb' + k].emissiveIntensity = (k === phase ? 4 : 0.9) * (0.45 + nightLevel * 1.6);
  }
}

const CAR_COLORS = ['#f4f4f2', '#f4f4f2', '#f4f4f2', '#c0c3c7', '#c0c3c7', '#1c1c1e', '#4a4d52', '#6d1420', '#1f3b73', '#8a8f55', '#b33a2a'];

const WHEEL = new THREE.CylinderGeometry(1, 1, 1, 16).rotateZ(Math.PI / 2).toNonIndexed();
const HUB = new THREE.CylinderGeometry(1, 1, 1, 8).rotateZ(Math.PI / 2).toNonIndexed();
const TORUS = new THREE.TorusGeometry(0.27, 0.05, 5, 14).rotateY(Math.PI / 2).toNonIndexed();
const TUBE = new THREE.CylinderGeometry(1, 1, 1, 8).toNonIndexed();
const BOX = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();

// Extrude a side profile given as [z, y] points; the result spans x in [-w/2, w/2].
function profile(points, w, bevel = 0.05) {
  const s = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {
    depth: w - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4,
  });
  g.rotateY(-Math.PI / 2);
  g.translate(w / 2 - bevel, 0, 0);
  return g;
}

function wheels(b, positions, r, w) {
  for (const [x, z] of positions) {
    b.geom('rubber', WHEEL, mat4(x, r, z, 0, w, r, r));
    b.geom('chrome', HUB, mat4(x + Math.sign(x) * 0.01, r, z, 0, w * 1.02, r * 0.55, r * 0.55), col('#bfc3c7'));
  }
}

function lights(b, L, W, y, hw = 0.32, tw = 0.25) {
  for (const s of [-1, 1]) {
    b.box('head', s * (W / 2 - hw / 2 - 0.08), y, L / 2 + 0.01, hw, 0.14, 0.06);
    b.box('tail', s * (W / 2 - tw / 2 - 0.06), y, -L / 2 - 0.01, tw, 0.16, 0.06);
  }
}

function plate(b, L, y) {
  b.box('chrome', 0, y, L / 2 + 0.05, 0.5, 0.13, 0.02, col('#f5f5f0'));
  b.box('chrome', 0, y, -L / 2 - 0.05, 0.5, 0.13, 0.02, col('#f5f5f0'));
}

export function buildSedan(b, color) {
  const L = 4.4;
  const W = 1.7;
  const c = col(color);
  b.geom('paint', profile([[-L / 2, 0.32], [-L / 2, 0.82], [-L / 2 + 0.95, 0.95], [L / 2 - 1.2, 0.95], [L / 2 - 0.1, 0.8], [L / 2, 0.55], [L / 2, 0.32]], W), new THREE.Matrix4(), c);
  b.geom('glass', profile([[-L / 2 + 0.95, 0.94], [-L / 2 + 1.5, 1.38], [L / 2 - 1.95, 1.38], [L / 2 - 1.2, 0.94]], W - 0.12, 0.02), new THREE.Matrix4());
  b.box('paint', 0, 1.40, -0.25, W - 0.2, 0.05, 1.3, c);
  b.box('paint', W / 2 - 0.09, 1.15, -0.1, 0.04, 0.45, 0.12, c);
  b.box('paint', -W / 2 + 0.09, 1.15, -0.1, 0.04, 0.45, 0.12, c);
  b.box('dark', 0, 0.42, L / 2 + 0.02, W - 0.1, 0.2, 0.08);
  b.box('dark', 0, 0.42, -L / 2 - 0.02, W - 0.1, 0.2, 0.08);
  b.box('dark', 0, 0.66, L / 2 + 0.02, 0.7, 0.14, 0.04);
  lights(b, L, W, 0.7);
  plate(b, L, 0.45);
  wheels(b, [[-W / 2 + 0.12, 1.35], [W / 2 - 0.12, 1.35], [-W / 2 + 0.12, -1.3], [W / 2 - 0.12, -1.3]], 0.31, 0.2);
  return { len: L, width: W };
}

export function buildHatch(b, color) {
  const L = 3.4;
  const W = 1.45;
  const c = col(color);
  b.geom('paint', profile([[-L / 2, 0.3], [-L / 2, 0.92], [L / 2 - 0.85, 0.92], [L / 2 - 0.05, 0.8], [L / 2, 0.55], [L / 2, 0.3]], W), new THREE.Matrix4(), c);
  b.geom('glass', profile([[-L / 2 + 0.05, 0.9], [-L / 2 + 0.2, 1.38], [L / 2 - 1.35, 1.38], [L / 2 - 0.85, 0.9]], W - 0.1, 0.02), new THREE.Matrix4());
  b.box('paint', 0, 1.40, -0.35, W - 0.14, 0.05, 1.8, c);
  b.box('paint', W / 2 - 0.07, 1.15, -0.15, 0.04, 0.45, 0.1, c);
  b.box('paint', -W / 2 + 0.07, 1.15, -0.15, 0.04, 0.45, 0.1, c);
  b.box('chrome', 0, 0.4, L / 2 + 0.03, W - 0.05, 0.14, 0.06, col('#cfd3d6'));
  b.box('chrome', 0, 0.4, -L / 2 - 0.03, W - 0.05, 0.14, 0.06, col('#cfd3d6'));
  lights(b, L, W, 0.68, 0.25, 0.18);
  plate(b, L, 0.52);
  wheels(b, [[-W / 2 + 0.1, 1.05], [W / 2 - 0.1, 1.05], [-W / 2 + 0.1, -1.05], [W / 2 - 0.1, -1.05]], 0.27, 0.17);
  return { len: L, width: W };
}

export function buildVan(b, color) {
  const L = 3.5;
  const W = 1.45;
  const c = col(color);
  b.geom('paint', profile([[-L / 2, 0.3], [-L / 2, 1.85], [L / 2 - 0.35, 1.85], [L / 2, 1.2], [L / 2, 0.3]], W), new THREE.Matrix4(), c);
  // window band
  for (const s of [-1, 1]) {
    b.box('glass', s * (W / 2 + 0.005), 1.45, 0.1, 0.02, 0.45, L - 0.9);
  }
  b.box('glass', 0, 1.5, L / 2 - 0.16, W - 0.15, 0.5, 0.02);
  b.geom('glass', new THREE.PlaneGeometry(W - 0.15, 0.62).rotateX(-0.5).toNonIndexed(), mat4(0, 1.53, L / 2 - 0.17, 0));
  b.box('glass', 0, 1.45, -L / 2 - 0.005, W - 0.2, 0.45, 0.02);
  b.box('paint', 0, 1.3, 0, W + 0.02, 0.08, L - 0.2, col('#1565c0'));
  b.box('chrome', 0, 1.95, -0.2, W - 0.2, 0.08, L - 1, col('#555'));
  b.box('dark', 0, 0.4, L / 2 + 0.03, W, 0.16, 0.08);
  b.box('dark', 0, 0.4, -L / 2 - 0.03, W, 0.16, 0.08);
  lights(b, L, W, 0.8, 0.25, 0.18);
  plate(b, L, 0.55);
  wheels(b, [[-W / 2 + 0.1, 1.1], [W / 2 - 0.1, 1.1], [-W / 2 + 0.1, -1.1], [W / 2 - 0.1, -1.1]], 0.27, 0.17);
  return { len: L, width: W };
}

export function buildPickup(b, color) {
  const L = 3.9;
  const W = 1.5;
  const c = col(color);
  b.geom('paint', profile([[L / 2 - 1.5, 0.35], [L / 2 - 1.5, 1.8], [L / 2 - 0.35, 1.8], [L / 2, 1.15], [L / 2, 0.35]], W), new THREE.Matrix4(), c);
  b.box('glass', 0, 1.5, L / 2 - 0.16, W - 0.15, 0.5, 0.02);
  b.geom('glass', new THREE.PlaneGeometry(W - 0.15, 0.62).rotateX(-0.5).toNonIndexed(), mat4(0, 1.53, L / 2 - 0.17, 0));
  for (const s of [-1, 1]) b.box('glass', s * (W / 2 + 0.005), 1.45, L / 2 - 0.85, 0.02, 0.4, 0.9);
  // open cargo bed with crates / sacks
  const bz = -0.55;
  b.box('paint', 0, 0.55, bz, W, 0.12, 2.35, c);
  b.box('paint', W / 2 - 0.03, 0.85, bz, 0.06, 0.5, 2.35, c);
  b.box('paint', -W / 2 + 0.03, 0.85, bz, 0.06, 0.5, 2.35, c);
  b.box('paint', 0, 0.85, bz - 1.15, W, 0.5, 0.06, c);
  for (let k = 0; k < 5; k++) {
    b.box('matte', rand(-0.4, 0.4), 0.8 + rand(0, 0.1), bz + rand(-0.9, 0.9), 0.5, 0.4, 0.6, col(pick(['#c8b48a', '#a58a5c', '#e0e0d0', '#2e7d32'])));
  }
  b.box('dark', 0, 0.42, L / 2 + 0.03, W, 0.16, 0.08);
  lights(b, L, W, 0.8, 0.25, 0.18);
  plate(b, L, 0.55);
  wheels(b, [[-W / 2 + 0.1, 1.2], [W / 2 - 0.1, 1.2], [-W / 2 + 0.1, -1.1], [W / 2 - 0.1, -1.1]], 0.28, 0.18);
  return { len: L, width: W };
}

export function buildBus(b, color, artIndex) {
  const L = 7.6;
  const W = 2.2;
  const c = col(color);
  b.geom('paint', profile([[-L / 2, 0.45], [-L / 2, 2.7], [L / 2 - 0.4, 2.7], [L / 2, 2.2], [L / 2, 0.45]], W, 0.08), new THREE.Matrix4(), c);
  const artKey = 'art' + artIndex;
  // decorated truck-art panels on both sides and the back
  const panel = (x, rotY) => b.geom(artKey, new THREE.PlaneGeometry(L - 1.2, 0.95).toNonIndexed(), mat4(x, 1.0, -0.2, rotY));
  panel(W / 2 + 0.01, Math.PI / 2);
  panel(-W / 2 - 0.01, -Math.PI / 2);
  b.geom(artKey, new THREE.PlaneGeometry(W - 0.3, 1.0).toNonIndexed(), mat4(0, 1.2, -L / 2 - 0.01, Math.PI));
  for (const s of [-1, 1]) {
    b.box('glass', s * (W / 2 + 0.005), 2.0, -0.3, 0.02, 0.7, L - 1.6);
    for (let z = -L / 2 + 1; z < L / 2 - 1; z += 1.1) b.box('paint', s * (W / 2 + 0.012), 2.0, z, 0.02, 0.72, 0.08, col('#f2f2f2'));
  }
  b.geom('glass', new THREE.PlaneGeometry(W - 0.2, 0.95).rotateX(-0.35).toNonIndexed(), mat4(0, 2.05, L / 2 - 0.22, 0));
  // roof carrier with luggage
  b.box('chrome', 0, 2.8, -0.5, W - 0.2, 0.06, L - 2.2, col('#777'));
  for (let k = 0; k < 4; k++) b.box('matte', rand(-0.5, 0.5), 3.0, rand(-2.5, 1.5), 0.7, 0.35, 0.8, col(pick(['#4a3a2a', '#1e3a5f', '#6d4c41', '#2e7d32'])));
  // chrome bumper & chains
  b.box('chrome', 0, 0.5, L / 2 + 0.05, W + 0.1, 0.25, 0.12, col('#e0e0e0'));
  b.box('chrome', 0, 0.5, -L / 2 - 0.05, W + 0.1, 0.25, 0.12, col('#e0e0e0'));
  for (let x = -W / 2; x <= W / 2; x += 0.2) b.box('chrome', x, 0.3, -L / 2 - 0.08, 0.04, 0.28, 0.04, col('#d8d8d8'));
  lights(b, L, W, 0.9, 0.35, 0.3);
  plate(b, L, 0.75);
  wheels(b, [[-W / 2 + 0.2, 2.5], [W / 2 - 0.2, 2.5], [-W / 2 + 0.2, -2.3], [W / 2 - 0.2, -2.3]], 0.45, 0.3);
  return { len: L, width: W };
}

// CD70-style motorbike. `m` places the whole bike; keys lets the city reuse its own materials.
export function addMotorbike(b, m, color, parked = false, keys = null) {
  const cityKeys = { paint: 'plastic', chrome: 'metal', rubber: 'plastic', dark: 'plastic', head: 'plastic', tail: 'plastic' };
  const k = keys || (parked ? cityKeys : { paint: 'paint', chrome: 'chrome', rubber: 'rubber', dark: 'dark', head: 'head', tail: 'tail' });
  const lean = parked ? 0.12 : 0;
  const base = m.clone().multiply(mat4(0, 0, 0, 0, 1, 1, 1, 0, lean));
  const put = (key, geo, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, c) => {
    b.geom(key, geo, base.clone().multiply(mat4(x, y, z, ry, sx, sy, sz, rx, rz)), c);
  };
  const paint = col(color);
  const black = col('#1a1a1a');
  const steel = col('#c9ccd0');
  for (const z of [0.62, -0.62]) {
    put(k.rubber, TORUS, 0, 0.3, z, 1, 1, 1, 0, 0, 0, black);
    put(k.chrome, HUB, 0, 0.3, z, 0.12, 0.2, 0.2, 0, 0, 0, steel);
    put(k.chrome, HUB, 0, 0.3, z, 0.02, 0.25, 0.25, 0, 0, 0, steel);
  }
  put(k.dark, BOX, 0, 0.38, 0.05, 0.24, 0.3, 0.4, 0, 0, 0, col('#3a3a3a')); // engine
  put(k.paint, BOX, 0, 0.78, 0.22, 0.26, 0.18, 0.46, 0, 0, 0, paint); // tank
  put(k.dark, BOX, 0, 0.8, -0.25, 0.25, 0.1, 0.62, 0, 0, 0, black); // seat
  put(k.paint, BOX, 0, 0.6, -0.2, 0.22, 0.22, 0.3, 0, 0, 0, paint); // side cover
  put(k.paint, BOX, 0, 0.62, -0.62, 0.14, 0.04, 0.5, 0.3, 0, 0, paint); // rear fender
  put(k.chrome, BOX, 0, 0.58, 0.63, 0.12, 0.03, 0.35, -0.4, 0, 0, steel); // front fender
  put(k.chrome, BOX, 0, 0.55, 0.32, 0.06, 0.06, 0.6, -0.6, 0, 0, steel); // frame spine
  for (const x of [-0.07, 0.07]) put(k.chrome, TUBE, x, 0.65, 0.55, 0.02, 0.72, 0.02, -0.3, 0, 0, steel); // forks
  put(k.chrome, TUBE, 0, 1.0, 0.44, 0.015, 0.72, 0.015, 0, 0, Math.PI / 2, steel); // handlebar
  put(k.chrome, TUBE, 0.18, 0.3, -0.25, 0.04, 0.7, 0.04, Math.PI / 2, 0, 0, steel); // exhaust
  put(k.head, HUB, 0, 0.92, 0.55, 0.08, 0.09, 0.09, 0, Math.PI / 2, 0, col('#ffffff'));
  put(k.tail, BOX, 0, 0.7, -0.86, 0.1, 0.06, 0.03, 0, 0, 0, col('#ffffff'));
}

export function buildBike(b, color) {
  addMotorbike(b, new THREE.Matrix4(), color, false);
  return { len: 1.9, width: 0.7 };
}


const BULB = new THREE.SphereGeometry(0.065, 6, 4).toNonIndexed();
const PEND = new THREE.CylinderGeometry(0.05, 0.05, 0.015, 8).rotateX(Math.PI / 2).toNonIndexed();

// Pakistani "jingle truck": Bedford nose, towering taj crown, painted wooden body,
// chains with pendants along the bumpers and chasing coloured bulbs.
export function buildTruck(b, color, idx) {
  const L = 8.2;
  const W = 2.45;
  const c = col(color);
  const I = new THREE.Matrix4();
  b.box('dark', 0, 0.8, -0.2, W - 0.4, 0.3, L - 0.6, col('#ffffff'));
  // cab
  b.geom('paint', profile([[1.55, 0.85], [1.55, 2.9], [2.95, 2.9], [3.15, 2.05], [3.85, 1.9], [4.05, 1.45], [4.05, 0.85]], W - 0.25, 0.06), I, c);
  b.geom('glass', new THREE.PlaneGeometry(W - 0.55, 0.85).rotateX(-0.22).toNonIndexed(), mat4(0, 2.47, 3.06, 0));
  for (const s of [-1, 1]) b.box('glass', s * (W / 2 - 0.1), 2.35, 2.2, 0.02, 0.6, 0.95);
  b.box('chrome', 0, 1.35, 4.07, 1.3, 0.7, 0.04, col('#d8d8d8'));
  for (let k = 0; k < 6; k++) b.box('dark', 0, 1.08 + k * 0.1, 4.09, 1.2, 0.03, 0.02);
  for (const s of [-1, 1]) {
    b.geom('chrome', HUB, mat4(s * 0.82, 1.45, 4.04, Math.PI / 2, 0.06, 0.2, 0.2), col('#e0e0e0'));
    b.geom('head', HUB, mat4(s * 0.82, 1.45, 4.08, Math.PI / 2, 0.02, 0.16, 0.16));
    // big chrome mirrors on arms
    b.box('chrome', s * 1.35, 2.25, 3.0, 0.5, 0.04, 0.04, col('#ddd'));
    b.box('chrome', s * 1.62, 2.2, 3.0, 0.08, 0.45, 0.28, col('#ddd'));
  }
  b.box('chrome', 0, 0.75, L / 2 - 0.02, W + 0.1, 0.32, 0.14, col('#eeeeee'));
  // taj crown
  const crown = new THREE.Shape();
  crown.moveTo(-1.25, 0);
  crown.lineTo(1.25, 0);
  crown.lineTo(1.25, 0.8);
  crown.quadraticCurveTo(0, 1.95, -1.25, 0.8);
  crown.closePath();
  b.geom('paint', new THREE.ExtrudeGeometry(crown, { depth: 0.14, bevelEnabled: false }).toNonIndexed(), mat4(0, 2.9, 2.95, 0), c);
  b.geom('taj' + (idx % 3), new THREE.PlaneGeometry(2.1, 0.95).toNonIndexed(), mat4(0, 3.4, 3.1, 0));
  for (let k = 0; k <= 14; k++) {
    const t = k / 14;
    const x = -1.25 + 2.5 * t;
    const y = 0.8 + 4 * t * (1 - t) * 0.575;
    b.geom('bulb' + (k % 4), BULB, mat4(x, 2.9 + y, 3.12, 0));
  }
  // cargo body
  const cz = -1.3;
  const cl = 5.4;
  b.box('wood', 0, 1.05, cz, W, 0.12, cl, col('#6d4c2c'));
  for (const s of [-1, 1]) {
    b.box('wood', s * (W / 2 - 0.04), 1.95, cz, 0.08, 1.7, cl, col('#8b5a2b'));
    b.geom('art' + ((idx + (s > 0 ? 0 : 1)) % 5), new THREE.PlaneGeometry(cl - 0.3, 1.45).toNonIndexed(), mat4(s * (W / 2 + 0.005), 1.95, cz, s * Math.PI / 2));
    b.box('chrome', s * (W / 2), 2.85, cz, 0.08, 0.06, cl, col('#e0e0e0'));
    for (let z = cz - cl / 2 + 0.15; z <= cz + cl / 2; z += 0.45) b.geom('bulb' + (Math.round(z * 2.2 + 10) % 4), BULB, mat4(s * (W / 2 + 0.06), 2.92, z, 0));
  }
  b.box('wood', 0, 1.95, cz - cl / 2 + 0.04, W, 1.7, 0.08, col('#8b5a2b'));
  b.geom('art' + ((idx + 2) % 5), new THREE.PlaneGeometry(W - 0.2, 1.4).toNonIndexed(), mat4(0, 1.95, cz - cl / 2 - 0.005, Math.PI));
  b.box('wood', 0, 1.95, cz + cl / 2 - 0.04, W, 1.7, 0.08, col('#8b5a2b'));
  // tarp-covered load
  b.geom('matte', new THREE.SphereGeometry(1, 12, 8).toNonIndexed(), mat4(0, 2.75, cz, 0, W / 2 - 0.1, 0.75, cl / 2 - 0.2), col(pick(['#3b5a2a', '#6b4a2a', '#1e3a6b', '#7a6a4a'])));
  // rear lights & bulbs row
  for (const s of [-1, 1]) b.box('tail', s * 0.95, 0.95, cz - cl / 2 - 0.06, 0.25, 0.15, 0.05);
  for (let x = -1.1; x <= 1.1; x += 0.25) b.geom('bulb' + (Math.round(x * 4 + 8) % 4), BULB, mat4(x, 2.92, cz - cl / 2 - 0.06, 0));
  // chains with pendants: the "jingle"
  for (const [z, span] of [[L / 2 + 0.08, 1.15], [cz - cl / 2 - 0.1, 1.1]]) {
    for (let x = -span; x <= span; x += 0.13) {
      const h = 0.25 + Math.abs(Math.sin(x * 7)) * 0.12;
      b.box('chrome', x, 0.6 - h / 2, z, 0.015, h, 0.015, col('#d8d8d8'));
      b.geom('chrome', PEND, mat4(x, 0.6 - h, z, 0), col(pick(['#ffd700', '#e0e0e0', '#ff5252'])));
    }
  }
  // mud flaps
  for (const s of [-1, 1]) {
    b.box('matte', s * 1.0, 0.45, -3.85, 0.5, 0.6, 0.03, col('#b71c1c'));
    b.box('chrome', s * 1.0, 0.5, -3.87, 0.3, 0.1, 0.01, col('#ffffff'));
  }
  wheels(b, [[-W / 2 + 0.28, 2.75], [W / 2 - 0.28, 2.75], [-W / 2 + 0.28, -2.2], [W / 2 - 0.28, -2.2], [-W / 2 + 0.28, -3.2], [W / 2 - 0.28, -3.2]], 0.5, 0.32);
  return { len: L, width: W };
}

// ---------------------------------------------------------------- animal carts

const legMats = new Map();
function legMaterial(hex) {
  if (!legMats.has(hex)) legMats.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8 }));
  return legMats.get(hex);
}

// Horse (tonga) or donkey pulling a cart; returns legs so they can trot.
function addAnimal(b, group, s, coat, z0, decorated) {
  const c = col(coat);
  const dark = col('#1a1410');
  const put = (key, x, y, z, sx, sy, sz, color, rx = 0) => b.geom(key, BOX, mat4(x * s, y * s, z0 + z * s, 0, sx * s, sy * s, sz * s, rx), color);
  put('matte', 0, 1.3, 0, 0.5, 0.58, 1.35, c);
  b.geom('matte', new THREE.SphereGeometry(0.34, 8, 6).toNonIndexed(), mat4(0, 1.3 * s, z0 + 0.62 * s, 0, s, s, s * 0.9), c);
  put('matte', 0, 1.78, 0.78, 0.26, 0.75, 0.34, c, 0.62);
  put('matte', 0, 2.02, 1.12, 0.22, 0.26, 0.58, c, 1.0);
  put('matte', 0, 1.86, 0.66, 0.06, 0.62, 0.2, dark, 0.62); // mane
  for (const x of [-0.07, 0.07]) put('matte', x, 2.3, 0.95, 0.05, 0.16, 0.05, c);
  put('matte', 0, 1.1, -0.72, 0.08, 0.7, 0.1, dark, 0.3); // tail
  if (decorated) {
    // plume, harness and pompoms – tongas are dressed up
    b.geom('matte', new THREE.ConeGeometry(0.08, 0.45, 6).toNonIndexed(), mat4(0, 2.45 * s, z0 + 0.98 * s, 0, 1, 1, 1, -0.3), col(pick(['#e91e63', '#ff1744', '#ffd600'])));
    put('matte', 0, 1.5, 0.35, 0.54, 0.08, 0.1, col('#c62828'));
    put('matte', 0, 1.3, -0.1, 0.54, 0.62, 0.08, col('#c62828'));
    for (const x of [-0.28, 0.28]) b.geom('matte', new THREE.SphereGeometry(0.06, 6, 4).toNonIndexed(), mat4(x * s, 1.5 * s, z0 + 0.35 * s, 0), col('#ffd600'));
  }
  const legs = [];
  for (const [x, z] of [[-0.15, 0.5], [0.15, 0.5], [-0.15, -0.5], [0.15, -0.5]]) {
    const pivot = new THREE.Group();
    pivot.position.set(x * s, 1.05 * s, z0 + z * s);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, 1.0 * s, 0.13 * s).translate(0, -0.5 * s, 0), legMaterial(coat));
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.13 * s, 0.1 * s, 0.16 * s).translate(0, -1.0 * s, 0.01), legMaterial('#1a1410'));
    leg.castShadow = true;
    pivot.add(leg, hoof);
    group.add(pivot);
    legs.push(pivot);
  }
  return legs;
}

function cartWheel(b, x, z, r) {
  b.geom('wood', WHEEL, mat4(x, r, z, 0, 0.07, r, r), col('#5d3a1a'));
  b.geom('chrome', HUB, mat4(x, r, z, 0, 0.12, 0.1, 0.1), col('#c9a227'));
  for (let k = 0; k < 6; k++) b.geom('wood', BOX, mat4(x, r, z, 0, 0.04, r * 1.9, 0.05, (k / 6) * Math.PI), col('#7a4a22'));
}

export function buildAnimalCart(kind) {
  const b = new Builder();
  const group = new THREE.Group();
  const tonga = kind === 'tonga';
  const s = tonga ? 1 : 0.72;
  const legs = addAnimal(b, group, s, tonga ? pick(['#6b3e1f', '#3a2618', '#e8e2d6', '#8a5a33']) : pick(['#8a8580', '#6f6a64', '#9c948a']), tonga ? 1.35 : 1.1, tonga);
  if (tonga) {
    const cz = -1.1;
    for (const x of [-0.42, 0.42]) b.box('wood', x, 1.05, 0.3, 0.06, 0.06, 2.6, col('#5d3a1a'));
    b.box('wood', 0, 1.0, cz, 1.5, 0.1, 1.7, col('#6d4c2c'));
    b.box('matte', 0, 1.2, cz + 0.5, 1.4, 0.18, 0.5, col(pick(['#b71c1c', '#1565c0', '#2e7d32'])));
    b.box('matte', 0, 1.2, cz - 0.5, 1.4, 0.18, 0.5, col(pick(['#b71c1c', '#6a1b9a', '#f9a825'])));
    b.box('matte', 0, 1.5, cz, 1.4, 0.5, 0.08, col('#8d6e63'));
    for (const [x, z] of [[-0.7, cz + 0.8], [0.7, cz + 0.8], [-0.7, cz - 0.8], [0.7, cz - 0.8]]) b.box('chrome', x, 1.7, z, 0.04, 1.4, 0.04, col('#c9a227'));
    b.box('matte', 0, 2.42, cz, 1.6, 0.06, 1.9, col(pick(['#1a1a1a', '#0d47a1', '#7b1f1f'])));
    for (let x = -0.75; x <= 0.75; x += 0.1) b.box('matte', x, 2.3, cz + 0.96, 0.05, 0.2, 0.02, col(pick(['#ffd600', '#e91e63', '#ffffff'])));
    cartWheel(b, -0.85, cz, 0.72);
    cartWheel(b, 0.85, cz, 0.72);
  } else {
    const cz = -0.8;
    for (const x of [-0.3, 0.3]) b.box('wood', x, 0.75, 0.2, 0.05, 0.05, 1.6, col('#5d3a1a'));
    b.box('wood', 0, 0.62, cz, 1.2, 0.08, 1.6, col('#7a5534'));
    for (let k = 0; k < 4; k++) b.box('matte', rand(-0.35, 0.35), 0.85, cz + rand(-0.5, 0.5), 0.45, 0.35, 0.6, col(pick(['#d8c8a0', '#c0a878', '#e8e0d0'])));
    b.geom('rubber', WHEEL, mat4(-0.68, 0.34, cz, 0, 0.14, 0.34, 0.34));
    b.geom('rubber', WHEEL, mat4(0.68, 0.34, cz, 0, 0.14, 0.34, 0.34));
  }
  const M = vehicleMaterials();
  const mesh = b.build({ ...M, wood: M.matte });
  mesh.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  group.add(mesh);
  const driver = new Person(randomLook(true));
  driver.sit();
  driver.arms[0].rotation.x = driver.arms[1].rotation.x = -0.9;
  driver.group.position.set(0, tonga ? 1.29 - 0.92 : 0.95 - 0.92, tonga ? -0.55 : -0.2);
  group.add(driver.group);
  if (tonga && chance(0.6)) {
    const p = new Person(randomLook());
    p.sit();
    p.group.position.set(0.3, 1.29 - 0.92, -1.65);
    p.group.rotation.y = Math.PI;
    group.add(p.group);
  }
  let phase = Math.random() * 6;
  const animate = (dt, speed) => {
    phase += dt * speed * (tonga ? 2.6 : 3.6);
    const a = Math.min(speed / 4, 1) * 0.55;
    legs[0].rotation.x = Math.sin(phase) * a;
    legs[3].rotation.x = Math.sin(phase) * a;
    legs[1].rotation.x = -Math.sin(phase) * a;
    legs[2].rotation.x = -Math.sin(phase) * a;
  };
  return { group, len: tonga ? 4.4 : 3.2, width: tonga ? 1.8 : 1.4, animate };
}

export function makeVehicleMesh(type) {
  if (type === 'tonga' || type === 'donkey') return buildAnimalCart(type);
  const b = new Builder();
  let info;
  let artIndex = 0;
  switch (type) {
    case 'sedan': info = buildSedan(b, pick(CAR_COLORS)); break;
    case 'hatch': info = buildHatch(b, pick(CAR_COLORS)); break;
    case 'van': info = buildVan(b, pick(['#f4f4f2', '#f4f4f2', '#c0c3c7', '#9e1b1b'])); break;
    case 'pickup': info = buildPickup(b, pick(['#f4f4f2', '#1f3b73', '#b33a2a'])); break;
    case 'bus':
      artIndex = Math.floor(Math.random() * 3);
      info = buildBus(b, pick(['#f2c200', '#e65100', '#1b5e20', '#0d47a1']), artIndex);
      break;
    case 'truck':
      info = buildTruck(b, pick(['#f2c200', '#e65100', '#0d47a1', '#1b5e20', '#b71c1c', '#6a1b9a']), Math.floor(Math.random() * 5));
      break;
    default: info = buildBike(b, pick(['#b71c1c', '#b71c1c', '#111111', '#1a237e'])); break;
  }
  const M = vehicleMaterials();
  const mats = { ...M, art0: M.art[0], art1: M.art[1], art2: M.art[2], art3: M.art[3], art4: M.art[4], taj0: M.taj[0], taj1: M.taj[1], taj2: M.taj[2], wood: M.matte };
  const group = b.build(mats);
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = o.material !== M.head && o.material !== M.tail;
      if (/^bulb/.test(o.name)) o.castShadow = false;
    }
  });
  return { group, ...info };
}
