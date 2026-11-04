// golem.js — Kharu, the Sand Warden (original design).
// Style: a clean "toy-like" stylized hero — bold flat colour blocks, cel (toon) shading with 3 light bands,
// chunky friendly proportions (big hood, big gauntlet hands, short sturdy legs) and a dark outline.
// Built only from primitives; the toon light ramp is generated in code (no image files).
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, paint } from './util.js';

// 3-step light ramp for cel shading, created in code
const ramp = (() => {
  const t = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 170, 170, 170, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t;
})();

/** Toon material + a soft fresnel rim so the hero reads clearly against the sand. */
let rimId = 0;
function toon(color, { emissive = 0x000000, emissiveIntensity = 1, rim = 0.22, rimColor = 0xdff4ff, side = THREE.FrontSide, vertexColors = false } = {}) {
  const m = new THREE.MeshToonMaterial({ color, gradientMap: ramp, emissive, emissiveIntensity, side, vertexColors });
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
  uniforms: { thickness: { value: 0.035 }, color: { value: new THREE.Color(0x1b1030) } },
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

/** Everything the in-game character editor can change. */
export const DEFAULT_DESIGN = {
  colors: { armor: '#d8392b', armorDark: '#a8221c', trim: '#f6c23e', hood: '#3d3fa3', mask: '#d99a24', visor: '#bff8ff',
    gloves: '#9cc9ee', suit: '#262a5e', belt: '#6b3a1e', gem: '#2ac8ff', cape: '#3d3fa3' },
  size: { height: 1, hood: 1, shoulders: 1, hands: 1 },
  parts: { crest: true, cape: true, tabard: true, shoulderPlates: true, chestEmblem: true },
};
export function normalizeDesign(d) {
  const D = DEFAULT_DESIGN, o = d || {};
  return { colors: { ...D.colors, ...(o.colors || {}) }, size: { ...D.size, ...(o.size || {}) }, parts: { ...D.parts, ...(o.parts || {}) } };
}

export function createGolem(designIn) {
  const d = normalizeDesign(designIn);
  const h = (c) => new THREE.Color(c).getHex();
  const C = { red: h(d.colors.armor), redDeep: h(d.colors.armorDark), gold: h(d.colors.trim), hood: h(d.colors.hood), hoodIn: 0x14123a, steel: h(d.colors.gloves), navy: h(d.colors.suit), leather: h(d.colors.belt), cape: h(d.colors.cape) };
  const M = {
    red: toon(C.red), redDeep: toon(C.redDeep), gold: toon(C.gold, { rim: 0.3, rimColor: 0xfff4d0 }),
    hood: toon(C.hood, { side: THREE.DoubleSide }), hoodIn: new THREE.MeshBasicMaterial({ color: C.hoodIn }),
    steel: toon(C.steel), navy: toon(C.navy), leather: toon(C.leather),
    visor: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: h(d.colors.visor), emissiveIntensity: 1.8 }),
    mask: toon(h(d.colors.mask), { rim: 0.12, rimColor: 0xfff0c0 }),
    gem: new THREE.MeshStandardMaterial({ color: h(d.colors.gem), emissive: h(d.colors.gem), emissiveIntensity: 1.8, roughness: 0.2 }),
    cape: toon(0xffffff, { vertexColors: true, side: THREE.DoubleSide, rim: 0.12 }),
  };
  const cyl = (rt, rb, h, s = 24) => new THREE.CylinderGeometry(rt, rb, h, s);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const sph = (r, w = 28, h = 18, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
  const torus = (r, t, ts = 40, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 10, ts, arc);
  const capsule = (r, l) => new THREE.CapsuleGeometry(r, l, 8, 20);
  const part = (parent, fn) => { const b = new Batch(); fn(b); const g = b.build(); parent.add(g); return g; };

  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  // ---------------------------------------------------------------- short sturdy legs with pale armour
  const makeLeg = (s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.42, 1.65, 0);
    part(pivot, (b) => {
      b.add(capsule(0.3, 0.5), M.navy, [0, -0.45, 0]);                                  // thigh
      b.add(sph(0.26), M.gold, [0, -0.9, 0.1], [0, 0, 0], [1, 0.85, 0.8]);              // knee cap
      b.add(cyl(0.34, 0.3, 0.6), M.steel, [0, -1.18, 0]);                               // greave
      b.add(torus(0.33, 0.045), M.gold, [0, -0.9, 0], [Math.PI / 2, 0, 0]);
      b.add(sph(0.36, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.navy, [0, -1.55, 0.12], [0, 0, 0], [1, 0.55, 1.45]);   // boot
      b.add(cyl(0.37, 0.37, 0.08), M.gold, [0, -1.56, 0.12], [0, 0, 0], [1, 1, 1.45]);   // sole trim
    });
    body.add(pivot); return pivot;
  };
  const legL = makeLeg(-1), legR = makeLeg(1);

  // ---------------------------------------------------------------- body: red armour with bold gold trims
  part(body, (b) => {
    b.add(cyl(0.82, 0.98, 0.9, 32), M.redDeep, [0, 1.65, 0]);                            // skirt
    b.add(torus(0.96, 0.06), M.gold, [0, 1.22, 0], [Math.PI / 2, 0, 0]);
    if (d.parts.tabard) {
      b.add(box(0.62, 1.05, 0.1), M.red, [0, 1.35, 0.9], [-0.1, 0, 0]);                 // front tabard
      b.add(box(0.7, 0.08, 0.12), M.gold, [0, 0.86, 0.95], [-0.1, 0, 0]);
      for (const x of [-0.35, 0.35]) b.add(box(0.07, 1.05, 0.12), M.gold, [x, 1.35, 0.91], [-0.1, 0, 0]);
    }
    b.add(cyl(0.84, 0.84, 0.28, 32), M.leather, [0, 2.15, 0]);                           // belt
    b.add(box(0.5, 0.38, 0.14), M.gold, [0, 2.15, 0.84]);                               // buckle
    b.add(sph(0.12), M.gem, [0, 2.15, 0.93], [0, 0, 0], [1, 1, 0.6]);
    b.add(sph(1, 32, 22), M.red, [0, 2.95, 0], [0, 0, 0], [0.98, 0.82, 0.78]);          // rounded chest
    b.add(torus(0.8, 0.07, 48), M.gold, [0, 2.45, 0], [Math.PI / 2, 0, 0], [1.2, 0.98, 1]);
    // gold chest plate with a sun emblem (original crest)
    if (d.parts.chestEmblem) {
      b.add(sph(0.55, 28, 16), M.gold, [0, 3.05, 0.55], [0, 0, 0], [1.05, 0.95, 0.4]);
      b.add(cyl(0.2, 0.2, 0.1, 28), M.redDeep, [0, 3.05, 0.78], [Math.PI / 2, 0, 0]);
      b.add(sph(0.12), M.gem, [0, 3.05, 0.83], [0, 0, 0], [1, 1, 0.6]);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.add(box(0.06, 0.16, 0.05), M.redDeep, [Math.cos(a) * 0.32, 3.05 + Math.sin(a) * 0.32, 0.8], [0, 0, a + Math.PI / 2]); }
    }
    // rounded shoulder pads
    for (const s of [-1, 1]) {
      b.at([s * 1.15, 3.38, 0], [0, 0, -s * 0.28], d.size.shoulders, () => {
        b.add(sph(0.72, 28, 16), M.red, [0, 0, 0], [0, 0, 0], [1.15, 0.78, 1.05]);
        b.add(torus(0.72, 0.085, 40), M.gold, [0, -0.21, 0], [Math.PI / 2, 0, 0], [1.15, 1.05, 1]);
        if (d.parts.shoulderPlates) b.add(box(0.5, 0.08, 0.5), M.gold, [0, 0.52, 0]);
      });
    }
  });

  // ---------------------------------------------------------------- arms with big friendly gauntlets
  const makeArm = (s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 1.25, 3.15, 0);
    part(pivot, (b) => {
      b.add(capsule(0.24, 0.55), M.navy, [0, -0.45, 0]);                                 // upper arm
      b.add(cyl(0.36, 0.3, 0.55), M.steel, [0, -1.0, 0]);                               // gauntlet cuff
      b.add(torus(0.35, 0.045), M.gold, [0, -0.75, 0], [Math.PI / 2, 0, 0]);
      b.at([0, -1.48, 0.04], [0, 0, 0], d.size.hands, () => {
        b.add(sph(0.42, 28, 18), M.steel, [0, 0, 0], [0, 0, 0], [0.95, 1, 1.05]);       // big hand
        b.add(capsule(0.12, 0.18), M.steel, [-s * 0.36, 0.08, 0.18], [0, 0, s * 0.6]);  // thumb
        b.add(box(0.5, 0.08, 0.1), M.gold, [0, 0.23, 0.32]);                            // knuckle band
      });
    });
    body.add(pivot); return pivot;
  };
  const armL = makeArm(-1), armR = makeArm(1);

  // ---------------------------------------------------------------- big hood with a gold mask and glowing visor
  const head = new THREE.Group(); head.position.set(0, 4.0, 0.05); head.scale.setScalar(d.size.hood); body.add(head);
  part(head, (b) => {
    const hood = new THREE.LatheGeometry([[0.05, 1.35], [0.4, 1.3], [0.78, 1.05], [0.95, 0.65], [0.98, 0.2], [0.9, -0.2], [0.78, -0.4]].map(([x, y]) => new THREE.Vector2(x, y)), 40, 0.95, Math.PI * 2 - 1.9);   // open at the front for the face
    b.add(hood, M.hood, [0, 0, -0.05], [0, 0, 0], [1, 1, 1.05]);                        // hood shell
    b.add(cyl(0.95, 0.9, 0.3, 40), M.hood, [0, -0.35, -0.02]);                         // draped hood collar
    b.add(sph(0.62, 28, 18), M.hoodIn, [0, 0.36, 0.0], [0, 0, 0], [1, 1.08, 0.62]);   // dark opening
    b.add(sph(0.56, 28, 18, 0, Math.PI, 0, Math.PI), M.mask, [0, 0.26, 0.32], [0, 0, 0], [0.92, 1.05, 0.7]);   // mask (front half)
    b.add(box(0.22, 0.06, 0.06), M.visor, [-0.18, 0.4, 0.72], [0, 0, -0.14]);
    b.add(box(0.22, 0.06, 0.06), M.visor, [0.18, 0.4, 0.72], [0, 0, 0.14]);                              // glowing visor slit
    b.add(box(0.05, 0.36, 0.05), M.hoodIn, [0, 0.12, 0.73]);                              // mask centre line
    if (d.parts.crest) b.at([0, 1.0, 0.62], [-0.35, 0, 0], 1, () => {                     // gold sun-fan crest on the hood
      b.add(box(0.62, 0.55, 0.1), M.gold, [0, 0.1, 0]);
      for (let k = 0; k < 5; k++) b.add(box(0.12, 0.32, 0.1), M.gold, [(k - 2) * 0.17, 0.48 + (k % 2) * 0.06, 0], [0, 0, (2 - k) * 0.18]);
      b.add(sph(0.11), M.gem, [0, 0.1, 0.07], [0, 0, 0], [1, 1, 0.6]);
    });
    for (const s of [-1, 1]) b.add(box(0.1, 0.9, 0.1), M.gold, [s * 0.88, 0.25, 0.32], [0, 0, s * 0.05]);   // gold hood trims
  });

  // ---------------------------------------------------------------- cape (indigo with a gold hem)
  const capeGeo = paint(new THREE.PlaneGeometry(1.9, 3.0, 14, 26), (x, y, z, c) => c.setHex(y < -1.3 || Math.abs(x) > 0.84 ? C.gold : (Math.abs(y - 0.2) < 0.06 ? C.gold : C.cape)));
  capeGeo.translate(0, -1.5, 0);
  const cape = new THREE.Mesh(capeGeo, M.cape); cape.position.set(0, 3.55, -0.84); cape.userData.noOutline = true;
  cape.visible = d.parts.cape;
  body.add(cape);
  const capeBase = capeGeo.attributes.position.array.slice();

  // ---------------------------------------------------------------- power stones (3 per shard) orbit the hero
  const orbit = new THREE.Group(); orbit.position.y = 2.4; body.add(orbit);
  const stones = [];
  for (let k = 0; k < 12; k++) {
    const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.12, 0), M.gem); st.userData.noOutline = true;
    const a = (k / 12) * Math.PI * 2; st.position.set(Math.cos(a) * 1.8, 0, Math.sin(a) * 1.8);
    st.visible = false; orbit.add(st); stones.push(st);
  }

  addOutline(root);
  root.traverse((o) => { if (o.isMesh && o.material !== outlineMat) { o.castShadow = true; o.receiveShadow = true; } });
  root.scale.setScalar(2.9 * d.size.height);   // ≈ 16 m tall at height 1

  // ---------------------------------------------------------------- sand trickling off the hero (world space)
  const TN = 120, tp = new Float32Array(TN * 3).fill(-9999), tl = [];
  for (let i = 0; i < TN; i++) tl.push({ life: Math.random() * 1.8, vy: 0 });
  const trickleGeo = new THREE.BufferGeometry(); trickleGeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  const trickle = new THREE.Points(trickleGeo, new THREE.PointsMaterial({ color: 0xf0c890, size: 0.14, transparent: true, opacity: 0.85, depthWrite: false }));
  trickle.frustumCulled = false;
  const emitters = [[1.05, 3.4, 0], [-1.05, 3.4, 0], [0, 4.4, -0.6], [0.6, 2.2, 0.5], [-0.6, 2.2, 0.5], [0, 1.2, 0]].map((p) => new THREE.Vector3(...p));
  const tmp = new THREE.Vector3(), jitter = new THREE.Vector3();

  let phase = 0, lastSign = 1;
  function update(dt, speed01, t, onStep, dir = 1) {
    phase += dt * (5 + speed01 * 4) * (speed01 > 0.02 ? 1 : 0) * dir;
    const sw = Math.sin(phase) * 0.65 * speed01;
    legL.rotation.x = sw; legR.rotation.x = -sw;
    armL.rotation.x = -sw * 0.9; armR.rotation.x = sw * 0.9;
    armL.rotation.z = -0.12 - Math.sin(t * 1.6) * 0.03; armR.rotation.z = 0.12 + Math.sin(t * 1.6) * 0.03;
    body.position.y = Math.abs(Math.cos(phase)) * 0.14 * speed01 + Math.sin(t * 2) * 0.03;
    body.rotation.z = Math.sin(phase) * 0.05 * speed01;
    body.rotation.x = speed01 * 0.08 * dir;
    head.rotation.y = Math.sin(t * 0.6) * 0.12 * (1 - speed01);
    head.rotation.z = Math.sin(phase) * 0.04 * speed01;
    const sign = Math.sign(Math.sin(phase));
    if (speed01 > 0.15 && sign !== lastSign && onStep) onStep(sign > 0 ? legL : legR);
    lastSign = sign;

    const arr = capeGeo.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = capeBase[i], drop = -capeBase[i + 1];
      arr[i + 2] = -Math.pow(drop, 1.3) * (0.08 + speed01 * 0.4) + Math.sin(x * 2.5 + t * 5 - drop * 2) * 0.05 * drop * (0.35 + speed01);
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
    M.gem.emissiveIntensity = 1.8 + n * 1.0;
    M.visor.emissiveIntensity = 1.8 + n * 0.5;
    stones.forEach((s, k) => { s.visible = k < n * 3; });
  }
  function dispose() {
    root.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material !== outlineMat) o.material.dispose(); } });
    trickleGeo.dispose(); trickle.material.dispose();
  }
  return { group: root, trickle, update, setPower, dispose };
}
