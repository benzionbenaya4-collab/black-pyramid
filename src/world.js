// world.js — the whole world, built only from code: primitives, merged geometry and procedural shaders.
import * as THREE from 'three';
import { Batch, MAT, rockGeometry, rng, smooth, paint } from './util.js';
import { makeGlyphMaterial, glyphUniforms } from './glyphs.js';
import { ARENA } from './combat.js';

// ================================================================ layout
export const PYR = { HALF: 115, HEIGHT: 140, PLAZA: 200 };
PYR.GATE = new THREE.Vector3(0, 0, PYR.HALF + 30);
export const WORLD_RADIUS = 1150;
export const SHARD_SITES = [
  { x: 560, z: 160, color: 0xff9d2e, name: 'רסיס השחר' },
  { x: -430, z: 480, color: 0xffd34a, name: 'רסיס הצהריים' },
  { x: -580, z: -330, color: 0xff5a3c, name: 'רסיס השקיעה' },
  { x: 250, z: -620, color: 0x8fd3ff, name: 'רסיס הלילה' },
];
export const CAMP = { x: 720, z: 560 };
const POND = { x: 752, z: 600, r: 26 };
export const SATELLITES = [{ x: 380, z: -330, half: 36, h: 44 }, { x: 480, z: -220, half: 27, h: 33 }, { x: 560, z: -110, half: 20, h: 25 }];

/** colliders: axis-aligned boxes and circles the player cannot walk through */
export const colliders = [];
const boxC = (cx, cz, hx, hz) => colliders.push({ type: 'box', minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz });
const circC = (x, z, r) => colliders.push({ type: 'circle', x, z, r });

// ================================================================ terrain
function duneRaw(x, z) {
  return Math.sin(x * 0.008) * 9 + Math.cos(z * 0.007) * 8 + Math.sin((x + z) * 0.017) * 4
       + Math.sin(x * 0.034 - z * 0.021) * 1.8 + Math.sin(z * 0.0028 + 1.3) * 14 + 22
       + Math.pow(Math.abs(Math.sin(x * 0.004 + z * 0.006)), 6) * 14;
}
const PADS = [
  ...SHARD_SITES.map((s) => ({ x: s.x, z: s.z, r0: 26, r1: 70, off: 0 })),
  ...SATELLITES.map((s) => ({ x: s.x, z: s.z, r0: s.half * 1.25, r1: s.half * 1.25 + 60, off: 0 })),
  { x: CAMP.x, z: CAMP.z, r0: 70, r1: 150, off: -8 },
  { x: ARENA.x, z: ARENA.z, r0: ARENA.r + 25, r1: ARENA.r + 100, off: 0 },   // the Plain of Ash (boss arena)
];
PADS.forEach((p) => { p.h = duneRaw(p.x, p.z) + p.off; });

export function duneHeight(x, z) {
  let h = duneRaw(x, z);
  for (const p of PADS) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r1) h = p.h + (h - p.h) * smooth(p.r0, p.r1, d);
  }
  let f = smooth(270, 390, Math.hypot(x, z));
  if (z > 0 && z < 520) f = Math.min(f, Math.max(smooth(22, 70, Math.abs(x)), smooth(480, 520, z)));
  return h * f;
}
export function groundAt(x, z) {
  if (Math.abs(x) < PYR.PLAZA && Math.abs(z) < PYR.PLAZA) return 0.5;
  if (Math.abs(x) < 14 && z >= PYR.PLAZA && z < 480) return 0.45;
  return duneHeight(x, z);
}

// ================================================================ shared shader bits
const WPOS_VERT = (sh) => {
  sh.vertexShader = 'varying vec3 vWPos;\n' + sh.vertexShader.replace('#include <worldpos_vertex>',
    '#include <worldpos_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
};
const HASH = 'float gh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }\n';
export const envUniforms = { uSun: { value: 1 } };

function createGround(seg = 360) {
  const size = 5200;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cDark = new THREE.Color(0xae6f3c), cMid = new THREE.Color(0xd9a15e), cLight = new THREE.Color(0xf4d194);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = duneHeight(x, z);
    pos.setY(i, h);
    const t = smooth(-4, 45, h);
    c.copy(cDark).lerp(cMid, Math.min(1, t * 1.6)).lerp(cLight, Math.max(0, t - 0.55) * 2.0);
    const ripple = Math.sin(x * 0.12 + Math.sin(z * 0.03) * 4) * 0.5 + 0.5;
    c.offsetHSL(0, 0, (ripple - 0.5) * 0.05);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, flatShading: true });
  mat.customProgramCacheKey = () => 'ground';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = glyphUniforms.uTime; sh.uniforms.uSun = envUniforms.uSun;
    WPOS_VERT(sh);
    sh.fragmentShader = 'uniform float uTime; uniform float uSun; varying vec3 vWPos;\n' + HASH + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float gFade = 1.0 - smoothstep(40.0, 280.0, length(vViewPosition));
        float rip = sin(vWPos.x * 0.9 + sin(vWPos.z * 0.11) * 3.0 + vWPos.z * 0.25);
        float rip2 = sin(vWPos.z * 2.1 + sin(vWPos.x * 0.4) * 2.0);
        float grain = gh(floor(vWPos.xz * 4.0));
        diffuseColor.rgb *= 1.0 + (rip * 0.07 + rip2 * 0.025 + (grain - 0.5) * 0.09) * gFade;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec2 sc = floor(vWPos.xz * 7.0);
        float spk = step(0.9985, gh(sc + 7.0)) * (0.5 + 0.5 * sin(uTime * 3.0 + gh(sc) * 40.0));
        totalEmissiveRadiance += vec3(1.0, 0.85, 0.6) * spk * uSun * gFade * gFade * 1.3;`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function createPaving() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xb08a5c, roughness: 0.85, flatShading: true });
  mat.customProgramCacheKey = () => 'paving';
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = glyphUniforms.uTime; sh.uniforms.uGlow = glyphUniforms.uGlow;
    WPOS_VERT(sh);
    sh.fragmentShader = 'uniform float uTime; uniform float uGlow; varying vec3 vWPos;\n' + HASH + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float pIn = 0.0;
        {
          float rowI = floor(vWPos.z / 7.0);
          vec2 t2 = vec2(vWPos.x / 7.0 + mod(rowI, 2.0) * 0.5, vWPos.z / 7.0);
          vec2 ti = floor(t2), tf = fract(t2);
          float m = min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y)) * 7.0;
          float mortar = 1.0 - smoothstep(0.08, 0.2, m);
          float v = gh(ti);
          float crack = step(0.93, v) * (1.0 - smoothstep(0.02, 0.06, abs(tf.x - tf.y * 0.7 - 0.15)));
          diffuseColor.rgb *= (0.82 + v * 0.3) * (1.0 - mortar * 0.5) * (1.0 - crack * 0.4);
          float cheb = max(abs(vWPos.x), abs(vWPos.z));
          pIn = max(pIn, 1.0 - smoothstep(0.25, 0.55, abs(cheb - 132.0)));
          pIn = max(pIn, 1.0 - smoothstep(0.25, 0.55, abs(cheb - 162.0)));
          pIn = max(pIn, 1.0 - smoothstep(0.25, 0.55, abs(cheb - 196.0)));
          pIn = max(pIn, (1.0 - smoothstep(0.25, 0.55, abs(abs(vWPos.x) - abs(vWPos.z)) * 0.7071)) * step(132.0, cheb) * step(cheb, 196.0));
          float av = step(200.0, vWPos.z) * step(abs(vWPos.x), 14.0);
          pIn = max(pIn, av * (1.0 - smoothstep(0.2, 0.45, abs(vWPos.x))));
          pIn = max(pIn, av * (1.0 - smoothstep(0.2, 0.45, abs(mod(vWPos.z, 32.0) - 16.0))) * step(abs(vWPos.x), 10.0));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.65, 0.25), pIn);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance = vec3(1.0, 0.68, 0.2) * pIn * uGlow * 0.6 * (0.8 + 0.4 * sin(uTime * 2.0 - length(vWPos.xz) * 0.05));`);
  };
  const g = new THREE.Group();
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(PYR.PLAZA * 2, 1, PYR.PLAZA * 2), mat);
  plaza.receiveShadow = true;
  const avenue = new THREE.Mesh(new THREE.BoxGeometry(28, 1, 290), mat);
  avenue.position.set(0, -0.05, 200 + 145); avenue.receiveShadow = true;
  g.add(plaza, avenue);
  return g;
}

