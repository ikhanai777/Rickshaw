// People in shalwar kameez: animated pedestrians walking the footpaths, static crowds
// at shop fronts and vendors beside their carts.
import * as THREE from 'three';
import { Builder, mat4, col } from './builder.js';
import { rnd, rand, pick, chance, clamp, damp } from './util.js';
import { WALK_W, CURB_H } from './config.js';

const SKIN = ['#8d5b3e', '#a06a48', '#b07a55', '#c28d66', '#7a4e33', '#d1a07a'];
const MEN_KAMEEZ = ['#f2f0e8', '#e8e2d0', '#cfc6b0', '#9aa4ad', '#6b7a8a', '#4b5563', '#8a6d4d', '#dcd3bf', '#3d4f6b', '#556b4f', '#1f2937', '#b4c7d9'];
const WOMEN_KAMEEZ = ['#c2185b', '#7b1fa2', '#00897b', '#e65100', '#1565c0', '#ad1457', '#f9a825', '#2e7d32', '#6d4c41', '#d81b60'];
const HAIR = ['#141110', '#1d1714', '#2a211b', '#6b6b6b', '#d8d8d8'];

const G = {
  cyl: new THREE.CylinderGeometry(1, 1, 1, 7, 1, true).toNonIndexed(),
  sph: new THREE.SphereGeometry(1, 9, 6).toNonIndexed(),
  box: new THREE.BoxGeometry(1, 1, 1).toNonIndexed(),
  cone: new THREE.CylinderGeometry(0.7, 1, 1, 9).toNonIndexed(),
};

export const personMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

export function randomLook(forceMale = false) {
  const female = !forceMale && chance(0.28);
  return {
    female,
    skin: pick(SKIN),
    shirt: female ? pick(WOMEN_KAMEEZ) : pick(MEN_KAMEEZ),
    pants: female ? pick(['#f5f5f5', '#212121', '#e0d7c6', '#c2185b', '#37474f']) : pick(['#f2f0e8', '#e8e2d0', '#cfc6b0', '#2b2b2b', '#5d6570']),
    dupatta: pick(['#f8bbd0', '#fff59d', '#b2dfdb', '#ffffff', '#ce93d8', '#ffab91', '#212121']),
    hair: pick(HAIR),
    cap: !female && chance(0.25),
    beard: !female && chance(0.45),
    burqa: female && chance(0.25),
    shoe: pick(['#3e2723', '#212121', '#5d4037', '#8d6e63']),
    scale: female ? rand(0.9, 0.97) : rand(0.95, 1.06),
  };
}

// Returns geometries for each body part (pivot at the joint), vertex-coloured.
export function personGeometries(look) {
  const mk = (fn) => {
    const b = new Builder();
    fn(b);
    const g = b.build({ p: personMaterial }).children[0].geometry;
    return g;
  };
  const shirt = col(look.burqa ? '#151515' : look.shirt);
  const pants = col(look.burqa ? '#151515' : look.pants);
  const skin = col(look.skin);
  const torso = mk((b) => {
    // long kameez
    b.geom('p', G.cone, mat4(0, 0.98, 0, 0, 0.23, look.burqa ? 1.3 : 0.9, 0.17), shirt);
    if (look.burqa) b.geom('p', G.cone, mat4(0, 0.5, 0, 0, 0.27, 0.5, 0.2), shirt);
    b.geom('p', G.sph, mat4(0, 1.4, 0, 0, 0.23, 0.1, 0.15), shirt); // shoulders
    b.geom('p', G.cyl, mat4(0, 1.5, 0, 0, 0.05, 0.1, 0.05), skin); // neck
    b.geom('p', G.sph, mat4(0, 1.62, 0.01, 0, 0.1, 0.12, 0.11), skin); // head
    b.geom('p', G.sph, mat4(0, 1.61, 0.105, 0, 0.018, 0.025, 0.02), skin); // nose
    if (look.female) {
      const d = col(look.burqa ? '#151515' : look.dupatta);
      b.geom('p', G.sph, mat4(0, 1.65, -0.01, 0, 0.125, 0.14, 0.13), d);
      b.geom('p', G.box, mat4(0, 1.3, -0.06, 0, 0.44, 0.35, 0.2), d);
      if (look.burqa) b.geom('p', G.box, mat4(0, 1.58, 0.1, 0, 0.12, 0.06, 0.02), col('#0d0d0d'));
    } else {
      b.geom('p', G.sph, mat4(0, 1.68, -0.015, 0, 0.105, 0.08, 0.11), col(look.hair));
      if (look.cap) b.geom('p', G.cyl, mat4(0, 1.73, -0.005, 0, 0.1, 0.07, 0.105), col('#f5f5f5'));
      if (look.beard) b.geom('p', G.sph, mat4(0, 1.55, 0.05, 0, 0.085, 0.07, 0.07), col(look.hair));
    }
  });
  const thigh = mk((b) => b.geom('p', G.cyl, mat4(0, -0.24, 0, 0, 0.085, 0.48, 0.085), pants));
  const shin = mk((b) => {
    b.geom('p', G.cyl, mat4(0, -0.22, 0, 0, 0.07, 0.44, 0.07), pants);
    b.geom('p', G.box, mat4(0, -0.44, 0.04, 0, 0.09, 0.05, 0.22), col(look.shoe));
  });
  const arm = mk((b) => {
    b.geom('p', G.cyl, mat4(0, -0.27, 0, 0, 0.05, 0.54, 0.05), shirt);
    b.geom('p', G.sph, mat4(0, -0.58, 0, 0, 0.045, 0.06, 0.045), skin);
  });
  return { torso, thigh, shin, arm };
}

