// AI traffic that keeps LEFT, turns at chowks, brakes for whatever is ahead
// and leans on the horn when blocked – i.e. normal Lahore traffic.
import * as THREE from 'three';
import { N, HALF_ROAD, LANES, roadCoord } from './config.js';
import { makeVehicleMesh, TRAFFIC_MIX } from './vehicles.js';
import { createRickshawModel } from './rickshaw.js';
import { Person, randomLook } from './people.js';
import { rand, pick, chance, clamp, damp, wrapAngle } from './util.js';

const DX = [1, 0, -1, 0];
const DZ = [0, 1, 0, -1];
const SPEEDS = { sedan: 12.5, hatch: 11.5, van: 10.5, pickup: 10.5, bus: 9, bike: 13, rickshaw: 9.5 };

const valid = (i, j) => i >= 0 && j >= 0 && i <= N && j <= N;

export class Traffic {
  constructor(scene, count = 50) {
    this.scene = scene;
    this.list = [];
    const bag = [];
    for (const [t, w] of TRAFFIC_MIX) for (let k = 0; k < w; k++) bag.push(t);
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
      if (o.isMesh) o.castShadow = true;
    });
    this.scene.add(group);
    const lanePref = type === 'bike' || type === 'rickshaw' || type === 'bus' ? 1 : chance(0.6) ? 0 : 1;
    return {
      type, group, len, width,
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
      if (dp > 230) {
        this.spawn(v, pAgent);
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
            events.push({ type: 'honk', x: v.x, z: v.z, big: v.type === 'bus' || v.type === 'van' });
            v.honkT = rand(0.6, 2.5);
          }
        } else if (v.stuck > 5 && blockedBy && Math.abs(wrapAngle(blockedBy.yaw - v.yaw)) > 0.6) {
          v.ghost = 2.5; // cross-traffic deadlock at a chowk: squeeze through anyway
          v.stuck = 0;
        } else if (v.stuck > 3) {
          v.honkT -= dt;
          if (v.honkT <= 0 && dp < 80) {
            events.push({ type: 'honk', x: v.x, z: v.z, big: v.type === 'bus' });
            v.honkT = rand(2, 5);
          }
        }
      } else {
        v.stuck = 0;
        v.blockedByPlayer = 0;
        if (Math.random() < dt * 0.02 && dp < 60) events.push({ type: 'honk', x: v.x, z: v.z, big: v.type === 'bus' });
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

      // physical contact with the player
      if (dp < 8) {
        const n = v.type === 'bus' ? 3 : v.type === 'bike' ? 1 : 2;
        for (let k = 0; k < n; k++) {
          const off = n === 1 ? 0 : (k / (n - 1) - 0.5) * (v.len - v.width);
          if (player.collideDynamic(v.x + fx * off, v.z + fz * off, v.width / 2, events)) {
            v.speed = Math.min(v.speed, 1);
          }
        }
      }
    }
  }
}