// ================================================================ sky
function createSky() {
  const group = new THREE.Group();
  const uniforms = { top: { value: new THREE.Color(0x4a8fd8) }, bottom: { value: new THREE.Color(0xf3d3a0) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(0xffe0a0) } };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2800, 48, 24), new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y * 1.6 + 0.08, 0.0, 1.0);
        vec3 c = mix(bottom, top, pow(h, 0.75));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        c += sunCol * (pow(s, 12.0) * 0.35 + pow(s, 400.0) * 1.2);
        gl_FragColor = vec4(c, 1.0);
      }`,
  }));
  dome.renderOrder = -10;
  group.add(dome);

  const N = 2400, sp = new Float32Array(N * 3), r = rng(11);
  for (let i = 0; i < N; i++) {
    const u = r() * Math.PI * 2, v = r() * 0.97, R = 2600;
    sp.set([Math.cos(u) * Math.sqrt(1 - v * v) * R, v * R, Math.sin(u) * Math.sqrt(1 - v * v) * R], i * 3);
  }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.0, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  group.add(new THREE.Points(starGeo, starMat));

  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 12), new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false }));
  const moon = new Batch();
  const moonMat = new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false });
  const craterMat = new THREE.MeshBasicMaterial({ color: 0xaab4cc, fog: false });
  moon.add(new THREE.SphereGeometry(48, 24, 12), moonMat);
  [[12, 15, 9], [-18, -6, 7], [5, -20, 6], [-8, 22, 4], [22, -10, 5]].forEach(([x, y, s]) => moon.add(new THREE.SphereGeometry(s, 10, 6), craterMat, [x, y, 40]));
  const moonMesh = moon.build({ cast: false, receive: false });
  group.add(sunMesh, moonMesh);

  const clouds = new Batch();
  const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, fog: false, emissive: 0x332a22 });
  const cr = rng(5);
  for (let i = 0; i < 34; i++) {
    const a = cr() * Math.PI * 2, d = 400 + cr() * 1800;
    clouds.at([Math.cos(a) * d, 520 + cr() * 260, Math.sin(a) * d], [0, cr() * 3, 0], 1, () => {
      const n = 5 + Math.floor(cr() * 7);
      for (let k = 0; k < n; k++) {
        const s = 25 + cr() * 35;
        clouds.add(rockGeometry(1, 1, i * 10 + k, 0.2), cloudMat, [(k - n / 2) * 28 + cr() * 20, cr() * 14, cr() * 50 - 25], [0, cr() * 3, 0], [s * 1.3, s * 0.5, s]);
      }
    });
  }
  const cloudMesh = clouds.build({ cast: false, receive: false });
  return { group, uniforms, starMat, sunMesh, moonMesh, cloudMesh, cloudMat };
}

// ================================================================ pieces used many times
const unitFrustum = new THREE.CylinderGeometry(0.8, 1, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0); // square, half-size ≈ 0.707
const cyl = (rt, rb, h, s = 12) => new THREE.CylinderGeometry(rt, rb, h, s);
const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, w = 12, h = 8, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
const std2 = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true });

function lathe(points, segs = 16) { return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segs); }
const AMPHORA = lathe([[0, 0], [0.5, 0.05], [0.9, 0.5], [1.0, 1.1], [0.8, 1.7], [0.35, 2.0], [0.3, 2.4], [0.45, 2.5], [0.4, 2.55]]);
const BOWL = lathe([[0.2, 0], [0.9, 0.2], [1.4, 0.6], [1.7, 1.1], [1.75, 1.2]], 18);
const PAPYRUS_CAP = lathe([[0.9, 0], [1.1, 0.3], [1.6, 0.9], [2.0, 1.6], [2.1, 1.8], [1.0, 1.85]], 16);

/** Papyrus column with lotus capital, fluting and gold bands. */
function column(b, h, r = 1.4, mat = MAT.sandstone) {
  b.add(cyl(r * 1.25, r * 1.35, 1, 12), MAT.stoneDark, [0, 0.5, 0]);
  b.add(cyl(r * 0.92, r, h, 16), mat, [0, 1 + h / 2, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.add(boxG(0.25, h * 0.9, 0.25), mat, [Math.cos(a) * r * 0.97, 1 + h / 2, Math.sin(a) * r * 0.97]);
  }
  for (const y of [0.18, 0.75, 0.82]) b.add(new THREE.TorusGeometry(r * 0.98, 0.13, 6, 20), MAT.gold, [0, 1 + h * y, 0], [Math.PI / 2, 0, 0]);
  b.add(PAPYRUS_CAP, mat, [0, 1 + h, 0], [0, 0, 0], [r / 1.4, 1, r / 1.4]);
  b.add(boxG(r * 3.2, 0.8, r * 3.2), MAT.stoneDark, [0, 1 + h + 2.2, 0]);
}

/** Winged sun disk (gold, lapis and red feathers). */
function wingedSun(b, scale = 1) {
  b.at([0, 0, 0], [0, 0, 0], scale, () => {
    b.add(cyl(1.6, 1.6, 0.6, 24), MAT.gold, [0, 0, 0.3], [Math.PI / 2, 0, 0]);
    b.add(cyl(0.7, 0.7, 0.3, 16), MAT.goldGlow, [0, 0, 0.7], [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) {
      for (let row = 0; row < 3; row++) for (let k = 0; k < 7; k++) {
        const len = 1.2 + k * 0.55 - row * 0.2;
        b.add(boxG(0.45, len, 0.18), [MAT.gold, MAT.lapis, MAT.red][row], [s * (2.0 + k * 0.62), 0.2 - row * 0.55 - k * 0.07, 0.25], [0, 0, s * (1.2 + k * 0.05)]);
      }
      b.add(cyl(0.2, 0.25, 1.6, 8), MAT.gold, [s * 1.8, -0.9, 0.4]);
      b.add(sph(0.35, 8, 6), MAT.gold, [s * 1.8, -0.05, 0.5], [0, 0, 0], [1, 1.3, 0.5]);
    }
  });
}

function sphinx(b) {
  const S = MAT.sandstone;
  b.add(boxG(9, 2, 18), MAT.stoneDark, [0, 1, 0]);
  b.add(boxG(6.5, 4.4, 11), S, [0, 4.2, -1.5]);
  b.add(rockGeometry(1, 1, 3, 0.08), S, [0, 4.6, -6], [0, 0, 0], [3.6, 2.8, 3.2]);
  b.add(rockGeometry(1, 1, 4, 0.08), S, [0, 5.5, 2.5], [0, 0, 0], [3.4, 3.2, 3]);
  for (const s of [-1, 1]) {
    b.add(boxG(1.8, 1.6, 7), S, [s * 2.1, 2.8, 6]);
    for (let k = 0; k < 4; k++) b.add(boxG(0.38, 0.5, 0.8), S, [s * 2.1 - 0.6 + k * 0.4, 2.3, 9.6]);
    b.add(boxG(2, 2.6, 4.2), S, [s * 3.3, 3.3, -6.5]);
  }
  b.add(new THREE.TorusGeometry(2.2, 0.35, 6, 14, Math.PI), S, [3.4, 2.4, -8], [0, Math.PI / 2, 0]);
  b.at([0, 9.2, 4.4], [0, 0, 0], 1, () => {
    b.add(boxG(3.2, 3.4, 3), S, [0, 0, 0]);
    b.add(boxG(0.7, 1.1, 0.8), S, [0, -0.2, 1.7]);
    b.add(boxG(1.6, 0.25, 0.3), MAT.stoneDark, [0, -1.0, 1.55]);
    for (const s of [-1, 1]) b.add(boxG(0.7, 0.3, 0.2), MAT.goldGlow, [s * 0.75, 0.5, 1.55]);
    b.add(boxG(3.8, 1.4, 3.6), MAT.gold, [0, 2.1, -0.2]);
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
      b.add(boxG(1.0, 0.55, 1.4), k % 2 ? MAT.lapis : MAT.gold, [s * 2.0, 1.2 - k * 0.55, 0.2 + k * 0.05], [0, 0, s * -0.08]);
    }
    b.add(cyl(0.35, 0.25, 2.2, 8), MAT.gold, [0, -2.6, 1.0]);
    b.add(cyl(0.12, 0.25, 1.1, 6), MAT.gold, [0, 2.9, 1.5]);
  });
}

function colossus(b) {
  const S = MAT.stonePale;
  b.add(boxG(16, 16, 16), MAT.stoneDark, [0, 8, -3]);
  b.add(boxG(16.4, 1.2, 16.4), MAT.gold, [0, 16.4, -3]);
  for (const s of [-1, 1]) b.add(boxG(0.4, 11, 12), MAT.lapis, [s * 8.1, 8, -3]);
  for (const s of [-1, 1]) {
    b.add(boxG(3.6, 16, 4), S, [s * 3, 8, 7]);
    b.add(boxG(4.2, 2, 6), S, [s * 3, 1, 9]);
    for (let k = 0; k < 5; k++) b.add(boxG(0.7, 0.8, 1), S, [s * 3 - 1.4 + k * 0.7, 0.4, 12.4]);
    b.add(boxG(4, 4, 12), S, [s * 3, 17.5, 2]);
    b.add(boxG(2.6, 2.6, 10), S, [s * 4.6, 21, 3]);
    b.add(boxG(3, 2.6, 3.4), S, [s * 4.6, 20.6, 8.5]);
    b.add(cyl(1.5, 1.5, 1.2, 12), MAT.gold, [s * 4.6, 21, -1.5], [Math.PI / 2, 0, 0]);
  }
  b.add(unitFrustum, S, [0, 19, -1], [0, 0, 0], [8.5, 16, 5]);
  b.add(boxG(9, 5, 0.6), MAT.gold, [0, 23, 2.6]);
  b.add(new THREE.TorusGeometry(5.6, 0.9, 6, 20, Math.PI), MAT.gold, [0, 33.5, 0], [Math.PI / 2 + 0.3, 0, Math.PI]);
  b.add(new THREE.TorusGeometry(4.6, 0.7, 6, 20, Math.PI), MAT.lapis, [0, 34.2, 0], [Math.PI / 2 + 0.3, 0, Math.PI]);
  b.at([0, 38, 0], [0, 0, 0], 1, () => {
    b.add(boxG(6, 7, 6), S, [0, 0, 0]);
    b.add(boxG(1.2, 2, 1.4), S, [0, -0.3, 3.4]);
    for (const s of [-1, 1]) b.add(boxG(1.3, 0.5, 0.3), MAT.goldGlow, [s * 1.4, 1, 3.05]);
    b.add(cyl(0.8, 0.5, 4, 8), MAT.gold, [0, -5, 2.4]);
    for (const s of [-1, 1]) for (let k = 0; k < 7; k++) b.add(boxG(1.6, 1, 2.6), k % 2 ? MAT.lapis : MAT.gold, [s * 3.6, 2.8 - k * 1.0, 0.6]);
    b.add(cyl(3.4, 3.6, 3, 14), MAT.red, [0, 4.8, -0.4]);
    b.add(cyl(0.6, 2.6, 7, 14), MAT.stonePale, [0, 9.5, -0.4]);
    b.add(sph(1, 10, 8), MAT.stonePale, [0, 13.2, -0.4]);
    b.add(cyl(0.3, 0.6, 2.2, 8), MAT.gold, [0, 5, 3.3]);
  });
}

function brazier(b) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    b.add(cyl(0.18, 0.22, 7, 6), MAT.gold, [Math.cos(a) * 1.4, 3.4, Math.sin(a) * 1.4], [Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22]);
    b.add(sph(0.35, 8, 6), MAT.gold, [Math.cos(a) * 2.1, 0.3, Math.sin(a) * 2.1]);
  }
  b.add(BOWL, MAT.basalt, [0, 6.6, 0]);
  b.add(new THREE.TorusGeometry(1.75, 0.16, 6, 24), MAT.gold, [0, 7.8, 0], [Math.PI / 2, 0, 0]);
  for (let k = 0; k < 7; k++) b.add(rockGeometry(0.45, 0, k, 0.3), MAT.goldGlow, [Math.cos(k) * 0.8, 7.6, Math.sin(k) * 0.8]);
}

// ================================================================ the pyramid complex
function createPyramidComplex(dyn) {
  const { HALF, HEIGHT } = PYR;
  const group = new THREE.Group();
  const b = new Batch();

  const pyrMat = makeGlyphMaterial({ H: HEIGHT, half: HALF, cellW: 8, cellH: 6.8, gMin: 10, gMax: HEIGHT * 0.7, goldTop: HEIGHT * 0.8, edge: 1.2 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(HALF * Math.SQRT2, HEIGHT, 4, 1).translate(0, HEIGHT / 2, 0), pyrMat);
  body.rotation.y = Math.PI / 4; body.position.y = 4.1;
  body.castShadow = true; body.receiveShadow = true;
  group.add(body);
  boxC(0, 0, HALF + 13, HALF + 13);

  for (let i = 0; i < 3; i++) {                                                   // stepped plinth
    const w = (HALF + 12 - i * 4) * 2, y = 0.5 + i * 1.2;
    b.add(boxG(w, 1.2, w), MAT.basalt, [0, y + 0.6, 0]);
    for (let k = 0; k < 4; k++) b.at([0, 0, 0], [0, (k * Math.PI) / 2, 0], 1, () => b.add(boxG(w, 0.18, 0.3), MAT.goldGlow, [0, y + 1.22, w / 2]));
  }

  // floating capstone with orbiting rings
  const capB = new Batch();
  capB.add(new THREE.ConeGeometry(7, 9, 4).rotateY(Math.PI / 4), MAT.gold, [0, 4.5, 0]);
  capB.add(new THREE.ConeGeometry(7, 5, 4).rotateY(Math.PI / 4), MAT.goldGlow, [0, -2.5, 0], [Math.PI, 0, 0]);
  capB.add(sph(1.2, 12, 8), MAT.goldGlow, [0, 4.5, 5.2]);
  const cap = capB.build({ cast: false });
  cap.position.y = HEIGHT + 14;
  group.add(cap);
  const rings = [];
  for (let i = 0; i < 3; i++) {
    const rb = new Batch(), R = 11 + i * 3.5, n = 6 + i * 2;
    rb.add(new THREE.TorusGeometry(R, 0.35, 8, 64), MAT.goldGlow);
    for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; rb.add(new THREE.OctahedronGeometry(0.9, 0), MAT.gold, [Math.cos(a) * R, Math.sin(a) * R, 0]); }
    const ring = rb.build({ cast: false });
    ring.position.y = HEIGHT + 14; ring.rotation.set(Math.PI / 2 + i * 0.5, i * 0.8, 0);
    group.add(ring); rings.push(ring);
  }
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffc050, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2, 6, 1600, 24, 1, true), beamMat);
  beam.position.y = HEIGHT + 800; group.add(beam);

  // ---- entrance portal on the +Z face
  const pz = HALF + 3;
  b.add(boxG(32, 36, 34), MAT.basalt, [0, 18.5, pz]);
  b.add(boxG(35, 3, 36), MAT.basalt, [0, 37.5, pz]);
  b.add(boxG(35.2, 0.5, 36.2), MAT.goldGlow, [0, 36.2, pz]);
  b.add(boxG(14, 24, 0.5), MAT.black, [0, 12.5, HALF + 20.05]);
  for (let f = 0; f < 3; f++) {
    const w = 15 + f * 2.2, h = 25 + f * 1.6, z = HALF + 20.2 + f * 0.05;
    b.add(boxG(0.7, h, 0.5), MAT.gold, [-w / 2, 0.5 + h / 2, z]);
    b.add(boxG(0.7, h, 0.5), MAT.gold, [w / 2, 0.5 + h / 2, z]);
    b.add(boxG(w + 0.7, 0.7, 0.5), MAT.gold, [0, 0.5 + h, z]);
  }
  b.at([0, 31.5, HALF + 20.4], [0, 0, 0], 1.3, () => wingedSun(b));
  for (const s of [-1, 1]) for (let k = 0; k < 5; k++) {
    const y = 6 + k * 5.4, x = s * 14;
    b.add(new THREE.TorusGeometry(1, 0.14, 6, 20), MAT.goldGlow, [x, y, HALF + 20.2], [0, 0, 0], [1.1, 2.1, 1]);
    for (let j = 0; j < 3; j++) b.add(boxG(1.1 - j * 0.2, 0.25, 0.2), MAT.gold, [x, y - 1 + j * 1, HALF + 20.25]);
  }
  for (const s of [-1, 1]) b.at([s * 10.8, 0.5, HALF + 24], [0, 0, 0], 1, () => column(b, 20, 1.2));
  for (let i = 0; i < 4; i++) b.add(boxG(26 - i * 1.5, 0.35, 2), MAT.stoneDark, [0, 0.68 + i * 0.35, HALF + 28 - i * 2]);
  boxC(0, HALF + 3, 17, 18);
  const doorGlowMat = new THREE.MeshBasicMaterial({ color: 0xff8a1a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(13.6, 23.6), doorGlowMat);
  doorGlow.position.set(0, 12.5, HALF + 20.4); group.add(doorGlow);

  // ---- colossal seated statues flanking the gate
  for (const s of [-1, 1]) { b.at([s * 36, 0.5, HALF + 26], [0, 0, 0], 1, () => colossus(b)); boxC(s * 36, HALF + 26, 9, 10); }

  // ---- pylon gateway with banners
  const PZ = 186;
  for (const s of [-1, 1]) {
    b.add(unitFrustum, MAT.sandstone, [s * 32, 0.5, PZ], [0, 0, 0], [40 / 1.414, 48, 16 / 1.414]);
    b.add(boxG(34, 2.4, 14), MAT.stoneDark, [s * 32, 49.4, PZ]);
    b.add(boxG(34.4, 0.5, 14.4), MAT.goldGlow, [s * 32, 48.2, PZ]);
    for (let k = 0; k < 4; k++) b.add(boxG(36 - k * 1.2, 0.6, 0.3), [MAT.gold, MAT.lapis, MAT.red, MAT.gold][k], [s * 32, 6 + k * 1.1, PZ + 8.1 - 0.1 * k]);
    for (let k = 0; k < 3; k++) {
      const x = s * 32 + (k - 1) * 10;
      b.add(boxG(7, 18, 0.3), MAT.stoneDark, [x, 25, PZ + 6.6]);
      b.add(new THREE.TorusGeometry(1.6, 0.18, 6, 20), MAT.goldGlow, [x, 30, PZ + 6.85], [0, 0, 0], [1, 2.6, 1]);
      b.add(boxG(3, 0.3, 0.2), MAT.gold, [x, 21, PZ + 6.85]);
      b.add(sph(1.1, 12, 8), MAT.gold, [x, 17.5, PZ + 6.8], [0, 0, 0], [1, 1, 0.3]);
    }
    for (const fx of [-6, 6]) {
      b.add(cyl(0.35, 0.45, 62, 8), MAT.wood, [s * 32 + fx, 31.5, PZ + 9.5]);
      b.add(new THREE.ConeGeometry(0.7, 2.2, 8), MAT.gold, [s * 32 + fx, 63.6, PZ + 9.5]);
      dyn.flagPoints.push(new THREE.Vector3(s * 32 + fx, 61, PZ + 9.5));
    }
    boxC(s * 32, PZ, 21, 9);
  }
  b.add(boxG(26, 6, 12), MAT.sandstone, [0, 42, PZ]);
  b.add(boxG(26.4, 0.4, 12.4), MAT.goldGlow, [0, 45.2, PZ]);
  b.at([0, 42, PZ + 6.3], [0, 0, 0], 1.1, () => wingedSun(b));

  // ---- obelisks covered in shader hieroglyphs
  const obH = 64;
  const obMat = makeGlyphMaterial({ H: obH, half: 2.83, top: 1.8, cellW: 2.3, cellH: 2.4, gMin: 4, gMax: obH * 0.93, goldTop: obH + 10, edge: 0.25, course: 2, block: 3 });
  const obGeo = new THREE.CylinderGeometry(2.55, 4, obH, 4, 1).translate(0, obH / 2, 0);
  for (const [x, z] of [[-70, 206], [70, 206], [-170, -170], [170, -170], [-170, 170], [170, 170]]) {
    const ob = new THREE.Mesh(obGeo, obMat);
    ob.position.set(x, 3, z); ob.rotation.y = Math.PI / 4; ob.castShadow = true; group.add(ob);
    b.add(boxG(10, 3, 10), MAT.basalt, [x, 2, z]);
    b.add(boxG(10.2, 0.3, 10.2), MAT.goldGlow, [x, 3.4, z]);
    b.add(new THREE.ConeGeometry(2.6, 5, 4).rotateY(Math.PI / 4), MAT.goldGlow, [x, 3 + obH + 2.5, z]);
    circC(x, z, 7);
  }

  // ---- braziers (the first four cast real light)
  const brazierPts = [[-16, 152], [16, 152], [-16, 172], [16, 172]];
  for (let i = 0; i < 4; i++) brazierPts.push([-20, 236 + i * 64], [20, 236 + i * 64]);
  brazierPts.forEach(([x, z], i) => {
    b.at([x, 0.5, z], [0, 0, 0], 1, () => brazier(b));
    dyn.flames.push({ pos: new THREE.Vector3(x, 8.4, z), light: i < 4 });
    circC(x, z, 2.5);
  });

  // ---- avenue of sphinxes
  for (let i = 0; i < 7; i++) for (const s of [-1, 1]) {
    const z = 226 + i * 40;
    b.at([s * 32, groundAt(s * 32, z), z], [0, -s * Math.PI / 2, 0], 1, () => sphinx(b));
    boxC(s * 32, z, 9, 5);
  }

  // ---- satellite pyramids
  for (const sat of SATELLITES) {
    const m = makeGlyphMaterial({ H: sat.h, half: sat.half, cellW: 5, cellH: 4.2, gMin: 5, gMax: sat.h * 0.7, goldTop: sat.h * 0.82, edge: 0.6, course: 1.6, block: 3.5 });
    const y = groundAt(sat.x, sat.z);
    const p = new THREE.Mesh(new THREE.ConeGeometry(sat.half * Math.SQRT2, sat.h, 4, 1).translate(0, sat.h / 2, 0), m);
    p.position.set(sat.x, y + 1.5, sat.z); p.rotation.y = Math.PI / 4; p.castShadow = true; p.receiveShadow = true;
    group.add(p);
    b.add(boxG(sat.half * 2 + 8, 2, sat.half * 2 + 8), MAT.basalt, [sat.x, y + 0.5, sat.z]);
    boxC(sat.x, sat.z, sat.half + 4, sat.half + 4);
  }

  group.add(b.build());
  function setTint(hex) { pyrMat.emissive.setHex(hex); beamMat.color.setHex(hex); MAT.goldGlow.emissive.setHex(hex); }
  return { group, cap, rings, beam, beamMat, doorGlowMat, setTint };
}

// ================================================================ sun-shard shrine
function createShrine(site) {
  const group = new THREE.Group();
  const b = new Batch();
  for (let i = 0; i < 3; i++) {
    const r = 15 - i * 3.2;
    b.add(cyl(r, r + 0.4, 1.6, 8), i === 2 ? MAT.stonePale : MAT.sandstone, [0, 0.8 + i * 1.6, 0], [0, Math.PI / 8, 0]);
    b.add(new THREE.TorusGeometry(r, 0.12, 4, 8), MAT.goldGlow, [0, 1.62 + i * 1.6, 0], [Math.PI / 2, 0, Math.PI / 8]);
  }
  const r = rng(Math.abs(site.x * 7 + site.z));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2, broken = r() < 0.3;
    const h = broken ? 4 + r() * 5 : 15;
    b.at([Math.cos(a) * 13, 1.6, Math.sin(a) * 13], [0, a, 0], 1, () => {
      if (broken) {
        b.add(cyl(1.1, 1.2, h, 12), MAT.sandstone, [0, h / 2, 0], [r() * 0.1, 0, r() * 0.1]);
        b.add(cyl(1.0, 1.0, 5, 12), MAT.sandstone, [2.5, 0.6, 2], [Math.PI / 2, r() * 3, 0.2]);
      } else column(b, h, 1.1);
    });
  }
  b.add(boxG(5, 3.2, 5), MAT.basalt, [0, 6.4, 0]);
  for (const s of [-1, 1]) for (const t of [-1, 1]) b.add(boxG(0.3, 3.3, 0.3), MAT.gold, [s * 2.5, 6.4, t * 2.5]);
  b.add(boxG(5.4, 0.3, 5.4), MAT.gold, [0, 8.1, 0]);
  group.add(b.build());

  const crystalMat = new THREE.MeshStandardMaterial({ color: site.color, emissive: site.color, emissiveIntensity: 3.5, metalness: 0.3, roughness: 0.15, flatShading: true });
  const cb = new Batch();
  cb.add(new THREE.OctahedronGeometry(1.8, 0), crystalMat, [0, 0, 0], [0, 0, 0], [1, 1.9, 1]);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    cb.add(new THREE.OctahedronGeometry(0.6, 0), crystalMat, [Math.cos(a) * 1.6, -2.2, Math.sin(a) * 1.6], [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], [1, 2, 1]);
  }
  const crystal = cb.build({ cast: false });
  crystal.position.y = 12; group.add(crystal);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x553300, emissive: site.color, emissiveIntensity: 2.5 });
  const rings = [new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.15, 6, 48), ringMat), new THREE.Mesh(new THREE.TorusGeometry(5.2, 0.1, 6, 48), ringMat)];
  rings.forEach((m) => { m.position.y = 12; group.add(m); });
  const runeB = new Batch();
  for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; runeB.add(boxG(0.5, 0.9, 0.08), ringMat, [Math.cos(a) * 7, Math.sin(k * 2.3) * 0.8, Math.sin(a) * 7], [0, -a, 0]); }
  const runes = runeB.build({ cast: false }); runes.position.y = 12; group.add(runes);
  const light = new THREE.PointLight(site.color, 60, 60, 1.6); light.position.y = 12; group.add(light);
  const beamMat = new THREE.MeshBasicMaterial({ color: site.color, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 2.4, 700, 16, 1, true), beamMat);
  beam.position.y = 350; group.add(beam);
  return { group, crystal, rings, runes, light, beam, parts: [crystal, ...rings, runes, light, beam] };
}

// ================================================================ caravan camp + oasis
function camel(b) {
  const F = MAT.fur;
  b.add(sph(1, 14, 10), F, [0, 4.2, 0], [0, 0, 0], [1.25, 1.05, 2.3]);
  b.add(sph(1, 12, 8), F, [0, 5.4, -0.4], [0, 0, 0], [0.95, 0.9, 1.1]);
  for (const [x, z] of [[-0.75, 1.5], [0.75, 1.5], [-0.75, -1.6], [0.75, -1.6]]) {
    b.add(cyl(0.28, 0.22, 2, 6), F, [x, 2.8, z]);
    b.add(sph(0.26, 6, 4), F, [x, 1.8, z]);
    b.add(cyl(0.2, 0.17, 1.7, 6), F, [x, 0.95, z]);
    b.add(cyl(0.28, 0.3, 0.2, 8), MAT.woodDark, [x, 0.1, z]);
  }
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 4.6, 2), new THREE.Vector3(0, 4.4, 3.2), new THREE.Vector3(0, 5.6, 3.8), new THREE.Vector3(0, 6.6, 4.0)]), 10, 0.38, 8), F);
  b.add(boxG(0.7, 0.7, 1.5), F, [0, 6.8, 4.5]);
  b.add(boxG(0.55, 0.5, 0.5), F, [0, 6.6, 5.3]);
  for (const s of [-1, 1]) { b.add(new THREE.ConeGeometry(0.12, 0.35, 5), F, [s * 0.3, 7.3, 4.1]); b.add(sph(0.07, 6, 4), MAT.black, [s * 0.36, 7.0, 4.8]); }
  b.add(cyl(0.08, 0.04, 1.6, 5), F, [0, 3.8, -2.4], [0.4, 0, 0]);
  b.add(boxG(2.8, 0.2, 2.6), MAT.red, [0, 6.25, -0.3]);
  b.add(boxG(2.9, 0.08, 0.3), MAT.gold, [0, 6.3, 1.0]);
  for (let k = 0; k < 9; k++) b.add(boxG(0.1, 0.5, 0.1), MAT.gold, [-1.4 + k * 0.35, 5.95, 1.0]);
  b.add(boxG(1.2, 0.8, 1.2), MAT.wood, [0, 6.75, -0.3]);
  for (const s of [-1, 1]) {
    b.add(rockGeometry(1, 1, 3 + s, 0.12), MAT.cloth, [s * 1.5, 5.2, -0.3], [0, 0, 0], [0.5, 0.75, 0.75]);
    b.add(boxG(0.1, 1.4, 0.15), MAT.leather, [s * 1.3, 5.5, 0.4]);
  }
  b.add(new THREE.TorusGeometry(0.4, 0.05, 4, 12), MAT.leather, [0, 6.7, 5.0], [0, Math.PI / 2, 0]);
}
function person(b, robe) {
  b.add(new THREE.ConeGeometry(0.75, 2.6, 10), robe, [0, 1.3, 0]);
  b.add(cyl(0.45, 0.6, 0.25, 10), MAT.red, [0, 1.9, 0]);
  b.add(sph(0.36, 10, 8), MAT.leather, [0, 2.95, 0]);
  b.add(new THREE.TorusGeometry(0.33, 0.13, 6, 12), MAT.cloth, [0, 3.15, 0], [Math.PI / 2, 0, 0]);
  b.add(sph(0.33, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.cloth, [0, 3.2, 0]);
  for (const s of [-1, 1]) b.add(cyl(0.12, 0.14, 1.3, 6), robe, [s * 0.6, 2.0, 0.1], [0.3, 0, s * 0.35]);
  b.add(cyl(0.06, 0.06, 4, 5), MAT.wood, [0.85, 2, 0.4]);
}
function palm(b, h, lean, seed) {
  const r = rng(seed);
  let x = 0, y = 0;
  const segs = 12;
  for (let i = 0; i < segs; i++) {
    const t = i / segs, nx = Math.sin(t * 1.4) * lean, ny = (h / segs) * (i + 1);
    b.add(cyl(0.55 - t * 0.2, 0.62 - t * 0.2, h / segs + 0.1, 8), MAT.palmTrunk, [(x + nx) / 2, (y + ny) / 2, 0], [0, 0, -lean * 0.08]);
    b.add(new THREE.TorusGeometry(0.58 - t * 0.2, 0.08, 4, 10), MAT.woodDark, [nx, ny - 0.2, 0], [Math.PI / 2, 0, 0]);
    x = nx; y = ny;
  }
  b.at([x, y, 0], [0, 0, 0], 1, () => {
    for (let f = 0; f < 10; f++) {
      const a = (f / 10) * Math.PI * 2 + r() * 0.3, droop = 0.35 + r() * 0.5;
      b.at([0, 0, 0], [0, a, 0], 1, () => {
        for (let k = 0; k < 10; k++) {
          const t = k / 10, px = t * 6.5, py = -Math.pow(t, 1.6) * 4 * droop + 0.6;
          b.add(boxG(0.7, 0.07, 0.25), MAT.palmLeaf, [px, py, 0], [0, 0, -t * droop * 1.2]);
          for (const s of [-1, 1]) b.add(boxG(0.12, 0.04, 1.6 - t), MAT.palmLeaf, [px, py - 0.1, s * (0.8 - t * 0.4)], [s * 0.5, 0, 0]);
        }
      });
    }
    for (let k = 0; k < 5; k++) b.add(sph(0.35, 8, 6), MAT.woodDark, [Math.cos(k * 1.3) * 0.6, -0.5, Math.sin(k * 1.3) * 0.6]);
  });
}

function createCamp() {
  const group = new THREE.Group();
  const y0 = groundAt(CAMP.x, CAMP.z);
  group.position.set(CAMP.x, y0, CAMP.z);
  const b = new Batch();
  [[-9, 0, 0.3], [0, 5, -0.4], [9, -2, 0.2], [-4, -12, 1.9]].forEach(([x, z, r]) => b.at([x, 0, z], [0, r, 0], 1, () => camel(b)));
  const tentGeo = paint(new THREE.ConeGeometry(6, 6.5, 12, 3, true), (x, y, z, c) => c.setHex(Math.floor((Math.atan2(z, x) / Math.PI + 1) * 6) % 2 ? 0x9e1b1b : 0xe8dcc0));
  for (const [x, z] of [[-14, -16], [6, -20]]) {
    b.add(tentGeo, MAT.vcolor, [x, 3.25, z]);
    b.add(cyl(0.15, 0.15, 7.5, 6), MAT.wood, [x, 3.75, z]);
    b.add(sph(0.35, 8, 6), MAT.gold, [x, 7.6, z]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      b.add(cyl(0.03, 0.03, 4.5, 3), MAT.cloth, [x + Math.cos(a) * 7.2, 1.4, z + Math.sin(a) * 7.2], [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9]);
      b.add(cyl(0.08, 0.05, 0.8, 4), MAT.wood, [x + Math.cos(a) * 8.8, 0.2, z + Math.sin(a) * 8.8]);
    }
  }
  const rugGeo = paint(new THREE.PlaneGeometry(6, 4, 24, 16).rotateX(-Math.PI / 2), (x, y, z, c) => {
    const border = Math.abs(x) > 2.6 || Math.abs(z) > 1.6, st = Math.floor((x + 3) * 2) % 3;
    c.setHex(border ? 0xd9a531 : [0x8e1d1d, 0x1f3f9a, 0x6a1010][st]);
  });
  b.add(rugGeo, MAT.vcolor, [-2, 0.06, 6]); b.add(rugGeo, MAT.vcolor, [6, 0.06, 9], [0, 0.6, 0]);
  for (let i = 0; i < 6; i++) {
    const x = 10 + (i % 3) * 1.8, yy = 0.7 + Math.floor(i / 3) * 1.4, z = -10;
    b.add(boxG(1.6, 1.4, 1.6), MAT.wood, [x, yy, z]);
    for (const s of [-1, 1]) b.add(boxG(1.65, 0.12, 0.12), MAT.woodDark, [x, yy + s * 0.55, z + 0.8]);
  }
  for (let i = 0; i < 7; i++) b.add(AMPHORA, i % 2 ? MAT.stoneDark : MAT.sandstone, [-6 + i * 1.4, 0, -6 - (i % 3)], [0, i, i === 4 ? 1.4 : 0], 0.55);
  for (let k = 0; k < 9; k++) b.add(rockGeometry(0.5, 0, k, 0.3), MAT.stoneDark, [Math.cos(k * 0.7) * 2, 0.25, Math.sin(k * 0.7) * 2]);
  for (let k = 0; k < 4; k++) b.add(cyl(0.2, 0.2, 2.6, 6), MAT.woodDark, [0, 0.35, 0], [Math.PI / 2, (k * Math.PI) / 4, 0.2]);
  const people = [];
  [MAT.lapis, MAT.redDark, MAT.turquoise, MAT.cloth].forEach((robe, i) => {
    const pb = new Batch(); person(pb, robe);
    const p = pb.build(); p.position.set(-6 + i * 4, 0, 10 + (i % 2)); p.rotation.y = Math.PI + i * 0.4; group.add(p); people.push(p);
  });
  const pr = rng(99);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, d = POND.r + 6 + pr() * 10;
    const px = POND.x - CAMP.x + Math.cos(a) * d, pz = POND.z - CAMP.z + Math.sin(a) * d;
    b.at([px, groundAt(px + CAMP.x, pz + CAMP.z) - y0, pz], [0, pr() * 6, 0], 0.9 + pr() * 0.5, () => palm(b, 14 + pr() * 6, 1.5 + pr() * 2.5, i + 3));
  }
  for (let i = 0; i < 60; i++) {
    const a = pr() * Math.PI * 2, d = POND.r - 1 + pr() * 4;
    b.add(new THREE.ConeGeometry(0.12, 2.5 + pr() * 2, 4), MAT.palmLeaf, [POND.x - CAMP.x + Math.cos(a) * d, 1.2, POND.z - CAMP.z + Math.sin(a) * d], [pr() * 0.3, 0, pr() * 0.3]);
  }
  group.add(b.build());

  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1b6d8f, roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.9 });
  waterMat.customProgramCacheKey = () => 'water';
  waterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = glyphUniforms.uTime; WPOS_VERT(sh);
    sh.fragmentShader = 'uniform float uTime; varying vec3 vWPos;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float w = sin(length(vWPos.xz - vec2(${POND.x.toFixed(1)}, ${POND.z.toFixed(1)})) * 3.2 - uTime * 2.5) * sin(vWPos.x * 1.9 + vWPos.z * 0.7 + uTime);
      totalEmissiveRadiance += vec3(0.2, 0.5, 0.6) * smoothstep(0.75, 1.0, w) * 0.25;`);
  };
  const water = new THREE.Mesh(new THREE.CircleGeometry(POND.r + 10, 64).rotateX(-Math.PI / 2), waterMat);
  water.position.set(POND.x - CAMP.x, 0.9, POND.z - CAMP.z); water.receiveShadow = true;
  group.add(water);

  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const fire = new THREE.Group();
  for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(new THREE.ConeGeometry(1.2 - k * 0.3, 3 + k, 8, 1, true), fireMat); m.position.y = 1.5 + k * 0.4; fire.add(m); }
  group.add(fire);
  const fireLight = new THREE.PointLight(0xff8a2a, 0, 50, 1.5); fireLight.position.set(0, 4, 0); group.add(fireLight);

  const N = 2600, sp = new Float32Array(N * 3), seeds = [];
  for (let i = 0; i < N; i++) seeds.push({ a: Math.random() * Math.PI * 2, r: 8 + Math.random() * 34, y: Math.random() * 40, s: 0.6 + Math.random() });
  const stormGeo = new THREE.BufferGeometry(); stormGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stormMat = new THREE.PointsMaterial({ color: 0xc8955a, size: 0.45, transparent: true, opacity: 0.85, depthWrite: false });
  const storm = new THREE.Points(stormGeo, stormMat); storm.frustumCulled = false;
  group.add(storm);
  circC(CAMP.x, CAMP.z, 3);

  let rescued = false;
  function update(dt, t) {
    if (storm.visible) {
      for (let i = 0; i < N; i++) {
        const s = seeds[i]; s.a += dt * s.s * (1.6 - s.r / 50);
        sp[i * 3] = Math.cos(s.a) * s.r; sp[i * 3 + 1] = s.y + Math.sin(t * 2 + i) * 0.6; sp[i * 3 + 2] = Math.sin(s.a) * s.r;
      }
      stormGeo.attributes.position.needsUpdate = true;
    }
    if (rescued) {
      stormMat.opacity = Math.max(0, stormMat.opacity - dt * 0.4); storm.visible = stormMat.opacity > 0.01;
      fireMat.opacity = 0.75 + Math.sin(t * 13) * 0.15;
      fire.children.forEach((m, k) => { m.scale.set(1, 1 + Math.sin(t * (9 + k * 3)) * 0.2, 1); m.rotation.y = t * (1 + k); });
      fireLight.intensity = 50 + Math.sin(t * 11) * 10;
      people.forEach((p, i) => { p.position.y = Math.abs(Math.sin(t * 4 + i)) * 0.5; });
    }
  }
  function reset() {   // used by the movies to replay the storm
    rescued = false; stormMat.opacity = 0.85; storm.visible = true; fireMat.opacity = 0; fireLight.intensity = 0;
    people.forEach((p) => { p.position.y = 0; });
  }
  return { group, update, rescue() { rescued = true; }, reset };
}