// Animated rig
export class Person {
  constructor(look = randomLook()) {
    this.look = look;
    const g = personGeometries(look);
    this.group = new THREE.Group();
    this.root = new THREE.Group();
    this.group.add(this.root);
    this.root.scale.setScalar(look.scale);
    const mesh = (geo) => {
      const m = new THREE.Mesh(geo, personMaterial);
      m.castShadow = true;
      return m;
    };
    this.torso = mesh(g.torso);
    this.root.add(this.torso);
    this.legs = [];
    this.arms = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.1, 0.92, 0);
      const knee = new THREE.Group();
      knee.position.y = -0.47;
      hip.add(mesh(g.thigh));
      knee.add(mesh(g.shin));
      hip.add(knee);
      this.root.add(hip);
      this.legs.push({ hip, knee });
      const sh = new THREE.Group();
      sh.position.set(s * 0.25, 1.42, 0);
      sh.add(mesh(g.arm));
      sh.rotation.z = s * 0.08;
      this.root.add(sh);
      this.arms.push(sh);
    }
    this.phase = rnd() * 10;
  }

  walk(dt, speed) {
    this.phase += dt * speed * 5.2;
    const a = Math.min(speed, 2.5) * 0.28;
    const s = Math.sin(this.phase);
    this.legs[0].hip.rotation.x = s * a;
    this.legs[1].hip.rotation.x = -s * a;
    this.legs[0].knee.rotation.x = Math.max(0, Math.sin(this.phase + 1.6)) * a * 1.6;
    this.legs[1].knee.rotation.x = Math.max(0, -Math.sin(this.phase + 1.6)) * a * 1.6;
    this.arms[0].rotation.x = -s * a * 0.8;
    this.arms[1].rotation.x = s * a * 0.8;
    this.root.position.y = Math.abs(Math.cos(this.phase)) * 0.03 * Math.min(speed, 1.5);
  }

  stand() {
    for (const l of this.legs) {
      l.hip.rotation.x = 0;
      l.knee.rotation.x = 0;
    }
    this.arms[0].rotation.x = 0;
    this.arms[1].rotation.x = 0;
    this.root.position.y = 0;
  }

  sit() {
    for (const l of this.legs) {
      l.hip.rotation.x = -1.45;
      l.knee.rotation.x = 1.45;
    }
    this.arms[0].rotation.x = -0.3;
    this.arms[1].rotation.x = -0.3;
  }

  wave(t) {
    this.arms[1].rotation.x = -2.7;
    this.arms[1].rotation.z = 0.25 + Math.sin(t * 7) * 0.3;
  }

  unwave() {
    this.arms[1].rotation.z = 0.08;
  }
}

