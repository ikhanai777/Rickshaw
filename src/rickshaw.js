// The auto-rickshaw: detailed model (canopy, chrome, tassels, truck-art back panel
// with "ماں کی دعا") plus an arcade three-wheeler driving model.
import * as THREE from 'three';
import { Builder, mat4, col } from './builder.js';
import { truckArtTexture, plateTexture } from './textures.js';
import { vehicleMaterials } from './vehicles.js';
import { Person, randomLook } from './people.js';
import { clamp, lerp, damp, rand, pick } from './util.js';

const WHEEL_R = 0.26;
const TIRE = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.13, 20).rotateZ(Math.PI / 2);
const RIM = new THREE.CylinderGeometry(0.15, 0.15, 0.14, 14).rotateZ(Math.PI / 2);
const TUBE = new THREE.CylinderGeometry(1, 1, 1, 8).toNonIndexed();
const SPHERE = new THREE.SphereGeometry(1, 10, 8).toNonIndexed();
const CONE = new THREE.ConeGeometry(1, 1, 6).toNonIndexed();

let shared = null;
function rickshawMaterials() {
  if (shared) return shared;
  const VM = vehicleMaterials();
  shared = {
    paint: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.12 }),
    chrome: VM.chrome,
    rubber: VM.rubber,
    dark: VM.dark,
    head: VM.head,
    tail: VM.tail,
    canvas: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, side: THREE.DoubleSide }),
    seat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xbfd6e0, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }),
    artBack: new THREE.MeshStandardMaterial({ map: truckArtTexture('ماں کی دعا', '#0b3d91'), roughness: 0.55, vertexColors: true }),
    artSide: new THREE.MeshStandardMaterial({ map: truckArtTexture('جنت کی ہوا', '#8b0000'), roughness: 0.55, vertexColors: true }),
    tire: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9 }),
    rim: new THREE.MeshStandardMaterial({ color: 0xd0d4d8, roughness: 0.2, metalness: 1 }),
    plate: new THREE.MeshStandardMaterial({ map: plateTexture(`LRR ${Math.floor(rand(1000, 9999))}`), roughness: 0.5, vertexColors: true }),
  };
  return shared;
}

// side profile helper, [z, y] points extruded across x
function profile(points, w, bevel = 0.03) {
  const s = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateY(-Math.PI / 2);
  g.translate(w / 2 - bevel, 0, 0);
  return g;
}

// Canopy cross-section (arched roof) extruded along z
function canopyGeometry(width, zBack, zFront) {
  const s = new THREE.Shape();
  const hw = width / 2;
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI - (i / 16) * Math.PI;
    pts.push([Math.cos(a) * hw, Math.sin(a) * 0.32]);
  }
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  for (let i = pts.length - 1; i >= 0; i--) s.lineTo(pts[i][0] * 0.96, pts[i][1] * 0.92 - 0.03);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: zFront - zBack, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, zBack);
  return g;
}

