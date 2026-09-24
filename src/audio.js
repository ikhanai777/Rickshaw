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
  honk(dist, big = false) {
    if (!this.ctx || dist > 120) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const vol = Math.min(0.2, 6 / (dist + 8)) * (big ? 1.3 : 1);
    const beeps = 1 + Math.floor(Math.random() * 3);
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
}