// ================================================================ desert decor
function deadTree(b, len, rad, depth, r) {
  b.add(cyl(rad * 0.7, rad, len, 6), MAT.woodDark, [0, len / 2, 0]);
  if (depth === 0) return;
  b.at([0, len, 0], [0, 0, 0], 1, () => {
    const n = 2 + (r() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) b.at([0, 0, 0], [0, (i / n) * Math.PI * 2 + r(), 0], 1, () => b.at([0, 0, 0], [0.45 + r() * 0.5, 0, 0], 1, () => deadTree(b, len * (0.6 + r() * 0.2), rad * 0.65, depth - 1, r)));
  });
}

function createDecor() {
  const group = new THREE.Group();
  const b = new Batch();
  const r = rng(7);
  const farFrom = (x, z, d) => SHARD_SITES.every((s) => Math.hypot(x - s.x, z - s.z) > d) && Math.hypot(x - CAMP.x, z - CAMP.z) > d
    && SATELLITES.every((s) => Math.hypot(x - s.x, z - s.z) > s.half + 40) && !(Math.abs(x) < 300 && z > -300 && z < 560) && Math.hypot(x - ARENA.x, z - ARENA.z) > ARENA.r + 40;

  for (const [geo, count, mat] of [[rockGeometry(1, 1, 2, 0.35), 260, MAT.stoneDark], [rockGeometry(1, 0, 5, 0.3), 260, MAT.stone]]) {
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      let x, z; do { x = (r() - 0.5) * 2600; z = (r() - 0.5) * 2600; } while (Math.max(Math.abs(x), Math.abs(z)) < 240 || Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r + 30);
      const sc = 0.8 + r() * r() * 7;
      p.set(x, duneHeight(x, z) + sc * 0.2, z); q.setFromEuler(e.set(r() * 3, r() * 3, r() * 3));
      s.set(sc * (0.8 + r() * 0.6), sc * (0.5 + r() * 0.5), sc * (0.8 + r() * 0.6));
      inst.setMatrixAt(i, m.compose(p, q, s));
    }
    inst.castShadow = inst.receiveShadow = true;
    group.add(inst);
  }

  for (let i = 0; i < 26; i++) {                                                      // ruins
    let x, z; do { const a = r() * Math.PI * 2, d = 330 + r() * 750; x = Math.cos(a) * d; z = Math.sin(a) * d; } while (!farFrom(x, z, 90));
    b.at([x, duneHeight(x, z) - 1.5, z], [0, r() * Math.PI, 0], 1, () => {
      const n = 2 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const broken = r() < 0.5, h = broken ? 3 + r() * 6 : 12 + r() * 5;
        b.at([k * 7 - n * 3.5, 0, (r() - 0.5) * 3], [r() * 0.08, 0, r() * 0.08], 1, () => (broken ? b.add(cyl(1.1, 1.2, h, 12), MAT.sandstone, [0, h / 2, 0]) : column(b, h, 1.1)));
        if (broken) b.add(cyl(1.0, 1.0, 4, 12), MAT.sandstone, [k * 7 - n * 3.5 + 3, 1, 3], [Math.PI / 2, 0, r()]);
      }
      if (r() < 0.6) {
        for (let row = 0; row < 4; row++) for (let c = 0; c < 6 - row; c++) {
          if (r() < 0.15) continue;
          b.add(boxG(2.8, 1.6, 2), r() < 0.5 ? MAT.sandstone : MAT.stone, [c * 3 + row * 1.5 - 8, 0.8 + row * 1.6, -8], [0, r() * 0.1, 0]);
        }
      }
      if (r() < 0.6) b.add(boxG(10, 1.8, 2.2), MAT.stone, [2, 0.9, 6], [0, r(), 0.08]);
      for (let k = 0; k < 4; k++) b.add(AMPHORA, MAT.stoneDark, [r() * 10 - 5, 0.8, r() * 10 + 2], [k === 0 ? 1.5 : 0, r() * 6, 0], 0.5 + r() * 0.3);
    });
  }

  for (let i = 0; i < 26; i++) {                                                      // dead trees
    let x, z; do { x = (r() - 0.5) * 2000; z = (r() - 0.5) * 2000; } while (!farFrom(x, z, 60) || Math.hypot(x, z) < 320);
    b.at([x, duneHeight(x, z) - 0.5, z], [0, r() * 6, 0], 1, () => deadTree(b, 4 + r() * 3, 0.5, 3, r));
  }

  // the bones of a giant beast
  b.at([-260, duneHeight(-260, 760) - 3, 760], [0, 0.7, 0], 1, () => {
    for (let k = 0; k < 16; k++) b.add(sph(1.6 - k * 0.05, 8, 6), MAT.bone, [0, 9 - k * 0.1, -30 + k * 4.2], [0, 0, 0], [1.2, 1, 1.4]);
    for (let k = 0; k < 11; k++) {
      const R = 10 - Math.abs(k - 4) * 0.7;
      for (const rotY of [0, Math.PI]) b.add(new THREE.TorusGeometry(R, 0.55, 6, 18, Math.PI * 0.8), MAT.bone, [0, 9 - R, -24 + k * 4.2], [0, rotY, Math.PI / 2]);
    }
    b.add(rockGeometry(1, 1, 8, 0.12), MAT.bone, [0, 7, 40], [0.3, 0, 0], [6, 5, 9]);
    for (const s of [-1, 1]) { b.add(sph(1.4, 8, 6), MAT.black, [s * 3, 9, 44]); b.add(new THREE.ConeGeometry(1.2, 9, 8), MAT.bone, [s * 4, 11, 38], [-0.8, 0, s * 0.5]); }
    for (let k = 0; k < 10; k++) b.add(new THREE.ConeGeometry(0.4, 2.2, 5), MAT.bone, [-3.6 + k * 0.8, 3.6, 47], [Math.PI, 0, 0]);
  });

  // half-buried colossal head
  b.at([-760, duneHeight(-760, 80) - 6, 80], [0.35, 1.2, 0.25], 1, () => {
    b.add(boxG(22, 26, 22), MAT.stonePale, [0, 0, 0]);
    b.add(boxG(5, 8, 5), MAT.stonePale, [0, -2, 12.5]);
    b.add(boxG(10, 1.5, 2), MAT.stoneDark, [0, -8, 11.2]);
    for (const s of [-1, 1]) { b.add(boxG(5, 2, 1.5), MAT.stoneDark, [s * 5.5, 4, 11.2]); b.add(boxG(2, 1.4, 1), MAT.goldGlow, [s * 5.5, 4, 11.8]); }
    for (const s of [-1, 1]) for (let k = 0; k < 8; k++) b.add(boxG(5, 3, 18), k % 2 ? MAT.lapis : MAT.gold, [s * 13, 11 - k * 3, 0]);
    b.add(boxG(26, 6, 24), MAT.gold, [0, 15, -1]);
    b.add(boxG(8, 4, 6), MAT.stonePale, [-6, 21, 0], [0, 0, 0.5]);
  });

  // two giant stone legs standing alone
  b.at([100, duneHeight(100, 820) - 1, 820], [0, 0.4, 0], 1, () => {
    b.add(boxG(30, 6, 18), MAT.stone, [0, 3, 0]);
    for (const s of [-1, 1]) { b.add(boxG(6, 32, 7), MAT.stonePale, [s * 6, 22, 0]); b.add(boxG(7, 4, 12), MAT.stonePale, [s * 6, 8, 3]); }
    b.add(rockGeometry(1, 1, 3, 0.3), MAT.stonePale, [-6, 39, 0], [0, 0, 0], [5, 3, 5]);
  });

  // mesas on the horizon
  const strata = [MAT.sandstone, MAT.stoneDark, std2(0xa0603a), MAT.stone, std2(0xc07a48)];
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + r() * 0.1, d = 1550 + r() * 500;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, R = 60 + r() * 120, layers = 3 + Math.floor(r() * 4);
    b.at([x, duneHeight(x, z) - 4, z], [0, r() * 6, 0], 1, () => {
      let y = 0;
      for (let k = 0; k < layers; k++) {
        const h = 14 + r() * 26, rr = R * (1 - k * 0.07);
        b.add(rockGeometry(1, 1, i * 9 + k, 0.08, 3), strata[(i + k) % strata.length], [0, y + h / 2, 0], [0, k, 0], [rr, h / 2, rr * (0.7 + r() * 0.3)]);
        y += h * 0.85;
      }
    });
  }
  group.add(b.build());
  return group;
}