export function createRickshawModel({ color = '#0f7a3c', trim = '#f7c600', driver = true, simple = false } = {}) {
  const M = rickshawMaterials();
  const b = new Builder();
  const body = col(color);
  const accent = col(trim);
  const chrome = col('#e6e8ea');
  const black = col('#141414');

  // rear tub (passenger area)
  b.geom('paint', profile([[-1.22, 0.34], [-1.28, 0.8], [-1.2, 0.95], [-0.05, 0.95], [0.05, 0.34]], 1.34), new THREE.Matrix4(), body);
  // yellow accent band and chrome strip along the tub
  b.box('paint', 0, 0.78, -0.6, 1.37, 0.1, 1.2, accent);
  b.box('chrome', 0, 0.66, -0.6, 1.38, 0.025, 1.22, chrome);
  // front cowl / leg shield with nose
  b.geom('paint', profile([
    [-0.1, 0.34], [0.72, 0.34], [0.8, 0.6], [1.3, 0.6], [1.36, 0.95], [1.3, 1.22], [1.14, 1.33],
    [0.94, 1.31], [0.82, 0.96], [0.25, 0.8], [-0.1, 0.8],
  ], 0.82), new THREE.Matrix4(), body);
  b.box('paint', 0, 1.02, 1.28, 0.84, 0.06, 0.2, accent);
  // floor / chassis
  b.box('dark', 0, 0.33, -0.2, 1.2, 0.06, 2.1);
  // front mudguard & fork
  b.geom('paint', new THREE.CylinderGeometry(0.31, 0.31, 0.2, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).toNonIndexed(), mat4(0, WHEEL_R, 1.05, 0), accent);
  for (const x of [-0.1, 0.1]) b.geom('chrome', TUBE, mat4(x, 0.55, 1.03, 0, 0.025, 0.65, 0.025, -0.15), chrome);

  // seats
  const seatCol = col(pick(['#7a1020', '#5a0d16', '#1d3557', '#3e2723']));
  b.box('seat', 0, 0.98, -0.72, 1.18, 0.14, 0.55, seatCol);
  b.box('seat', 0, 1.3, -1.1, 1.18, 0.5, 0.12, seatCol, 0);
  b.box('seat', 0, 1.0, 0.28, 0.5, 0.12, 0.42, seatCol);
  b.box('chrome', 0, 1.18, -0.02, 1.1, 0.03, 0.03, chrome); // grab bar behind driver
  // handlebar
  b.geom('chrome', TUBE, mat4(0, 1.08, 0.86, 0, 0.022, 0.4, 0.022, -0.35), chrome);
  b.geom('chrome', TUBE, mat4(0, 1.26, 0.8, 0, 0.018, 0.66, 0.018, 0, Math.PI / 2), chrome);
  for (const s of [-1, 1]) {
    b.geom('dark', TUBE, mat4(s * 0.3, 1.26, 0.8, 0, 0.028, 0.12, 0.028, 0, Math.PI / 2), black);
    // mirrors on stalks, angled out past the canopy poles
    b.geom('chrome', TUBE, mat4(s * 0.42, 1.33, 0.84, 0, 0.01, 0.34, 0.01, 0, s * 1.1), chrome);
    b.geom('chrome', SPHERE, mat4(s * 0.6, 1.41, 0.86, 0, 0.065, 0.05, 0.015), chrome);
  }
  // headlight + indicators on the nose
  b.geom('chrome', TUBE, mat4(0, 1.12, 1.36, 0, 0.11, 0.08, 0.11, Math.PI / 2), chrome);
  b.geom('head', TUBE, mat4(0, 1.12, 1.405, 0, 0.09, 0.01, 0.09, Math.PI / 2));
  for (const s of [-1, 1]) b.box('paint', s * 0.3, 1.12, 1.3, 0.1, 0.06, 0.06, col('#ff8f00'));
  // tail lamps, plate, rear guard, exhaust
  for (const s of [-1, 1]) b.box('tail', s * 0.52, 0.62, -1.265, 0.16, 0.12, 0.04);
  b.box('chrome', 0, 0.45, -1.33, 1.3, 0.05, 0.05, chrome);
  for (const s of [-0.5, 0, 0.5]) b.box('chrome', s, 0.4, -1.3, 0.04, 0.12, 0.04, chrome);
  b.geom('plate', new THREE.PlaneGeometry(0.34, 0.13).rotateY(Math.PI).toNonIndexed(), mat4(0, 0.6, -1.275, 0));
  b.geom('chrome', TUBE, mat4(0.42, 0.3, -1.12, 0, 0.045, 0.5, 0.045, Math.PI / 2 - 0.1), chrome);
  // mud flaps
  for (const s of [-1, 1]) b.box('dark', s * 0.62, 0.2, -0.9, 0.12, 0.28, 0.02, col('#1a1a1a'));

  // canopy supports and roof
  const zb = -1.28;
  const zf = 0.98;
  for (const [x, z] of [[-0.64, -1.24], [0.64, -1.24], [-0.6, 0.94], [0.6, 0.94], [-0.64, -0.12], [0.64, -0.12]]) {
    b.geom('chrome', TUBE, mat4(x, 1.4, z, 0, 0.018, 0.92, 0.018), chrome);
  }
  b.geom('canvas', canopyGeometry(1.4, zb, zf), mat4(0, 1.84, 0, 0), col('#161616'));
  b.box('paint', 0, 1.86, zf + 0.01, 1.42, 0.08, 0.04, accent);
  // back canvas with truck art
  b.box('canvas', 0, 1.42, zb + 0.01, 1.36, 0.88, 0.02, col('#161616'));
  b.geom('artBack', new THREE.PlaneGeometry(1.24, 0.62).rotateY(Math.PI).toNonIndexed(), mat4(0, 1.42, zb - 0.005, 0));
  // side curtains behind passengers
  for (const s of [-1, 1]) {
    b.box('canvas', s * 0.68, 1.42, -1.0, 0.02, 0.84, 0.5, col('#161616'));
    b.geom('artSide', new THREE.PlaneGeometry(0.46, 0.36).rotateY(s * Math.PI / 2).toNonIndexed(), mat4(s * 0.695, 1.38, -1.0, 0));
  }
  // windscreen
  b.geom('glass', new THREE.PlaneGeometry(1.12, 0.6).rotateX(-0.12).toNonIndexed(), mat4(0, 1.55, 0.96, 0));
  b.box('chrome', 0, 1.24, 0.95, 1.14, 0.03, 0.03, chrome);
  // tassels hanging from the canopy edge
  if (!simple) {
    const tasselCols = ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#ff6f00', '#d81b60'];
    for (let i = 0; i < 12; i++) {
      const x = -0.66 + (i / 11) * 1.32;
      b.geom('canvas', CONE, mat4(x, 1.78, zf + 0.04, 0, 0.025, 0.1, 0.025, Math.PI), col(tasselCols[i % tasselCols.length]));
    }
    for (const s of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        const z = zb + 0.1 + (i / 7) * (zf - zb - 0.2);
        b.geom('canvas', CONE, mat4(s * 0.71, 1.78, z, 0, 0.025, 0.12, 0.025, Math.PI), col(tasselCols[(i + 2) % tasselCols.length]));
      }
    }
    // brass bells / beads on the windscreen top
    for (let i = 0; i < 9; i++) b.geom('chrome', SPHERE, mat4(-0.5 + i * 0.125, 1.88, 0.99, 0, 0.02, 0.02, 0.02), col('#d4a017'));
  }

  const bodyGroup = b.build(M);
  bodyGroup.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.material !== M.glass;
      o.receiveShadow = true;
    }
  });

  const root = new THREE.Group();
  const tilt = new THREE.Group(); // body roll / pitch / vibration
  root.add(tilt);
  tilt.add(bodyGroup);

  const wheel = () => {
    const g = new THREE.Group();
    const t = new THREE.Mesh(TIRE, M.tire);
    const r = new THREE.Mesh(RIM, M.rim);
    t.castShadow = true;
    g.add(t, r);
    return g;
  };
  const steer = new THREE.Group();
  steer.position.set(0, WHEEL_R, 1.05);
  const fw = wheel();
  steer.add(fw);
  root.add(steer);
  const rw = [-0.6, 0.6].map((x) => {
    const w = wheel();
    w.position.set(x, WHEEL_R, -0.62);
    root.add(w);
    return w;
  });

  let driverPerson = null;
  if (driver) {
    driverPerson = new Person(randomLook(true));
    driverPerson.sit();
    driverPerson.group.position.set(0, 1.04 - 0.92 + 0.02, 0.28);
    driverPerson.arms[0].rotation.x = -1.15;
    driverPerson.arms[1].rotation.x = -1.15;
    driverPerson.arms[0].rotation.z = -0.25;
    driverPerson.arms[1].rotation.z = 0.25;
    tilt.add(driverPerson.group);
  }

  return { root, tilt, steer, frontWheel: fw, rearWheels: rw, driver: driverPerson };
}

