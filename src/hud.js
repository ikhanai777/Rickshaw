// HUD: speedometer, fare panel, CNG gauge, speech bubbles, toasts and a rotating minimap.
import { CITY_MIN, CITY_MAX, HALF_ROAD } from './config.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(city) {
    this.city = city;
    this.el = {
      money: $('money'), rides: $('rides'), stars: $('stars'), gear: $('gear'), kmh: $('kmh'),
      fuel: $('fuel-fill'), fuelBox: $('fuel'), job: $('job'), jobName: $('job-name'), jobDist: $('job-dist'),
      jobTime: $('job-time'), jobFare: $('job-fare'), toasts: $('toasts'), speech: $('speech'),
      speechWho: $('speech-who'), speechText: $('speech-text'), hint: $('hint'), clock: $('tod'),
    };
    this.gauge = $('gauge');
    this.gctx = this.gauge.getContext('2d');
    this.mini = $('minimap');
    this.mctx = this.mini.getContext('2d');
    this.speechTimer = 0;
    this.buildMapImage();
  }

  buildMapImage() {
    const pad = HALF_ROAD + 50;
    const lo = CITY_MIN - pad;
    const hi = CITY_MAX + pad;
    const S = 2; // px per metre
    const size = Math.ceil((hi - lo) * S);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#5b5e63';
    ctx.fillRect(0, 0, size, size);
    for (const b of this.city.blocks) {
      ctx.fillStyle = { park: '#3f6b35', mosque: '#8c4a36', station: '#2f6f4a', bazaar: '#9a7b52', clocktower: '#8a7a5a', fort: '#8c5a3c', dhaba: '#7a5a3a' }[b.kind] || '#2b2d31';
      ctx.fillRect((b.x0 - lo) * S, (b.z0 - lo) * S, (b.x1 - b.x0) * S, (b.z1 - b.z0) * S);
    }
    ctx.fillStyle = '#e8e8e8';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const l of this.city.landmarks) {
      const icon = { station: '⛽ CNG', mosque: '🕌', park: '🗼', clocktower: '🕰', fort: '🏰' }[l.kind] || '★';
      ctx.fillText(icon, (l.x - lo) * S, (l.z - lo) * S + 8);
    }
    this.mapImg = c;
    this.mapLo = lo;
    this.mapS = S;
  }

  update(player, traffic, missions, fps) {
    const kmh = Math.abs(player.speed) * 3.6;
    this.el.kmh.textContent = Math.round(kmh);
    this.el.gear.textContent = player.speed < -0.2 ? 'R' : player.gear;
    this.el.money.textContent = `Rs ${missions.money.toLocaleString('en-PK')}`;
    this.el.rides.textContent = missions.rides;
    const r = missions.rating;
    this.el.stars.textContent = '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));
    this.el.fuel.style.width = `${Math.round(player.fuel * 100)}%`;
    this.el.fuelBox.classList.toggle('low', player.fuel < 0.2);
    this.drawGauge(kmh, player.rpm);
    this.drawMinimap(player, traffic, missions);
    if (this.speechTimer > 0) {
      this.speechTimer -= 1 / 60;
      if (this.speechTimer <= 0) this.el.speech.classList.remove('show');
    }
    void fps;
  }

  drawGauge(kmh, rpm) {
    const c = this.gctx;
    const W = this.gauge.width;
    const cx = W / 2;
    const cy = W / 2;
    const R = W / 2 - 8;
    c.clearRect(0, 0, W, W);
    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    c.lineWidth = 10;
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath();
    c.arc(cx, cy, R, a0, a1);
    c.stroke();
    const f = Math.min(kmh / 80, 1);
    const grad = c.createLinearGradient(0, W, W, 0);
    grad.addColorStop(0, '#2ecc71');
    grad.addColorStop(0.7, '#f7c600');
    grad.addColorStop(1, '#ff3b30');
    c.strokeStyle = grad;
    c.beginPath();
    c.arc(cx, cy, R, a0, a0 + (a1 - a0) * f);
    c.stroke();
    // rpm inner arc
    c.lineWidth = 4;
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.beginPath();
    c.arc(cx, cy, R - 14, a0, a1);
    c.stroke();
    c.strokeStyle = rpm > 0.85 ? '#ff6b3d' : '#9ad0ff';
    c.beginPath();
    c.arc(cx, cy, R - 14, a0, a0 + (a1 - a0) * Math.min(rpm, 1));
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.font = '600 11px system-ui, sans-serif';
    c.textAlign = 'center';
    for (let k = 0; k <= 80; k += 20) {
      const a = a0 + ((a1 - a0) * k) / 80;
      c.fillText(k, cx + Math.cos(a) * (R - 30), cy + Math.sin(a) * (R - 30) + 4);
    }
  }

  drawMinimap(player, traffic, missions) {
    const c = this.mctx;
    const W = this.mini.width;
    const zoom = 0.75; // canvas px per metre
    c.save();
    c.clearRect(0, 0, W, W);
    c.beginPath();
    c.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#1b1c1f';
    c.fillRect(0, 0, W, W);
    c.translate(W / 2, W / 2);
    // heading up: rotate world so player's forward points up the screen
    c.rotate(Math.PI + player.yaw);
    c.scale(zoom, zoom);
    c.translate(-player.pos.x, -player.pos.z);
    const s = 1 / this.mapS;
    c.drawImage(this.mapImg, this.mapLo, this.mapLo, this.mapImg.width * s, this.mapImg.height * s);
    c.fillStyle = '#d0d4da';
    for (const v of traffic.list) c.fillRect(v.x - 1.2, v.z - 1.2, 2.4, 2.4);
    c.restore();

    // markers (clamped to the rim when off-map)
    const toScreen = (x, z) => {
      const dx = x - player.pos.x;
      const dz = z - player.pos.z;
      const cs = Math.cos(player.yaw);
      const sn = Math.sin(player.yaw);
      // forward component -> up, left component -> left
      const fwd = dx * sn + dz * cs;
      const right = -(dx * cs - dz * sn);
      let sx = right * zoom;
      let sy = -fwd * zoom;
      const len = Math.hypot(sx, sy);
      const max = W / 2 - 10;
      const clamped = len > max;
      if (clamped) {
        sx *= max / len;
        sy *= max / len;
      }
      return [W / 2 + sx, W / 2 + sy, clamped];
    };
    const dot = (x, z, color, r) => {
      const [sx, sy, cl] = toScreen(x, z);
      c.fillStyle = color;
      c.strokeStyle = '#000';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(sx, sy, cl ? r * 0.8 : r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    };
    if (missions.job) dot(missions.job.dest.x, missions.job.dest.z, '#ffc400', 7);
    else for (const w of missions.waiting) dot(w.spot.x, w.spot.z, '#3cff7a', 5);
    if (this.city.station && player.fuel < 0.35) dot(this.city.station.x, this.city.station.z, '#4fc3f7', 6);
    // player arrow
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#0f7a3c';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(W / 2, W / 2 - 9);
    c.lineTo(W / 2 + 6, W / 2 + 7);
    c.lineTo(W / 2, W / 2 + 3);
    c.lineTo(W / 2 - 6, W / 2 + 7);
    c.closePath();
    c.fill();
    c.stroke();
  }

  job(j) {
    if (!j) {
      this.el.job.classList.remove('show');
      return;
    }
    this.el.job.classList.add('show');
    this.el.jobName.textContent = j.name;
    this.el.jobDist.textContent = j.dist > 1000 ? `${(j.dist / 1000).toFixed(1)} km` : `${Math.round(j.dist)} m`;
    const t = Math.max(0, Math.ceil(j.time));
    this.el.jobTime.textContent = j.time < 0 ? 'LATE' : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    this.el.jobTime.classList.toggle('late', j.time < 10);
    this.el.jobFare.textContent = `Rs ${j.fare}`;
  }

  speech(who, text) {
    this.el.speechWho.textContent = who;
    this.el.speechText.textContent = text;
    this.el.speech.classList.add('show');
    this.speechTimer = 4.5;
  }

  toast(text, kind = 'info') {
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    setTimeout(() => d.classList.add('out'), 3200);
    setTimeout(() => d.remove(), 3800);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  hint(text) {
    this.el.hint.textContent = text || '';
    this.el.hint.classList.toggle('show', !!text);
  }
}