// ================================================================ living details
function createFlags(points) {
  const flags = points.map((p, i) => {
    const geo = paint(new THREE.PlaneGeometry(9, 22, 12, 20), (x, y, z, c) => {
      const border = Math.abs(x) > 3.8 || y < -9.5, sun = Math.hypot(x, y - 4) < 2.2;
      c.setHex(border ? 0xd9a531 : sun ? 0xffd36a : (Math.abs(y + 4) < 0.6 ? 0x1f3f9a : 0x9e1b1b));
    });
    geo.translate(4.7, -11, 0);
    const mesh = new THREE.Mesh(geo, MAT.vcolor); mesh.position.copy(p); mesh.castShadow = true;
    mesh.userData.base = geo.attributes.position.array.slice(); mesh.userData.phase = i * 1.3;
    return mesh;
  });
  function update(t, wind) {
    for (const f of flags) {
      const arr = f.geometry.attributes.position.array, base = f.userData.base;
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i], k = x / 9.4;
        arr[i + 2] = Math.sin(x * 0.6 - t * (3 + wind * 0.1) + f.userData.phase) * k * (1.2 + wind * 0.04);
      }
      f.geometry.attributes.position.needsUpdate = true; f.geometry.computeVertexNormals();
    }
  }
  return { flags, update };
}