// ---------------------------------------------------------------------------

export const LIVERIES = {
  green: { name: 'Lahori Green', color: '#0f7a3c', trim: '#f7c600' },
  blue: { name: 'Pindi Blue', color: '#0d47a1', trim: '#ffffff' },
  red: { name: 'Peshawari Red', color: '#b71c1c', trim: '#f7c600' },
  black: { name: 'Kala Jadoo', color: '#16181a', trim: '#e53935' },
  gold: { name: 'Sunehri', color: '#c9a227', trim: '#1b5e20' },
};

export class PlayerRickshaw {
  constructor(scene, city, livery = LIVERIES.green) {
    this.city = city;
    this.model = createRickshawModel({ color: livery.color, trim: livery.trim });
    scene.add(this.model.root);
    this.pos = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.speed = 0; // m/s along heading
    this.steer = 0;
    this.y = 0;
    this.vy = 0;
    this.roll = 0;
    this.pitch = 0;
    this.bounce = 0;
    this.bounceV = 0;
    this.wheelSpin = 0;
    this.throttle = 0;
    this.rpm = 0.15;
    this.gear = 1;
    this.fuel = 1;
    this.lastImpact = 0;
    this.passengerSeat = new THREE.Group();
    this.passengerSeat.position.set(0.18, 1.06 - 0.92, -0.74);
    this.model.tilt.add(this.passengerSeat);

    // single headlamp
    this.headlight = new THREE.SpotLight(0xfff0d0, 0, 45, 0.55, 0.5, 1.2);
    this.headlight.position.set(0, 1.12, 1.42);
    this.headlight.target.position.set(0, 0, 12);
    this.model.tilt.add(this.headlight, this.headlight.target);
  }

