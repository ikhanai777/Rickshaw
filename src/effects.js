// Particles (2-stroke exhaust, truck soot, dust, sparks) and the post-processing chain
// (bloom, colour grade, vignette, film grain, speed blur).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// ------------------------------------------------------------------ particles

const pVert = /* glsl */ `
  attribute float alpha;
  attribute float size;
  attribute vec3 color;
  uniform float scale;
  varying float vAlpha;
  varying vec3 vColor;
  #include <fog_pars_vertex>
  void main() {
    vAlpha = alpha;
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(size * scale / max(-mvPosition.z, 0.1), 300.0);
    // fade out particles right in front of the lens so smoke never fogs the screen
    vAlpha *= smoothstep(1.2, 4.5, -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const pFrag = /* glsl */ `
  uniform float soft;
  varying float vAlpha;
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float a = soft > 0.5 ? (1.0 - r * r) * (1.0 - r * 0.5) : pow(1.0 - r, 2.0);
    gl_FragColor = vec4(vColor, a * vAlpha);
    #include <fog_fragment>
  }`;

class PointPool {
  constructor(scene, n, additive) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: pVert,
      fragmentShader: pFrag,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { scale: { value: 400 }, soft: { value: additive ? 0 : 1 } }]),
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, life, size, grow, r, g, b, alpha, grav = 0) {
    const i = this.next;
    this.next = (i + 1) % this.n;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.col.set([r, g, b], i * 3);
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.grow[i] = grow;
    this.a0[i] = alpha;
    this.alpha[i] = alpha;
    this.grav[i] = grav;
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      const drag = Math.exp(-1.5 * dt);
      this.vel[k] *= drag;
      this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      if (this.pos[k + 1] < 0.02 && this.grav[i] > 0) {
        this.pos[k + 1] = 0.02;
        this.vel[k + 1] *= -0.3;
      }
      this.size[i] += this.grow[i] * dt;
      const t = this.life[i] / this.max[i];
      this.alpha[i] = this.a0[i] * Math.min(1, t * 1.5) * Math.min(1, (1 - t) * 8 + 0.2);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.alpha.needsUpdate = a.size.needsUpdate = true;
  }
}

export class Particles {
  constructor(scene, quality) {
    const mul = quality === 'low' ? 0.5 : 1;
    this.smoke = new PointPool(scene, Math.round(700 * mul), false);
    this.sparks = new PointPool(scene, Math.round(360 * mul), true);
    this.acc = 0;
  }

  setScale(h) {
    this.smoke.mat.uniforms.scale.value = h * 0.9;
    this.sparks.mat.uniforms.scale.value = h * 0.9;
  }

  exhaust(p, dir, rpm, throttle, night) {
    // blue-grey two-stroke smoke
    const c = night > 0.5 ? 0.35 : 0.72;
    this.smoke.emit(p.x, p.y, p.z, dir.x * 0.8 + (Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.2, dir.z * 0.8 + (Math.random() - 0.5) * 0.3,
      1.0 + throttle * 0.6, 0.12, 0.45 + rpm * 0.4, c * 0.85, c * 0.9, c, 0.07 + throttle * 0.08);
  }

  soot(x, y, z) {
    this.smoke.emit(x, y, z, (Math.random() - 0.5) * 0.4, 1.2 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4, 2.2, 0.4, 1.4, 0.12, 0.11, 0.1, 0.35);
  }

  dust(x, y, z, strength = 1) {
    const n = Math.round(4 + strength * 10);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.5 + Math.random()) * strength * 2;
      this.smoke.emit(x, y + 0.2, z, Math.cos(a) * s, 0.4 + Math.random() * strength, Math.sin(a) * s, 1.2 + Math.random(), 0.4, 1.1, 0.62, 0.55, 0.44, 0.2 * Math.min(1, strength + 0.3));
    }
  }

  burst(x, y, z, strength = 1) {
    const n = Math.round(10 + strength * 36);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (1.5 + Math.random() * 5) * (0.5 + strength);
      const hot = Math.random();
      this.sparks.emit(x, y, z, Math.cos(a) * s, 1 + Math.random() * 4 * (0.5 + strength), Math.sin(a) * s,
        0.35 + Math.random() * 0.5, 0.05 + Math.random() * 0.05, -0.05, 1, 0.55 + hot * 0.4, 0.15 + hot * 0.3, 1, 9.8);
    }
    // glass & plastic bits
    for (let i = 0; i < n * 0.4; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 3;
      this.sparks.emit(x, y, z, Math.cos(a) * s, 1.5 + Math.random() * 2, Math.sin(a) * s, 0.6 + Math.random() * 0.4, 0.035, 0, 0.6, 0.8, 1, 0.8, 9.8);
    }
    this.dust(x, 0.3, z, strength * 0.7);
  }

  update(dt) {
    this.smoke.update(dt);
    this.sparks.update(dt);
  }
}

// ------------------------------------------------------------------ post chain

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.9 },
    grain: { value: 0.035 },
    saturation: { value: 1.12 },
    contrast: { value: 1.06 },
    gain: { value: new THREE.Vector3(1.03, 1.0, 0.95) },
    lift: { value: new THREE.Vector3(0.02, 0.012, 0.0) },
    speed: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, grain, saturation, contrast, speed;
    uniform vec3 gain, lift;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // radial speed blur towards the edges
      if (speed > 0.01) {
        float e = smoothstep(0.15, 0.7, length(d)) * speed;
        vec3 acc = c;
        for (int i = 1; i <= 4; i++) acc += texture2D(tDiffuse, vUv - d * e * 0.025 * float(i)).rgb;
        c = acc / 5.0;
      }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, saturation);
      c = (c - 0.5) * contrast + 0.5;
      c = c * gain + lift * (1.0 - c);
      c *= 1.0 - dot(d, d) * vignette;
      float n = fract(sin(dot(vUv * vec2(12.9898, 78.233) + time, vec2(1.0, 1.0))) * 43758.5453);
      c += (n - 0.5) * grain;
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export class PostFX {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality === 'high' ? 4 : 0,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.55, 0.88);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
  }

  setLook(night, city) {
    this.bloom.strength = 0.22 + night * 0.4;
    this.bloom.threshold = night > 0.5 ? 0.92 : 0.95;
    this.bloom.radius = night > 0.5 ? 0.45 : 0.55;
    const u = this.grade.uniforms;
    if (city === 'peshawar') {
      u.gain.value.set(1.05, 0.99, 0.9);
      u.lift.value.set(0.035, 0.02, 0.0);
      u.saturation.value = 1.05;
    } else {
      u.gain.value.set(1.03, 1.0, 0.95);
      u.lift.value.set(0.02, 0.012, 0.0);
      u.saturation.value = 1.14;
    }
    if (night > 0.5) {
      u.gain.value.set(1.0, 1.0, 1.06);
      u.lift.value.set(0.0, 0.005, 0.02);
    }
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }

  render(dt, speed) {
    this.grade.uniforms.time.value = (this.grade.uniforms.time.value + dt) % 100;
    this.grade.uniforms.speed.value = speed;
    this.composer.render(dt);
  }
}
