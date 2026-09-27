// AI traffic that keeps LEFT, turns at chowks, brakes for whatever is ahead
// and leans on the horn when blocked – i.e. normal Lahore traffic.
import * as THREE from 'three';
import { N, HALF_ROAD, LANES, roadCoord } from './config.js';
import { makeVehicleMesh } from './vehicles.js';
import { CITY } from './cities.js';
import { contactShadowTexture } from './textures.js';
import { createRickshawModel } from './rickshaw.js';
import { Person, randomLook } from './people.js';
import { rand, pick, chance, clamp, damp, wrapAngle } from './util.js';

const DX = [1, 0, -1, 0];
const DZ = [0, 1, 0, -1];
const SPEEDS = { sedan: 12.5, hatch: 11.5, van: 10.5, pickup: 10.5, bus: 9, bike: 13, rickshaw: 9.5, truck: 8.5, tonga: 4.6, donkey: 3.6 };
// How far a vehicle flies when rammed, and how much speed the rickshaw keeps
const PUSH = { bike: 1.3, rickshaw: 1.15, hatch: 1.0, sedan: 0.9, van: 0.85, pickup: 0.8, donkey: 0.3, tonga: 0.25, bus: 0.16, truck: 0.1 };
const KEEP = { bike: 0.95, rickshaw: 0.9, hatch: 0.86, sedan: 0.84, van: 0.8, pickup: 0.8, donkey: 0.5, tonga: 0.45, bus: 0.25, truck: 0.18 };
const SLOW = new Set(['bike', 'rickshaw', 'bus', 'truck', 'tonga', 'donkey']);
let shadowMat = null;

const valid = (i, j) => i >= 0 && j >= 0 && i <= N && j <= N;

export class Traffic {
  constructor(scene, city, count = 50) {
    this.scene = scene;
    this.city = city;
    this.list = [];
    const bag = [];
    for (const [t, w] of CITY.traffic) for (let k = 0; k < w; k++) bag.push(t);
    for (let n = 0; n < count; n++) {
      const type = bag[n % bag.length];
      this.list.push(this.makeVehicle(type));
    }
    for (const v of this.list) this.spawn(v, null);
  }

