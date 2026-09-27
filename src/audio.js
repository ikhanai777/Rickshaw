// All sound is synthesised with WebAudio: a rattly 2-stroke engine, the rickshaw's
// "paan-paan" horn, distant traffic horns, city rumble, crashes and coin chimes.

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    // --- engine: pulse train at firing frequency through a resonant filter
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 3);
    }
    shaper.curve = curve;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 900;
    this.engFilter.Q.value = 4;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.5;
    // amplitude "putt" modulation
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'square';
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.35;
    const am = ctx.createGain();
    am.gain.value = 0.65;
    this.lfo.connect(lfoGain).connect(am.gain);
    this.osc1.connect(shaper);
    this.osc2.connect(g2).connect(shaper);
    shaper.connect(this.engFilter).connect(am).connect(this.engGain).connect(this.master);
    // mechanical rattle: filtered noise
    this.noiseBuf = this.makeNoise(2);
    const rattle = ctx.createBufferSource();
    rattle.buffer = this.noiseBuf;
    rattle.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 2400;
    rf.Q.value = 1.2;
    this.rattleGain = ctx.createGain();
    this.rattleGain.gain.value = 0;
    rattle.connect(rf).connect(this.rattleGain).connect(am);
    rattle.start();
    this.osc1.start();
    this.osc2.start();
    this.lfo.start();

    // --- city ambience
    const amb = ctx.createBufferSource();
    amb.buffer = this.makeNoise(4, true);
    amb.loop = true;
    const af = ctx.createBiquadFilter();
    af.type = 'lowpass';
    af.frequency.value = 500;
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0.25;
    amb.connect(af).connect(this.ambGain).connect(this.master);
    amb.start();

    this.hornNodes = null;
  }

  makeNoise(seconds, brown = false) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  engine(rpm, throttle, speed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const fire = 16 + rpm * 70; // firing frequency Hz
    this.osc1.frequency.setTargetAtTime(fire, t, 0.05);
    this.osc2.frequency.setTargetAtTime(fire * 0.5, t, 0.05);
    this.lfo.frequency.setTargetAtTime(fire * 0.5, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(500 + rpm * 1400 + throttle * 500, t, 0.08);
    this.engGain.gain.setTargetAtTime(0.16 + throttle * 0.1 + rpm * 0.06, t, 0.08);
    this.rattleGain.gain.setTargetAtTime(0.05 + rpm * 0.12, t, 0.1);
    this.ambGain.gain.setTargetAtTime(0.22 + Math.min(speed / 20, 1) * 0.12, t, 0.3);
  }

  horn(on) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (on && !this.hornNodes) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.22, ctx.currentTime, 0.01);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1100;
      f.Q.value = 0.9;
      const a = ctx.createOscillator();
      const b = ctx.createOscillator();
      a.type = b.type = 'square';
      a.frequency.value = 415;
      b.frequency.value = 523;
      a.connect(f);
      b.connect(f);
      f.connect(g).connect(this.master);
      a.start();
      b.start();
      this.hornNodes = { g, a, b };
    } else if (!on && this.hornNodes) {
      const { g, a, b } = this.hornNodes;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      a.stop(ctx.currentTime + 0.15);
      b.stop(ctx.currentTime + 0.15);
      this.hornNodes = null;
    }
  }

  // distant traffic horn, volume by distance
  honk(dist, big = false, angry = false) {
    if (!this.ctx || dist > 120) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = Math.min(0.2, 6 / (dist + 8)) * (big ? 1.3 : 1);
    const beeps = angry ? 3 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 3);
    const base = big ? 220 + Math.random() * 60 : 330 + Math.random() * 240;
    for (let k = 0; k < beeps; k++) {
      const st = t + k * 0.22;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(vol, st + 0.01);
      g.gain.setValueAtTime(vol, st + 0.14);
      g.gain.linearRampToValueAtTime(0, st + 0.18);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2500 - Math.min(dist, 100) * 18;
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      o1.type = o2.type = 'square';
      o1.frequency.value = base;
      o2.frequency.value = base * 1.26;
      o1.connect(f);
      o2.connect(f);
      f.connect(g).connect(this.master);
      o1.start(st);
      o2.start(st);
      o1.stop(st + 0.2);
      o2.stop(st + 0.2);
    }
  }

  thud(strength = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300 + strength * 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5 * strength + 0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.4);
    // metallic clang
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 180 + Math.random() * 80;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.25 * strength, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.32);
  }

  clunk(strength = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.22);
  }

  coins() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [988, 1319, 1568].forEach((fr, k) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = fr;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t + k * 0.09);
      g.gain.linearRampToValueAtTime(0.15, t + k * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + k * 0.09 + 0.4);
      o.connect(g).connect(this.master);
      o.start(t + k * 0.09);
      o.stop(t + k * 0.09 + 0.45);
    });
  }

  // Crunch of metal and a tinkle of glass when you ram something
  crunch(strength = 1, dist = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = Math.min(1, 8 / (dist + 8)) * (0.35 + strength * 0.5);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900 + Math.random() * 600;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.5);
    for (let k = 0; k < 3; k++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(90 + Math.random() * 160, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
      const og = ctx.createGain();
      og.gain.setValueAtTime(vol * 0.25, t);
      og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(og).connect(this.master);
      o.start(t);
      o.stop(t + 0.32);
    }
    if (strength > 0.35) {
      for (let k = 0; k < 7; k++) {
        const st = t + 0.03 + Math.random() * 0.25;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 2500 + Math.random() * 4000;
        const og = ctx.createGain();
        og.gain.setValueAtTime(vol * 0.12, st);
        og.gain.exponentialRampToValueAtTime(0.001, st + 0.12);
        o.connect(og).connect(this.master);
        o.start(st);
        o.stop(st + 0.14);
      }
    }
  }

  // Jingle-truck pressure horn that plays a little tune
  musicalHorn(dist) {
    if (!this.ctx || dist > 140) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = Math.min(0.22, 9 / (dist + 10));
    const tunes = [[523, 659, 784, 659, 523], [392, 523, 659, 784], [659, 587, 523, 587, 659, 659]];
    const tune = tunes[Math.floor(Math.random() * tunes.length)];
    tune.forEach((f, k) => {
      const st = t + k * 0.16;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(vol, st + 0.02);
      g.gain.setValueAtTime(vol, st + 0.12);
      g.gain.linearRampToValueAtTime(0, st + 0.15);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * 2;
      bp.Q.value = 1.2;
      for (const m of [1, 1.5]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f * m * 0.5;
        o.connect(bp);
        o.start(st);
        o.stop(st + 0.16);
      }
      bp.connect(g).connect(this.master);
    });
  }

  // ----------------------------------------------------------------- radio

  radioOn(scale = 'yaman') {
    if (!this.ctx || this.radio) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(0.5, ctx.currentTime, 0.3);
    // transistor-radio band limiting
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 140;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4200;
    out.connect(hp).connect(lp).connect(this.master);
    // tanpura drone on Sa and Pa
    const sa = scale === 'pahari' ? 146.83 : 138.59;
    const drone = ctx.createGain();
    drone.gain.value = 0.035;
    const df = ctx.createBiquadFilter();
    df.type = 'lowpass';
    df.frequency.value = 900;
    const dro = [];
    for (const f of [sa, sa * 1.5, sa * 2, sa * 1.003]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(df);
      o.start();
      dro.push(o);
    }
    df.connect(drone).connect(out);
    const degrees = scale === 'pahari' ? [0, 2, 4, 5, 7, 9, 10, 12, 14] : [0, 2, 4, 6, 7, 9, 11, 12, 14];
    const phrase = [];
    let idx = 4;
    for (let k = 0; k < 16; k++) {
      idx = Math.max(0, Math.min(degrees.length - 1, idx + Math.round((Math.random() - 0.5) * 3)));
      phrase.push(Math.random() < 0.72 ? idx : -1);
    }
    const r = { out, dro, step: 0, next: ctx.currentTime + 0.1, phrase, degrees, sa: sa * 2, scale, bar: 0 };
    const bpm = scale === 'pahari' ? 112 : 92;
    const stepDur = 60 / bpm / 2;
    // keherwa: dha ge na ti | na ka dhi na
    const bayan = [1, 0.6, 0, 0, 0, 0, 0.8, 0];
    const dayan = [0.8, 0, 1, 0.6, 1, 0.5, 0.8, 1];
    r.timer = setInterval(() => {
      while (r.next < ctx.currentTime + 0.25) {
        const st = r.next;
        const k = r.step % 8;
        if (bayan[k]) this.drum(out, st, 'bayan', bayan[k]);
        if (dayan[k]) this.drum(out, st, k === 5 ? 'ka' : 'na', dayan[k]);
        const deg = r.phrase[r.step % 16];
        if (deg >= 0) this.note(out, st, r.sa * Math.pow(2, r.degrees[deg] / 12), stepDur * (Math.random() < 0.3 ? 2 : 1), scale);
        r.step++;
        if (r.step % 64 === 0) {
          // vary the phrase every few bars so it does not loop forever
          for (let j = 0; j < 4; j++) r.phrase[Math.floor(Math.random() * 16)] = Math.random() < 0.7 ? Math.floor(Math.random() * r.degrees.length) : -1;
        }
        r.next += stepDur;
      }
    }, 50);
    this.radio = r;
  }

  radioOff() {
    if (!this.radio) return;
    const r = this.radio;
    clearInterval(r.timer);
    r.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    for (const o of r.dro) o.stop(this.ctx.currentTime + 0.5);
    this.radio = null;
  }

  drum(out, t, kind, v) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    if (kind === 'bayan') {
      o.type = 'sine';
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(58, t + 0.25);
      g.gain.setValueAtTime(0.5 * v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    } else if (kind === 'na') {
      o.type = 'triangle';
      o.frequency.setValueAtTime(760, t);
      o.frequency.exponentialRampToValueAtTime(700, t + 0.1);
      g.gain.setValueAtTime(0.18 * v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    } else {
      o.type = 'square';
      o.frequency.setValueAtTime(320, t);
      g.gain.setValueAtTime(0.06 * v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    }
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.45);
  }

  note(out, t, f, dur, scale) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    if (scale === 'pahari') {
      // rabab: bright pluck that dies away
      lp.frequency.setValueAtTime(4000, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + 0.3);
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + Math.max(0.35, dur * 1.8));
    } else {
      // harmonium: reedy, sustained
      lp.frequency.value = 1900;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.04);
      g.gain.setValueAtTime(0.07, t + dur * 0.9);
      g.gain.linearRampToValueAtTime(0, t + dur * 1.05);
    }
    const oscs = scale === 'pahari' ? [['sawtooth', 1], ['square', 2.002]] : [['sawtooth', 1], ['sawtooth', 1.004], ['square', 0.5]];
    for (const [type, m] of oscs) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * m;
      if (scale !== 'pahari') {
        const vib = ctx.createOscillator();
        const vg = ctx.createGain();
        vib.frequency.value = 5.5;
        vg.gain.value = f * 0.006;
        vib.connect(vg).connect(o.frequency);
        vib.start(t);
        vib.stop(t + dur * 1.1 + 0.05);
      }
      o.connect(lp);
      o.start(t);
      o.stop(t + Math.max(0.4, dur * 1.9));
    }
    lp.connect(g).connect(out);
  }
}
