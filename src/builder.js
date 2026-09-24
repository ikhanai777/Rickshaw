// Geometry batcher: accumulates quads and transformed primitives per material,
// then emits one mesh per material. Keeps the draw-call count low for the city.
import * as THREE from 'three';

const WHITE = new THREE.Color(1, 1, 1);
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _nm = new THREE.Matrix3();

export const unitBox = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();

export class Builder {
  constructor() {
    this.buckets = new Map();
  }

  bucket(key) {
    let b = this.buckets.get(key);
    if (!b) {
      b = { p: [], n: [], uv: [], c: [] };
      this.buckets.set(key, b);
    }
    return b;
  }

  // Corners counter-clockwise seen from the front: bottom-left, bottom-right, top-right, top-left.
  quad(key, p0, p1, p2, p3, uv = [0, 0, 1, 1], color = WHITE) {
    const b = this.bucket(key);
    _a.subVectors(p1, p0);
    _b.subVectors(p3, p0);
    _n.crossVectors(_a, _b).normalize();
    const [u0, v0, u1, v1] = uv;
    const pts = [p0, p1, p2, p0, p2, p3];
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1];
    for (let i = 0; i < 6; i++) {
      const p = pts[i];
      b.p.push(p.x, p.y, p.z);
      b.n.push(_n.x, _n.y, _n.z);
      b.c.push(color.r, color.g, color.b);
    }
    b.uv.push(...uvs);
  }

  // Adds any BufferGeometry transformed by matrix, tinted by color.
  geom(key, geometry, matrix, color = WHITE) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const b = this.bucket(key);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const uv = g.attributes.uv;
    _nm.getNormalMatrix(matrix);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      b.p.push(_v.x, _v.y, _v.z);
      if (nor) {
        _n.fromBufferAttribute(nor, i).applyMatrix3(_nm).normalize();
        b.n.push(_n.x, _n.y, _n.z);
      } else b.n.push(0, 1, 0);
      if (uv) b.uv.push(uv.getX(i), uv.getY(i));
      else b.uv.push(0, 0);
      b.c.push(color.r, color.g, color.b);
    }
  }

  // Axis box helper; (x,y,z) is the centre, rotY optional
  box(key, x, y, z, w, h, d, color = WHITE, rotY = 0) {
    const m = new THREE.Matrix4().compose(
      _v.set(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rotY),
      new THREE.Vector3(w, h, d),
    );
    this.geom(key, unitBox, m, color);
  }

  build(materials, { castShadow = true, receiveShadow = true, shadowKeys = null } = {}) {
    const group = new THREE.Group();
    for (const [key, b] of this.buckets) {
      if (!b.p.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.c, 3));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mat = materials[key];
      if (!mat) throw new Error(`No material for bucket "${key}"`);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = key;
      mesh.castShadow = castShadow && (!shadowKeys || shadowKeys.includes(key));
      mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    return group;
  }
}

export function mat4(x, y, z, rotY = 0, sx = 1, sy = 1, sz = 1, rotX = 0, rotZ = 0) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
}

export const col = (hex) => new THREE.Color(hex);

// Routes primitives into per-chunk builders so merged meshes can be frustum-culled.
export class ChunkedBuilder {
  constructor(size = 110) {
    this.size = size;
    this.chunks = new Map();
  }

  get(x, z) {
    const k = `${Math.floor(x / this.size)},${Math.floor(z / this.size)}`;
    let b = this.chunks.get(k);
    if (!b) this.chunks.set(k, (b = new Builder()));
    return b;
  }

  quad(key, p0, p1, p2, p3, uv, color) {
    this.get((p0.x + p2.x) / 2, (p0.z + p2.z) / 2).quad(key, p0, p1, p2, p3, uv, color);
  }

  geom(key, geometry, matrix, color) {
    this.get(matrix.elements[12], matrix.elements[14]).geom(key, geometry, matrix, color);
  }

  box(key, x, y, z, w, h, d, color, rotY) {
    this.get(x, z).box(key, x, y, z, w, h, d, color, rotY);
  }

  build(materials, opts) {
    const group = new THREE.Group();
    for (const b of this.chunks.values()) group.add(b.build(materials, opts));
    return group;
  }
}