  makeVehicle(type) {
    let group;
    let len;
    let width;
    let animate = null;
    if (type === 'rickshaw') {
      const colors = [['#0d47a1', '#ffffff'], ['#b71c1c', '#f7c600'], ['#1b5e20', '#f7c600'], ['#f7c600', '#1b5e20'], ['#263238', '#e53935']];
      const [c, t] = pick(colors);
      const m = createRickshawModel({ color: c, trim: t, simple: true });
      group = m.root;
      len = 2.7;
      width = 1.35;
    } else {
      const m = makeVehicleMesh(type);
      group = new THREE.Group();
      group.add(m.group);
      len = m.len;
      width = m.width;
      animate = m.animate || null;
      if (type === 'bike') {
        const rider = new Person(randomLook(true));
        rider.sit();
        rider.legs[0].hip.rotation.x = rider.legs[1].hip.rotation.x = -1.0;
        rider.legs[0].knee.rotation.x = rider.legs[1].knee.rotation.x = 1.2;
        rider.arms[0].rotation.x = rider.arms[1].rotation.x = -1.0;
        rider.group.position.set(0, 0.86 - 0.92, -0.2);
        rider.root.rotation.x = 0.1;
        group.add(rider.group);
        if (chance(0.35)) {
          // pillion passenger – often a woman sitting side-saddle
          const p = new Person(randomLook());
          p.sit();
          p.group.position.set(0.05, 0.86 - 0.92, -0.62);
          if (p.look.female) p.group.rotation.y = Math.PI / 2;
          group.add(p.group);
        }
      }
    }
    group.traverse((o) => {
      if (o.isMesh && !/^bulb/.test(o.name)) o.castShadow = true;
    });
    // soft contact shadow so vehicles sit on the road
    if (!shadowMat) {
      shadowMat = new THREE.MeshBasicMaterial({
        map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: 0.8,
        polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      });
    }
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.35, len * 1.1).rotateX(-Math.PI / 2), shadowMat);
    blob.position.y = 0.02;
    blob.renderOrder = 1;
    group.add(blob);
    this.scene.add(group);
    const lanePref = SLOW.has(type) ? 1 : chance(0.6) ? 0 : 1;
    return {
      type, group, len, width, animate, knocked: null, hitCD: 0, pushCD: 0,
      vmax: SPEEDS[type] * rand(0.85, 1.12),
      speed: 0, x: 0, z: 0, yaw: 0,
      lane: LANES[lanePref] + rand(-0.35, 0.35) * (type === 'bike' ? 2 : 1),
      i: 0, j: 0, dir: 0, pts: null, lens: null, d: 0,
      stuck: 0, ghost: 0, honkT: rand(1, 4), blockedByPlayer: 0, laneWait: 0, laneCD: 0,
    };
  }

  spawn(v, near) {
    for (let tries = 0; tries < 60; tries++) {
      const i = Math.floor(rand(0, N + 1));
      const j = Math.floor(rand(0, N + 1));
      const dirs = [0, 1, 2, 3].filter((d) => valid(i + DX[d], j + DZ[d]));
      const dir = pick(dirs);
      const x = roadCoord(i);
      const z = roadCoord(j);
      if (near) {
        const d = Math.hypot(x - near.x, z - near.z);
        if (d < 60 || d > 190) continue;
      }
      v.i = i;
      v.j = j;
      v.dir = dir;
      this.buildLeg(v, null);
      v.d = rand(0, v.lens[v.endIdx] * 0.8);
      this.place(v);
      const clash = this.list.some((o) => o !== v && o.pts && Math.hypot(o.x - v.x, o.z - v.z) < 12);
      if (clash) continue;
      v.speed = v.vmax * 0.6;
      v.knocked = null;
      v.group.rotation.set(0, v.yaw, 0);
      return;
    }
  }

  // A leg runs from the exit of chowk (i,j) along dir to the exit of the next chowk.
  buildLeg(v, startPt, swerve = false) {
    const { i, j, dir } = v;
    const fx = DX[dir];
    const fz = DZ[dir];
    const lx = fz;
    const lz = -fx; // left of travel
    const ax = roadCoord(i);
    const az = roadCoord(j);
    const bi = i + fx;
    const bj = j + fz;
    const bx = roadCoord(bi);
    const bz = roadCoord(bj);
    const o = v.lane;
    const start = startPt || new THREE.Vector3(ax + fx * HALF_ROAD + lx * o, 0, az + fz * HALF_ROAD + lz * o);
    const end = new THREE.Vector3(bx - fx * HALF_ROAD + lx * o, 0, bz - fz * HALF_ROAD + lz * o);
    // choose the next direction
    const left = (dir + 3) % 4;
    const right = (dir + 1) % 4;
    const opts = [];
    if (valid(bi + DX[dir], bj + DZ[dir])) opts.push([dir, 0.56]);
    if (valid(bi + DX[left], bj + DZ[left])) opts.push([left, 0.24]);
    if (valid(bi + DX[right], bj + DZ[right])) opts.push([right, 0.2]);
    let r = Math.random() * opts.reduce((a, b) => a + b[1], 0);
    let next = opts[0][0];
    for (const [d, w] of opts) {
      if ((r -= w) <= 0) {
        next = d;
        break;
      }
    }
    const f2x = DX[next];
    const f2z = DZ[next];
    const exit = new THREE.Vector3(bx + f2x * HALF_ROAD + f2z * o, 0, bz + f2z * HALF_ROAD - f2x * o);
    const ef = (exit.x - end.x) * fx + (exit.z - end.z) * fz;
    const ctrl = next === dir ? end.clone().lerp(exit, 0.5) : new THREE.Vector3(end.x + fx * ef, 0, end.z + fz * ef);
    const pts = [start];
    if (swerve) {
      // quick sideways move into the new lane over ~9 m
      const t = (start.x - ax) * fx + (start.z - az) * fz + 9;
      pts.push(new THREE.Vector3(ax + fx * t + lx * o, 0, az + fz * t + lz * o));
    }
    pts.push(end);
    v.endIdx = pts.length - 1;
    for (let k = 1; k <= 8; k++) {
      const t = k / 8;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      pts.push(new THREE.Vector3(a * end.x + b * ctrl.x + c * exit.x, 0, a * end.z + b * ctrl.z + c * exit.z));
    }
    const lens = [0];
    for (let k = 1; k < pts.length; k++) lens.push(lens[k - 1] + pts[k].distanceTo(pts[k - 1]));
    v.ax = ax;
    v.az = az;
    v.pts = pts;
    v.lens = lens;
    v.total = lens[lens.length - 1];
    v.turning = next !== dir;
    v.next = next;
    v.bi = bi;
    v.bj = bj;
  }

  // Is the neighbouring lane free near this vehicle?
  laneClear(v, lane, pAgent) {
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    const lx = fz;
    const lz = -fx;
    // lateral position of the target lane relative to the vehicle
    const shift = lane - v.lane;
    const test = (o) => {
      const rx = o.x - v.x;
      const rz = o.z - v.z;
      const along = rx * fx + rz * fz;
      const lat = rx * lx + rz * lz;
      return Math.abs(along) < 9 + (o.len || 3) / 2 && Math.abs(lat - shift) < 2.2;
    };
    for (const o of this.list) if (o !== v && test(o)) return false;
    return !test(pAgent);
  }

  pointAt(v, d, out) {
    const { pts, lens } = v;
    d = clamp(d, 0, v.total);
    let k = 1;
    while (k < lens.length - 1 && lens[k] < d) k++;
    const seg = lens[k] - lens[k - 1] || 1;
    const t = (d - lens[k - 1]) / seg;
    out.x = pts[k - 1].x + (pts[k].x - pts[k - 1].x) * t;
    out.z = pts[k - 1].z + (pts[k].z - pts[k - 1].z) * t;
    return out;
  }

  place(v) {
    const p = this.pointAt(v, v.d, { x: 0, z: 0 });
    const a = this.pointAt(v, v.d + 1.2, { x: 0, z: 0 });
    const b = this.pointAt(v, v.d - 1.2, { x: 0, z: 0 });
    v.x = p.x;
    v.z = p.z;
    const target = Math.atan2(a.x - b.x, a.z - b.z);
    v.yaw = v.pts && v.yawInit ? v.yaw + wrapAngle(target - v.yaw) * 0.5 : target;
    v.yawInit = true;
  }

  update(dt, player, events) {
    const agents = this.list;
    const pAgent = { x: player.pos.x, z: player.pos.z, len: 2.8, width: 1.4, isPlayer: true, yaw: player.yaw };
    for (const v of agents) {
      // recycle cars that drifted far from the player
      const dp = Math.hypot(v.x - pAgent.x, v.z - pAgent.z);
      v.hitCD -= dt;
      v.pushCD -= dt;
      if (dp > 230) {
        this.spawn(v, pAgent);
        continue;
      }
      if (v.knocked) {
        this.updateKnocked(v, dt, player, dp, events);
        continue;
      }
      const fx = Math.sin(v.yaw);
      const fz = Math.cos(v.yaw);
      // straight-leg distance remaining before the junction
      let target = v.vmax;
      const straight = v.lens[v.endIdx];
      const toJunction = straight - v.d;
      if (v.turning) {
        if (v.d > straight) target = Math.min(target, 5.5);
        else if (toJunction < 18) target = Math.min(target, 5.5 + toJunction * 0.45);
      }
      // look ahead for obstacles
      const look = 4 + v.speed * 1.5 + v.len / 2;
      let blockedBy = null;
      // On the straight part, measure against the lane we are heading for (so a
      // swerve around a stopped car is not blocked by that car); in turns use heading.
      const onStraight = v.d < straight;
      const rfx = DX[v.dir];
      const rfz = DZ[v.dir];
      const check = (o) => {
        const rx = o.x - v.x;
        const rz = o.z - v.z;
        let fwd;
        let lat;
        if (onStraight) {
          fwd = rx * rfx + rz * rfz;
          lat = Math.abs((o.x - v.ax) * rfz - (o.z - v.az) * rfx - v.lane);
        } else {
          fwd = rx * fx + rz * fz;
          lat = Math.abs(rx * fz - rz * fx);
        }
        if (fwd <= 0 || fwd > look + o.len / 2) return;
        const lim = (v.width + o.width) / 2 + (v.type === 'bike' ? 0.15 : 0.45);
        if (lat > lim) return;
        const gap = fwd - v.len / 2 - o.len / 2;
        const allowed = Math.max(0, (gap - 1.4) * 1.3);
        if (allowed < target) {
          target = allowed;
          blockedBy = o;
        }
      };
      if (v.ghost <= 0) for (const o of agents) if (o !== v) check(o);
      check(pAgent);

      // go around slow or stopped things by switching lane
      const blockerSlow = blockedBy && (blockedBy.isPlayer ? Math.abs(player.speed) < 1.5 : blockedBy.speed < 1.5);
      v.laneCD -= dt;
      if (blockerSlow && v.d < straight - 14 && v.laneCD <= 0) {
        v.laneWait += dt;
        if (v.laneWait > 1.2) {
          v.laneWait = 0;
          const other = v.lane > 3.5 ? LANES[0] + rand(-0.2, 0.2) : LANES[1] + rand(-0.2, 0.2);
          if (this.laneClear(v, other, pAgent)) {
            v.lane = other;
            v.laneCD = 5;
            this.buildLeg(v, new THREE.Vector3(v.x, 0, v.z), true);
            v.d = 0;
          }
        }
      } else v.laneWait = 0;

      if (target < 0.3 && v.speed < 0.5) {
        v.stuck += dt;
        if (blockedBy && blockedBy.isPlayer) {
          v.blockedByPlayer += dt;
          v.honkT -= dt;
          if (v.blockedByPlayer > 1 && v.honkT <= 0) {
            events.push({ type: 'honk', x: v.x, z: v.z, big: v.type === 'bus' || v.type === 'van', vtype: v.type });
            v.honkT = rand(0.6, 2.5);
          }
        } else if (v.stuck > 5 && blockedBy && Math.abs(wrapAngle(blockedBy.yaw - v.yaw)) > 0.6) {
          v.ghost = 2.5; // cross-traffic deadlock at a chowk: squeeze through anyway
          v.stuck = 0;
        } else if (v.stuck > 3) {
          v.honkT -= dt;
          if (v.honkT <= 0 && dp < 80) {
            events.push({ type: 'honk', x: v.x, z: v.z, big: v.type === 'bus', vtype: v.type });
            v.honkT = rand(2, 5);
          }
        }
      } else {
        v.stuck = 0;
        v.blockedByPlayer = 0;
        if (Math.random() < dt * 0.02 && dp < 60) events.push({ type: 'honk', x: v.x, z: v.z, big: v.type === 'bus', vtype: v.type });
      }
      v.ghost -= dt;
      const acc = target > v.speed ? 2.6 : -8;
      v.speed = clamp(v.speed + acc * dt, 0, Math.max(target, 0));
      if (target > v.speed) v.speed = Math.min(v.speed, target);

      v.d += v.speed * dt;
      if (v.d >= v.total) {
        const exit = v.pts[v.pts.length - 1];
        v.d -= v.total;
        v.i = v.bi;
        v.j = v.bj;
        v.dir = v.next;
        this.buildLeg(v, exit.clone());
      }
      this.place(v);
      v.group.position.set(v.x, 0, v.z);
      v.group.rotation.y = v.yaw;
      // bikes lean into turns
      if (v.type === 'bike') v.group.rotation.z = v.turning && v.d > straight ? (v.next === (v.dir + 3) % 4 ? -0.2 : 0.2) : 0;

      if (v.animate) v.animate(dt, v.speed);
      if (dp < 10) this.contact(v, player, events);
    }
  }

  // Circles approximating a vehicle's footprint
  circles(v) {
    const fx = Math.sin(v.yaw);
    const fz = Math.cos(v.yaw);
    const n = v.len > 6 ? 3 : v.len < 2.2 ? 1 : 2;
    const out = [];
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k / (n - 1) - 0.5) * (v.len - v.width);
      out.push([v.x + fx * off, v.z + fz * off, off]);
    }
    return out;
  }

  // The rickshaw touched this vehicle: shove it GTA-style and let the rickshaw carry on
  contact(v, player, events) {
    const r = v.width / 2;
    const heavy = KEEP[v.type] < 0.5;
    for (const [cx, cz, off] of this.circles(v)) {
      const hit = player.contactVehicle(cx, cz, r, heavy ? 0.8 : 0.2);
      if (!hit) continue;
      // push the vehicle out of the overlap
      const share = heavy ? 0.2 : 0.8;
      v.x -= hit.nx * hit.pen * share;
      v.z -= hit.nz * hit.pen * share;
      const pfx = Math.sin(player.yaw);
      const pfz = Math.cos(player.yaw);
      // closing speed relative to the other vehicle's own motion
      const cvx = v.knocked ? v.knocked.vx : Math.sin(v.yaw) * v.speed;
      const cvz = v.knocked ? v.knocked.vz : Math.cos(v.yaw) * v.speed;
      const closing = hit.into - (cvx * -hit.nx + cvz * -hit.nz);
      if (closing > 1.2 && v.pushCD <= 0) {
        v.pushCD = 0.3;
        // impulse direction: away from the rickshaw, biased along its travel
        let dx = -hit.nx + pfx * 0.9 * Math.sign(player.speed);
        let dz = -hit.nz + pfz * 0.9 * Math.sign(player.speed);
        const dl = Math.hypot(dx, dz) || 1;
        dx /= dl;
        dz /= dl;
        const mag = closing * PUSH[v.type] * (0.85 + Math.random() * 0.25);
        const vf = Math.sin(v.yaw);
        const vfz = Math.cos(v.yaw);
        this.knock(v, dx * mag + vf * v.speed * 0.6, dz * mag + vfz * v.speed * 0.6,
          (off * (vf * dz - vfz * dx) * mag * 0.35 + (Math.random() - 0.5) * mag * 0.25) * (v.type === 'bus' || v.type === 'truck' ? 0.2 : 1),
          Math.sign(vf * dz - vfz * dx) || 1);
        // the rickshaw keeps rolling, a little slower
        player.speed *= KEEP[v.type];
        const strength = Math.min(1, closing / 12);
        if (v.hitCD <= 0 && closing > 2.5) {
          v.hitCD = 1.5;
          events.push({ type: 'carHit', vtype: v.type, strength, x: hit.px, z: hit.pz, heavy });
        } else events.push({ type: 'scrape', strength: strength * 0.5, x: hit.px, z: hit.pz });
        if (heavy && closing > 3) player.crash(closing, events);
      } else {
        v.speed = Math.min(v.speed, 0.5);
      }
      v.group.position.set(v.x, 0, v.z);
      return;
    }
  }

  knock(v, vx, vz, spin, side) {
    if (!v.knocked) {
      v.knocked = { vx: 0, vz: 0, spin: 0, t: 0, settle: 0, roll: 0, rollV: 0, fall: 0, honk: 2 };
    }
    const k = v.knocked;
    k.vx = vx;
    k.vz = vz;
    k.spin += spin;
    k.settle = 0;
    k.rollV += side * Math.min(4, Math.hypot(vx, vz) * 0.35);
    if (v.type === 'bike' || (v.type === 'rickshaw' && Math.hypot(vx, vz) > 9)) k.fall = side;
    v.speed = 0;
  }

  updateKnocked(v, dt, player, dp, events) {
    const k = v.knocked;
    k.t += dt;
    v.x += k.vx * dt;
    v.z += k.vz * dt;
    v.yaw += k.spin * dt;
    const fr = Math.exp(-(v.type === 'bike' ? 1.3 : 1.9) * dt);
    k.vx *= fr;
    k.vz *= fr;
    k.spin *= Math.exp(-2.6 * dt);
    const sp = Math.hypot(k.vx, k.vz);
    // bounce off walls, poles and parked stuff
    for (const [cx, cz] of this.circles(v)) {
      const p = { x: cx, z: cz };
      const hit = this.city.collideCircle(p, v.width / 2);
      if (!hit) continue;
      v.x += p.x - cx;
      v.z += p.z - cz;
      const vn = k.vx * hit.nx + k.vz * hit.nz;
      if (vn < 0) {
        k.vx -= 1.4 * vn * hit.nx;
        k.vz -= 1.4 * vn * hit.nz;
        k.spin += (Math.random() - 0.5) * -vn * 0.8;
        if (-vn > 3) events.push({ type: 'impact', strength: Math.min(1, -vn / 10), x: cx, z: cz });
      }
    }
    // chain reactions with other traffic
    if (sp > 1.5) {
      for (const o of this.list) {
        if (o === v || o.hitCD > 0) continue;
        const dx = o.x - v.x;
        const dz = o.z - v.z;
        const rr = (o.width + v.width) / 2 + Math.min(o.len, v.len) * 0.25;
        const d2 = dx * dx + dz * dz;
        if (d2 > rr * rr || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const rel = k.vx * nx + k.vz * nz;
        if (rel <= 0.5) continue;
        const pushO = rel * Math.min(1, PUSH[o.type] * 1.4);
        const ov = o.knocked ? [o.knocked.vx, o.knocked.vz] : [Math.sin(o.yaw) * o.speed, Math.cos(o.yaw) * o.speed];
        this.knock(o, ov[0] * 0.5 + nx * pushO, ov[1] * 0.5 + nz * pushO, (Math.random() - 0.5) * pushO * 0.5, Math.random() < 0.5 ? -1 : 1);
        o.hitCD = 0.5;
        k.vx -= nx * rel * 0.55;
        k.vz -= nz * rel * 0.55;
        events.push({ type: 'impact', strength: Math.min(1, rel / 8), x: (o.x + v.x) / 2, z: (o.z + v.z) / 2 });
      }
    }
    // body wobble, or tipping over for bikes
    k.rollV += (-k.roll * 60 - k.rollV * 6) * dt;
    k.roll += k.rollV * dt;
    const g = v.group;
    g.position.set(v.x, 0, v.z);
    g.rotation.y = v.yaw;
    if (k.fall) {
      g.rotation.z += (k.fall * 1.35 - g.rotation.z) * Math.min(1, dt * 6);
      g.position.y = Math.abs(Math.sin(g.rotation.z)) * 0.25;
    } else g.rotation.z = k.roll * 0.08;
    if (v.animate) v.animate(dt, sp);
    if (dp < 10) this.contact(v, player, events);
    // the other driver honks furiously once things settle
    if (sp < 0.4) {
      k.settle += dt;
      k.honk -= dt;
      if (k.honk <= 0 && k.settle < 6 && dp < 60 && v.type !== 'tonga' && v.type !== 'donkey') {
        events.push({ type: 'honk', x: v.x, z: v.z, big: v.type === 'bus' || v.type === 'truck', angry: true, vtype: v.type });
        k.honk = 0.9 + Math.random();
      }
    }
    v.speed = 0;
    // tow it away once the player has moved on
    if ((k.settle > 5 && dp > 35) || k.t > 40) this.spawn(v, { x: player.pos.x, z: player.pos.z });
  }
}
