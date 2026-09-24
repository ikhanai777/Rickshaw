// Small shared helpers: seeded random numbers and math utilities.

let seed = 1337;

export function setSeed(s) {
  seed = s >>> 0;
}

// mulberry32 – deterministic so the city is the same every time you play
export function rnd() {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rand = (a, b) => a + (b - a) * rnd();
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
export const chance = (p) => rnd() < p;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Frame-rate independent exponential smoothing factor
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