  exhaustPoint(out) {
    out.set(0.42, 0.32, -1.4);
    return this.model.tilt.localToWorld(out);
  }

  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.speed = 0;
  }

  update(dt, input, events) {
    const MAX = this.fuel > 0 ? 16.5 : 3.5; // ~60 km/h: these things aren't fast
    const REV = 4;
    const v = this.speed;
    let acc = 0;
    const th = input.throttle;
    const br = input.brake;
    if (th > 0) {
      if (v < -0.3) acc = 9 * th; // braking while rolling backwards
      else acc = 3.6 * th * (1 - Math.pow(Math.max(v, 0) / MAX, 2)) + 0.4 * th;
    }
    if (br > 0) {
      if (v > 0.3) acc -= 9 * br;
      else acc -= 2.5 * br * (1 - Math.max(-v, 0) / REV);
    }
    if (input.handbrake) acc -= Math.sign(v) * Math.min(Math.abs(v) / dt, 10);
    // rolling resistance + air drag
    acc -= Math.sign(v) * Math.min(Math.abs(v) / dt, 0.35 + v * v * 0.004);
    this.speed = clamp(v + acc * dt, -REV, MAX + 1);
    if (!th && !br && Math.abs(this.speed) < 0.05) this.speed = 0;

    // steering: the single front wheel makes it twitchy at low speed, calmer at speed
    const sp = Math.abs(this.speed);
    const maxSteer = lerp(0.62, 0.16, clamp(sp / 16, 0, 1));
    this.steer += (input.steer * maxSteer - this.steer) * damp(input.steer ? 6 : 9, dt);
    const WB = 1.67;
    const yawRate = (this.speed * Math.tan(this.steer)) / WB;
    this.yaw += yawRate * dt;

    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const prev = this.pos.clone();
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;

    // collisions: two circles along the body
    let impact = 0;
    for (const off of [0.75, -0.55]) {
      const c = new THREE.Vector3(this.pos.x + fx * off, 0, this.pos.z + fz * off);
      const before = c.clone();
      const hit = this.city.collideCircle(c, 0.68);
      if (hit) {
        this.pos.x += c.x - before.x;
        this.pos.z += c.z - before.z;
        const into = -(fx * hit.nx + fz * hit.nz) * this.speed;
        if (into > 0) {
          impact = Math.max(impact, into);
          // lose the speed component going into the wall, keep some sliding
          this.speed *= into > 4 ? 0.25 : 0.6;
        }
      }
    }
    if (impact > 2.5) this.crash(impact, events);

    // fuel
    const moved = prev.distanceTo(this.pos);
    this.fuel = Math.max(0, this.fuel - moved * 0.00013 - (th > 0 ? dt * 0.0002 : 0));

    // suspension: kerbs, speed breakers, potholes
    const gh = this.city.groundHeight(this.pos.x, this.pos.z);
    if (gh > this.y + 0.05 && sp > 1) {
      this.bounceV += sp * 0.35;
      events.push({ type: 'bump', strength: 0.6 });
    }
    this.y += (gh - this.y) * damp(18, dt);
    for (const off of [1.05, -0.62]) {
      const x = this.pos.x + fx * off;
      const z = this.pos.z + fz * off;
      let inside = false;
      for (const bm of this.city.bumps) if (x > bm.x0 && x < bm.x1 && z > bm.z0 && z < bm.z1) inside = true;
      const key = off > 0 ? 'bumpF' : 'bumpR';
      if (inside && !this[key]) {
        this.bounceV += Math.min(sp, 12) * 0.28;
        this.pitch += (off > 0 ? -0.004 : 0.003) * sp;
        events.push({ type: 'bump', strength: clamp(sp / 8, 0.2, 1.4) });
      }
      this[key] = inside;
    }
    this.bounceV += (-this.bounce * 160 - this.bounceV * 9) * dt;
    this.bounce += this.bounceV * dt;

    // body dynamics – three-wheelers lean a lot
    const lat = this.speed * yawRate;
    const targetRoll = clamp(-lat * 0.022, -0.14, 0.14);
    this.roll += (targetRoll - this.roll) * damp(5, dt);
    const targetPitch = clamp(-acc * 0.008, -0.05, 0.05);
    this.pitch += (targetPitch - this.pitch) * damp(5, dt);

    // engine rpm with a 4-speed box
    const kmh = sp * 3.6;
    const shift = [0, 15, 30, 45, 99];
    let gear = 1;
    while (gear < 4 && kmh > shift[gear]) gear++;
    if (gear !== this.gear) {
      this.gear = gear;
      events.push({ type: 'shift' });
    }
    const lo = shift[gear - 1];
    const hi = shift[gear];
    const inGear = clamp((kmh - lo) / (hi - lo), 0, 1);
    const targetRpm = th > 0 ? 0.35 + inGear * 0.6 : 0.15 + inGear * 0.35;
    this.rpm += (targetRpm - this.rpm) * damp(th > 0 ? 6 : 3, dt);
    this.throttle = th;

    // apply to model
    const m = this.model;
    m.root.position.set(this.pos.x, this.y, this.pos.z);
    m.root.rotation.y = this.yaw;
    const t = performance.now() / 1000;
    const idleShake = (0.004 + 0.002 * this.rpm) * (sp < 0.5 ? 1 : 0.5);
    m.tilt.rotation.z = this.roll + Math.sin(t * 61) * idleShake;
    m.tilt.rotation.x = this.pitch + Math.sin(t * 47) * idleShake * 0.5;
    m.tilt.position.y = this.bounce + Math.sin(t * 73) * idleShake * 1.5;
    m.steer.rotation.y = this.steer;
    this.wheelSpin += (this.speed * dt) / 0.26;
    m.frontWheel.rotation.x = this.wheelSpin;
    for (const w of m.rearWheels) w.rotation.x = this.wheelSpin;
  }

  crash(impact, events) {
    const now = performance.now();
    if (now - this.lastImpact < 400) return;
    this.lastImpact = now;
    this.bounceV += impact * 0.3;
    events.push({ type: 'crash', strength: clamp(impact / 10, 0.2, 1) });
  }

  // Contact with a traffic vehicle modelled as a circle. Returns contact info so the
  // traffic system can shove the other vehicle; `share` is how much of the overlap the
  // rickshaw itself gives up (small for light cars, most of it against a truck).
  contactVehicle(x, z, r, share) {
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    for (const off of [0.75, -0.55]) {
      const cx = this.pos.x + fx * off;
      const cz = this.pos.z + fz * off;
      const dx = cx - x;
      const dz = cz - z;
      const rr = r + 0.68;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const pen = rr - d;
        this.pos.x += nx * pen * share;
        this.pos.z += nz * pen * share;
        const into = -(fx * nx + fz * nz) * this.speed;
        return { nx, nz, pen, into, off, px: x + nx * r, pz: z + nz * r };
      }
    }
    return null;
  }
}
