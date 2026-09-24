// Procedural Pakistani city: dense shop-houses, footpaths, tangled electric wires,
// medians with black & yellow kerbs, a Minar, a Mughal mosque, a CNG station and a bazaar.
import * as THREE from 'three';
import {
  N, PITCH, HALF_ROAD, WALK_W, CURB_H, MAIN_ROADS, BAY, FLOOR_H, SHOP_H,
  FACADE_TILE_W, FACADE_TILE_H, roadCoord, CITY_MIN, CITY_MAX, LOCALITIES,
} from './config.js';
import { ChunkedBuilder, mat4, col } from './builder.js';
import { rnd, rand, randInt, pick, chance, clamp } from './util.js';
import * as TX from './textures.js';
import { addMotorbike } from './vehicles.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

const FACADE_TINTS = [
  '#efe9dc', '#e8d9b5', '#dccbb0', '#f2e2c4', '#cfd9c9', '#d9c3b0', '#e6c6b8',
  '#c9d4dc', '#f0e0a8', '#bfcfc0', '#e7d3e0', '#d8b99a', '#f4efe6', '#b9c9d6',
  '#e3b98f', '#a9c2a4',
];
const OLD_TINTS = ['#c9a27e', '#b99a7a', '#d2b48c', '#c4a383', '#b58a6a'];
const AWNING_TINTS = ['#2f7d32', '#1565c0', '#e65100', '#c62828', '#f9a825', '#00838f', '#6a1b9a', '#546e7a'];

function makeMaterials() {
  const fac = [0, 1, 2].map((s) => TX.facadeTexture(s));
  const shops = [0, 1].map((s) => TX.shopTexture(s));
  const signs = TX.signAtlas();
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, vertexColors: true, ...o });
  const asphalt = TX.asphaltTexture();
  asphalt.repeat.set(1, 1);
  const M = {
    road: new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.93, metalness: 0 }),
    ground: std({ map: TX.dirtTexture(), vertexColors: false }),
    walk: std({ map: TX.paverTexture() }),
    curb: std({ map: TX.concreteTexture('#b5b0a6') }),
    brick: std({ map: TX.brickTexture() }),
    plaster: std({ map: TX.plasterTexture() }),
    roof: std({ map: TX.concreteTexture() }),
    concrete: std({}),
    metal: std({ roughness: 0.45, metalness: 0.6 }),
    plastic: std({ roughness: 0.55 }),
    wood: std({ roughness: 0.8 }),
    foliage: std({ roughness: 0.85, flatShading: true }),
    grass: std({ map: TX.grassTexture() }),
    marble: std({ map: TX.concreteTexture('#e6e3dc'), roughness: 0.55 }),
    sandstone: std({ map: TX.plasterTexture() }),
    awning: std({ map: TX.stripeTexture('#f4f4f4', '#c8c8c8', 10), side: THREE.DoubleSide }),
    flag: std({ side: THREE.DoubleSide, roughness: 0.8 }),
    median: std({ map: TX.stripeTexture('#1b1b1b', '#f2c200', 8) }),
    bump: std({ map: TX.stripeTexture('#1b1b1b', '#e9c000', 8, true) }),
    marking: new THREE.MeshStandardMaterial({
      color: 0xe8e6de, roughness: 0.8, alphaMap: TX.wornPaintTexture(), alphaTest: 0.45,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
    decal: new THREE.MeshStandardMaterial({
      map: TX.blotchTexture(), transparent: true, depthWrite: false, roughness: 0.95,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }),
    lamp: new THREE.MeshStandardMaterial({ color: 0x777777, emissive: 0xffd8a0, emissiveIntensity: 0, roughness: 0.4 }),
    signs: std({ map: signs.map, emissiveMap: signs.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 }),
  };
  fac.forEach((f, i) => {
    M['facade' + i] = std({ map: f.map, emissiveMap: f.emissive, emissive: 0xffffff, emissiveIntensity: 0 });
  });
  shops.forEach((s, i) => {
    M['shop' + i] = std({ map: s.map, emissiveMap: s.emissive, emissive: 0xffffff, emissiveIntensity: 0 });
  });
  return { M, signs };
}

