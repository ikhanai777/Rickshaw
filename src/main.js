import * as THREE from 'three';
import { City } from './city.js';
import { PlayerRickshaw, LIVERIES } from './rickshaw.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './people.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Sound } from './audio.js';
import { setMaxAnisotropy, glowTexture } from './textures.js';
import { setVehicleNight, animateVehicleLights } from './vehicles.js';
import { roadCoord, N, HALF_ROAD, LANES, CITY_MIN, CITY_MAX } from './config.js';
import { clamp, lerp, damp, rand, pick, setSeed } from './util.js';
import { CITIES, CITY, selectCity } from './cities.js';
import { Particles, PostFX } from './effects.js';

// ------------------------------------------------------------------ settings

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem('rickshaw.' + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem('rickshaw.' + k, JSON.stringify(v));
    } catch {
      /* storage unavailable: settings just won't persist */
    }
  },
};

const VENDOR_CALLS = {
  lahore: ['Garam garam samosay!', 'Chai! Kadak doodh patti!', 'Aalu le lo, pyaz le lo!', 'Meethay keenu, sasta lagaya hai!',
    'Channay, garam channay!', 'Gol gappay, khattay meethay!', 'Lassi! Thandi meethi lassi!', 'Kulfi! Malai wali kulfi!',
    'Bhutta, garma garam bhutta!', 'Jalebi, taazi jalebi!'],
  peshawar: ['Chapli kabab, taaza taaza!', 'Qehwa! Sabz qehwa!', 'Kishmish, badaam, akhrot!', 'Peshawari ice cream!',
    'Anaar, Kandahari anaar!', 'Kabuli pulao, garam!', 'Naan, taazay naan!', 'Chai, Khan sahab, chai!',
    'Sardey, meethey sardey!', 'Namak mandi ka tikka!'],
};

const $ = (id) => document.getElementById(id);
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

async function progress(text) {
  $('load-text').textContent = text;
  await nextFrame();
  await nextFrame();
}

async function fontsReady() {
  if (!document.fonts) return;
  const loads = Promise.all([
    document.fonts.load('bold 58px "Noto Nastaliq Urdu"', 'ماں کی دعا'),
    document.fonts.load('bold 38px "Oswald"', 'SHOP'),
  ]).catch(() => {});
  await Promise.race([loads, new Promise((r) => setTimeout(r, 3500))]);
}

// ------------------------------------------------------------------ time of day

