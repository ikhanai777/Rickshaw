// Sawari (passenger) jobs: pick up a waving passenger, drive them across town,
// get paid in rupees – minus deductions for scaring them half to death.
import * as THREE from 'three';
import { Person, randomLook } from './people.js';
import { CURB_H } from './config.js';
import { beamTexture } from './textures.js';
import { rand, pick, clamp } from './util.js';

const PICKUP_LINES = [
  'Bhai, {d} chalo ge?',
  'Assalam-o-Alaikum! {d} jana hai, jaldi karo.',
  'Rickshaw! {d} tak kitne ka? Chalo theek hai.',
  'Bhai sahab, {d} le chalo, meter wala scene nahi.',
  'Jaldi {d} pohanchao, class shuru hone wali hai!',
  'Beta, {d} jana hai. Aaram se chalana.',
  'Oye rickshaw! {d}! Double paise dunga agar jaldi pohanchaya.',
];
const CRASH_LINES = [
  'Oye! Aaram se bhai!', 'Maar do ge kya?!', 'Rickshaw hai ya jahaz?', 'Ya Allah khair!',
  'Bhai licence hai tumhare paas?', 'Meri kamar toot gayi!',
];
const BUMP_LINES = ['Uff yeh speed breaker!', 'Bhai zara dekh ke!', 'Sarak hai ya khet?'];
const PAY_LINES = ['Shukriya bhai, yeh lo.', 'Allah Hafiz, jeete raho!', 'Zabardast! Yeh lo paise.', 'JazakAllah bhai.'];
const LATE_LINES = ['Itni der? Adhe paise lo bas.', 'Mera tou kaam hi nikal gaya...'];
const PED_LINES = ['Oye! Andha hai kya?!', 'Dekh ke chalao!', 'Footpath pe rickshaw?!', 'Hosh karo bhai!'];