export class City {
  constructor(scene) {
    this.scene = scene;
    const { M, signs } = makeMaterials();
    this.M = M;
    this.signs = signs;
    this.b = new ChunkedBuilder(110);
    this.circles = [];
    this.boxes = [];
    this.grid = new Map();
    this.blocks = [];
    this.bumps = [];
    this.poles = [];
    this.vendorSpots = [];
    this.wirePts = [];
    this.landmarks = [];
    this.lamps = [];
    this.station = null;

    this.makeBlocks();
    this.makeGround();
    this.makeRoadMarkings();
    this.makeMedians();
    for (const blk of this.blocks) this.populateBlock(blk);
    this.makeCrossWires();
    this.makeBunting();

    const group = this.b.build(M, {
      shadowKeys: ['brick', 'plaster', 'roof', 'concrete', 'metal', 'plastic', 'wood', 'foliage', 'marble',
        'sandstone', 'awning', 'facade0', 'facade1', 'facade2', 'shop0', 'shop1', 'signs', 'lamp', 'median', 'flag'],
    });
    scene.add(group);
    this.group = group;

    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(this.wirePts, 3));
    const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x151515 }));
    scene.add(wires);

    this.indexColliders();
  }

  // ------------------------------------------------------------ layout ---

  makeBlocks() {
    const names = [...LOCALITIES];
    for (let i = names.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [names[i], names[j]] = [names[j], names[i]];
    }
    let k = 0;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const blk = {
          i, j,
          x0: roadCoord(i) + HALF_ROAD, x1: roadCoord(i + 1) - HALF_ROAD,
          z0: roadCoord(j) + HALF_ROAD, z1: roadCoord(j + 1) - HALF_ROAD,
          sides: ['minX', 'maxX', 'minZ', 'maxZ'],
          kind: 'normal', name: names[k++ % names.length], solid: true, inner: true,
        };
        if (i === 3 && j === 3) { blk.kind = 'park'; blk.name = 'Minar-e-Pakistan'; }
        else if (i === 1 && j === 4) { blk.kind = 'mosque'; blk.name = 'Badshahi Masjid'; }
        else if (i === 5 && j === 2) { blk.kind = 'station'; blk.name = 'CNG Station'; blk.solid = false; }
        else if (i === 4 && j === 5) { blk.kind = 'bazaar'; blk.name = 'Anarkali Bazaar'; }
        else if (i === 2 && j === 1) { blk.kind = 'bazaar'; blk.name = 'Liberty Market'; }
        this.blocks.push(blk);
      }
    }
    const O = 44;
    const lo = CITY_MIN - HALF_ROAD;
    const hi = CITY_MAX + HALF_ROAD;
    const strip = (x0, x1, z0, z1, side) => ({
      x0, x1, z0, z1, sides: [side], kind: 'strip', name: 'Outskirts', solid: true, inner: false,
    });
    this.blocks.push(strip(lo, hi, lo - O, lo, 'maxZ'));
    this.blocks.push(strip(lo, hi, hi, hi + O, 'minZ'));
    this.blocks.push(strip(lo - O, lo, lo - O, hi + O, 'maxX'));
    this.blocks.push(strip(hi, hi + O, lo - O, hi + O, 'minX'));
  }

  isBlockCoord(v) {
    if (v < CITY_MIN - HALF_ROAD || v > CITY_MAX + HALF_ROAD) return true;
    const i = clamp(Math.floor((v - CITY_MIN) / PITCH), 0, N - 1);
    const local = v - roadCoord(i);
    return local > HALF_ROAD && local < PITCH - HALF_ROAD;
  }

  onFootpath(x, z) {
    const outside = x < CITY_MIN - HALF_ROAD || x > CITY_MAX + HALF_ROAD || z < CITY_MIN - HALF_ROAD || z > CITY_MAX + HALF_ROAD;
    return outside || (this.isBlockCoord(x) && this.isBlockCoord(z));
  }

  groundHeight(x, z) {
    return this.onFootpath(x, z) ? CURB_H : 0;
  }

  blockAt(x, z) {
    for (const b of this.blocks) if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return b;
    return null;
  }

  // ------------------------------------------------------------ ground ---

  makeGround() {
    const b = this.b;
    const E = CITY_MAX + HALF_ROAD + 60;
    const T = 12; // asphalt texture metres
    // city-wide road surface (blocks sit on top as raised footpaths)
    b.quad('road', V(-E, 0, E), V(E, 0, E), V(E, 0, -E), V(-E, 0, -E), [-E / T, -E / T, E / T, E / T]);
    const G = 1600;
    b.quad('ground', V(-G, -0.05, G), V(G, -0.05, G), V(G, -0.05, -G), V(-G, -0.05, -G), [0, 0, G / 8, G / 8]);

    const grey = col('#ffffff');
    for (const blk of this.blocks) {
      const { x0, x1, z0, z1 } = blk;
      const y = CURB_H;
      const P = 3.5;
      b.quad('walk', V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), [x0 / P, -z1 / P, x1 / P, -z0 / P], grey);
      const curbCol = col('#d8d4cc');
      b.quad('curb', V(x0, 0, z1), V(x1, 0, z1), V(x1, y, z1), V(x0, y, z1), [0, 0, (x1 - x0) / 4, 0.05], curbCol);
      b.quad('curb', V(x1, 0, z0), V(x0, 0, z0), V(x0, y, z0), V(x1, y, z0), [0, 0, (x1 - x0) / 4, 0.05], curbCol);
      b.quad('curb', V(x1, 0, z1), V(x1, 0, z0), V(x1, y, z0), V(x1, y, z1), [0, 0, (z1 - z0) / 4, 0.05], curbCol);
      b.quad('curb', V(x0, 0, z0), V(x0, 0, z1), V(x0, y, z1), V(x0, y, z0), [0, 0, (z1 - z0) / 4, 0.05], curbCol);
    }
  }

  // ------------------------------------------------------------ markings ---

  makeRoadMarkings() {
    const b = this.b;
    const y = 0.012;
    const mark = (x0, z0, x1, z1) => {
      b.quad('marking', V(x0, y, z1), V(x1, y, z1), V(x1, y, z0), V(x0, y, z0), [x0 / 3, z0 / 3, x1 / 3, z1 / 3]);
    };
    for (let r = 0; r <= N; r++) {
      const c = roadCoord(r);
      const main = MAIN_ROADS.has(r);
      for (let s = 0; s < N; s++) {
        const a = roadCoord(s) + HALF_ROAD + 4;
        const e = roadCoord(s + 1) - HALF_ROAD - 4;
        const offs = main ? [-3.5, 3.5] : [0];
        for (const o of offs) {
          for (let t = a; t < e - 3; t += 9) {
            mark(c + o - 0.07, t, c + o + 0.07, t + 3); // road along Z
            mark(t, c + o - 0.07, t + 3, c + o + 0.07); // road along X
          }
        }
        if (main) {
          for (const o of [-6.4, 6.4]) {
            mark(c + o - 0.08, a, c + o + 0.08, e);
            mark(a, c + o - 0.08, e, c + o + 0.08);
          }
        }
      }
    }
    // zebra crossings where a main road meets another road
    for (let i = 0; i <= N; i++) {
      for (let j = 0; j <= N; j++) {
        if (!MAIN_ROADS.has(i) && !MAIN_ROADS.has(j)) continue;
        const cx = roadCoord(i);
        const cz = roadCoord(j);
        for (let k = -6; k <= 6; k += 1.1) {
          if (j > 0) mark(cx + k, cz - HALF_ROAD - 3.4, cx + k + 0.55, cz - HALF_ROAD - 0.6);
          if (j < N) mark(cx + k, cz + HALF_ROAD + 0.6, cx + k + 0.55, cz + HALF_ROAD + 3.4);
          if (i > 0) mark(cx - HALF_ROAD - 3.4, cz + k, cx - HALF_ROAD - 0.6, cz + k + 0.55);
          if (i < N) mark(cx + HALF_ROAD + 0.6, cz + k, cx + HALF_ROAD + 3.4, cz + k + 0.55);
        }
      }
    }
    // potholes, patch-work and stains
    for (let n = 0; n < 220; n++) {
      const along = rand(CITY_MIN, CITY_MAX);
      const r = randInt(0, N);
      const across = roadCoord(r) + rand(-6, 6);
      const [x, z] = chance(0.5) ? [along, across] : [across, along];
      const s = rand(0.8, 3.5);
      const a = rnd() * Math.PI;
      const c = Math.cos(a) * s;
      const d = Math.sin(a) * s;
      const yy = 0.008;
      b.quad('decal', V(x - c + d, yy, z - d - c), V(x - c - d, yy, z - d + c), V(x + c - d, yy, z + d + c), V(x + c + d, yy, z + d - c), [0, 0, 1, 1]);
    }
    // speed breakers on the side streets
    for (let n = 0; n < 16; n++) {
      let r;
      do r = randInt(0, N); while (MAIN_ROADS.has(r));
      const s = randInt(0, N - 1);
      const t = (roadCoord(s) + roadCoord(s + 1)) / 2 + rand(-15, 15);
      const c = roadCoord(r);
      const alongZ = chance(0.5);
      const bump = alongZ
        ? { x0: c - HALF_ROAD, x1: c + HALF_ROAD, z0: t - 0.45, z1: t + 0.45 }
        : { x0: t - 0.45, x1: t + 0.45, z0: c - HALF_ROAD, z1: c + HALF_ROAD };
      this.bumps.push(bump);
      const m = alongZ ? mat4(c, 0, t, 0, HALF_ROAD * 2, 0.22, 0.9) : mat4(t, 0, c, Math.PI / 2, HALF_ROAD * 2, 0.22, 0.9);
      this.b.geom('bump', BUMP, m);
    }
  }

  // --------------------------------------------------------------- medians ---

  makeMedians() {
    const b = this.b;
    const H = 0.3;
    const W = 0.45;
    for (const r of MAIN_ROADS) {
      const c = roadCoord(r);
      for (let s = 0; s < N; s++) {
        const a = roadCoord(s) + HALF_ROAD + 4;
        const e = roadCoord(s + 1) - HALF_ROAD - 4;
        const L = e - a;
        for (const alongZ of [true, false]) {
          const P = (u, y, w) => (alongZ ? V(c + w, y, u) : V(u, y, c + w));
          // long sides with black/yellow kerb paint
          if (alongZ) {
            b.quad('median', P(e, 0, W), P(a, 0, W), P(a, H, W), P(e, H, W), [0, 0, L / 4, 1]);
            b.quad('median', P(a, 0, -W), P(e, 0, -W), P(e, H, -W), P(a, H, -W), [0, 0, L / 4, 1]);
            b.quad('grass', P(a, H, -W), P(e, H, -W), P(e, H, W), P(a, H, W), [0, 0, L / 4, 0.25]);
            b.quad('median', P(a, 0, W), P(a, 0, -W), P(a, H, -W), P(a, H, W), [0, 0, 0.25, 1]);
            b.quad('median', P(e, 0, -W), P(e, 0, W), P(e, H, W), P(e, H, -W), [0, 0, 0.25, 1]);
            this.boxes.push({ minX: c - W, maxX: c + W, minZ: a, maxZ: e });
          } else {
            b.quad('median', P(a, 0, W), P(e, 0, W), P(e, H, W), P(a, H, W), [0, 0, L / 4, 1]);
            b.quad('median', P(e, 0, -W), P(a, 0, -W), P(a, H, -W), P(e, H, -W), [0, 0, L / 4, 1]);
            b.quad('grass', P(a, H, W), P(e, H, W), P(e, H, -W), P(a, H, -W), [0, 0, L / 4, 0.25]);
            b.quad('median', P(a, 0, -W), P(a, 0, W), P(a, H, W), P(a, H, -W), [0, 0, 0.25, 1]);
            b.quad('median', P(e, 0, W), P(e, 0, -W), P(e, H, -W), P(e, H, W), [0, 0, 0.25, 1]);
            this.boxes.push({ minX: a, maxX: e, minZ: c - W, maxZ: c + W });
          }
          // twin-arm street lights and little shrubs on the median
          for (let t = a + 6; t < e - 4; t += 22) {
            const p = P(t, H, 0);
            this.medianLamp(p.x, p.z, alongZ);
          }
          for (let t = a + 2; t < e - 2; t += rand(3, 6)) {
            const p = P(t, H, 0);
            b.geom('foliage', SHRUB, mat4(p.x, H + 0.25, p.z, rnd() * 6, 0.5, rand(0.4, 0.7), 0.5), col(pick(['#3f6b2a', '#56782f', '#2f5a24'])));
          }
        }
      }
    }
  }

  medianLamp(x, z, alongZ) {
    const b = this.b;
    const grey = col('#8c8c8c');
    b.geom('metal', POLE_ROUND, mat4(x, 0.3 + 4.5, z, 0, 1, 9, 1), grey);
    const yaw = alongZ ? 0 : Math.PI / 2;
    for (const s of [-1, 1]) {
      const dx = alongZ ? s * 1.3 : 0;
      const dz = alongZ ? 0 : s * 1.3;
      b.box('metal', x + dx / 2, 9.1, z + dz / 2, 2.6 / 2 + 0.2, 0.08, 0.08, grey, yaw);
      b.box('metal', x + dx, 9.05, z + dz, 0.7, 0.14, 0.3, col('#555'), yaw);
      b.box('lamp', x + dx, 8.96, z + dz, 0.55, 0.05, 0.22, col('#fff'), yaw);
      this.lamps.push(new THREE.Vector3(x + dx, 8.8, z + dz));
    }
    this.circles.push({ x, z, r: 0.25 });
  }

  // ------------------------------------------------------------ blocks ---

  populateBlock(blk) {
    if (blk.kind === 'park') return this.makePark(blk);
    if (blk.kind === 'mosque') return this.makeMosque(blk);
    if (blk.kind === 'station') return this.makeStation(blk);

    const lx0 = blk.x0 + WALK_W;
    const lx1 = blk.x1 - WALK_W;
    const lz0 = blk.z0 + WALK_W;
    const lz1 = blk.z1 - WALK_W;
    const CD = 18;
    for (const side of blk.sides) {
      const e = sideFrame(side, lx0, lx1, lz0, lz1);
      let t0 = 0;
      let t1 = e.len;
      if (blk.inner && (side === 'minX' || side === 'maxX')) {
        t0 = CD;
        t1 = e.len - CD;
      }
      const mainRoad = this.facesMainRoad(blk, side);
      let t = t0;
      while (t < t1 - 0.5) {
        let w = BAY * randInt(2, 4);
        if (t1 - t - w < 7) w = t1 - t;
        if (w > 17.5) w = BAY * 3;
        const corner = blk.inner && (side === 'minZ' || side === 'maxZ') && (t < 1 || t + w > e.len - 1);
        const depth = corner ? CD : rand(10, 16);
        let floors = mainRoad ? randInt(2, 5) : randInt(1, 4);
        if (chance(0.08)) floors = 0;
        if (chance(0.05)) floors = randInt(6, 8);
        this.building(e, t, w, depth, floors, blk);
        t += w;
      }
      this.streetFurniture(blk, side);
    }
    // interior filler so gaps never reveal the void inside the block
    const fh = rand(5, 7);
    const fx0 = lx0 + (blk.sides.includes('minX') ? 10 : 0);
    const fx1 = lx1 - (blk.sides.includes('maxX') ? 10 : 0);
    const fz0 = lz0 + (blk.sides.includes('minZ') ? 10 : 0);
    const fz1 = lz1 - (blk.sides.includes('maxZ') ? 10 : 0);
    if (fx1 > fx0 && fz1 > fz0) {
      this.b.quad('roof', V(fx0, fh, fz1), V(fx1, fh, fz1), V(fx1, fh, fz0), V(fx0, fh, fz0), [0, 0, (fx1 - fx0) / 8, (fz1 - fz0) / 8], col('#bbb'));
    }
    if (blk.solid) this.boxes.push({ minX: lx0, maxX: lx1, minZ: lz0, maxZ: lz1 });
  }

  facesMainRoad(blk, side) {
    if (!blk.inner) return false;
    if (side === 'minX') return MAIN_ROADS.has(blk.i);
    if (side === 'maxX') return MAIN_ROADS.has(blk.i + 1);
    if (side === 'minZ') return MAIN_ROADS.has(blk.j);
    return MAIN_ROADS.has(blk.j + 1);
  }

  building(e, t, w, d, floors, blk) {
    const b = this.b;
    const { C, A, F } = e;
    const base = C.clone().addScaledVector(A, t).setY(CURB_H);
    const oldCity = blk.i === 0 || blk.j === 0 || (blk.i === 1 && blk.j >= 3) || blk.kind === 'bazaar';
    const style = oldCity && chance(0.6) ? 2 : randInt(0, 1);
    const tint = col(style === 2 ? pick(OLD_TINTS) : pick(FACADE_TINTS));
    const H = SHOP_H + floors * FLOOR_H;
    const yaw = Math.atan2(F.x, F.z);
    const pt = (a, y, f) => base.clone().addScaledVector(A, a).addScaledVector(F, f).setY(CURB_H + y);
    const U = (x) => x / FACADE_TILE_W;
    const uoff = randInt(0, 3) * 0.25;

    // shop floor
    const shopKey = 'shop' + randInt(0, 1);
    const su = randInt(0, 3) * 0.25;
    b.quad(shopKey, pt(0, 0, 0), pt(w, 0, 0), pt(w, SHOP_H, 0), pt(0, SHOP_H, 0), [su, 0, su + U(w), 1], col('#f2eee8'));
    // upper floors
    if (floors > 0) {
      const voff = randInt(0, 3) * 0.25;
      b.quad('facade' + style, pt(0, SHOP_H, 0), pt(w, SHOP_H, 0), pt(w, H, 0), pt(0, H, 0),
        [uoff, voff, uoff + U(w), voff + (H - SHOP_H) / FACADE_TILE_H], tint);
    }
    // sides & back in raw brick or plaster
    const sideKey = chance(0.55) ? 'brick' : 'plaster';
    const sideTint = sideKey === 'brick' ? col('#ffffff') : tint;
    const bu = d / 4;
    const bv = H / 4;
    b.quad(sideKey, pt(0, 0, -d), pt(0, 0, 0), pt(0, H, 0), pt(0, H, -d), [0, 0, bu, bv], sideTint);
    b.quad(sideKey, pt(w, 0, 0), pt(w, 0, -d), pt(w, H, -d), pt(w, H, 0), [0, 0, bu, bv], sideTint);
    b.quad(sideKey, pt(w, 0, -d), pt(0, 0, -d), pt(0, H, -d), pt(w, H, -d), [0, 0, w / 4, bv], sideTint);
    b.quad('roof', pt(0, H, 0), pt(w, H, 0), pt(w, H, -d), pt(0, H, -d), [0, 0, w / 8, d / 8], col('#cfcac2'));

    // parapet
    if (floors > 0) {
      const ph = 0.9;
      const c = base.clone().addScaledVector(A, w / 2);
      const pc = (a, f) => c.clone().addScaledVector(A, a).addScaledVector(F, f);
      let p = pc(0, -0.1);
      b.box('plaster', p.x, CURB_H + H + ph / 2, p.z, w, ph, 0.2, tint, yaw);
      p = pc(0, -d + 0.1);
      b.box('plaster', p.x, CURB_H + H + ph / 2, p.z, w, ph, 0.2, tint, yaw);
      p = pc(-w / 2 + 0.1, -d / 2);
      b.box('plaster', p.x, CURB_H + H + ph / 2, p.z, 0.2, ph, d, tint, yaw);
      p = pc(w / 2 - 0.1, -d / 2);
      b.box('plaster', p.x, CURB_H + H + ph / 2, p.z, 0.2, ph, d, tint, yaw);
    }

    // shop signboard
    const shopSign = blk.kind === 'bazaar' || chance(0.8);
    if (shopSign) {
      const sw = Math.min(w * 0.92, 12);
      const a0 = (w - sw) / 2;
      const sh = Math.min(sw / 8, 1.0);
      const y0 = SHOP_H + 0.05;
      const fr = base.clone().addScaledVector(A, w / 2).addScaledVector(F, 0.06);
      b.box('metal', fr.x, CURB_H + y0 + sh / 2, fr.z, sw + 0.1, sh + 0.1, 0.12, col('#2a2a2a'), yaw);
      const uv = this.signs.uv(randInt(0, TX.SIGN_COUNT - 1));
      b.quad('signs', pt(a0, y0, 0.125), pt(a0 + sw, y0, 0.125), pt(a0 + sw, y0 + sh, 0.125), pt(a0, y0 + sh, 0.125), uv);
    }
    // awning over the footpath
    if (blk.kind === 'bazaar' || chance(0.45)) {
      const tcol = col(pick(AWNING_TINTS));
      const out = rand(1.2, 1.8);
      const yTop = SHOP_H - 0.15;
      const yLow = SHOP_H - 0.75;
      b.quad('awning', pt(0.1, yLow, out), pt(w - 0.1, yLow, out), pt(w - 0.1, yTop, 0.02), pt(0.1, yTop, 0.02), [0, 0, w / 2, 1], tcol);
      b.quad('awning', pt(0.1, yLow - 0.3, out), pt(w - 0.1, yLow - 0.3, out), pt(w - 0.1, yLow, out), pt(0.1, yLow, out), [0, 0, w / 2, 0.2], tcol);
    }

    // balconies, AC units, banners per floor
    const bays = Math.floor(w / BAY);
    for (let f = 0; f < floors; f++) {
      const fy = SHOP_H + f * FLOOR_H;
      for (let k = 0; k < bays; k++) {
        const ac = (k + 0.5) * BAY;
        if (f > 0 && chance(0.16)) {
          const p = base.clone().addScaledVector(A, ac).addScaledVector(F, 0.5);
          b.box('concrete', p.x, CURB_H + fy + 0.07, p.z, BAY * 0.95, 0.14, 1.0, tint, yaw);
          const r = base.clone().addScaledVector(A, ac).addScaledVector(F, 0.98);
          const railCol = col(pick(['#2b2b2b', '#1f3f2f', '#3b3b55', '#6b2020']));
          b.box('metal', r.x, CURB_H + fy + 0.6, r.z, BAY * 0.95, 0.9, 0.05, railCol, yaw);
          for (const s of [-1, 1]) {
            const rs = base.clone().addScaledVector(A, ac + s * BAY * 0.47).addScaledVector(F, 0.5);
            b.box('metal', rs.x, CURB_H + fy + 0.6, rs.z, 0.05, 0.9, 1.0, railCol, yaw);
          }
          if (chance(0.4)) {
            // washing hung out to dry
            const cl = base.clone().addScaledVector(A, ac + rand(-0.6, 0.6)).addScaledVector(F, 1.0);
            b.box('flag', cl.x, CURB_H + fy + 0.75, cl.z, rand(0.5, 1.2), rand(0.5, 0.9), 0.02, col(pick(['#c62828', '#f5f5f5', '#1565c0', '#2e7d32', '#f9a825', '#6d4c41'])), yaw);
          }
        } else if (chance(0.12)) {
          const p = base.clone().addScaledVector(A, ac + pick([-1, 1]) * 1.1).addScaledVector(F, 0.2);
          b.box('plastic', p.x, CURB_H + fy + 0.5, p.z, 0.85, 0.55, 0.4, col('#e4e4e0'), yaw);
          b.box('metal', p.x, CURB_H + fy + 0.2, p.z, 0.9, 0.05, 0.45, col('#555'), yaw);
        }
      }
    }
    if (floors >= 2 && chance(0.18)) {
      const bw = Math.min(w * 0.8, 10);
      const bh = bw / 8 * 1.6;
      const a0 = (w - bw) / 2;
      const y0 = SHOP_H + FLOOR_H + 0.4;
      const uv = this.signs.uv(randInt(0, TX.SIGN_COUNT - 1));
      b.quad('signs', pt(a0, y0, 0.08), pt(a0 + bw, y0, 0.08), pt(a0 + bw, y0 + bh, 0.08), pt(a0, y0 + bh, 0.08), uv);
    }

    // rooftop clutter
    const roofY = CURB_H + H;
    const tanks = floors > 0 ? randInt(0, 2) : 0;
    for (let k = 0; k < tanks; k++) {
      const p = base.clone().addScaledVector(A, rand(1.5, w - 1.5)).addScaledVector(F, -rand(2, d - 2));
      const r = rand(0.55, 0.8);
      const h = rand(1.0, 1.4);
      b.box('concrete', p.x, roofY + 0.4, p.z, r * 2, 0.8, r * 2, col('#9a958c'), yaw);
      b.geom('plastic', TANK, mat4(p.x, roofY + 0.8 + h / 2, p.z, 0, r, h, r), col(pick(['#1a1a1a', '#1a1a1a', '#23458c', '#e8e8e8', '#b8b8b0'])));
    }
    if (floors > 0 && chance(0.4)) {
      // stair tower (mumty)
      const p = base.clone().addScaledVector(A, rand(2, w - 2)).addScaledVector(F, -d + 2);
      b.box('plaster', p.x, roofY + 1.3, p.z, 2.6, 2.6, 2.6, tint, yaw);
      b.box('roof', p.x, roofY + 2.65, p.z, 3.0, 0.12, 3.0, col('#bbb'), yaw);
    }
    if (floors > 0 && chance(0.22)) {
      // unfinished next storey: rebar sticking out of columns
      for (let a = 0.3; a < w; a += BAY) {
        for (const f of [-0.3, -d + 0.3]) {
          const p = base.clone().addScaledVector(A, a).addScaledVector(F, f);
          b.box('concrete', p.x, roofY + 0.5, p.z, 0.3, 1.0, 0.3, col('#a7a39b'), yaw);
          for (const [ox, oz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) {
            b.box('metal', p.x + ox, roofY + 1.5, p.z + oz, 0.025, 1.2, 0.025, col('#5a3a28'), yaw);
          }
        }
      }
    }
    if (floors > 0 && chance(0.15)) {
      const p = base.clone().addScaledVector(A, rand(1, w - 1)).addScaledVector(F, -1.2);
      b.geom('plastic', DISH, mat4(p.x, roofY + 1.2, p.z, yaw + rand(-1, 1), 1, 1, 1, -0.7), col('#d0d0d0'));
      b.box('metal', p.x, roofY + 0.6, p.z, 0.05, 1.2, 0.05, col('#444'), yaw);
    }
    if (floors >= 3 && chance(0.07)) {
      // rooftop billboard
      const bw = Math.min(w, 12);
      const bh = bw / 8 * 2.2;
      const p = base.clone().addScaledVector(A, w / 2).addScaledVector(F, -1);
      for (const s of [-0.4, 0.4]) {
        const q = p.clone().addScaledVector(A, s * bw);
        b.box('metal', q.x, roofY + 1.5, q.z, 0.15, 3, 0.15, col('#333'), yaw);
      }
      b.box('metal', p.x, roofY + 3 + bh / 2, p.z, bw + 0.2, bh + 0.2, 0.2, col('#2a2a2a'), yaw);
      const uv = this.signs.uv(randInt(0, TX.SIGN_COUNT - 1));
      const a0 = (w - bw) / 2;
      b.quad('signs', pt(a0, H + 3, -0.88), pt(a0 + bw, H + 3, -0.88), pt(a0 + bw, H + 3 + bh, -0.88), pt(a0, H + 3 + bh, -0.88), uv);
    }
  }

  // ------------------------------------------------------ street furniture ---

  streetFurniture(blk, side) {
    const b = this.b;
    // curb line (block edge) frame
    const e = sideFrame(side, blk.x0, blk.x1, blk.z0, blk.z1);
    const { C, A, F } = e;
    const onCurb = (t, inset) => C.clone().addScaledVector(A, t).addScaledVector(F, -inset);
    const sidePoles = [];
    const start = rand(4, 10);
    for (let t = start; t < e.len - 3; t += rand(24, 30)) {
      const p = onCurb(t, 0.45);
      this.pole(p, A, F, sidePoles);
    }
    for (let k = 0; k + 1 < sidePoles.length; k++) this.wiresBetween(sidePoles[k], sidePoles[k + 1]);

    const nearPole = (p, r) => sidePoles.some((q) => q.pos.distanceTo(p) < r);
    // trees
    if (chance(blk.kind === 'bazaar' ? 0.2 : 0.45)) {
      for (let t = rand(6, 12); t < e.len - 6; t += rand(10, 20)) {
        const p = onCurb(t, 0.9);
        if (nearPole(p, 3)) continue;
        this.tree(p.x, p.z);
      }
    }
    // push-cart vendors
    const carts = blk.kind === 'bazaar' ? randInt(2, 4) : chance(0.3) ? 1 : 0;
    for (let k = 0; k < carts; k++) {
      const t = rand(8, e.len - 8);
      const p = onCurb(t, 1.3);
      if (nearPole(p, 2.5)) continue;
      this.cart(p, A, F);
    }
    // parked motorbikes
    if (chance(blk.kind === 'bazaar' ? 0.8 : 0.3)) {
      const t0 = rand(8, e.len - 14);
      const n = randInt(2, 5);
      for (let k = 0; k < n; k++) {
        const p = onCurb(t0 + k * 0.9, 1.6);
        if (nearPole(p, 1.5)) continue;
        const yaw = Math.atan2(F.x, F.z) + Math.PI + rand(-0.25, 0.25);
        addMotorbike(b, mat4(p.x, CURB_H, p.z, yaw), col(pick(['#b71c1c', '#111111', '#b71c1c', '#1a237e', '#c62828'])), true);
        this.circles.push({ x: p.x, z: p.z, r: 0.5 });
      }
    }
  }

  pole(p, A, F, list) {
    const b = this.b;
    const grey = col('#a8a49c');
    const yaw = Math.atan2(F.x, F.z);
    b.geom('concrete', POLE_SQUARE, mat4(p.x, CURB_H + 4.6, p.z, yaw + Math.PI / 4, 1, 9.2, 1), grey);
    // cross arm with insulators
    b.box('metal', p.x, CURB_H + 8.7, p.z, 1.8, 0.1, 0.1, col('#4a4a4a'), yaw);
    for (const s of [-0.8, 0, 0.8]) {
      const q = p.clone().addScaledVector(A, s);
      b.box('plastic', q.x, CURB_H + 8.85, q.z, 0.08, 0.2, 0.08, col('#5a3a2a'), yaw);
    }
    if (chance(0.18)) {
      const q = p.clone().addScaledVector(F, -0.45);
      b.box('metal', q.x, CURB_H + 6.2, q.z, 0.9, 1.2, 0.6, col('#6e7a6c'), yaw);
      for (const s of [-0.25, 0, 0.25]) {
        const r = q.clone().addScaledVector(A, s);
        b.box('plastic', r.x, CURB_H + 6.95, r.z, 0.07, 0.3, 0.07, col('#6b4a3a'), yaw);
      }
    }
    // cable-TV junction boxes & tangle of loops
    if (chance(0.35)) b.box('plastic', p.x, CURB_H + 5, p.z, 0.35, 0.45, 0.35, col('#222'), yaw);
    if (chance(0.55)) {
      const arm = p.clone().addScaledVector(F, 1.3);
      const mid = p.clone().addScaledVector(F, 0.65);
      b.box('metal', mid.x, CURB_H + 7.6, mid.z, 0.07, 0.07, 1.3, col('#666'), yaw);
      b.box('metal', arm.x, CURB_H + 7.5, arm.z, 0.3, 0.14, 0.6, col('#555'), yaw);
      b.box('lamp', arm.x, CURB_H + 7.42, arm.z, 0.22, 0.04, 0.45, col('#fff'), yaw);
      this.lamps.push(new THREE.Vector3(arm.x, CURB_H + 7.3, arm.z));
    }
    this.circles.push({ x: p.x, z: p.z, r: 0.3 });
    const entry = { pos: p.clone(), A: A.clone(), F: F.clone() };
    list.push(entry);
    this.poles.push(entry);
  }

  catenary(p0, p1, sag, segs = 10) {
    for (let s = 0; s < segs; s++) {
      const a = s / segs;
      const c = (s + 1) / segs;
      const ya = p0.y + (p1.y - p0.y) * a - sag * 4 * a * (1 - a);
      const yc = p0.y + (p1.y - p0.y) * c - sag * 4 * c * (1 - c);
      this.wirePts.push(
        p0.x + (p1.x - p0.x) * a, ya, p0.z + (p1.z - p0.z) * a,
        p0.x + (p1.x - p0.x) * c, yc, p0.z + (p1.z - p0.z) * c,
      );
    }
  }

  wiresBetween(a, b) {
    for (const s of [-0.8, 0, 0.8]) {
      const p0 = a.pos.clone().addScaledVector(a.A, s).setY(CURB_H + 8.95);
      const p1 = b.pos.clone().addScaledVector(b.A, s).setY(CURB_H + 8.95);
      this.catenary(p0, p1, rand(0.35, 0.6));
    }
    const extra = randInt(2, 6);
    for (let k = 0; k < extra; k++) {
      const y0 = CURB_H + rand(4.8, 6.5);
      const y1 = CURB_H + rand(4.8, 6.5);
      const p0 = a.pos.clone().setY(y0);
      const p1 = b.pos.clone().setY(y1);
      this.catenary(p0, p1, rand(0.6, 1.6));
    }
  }

  // Wires that criss-cross the street between opposite poles
  makeCrossWires() {
    for (const p of this.poles) {
      if (!chance(0.35)) continue;
      let best = null;
      let bd = 1e9;
      for (const q of this.poles) {
        if (q === p) continue;
        if (q.F.dot(p.F) > -0.9) continue; // must be on the other side of the road
        const d = p.pos.distanceTo(q.pos);
        if (d > 8 && d < 22 && d < bd) {
          bd = d;
          best = q;
        }
      }
      if (!best) continue;
      const n = randInt(1, 4);
      for (let k = 0; k < n; k++) {
        this.catenary(p.pos.clone().setY(CURB_H + rand(5.5, 7.2)), best.pos.clone().setY(CURB_H + rand(5.5, 7.2)), rand(0.4, 1.2));
      }
    }
  }

  // Green & white flag bunting across the bazaar streets
  makeBunting() {
    const b = this.b;
    const green = col('#01411c');
    const white = col('#f5f5f5');
    for (const blk of this.blocks) {
      if (blk.kind !== 'bazaar' && blk.kind !== 'park') continue;
      for (let k = 0; k < 8; k++) {
        const side = pick(['minX', 'maxX', 'minZ', 'maxZ']);
        const e = sideFrame(side, blk.x0, blk.x1, blk.z0, blk.z1);
        const t = rand(5, e.len - 5);
        const p0 = e.C.clone().addScaledVector(e.A, t).addScaledVector(e.F, -0.3).setY(CURB_H + 6.2);
        const p1 = p0.clone().addScaledVector(e.F, HALF_ROAD * 2 + 0.6).addScaledVector(e.A, rand(-6, 6));
        const L = p0.distanceTo(p1);
        const dir = p1.clone().sub(p0).normalize();
        const sag = 0.9;
        this.catenary(p0, p1, sag);
        const n = Math.floor(L / 0.55);
        for (let s = 0; s < n; s++) {
          const a = (s + 0.2) / n;
          const c = (s + 0.8) / n;
          const pa = p0.clone().lerp(p1, a);
          pa.y -= sag * 4 * a * (1 - a);
          const pc = p0.clone().lerp(p1, c);
          pc.y -= sag * 4 * c * (1 - c);
          const tip = pa.clone().lerp(pc, 0.5);
          tip.y -= 0.35;
          b.quad('flag', pa, pc, tip, tip, [0, 0, 1, 1], s % 2 ? green : white);
          void dir;
        }
      }
    }
  }

  tree(x, z) {
    const b = this.b;
    const h = rand(2.6, 3.8);
    b.geom('wood', TRUNK, mat4(x, CURB_H + h / 2, z, rnd() * 6, rand(0.8, 1.2), h, rand(0.8, 1.2)), col('#5d4a38'));
    // whitewashed base (very common on city trees)
    b.geom('wood', TRUNK, mat4(x, CURB_H + 0.5, z, 0, 1.08, 1.0, 1.08), col('#e8e4d8'));
    const n = randInt(4, 7);
    const R = rand(1.8, 2.8);
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      const r = rand(0, R * 0.6);
      const s = rand(1.0, 1.7);
      b.geom('foliage', FOLIAGE,
        mat4(x + Math.cos(a) * r, CURB_H + h + rand(0.2, 1.6), z + Math.sin(a) * r, rnd() * 6, s * rand(1, 1.3), s * 0.8, s * rand(1, 1.3)),
        col(pick(['#3d5f2a', '#4b6e2e', '#5a7a35', '#35522a', '#6b7f3a'])));
    }
    this.circles.push({ x, z, r: 0.35 });
  }

  cart(p, A, F) {
    const b = this.b;
    const yaw = Math.atan2(A.x, A.z);
    const y = CURB_H;
    b.box('wood', p.x, y + 0.85, p.z, 1.0, 0.1, 2.0, col('#7a5234'), yaw);
    b.box('wood', p.x, y + 0.95, p.z, 1.05, 0.12, 2.05, col('#2e7d32'), yaw);
    for (const s of [-0.6, 0.6]) {
      const q = p.clone().addScaledVector(F, s);
      b.geom('plastic', WHEEL, mat4(q.x, y + 0.35, q.z, yaw, 0.7, 0.12, 0.7, 0, Math.PI / 2), col('#222'));
    }
    const fruitCol = pick([['#ff8f00', '#ffa000'], ['#c62828', '#b71c1c'], ['#fdd835', '#f9a825'], ['#7cb342', '#558b2f'], ['#6a1b9a', '#4a148c']]);
    for (let k = 0; k < 28; k++) {
      const q = p.clone().addScaledVector(A, rand(-0.85, 0.85)).addScaledVector(F, rand(-0.4, 0.4));
      b.geom('plastic', FRUIT, mat4(q.x, y + 1.05 + rand(0, 0.15), q.z, 0, 1, 1, 1), col(pick(fruitCol)));
    }
    // umbrella
    b.box('metal', p.x, y + 1.6, p.z, 0.04, 1.3, 0.04, col('#444'), yaw);
    b.geom('awning', UMBRELLA, mat4(p.x, y + 2.35, p.z, rnd() * 6, 1, 1, 1), col(pick(AWNING_TINTS)));
    this.circles.push({ x: p.x, z: p.z, r: 1.1 });
    this.vendorSpots.push({ x: p.x - F.x * 0.9 + A.x * 0.6, z: p.z - F.z * 0.9 + A.z * 0.6, yaw: Math.atan2(F.x, F.z) });
  }

  // ------------------------------------------------------------ landmarks ---

  makePark(blk) {
    const b = this.b;
    const { x0, x1, z0, z1 } = blk;
    const lx0 = x0 + WALK_W;
    const lx1 = x1 - WALK_W;
    const lz0 = z0 + WALK_W;
    const lz1 = z1 - WALK_W;
    const y = CURB_H + 0.02;
    b.quad('grass', V(lx0, y, lz1), V(lx1, y, lz1), V(lx1, y, lz0), V(lx0, y, lz0), [0, 0, (lx1 - lx0) / 6, (lz1 - lz0) / 6]);
    // boundary wall + railings
    const wallCol = col('#e0dccf');
    const railCol = col('#1f4a2a');
    const edges = [
      [lx0, lz0, lx1, lz0], [lx1, lz0, lx1, lz1], [lx1, lz1, lx0, lz1], [lx0, lz1, lx0, lz0],
    ];
    for (const [ax, az, bx, bz] of edges) {
      const L = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
      const cx = (ax + bx) / 2;
      const cz = (az + bz) / 2;
      b.box('plaster', cx, CURB_H + 0.35, cz, L, 0.7, 0.35, wallCol, yaw);
      b.box('metal', cx, CURB_H + 1.3, cz, L, 0.05, 0.05, railCol, yaw);
      for (let t = 0; t <= L; t += 0.3) {
        const px = ax + ((bx - ax) * t) / L;
        const pz = az + ((bz - az) * t) / L;
        b.box('metal', px, CURB_H + 1.0, pz, 0.03, 0.6, 0.03, railCol, yaw);
      }
    }
    const cx = (lx0 + lx1) / 2;
    const cz = (lz0 + lz1) / 2;
    // footpaths
    for (const a of [0, Math.PI / 2]) {
      const L = lx1 - lx0;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const w = 1.5;
      const yy = y + 0.01;
      b.quad('walk', V(cx - dx * L / 2 - dz * w, yy, cz - dz * L / 2 + dx * w), V(cx + dx * L / 2 - dz * w, yy, cz + dz * L / 2 + dx * w),
        V(cx + dx * L / 2 + dz * w, yy, cz + dz * L / 2 - dx * w), V(cx - dx * L / 2 + dz * w, yy, cz - dz * L / 2 - dx * w), [0, 0, L / 3.5, 1]);
    }
    for (let k = 0; k < 26; k++) {
      const a = rnd() * Math.PI * 2;
      const r = rand(20, 24);
      this.tree(cx + Math.cos(a) * r, cz + Math.sin(a) * r);
    }
    this.minar(cx, cz);
    this.boxes.push({ minX: lx0, maxX: lx1, minZ: lz0, maxZ: lz1 });
    this.landmarks.push({ name: 'Minar-e-Pakistan', x: cx, z: cz });
  }

  minar(cx, cz) {
    const b = this.b;
    const white = col('#f1efe8');
    const star = (R, r) => {
      const s = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 ? r : R;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      }
      s.closePath();
      return s;
    };
    const tiers = [[15, 9, 0, 1.2], [11, 6.5, 1.2, 1.2], [7.5, 4.5, 2.4, 1.4]];
    for (const [R, r, y0, h] of tiers) {
      const g = new THREE.ExtrudeGeometry(star(R, r), { depth: h, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);
      b.geom('marble', g, mat4(cx, CURB_H + y0, cz, 0), white);
    }
    const base = CURB_H + 3.8;
    const prof = [
      [0, 0], [4.2, 0], [3.4, 3], [2.8, 7], [2.5, 12], [2.35, 18], [3.1, 18.2], [3.1, 18.9], [2.25, 19.1],
      [2.1, 27], [2.8, 27.2], [2.8, 27.8], [2.0, 28], [1.9, 36], [2.6, 36.2], [2.6, 36.8], [1.8, 37],
      [1.7, 44], [2.4, 44.2], [2.4, 45], [1.9, 45.1], [2.0, 46.5], [1.6, 48.5], [1.0, 50], [0.4, 51.5], [0.15, 53.5], [0, 54],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    b.geom('marble', new THREE.LatheGeometry(prof, 20), mat4(cx, base, cz, 0), white);
    // four flared "petals" at the foot of the tower
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const px = cx + Math.cos(a) * 4.2;
      const pz = cz + Math.sin(a) * 4.2;
      b.box('marble', px, base + 5, pz, 1.2, 10, 3.4, white, -a + Math.PI / 2 + 0.0);
    }
    this.circles.push({ x: cx, z: cz, r: 16 });
  }

  makeMosque(blk) {
    const b = this.b;
    const lx0 = blk.x0 + WALK_W;
    const lx1 = blk.x1 - WALK_W;
    const lz0 = blk.z0 + WALK_W;
    const lz1 = blk.z1 - WALK_W;
    const red = col('#b8573a');
    const white = col('#f2f0ea');
    const y = CURB_H;
    const cx = (lx0 + lx1) / 2;
    const W = lx1 - lx0;
    const D = lz1 - lz0;
    b.quad('sandstone', V(lx0, y + 0.03, lz1), V(lx1, y + 0.03, lz1), V(lx1, y + 0.03, lz0), V(lx0, y + 0.03, lz0), [0, 0, W / 4, D / 4], col('#c97a5a'));
    // enclosure walls with white arch outlines
    const wallH = 7;
    const walls = [
      [cx, lz0 + 0.5, W, 1, 0], [cx, lz1 - 0.5, W, 1, 0], [lx0 + 0.5, (lz0 + lz1) / 2, 1, D, 0], [lx1 - 0.5, (lz0 + lz1) / 2, 1, D, 0],
    ];
    for (const [x, z, w, d] of walls) {
      b.box('sandstone', x, y + wallH / 2, z, w, wallH, d, red);
      b.box('marble', x, y + wallH + 0.15, z, w + 0.2, 0.3, d + 0.2, white);
    }
    // arch niches along the street walls
    for (let x = lx0 + 3; x < lx1 - 3; x += 4) {
      for (const [z, f] of [[lz0 - 0.02, -1], [lz1 + 0.02, 1]]) {
        const p0 = V(x - 1.2, y + 1, z);
        const p1 = V(x + 1.2, y + 1, z);
        const p2 = V(x + 1.2, y + 5, z);
        const p3 = V(x - 1.2, y + 5, z);
        if (f > 0) b.quad('sandstone', p0, p1, p2, p3, [0, 0, 0.4, 0.8], col('#6a2e1e'));
        else b.quad('sandstone', p1, p0, p3, p2, [0, 0, 0.4, 0.8], col('#6a2e1e'));
      }
    }
    // prayer hall at the back with three marble domes
    const hz = lz1 - 10;
    b.box('sandstone', cx, y + 7, hz, W - 12, 14, 14, red);
    b.box('marble', cx, y + 14.2, hz, W - 11.6, 0.4, 14.4, white);
    b.box('sandstone', cx, y + 9, hz - 7.3, 12, 18, 1.2, red);
    b.quad('sandstone', V(cx + 4, y + 1, hz - 7.95), V(cx - 4, y + 1, hz - 7.95), V(cx - 4, y + 14, hz - 7.95), V(cx + 4, y + 14, hz - 7.95), [0, 0, 1, 1], col('#5a2616'));
    const onion = (r) => [
      [0, 0], [r * 0.95, 0], [r * 1.12, r * 0.45], [r * 1.08, r * 0.9], [r * 0.8, r * 1.3], [r * 0.45, r * 1.6],
      [r * 0.15, r * 1.85], [r * 0.08, r * 2.1], [0, r * 2.4],
    ].map(([a, c]) => new THREE.Vector2(a, c));
    const domes = [[cx, 5.5], [cx - 13, 3.8], [cx + 13, 3.8]];
    for (const [dx, r] of domes) {
      b.geom('marble', new THREE.CylinderGeometry(r * 0.95, r * 0.95, 2, 20), mat4(dx, y + 15, hz, 0), white);
      b.geom('marble', new THREE.LatheGeometry(onion(r), 20), mat4(dx, y + 16, hz, 0), white);
      b.geom('metal', new THREE.CylinderGeometry(0.05, 0.12, 2.2, 6), mat4(dx, y + 16 + r * 2.4 + 0.8, hz, 0), col('#c9a227'));
    }
    // four octagonal minarets
    for (const [mx, mz] of [[lx0 + 2, lz0 + 2], [lx1 - 2, lz0 + 2], [lx0 + 2, lz1 - 2], [lx1 - 2, lz1 - 2]]) {
      b.geom('sandstone', new THREE.CylinderGeometry(1.2, 1.6, 30, 8), mat4(mx, y + 15, mz, 0), red);
      for (const h of [10, 20, 29]) {
        b.geom('marble', new THREE.CylinderGeometry(1.9, 1.9, 0.5, 8), mat4(mx, y + h, mz, 0), white);
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        b.box('marble', mx + Math.cos(a) * 1.1, y + 31.3, mz + Math.sin(a) * 1.1, 0.18, 2.5, 0.18, white);
      }
      b.geom('marble', new THREE.CylinderGeometry(1.4, 1.4, 0.3, 8), mat4(mx, y + 32.7, mz, 0), white);
      b.geom('marble', new THREE.LatheGeometry(onion(1.2), 12), mat4(mx, y + 32.8, mz, 0), white);
    }
    // gateway facing the street
    b.box('sandstone', cx, y + 9, lz0 + 1, 14, 18, 3, red);
    b.quad('sandstone', V(cx + 3.5, y, lz0 - 0.55), V(cx - 3.5, y, lz0 - 0.55), V(cx - 3.5, y + 11, lz0 - 0.55), V(cx + 3.5, y + 11, lz0 - 0.55), [0, 0, 1, 1], col('#4a1f12'));
    for (const s of [-1, 1]) b.geom('marble', new THREE.LatheGeometry(onion(1.1), 12), mat4(cx + s * 6, y + 18, lz0 + 1, 0), white);
    this.boxes.push({ minX: lx0, maxX: lx1, minZ: lz0, maxZ: lz1 });
    this.landmarks.push({ name: 'Badshahi Masjid', x: cx, z: (lz0 + lz1) / 2 });
    for (const side of blk.sides) this.streetFurniture(blk, side);
  }

  makeStation(blk) {
    const b = this.b;
    const lx0 = blk.x0 + WALK_W;
    const lx1 = blk.x1 - WALK_W;
    const lz0 = blk.z0 + WALK_W;
    const lz1 = blk.z1 - WALK_W;
    const cx = (lx0 + lx1) / 2;
    const cz = (lz0 + lz1) / 2;
    const y = CURB_H;
    b.quad('roof', V(lx0, y + 0.02, lz1), V(lx1, y + 0.02, lz1), V(lx1, y + 0.02, lz0), V(lx0, y + 0.02, lz0), [0, 0, 6, 6], col('#8f8c86'));
    // canopy
    const cw = 26;
    const cd = 16;
    b.box('concrete', cx, y + 5.8, cz, cw, 0.8, cd, col('#f2f2f2'));
    b.box('concrete', cx, y + 5.8, cz - cd / 2 - 0.02, cw + 0.1, 0.8, 0.05, col('#0a7d3a'));
    b.box('concrete', cx, y + 5.8, cz + cd / 2 + 0.02, cw + 0.1, 0.8, 0.05, col('#0a7d3a'));
    b.box('lamp', cx, y + 5.38, cz, cw - 2, 0.05, cd - 2, col('#fff'));
    for (const px of [-9, 0, 9]) {
      for (const pz of [-4, 4]) {
        b.box('concrete', cx + px, y + 2.7, cz + pz, 0.5, 5.4, 0.5, col('#e0e0e0'));
        this.circles.push({ x: cx + px, z: cz + pz, r: 0.45 });
      }
    }
    for (const px of [-4.5, 4.5]) {
      for (const pz of [-4, 4]) {
        b.box('concrete', cx + px, y + 0.1, cz + pz, 1.6, 0.2, 0.9, col('#bbb'));
        b.box('plastic', cx + px, y + 0.95, cz + pz, 0.8, 1.5, 0.5, col('#f5f5f5'));
        b.box('plastic', cx + px, y + 1.5, cz + pz + 0.26, 0.6, 0.35, 0.02, col('#0a7d3a'));
        this.circles.push({ x: cx + px, z: cz + pz, r: 0.6 });
      }
    }
    // kiosk & compressor shed
    b.box('plaster', cx, y + 1.8, lz1 - 5, 14, 3.6, 7, col('#f0ede5'));
    b.box('concrete', cx, y + 3.7, lz1 - 5, 14.6, 0.25, 7.6, col('#0a7d3a'));
    this.boxes.push({ minX: cx - 7, maxX: cx + 7, minZ: lz1 - 8.5, maxZ: lz1 - 1.5 });
    b.box('metal', lx1 - 5, y + 1.3, lz0 + 5, 5, 2.6, 3, col('#9aa3a6'));
    this.boxes.push({ minX: lx1 - 7.5, maxX: lx1 - 2.5, minZ: lz0 + 3.5, maxZ: lz0 + 6.5 });
    // tall price sign
    const sx = lx0 + 3;
    const sz = lz0 + 3;
    b.box('metal', sx, y + 4, sz, 0.4, 8, 0.4, col('#666'));
    b.box('concrete', sx, y + 8.8, sz, 3, 3, 0.5, col('#0a7d3a'));
    b.box('concrete', sx, y + 9.2, sz, 2.6, 1.2, 0.55, col('#f7d117'));
    this.circles.push({ x: sx, z: sz, r: 0.4 });
    this.station = { x: cx, z: cz, hw: cw / 2, hd: cd / 2 };
    this.landmarks.push({ name: 'CNG Station', x: cx, z: cz });
    for (const side of blk.sides) this.streetFurniture(blk, side);
  }

  // ------------------------------------------------------------ collision ---

  indexColliders() {
    const C = 12;
    this.cell = C;
    const add = (i, j, item) => {
      const k = i * 4096 + j;
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, (a = { boxes: [], circles: [] }));
      return a;
    };
    for (const bx of this.boxes) {
      for (let i = Math.floor(bx.minX / C); i <= Math.floor(bx.maxX / C); i++) {
        for (let j = Math.floor(bx.minZ / C); j <= Math.floor(bx.maxZ / C); j++) add(i, j).boxes.push(bx);
      }
    }
    for (const c of this.circles) {
      for (let i = Math.floor((c.x - c.r) / C); i <= Math.floor((c.x + c.r) / C); i++) {
        for (let j = Math.floor((c.z - c.r) / C); j <= Math.floor((c.z + c.r) / C); j++) add(i, j).circles.push(c);
      }
    }
  }

  nearby(x, z, r = 0) {
    const C = this.cell;
    const i0 = Math.floor((x - r) / C);
    const i1 = Math.floor((x + r) / C);
    const j0 = Math.floor((z - r) / C);
    const j1 = Math.floor((z + r) / C);
    if (i0 === i1 && j0 === j1) return this.grid.get(i0 * 4096 + j0) || EMPTY;
    const out = { boxes: [], circles: [] };
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const c = this.grid.get(i * 4096 + j);
        if (!c) continue;
        for (const b of c.boxes) if (!out.boxes.includes(b)) out.boxes.push(b);
        for (const b of c.circles) if (!out.circles.includes(b)) out.circles.push(b);
      }
    }
    return out;
  }

  // Push a circle out of static geometry; returns contact normal or null
  collideCircle(p, r) {
    let hit = null;
    const cell = this.nearby(p.x, p.z, r);
    for (const bx of cell.boxes) {
      const qx = clamp(p.x, bx.minX, bx.maxX);
      const qz = clamp(p.z, bx.minZ, bx.maxZ);
      let dx = p.x - qx;
      let dz = p.z - qz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        let d = Math.sqrt(d2);
        if (d < 1e-4) {
          // centre inside the box: push out along the shallowest axis
          const pen = [p.x - bx.minX, bx.maxX - p.x, p.z - bx.minZ, bx.maxZ - p.z];
          const m = pen.indexOf(Math.min(...pen));
          dx = m === 0 ? -1 : m === 1 ? 1 : 0;
          dz = m === 2 ? -1 : m === 3 ? 1 : 0;
          d = 0;
          p.x += dx * (pen[m] + r);
          p.z += dz * (pen[m] + r);
        } else {
          dx /= d;
          dz /= d;
          p.x += dx * (r - d);
          p.z += dz * (r - d);
        }
        hit = { nx: dx, nz: dz };
      }
    }
    for (const c of cell.circles) {
      let dx = p.x - c.x;
      let dz = p.z - c.z;
      const rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        dx /= d;
        dz /= d;
        p.x += dx * (rr - d);
        p.z += dz * (rr - d);
        hit = { nx: dx, nz: dz };
      }
    }
    return hit;
  }

  // A kerb-side spot where a passenger can wait / be dropped off
  randomCurbSpot(excludeNear = null, minDist = 0) {
    for (let tries = 0; tries < 200; tries++) {
      const blk = pick(this.blocks.filter((b) => b.inner));
      const side = pick(blk.sides);
      const e = sideFrame(side, blk.x0, blk.x1, blk.z0, blk.z1);
      const t = rand(10, e.len - 10);
      const p = e.C.clone().addScaledVector(e.A, t).addScaledVector(e.F, -1.4);
      if (excludeNear && Math.hypot(p.x - excludeNear.x, p.z - excludeNear.z) < minDist) continue;
      const cell = this.nearby(p.x, p.z);
      if (cell.circles.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < c.r + 1.2)) continue;
      return { x: p.x, z: p.z, fx: e.F.x, fz: e.F.z, name: blk.name, block: blk };
    }
    return null;
  }

  setNight(n) {
    const M = this.M;
    const k = n * n;
    M.facade0.emissiveIntensity = M.facade1.emissiveIntensity = M.facade2.emissiveIntensity = k * 0.9;
    M.shop0.emissiveIntensity = M.shop1.emissiveIntensity = k * 0.55;
    M.signs.emissiveIntensity = k * 0.8;
    M.lamp.emissiveIntensity = k * 4;
  }
}