function createFlames(list) {
  const group = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff9a30, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const items = list.map((f) => {
    const g = new THREE.Group(); g.position.copy(f.pos);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(1.3, 4.5, 10, 1, true), flameMat); outer.position.y = 2;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.8, 8, 1, true), coreMat); inner.position.y = 1.4;
    g.add(outer, inner);
    if (f.light) { const l = new THREE.PointLight(0xff9a3a, 70, 70, 1.6); l.position.y = 3; g.add(l); g.userData.light = l; }
    group.add(g); return g;
  });
  const EN = 360, ep = new Float32Array(EN * 3), eSeed = [];
  for (let i = 0; i < EN; i++) eSeed.push({ src: i % list.length, life: Math.random() * 2, vx: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8 });
  const eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ color: 0xffb040, size: 0.35, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  embers.frustumCulled = false; group.add(embers);
  function update(dt, t) {
    items.forEach((g, i) => {
      const s = 1 + Math.sin(t * 11 + i) * 0.12 + Math.sin(t * 17 + i * 2) * 0.08;
      g.children[0].scale.set(1, s, 1); g.children[1].scale.set(1, 2 - s, 1); g.rotation.y = t * 2 + i;
      if (g.userData.light) g.userData.light.intensity = 60 + Math.sin(t * 13 + i) * 12;
    });
    for (let i = 0; i < EN; i++) {
      const e = eSeed[i]; e.life += dt;
      if (e.life > 2) { e.life = 0; e.vx = (Math.random() - 0.5) * 0.8; e.vz = (Math.random() - 0.5) * 0.8; }
      const p = list[e.src].pos;
      ep[i * 3] = p.x + e.vx * e.life * 2 + Math.sin(t * 3 + i) * 0.2; ep[i * 3 + 1] = p.y + 1 + e.life * 4; ep[i * 3 + 2] = p.z + e.vz * e.life * 2;
    }
    eGeo.attributes.position.needsUpdate = true;
  }
  return { group, update };
}

