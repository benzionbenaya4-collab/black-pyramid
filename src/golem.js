// golem.js — Kharu, the Sand Warden, built to match the player's own design sheet (front / side / back):
// tall hooded warrior with an empty dark hood, gold ring + cyan gem on the brow, gold bars beside the hood,
// red armour with a gold sun-wheel, long red coat with a decorated tabard, red gloves, pale-blue boots with
// glowing lines, and a long indigo cape with a gold border, centre line, ring and pointed hem.
// Built only from primitives; the toon light ramp is generated in code (no image files).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch } from './util.js';

const ramp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
})();
let rimId = 0;
function toon(color, { rim = 0.18, rimColor = 0xdff4ff, side = THREE.FrontSide, vertexColors = false } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: ramp, side, vertexColors });
  const id = 'toonrim' + (rimId++);
  m.customProgramCacheKey = () => id;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: new THREE.Color(rimColor).multiplyScalar(rim) };
    sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
      totalEmissiveRadiance += uRim * smoothstep(0.35, 0.6, fres);`);
  };
  return m;
}
const outlineMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { thickness: { value: 0.03 }, color: { value: new THREE.Color(0x1b1030) } },
  vertexShader: 'uniform float thickness; void main(){ vec3 p = position + normal * thickness; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
  fragmentShader: 'uniform vec3 color; void main(){ gl_FragColor = vec4(color, 1.0); }',
});
function addOutline(group) {
  const meshes = []; group.traverse((o) => { if (o.isMesh && !o.userData.noOutline) meshes.push(o); });
  for (const m of meshes) {
    const g = m.geometry.clone(); g.deleteAttribute('normal'); if (g.attributes.color) g.deleteAttribute('color');
    const merged = mergeVertices(g, 1e-3); merged.computeVertexNormals();
    const o = new THREE.Mesh(merged, outlineMat); o.userData.noOutline = true; o.castShadow = false;
    m.add(o);
  }
}

/** Everything the in-game character editor can change (defaults = the player's design sheet). */
export const DEFAULT_DESIGN = {
  colors: { armor: '#e0331f', armorDark: '#b52416', trim: '#f4b62a', hood: '#3b2db0', glow: '#3fe6ff',
    gloves: '#c7231c', suit: '#26237a', belt: '#6b3f22', boots: '#a9c4e8', shoes: '#32289c', cape: '#3b2db0' },
  size: { height: 1, hood: 1, shoulders: 1, hands: 1 },
  parts: { crest: true, sideBars: true, cape: true, tabard: true, chestEmblem: true },
};
export function normalizeDesign(d) {
  const D = DEFAULT_DESIGN, o = d || {};
  return { colors: { ...D.colors, ...(o.colors || {}) }, size: { ...D.size, ...(o.size || {}) }, parts: { ...D.parts, ...(o.parts || {}) } };
}

export function createGolem(designIn) {
  const d = normalizeDesign(designIn);
  const hx = (c) => new THREE.Color(c).getHex();
  const C = Object.fromEntries(Object.entries(d.colors).map(([k, v]) => [k, hx(v)]));
  const M = {
    armor: toon(C.armor), armorDark: toon(C.armorDark, { side: THREE.DoubleSide }), trim: toon(C.trim, { rim: 0.25, rimColor: 0xfff4d0 }),
    hood: toon(C.hood, { side: THREE.DoubleSide }), suit: toon(C.suit), belt: toon(C.belt), gloves: toon(C.gloves),
    boots: toon(C.boots), shoes: toon(C.shoes),
    void: new THREE.MeshBasicMaterial({ color: 0x0a0820 }),
    glow: new THREE.MeshStandardMaterial({ color: C.glow, emissive: C.glow, emissiveIntensity: 1.8, roughness: 0.2 }),
    cape: toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide, rim: 0.1 }),
  };
  const cyl = (rt, rb, h, s = 28, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
  const box = (w, h, dd) => new THREE.BoxGeometry(w, h, dd);
  const sph = (r, w = 28, h = 18, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
  const torus = (r, t, ts = 40) => new THREE.TorusGeometry(r, t, 10, ts);
  const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 20);
  const part = (parent, fn) => { const b = new Batch(); fn(b); const g = b.build(); parent.add(g); return g; };
  /** diamond outline made of 4 thin bars, facing +z */
  const diamond = (b, mat, x, y, z, w, hgt, t = 0.035) => {
    const Ld = Math.hypot(w / 2, hgt / 2), a = Math.atan2(hgt / 2, w / 2);
    for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) b.add(box(Ld, t, t), mat, [x + sx * w / 4, y + sy * hgt / 4, z], [0, 0, sx * sy * -a]);
  };

  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  // ---------------------------------------------------------------- legs: navy trousers, pale-blue boots with glowing diamond
  const makeLeg = (s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.3, 2.6, 0);
    part(pivot, (b) => {
      b.add(cyl(0.23, 0.2, 1.15), M.suit, [0, -0.55, 0]);
      b.add(cyl(0.27, 0.25, 1.05), M.boots, [0, -1.72, 0]);                              // tall boot
      b.add(cyl(0.3, 0.29, 0.14), M.trim, [0, -1.2, 0]);                                  // boot cuff
      b.add(cyl(0.28, 0.28, 0.08), M.trim, [0, -2.2, 0]);
      diamond(b, M.glow, 0, -1.6, 0.27, 0.2, 0.42, 0.03);
      b.add(box(0.03, 0.3, 0.03), M.glow, [0, -1.95, 0.265]);
      b.add(sph(0.3, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.shoes, [0, -2.5, 0.1], [0, 0, 0], [1, 0.7, 1.55]);   // shoe
      b.add(cyl(0.31, 0.31, 0.07), M.trim, [0, -2.55, 0.1], [0, 0, 0], [1, 1, 1.55]);    // sole trim
    });
    body.add(pivot); return pivot;
  };
  const legL = makeLeg(-1), legR = makeLeg(1);

  // ---------------------------------------------------------------- long red coat, tabard, belt
  part(body, (b) => {
    b.add(cyl(0.6, 0.86, 1.75, 36, true), M.armorDark, [0, 2.45, 0]);                   // lower coat
    b.add(torus(0.86, 0.045, 48), M.trim, [0, 1.58, 0], [Math.PI / 2, 0, 0]);
    b.add(cyl(0.62, 0.8, 0.75, 36, true), M.armor, [0, 3.0, 0]);                        // upper coat layer
    b.add(torus(0.8, 0.045, 48), M.trim, [0, 2.63, 0], [Math.PI / 2, 0, 0]);
    if (d.parts.tabard) b.at([0, 2.5, 0.74], [-0.13, 0, 0], 1, () => {                   // decorated front tabard
      b.add(box(0.6, 1.9, 0.05), M.armor, [0, 0, 0]);
      for (const x of [-0.3, 0.3]) b.add(box(0.05, 1.9, 0.07), M.trim, [x, 0, 0]);
      b.add(box(0.65, 0.06, 0.07), M.trim, [0, -0.95, 0]);
      diamond(b, M.trim, 0, 0.45, 0.04, 0.34, 0.42);
      b.add(box(0.035, 1.0, 0.04), M.trim, [0, -0.33, 0.04]);
    });
    b.add(cyl(0.6, 0.6, 0.27, 36), M.belt, [0, 3.48, 0]);                              // belt
    for (const y of [3.35, 3.61]) b.add(torus(0.6, 0.04, 48), M.trim, [0, y, 0], [Math.PI / 2, 0, 0]);
    b.add(box(0.34, 0.32, 0.1), M.trim, [0, 3.48, 0.6]);                                // buckle
    b.add(sph(0.11), M.glow, [0, 3.48, 0.66], [0, 0, 0], [1, 1, 0.6]);
  });

  // ---------------------------------------------------------------- red chest with the gold sun-wheel, collar, shoulders
  part(body, (b) => {
    b.add(cyl(0.7, 0.56, 1.3, 32), M.armor, [0, 4.25, 0], [0, 0, 0], [1, 1, 0.74]);
    b.add(sph(0.7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.armor, [0, 4.9, 0], [0, 0, 0], [1, 0.32, 0.74]);
    b.add(torus(0.58, 0.05, 48), M.trim, [0, 3.66, 0], [Math.PI / 2, 0, 0], [1, 0.76, 1]);
    if (d.parts.chestEmblem) b.at([0, 4.4, 0.52], [-0.12, 0, 0], 1, () => {              // gold sun-wheel
      b.add(cyl(0.3, 0.3, 0.06, 36), M.armorDark, [0, 0, 0], [Math.PI / 2, 0, 0]);
      b.add(torus(0.3, 0.055, 40), M.trim, [0, 0, 0.03]);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.add(box(0.05, 0.22, 0.05), M.trim, [Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.04], [0, 0, a - Math.PI / 2]); }
      b.add(torus(0.1, 0.035, 24), M.trim, [0, 0, 0.05]);
      b.add(sph(0.08), M.glow, [0, 0, 0.07]);
    });
    b.add(cyl(0.42, 0.48, 0.28, 32), M.hood, [0, 5.02, 0]);                            // indigo collar
    for (const s of [-1, 1]) b.at([s * 0.82, 4.78, 0], [0, 0, -s * 0.18], d.size.shoulders, () => {   // layered pauldron
      b.add(sph(0.42, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.armor, [0, 0, 0], [1.15, 0.7, 1.05]);
      b.add(cyl(0.54, 0.6, 0.12, 32), M.armor, [s * 0.04, -0.12, 0]);
      b.add(torus(0.6, 0.045, 44), M.trim, [s * 0.04, -0.18, 0], [Math.PI / 2, 0, 0]);
      b.add(torus(0.45, 0.035, 40), M.trim, [0, 0.0, 0], [Math.PI / 2, 0, 0], [1.15, 1.05, 1]);
    });
  });

  // ---------------------------------------------------------------- long arms: navy sleeves, red bracers, red gloves
  const makeArm = (s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.92, 4.6, 0);
    part(pivot, (b) => {
      b.add(cyl(0.17, 0.15, 1.0), M.suit, [0, -0.5, 0]);
      b.add(cyl(0.22, 0.2, 0.75), M.armor, [0, -1.35, 0]);                               // bracer
      for (const y of [-0.99, -1.71]) b.add(cyl(0.235, 0.235, 0.1), M.trim, [0, y, 0]);
      diamond(b, M.trim, s * 0.15, -1.35, 0.16, 0.16, 0.34, 0.03);
      b.at([0, -1.98, 0.02], [0, 0, 0], d.size.hands, () => {
        b.add(sph(0.21), M.gloves, [0, 0, 0], [0.9, 1.2, 1]);                           // glove
        b.add(capsule(0.08, 0.12), M.gloves, [-s * 0.17, 0.05, 0.1], [0, 0, s * 0.5]);  // thumb
      });
    });
    body.add(pivot); return pivot;
  };
  const armL = makeArm(-1), armR = makeArm(1);

  // ---------------------------------------------------------------- hood: empty dark opening, gold ring + gem, gold side bars
  const head = new THREE.Group(); head.position.set(0, 5.12, 0.02); head.scale.setScalar(d.size.hood); body.add(head);
  part(head, (b) => {
    const prof = [[0.05, 1.42], [0.34, 1.35], [0.56, 1.12], [0.64, 0.78], [0.62, 0.38], [0.54, 0.05], [0.5, -0.08]];
    b.add(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 40, 0.78, Math.PI * 2 - 1.56), M.hood, [0, 0, -0.03], [0, 0, 0], [1, 1, 1.05]);
    b.add(sph(0.46, 28, 18), M.void, [0, 0.62, 0.02], [0, 0, 0], [1, 1.3, 0.72]);      // dark empty face
    if (d.parts.crest) {
      b.add(torus(0.13, 0.045, 32), M.trim, [0, 1.18, 0.5], [-0.35, 0, 0]);
      b.add(sph(0.095), M.glow, [0, 1.18, 0.5], [0, 0, 0], [1, 1, 0.6]);
    }
    if (d.parts.sideBars) for (const s of [-1, 1]) {
      b.add(box(0.09, 0.62, 0.14), M.trim, [s * 0.74, 0.72, 0.02]);
      b.add(box(0.12, 0.08, 0.16), M.trim, [s * 0.68, 0.55, 0.02]);
    }
  });

  // ---------------------------------------------------------------- long indigo cape with pointed hem, gold border, centre line and ring
  const W = 1.55, L = 4.7;
  const capeGeo = new THREE.PlaneGeometry(W, L, 44, 110);
  capeGeo.translate(0, -L / 2, 0);
  {
    const p = capeGeo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
    const bottom = (x) => -L + (Math.abs(x) / (W / 2)) * 0.45;   // V-shaped hem, tip at the centre
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i); let y = p.getY(i);
      const bt = bottom(x); if (y < bt) { y = bt; p.setY(i, y); }
      const ring = Math.abs(Math.hypot(x, y + 1.25) - 0.19) < 0.03;
      const line = Math.abs(x) < 0.025 && ((y < -1.47 && y > bt + 0.35) || (y > -1.03 && y < -0.45));
      const dd = Math.abs(x) * 1.2 + Math.abs(y - (bt + 0.22));
      const diam = dd < 0.12 && dd > 0.07;
      const border = Math.abs(x) > W / 2 - 0.08 || y - bt < 0.08;
      const chevron = ((Math.abs(x) * 0.9 - y) % 0.9 + 0.9) % 0.9 < 0.32;
      if (border || ring || line || diam) c.setHex(C.trim);
      else { c.setHex(C.cape); if (chevron) c.multiplyScalar(0.82); }
      col.set([c.r, c.g, c.b], i * 3);
    }
    capeGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    capeGeo.computeVertexNormals();
  }
  const cape = new THREE.Mesh(capeGeo, M.cape); cape.position.set(0, 5.02, -0.6); cape.userData.noOutline = true;
  cape.visible = d.parts.cape;
  body.add(cape);
  const capeBase = capeGeo.attributes.position.array.slice();

  // ---------------------------------------------------------------- power stones (3 per shard) orbit the hero
  const orbit = new THREE.Group(); orbit.position.y = 3.2; body.add(orbit);
  const stones = [];
  for (let k = 0; k < 12; k++) {
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), M.glow); st.userData.noOutline = true;
    const a = (k / 12) * Math.PI * 2; st.position.set(Math.cos(a) * 1.5, 0, Math.sin(a) * 1.5);
    st.visible = false; orbit.add(st); stones.push(st);
  }

  addOutline(root);
  root.traverse((o) => { if (o.isMesh && o.material !== outlineMat) { o.castShadow = true; o.receiveShadow = true; } });
  root.scale.setScalar(2.45 * d.size.height);   // ≈ 16 m tall at height 1

  // ---------------------------------------------------------------- sand trickling off the hero (world space)
  const TN = 100, tp = new Float32Array(TN * 3).fill(-9999), tl = [];
  for (let i = 0; i < TN; i++) tl.push({ life: Math.random() * 1.8, vy: 0 });
  const trickleGeo = new THREE.BufferGeometry(); trickleGeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  const trickle = new THREE.Points(trickleGeo, new THREE.PointsMaterial({ color: 0xf0c890, size: 0.12, transparent: true, opacity: 0.8, depthWrite: false }));
  trickle.frustumCulled = false;
  const emitters = [[0.85, 4.8, 0], [-0.85, 4.8, 0], [0, 1.6, 0.6], [0.6, 1.6, 0], [-0.6, 1.6, 0], [0, 0.6, -0.5]].map((p) => new THREE.Vector3(...p));
  const tmp = new THREE.Vector3(), jitter = new THREE.Vector3();

  let phase = 0, lastSign = 1;
  function update(dt, speed01, t, onStep, dir = 1) {
    phase += dt * (4.4 + speed01 * 3.6) * (speed01 > 0.02 ? 1 : 0) * dir;
    const sw = Math.sin(phase) * 0.55 * speed01;
    legL.rotation.x = sw; legR.rotation.x = -sw;
    armL.rotation.x = -sw * 0.8; armR.rotation.x = sw * 0.8;
    armL.rotation.z = -0.08 - Math.sin(t * 1.6) * 0.02; armR.rotation.z = 0.08 + Math.sin(t * 1.6) * 0.02;
    body.position.y = Math.abs(Math.cos(phase)) * 0.1 * speed01 + Math.sin(t * 2) * 0.02;
    body.rotation.z = Math.sin(phase) * 0.03 * speed01;
    body.rotation.x = speed01 * 0.06 * dir;
    head.rotation.y = Math.sin(t * 0.6) * 0.1 * (1 - speed01);
    const sign = Math.sign(Math.sin(phase));
    if (speed01 > 0.15 && sign !== lastSign && onStep) onStep(sign > 0 ? legL : legR);
    lastSign = sign;

    const arr = capeGeo.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = capeBase[i], drop = -capeBase[i + 1];
      arr[i + 2] = -drop * 0.14 - Math.pow(drop, 1.3) * (0.02 + speed01 * 0.18) + Math.sin(x * 3 + t * 4 - drop * 1.6) * 0.03 * drop * (0.3 + speed01);
    }
    capeGeo.attributes.position.needsUpdate = true; capeGeo.computeVertexNormals();

    orbit.rotation.y += dt * 1.2;
    stones.forEach((s, k) => { s.rotation.y += dt * 2; s.position.y = Math.sin(t * 2 + k * 1.7) * 0.4; });

    root.updateMatrixWorld();
    for (let i = 0; i < TN; i++) {
      const p = tl[i]; p.life += dt;
      if (p.life > 1.8) {
        p.life = 0; p.vy = 0;
        tmp.copy(emitters[i % emitters.length]).add(jitter.set((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)).applyMatrix4(root.matrixWorld);
        tp[i * 3] = tmp.x; tp[i * 3 + 1] = tmp.y; tp[i * 3 + 2] = tmp.z;
      } else { p.vy -= 14 * dt; tp[i * 3 + 1] += p.vy * dt; }
    }
    trickleGeo.attributes.position.needsUpdate = true;
  }
  function setPower(n) {
    M.glow.emissiveIntensity = 1.8 + n * 0.8;
    stones.forEach((s, k) => { s.visible = k < n * 3; });
  }
  function dispose() {
    root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== outlineMat) o.material.dispose(); } });
    trickleGeo.dispose(); trickle.material.dispose();
  }
  return { group: root, trickle, update, setPower, dispose };
}