// Adds a standing figure into a static builder (for crowds & vendors)
export function addStaticPerson(b, x, y, z, yaw, look = randomLook(), pose = 'stand') {
  const g = personGeometries(look);
  const s = look.scale;
  const base = mat4(x, y, z, yaw, s, s, s);
  const at = (geo, px, py, pz, rx = 0, rz = 0) => b.geom('p', geo, base.clone().multiply(mat4(px, py, pz, 0, 1, 1, 1, rx, rz)));
  if (pose === 'squat') {
    at(g.torso, 0, -0.42, 0);
    for (const sd of [-1, 1]) {
      at(g.thigh, sd * 0.12, 0.5, 0, -1.4);
      at(g.shin, sd * 0.12, 0.5, 0.47, 0);
    }
    at(g.arm, -0.25, 1.0, 0, -0.9, -0.1);
    at(g.arm, 0.25, 1.0, 0, -0.9, 0.1);
    return;
  }
  at(g.torso, 0, 0, 0);
  for (const sd of [-1, 1]) {
    at(g.thigh, sd * 0.1, 0.92, 0);
    at(g.shin, sd * 0.1, 0.45, 0);
  }
  const armPose = rand(-0.6, 0.1);
  at(g.arm, -0.25, 1.42, 0, armPose, -0.1);
  at(g.arm, 0.25, 1.42, 0, chance(0.3) ? -1.2 : 0, 0.1);
}

// ------------------------------------------------------------------------------

export class Pedestrians {
  constructor(scene, city, count = 44) {
    this.scene = scene;
    this.city = city;
    this.list = [];
    this.blocks = city.blocks.filter((b) => b.inner);
    for (let i = 0; i < count; i++) {
      const p = new Person();
      scene.add(p.group);
      const ped = { person: p, speed: rand(0.9, 1.5), dir: chance(0.5) ? 1 : -1, pause: 0, dodge: 0, dvx: 0, dvz: 0, fall: 0, x: 0, z: 0, yaw: 0 };
      this.place(ped, null);
      this.list.push(ped);
    }
    this.buildCrowds(scene, city);
  }

  place(ped, near) {
    let blk;
    if (near) {
      const cands = this.blocks.filter((b) => {
        const cx = (b.x0 + b.x1) / 2;
        const cz = (b.z0 + b.z1) / 2;
        const d = Math.hypot(cx - near.x, cz - near.z);
        return d > 50 && d < 140;
      });
      blk = cands.length ? pick(cands) : pick(this.blocks);
    } else blk = pick(this.blocks);
    ped.blk = blk;
    ped.inset = rand(1.3, WALK_W - 0.5);
    const w = blk.x1 - blk.x0 - ped.inset * 2;
    const h = blk.z1 - blk.z0 - ped.inset * 2;
    ped.per = 2 * (w + h);
    ped.s = rnd() * ped.per;
    this.pos(ped);
  }

  pos(ped) {
    const b = ped.blk;
    const i = ped.inset;
    const w = b.x1 - b.x0 - i * 2;
    const h = b.z1 - b.z0 - i * 2;
    ped.per = 2 * (w + h);
    let s = ((ped.s % ped.per) + ped.per) % ped.per;
    let x;
    let z;
    let dx;
    let dz;
    if (s < w) { x = b.x0 + i + s; z = b.z0 + i; dx = 1; dz = 0; }
    else if ((s -= w) < h) { x = b.x1 - i; z = b.z0 + i + s; dx = 0; dz = 1; }
    else if ((s -= h) < w) { x = b.x1 - i - s; z = b.z1 - i; dx = -1; dz = 0; }
    else { s -= w; x = b.x0 + i; z = b.z1 - i - s; dx = 0; dz = -1; }
    ped.x = x;
    ped.z = z;
    ped.yaw = Math.atan2(dx * ped.dir, dz * ped.dir);
  }

  buildCrowds(scene, city) {
    const b = new Builder();
    for (const v of city.vendorSpots) addStaticPerson(b, v.x, CURB_H, v.z, v.yaw, randomLook(true));
    // people loitering at shop fronts, sitting on their haunches, chatting in small groups
    for (let n = 0; n < 110; n++) {
      const spot = city.randomCurbSpot();
      if (!spot) continue;
      const k = chance(0.4) ? 2 : 1;
      const inward = rand(1.2, 2.2);
      for (let m = 0; m < k; m++) {
        const x = spot.x - spot.fx * inward + spot.fz * m * 0.7;
        const z = spot.z - spot.fz * inward - spot.fx * m * 0.7;
        const yaw = Math.atan2(spot.fx, spot.fz) + rand(-1.4, 1.4);
        addStaticPerson(b, x, CURB_H, z, yaw, randomLook(), chance(0.15) ? 'squat' : 'stand');
        city.circles.push({ x, z, r: 0.3 });
      }
    }
    const g = b.build({ p: personMaterial });
    scene.add(g);
    city.grid.clear();
    city.indexColliders();
  }