function createBirds() {
  const group = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x2a1d14, flatShading: true });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xc28a6a });
  const birds = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.5, 6).rotateX(Math.PI / 2), body));
    const head = new THREE.Mesh(sph(0.5, 6, 4), headMat); head.position.z = 2.5; g.add(head);
    const wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      const w = new THREE.Mesh(boxG(6, 0.12, 2.2), body); w.position.x = s * 3; pivot.add(w);
      const tip = new THREE.Mesh(boxG(3, 0.1, 1.4), body); tip.position.x = s * 7; tip.rotation.z = s * 0.2; pivot.add(tip);
      g.add(pivot); wings.push({ pivot, s });
    }
    const center = i < 5 ? new THREE.Vector3(-260, 0, 760) : new THREE.Vector3(0, 0, 0);
    birds.push({ g, wings, center, r: 60 + Math.random() * 100, h: (i < 5 ? 90 : 230) + Math.random() * 60, sp: 0.15 + Math.random() * 0.1, ph: Math.random() * 6 });
    group.add(g);
  }
  function update(t) {
    for (const b of birds) {
      const a = t * b.sp + b.ph;
      b.g.position.set(b.center.x + Math.cos(a) * b.r, b.h + Math.sin(t * 0.5 + b.ph) * 6, b.center.z + Math.sin(a) * b.r);
      b.g.rotation.set(0, -a, 0.35);
      const flap = Math.sin(t * 4 + b.ph) * 0.35 * (Math.sin(t * 0.3 + b.ph) > 0.3 ? 1 : 0.15);
      b.wings.forEach((w) => { w.pivot.rotation.z = w.s * flap; });
    }
  }
  return { group, update };
}

