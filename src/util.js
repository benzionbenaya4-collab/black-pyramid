// util.js — helpers for building detailed procedural geometry efficiently.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** Deterministic random generator (so the world looks the same every time). */
export function rng(seed = 1) { let s = (seed >>> 0) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function hash3(x, y, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1274126177) ^ Math.imul(seed | 0, 1103515245);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
/** Smooth 3D value noise in [0,1]. */
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t);
  const u = f(x - xi), v = f(y - yi), w = f(z - zi);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
           L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

/** A lumpy rock / sand chunk: an icosphere displaced by noise. Watertight because it is displaced by position. */
export function rockGeometry(radius = 1, detail = 1, seed = 1, amp = 0.25, freq = 1.6) {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = v.clone().normalize();
    const d = noise3(n.x * freq + seed * 3.1, n.y * freq + seed * 1.7, n.z * freq) * 0.7
            + noise3(n.x * freq * 3 + 9, n.y * freq * 3, n.z * freq * 3 + seed, seed) * 0.3;
    v.multiplyScalar(1 + (d - 0.5) * 2 * amp);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function mat4(pos = [0, 0, 0], rot = [0, 0, 0], scl = 1) {
  const s = typeof scl === 'number' ? [scl, scl, scl] : scl;
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...s));
}

/**
 * Batch: collect thousands of small primitives and merge them into one mesh per material.
 * That is how the world can have huge detail with only a few draw calls.
 */
export class Batch {
  constructor() { this.groups = new Map(); this.stack = [new THREE.Matrix4()]; }
  push(m) { this.stack.push(this.stack[this.stack.length - 1].clone().multiply(m)); return this; }
  pop() { this.stack.pop(); return this; }
  /** run fn() with an extra transform applied to everything added inside it */
  at(pos, rot, scl, fn) { this.push(mat4(pos, rot, scl)); fn(); this.pop(); }
  add(geo, mat, pos, rot, scl) {
    const m = this.stack[this.stack.length - 1].clone().multiply(mat4(pos, rot, scl));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    if (mat.vertexColors) {
      if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    } else if (g.attributes.color) g.deleteAttribute('color');
    g.applyMatrix4(m);
    if (!this.groups.has(mat)) this.groups.set(mat, []);
    this.groups.get(mat).push(g);
    return this;
  }
  build({ cast = true, receive = true } = {}) {
    const group = new THREE.Group();
    for (const [mat, geos] of this.groups) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast; mesh.receiveShadow = receive;
      group.add(mesh);
    }
    this.groups.clear();
    return group;
  }
}

/** Paint vertex colours on a geometry with a function (x,y,z) → THREE.Color. */
export function paint(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), c); col.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const std = (color, roughness = 0.9, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true, ...extra });
/** Shared material palette — every surface in the game is one of these. */
export const MAT = {
  sandstone: std(0xd2a873), stone: std(0xb89268), stoneDark: std(0x8a6a48), stonePale: std(0xe2c79c),
  basalt: std(0x0d0d11, 0.35, 0.6),
  gold: new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.28, emissive: 0x5a3500, emissiveIntensity: 0.6 }),
  goldGlow: new THREE.MeshStandardMaterial({ color: 0x553300, emissive: 0xffb52e, emissiveIntensity: 3 }),
  lapis: std(0x1f3f9a, 0.4, 0.3), turquoise: std(0x2fa39a, 0.5, 0.2),
  red: std(0x9e1b1b, 0.85, 0, { side: THREE.DoubleSide }), redDark: std(0x6a1010, 0.9, 0, { side: THREE.DoubleSide }),
  leather: std(0x5a3417), wood: std(0x6b4524), woodDark: std(0x4a2f18), cloth: std(0xe8dcc0, 0.95, 0, { side: THREE.DoubleSide }),
  fur: std(0xb98a52, 1), bone: std(0xe9dfc8, 0.8), palmLeaf: std(0x3f7a2e, 0.8, 0, { side: THREE.DoubleSide }), palmTrunk: std(0x7a5a36),
  black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
  vcolor: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true, side: THREE.DoubleSide }),
  vcolorMetal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.85, emissive: 0x2a1a00 }),
};