export class Missions {
  constructor(scene, city, player, hud, sound) {
    this.scene = scene;
    this.city = city;
    this.player = player;
    this.hud = hud;
    this.sound = sound;
    this.money = 0;
    this.rides = 0;
    this.ratings = [];
    this.waiting = [];
    this.job = null;
    this.boarding = null;
    this.speechCooldown = 0;

    const ringGeo = new THREE.RingGeometry(1.6, 2.0, 40).rotateX(-Math.PI / 2);
    this.pickMat = new THREE.MeshBasicMaterial({ color: 0x3cff7a, transparent: true, opacity: 0.8, depthWrite: false });
    this.destMat = new THREE.MeshBasicMaterial({ color: 0xffc400, transparent: true, opacity: 0.85, depthWrite: false });
    this.ringGeo = ringGeo;
    this.arrowGeo = new THREE.ConeGeometry(0.28, 0.6, 4).rotateX(Math.PI);

    // destination beam
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 60, 24, 1, true),
      new THREE.MeshBasicMaterial({ map: beamTexture(), color: 0xffc400, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = 30;
    this.destMarker = new THREE.Group();
    this.destMarker.add(beam, new THREE.Mesh(ringGeo, this.destMat));
    this.destMarker.visible = false;
    scene.add(this.destMarker);

    // guidance arrow floating over the rickshaw
    const arrow = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffd000, emissive: 0xffa000, emissiveIntensity: 0.6, roughness: 0.4 });
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 12).rotateX(Math.PI / 2), mat);
    head.position.z = 0.35;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.5), mat);
    arrow.add(head, shaft);
    this.arrow = arrow;
    scene.add(arrow);

    for (let k = 0; k < 4; k++) this.spawnWaiting();
  }

  spawnWaiting() {
    const near = this.player.pos;
    let spot = null;
    for (let t = 0; t < 30 && !spot; t++) {
      const s = this.city.randomCurbSpot();
      if (!s) continue;
      const d = Math.hypot(s.x - near.x, s.z - near.z);
      if (d > 35 && d < 200) spot = s;
    }
    if (!spot) spot = this.city.randomCurbSpot();
    const p = new Person(randomLook());
    p.group.position.set(spot.x, CURB_H, spot.z);
    p.group.rotation.y = Math.atan2(spot.fx, spot.fz);
    this.scene.add(p.group);
    const ring = new THREE.Mesh(this.ringGeo, this.pickMat);
    ring.position.set(spot.x, CURB_H + 0.03, spot.z);
    const arrow = new THREE.Mesh(this.arrowGeo, this.pickMat);
    this.scene.add(ring, arrow);
    this.waiting.push({ spot, person: p, ring, arrow, t: rand(0, 5) });
  }

  removeWaiting(w) {
    this.scene.remove(w.person.group, w.ring, w.arrow);
    this.waiting.splice(this.waiting.indexOf(w), 1);
  }

  say(text, who = 'Sawari') {
    this.hud.speech(who, text);
  }

  get rating() {
    if (!this.ratings.length) return 5;
    return this.ratings.reduce((a, b) => a + b, 0) / this.ratings.length;
  }

  update(dt, events) {
    const P = this.player;
    const sp = Math.abs(P.speed);
    this.speechCooldown -= dt;
    const t = performance.now() / 1000;

    for (const w of this.waiting) {
      w.t += dt;
      w.person.wave(w.t);
      const s = 1 + Math.sin(w.t * 4) * 0.08;
      w.ring.scale.set(s, 1, s);
      w.arrow.position.set(w.spot.x, CURB_H + 2.4 + Math.sin(w.t * 3) * 0.15, w.spot.z);
      w.arrow.rotation.y = w.t * 2;
      // face the rickshaw when it gets close
      const d = Math.hypot(w.spot.x - P.pos.x, w.spot.z - P.pos.z);
      if (d < 25) {
        const ty = Math.atan2(P.pos.x - w.spot.x, P.pos.z - w.spot.z);
        w.person.group.rotation.y = ty;
      }
      // recycle passengers that are now too far away
      if (d > 320 && !this.job) {
        this.removeWaiting(w);
        this.spawnWaiting();
        break;
      }
    }

    // boarding sequence
    if (this.boarding) {
      const bd = this.boarding;
      bd.t += dt;
      const seat = new THREE.Vector3();
      P.passengerSeat.getWorldPosition(seat);
      const p = bd.w.person;
      const k = clamp(bd.t / 1.1, 0, 1);
      p.group.position.lerpVectors(bd.from, new THREE.Vector3(seat.x, CURB_H, seat.z), k);
      p.walk(dt, 1.4);
      if (sp > 2.5) {
        this.hud.toast('Sawari reh gayi! Rukna tha…', 'warn');
        p.group.position.copy(bd.from);
        p.stand();
        this.boarding = null;
      } else if (bd.t > 1.1) {
        this.startJob(bd.w);
        this.boarding = null;
      }
    } else if (!this.job) {
      for (const w of this.waiting) {
        const d = Math.hypot(w.spot.x - P.pos.x, w.spot.z - P.pos.z);
        if (d < 6 && sp < 1.5) {
          this.boarding = { w, t: 0, from: w.person.group.position.clone() };
          w.person.unwave();
          this.scene.remove(w.ring, w.arrow);
          break;
        }
      }
    }

    // active fare
    if (this.job) {
      const j = this.job;
      j.time -= dt;
      const d = Math.hypot(j.dest.x - P.pos.x, j.dest.z - P.pos.z);
      this.destMarker.position.set(j.dest.x, CURB_H, j.dest.z);
      this.destMarker.children[1].scale.setScalar(1 + Math.sin(t * 4) * 0.08);
      this.hud.job({ name: j.dest.name, dist: d, time: j.time, fare: this.currentFare() });
      if (d < 7 && sp < 1.2) this.finishJob();
    } else {
      this.hud.job(null);
    }

    for (const e of events) {
      if (e.type === 'crash' && this.job) {
        this.job.crashes++;
        if (this.speechCooldown < 0) {
          this.say(pick(CRASH_LINES));
          this.speechCooldown = 3;
        }
      } else if (e.type === 'bump' && this.job && e.strength > 0.9 && this.speechCooldown < 0) {
        this.job.bumps++;
        this.say(pick(BUMP_LINES));
        this.speechCooldown = 4;
      } else if (e.type === 'hitPed') {
        this.money -= 200;
        this.hud.toast('Chalan! Rs 200 fine for hitting a pedestrian', 'bad');
        this.say(pick(PED_LINES), 'Rahgeer');
        this.ratingPenalty = (this.ratingPenalty || 0) + 1;
        if (this.job) this.job.crashes += 2;
      } else if (e.type === 'shout' && this.speechCooldown < 0 && Math.random() < 0.5) {
        this.say(pick(PED_LINES), 'Rahgeer');
        this.speechCooldown = 3;
      }
    }

    // floating guidance arrow
    const target = this.job ? this.job.dest : this.nearestWaiting();
    if (target) {
      this.arrow.visible = true;
      this.arrow.position.set(P.pos.x, P.y + 2.55 + Math.sin(t * 3) * 0.05, P.pos.z);
      this.arrow.rotation.y = Math.atan2(target.x - P.pos.x, target.z - P.pos.z);
      this.arrow.children[0].material.color.set(this.job ? 0xffc400 : 0x3cff7a);
      this.arrow.children[0].material.emissive.set(this.job ? 0xff9000 : 0x10a040);
    } else this.arrow.visible = false;
  }

  nearestWaiting() {
    let best = null;
    let bd = 1e9;
    for (const w of this.waiting) {
      const d = Math.hypot(w.spot.x - this.player.pos.x, w.spot.z - this.player.pos.z);
      if (d < bd) {
        bd = d;
        best = w.spot;
      }
    }
    return best;
  }

  startJob(w) {
    const from = w.spot;
    let dest = null;
    for (let k = 0; k < 40 && !dest; k++) {
      const s = this.city.randomCurbSpot(from, 170);
      if (s && s.name !== from.name) dest = s;
    }
    if (!dest) dest = this.city.randomCurbSpot(from, 120);
    const dist = Math.hypot(dest.x - from.x, dest.z - from.z) * 1.25; // Manhattan-ish
    const fare = Math.round((70 + dist * 0.55) / 10) * 10;
    this.scene.remove(w.person.group);
    this.waiting.splice(this.waiting.indexOf(w), 1);
    // seat the passenger in the back
    const p = new Person(w.person.look);
    p.sit();
    this.player.passengerSeat.add(p.group);
    this.job = { dest, fare, time: dist / 6.5 + 25, total: dist / 6.5 + 25, crashes: 0, bumps: 0, person: p, from };
    this.destMarker.visible = true;
    this.say(pick(PICKUP_LINES).replace('{d}', dest.name));
    this.hud.toast(`Sawari: ${dest.name} — Rs ${fare}`, 'good');
    this.spawnWaiting();
  }

  currentFare() {
    const j = this.job;
    let f = j.fare * Math.max(0.3, 1 - j.crashes * 0.15 - j.bumps * 0.03);
    if (j.time < 0) f *= 0.5;
    return Math.round(f / 10) * 10;
  }

  finishJob() {
    const j = this.job;
    let pay = this.currentFare();
    let tip = 0;
    if (j.time > j.total * 0.35 && j.crashes === 0) tip = Math.round((j.fare * 0.2) / 10) * 10;
    pay += tip;
    this.money += pay;
    this.rides++;
    const stars = clamp(5 - j.crashes - (j.time < 0 ? 1.5 : 0) - Math.min(2, (this.ratingPenalty || 0)), 1, 5);
    this.ratingPenalty = 0;
    this.ratings.push(stars);
    this.player.passengerSeat.remove(j.person.group);
    // passenger steps out on the footpath
    const p = j.person;
    p.stand();
    p.group.position.set(j.dest.x, CURB_H, j.dest.z);
    this.scene.add(p.group);
    setTimeout(() => this.scene.remove(p.group), 6000);
    this.say(j.time < 0 ? pick(LATE_LINES) : pick(PAY_LINES));
    this.hud.toast(`+ Rs ${pay}${tip ? ` (incl. Rs ${tip} tip)` : ''}  ${'★'.repeat(Math.round(stars))}${'☆'.repeat(5 - Math.round(stars))}`, 'money');
    this.sound.coins();
    this.job = null;
    this.destMarker.visible = false;
  }
}