function createDustDevils() {
  const devils = [], group = new THREE.Group();
  const mat = new THREE.PointsMaterial({ color: 0xd4a36a, size: 0.8, transparent: true, opacity: 0.55, depthWrite: false });
  for (let d = 0; d < 3; d++) {
    const N = 700, arr = new Float32Array(N * 3), seeds = [];
    for (let i = 0; i < N; i++) seeds.push({ a: Math.random() * 6.28, y: Math.random() * 60, s: 1 + Math.random() });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; group.add(pts);
    devils.push({ pts, arr, seeds, geo, ph: d * 2.1 });
  }
  function update(dt, t) {
    for (const dv of devils) {
      const cx = Math.sin(t * 0.013 + dv.ph) * 800, cz = Math.cos(t * 0.011 + dv.ph * 1.7) * 800;
      dv.pts.position.set(cx, duneHeight(cx, cz), cz);
      dv.seeds.forEach((s, i) => {
        s.a += dt * s.s * 3; s.y += dt * 4; if (s.y > 60) s.y = 0;
        const R = 2 + s.y * 0.35;
        dv.arr[i * 3] = Math.cos(s.a) * R; dv.arr[i * 3 + 1] = s.y; dv.arr[i * 3 + 2] = Math.sin(s.a) * R;
      });
      dv.geo.attributes.position.needsUpdate = true;
    }
  }
  return { group, update };
}