const EMPTY = { boxes: [], circles: [] };

// Edge frame for a block side: start corner C, along-edge vector A, outward facing F.
function sideFrame(side, x0, x1, z0, z1) {
  switch (side) {
    case 'minZ': return { C: V(x1, 0, z0), A: V(-1, 0, 0), F: V(0, 0, -1), len: x1 - x0 };
    case 'maxZ': return { C: V(x0, 0, z1), A: V(1, 0, 0), F: V(0, 0, 1), len: x1 - x0 };
    case 'minX': return { C: V(x0, 0, z0), A: V(0, 0, 1), F: V(-1, 0, 0), len: z1 - z0 };
    default: return { C: V(x1, 0, z1), A: V(0, 0, -1), F: V(1, 0, 0), len: z1 - z0 };
  }
}

// shared primitive geometries (non-indexed for the builder)
const TANK = new THREE.CylinderGeometry(1, 1, 1, 10).toNonIndexed();
const POLE_SQUARE = new THREE.CylinderGeometry(0.09, 0.17, 1, 4, 1).toNonIndexed();
const POLE_ROUND = new THREE.CylinderGeometry(0.08, 0.13, 1, 8, 1).toNonIndexed();
const TRUNK = new THREE.CylinderGeometry(0.14, 0.22, 1, 7).toNonIndexed();
const FOLIAGE = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
const SHRUB = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
const WHEEL = new THREE.CylinderGeometry(0.5, 0.5, 1, 12).toNonIndexed();
const FRUIT = new THREE.OctahedronGeometry(0.08, 0).toNonIndexed();
const UMBRELLA = new THREE.ConeGeometry(1.2, 0.5, 8, 1, true).toNonIndexed();
const DISH = new THREE.CylinderGeometry(0.5, 0.08, 0.2, 14, 1, true).toNonIndexed();
const BUMP = (() => {
  // half cylinder lying across the road, flat side down
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 12, 1, false, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 3.5);
  return g.toNonIndexed();
})();
