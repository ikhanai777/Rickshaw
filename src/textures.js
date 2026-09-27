// Procedurally painted canvas textures – no image downloads needed.
import * as THREE from 'three';
import { rnd, rand, randInt, pick, chance } from './util.js';

export const URDU_FONT = '"Noto Nastaliq Urdu", "Noto Naskh Arabic", "Jameel Noori Nastaleeq", "Urdu Typesetting", serif';
const LATIN_FONT = '"Oswald", "Arial Narrow", Impact, sans-serif';

let maxAniso = 8;
export function setMaxAnisotropy(a) {
  maxAniso = a;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c, { repeat = true, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

// Per-pixel grain; amount is +/- brightness in 0..255
function grain(ctx, w, h, amount, mono = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amount;
    if (mono) {
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    } else {
      d[i] += (rnd() - 0.5) * amount;
      d[i + 1] += (rnd() - 0.5) * amount;
      d[i + 2] += (rnd() - 0.5) * amount;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx, w, h, count, rMin, rMax, color, aMin, aMax) {
  for (let i = 0; i < count; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = rand(rMin, rMax);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = rand(aMin, aMax);
    g.addColorStop(0, `rgba(${color},${a})`);
    g.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    // wrap for seamless tiling
    if (x < r || y < r || x > w - r || y > h - r) {
      for (const [ox, oy] of [[w, 0], [-w, 0], [0, h], [0, -h]]) {
        const g2 = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g2.addColorStop(0, `rgba(${color},${a})`);
        g2.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = g2;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
}

function crack(ctx, x, y, len, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = rnd() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (rnd() - 0.5) * 1.2;
    x += Math.cos(a) * 6;
    y += Math.sin(a) * 6;
    ctx.lineTo(x, y);
    if (chance(0.05)) crack(ctx, x, y, len / 3, width * 0.7, color);
  }
  ctx.stroke();
}

// ---------------------------------------------------------------- ground ---

export function asphaltTexture() {
  const S = 1024;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#3b3b3a';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 60, 40, 180, '82,80,76', 0.12, 0.3); // sun-bleached wear
  blotches(ctx, S, S, 40, 30, 120, '30,30,30', 0.15, 0.4); // fresher patches
  blotches(ctx, S, S, 25, 10, 50, '15,15,17', 0.2, 0.45); // oil stains
  blotches(ctx, S, S, 20, 50, 160, '120,105,80', 0.04, 0.1); // dust
  // aggregate speckles
  for (let i = 0; i < 26000; i++) {
    const v = randInt(25, 115);
    ctx.fillStyle = `rgba(${v},${v},${v - 4},${rand(0.3, 0.8)})`;
    ctx.fillRect(rnd() * S, rnd() * S, rand(1, 3), rand(1, 3));
  }
  for (let i = 0; i < 14; i++) crack(ctx, rnd() * S, rnd() * S, randInt(10, 40), rand(1, 2.5), 'rgba(22,22,22,0.7)');
  grain(ctx, S, S, 22);
  return toTexture(c);
}

export function paverTexture() {
  const S = 512; // covers 3.5m
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#6d6861';
  ctx.fillRect(0, 0, S, S);
  const bw = 64;
  const bh = 32;
  for (let row = 0; row < S / bh; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < S / bw + 1; col++) {
      const x = col * bw + off;
      const y = row * bh;
      const red = (row + col) % 5 === 0;
      const base = red ? [158, 92, 70] : [156, 146, 128];
      const v = rand(-18, 18);
      ctx.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v})`;
      ctx.fillRect(x + 2, y + 2, bw - 4, bh - 4);
    }
  }
  blotches(ctx, S, S, 30, 20, 90, '90,75,55', 0.15, 0.35);
  blotches(ctx, S, S, 12, 10, 40, '30,30,30', 0.15, 0.3);
  grain(ctx, S, S, 26);
  return toTexture(c);
}

export function dirtTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#8a7a62';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 80, 20, 100, '120,100,75', 0.2, 0.4);
  blotches(ctx, S, S, 50, 20, 80, '95,85,60', 0.2, 0.4);
  blotches(ctx, S, S, 30, 10, 50, '90,95,55', 0.1, 0.3);
  grain(ctx, S, S, 30);
  return toTexture(c);
}

export function grassTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#5b7a33';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 60, 20, 90, '120,120,60', 0.15, 0.35);
  blotches(ctx, S, S, 40, 20, 90, '60,90,30', 0.2, 0.4);
  for (let i = 0; i < 20000; i++) {
    const g = randInt(80, 150);
    ctx.fillStyle = `rgba(${g - 40},${g},${g - 70},0.6)`;
    ctx.fillRect(rnd() * S, rnd() * S, 1, rand(2, 5));
  }
  grain(ctx, S, S, 20);
  return toTexture(c);
}

export function concreteTexture(base = '#a39e94') {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 50, 20, 120, '70,68,60', 0.1, 0.3);
  blotches(ctx, S, S, 30, 20, 80, '200,195,185', 0.1, 0.25);
  for (let i = 0; i < 6; i++) crack(ctx, rnd() * S, rnd() * S, randInt(8, 25), 1.2, 'rgba(50,50,50,0.5)');
  grain(ctx, S, S, 24);
  return toTexture(c);
}

// Weathered plaster used for parapets; almost white so vertex colours can tint it.
export function plasterTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#e9e5dc';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 40, 20, 110, '150,140,125', 0.1, 0.25);
  // rain streaks
  for (let i = 0; i < 18; i++) {
    const x = rnd() * S;
    const g = ctx.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, 'rgba(90,85,75,0.1)');
    g.addColorStop(1, 'rgba(90,85,75,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, rand(2, 10), rand(80, S));
  }
  grain(ctx, S, S, 20);
  return toTexture(c);
}

export function brickTexture() {
  const S = 512; // 4m x 4m
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#8e8474';
  ctx.fillRect(0, 0, S, S);
  const bw = 28;
  const bh = 9.5;
  for (let row = 0; row * bh < S; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col * bw < S; col++) {
      const v = rand(-20, 20);
      const r = 158 + v + rand(-10, 10);
      ctx.fillStyle = `rgb(${r},${88 + v},${66 + v})`;
      ctx.fillRect(col * bw + off + 1, row * bh + 1, bw - 2, bh - 2);
    }
  }
  // a couple of rough cement-plaster repairs with ragged edges
  for (let i = 0; i < 2; i++) {
    const cx = rnd() * S;
    const cy = rnd() * S;
    const r = rand(25, 55);
    ctx.fillStyle = `rgba(${randInt(150, 175)},${randInt(145, 165)},${randInt(135, 150)},0.85)`;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 2; a += 0.3) {
      const rr = r * rand(0.6, 1.2);
      const x = cx + Math.cos(a) * rr * 1.4;
      const y = cy + Math.sin(a) * rr * 0.7;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.fill();
  }
  // efflorescence / damp near the base
  const dg = ctx.createLinearGradient(0, S * 0.75, 0, S);
  dg.addColorStop(0, 'rgba(200,195,180,0)');
  dg.addColorStop(1, 'rgba(200,195,180,0.25)');
  ctx.fillStyle = dg;
  ctx.fillRect(0, S * 0.75, S, S * 0.25);
  blotches(ctx, S, S, 30, 20, 100, '40,35,30', 0.1, 0.3);
  grain(ctx, S, S, 22);
  return toTexture(c);
}

// ---------------------------------------------------------------- facades ---

function drawWindowGlass(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#3d4a55');
  g.addColorStop(0.45, '#6f8190');
  g.addColorStop(0.55, '#34404a');
  g.addColorStop(1, '#232a31');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

function drawGrille(ctx, x, y, w, h, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  for (let i = 1; i < 6; i++) {
    const xx = x + (w * i) / 6;
    ctx.beginPath();
    ctx.moveTo(xx, y);
    ctx.lineTo(xx, y + h);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x, y + h / 2);
  ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  // decorative diamond in the middle
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + h / 2 - 14);
  ctx.lineTo(x + w / 2 + 14, y + h / 2);
  ctx.lineTo(x + w / 2, y + h / 2 + 14);
  ctx.lineTo(x + w / 2 - 14, y + h / 2);
  ctx.closePath();
  ctx.stroke();
}

function litWindow(ectx, x, y, w, h) {
  const warm = chance(0.7);
  const g = ectx.createLinearGradient(x, y, x, y + h);
  if (warm) {
    g.addColorStop(0, 'rgb(255,190,110)');
    g.addColorStop(1, 'rgb(200,120,60)');
  } else {
    g.addColorStop(0, 'rgb(210,235,255)');
    g.addColorStop(1, 'rgb(150,190,220)');
  }
  ectx.fillStyle = g;
  ectx.fillRect(x, y, w, h);
}

// style: 0 = grilled windows with sunshades, 1 = wide windows + ventilators, 2 = old-city arched jharokas
export function facadeTexture(style) {
  const S = 1024;
  const cell = 256;
  const [c, ctx] = makeCanvas(S, S);
  const [e, ectx] = makeCanvas(S, S);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, S, S);
  ctx.fillStyle = style >= 2 ? '#e2d6c2' : '#ece8df';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 50, 30, 140, '150,138,120', 0.08, 0.22);

  for (let fy = 0; fy < 4; fy++) {
    for (let bx = 0; bx < 4; bx++) {
      const x0 = bx * cell;
      const y0 = fy * cell;
      // floor band
      ctx.fillStyle = 'rgba(120,110,95,0.35)';
      ctx.fillRect(x0, y0 + cell - 16, cell, 16);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x0, y0 + cell - 18, cell, 3);

      const lit = chance(0.35);
      if (style === 0) {
        const wx = x0 + 58;
        const wy = y0 + 70;
        const ww = 140;
        const wh = 130;
        // chajja (concrete sunshade) shadow
        const sg = ctx.createLinearGradient(0, wy - 30, 0, wy + 25);
        sg.addColorStop(0, 'rgba(60,55,50,0.7)');
        sg.addColorStop(1, 'rgba(60,55,50,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(wx - 16, wy - 10, ww + 32, 40);
        ctx.fillStyle = '#b8b0a2';
        ctx.fillRect(wx - 20, wy - 22, ww + 40, 12);
        ctx.fillStyle = '#6b5a45';
        ctx.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
        if (chance(0.25)) {
          // closed wooden shutters
          ctx.fillStyle = pick(['#6b4a2e', '#3f6b52', '#44607a', '#7b3c30']);
          ctx.fillRect(wx, wy, ww, wh);
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 2;
          for (let k = 0; k < 10; k++) {
            ctx.beginPath();
            ctx.moveTo(wx, wy + (wh * k) / 10);
            ctx.lineTo(wx + ww, wy + (wh * k) / 10);
            ctx.stroke();
          }
          ctx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
        } else {
          drawWindowGlass(ctx, wx, wy, ww, wh);
          if (chance(0.6)) {
            ctx.fillStyle = pick(['rgba(180,40,50,0.8)', 'rgba(210,180,90,0.8)', 'rgba(60,120,110,0.8)', 'rgba(230,220,200,0.85)']);
            ctx.fillRect(wx, wy, ww * rand(0.2, 0.5), wh);
          }
          if (lit) litWindow(ectx, wx, wy, ww, wh);
          drawGrille(ctx, wx, wy, ww, wh, '#2b2b2b');
        }
      } else if (style === 1) {
        const wx = x0 + 28;
        const wy = y0 + 60;
        const ww = 200;
        const wh = 120;
        ctx.fillStyle = '#8f8a82';
        ctx.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
        drawWindowGlass(ctx, wx, wy, ww, wh);
        ctx.fillStyle = '#d8d4cc';
        ctx.fillRect(wx + ww / 3 - 2, wy, 4, wh);
        ctx.fillRect(wx + (2 * ww) / 3 - 2, wy, 4, wh);
        if (chance(0.5)) {
          ctx.fillStyle = pick(['rgba(230,230,220,0.85)', 'rgba(140,40,60,0.8)', 'rgba(40,80,140,0.75)']);
          ctx.fillRect(wx + ww * 0.6, wy, ww * 0.4, wh);
        }
        if (lit) litWindow(ectx, wx, wy, ww, wh);
        // ventilator jaali above
        ctx.fillStyle = '#9a948a';
        ctx.fillRect(wx + 60, wy - 42, 80, 24);
        ctx.fillStyle = '#3a3a3a';
        for (let k = 0; k < 8; k++) ctx.fillRect(wx + 64 + k * 10, wy - 38, 5, 16);
        // exhaust stains
        const sg = ctx.createLinearGradient(0, wy + wh, 0, wy + wh + 60);
        sg.addColorStop(0, 'rgba(70,65,55,0.4)');
        sg.addColorStop(1, 'rgba(70,65,55,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(wx + rand(0, 150), wy + wh, rand(10, 40), 60);
      } else if (style === 3) {
        // Peshawari carved wooden jharoka with jaali lattice
        const wx = x0 + 34;
        const wy = y0 + 34;
        const ww = 188;
        const wh = 196;
        const wood = pick(['#5b3a22', '#4a2f1b', '#6b4428', '#3e2a1c']);
        ctx.fillStyle = wood;
        ctx.fillRect(wx, wy, ww, wh);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 3;
        ctx.strokeRect(wx + 6, wy + 6, ww - 12, wh - 12);
        // carved top arch band
        ctx.fillStyle = 'rgba(255,220,170,0.18)';
        for (let k = 0; k < 9; k++) {
          ctx.beginPath();
          ctx.arc(wx + 14 + k * 20, wy + 16, 8, Math.PI, 0);
          ctx.fill();
        }
        const lx = wx + 18;
        const ly = wy + 34;
        const lw = ww - 36;
        const lh = wh - 60;
        const open = chance(0.35);
        if (open) drawWindowGlass(ctx, lx, ly, lw, lh);
        else {
          ctx.fillStyle = '#1e140c';
          ctx.fillRect(lx, ly, lw, lh);
        }
        if (lit) {
          const g = ectx.createLinearGradient(0, ly, 0, ly + lh);
          g.addColorStop(0, 'rgb(255,180,90)');
          g.addColorStop(1, 'rgb(190,100,40)');
          ectx.fillStyle = g;
          ectx.fillRect(lx, ly, lw, lh);
        }
        // jaali: diagonal lattice drawn on both maps so light shines through the holes
        for (const [cx2, col2] of [[ctx, wood], [ectx, '#000']]) {
          cx2.save();
          cx2.beginPath();
          cx2.rect(lx, ly, lw, lh);
          cx2.clip();
          cx2.strokeStyle = col2;
          cx2.lineWidth = open ? 3 : 5;
          for (let k = -lh; k < lw + lh; k += 16) {
            cx2.beginPath();
            cx2.moveTo(lx + k, ly);
            cx2.lineTo(lx + k + lh, ly + lh);
            cx2.moveTo(lx + k, ly + lh);
            cx2.lineTo(lx + k + lh, ly);
            cx2.stroke();
          }
          cx2.restore();
        }
        // carved bottom panel and brackets
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(wx + 10, wy + wh - 22, ww - 20, 14);
        ctx.fillStyle = wood;
        ctx.fillRect(wx - 8, wy + wh, 16, 18);
        ctx.fillRect(wx + ww - 8, wy + wh, 16, 18);
      } else {
        const wx = x0 + 68;
        const wy = y0 + 50;
        const ww = 120;
        const wh = 160;
        // brick-coloured decorative frame
        ctx.fillStyle = '#9c6a4a';
        ctx.beginPath();
        ctx.moveTo(wx - 14, wy + wh + 8);
        ctx.lineTo(wx - 14, wy + 50);
        ctx.quadraticCurveTo(wx + ww / 2, wy - 50, wx + ww + 14, wy + 50);
        ctx.lineTo(wx + ww + 14, wy + wh + 8);
        ctx.fill();
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(wx, wy + wh);
        ctx.lineTo(wx, wy + 55);
        ctx.quadraticCurveTo(wx + ww / 2, wy - 25, wx + ww, wy + 55);
        ctx.lineTo(wx + ww, wy + wh);
        ctx.closePath();
        ctx.clip();
        if (chance(0.4)) {
          ctx.fillStyle = pick(['#2f5d4a', '#6b4526', '#35506e']);
          ctx.fillRect(wx, wy - 30, ww, wh + 40);
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          for (let k = 0; k < 6; k++) ctx.strokeRect(wx + 8 + (k % 2) * 56, wy + 50 + Math.floor(k / 2) * 34, 48, 28);
        } else {
          drawWindowGlass(ctx, wx, wy - 30, ww, wh + 40);
          if (lit) {
            ectx.save();
            ectx.beginPath();
            ectx.moveTo(wx, wy + wh);
            ectx.lineTo(wx, wy + 55);
            ectx.quadraticCurveTo(wx + ww / 2, wy - 25, wx + ww, wy + 55);
            ectx.lineTo(wx + ww, wy + wh);
            ectx.closePath();
            ectx.clip();
            litWindow(ectx, wx, wy - 30, ww, wh + 40);
            ectx.restore();
          }
          drawGrille(ctx, wx, wy - 30, ww, wh + 40, '#2a2420');
        }
        ctx.restore();
        // small balcony brackets
        ctx.fillStyle = '#7d5a40';
        ctx.fillRect(wx - 20, wy + wh + 8, ww + 40, 10);
      }
    }
  }
  // weather streaks from the top of the building down
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const g = ctx.createLinearGradient(0, y, 0, y + 200);
    g.addColorStop(0, 'rgba(80,72,60,0.22)');
    g.addColorStop(1, 'rgba(80,72,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, rand(3, 14), 200);
  }
  grain(ctx, S, S, 18);
  return { map: toTexture(c), emissive: toTexture(e) };
}

// Ground floor shop fronts: 4 bays in one 14m x 3.8m tile
export function shopTexture(variant) {
  const W = 1024;
  const H = 280;
  const [c, ctx] = makeCanvas(W, H);
  const [e, ectx] = makeCanvas(W, H);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#cfc8ba';
  ctx.fillRect(0, 0, W, H);
  const bay = W / 4;
  for (let b = 0; b < 4; b++) {
    const x = b * bay + 14;
    const y = 36;
    const w = bay - 28;
    const h = H - 36;
    const kind = (b + variant) % 4 === 3 ? 'closed' : pick(['open', 'open', 'half', 'closed']);
    // interior
    if (kind !== 'closed') {
      ctx.fillStyle = '#2a2520';
      ctx.fillRect(x, y, w, h);
      // shelves stuffed with goods: boxes, bottles and packets with a bit of shading
      const lg = ctx.createLinearGradient(0, y, 0, y + h);
      lg.addColorStop(0, '#4a4036');
      lg.addColorStop(1, '#1e1a16');
      ctx.fillStyle = lg;
      ctx.fillRect(x, y, w, h);
      for (let sh = 0; sh < 6; sh++) {
        const sy = y + 16 + sh * 34;
        ctx.fillStyle = '#6b5238';
        ctx.fillRect(x + 4, sy + 26, w - 8, 4);
        let gx = x + 6;
        while (gx < x + w - 10) {
          const gw = rand(5, 11);
          const gh = rand(10, 24);
          const hue = pick([0, 10, 30, 45, 120, 200, 220, 280, 340]) + randInt(-10, 10);
          const bottle = chance(0.3);
          const g2 = ctx.createLinearGradient(gx, 0, gx + gw, 0);
          g2.addColorStop(0, `hsl(${hue},${randInt(35, 65)}%,${randInt(28, 40)}%)`);
          g2.addColorStop(0.4, `hsl(${hue},${randInt(35, 65)}%,${randInt(45, 60)}%)`);
          g2.addColorStop(1, `hsl(${hue},${randInt(35, 65)}%,${randInt(22, 32)}%)`);
          ctx.fillStyle = g2;
          if (bottle) {
            ctx.fillRect(gx + gw * 0.3, sy + 26 - gh - 4, gw * 0.4, 5);
            ctx.fillRect(gx, sy + 26 - gh, gw, gh);
          } else ctx.fillRect(gx, sy + 26 - gh, gw, gh);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(gx + 1, sy + 26 - gh * 0.6, gw - 2, 2);
          gx += gw + rand(0.5, 2.5);
        }
      }
      // counter
      ctx.fillStyle = pick(['#7a5236', '#3e5f7a', '#9aa0a4']);
      ctx.fillRect(x + 10, y + h - 70, w - 20, 70);
      // hanging bags of chips/sachets
      for (let k = 0; k < 10; k++) {
        ctx.fillStyle = `hsl(${randInt(0, 360)},80%,55%)`;
        ctx.fillRect(x + 8 + k * (w / 10), y + 4, 14, rand(20, 50));
      }
      // interior light: copy the painted interior, brightened, as the emissive map
      ectx.save();
      ectx.filter = 'brightness(2.2) saturate(1.2)';
      ectx.drawImage(c, x, y, w, h, x, y, w, h);
      ectx.restore();
      const g = ectx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, 'rgba(255,250,235,0.35)');
      g.addColorStop(1, 'rgba(0,0,0,0.2)');
      ectx.fillStyle = g;
      ectx.fillRect(x, y, w, h);
    }
    if (kind !== 'open') {
      // rolling shutter
      const sh = kind === 'half' ? h * 0.45 : h;
      ectx.fillStyle = '#000';
      ectx.fillRect(x, y, w, sh);
      const sg = ctx.createLinearGradient(x, 0, x + w, 0);
      sg.addColorStop(0, '#6f7275');
      sg.addColorStop(0.5, '#9a9ea1');
      sg.addColorStop(1, '#6a6d70');
      ctx.fillStyle = sg;
      ctx.fillRect(x, y, w, sh);
      ctx.fillStyle = 'rgba(40,40,40,0.5)';
      for (let yy = y; yy < y + sh; yy += 7) ctx.fillRect(x, yy, w, 2);
      ctx.fillStyle = '#4a4c4e';
      ctx.fillRect(x, y + sh - 8, w, 8);
      // graffiti / wall-chalking
      if (chance(0.5)) {
        ctx.fillStyle = pick(['rgba(200,30,30,0.7)', 'rgba(20,20,20,0.6)', 'rgba(20,80,160,0.6)']);
        ctx.font = `bold 26px ${URDU_FONT}`;
        ctx.fillText(pick(['برائے فروخت', 'ووٹ دو', 'یہاں پیشاب کرنا منع ہے', 'ڈاکٹر', 'ٹیوشن']), x + 16, y + sh * 0.5);
      }
      if (kind === 'closed' && chance(0.5)) {
        ctx.fillStyle = '#333';
        ctx.fillRect(x + w / 2 - 8, y + sh - 18, 16, 10); // padlock
      }
    }
    // pillars
    ctx.fillStyle = '#b9b1a3';
    ctx.fillRect(b * bay, 0, 14, H);
    ctx.fillRect(b * bay + bay - 14, 0, 14, H);
    ctx.fillStyle = '#a79f90';
    ctx.fillRect(b * bay, 0, bay, 36);
  }
  blotches(ctx, W, H, 30, 20, 80, '60,50,40', 0.1, 0.3);
  // grime near the ground
  const gg = ctx.createLinearGradient(0, H - 50, 0, H);
  gg.addColorStop(0, 'rgba(60,50,40,0)');
  gg.addColorStop(1, 'rgba(60,50,40,0.5)');
  ctx.fillStyle = gg;
  ctx.fillRect(0, H - 50, W, 50);
  grain(ctx, W, H, 16);
  return { map: toTexture(c), emissive: toTexture(e) };
}

export function stripeTexture(colA, colB, stripes = 8, diagonal = false) {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = colA;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = colB;
  const w = S / stripes;
  if (diagonal) {
    for (let i = -stripes; i < stripes * 2; i += 2) {
      ctx.beginPath();
      ctx.moveTo(i * w, 0);
      ctx.lineTo(i * w + w, 0);
      ctx.lineTo(i * w + w + S, S);
      ctx.lineTo(i * w + S, S);
      ctx.fill();
    }
  } else {
    for (let i = 0; i < stripes; i += 2) ctx.fillRect(i * w, 0, w, S);
  }
  blotches(ctx, S, S, 20, 10, 60, '40,35,30', 0.1, 0.35);
  grain(ctx, S, S, 20);
  return toTexture(c);
}

// Worn road paint: used as alphaMap with alphaTest so markings look faded
export function wornPaintTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  blotches(ctx, S, S, 50, 6, 30, '0,0,0', 0.4, 0.9);
  grain(ctx, S, S, 90);
  return toTexture(c, { srgb: false });
}

export function blotchTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + rand(-50, 50);
    const y = S / 2 + rand(-50, 50);
    const r = rand(30, 80);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(25,24,23,0.55)');
    g.addColorStop(0.7, 'rgba(25,24,23,0.35)');
    g.addColorStop(1, 'rgba(25,24,23,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  return toTexture(c, { repeat: false });
}

// ------------------------------------------------------------------ signs ---

export const SIGN_COUNT = 32;

export function signAtlas(SIGNS) {
  const W = 2048;
  const H = 2048;
  const [c, ctx] = makeCanvas(W, H);
  const [e, ectx] = makeCanvas(W, H);
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, W, H);
  const sw = 1024;
  const sh = 128;
  const palettes = [
    ['#c8102e', '#ffffff', '#ffd200'],
    ['#0a6e3a', '#ffffff', '#ffd200'],
    ['#153e9c', '#ffffff', '#ff4d4d'],
    ['#ffd200', '#b00000', '#0a3d91'],
    ['#ffffff', '#c8102e', '#0a6e3a'],
    ['#101010', '#ffd200', '#ffffff'],
    ['#e85d04', '#ffffff', '#1b1b1b'],
    ['#6a0dad', '#ffffff', '#ffd200'],
  ];
  SIGNS.forEach(([ur, en], i) => {
    const x = (i % 2) * sw;
    const y = Math.floor(i / 2) * sh;
    const [bg, fg, acc] = palettes[i % palettes.length];
    const g = ctx.createLinearGradient(0, y, 0, y + sh);
    g.addColorStop(0, bg);
    g.addColorStop(1, shade(bg, -30));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, sw, sh);
    ctx.fillStyle = acc;
    ctx.fillRect(x, y, sw, 8);
    ctx.fillRect(x, y + sh - 8, sw, 8);
    // Urdu name on the right (read right-to-left)
    ctx.fillStyle = fg;
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `bold 58px ${URDU_FONT}`;
    ctx.fillText(ur, x + sw - 30, y + sh / 2 + 4, 560);
    ctx.direction = 'ltr';
    ctx.textAlign = 'left';
    ctx.font = `bold 38px ${LATIN_FONT}`;
    ctx.fillStyle = acc;
    ctx.fillText(en, x + 30, y + sh / 2 - 14, 400);
    ctx.font = `24px ${LATIN_FONT}`;
    ctx.fillStyle = fg;
    ctx.fillText(`0${randInt(300, 345)}-${randInt(1000000, 9999999)}`, x + 30, y + sh / 2 + 28);
    // panaflex wrinkles & sun fade
    blotchesRect(ctx, x, y, sw, sh);
    // emissive: some signs are backlit at night
    if (i % 3 !== 2) {
      ectx.fillStyle = bg === '#ffffff' || bg === '#ffd200' ? '#b0a070' : '#707070';
      ectx.fillRect(x, y, sw, sh);
    }
  });
  const map = toTexture(c, { repeat: false });
  const emissive = toTexture(e, { repeat: false });
  const uv = (i) => {
    const x = (i % 2) * 0.5;
    const y = 1 - (Math.floor(i / 2) + 1) * (sh / H);
    return [x, y, x + 0.5, y + sh / H];
  };
  return { map, emissive, uv };
}

function blotchesRect(ctx, x, y, w, h) {
  for (let i = 0; i < 6; i++) {
    const cx = x + rnd() * w;
    const cy = y + rnd() * h;
    const r = rand(20, 90);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${chance(0.5) ? '255,255,255' : '0,0,0'},0.12)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
  const b = Math.max(0, Math.min(255, (n & 255) + amt));
  return `rgb(${r},${g},${b})`;
}

// --------------------------------------------------------------- truck art ---

function flower(ctx, x, y, r, petals, col, centre) {
  ctx.fillStyle = col;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.45, r * 0.22, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = centre;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

function artBorder(ctx, x, y, w, h, size) {
  const cols = ['#e6194b', '#ffe119', '#3cb44b', '#4363d8', '#f58231', '#ffffff'];
  let k = 0;
  for (let xx = x; xx < x + w; xx += size) {
    ctx.fillStyle = cols[k++ % cols.length];
    ctx.beginPath();
    ctx.moveTo(xx, y);
    ctx.lineTo(xx + size, y);
    ctx.lineTo(xx + size / 2, y + size);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(xx, y + h);
    ctx.lineTo(xx + size, y + h);
    ctx.lineTo(xx + size / 2, y + h - size);
    ctx.fill();
  }
}

// Pakistani truck art panel (used on the rickshaw's back and on buses)
export function truckArtTexture(text = 'ماں کی دعا', bg = '#0b3d91') {
  const W = 1024;
  const H = 512;
  const [c, ctx] = makeCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, bg);
  g.addColorStop(1, shade(bg, -40));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  artBorder(ctx, 0, 0, W, H, 32);
  // mirror-work dots
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = i % 2 ? '#e8e8f0' : '#ffd700';
    ctx.beginPath();
    ctx.arc(20 + i * 25.6, 52, 6, 0, Math.PI * 2);
    ctx.arc(20 + i * 25.6, H - 52, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  // central medallion with flowers
  for (let i = 0; i < 9; i++) {
    const x = 70 + i * 110;
    flower(ctx, x, H / 2 - 110, 38, 8, pick(['#ff3b3b', '#ffd700', '#ff7ab8', '#ffffff', '#39d353']), '#1a1a1a');
    flower(ctx, x + 55, H / 2 + 120, 30, 6, pick(['#ff3b3b', '#ffd700', '#ff7ab8', '#ffffff', '#39d353']), '#ffd700');
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(120, H / 2 - 70, W - 240, 140);
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 6;
  ctx.strokeRect(120, H / 2 - 70, W - 240, 140);
  ctx.fillStyle = '#ffffff';
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 84px ${URDU_FONT}`;
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#c8102e';
  ctx.strokeText(text, W / 2, H / 2 + 6, W - 300);
  ctx.fillText(text, W / 2, H / 2 + 6, W - 300);
  grain(ctx, W, H, 14);
  return toTexture(c, { repeat: false });
}

export function plateTexture(text) {
  const [c, ctx] = makeCanvas(256, 96);
  ctx.fillStyle = '#f2f2ea';
  ctx.fillRect(0, 0, 256, 96);
  ctx.fillStyle = '#0a6e3a';
  ctx.fillRect(0, 0, 256, 22);
  ctx.fillStyle = '#fff';
  ctx.font = `bold 16px ${LATIN_FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('PUNJAB', 128, 17);
  ctx.fillStyle = '#111';
  ctx.font = `bold 50px ${LATIN_FONT}`;
  ctx.fillText(text, 128, 78);
  return toTexture(c, { repeat: false });
}

// Simple soft round sprite for markers / glows
export function glowTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, { repeat: false });
}

// Vertical gradient used for the destination light beam
export function beamTexture() {
  const [c, ctx] = makeCanvas(16, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  return toTexture(c, { repeat: false });
}

// ------------------------------------------------------------- normal maps ---

// Builds a tangent-space normal map from the brightness of a painted texture.
export function normalMapFrom(tex, strength = 2, scale = 1) {
  const src = tex.image;
  const W = Math.max(64, Math.round(src.width * scale));
  const H = Math.max(64, Math.round(src.height * scale));
  const [c, ctx] = makeCanvas(W, H);
  ctx.drawImage(src, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H);
  const px = d.data;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) / 255;
  for (let y = 0; y < H; y++) {
    const yu = ((y - 1 + H) % H) * W;
    const yd = ((y + 1) % H) * W;
    const yc = y * W;
    for (let x = 0; x < W; x++) {
      const xl = (x - 1 + W) % W;
      const xr = (x + 1) % W;
      const dx = (lum[yc + xr] - lum[yc + xl]) * strength;
      const dy = (lum[yd + x] - lum[yu + x]) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const o = (yc + x) * 4;
      px[o] = (-dx * inv * 0.5 + 0.5) * 255;
      px[o + 1] = (dy * inv * 0.5 + 0.5) * 255;
      px[o + 2] = (inv * 0.5 + 0.5) * 255;
      px[o + 3] = 255;
    }
  }
  ctx.putImageData(d, 0, 0);
  const t = toTexture(c, { srgb: false });
  t.wrapS = tex.wrapS;
  t.wrapT = tex.wrapT;
  return t;
}

// Wooden jaali lattice for Peshawari balconies
export function latticeTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#1a120b';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#8a5e3a';
  ctx.lineWidth = 7;
  for (let k = -S; k < S * 2; k += 32) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + S, S);
    ctx.moveTo(k, S);
    ctx.lineTo(k + S, 0);
    ctx.stroke();
  }
  ctx.strokeStyle = '#6b4428';
  ctx.lineWidth = 16;
  ctx.strokeRect(0, 0, S, S);
  grain(ctx, S, S, 22);
  return toTexture(c);
}

export function clockFaceTexture() {
  const S = 256;
  const [c, ctx] = makeCanvas(S, S);
  ctx.fillStyle = '#7a3b22';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#f3ecd8';
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.fillStyle = '#222';
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    ctx.fillRect(S / 2 + Math.cos(a) * 92 - 4, S / 2 + Math.sin(a) * 92 - 4, 8, 8);
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(S / 2, S / 2);
  ctx.lineTo(S / 2 + 45, S / 2 - 30);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(S / 2, S / 2);
  ctx.lineTo(S / 2 - 20, S / 2 - 80);
  ctx.stroke();
  return toTexture(c, { repeat: false });
}

export function pakFlagTexture() {
  const [c, ctx] = makeCanvas(300, 200);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 75, 200);
  ctx.fillStyle = '#01411c';
  ctx.fillRect(75, 0, 225, 200);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(190, 100, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#01411c';
  ctx.beginPath();
  ctx.arc(210, 86, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - 0.6;
    const r = i % 2 ? 9 : 22;
    const x = 222 + Math.cos(a) * r;
    const y = 72 + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.fill();
  return toTexture(c, { repeat: false });
}

// Soft dark gradient: contact shadows under vehicles and grime at wall bases
export function contactShadowTexture() {
  const [c, ctx] = makeCanvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, { repeat: false });
}

export function aoStripTexture() {
  const [c, ctx] = makeCanvas(16, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 64);
  return toTexture(c, { repeat: false });
}

// Pakistani truck art used on the taj (crown) of jingle trucks
export function tajArtTexture(text = 'ماشاءاللہ', bg = '#8b0000') {
  const W = 512;
  const H = 320;
  const [c, ctx] = makeCanvas(W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(bg, 40));
  g.addColorStop(1, shade(bg, -30));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // sun-burst rays
  for (let k = 0; k < 24; k++) {
    const a = Math.PI + (k / 23) * Math.PI;
    ctx.strokeStyle = k % 2 ? 'rgba(255,215,0,0.55)' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.95);
    ctx.lineTo(W / 2 + Math.cos(a) * W, H * 0.95 + Math.sin(a) * W);
    ctx.stroke();
  }
  artBorder(ctx, 0, 0, W, H, 26);
  for (let i = 0; i < 6; i++) flower(ctx, 50 + i * 82, H - 60, 26, 8, pick(['#ff3b3b', '#ffd700', '#ffffff', '#39d353', '#ff7ab8']), '#1a1a1a');
  // peacock-eye medallions
  for (const x of [80, W - 80]) {
    ctx.fillStyle = '#0b3d91';
    ctx.beginPath();
    ctx.ellipse(x, 110, 44, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.ellipse(x, 110, 28, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.ellipse(x, 110, 12, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 7;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 64px ${URDU_FONT}`;
  ctx.strokeText(text, W / 2, 118, W - 220);
  ctx.fillText(text, W / 2, 118, W - 220);
  grain(ctx, W, H, 12);
  return toTexture(c, { repeat: false });
}

// Clusters of leaves on a transparent background for alpha-tested tree canopies
export function leafTexture() {
  const S = 512;
  const [c, ctx] = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * S * 0.47;
    const x = S / 2 + Math.cos(a) * r;
    const y = S / 2 + Math.sin(a) * r * 0.9;
    const shade = 0.55 + rnd() * 0.45 - (r / S) * 0.2;
    const g = Math.round(110 * shade + 40);
    ctx.fillStyle = `rgb(${Math.round(g * 0.55)},${g},${Math.round(g * 0.35)})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rand(5, 11), rand(2.5, 5), rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // a few twigs
  ctx.strokeStyle = 'rgba(70,50,30,0.8)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(S / 2, S / 2);
    const a = rnd() * Math.PI * 2;
    ctx.lineTo(S / 2 + Math.cos(a) * S * 0.35, S / 2 + Math.sin(a) * S * 0.35);
    ctx.stroke();
  }
  const t = toTexture(c, { repeat: false });
  return t;
}