const PRESETS = [
  {
    label: 'Dopahar · Afternoon', elev: 50, azim: 35, sun: '#fff0d8', sunI: 3.3, hemiSky: '#cdd6e4', hemiGround: '#8a7a60', hemiI: 0.85,
    top: '#4f86cc', horizon: '#dcd5c3', fog: '#cbc4b2', fogD: 0.0034, exposure: 0.82, night: 0, env: 0.6, clouds: 0.42,
  },
  {
    label: 'Shaam · Golden hour', elev: 8, azim: -65, sun: '#ffa860', sunI: 2.6, hemiSky: '#9aaccc', hemiGround: '#7a5a40', hemiI: 0.6,
    top: '#34528c', horizon: '#f2a05e', fog: '#cf9a70', fogD: 0.0040, exposure: 0.95, night: 0.35, env: 0.45, clouds: 0.5,
  },
  {
    label: 'Raat · Night', elev: 40, azim: 140, sun: '#8ea6ff', sunI: 0.3, hemiSky: '#3a4466', hemiGround: '#5a3e22', hemiI: 0.75,
    top: '#030611', horizon: '#20202c', fog: '#191a24', fogD: 0.0048, exposure: 1.15, night: 1, env: 0.12, clouds: 0.3,
  },
  {
    label: 'Subah · Smoggy morning', elev: 16, azim: 100, sun: '#ffe2b5', sunI: 2.0, hemiSky: '#c8c5bb', hemiGround: '#7d7260', hemiI: 0.95,
    top: '#98acc2', horizon: '#d5ccbb', fog: '#cdc4b3', fogD: 0.0072, exposure: 0.9, night: 0.05, env: 0.55, clouds: 0.25,
  },
];

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`;
const skyFrag = /* glsl */ `
  uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 groundColor;
  uniform vec3 sunDir; uniform vec3 sunColor; uniform float night; uniform float time; uniform float cloudCover;
  varying vec3 vDir;
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), f.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p *= 2.03; a *= 0.5; } return v; }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55));
    if (h < 0.0) col = mix(horizonColor, groundColor, clamp(-h * 6.0, 0.0, 1.0));
    float s = max(dot(d, normalize(sunDir)), 0.0);
    float disk = smoothstep(0.9994, 0.9997, s);
    col += sunColor * (disk * (night > 0.5 ? 1.5 : 18.0) + pow(s, 14.0) * 0.35 + pow(s, 3.0) * 0.12 * (1.0 - night));
    // drifting clouds, lit by the sun
    if (h > 0.0) {
      vec2 cuv = d.xz / (d.y + 0.12) * 1.4 + vec2(time * 0.012, time * 0.005);
      float cl = smoothstep(1.0 - cloudCover, 1.05 - cloudCover * 0.3, fbm(cuv));
      float lit = pow(max(dot(d, normalize(sunDir)), 0.0), 4.0);
      vec3 cc = mix(horizonColor * 1.08 + vec3(0.06), sunColor * 1.1, 0.25 + lit * 0.5);
      cc = mix(cc, vec3(0.05, 0.06, 0.09), night);
      col = mix(col, cc, cl * smoothstep(0.02, 0.22, h) * 0.9);
    }
    // haze band near the horizon
    col = mix(col, horizonColor, (1.0 - smoothstep(0.0, 0.18, abs(h))) * 0.5);
    if (night > 0.5 && h > 0.05) {
      float st = hash(floor(d * 900.0));
      col += vec3(step(0.9985, st)) * 0.45 * smoothstep(0.05, 0.3, h);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// ------------------------------------------------------------------ game

class Game {
  async init() {
    const hash = location.hash.replace('#', '');
    const cityId = CITIES[hash] ? hash : store.get('city', 'lahore');
    selectCity(cityId);
    setSeed(CITY.seed);
    const touch = matchMedia('(pointer: coarse)').matches;
    this.quality = store.get('quality', touch ? 'medium' : 'high');
    this.liveryId = store.get('livery', 'green');
    $('load-city').textContent = `${CITY.name} · ${CITY.urdu}`;
    await progress('Loading fonts…');
    await fontsReady();

    const Q = this.quality;
    const renderer = (this.renderer = new THREE.WebGLRenderer({ antialias: Q === 'low', powerPreference: 'high-performance' }));
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q === 'high' ? 1.75 : Q === 'medium' ? 1.25 : 0.85));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = Q !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    $('game').appendChild(renderer.domElement);
    setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));

    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, CITY.mountains ? 1000 : 620);
    scene.fog = new THREE.FogExp2(0xcbc4b2, 0.0034);

    // lights
    this.hemi = new THREE.HemisphereLight(0xcdd6e4, 0x8a7a60, 0.85);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xfff0d8, 3.3));
    sun.castShadow = true;
    sun.shadow.mapSize.set(Q === 'high' ? 2048 : 1024, Q === 'high' ? 2048 : 1024);
    const sc = sun.shadow.camera;
    sc.left = -65;
    sc.right = 65;
    sc.top = 65;
    sc.bottom = -65;
    sc.near = 1;
    sc.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);

    // sky dome
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color() }, horizonColor: { value: new THREE.Color() }, groundColor: { value: new THREE.Color(0x6b6150) },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, night: { value: 0 },
        time: { value: 0 }, cloudCover: { value: 0.4 },
      },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.skyMat));

    await progress(`Laying roads & building the mohallas of ${CITY.name}…`);
    this.city = new City(scene);
    await progress('Waking up the shopkeepers…');
    this.player = new PlayerRickshaw(scene, this.city, LIVERIES[this.liveryId] || LIVERIES.green);
    const sx = roadCoord(3) + LANES[1];
    this.player.reset(sx, roadCoord(2) + 22, 0);
    this.peds = new Pedestrians(scene, this.city, 46);
    await progress('Filling the streets with traffic…');
    this.traffic = new Traffic(scene, this.city, Q === 'low' ? 40 : 54);
    this.hud = new HUD(this.city);
    this.sound = new Sound();
    this.missions = new Missions(scene, this.city, this.player, this.hud, this.sound);
    const save = store.get('save.' + CITY.id, null);
    if (save) {
      this.missions.money = save.money || 0;
      this.missions.rides = save.rides || 0;
    }
    this.particles = new Particles(scene, Q);
    this.post = Q === 'low' ? null : new PostFX(renderer, scene, this.camera, Q);
    this.exhaustAcc = 0;
    this.bubbleT = 3;
    this.saveT = 5;

    this.makeAtmosphere();
    this.makeStreetLights();

    this.presetIndex = 0;
    this.applyPreset(PRESETS[0]);

    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, horn: false };
    this.keys = new Set();
    this.camMode = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.shake = 0;
    this.state = 'menu';
    this.orbit = 0;
    this.paused = false;
    this.fuelling = false;
    this.bindInput();

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.buildMenu();
    $('loading').classList.add('hidden');
    $('menu').classList.add('show');
    this.clock = new THREE.Clock();
    this.fpsAcc = 0;
    this.fpsN = 0;
    renderer.setAnimationLoop(() => this.frame());
  }

  makeAtmosphere() {
    // floating dust motes around the camera
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand(-30, 30);
      pos[i * 3 + 1] = rand(0, 12);
      pos[i * 3 + 2] = rand(-30, 30);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(g, new THREE.PointsMaterial({
      size: 0.08, map: glowTexture(), color: 0xe8d8b8, transparent: true, opacity: 0.35, depthWrite: false,
    }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    // kites (patang) and cheel birds circling over the rooftops
    this.flyers = [];
    const kiteCols = [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0xff6f00, 0xffffff];
    for (let k = 0; k < 9; k++) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.6);
      shape.lineTo(0.45, 0);
      shape.lineTo(0, -0.6);
      shape.lineTo(-0.45, 0);
      shape.closePath();
      const kite = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: kiteCols[k % kiteCols.length], side: THREE.DoubleSide, roughness: 0.7 }));
      kite.scale.setScalar(1.3);
      this.scene.add(kite);
      this.flyers.push({ obj: kite, kind: 'kite', cx: rand(CITY_MIN, CITY_MAX), cz: rand(CITY_MIN, CITY_MAX), h: rand(35, 60), ph: rand(0, 10) });
    }
    const birdGeo = new THREE.BufferGeometry();
    birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, -0.9, 0.15, -0.1, 0, 0, -0.2, 0, 0, 0.3, 0.9, 0.15, -0.1, 0, 0, -0.2], 3));
    birdGeo.computeVertexNormals();
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a2420, side: THREE.DoubleSide });
    for (let k = 0; k < 10; k++) {
      const b = new THREE.Mesh(birdGeo, birdMat);
      b.scale.setScalar(1.3);
      this.scene.add(b);
      this.flyers.push({ obj: b, kind: 'bird', cx: rand(-150, 150), cz: rand(-150, 150), h: rand(40, 80), r: rand(15, 40), ph: rand(0, 10), sp: rand(0.15, 0.3) });
    }
  }

  makeStreetLights() {
    // a small pool of real point lights that follow the nearest street lamps at night
    this.lampLights = [];
    for (let k = 0; k < 6; k++) {
      const l = new THREE.PointLight(0xffb867, 0, 34, 1.7);
      this.scene.add(l);
      this.lampLights.push(l);
    }
    this.lampTimer = 0;
  }

  applyPreset(p) {
    const el = THREE.MathUtils.degToRad(p.elev);
    const az = THREE.MathUtils.degToRad(p.azim);
    this.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    this.sun.color.set(p.sun);
    this.sun.intensity = p.sunI;
    this.hemi.color.set(p.hemiSky);
    this.hemi.groundColor.set(p.hemiGround);
    this.hemi.intensity = p.hemiI;
    this.scene.fog.color.set(p.fog);
    if (CITY.haze.tint && p.night < 0.5) this.scene.fog.color.lerp(new THREE.Color(CITY.haze.tint), 0.5);
    this.scene.fog.density = p.fogD * CITY.haze.fog;
    this.renderer.toneMappingExposure = p.exposure;
    const u = this.skyMat.uniforms;
    u.topColor.value.set(p.top);
    u.horizonColor.value.set(p.horizon);
    if (CITY.haze.tint && p.night < 0.5) u.horizonColor.value.lerp(new THREE.Color(CITY.haze.tint), 0.4);
    u.groundColor.value.set(p.fog).multiplyScalar(0.8);
    u.sunColor.value.set(p.sun);
    u.sunDir.value.copy(this.sunDir);
    u.night.value = p.night;
    u.cloudCover.value = p.clouds;
    this.night = p.night;
    this.city.setNight(p.night);
    setVehicleNight(p.night);
    this.player.headlight.intensity = p.night > 0.3 ? 420 * p.night : 0;
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = p.env;
    this.dust && (this.dust.material.color.set(p.night > 0.5 ? 0x8890a0 : 0xe8d8b8));
    if (this.post) this.post.setLook(p.night, CITY.id);
    $('tod').textContent = p.label;
  }

  bindInput() {
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
      if (this.keys.has(k)) return;
      this.keys.add(k);
      if (this.state !== 'play') return;
      if (k === 'c') this.cycleCamera();
      if (k === 't') this.cycleTime();
      if (k === 'm') this.toggleMute();
      if (k === 'r') this.recover();
      if (k === 'p' || k === 'escape') this.togglePause();
      if (k === 'y') this.toggleRadio();
    };
    const up = (e) => this.keys.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', () => this.keys.clear());

    $('start-btn').addEventListener('click', () => this.start());
    $('resume-btn').addEventListener('click', () => this.togglePause());

    // touch controls
    this.touch = { left: false, right: false, gas: false, brake: false, horn: false };
    const bindBtn = (id, key) => {
      const el = $(id);
      const on = (e) => {
        e.preventDefault();
        this.touch[key] = true;
        el.classList.add('active');
      };
      const off = (e) => {
        e.preventDefault();
        this.touch[key] = false;
        el.classList.remove('active');
      };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('pointercancel', off);
    };
    bindBtn('t-left', 'left');
    bindBtn('t-right', 'right');
    bindBtn('t-gas', 'gas');
    bindBtn('t-brake', 'brake');
    bindBtn('t-horn', 'horn');
    $('t-cam').addEventListener('click', () => this.cycleCamera());
    $('b-cam').addEventListener('click', () => this.cycleCamera());
    $('b-time').addEventListener('click', () => this.cycleTime());
    $('b-mute').addEventListener('click', () => this.toggleMute());
    $('b-pause').addEventListener('click', () => this.togglePause());
    $('b-radio').addEventListener('click', () => this.toggleRadio());
    if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
  }

  start() {
    this.state = 'play';
    $('menu').classList.remove('show');
    $('hud').classList.add('show');
    document.body.classList.add('playing');
    this.sound.start();
    this.hud.toast('Green markers = sawari waiting. Stop next to them!', 'info');
    this.hud.speech('Ustad', CITY.id === 'peshawar'
      ? 'Chalo Khan sahab, Peshawar ki sadkein bula rahi hain! Sawariyan dhoondo.'
      : 'Chalo beta, aaj ki dihari banao! Sawariyan dhoondo.');
    if (store.get('radio', true)) this.toggleRadio(true);
  }

  toggleRadio(force) {
    const on = force === undefined ? !this.sound.radio : force;
    if (on) {
      this.sound.radioOn(CITY.scale);
      this.hud.toast(`📻 ${CITY.radio}`, 'info');
    } else {
      this.sound.radioOff();
      this.hud.toast('📻 Radio off', 'info');
    }
    store.set('radio', on);
    $('b-radio').classList.toggle('off', !on);
  }

  buildMenu() {
    const cityWrap = $('city-cards');
    for (const c of Object.values(CITIES)) {
      const el = document.createElement('button');
      el.className = `city-card ${c.id}` + (c.id === CITY.id ? ' selected' : '');
      el.id = `city-${c.id}`;
      el.innerHTML = `<span class="urdu">${c.urdu}</span><b>${c.name}</b><small>${c.tagline}</small>`;
      el.addEventListener('click', () => {
        if (c.id === CITY.id) return;
        store.set('city', c.id);
        $('menu').classList.remove('show');
        $('loading').classList.remove('hidden');
        $('load-city').textContent = `${c.name} · ${c.urdu}`;
        $('load-text').textContent = 'Changing city…';
        location.hash = c.id;
        location.reload();
      });
      cityWrap.appendChild(el);
    }
    const lv = $('liveries');
    for (const [id, l] of Object.entries(LIVERIES)) {
      const el = document.createElement('button');
      el.className = 'swatch' + (id === this.liveryId ? ' selected' : '');
      el.title = l.name;
      el.id = `livery-${id}`;
      el.style.setProperty('--a', l.color);
      el.style.setProperty('--b', l.trim);
      el.addEventListener('click', () => {
        this.liveryId = id;
        store.set('livery', id);
        for (const b of lv.children) b.classList.toggle('selected', b === el);
        $('livery-name').textContent = l.name;
        this.repaint(l);
      });
      lv.appendChild(el);
    }
    $('livery-name').textContent = (LIVERIES[this.liveryId] || LIVERIES.green).name;
    for (const b of document.querySelectorAll('#quality button')) {
      b.classList.toggle('selected', b.dataset.q === this.quality);
      b.addEventListener('click', () => {
        if (b.dataset.q === this.quality) return;
        store.set('quality', b.dataset.q);
        location.reload();
      });
    }
    $('menu-money').textContent = `Rs ${this.missions.money.toLocaleString('en-PK')}`;
  }

  // swap the rickshaw's paint in the menu without rebuilding the world
  repaint(l) {
    const old = this.player.model.root;
    const pos = this.player.pos.clone();
    const yaw = this.player.yaw;
    this.scene.remove(old);
    const np = new PlayerRickshaw(this.scene, this.city, l);
    np.reset(pos.x, pos.z, yaw);
    this.player = np;
    this.missions.player = np;
    this.player.headlight.intensity = this.night > 0.3 ? 420 * this.night : 0;
  }

  cycleCamera() {
    this.camMode = (this.camMode + 1) % 3;
    this.player.model.driver.group.visible = this.camMode !== 1;
    this.hud.toast(['Chase camera', 'Driver seat', 'High camera'][this.camMode], 'info');
  }

  cycleTime() {
    this.presetIndex = (this.presetIndex + 1) % PRESETS.length;
    this.applyPreset(PRESETS[this.presetIndex]);
  }

  toggleMute() {
    this.sound.setMuted(!this.sound.muted);
    $('b-mute').textContent = this.sound.muted ? '🔇' : '🔊';
  }

  togglePause() {
    this.paused = !this.paused;
    $('pause').classList.toggle('show', this.paused);
    if (this.sound.ctx) this.paused ? this.sound.ctx.suspend() : this.sound.ctx.resume();
  }

  // put the rickshaw back on the nearest lane if it got wedged somewhere silly
  recover() {
    const p = this.player.pos;
    let best = null;
    for (let r = 0; r <= N; r++) {
      const c = roadCoord(r);
      const dx = Math.abs(p.x - c);
      const dz = Math.abs(p.z - c);
      if (!best || dx < best.d) best = { d: dx, alongZ: true, c };
      if (dz < best.d) best = { d: dz, alongZ: false, c };
    }
    const along = clamp(best.alongZ ? p.z : p.x, CITY_MIN + 12, CITY_MAX - 12);
    if (best.alongZ) this.player.reset(best.c + LANES[1], along, 0);
    else this.player.reset(along, best.c - LANES[1], Math.PI / 2);
    this.hud.toast('Rickshaw wapas sarak par', 'info');
  }

  readInput() {
    const k = this.keys;
    const t = this.touch;
    const i = this.input;
    i.throttle = k.has('w') || k.has('arrowup') || t.gas ? 1 : 0;
    i.brake = k.has('s') || k.has('arrowdown') || t.brake ? 1 : 0;
    i.steer = (k.has('a') || k.has('arrowleft') || t.left ? 1 : 0) - (k.has('d') || k.has('arrowright') || t.right ? 1 : 0);
    i.handbrake = k.has(' ');
    i.horn = k.has('h') || t.horn;
    if (this.state !== 'play') {
      i.throttle = i.brake = i.steer = 0;
      i.horn = false;
    }
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.post) this.post.setSize(window.innerWidth, window.innerHeight);
    const h = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    if (this.particles) this.particles.setScale(h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))));
  }

  draw(dt) {
    const sp = this.state === 'play' && this.camMode !== 1 ? clamp((Math.abs(this.player.speed) - 9) / 8, 0, 1) : 0;
    if (this.post) this.post.render(dt, sp);
    else this.renderer.render(this.scene, this.camera);
  }

  frame() {
    const dt = Math.max(Math.min(this.clock.getDelta(), 0.05), 1e-4);
    if (this.paused) {
      this.draw(0);
      return;
    }
    this.tick(dt);
    this.draw(dt);
  }

  tick(dt) {
    this.readInput();
    const events = [];
    const P = this.player;
    P.update(dt, this.input, events);
    this.traffic.update(dt, P, events);
    this.peds.update(dt, P, events);
    this.missions.update(dt, events);
    if (this.state !== 'play') this.missions.arrow.visible = false;
    this.updateFuel(dt);

    // sounds & camera shake from events
    const fx = this.particles;
    for (const e of events) {
      if (e.type === 'crash') {
        this.sound.thud(e.strength);
        this.shake = Math.max(this.shake, 0.35 * e.strength + 0.1);
        const f = P.forward;
        fx.dust(P.pos.x + f.x * 1.3, 0.2, P.pos.z + f.z * 1.3, e.strength);
      } else if (e.type === 'bump') {
        this.sound.clunk(e.strength);
        this.shake = Math.max(this.shake, 0.08 * e.strength);
        if (e.strength > 0.5) fx.dust(P.pos.x, 0.1, P.pos.z, e.strength * 0.5);
      } else if (e.type === 'honk') {
        const d = Math.hypot(e.x - P.pos.x, e.z - P.pos.z);
        if (e.vtype === 'truck' && Math.random() < 0.7) this.sound.musicalHorn(d);
        else this.sound.honk(d, e.big, e.angry);
      } else if (e.type === 'carHit') {
        this.sound.crunch(e.strength, 0);
        fx.burst(e.x, 0.8, e.z, e.strength);
        this.shake = Math.max(this.shake, (e.heavy ? 0.45 : 0.25) * e.strength + 0.12);
        if (navigator.vibrate) try { navigator.vibrate(e.heavy ? 120 : 60); } catch { /* not allowed */ }
      } else if (e.type === 'impact') {
        this.sound.crunch(e.strength * 0.7, Math.hypot(e.x - P.pos.x, e.z - P.pos.z));
        fx.burst(e.x, 0.6, e.z, e.strength * 0.6);
      } else if (e.type === 'scrape') {
        fx.burst(e.x, 0.6, e.z, 0.15);
      }
    }
    this.sound.horn(this.input.horn && this.state === 'play');
    this.sound.engine(P.rpm, this.input.throttle, Math.abs(P.speed));

    this.updateCamera(dt);
    this.updateWorld(dt);
    this.updateFX(dt);
    this.hud.update(P, this.traffic, this.missions);
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 5;
      store.set('save.' + CITY.id, { money: this.missions.money, rides: this.missions.rides });
    }
  }

  updateFX(dt) {
    const P = this.player;
    const fx = this.particles;
    const t = performance.now() / 1000;
    animateVehicleLights(t);
    // two-stroke exhaust: more smoke when you open the throttle
    this.exhaustAcc += dt * (4 + this.input.throttle * 10 + P.rpm * 6);
    if (!this.exPt) this.exPt = new THREE.Vector3();
    while (this.exhaustAcc > 1) {
      this.exhaustAcc -= 1;
      const f = P.forward;
      fx.exhaust(P.exhaustPoint(this.exPt), { x: -f.x, z: -f.z }, P.rpm, this.input.throttle, this.night);
    }
    // handbrake skids and footpath driving kick up dust
    const sp = Math.abs(P.speed);
    if ((this.input.handbrake && sp > 4) || (P.y > 0.1 && sp > 6 && Math.random() < dt * 8)) {
      if (Math.random() < dt * 20) fx.dust(P.pos.x, 0.1, P.pos.z, 0.3);
    }
    // black soot from old trucks and buses
    for (const v of this.traffic.list) {
      if ((v.type === 'truck' || v.type === 'bus') && !v.knocked && Math.random() < dt * 3) {
        const d = Math.hypot(v.x - P.pos.x, v.z - P.pos.z);
        if (d < 70) fx.soot(v.x - Math.sin(v.yaw) * v.len * 0.5, 0.6, v.z - Math.cos(v.yaw) * v.len * 0.5);
      }
      if (v.knocked && Math.hypot(v.knocked.vx, v.knocked.vz) > 3 && Math.random() < dt * 25) fx.dust(v.x, 0.1, v.z, 0.25);
    }
    fx.update(dt);
    this.updateBubbles(dt);
  }

  // Street vendors calling out their wares
  updateBubbles(dt) {
    const el = $('vendor-bubble');
    const P = this.player;
    if (this.bubble) {
      this.bubble.t -= dt;
      const v = new THREE.Vector3(this.bubble.x, 2.6, this.bubble.z).project(this.camera);
      const on = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && this.bubble.t > 0 && this.state === 'play';
      el.classList.toggle('show', on);
      if (on) {
        el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth}px`;
        el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight}px`;
      }
      if (this.bubble.t <= 0) this.bubble = null;
      return;
    }
    this.bubbleT -= dt;
    if (this.bubbleT > 0) return;
    this.bubbleT = rand(4, 9);
    const f = P.forward;
    const spots = [...this.city.vendorSpots, ...this.city.dhabaSeats].filter((s) => {
      const dx = s.x - P.pos.x;
      const dz = s.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      return d > 5 && d < 32 && (dx * f.x + dz * f.z) / d > 0.3;
    });
    if (!spots.length) return;
    const s = pick(spots);
    this.bubble = { x: s.x, z: s.z, t: 3 };
    el.textContent = pick(VENDOR_CALLS[CITY.id]);
  }

  updateFuel(dt) {
    const P = this.player;
    const st = this.city.station;
    const inStation = st && Math.abs(P.pos.x - st.x) < st.hw && Math.abs(P.pos.z - st.z) < st.hd;
    if (inStation && Math.abs(P.speed) < 0.5 && P.fuel < 0.995) {
      if (!this.fuelling) this.hud.toast('CNG bhari ja rahi hai… (Rs 3 per %)', 'info');
      this.fuelling = true;
      const add = Math.min(dt * 0.12, 1 - P.fuel);
      P.fuel += add;
      this.missions.money -= add * 300;
      this.missions.money = Math.round(this.missions.money);
    } else if (this.fuelling) {
      this.fuelling = false;
      this.hud.toast('Tanki full! Chalo.', 'good');
    }
    if (P.fuel <= 0 && !this.warnedEmpty) {
      this.warnedEmpty = true;
      this.hud.toast('CNG khatam! Crawl to the CNG station (blue dot on the map)', 'bad');
    } else if (P.fuel < 0.2 && !this.warnedLow) {
      this.warnedLow = true;
      this.hud.toast('CNG kam hai — refill at the CNG station', 'warn');
    }
    if (P.fuel > 0.3) this.warnedLow = this.warnedEmpty = false;
    let hint = '';
    if (inStation && P.fuel < 0.995 && Math.abs(P.speed) >= 0.5) hint = 'Stop under the canopy to refill CNG';
    else if (!this.missions.job && this.missions.waiting.some((w) => Math.hypot(w.spot.x - P.pos.x, w.spot.z - P.pos.z) < 12)) hint = 'Stop next to the passenger to pick them up';
    else if (this.missions.job && Math.hypot(this.missions.job.dest.x - P.pos.x, this.missions.job.dest.z - P.pos.z) < 14) hint = 'Stop here to drop off';
    this.hud.hint(hint);
  }

  updateCamera(dt) {
    const P = this.player;
    const cam = this.camera;
    const f = P.forward;
    const sp = Math.abs(P.speed);
    if (this.state === 'menu') {
      this.orbit += dt * 0.12;
      const r = 7.5;
      cam.position.set(P.pos.x + Math.sin(this.orbit) * r, 2.3 + Math.sin(this.orbit * 0.7) * 0.4, P.pos.z + Math.cos(this.orbit) * r);
      cam.lookAt(P.pos.x, 1.1, P.pos.z);
      cam.fov = 50;
      cam.updateProjectionMatrix();
      return;
    }
    let desired;
    let look;
    if (this.camMode === 1) {
      const head = new THREE.Vector3(0, 1.56, 0.2);
      P.model.tilt.localToWorld(head);
      cam.position.copy(head);
      const ahead = new THREE.Vector3(Math.sin(P.steer * 0.6) * 4, 1.2, 10);
      P.model.tilt.localToWorld(ahead);
      cam.lookAt(ahead);
      cam.fov = lerp(cam.fov, 72 + sp * 0.4, damp(3, dt));
      cam.updateProjectionMatrix();
      this.applyShake(dt);
      return;
    }
    const back = this.camMode === 0 ? 5.4 : 10;
    const height = this.camMode === 0 ? 2.3 : 5.5;
    const dir = P.speed < -0.5 ? f.clone().negate() : f;
    desired = new THREE.Vector3(P.pos.x - dir.x * back, P.y + height, P.pos.z - dir.z * back);
    look = new THREE.Vector3(P.pos.x + dir.x * 3, P.y + 1.2, P.pos.z + dir.z * 3);
    // keep the camera out of buildings
    const pivot = new THREE.Vector3(P.pos.x, desired.y, P.pos.z);
    for (let t = 1; t >= 0.25; t -= 0.075) {
      const q = pivot.clone().lerp(desired, t);
      if (!this.insideSolid(q.x, q.z)) {
        desired = q;
        break;
      }
    }
    if (this.camPos.lengthSq() === 0) this.camPos.copy(desired);
    this.camPos.lerp(desired, damp(5.5, dt));
    this.camLook.lerp(look, damp(9, dt));
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    cam.fov = lerp(cam.fov, 60 + sp * 0.7, damp(3, dt));
    cam.updateProjectionMatrix();
    this.applyShake(dt);
  }

  applyShake(dt) {
    if (this.shake <= 0) return;
    const s = this.shake;
    this.camera.position.x += (Math.random() - 0.5) * s * 0.4;
    this.camera.position.y += (Math.random() - 0.5) * s * 0.4;
    this.camera.rotation.z += (Math.random() - 0.5) * s * 0.05;
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }

  insideSolid(x, z) {
    const cell = this.city.nearby(x, z, 0.3);
    for (const b of cell.boxes) {
      if (x > b.minX - 0.3 && x < b.maxX + 0.3 && z > b.minZ - 0.3 && z < b.maxZ + 0.3) return true;
    }
    return false;
  }

  updateWorld(dt) {
    const P = this.player;
    // sun shadow frustum follows the rickshaw, snapped to texels to avoid shimmering
    const texel = 130 / 2048;
    const tx = Math.round(P.pos.x / texel) * texel;
    const tz = Math.round(P.pos.z / texel) * texel;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunDir.x * 150, this.sunDir.y * 150, tz + this.sunDir.z * 150);
    this.sky.position.copy(this.camera.position);
    this.skyMat.uniforms.time.value += dt;

    // dust follows the camera, wrapping around
    const cp = this.camera.position;
    this.dust.position.set(Math.floor(cp.x / 60) * 60, 0, Math.floor(cp.z / 60) * 60);
    const arr = this.dust.geometry.attributes.position.array;
    const t = performance.now() / 1000;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += Math.sin(t * 0.3 + i) * 0.004 + 0.006;
      arr[i + 1] += Math.cos(t * 0.2 + i) * 0.002;
      if (arr[i] > 60) arr[i] -= 90;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;

    for (const fl of this.flyers) {
      if (fl.kind === 'kite') {
        fl.obj.position.set(fl.cx + Math.sin(t * 0.4 + fl.ph) * 3, fl.h + Math.sin(t * 0.9 + fl.ph) * 1.5, fl.cz + Math.cos(t * 0.3 + fl.ph) * 3);
        fl.obj.rotation.set(-0.4 + Math.sin(t * 1.3 + fl.ph) * 0.2, Math.sin(t * 0.2 + fl.ph), Math.sin(t * 1.7 + fl.ph) * 0.4);
      } else {
        const a = t * fl.sp + fl.ph;
        fl.obj.position.set(P.pos.x * 0.3 + fl.cx + Math.cos(a) * fl.r, fl.h, P.pos.z * 0.3 + fl.cz + Math.sin(a) * fl.r);
        fl.obj.rotation.set(0, -a, 0.3);
        fl.obj.scale.set(1.3, 1.3 + Math.sin(t * 6 + fl.ph) * 0.4, 1.3);
      }
    }

    // street lamp lights near the player at night
    this.lampTimer -= dt;
    if (this.lampTimer <= 0) {
      this.lampTimer = 0.5;
      const on = this.night > 0.3;
      if (on) {
        const near = this.city.lamps
          .map((l) => [l, (l.x - P.pos.x) ** 2 + (l.z - P.pos.z) ** 2])
          .sort((a, b) => a[1] - b[1])
          .slice(0, this.lampLights.length);
        near.forEach(([l], k) => {
          this.lampLights[k].position.copy(l);
          this.lampLights[k].intensity = 420 * this.night;
        });
      } else for (const l of this.lampLights) l.intensity = 0;
    }
  }
}

const game = new Game();
game.init().catch((e) => {
  console.error(e);
  $('load-text').textContent = `Error: ${e.message}`;
});
window.__game = game;
