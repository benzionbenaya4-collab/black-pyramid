// golem.js — Kharu, the Sand Warden: an original magical sand golem built only from primitives.
// Style goals (stylized action-game look): bold shape language — massive boulder shoulders and fists,
// narrow waist, long legs — smooth shading, a fresnel rim light that makes him pop off the background,
// glowing magic joints that "hold" the stone parts together, a floating gold crown ring and drifting stones.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, rockGeometry, paint } from './util.js';

/** Smooth-shaded rock: noise-displaced icosphere with welded vertices so lighting is soft. */
function smoothRock(r, detail = 2, seed = 1, amp = 0.1) {
  const g = rockGeometry(r, detail, seed, amp, 1.3);
  g.deleteAttribute('normal'); if (g.attributes.uv) g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4); m.computeVertexNormals(); return m;
}

/** Adds a fresnel rim light + a soft top-to-bottom gradient to a standard material (the "game character" look). */
let rimId = 0;
function stylize(mat, rimColor = 0xffd9a0, rim = 0.55) {
  const id = 'rim' + (rimId++);
  mat.customProgramCacheKey = () => id;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = { value: new THREE.Color(rimColor).multiplyScalar(rim) };
    sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float fres = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
      totalEmissiveRadiance += uRim * fres;`);
  };
  return mat;
}
const mk = (color, roughness, metalness = 0, extra = {}, rimColor, rim) =>
  stylize(new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }), rimColor, rim);

const outlineMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { thickness: { value: 0.02 }, color: { value: new THREE.Color(0x140a03) } },
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

export function createGolem() {
  const M = {
    sand: mk(0xd2ad7c, 0.85, 0, {}, 0xbfe0ff, 0.32),
    sandDark: mk(0x8f603a, 0.9, 0, {}, 0xbfe0ff, 0.28),
    gold: mk(0xffc443, 0.25, 1, { emissive: 0x4a2e00, emissiveIntensity: 0.5 }, 0xfff4d0, 0.35),
    red: mk(0xb31d1d, 0.7, 0, { side: THREE.DoubleSide }, 0xffb0a0, 0.22),
    lapis: mk(0x2752c4, 0.35, 0.3, {}, 0x9fc0ff, 0.3),
    leather: mk(0x5e3519, 0.8, 0, {}, 0xffb080, 0.3),
    glow: new THREE.MeshStandardMaterial({ color: 0x3a1e00, emissive: 0xffa82a, emissiveIntensity: 2.6 }),
    eye: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1b0, emissiveIntensity: 5 }),
    gem: new THREE.MeshStandardMaterial({ color: 0xff4a2a, emissive: 0xff3010, emissiveIntensity: 2, roughness: 0.15, metalness: 0.2 }),
    stripes: stylize(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.75, roughness: 0.32, emissive: 0x221400, side: THREE.DoubleSide }), 0xcfe4ff, 0.25),
    cape: stylize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), 0xcfe4ff, 0.18),
  };
  const cyl = (rt, rb, h, s = 20) => new THREE.CylinderGeometry(rt, rb, h, s);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const sph = (r, w = 24, h = 16, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
  const torus = (r, t, ts = 40, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 10, ts, arc);
  const part = (parent, fn) => { const b = new Batch(); fn(b); const g = b.build(); parent.add(g); return g; };
  const stripe = (geo, axis, n, a, bcol) => paint(geo, (x, y, z, c) => c.setHex(Math.floor(((axis === 'y' ? y : Math.atan2(z, x) / Math.PI) + 10) * n) % 2 ? a : bcol));

  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  // ---------------------------------------------------------------- legs: stone segments held by glowing joints
  const makeLeg = (s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.45, 2.95, 0);
    part(pivot, (b) => {
      b.add(smoothRock(0.4, 2, 10 + s), M.sand, [0, -0.62, 0], [0, 0, 0], [0.95, 1.55, 0.95]);     // thigh
      b.add(sph(0.2), M.glow, [0, -1.36, 0.02]);                                                  // knee joint
      b.add(smoothRock(0.34, 2, 12 + s), M.sandDark, [0, -2.0, 0], [0, 0, 0], [0.95, 1.6, 0.95]); // shin
      b.add(cyl(0.36, 0.3, 0.75, 24), M.gold, [0, -1.95, 0.02]);                                   // greave
      b.add(torus(0.34, 0.04), M.lapis, [0, -1.72, 0.02], [Math.PI / 2, 0, 0]);
      b.add(smoothRock(0.36, 2, 14 + s), M.sandDark, [0, -2.78, 0.2], [0, 0, 0], [1.05, 0.55, 1.45]); // boulder foot
      b.add(box(0.62, 0.12, 0.3), M.gold, [0, -2.66, 0.62]);
    });
    body.add(pivot); return pivot;
  };
  const legL = makeLeg(-1), legR = makeLeg(1);

  // ---------------------------------------------------------------- pelvis, loincloth, waist core
  part(body, (b) => {
    b.add(smoothRock(0.62, 2, 30), M.sandDark, [0, 3.0, 0], [0, 0, 0], [1.25, 0.6, 0.9]);         // pelvis boulder
    b.add(cyl(0.72, 0.74, 0.28, 32), M.leather, [0, 3.28, 0]);                                     // belt
    b.add(torus(0.73, 0.045), M.gold, [0, 3.42, 0], [Math.PI / 2, 0, 0]);
    b.add(torus(0.74, 0.045), M.gold, [0, 3.14, 0], [Math.PI / 2, 0, 0]);
    b.add(cyl(0.26, 0.26, 0.1, 28), M.gold, [0, 3.28, 0.72], [Math.PI / 2, 0, 0]);                 // buckle
    b.add(sph(0.12), M.gem, [0, 3.28, 0.78]);
    for (const z of [1, -1]) {                                                                     // red loincloth flaps
      const flap = paint(new THREE.PlaneGeometry(0.7, 1.5, 4, 8), (x, y, zz, c) => c.setHex(y < -0.6 || Math.abs(x) > 0.28 ? 0xd9a531 : (Math.abs(y + 0.1) < 0.07 ? 0x2752c4 : 0xb31d1d)));
      b.add(flap, M.stripes, [0, 2.4, z * 0.66], [z * -0.12, z > 0 ? 0 : Math.PI, 0]);
    }
    b.add(torus(0.36, 0.07), M.glow, [0, 3.62, 0], [Math.PI / 2, 0, 0]);                           // glowing waist seam
    b.add(cyl(0.42, 0.5, 0.5, 20), M.sand, [0, 3.75, 0]);                                         // narrow waist
  });

  // ---------------------------------------------------------------- massive chest with glowing core
  part(body, (b) => {
    b.add(smoothRock(1, 3, 40, 0.07), M.sand, [0, 4.6, -0.02], [0, 0, 0], [1.28, 0.95, 0.82]);    // boulder chest
    const sh = new THREE.Shape();
    sh.moveTo(-0.72, 0.42); sh.quadraticCurveTo(0, 0.56, 0.72, 0.42); sh.quadraticCurveTo(0.8, -0.2, 0, -0.62); sh.quadraticCurveTo(-0.8, -0.2, -0.72, 0.42);
    b.add(new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3, curveSegments: 24 }), M.gold, [0, 4.68, 0.6], [-0.15, 0, 0]);
    b.add(torus(0.24, 0.06), M.gold, [0, 4.62, 0.79], [-0.15, 0, 0]);
    b.add(sph(0.2), M.gem, [0, 4.62, 0.8]);                                                        // the sun core
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {                                         // winged scarab
      b.add(box(0.55 - k * 0.1, 0.07, 0.04), k % 2 ? M.gold : M.lapis, [s * (0.43 + k * 0.03), 4.72 - k * 0.11, 0.77], [-0.15, 0, s * (0.28 + k * 0.12)]);
    }
    for (let k = 0; k < 4; k++) b.add(torus(0.58 + k * 0.12, 0.055, 40, Math.PI), [M.gold, M.lapis, M.red, M.gold][k], [0, 5.32 - k * 0.025, 0.04], [Math.PI / 2 + 0.4, 0, 0]);   // broad collar
    b.add(cyl(0.3, 0.34, 0.35, 20), M.sandDark, [0, 5.45, 0]);                                    // neck
    b.add(torus(0.3, 0.05), M.glow, [0, 5.36, 0], [Math.PI / 2, 0, 0]);
    // huge boulder shoulders with gold caps
    for (const s of [-1, 1]) {
      b.add(smoothRock(0.62, 2, 50 + s), M.sandDark, [s * 1.3, 5.12, 0], [0, 0, 0], [1, 0.9, 1]);
      b.at([s * 1.36, 5.42, 0], [0, 0, -s * 0.45], 1, () => {
        b.add(sph(0.62, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.gold, [0, 0, 0], [0, 0, 0], [1.08, 0.62, 1]);
        b.add(torus(0.62, 0.05), M.red, [0, 0.01, 0], [Math.PI / 2, 0, 0], [1.08, 1, 1]);
        b.add(sph(0.11), M.gem, [0, 0.4, 0]);
      });
    }
  });

  // ---------------------------------------------------------------- arms with giant boulder fists
  const makeArm = (s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 1.42, 4.95, 0);
    part(pivot, (b) => {
      b.add(sph(0.22), M.glow, [0, -0.1, 0]);                                                      // shoulder joint
      b.add(smoothRock(0.34, 2, 60 + s), M.sand, [0, -0.62, 0], [0, 0, 0], [0.95, 1.5, 0.95]);     // upper arm
      b.add(sph(0.2), M.glow, [0, -1.28, 0]);                                                      // elbow joint
      b.add(smoothRock(0.4, 2, 62 + s), M.sandDark, [0, -1.85, 0.02], [0, 0, 0], [1, 1.5, 1]);     // forearm
      b.add(cyl(0.44, 0.4, 0.55, 28), M.gold, [0, -1.92, 0.02]);                                   // bracer
      b.add(torus(0.42, 0.04), M.lapis, [0, -1.92, 0.02], [Math.PI / 2, 0, 0]);
      b.add(smoothRock(0.56, 2, 64 + s, 0.14), M.sandDark, [0, -2.65, 0.05], [0, 0, 0], [1, 0.92, 1.05]); // giant fist
      b.add(torus(0.5, 0.055), M.gold, [0, -2.38, 0.05], [Math.PI / 2, 0, 0], [1, 1.05, 1]);
      for (let k = 0; k < 3; k++) b.add(box(0.06, 0.32, 0.03), M.glow, [-0.2 + k * 0.2, -2.6, 0.58]);   // glowing knuckle runes
    });
    body.add(pivot); return pivot;
  };
  const armL = makeArm(-1), armR = makeArm(1);

  // ---------------------------------------------------------------- head with nemes and a floating crown ring
  const head = new THREE.Group(); head.position.set(0, 5.95, 0.08); body.add(head);
  part(head, (b) => {
    b.add(smoothRock(0.42, 2, 70, 0.06), M.sand, [0, 0, 0], [0, 0, 0], [0.95, 1.08, 1]);
    b.add(smoothRock(0.3, 1, 71, 0.1), M.sandDark, [0, 0.15, 0.3], [0, 0, 0], [1.6, 0.4, 0.6]);  // heavy brow
    for (const s of [-1, 1]) b.add(box(0.17, 0.06, 0.05), M.eye, [s * 0.15, 0.04, 0.42], [0, 0, s * -0.15]);   // slit eyes
    b.add(box(0.24, 0.035, 0.04), M.glow, [0, -0.2, 0.4]);                                        // glowing mouth seam
    b.add(stripe(new THREE.SphereGeometry(0.5, 40, 16, 0, Math.PI * 2, 0, Math.PI * 0.47), 'a', 10, 0xffc443, 0x2752c4), M.stripes, [0, 0.12, -0.04], [0, 0, 0], [1.05, 1, 1.12]);
    b.add(cyl(0.52, 0.53, 0.11, 32), M.gold, [0, 0.14, -0.04]);
    for (const s of [-1, 1]) b.add(stripe(new THREE.BoxGeometry(0.22, 1.05, 0.46, 1, 8, 1), 'y', 3.4, 0xffc443, 0x2752c4), M.stripes, [s * 0.5, -0.45, 0.04], [0, 0, s * 0.1]);
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.18, 0.52), new THREE.Vector3(0, 0.34, 0.6), new THREE.Vector3(0, 0.48, 0.55), new THREE.Vector3(0, 0.55, 0.62)]), 16, 0.045, 10), M.gold);   // cobra
    b.add(sph(0.08), M.gold, [0, 0.53, 0.62], [0, 0, 0], [1.4, 1.5, 0.5]);
    b.add(cyl(0.08, 0.11, 0.5, 14), M.gold, [0, -0.62, 0.26]);                                    // ceremonial beard
  });
  const crown = new THREE.Group(); crown.position.set(0, 6.75, 0.05); body.add(crown);
  part(crown, (b) => {
    b.add(torus(0.42, 0.045, 48), M.glow, [0, 0, 0], [Math.PI / 2, 0, 0]);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.add(new THREE.OctahedronGeometry(0.08, 0), M.gold, [Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42]); }
  });

  // ---------------------------------------------------------------- long cape
  const capeGeo = paint(new THREE.PlaneGeometry(2.1, 4.0, 16, 32), (x, y, z, c) => {
    const border = Math.abs(x) > 0.93 || y < -1.86;
    const d = Math.hypot(x, y - 0.7);
    const sun = d < 0.34 || (d > 0.43 && d < 0.48) || (Math.abs(y - 0.7) < 0.05 && Math.abs(x) < 0.8);
    c.setHex(border ? 0xd9a531 : sun ? 0xe8b440 : (y > 1.7 ? 0x2752c4 : 0xa01b1b));
  });
  capeGeo.translate(0, -2.0, 0);
  const cape = new THREE.Mesh(capeGeo, M.cape); cape.position.set(0, 5.35, -0.7); cape.userData.noOutline = true;
  body.add(cape);
  const capeBase = capeGeo.attributes.position.array.slice();

  // ---------------------------------------------------------------- drifting stones (always) + power stones (3 per shard)
  const drift = [];
  for (let k = 0; k < 5; k++) {
    const st = new THREE.Mesh(smoothRock(0.14 + (k % 3) * 0.05, 1, 80 + k, 0.2), M.sandDark); st.userData.noOutline = true;
    body.add(st); drift.push({ st, a: (k / 5) * Math.PI * 2, y: 4.2 + (k % 3) * 0.6 });
  }
  const orbit = new THREE.Group(); orbit.position.y = 3.7; body.add(orbit);
  const stones = [];
  for (let k = 0; k < 12; k++) {
    const st = new THREE.Mesh(smoothRock(0.12, 1, k, 0.25), M.gold); st.userData.noOutline = true;
    const a = (k / 12) * Math.PI * 2; st.position.set(Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9);
    st.visible = false; orbit.add(st); stones.push(st);
  }

  addOutline(root);
  root.traverse((o) => { if (o.isMesh && o.material !== outlineMat) { o.castShadow = true; o.receiveShadow = true; } });
  root.scale.setScalar(2.45);   // ≈ 17 m tall with the crown

  // ---------------------------------------------------------------- sand trickling off the body (world space)
  const TN = 160, tp = new Float32Array(TN * 3).fill(-9999), tl = [];
  for (let i = 0; i < TN; i++) tl.push({ life: Math.random() * 1.8, vy: 0 });
  const trickleGeo = new THREE.BufferGeometry(); trickleGeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  const trickle = new THREE.Points(trickleGeo, new THREE.PointsMaterial({ color: 0xe0b070, size: 0.14, transparent: true, opacity: 0.9, depthWrite: false }));
  trickle.frustumCulled = false;
  const emitters = [[1.35, 5.1, 0], [-1.35, 5.1, 0], [1.42, 2.3, 0], [-1.42, 2.3, 0], [0, 4.5, -0.7], [0.5, 4.0, 0.6], [-0.5, 4.0, 0.6], [0, 3.0, 0]].map((p) => new THREE.Vector3(...p));
  const tmp = new THREE.Vector3(), jitter = new THREE.Vector3();

  let phase = 0, lastSign = 1;
  function update(dt, speed01, t, onStep, dir = 1) {
    phase += dt * (3.6 + speed01 * 3.6) * (speed01 > 0.02 ? 1 : 0) * dir;
    const sw = Math.sin(phase) * 0.55 * speed01;
    legL.rotation.x = sw; legR.rotation.x = -sw;
    armL.rotation.x = -sw * 0.75; armR.rotation.x = sw * 0.75;
    armL.rotation.z = -0.08 - Math.sin(t * 1.4) * 0.025; armR.rotation.z = 0.08 + Math.sin(t * 1.4) * 0.025;
    body.position.y = Math.abs(Math.cos(phase)) * 0.12 * speed01 + Math.sin(t * 1.8) * 0.03;
    body.rotation.z = Math.sin(phase) * 0.03 * speed01;
    body.rotation.x = speed01 * 0.07 * dir;
    body.rotation.y = Math.sin(phase) * 0.05 * speed01;            // heavy shoulder sway
    head.rotation.y = Math.sin(t * 0.6) * 0.12 * (1 - speed01);
    crown.rotation.y = t * 0.8; crown.position.y = 6.75 + Math.sin(t * 2) * 0.05;
    drift.forEach((d, k) => { d.st.position.set(Math.cos(d.a + t * 0.5) * 1.3, d.y + Math.sin(t * 1.3 + k) * 0.15, -0.9 + Math.sin(d.a + t * 0.5) * 0.35); d.st.rotation.x = t + k; });
    const sign = Math.sign(Math.sin(phase));
    if (speed01 > 0.15 && sign !== lastSign && onStep) onStep(sign > 0 ? legL : legR);
    lastSign = sign;

    const arr = capeGeo.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = capeBase[i], drop = -capeBase[i + 1];
      arr[i + 2] = -Math.pow(drop, 1.25) * (0.06 + speed01 * 0.3) + Math.sin(x * 2.5 + t * 5 - drop * 1.8) * 0.045 * drop * (0.35 + speed01);
    }
    capeGeo.attributes.position.needsUpdate = true; capeGeo.computeVertexNormals();

    orbit.rotation.y += dt * 1.2;
    stones.forEach((s, k) => { s.rotation.x += dt * 2; s.position.y = Math.sin(t * 2 + k * 1.7) * 0.4; });
    M.glow.emissiveIntensity = glowBase * (0.85 + 0.15 * Math.sin(t * 3));

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
  let glowBase = 2.6;
  function setPower(n) {
    M.gem.emissiveIntensity = 2 + n * 1.2;
    M.gold.emissiveIntensity = 0.5 + n * 0.25;
    glowBase = 2.6 + n * 0.8;
    M.eye.emissiveIntensity = 5 + n;
    stones.forEach((s, k) => { s.visible = k < n * 3; });
  }
  return { group: root, trickle, update, setPower };
}