function createSandParticles() {
  const N = 1500, R = 120, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) pos.set([(Math.random() - 0.5) * R * 2, Math.random() * 40, (Math.random() - 0.5) * R * 2], i * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: 0xe8c48c, size: 0.3, transparent: true, opacity: 0.7, depthWrite: false });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false;
  function update(dt, center, wind) {
    for (let i = 0; i < N; i++) {
      let x = pos[i * 3] + wind * dt, y = pos[i * 3 + 1] - dt * 0.4, z = pos[i * 3 + 2] + wind * 0.3 * dt;
      if (x - center.x > R) x -= R * 2; else if (x - center.x < -R) x += R * 2;
      if (z - center.z > R) z -= R * 2; else if (z - center.z < -R) z += R * 2;
      if (y < center.y - 6) y += 40; else if (y > center.y + 34) y -= 40;
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { points, mat, update };
}

function createFootprints() {
  const N = 260;
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 1, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2), mat, N);
  mesh.frustumCulled = false;
  const prints = []; let next = 0;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < N; i++) prints.push({ x: 0, y: -999, z: 0, yaw: 0, age: 99 });
  function add(x, z, yaw) { prints[next] = { x, y: groundAt(x, z) + 0.12, z, yaw, age: 0 }; next = (next + 1) % N; }
  function update(dt) {
    for (let i = 0; i < N; i++) {
      const f = prints[i]; f.age += dt;
      const k = Math.max(0, 1 - f.age / 40);
      p.set(f.x, f.y, f.z); q.setFromEuler(e.set(0, f.yaw, 0)); s.set(0.9 * k + 1e-4, 1, 1.5 * k + 1e-4);
      mesh.setMatrixAt(i, m.compose(p, q, s));
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, add, update };
}

function createDustPuffs() {
  const N = 300, arr = new Float32Array(N * 3).fill(-9999), parts = [];
  for (let i = 0; i < N; i++) parts.push({ life: 9, vx: 0, vy: 0, vz: 0 });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd9b07a, size: 0.9, transparent: true, opacity: 0.6, depthWrite: false }));
  pts.frustumCulled = false;
  let next = 0;
  function puff(x, y, z, n = 8, power = 1) {
    for (let k = 0; k < n; k++) {
      const p = parts[next], i = next; next = (next + 1) % N;
      const a = Math.random() * 6.28, sp = (2 + Math.random() * 4) * power;
      p.life = 0; p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 1 + Math.random() * 3 * power;
      arr[i * 3] = x; arr[i * 3 + 1] = y + 0.3; arr[i * 3 + 2] = z;
    }
  }
  function update(dt) {
    for (let i = 0; i < N; i++) {
      const p = parts[i]; if (p.life > 1.2) continue; p.life += dt;
      arr[i * 3] += p.vx * dt; arr[i * 3 + 1] += p.vy * dt; arr[i * 3 + 2] += p.vz * dt;
      p.vx *= 0.94; p.vz *= 0.94; p.vy -= dt * 2;
      if (p.life > 1.2) arr[i * 3 + 1] = -9999;
    }
    geo.attributes.position.needsUpdate = true;
  }
  return { points: pts, puff, update };
}

// ================================================================ assemble
export function createWorld(scene, opts = {}) {
  const dyn = { flagPoints: [], flames: [] };
  scene.add(createGround(opts.groundSeg));
  scene.add(createPaving());
  const sky = createSky(); scene.add(sky.group); scene.add(sky.cloudMesh);
  const pyramid = createPyramidComplex(dyn); scene.add(pyramid.group);
  scene.add(createDecor());
  const shards = SHARD_SITES.map((site) => {
    const s = createShrine(site);
    s.group.position.set(site.x, groundAt(site.x, site.z), site.z);
    scene.add(s.group);
    circC(site.x, site.z, 8);
    return { ...site, ...s };
  });
  const camp = createCamp(); scene.add(camp.group);
  const flags = createFlags(dyn.flagPoints); flags.flags.forEach((f) => scene.add(f));
  const flames = createFlames(dyn.flames); scene.add(flames.group);
  const birds = createBirds(); scene.add(birds.group);
  const devils = createDustDevils(); scene.add(devils.group);
  const sand = createSandParticles(); scene.add(sand.points);
  const footprints = createFootprints(); scene.add(footprints.mesh);
  const dust = createDustPuffs(); scene.add(dust.points);

  function update(dt, t, { center, wind }) {
    glyphUniforms.uTime.value = t;
    pyramid.cap.rotation.y += dt * 0.5;
    pyramid.cap.position.y = PYR.HEIGHT + 14 + Math.sin(t * 1.3) * 1.5;
    pyramid.rings.forEach((r, i) => { r.rotation.z += dt * (0.3 + i * 0.15) * (i % 2 ? -1 : 1); r.position.y = pyramid.cap.position.y; });
    shards.forEach((s, i) => {
      s.crystal.rotation.y += dt * 1.2; s.crystal.position.y = 12 + Math.sin(t * 2 + i) * 0.7;
      s.rings[0].rotation.set(t * 0.9, t * 0.4, 0); s.rings[1].rotation.set(-t * 0.5, 0, t * 0.7);
      s.runes.rotation.y = -t * 0.4;
    });
    camp.update(dt, t);
    flags.update(t, wind);
    flames.update(dt, t);
    birds.update(t);
    devils.update(dt, t);
    sand.update(dt, center, wind);
    footprints.update(dt);
    dust.update(dt);
    sky.cloudMesh.position.x = ((t * 3) % 800) - 400;
  }
  return { sky, pyramid, shards, camp, sand, footprints, dust, update };
}
