// Traffic vehicle models built from primitives: Corolla-style sedans, Mehran-style
// hatchbacks, Bolan carry vans, Ravi pickups, truck-art wagons and CD70 motorbikes.
import * as THREE from 'three';
import { Builder, mat4, col } from './builder.js';
import { pick, rand } from './util.js';
import { truckArtTexture } from './textures.js';

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
    art: [
      new THREE.MeshStandardMaterial({ map: truckArtTexture('اللہ ہو', '#0b3d91'), roughness: 0.5, vertexColors: true }),
      new THREE.MeshStandardMaterial({ map: truckArtTexture('پپو یار تنگ نہ کر', '#8b0000'), roughness: 0.5, vertexColors: true }),
      new THREE.MeshStandardMaterial({ map: truckArtTexture('دیکھ مگر پیار سے', '#0a5d2a'), roughness: 0.5, vertexColors: true }),
    ],
  };
  return VM;
}

export function setVehicleNight(n) {
  if (!VM) return;
  VM.head.emissiveIntensity = 0.05 + n * 6;
  VM.tail.emissiveIntensity = 0.1 + n * 2.5;
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
    b.box('dark', rand(-0.4, 0.4), 0.8 + rand(0, 0.1), bz + rand(-0.9, 0.9), 0.5, 0.4, 0.6, col(pick(['#c8b48a', '#a58a5c', '#e0e0d0', '#2e7d32'])));
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
  for (let k = 0; k < 4; k++) b.box('dark', rand(-0.5, 0.5), 3.0, rand(-2.5, 1.5), 0.7, 0.35, 0.8, col(pick(['#4a3a2a', '#1e3a5f', '#6d4c41', '#2e7d32'])));
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

export const TRAFFIC_MIX = [
  ['sedan', 10], ['hatch', 9], ['bike', 14], ['rickshaw', 7], ['van', 4], ['pickup', 3], ['bus', 3],
];

export function makeVehicleMesh(type) {
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
    default: info = buildBike(b, pick(['#b71c1c', '#b71c1c', '#111111', '#1a237e'])); break;
  }
  const M = vehicleMaterials();
  const mats = { ...M, art0: M.art[0], art1: M.art[1], art2: M.art[2] };
  const group = b.build(mats);
  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = o.material !== M.head && o.material !== M.tail;
    }
  });
  return { group, ...info };
}