  update(dt, player, events) {
    const px = player.pos.x;
    const pz = player.pos.z;
    for (const ped of this.list) {
      const p = ped.person;
      const dPlayer = Math.hypot(ped.x - px, ped.z - pz);
      if (dPlayer > 160) {
        this.place(ped, player.pos);
        continue;
      }
      if (ped.fall > 0) {
        ped.fall -= dt;
        p.root.rotation.x = -Math.min(1.3, (2.2 - ped.fall) * 5) * (ped.fall > 0.6 ? 1 : ped.fall / 0.6);
        if (ped.fall <= 0) p.root.rotation.x = 0;
        p.group.position.set(ped.x, CURB_H, ped.z);
        continue;
      }
      // dodge an approaching rickshaw
      const spd = Math.abs(player.speed);
      if (ped.dodge <= 0 && spd > 2.5 && dPlayer < 4 + spd * 0.5) {
        const fx = Math.sin(player.yaw);
        const fz = Math.cos(player.yaw);
        const rx = ped.x - px;
        const rz = ped.z - pz;
        const ahead = (rx * fx + rz * fz) * Math.sign(player.speed);
        const lat = rx * fz - rz * fx;
        if (ahead > 0 && Math.abs(lat) < 1.6) {
          const sgn = lat >= 0 ? 1 : -1;
          ped.dodge = 0.7;
          ped.dvx = fz * sgn * 3.5;
          ped.dvz = -fx * sgn * 3.5;
          events.push({ type: 'shout', x: ped.x, z: ped.z });
        }
      }
      if (ped.dodge > 0) {
        ped.dodge -= dt;
        ped.x += ped.dvx * dt;
        ped.z += ped.dvz * dt;
        p.walk(dt, 3.5);
        p.group.position.set(ped.x, this.city.groundHeight(ped.x, ped.z), ped.z);
        p.group.rotation.y = Math.atan2(ped.dvx, ped.dvz);
        if (ped.dodge <= 0) this.reproject(ped);
        continue;
      }
      if (ped.pause > 0) {
        ped.pause -= dt;
        p.stand();
      } else {
        ped.s += ped.speed * ped.dir * dt;
        this.pos(ped);
        p.walk(dt, ped.speed);
        if (chance(dt * 0.03)) ped.pause = rand(1, 5);
        if (chance(dt * 0.01)) ped.dir *= -1;
      }
      p.group.position.set(ped.x, CURB_H, ped.z);
      const dy = ped.yaw - p.group.rotation.y;
      p.group.rotation.y += Math.atan2(Math.sin(dy), Math.cos(dy)) * damp(10, dt);
      // bumped by the rickshaw
      if (dPlayer < 1.3) {
        const push = 1.3 - dPlayer;
        const nx = (ped.x - px) / (dPlayer || 1);
        const nz = (ped.z - pz) / (dPlayer || 1);
        if (spd > 3) {
          ped.fall = 2.2;
          events.push({ type: 'hitPed', x: ped.x, z: ped.z, speed: spd });
        }
        player.pos.x -= nx * push;
        player.pos.z -= nz * push;
        player.speed *= 0.3;
      }
    }
  }

  // After dodging, snap back onto the nearest footpath loop of the current block
  reproject(ped) {
    const b = this.blockAtOrNear(ped.x, ped.z);
    ped.blk = b;
    const inx = Math.min(ped.x - b.x0, b.x1 - ped.x);
    const inz = Math.min(ped.z - b.z0, b.z1 - ped.z);
    ped.inset = clamp(Math.min(inx, inz), 0.6, WALK_W - 0.3);
    const i = ped.inset;
    const w = b.x1 - b.x0 - i * 2;
    const h = b.z1 - b.z0 - i * 2;
    const x = clamp(ped.x, b.x0 + i, b.x1 - i);
    const z = clamp(ped.z, b.z0 + i, b.z1 - i);
    const d = [z - (b.z0 + i), b.x1 - i - x, b.z1 - i - z, x - (b.x0 + i)];
    const m = d.indexOf(Math.min(...d));
    if (m === 0) ped.s = x - (b.x0 + i);
    else if (m === 1) ped.s = w + (z - (b.z0 + i));
    else if (m === 2) ped.s = w + h + (b.x1 - i - x);
    else ped.s = 2 * w + h + (b.z1 - i - z);
    this.pos(ped);
  }

  blockAtOrNear(x, z) {
    let best = this.blocks[0];
    let bd = 1e9;
    for (const b of this.blocks) {
      const dx = Math.max(b.x0 - x, 0, x - b.x1);
      const dz = Math.max(b.z0 - z, 0, z - b.z1);
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }
}
