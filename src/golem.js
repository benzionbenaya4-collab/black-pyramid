// golem.js — Kharu, the Sand Warden: an original sand golem built only from primitives.
// Clean heroic silhouette: few, large, readable shapes with clear colour blocks and a dark outline.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Batch, rockGeometry, paint } from './util.js';

const std = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true, ...extra });

/** Inverted-hull outline: a slightly inflated back-face copy in a dark colour gives every part a crisp edge. */
const outlineMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  uniforms: { thickness: { value: 0.028 }, color: { value: new THREE.Color(0x1a0d04) } },
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
    sand: std(0xdcaa68, 0.9), sandDark: std(0xa9743e, 0.95),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc64a, metalness: 0.9, roughness: 0.3, emissive: 0x6b4300, emissiveIntensity: 0.5, flatShading: true }),
    red: std(0xb01c1c, 0.75, 0, { side: THREE.DoubleSide }), lapis: std(0x2348a8, 0.4, 0.3), leather: std(0x5a3417),
    vein: new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xffa21e, emissiveIntensity: 1.6 }),
    eye: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0a0, emissiveIntensity: 4 }),
    gem: std(0xff3020, 0.2, 0.2, { emissive: 0xff2a10, emissiveIntensity: 1.5 }),
    stripes: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.35, emissive: 0x221400, flatShading: true }),
    cape: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
  };
  const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const sph = (r, w = 12, h = 8, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
  const torus = (r, t, ts = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, 6, ts, arc);
  const part = (parent, fn) => { const b = new Batch(); fn(b); const g = b.build(); parent.add(g); return g; };
  const stripe = (geo, axis, n, a, bcol) => paint(geo, (x, y, z, c) => c.setHex(Math.floor(((axis === 'y' ? y : Math.atan2(z, x) / Math.PI) + 10) * n) % 2 ? a : bcol));

  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  // ---------------------------------------------------------------- legs (long, heroic)
  const makeLeg = (s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.4, 3.0, 0);
    part(pivot, (b) => {
      b.add(cyl(0.36, 0.29, 1.45), M.sand, [0, -0.72, 0]);                              // thigh
      b.add(sph(0.27, 10, 8), M.gold, [0, -1.47, 0.04]);                                // knee
      b.add(cyl(0.29, 0.22, 1.35), M.sandDark, [0, -2.15, 0]);                          // shin
      b.add(cyl(0.33, 0.27, 0.9), M.gold, [0, -2.2, 0.02]);                             // greave
      b.add(torus(0.3, 0.035), M.lapis, [0, -2.2, 0.02], [Math.PI / 2, 0, 0]);
      b.add(box(0.5, 0.3, 0.92), M.leather, [0, -2.86, 0.16]);                          // foot
      b.add(box(0.52, 0.18, 0.28), M.gold, [0, -2.84, 0.6]);                            // toe cap
    });
    body.add(pivot); return pivot;
  };
  const legL = makeLeg(-1), legR = makeLeg(1);

  // ---------------------------------------------------------------- waist, skirt, torso, collar, shoulders
  part(body, (b) => {
    b.add(stripe(new THREE.CylinderGeometry(0.62, 0.98, 1.35, 16, 1, true), 'a', 8, 0xb01c1c, 0x8a1414), M.stripes, [0, 2.55, 0]);   // pleated skirt
    b.add(torus(0.97, 0.05, 28), M.gold, [0, 1.9, 0], [Math.PI / 2, 0, 0]);
    b.add(box(0.5, 1.15, 0.06), M.gold, [0, 2.5, 0.86], [-0.27, 0, 0]);                 // front apron
    for (let k = 0; k < 3; k++) b.add(box(0.46, 0.06, 0.03), M.lapis, [0, 2.75 - k * 0.3, 0.92 - k * 0.08], [-0.27, 0, 0]);
    b.add(cyl(0.66, 0.66, 0.3, 18), M.leather, [0, 3.25, 0]);                          // belt
    b.add(cyl(0.2, 0.2, 0.08, 18), M.gold, [0, 3.25, 0.66], [Math.PI / 2, 0, 0]);
    b.add(sph(0.08, 8, 6), M.gem, [0, 3.25, 0.71]);
    b.add(cyl(1.0, 0.62, 1.75, 8), M.sand, [0, 4.25, 0], [0, Math.PI / 8, 0], [1, 1, 0.72]);   // V-shaped torso
    // breastplate
    const sh = new THREE.Shape();
    sh.moveTo(-0.62, 0.38); sh.lineTo(0.62, 0.38); sh.quadraticCurveTo(0.7, -0.15, 0, -0.55); sh.quadraticCurveTo(-0.7, -0.15, -0.62, 0.38);
    b.add(new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 10 }), M.gold, [0, 4.5, 0.5], [-0.12, 0, 0]);
    b.add(new THREE.OctahedronGeometry(0.17, 0), M.gem, [0, 4.45, 0.66], [0, 0, 0], [1, 1.3, 0.6]);
    for (const s of [-1, 1]) b.add(box(0.5, 0.07, 0.03), M.lapis, [s * 0.36, 4.55, 0.64], [-0.12, 0, s * 0.35]);   // scarab wings
    veinsOn(b, [0, 4.1, 0], [0.75, 0.8, 0.5], 4, M.vein);
    // broad collar
    b.add(torus(0.5, 0.07, 28, Math.PI), M.gold, [0, 5.0, 0.05], [Math.PI / 2 + 0.35, 0, 0]);
    b.add(torus(0.64, 0.07, 28, Math.PI), M.lapis, [0, 4.97, 0.05], [Math.PI / 2 + 0.35, 0, 0]);
    b.add(torus(0.78, 0.07, 28, Math.PI), M.gold, [0, 4.94, 0.05], [Math.PI / 2 + 0.35, 0, 0]);
    b.add(cyl(0.24, 0.27, 0.35, 10), M.sand, [0, 5.12, 0]);                             // neck
    // shoulders: one bold gold dome each
    for (const s of [-1, 1]) b.at([s * 1.05, 4.95, 0], [0, 0, -s * 0.4], 1, () => {
      b.add(sph(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.gold, [0, 0, 0], [0, 0, 0], [1.1, 0.7, 1]);
      b.add(torus(0.5, 0.05, 24), M.red, [0, 0.01, 0], [Math.PI / 2, 0, 0], [1.1, 1, 1]);
    });
  });

  // ---------------------------------------------------------------- arms
  const makeArm = (s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 1.12, 4.85, 0);
    part(pivot, (b) => {
      b.add(cyl(0.27, 0.23, 1.2), M.sand, [0, -0.6, 0]);
      b.add(sph(0.23, 10, 8), M.sandDark, [0, -1.25, 0]);
      b.add(cyl(0.31, 0.27, 1.0, 12), M.gold, [0, -1.72, 0]);                          // bracer
      b.add(torus(0.29, 0.035), M.lapis, [0, -1.72, 0], [Math.PI / 2, 0, 0]);
      b.add(rockGeometry(0.37, 0, 3 + s, 0.12), M.sandDark, [0, -2.42, 0.03]);         // fist
    });
    body.add(pivot); return pivot;
  };
  const armL = makeArm(-1), armR = makeArm(1);

  // ---------------------------------------------------------------- head with striped nemes
  const head = new THREE.Group(); head.position.set(0, 5.62, 0.02); body.add(head);
  part(head, (b) => {
    b.add(rockGeometry(0.4, 1, 21, 0.05), M.sand, [0, 0, 0], [0, 0, 0], [0.95, 1.12, 1]);
    b.add(box(0.62, 0.1, 0.16), M.sandDark, [0, 0.12, 0.33]);                           // brow
    for (const s of [-1, 1]) b.add(box(0.15, 0.07, 0.04), M.eye, [s * 0.15, 0.03, 0.39]);
    b.add(box(0.08, 0.16, 0.08), M.sand, [0, -0.08, 0.4]);                              // nose
    b.add(stripe(new THREE.SphereGeometry(0.47, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.48), 'a', 9, 0xffc64a, 0x2348a8), M.stripes, [0, 0.1, -0.02], [0, 0, 0], [1.05, 1, 1.1]);
    b.add(cyl(0.49, 0.5, 0.1, 20), M.gold, [0, 0.13, -0.02]);                           // headband
    for (const s of [-1, 1]) b.add(stripe(new THREE.BoxGeometry(0.2, 0.95, 0.42, 1, 6, 1), 'y', 3.2, 0xffc64a, 0x2348a8), M.stripes, [s * 0.47, -0.42, 0.06], [0, 0, s * 0.08]);   // lappets
    b.add(cyl(0.035, 0.05, 0.3, 6), M.gold, [0, 0.33, 0.47], [0.3, 0, 0]);              // cobra
    b.add(sph(0.07, 8, 6), M.gold, [0, 0.48, 0.5], [0, 0, 0], [1.3, 1.4, 0.5]);
    b.add(cyl(0.07, 0.09, 0.45, 8), M.gold, [0, -0.6, 0.24]);                           // ceremonial beard
  });

  // ---------------------------------------------------------------- long cape
  const capeGeo = paint(new THREE.PlaneGeometry(1.8, 3.9, 14, 30), (x, y, z, c) => {
    const border = Math.abs(x) > 0.78 || y < -1.82;
    const d = Math.hypot(x, y - 0.6);
    const sun = d < 0.32 || (d > 0.4 && d < 0.45) || (Math.abs(y - 0.6) < 0.05 && Math.abs(x) < 0.7);
    c.setHex(border ? 0xd9a531 : sun ? 0xe8b440 : 0x9e1b1b);
  });
  capeGeo.translate(0, -1.95, 0);
  const cape = new THREE.Mesh(capeGeo, M.cape); cape.position.set(0, 4.98, -0.48); cape.userData.noOutline = true;
  body.add(cape);
  const capeBase = capeGeo.attributes.position.array.slice();

  // ---------------------------------------------------------------- orbiting power stones (3 per shard)
  const orbit = new THREE.Group(); orbit.position.y = 3.6; body.add(orbit);
  const stones = [];
  for (let k = 0; k < 12; k++) {
    const st = new THREE.Mesh(rockGeometry(0.11, 0, k, 0.3), M.gold); st.userData.noOutline = true;
    const a = (k / 12) * Math.PI * 2; st.position.set(Math.cos(a) * 1.6, 0, Math.sin(a) * 1.6);
    st.visible = false; orbit.add(st); stones.push(st);
  }

  addOutline(root);
  root.traverse((o) => { if (o.isMesh && o.material !== outlineMat) { o.castShadow = true; o.receiveShadow = true; } });
  root.scale.setScalar(2.6);   // ≈ 16 m tall

  // ---------------------------------------------------------------- sand trickling off the body (world space)
  const TN = 160, tp = new Float32Array(TN * 3).fill(-9999), tl = [];
  for (let i = 0; i < TN; i++) tl.push({ life: Math.random() * 1.8, vy: 0 });
  const trickleGeo = new THREE.BufferGeometry(); trickleGeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  const trickle = new THREE.Points(trickleGeo, new THREE.PointsMaterial({ color: 0xe0b070, size: 0.14, transparent: true, opacity: 0.9, depthWrite: false }));
  trickle.frustumCulled = false;
  const emitters = [[1.1, 4.9, 0], [-1.1, 4.9, 0], [1.1, 2.5, 0], [-1.1, 2.5, 0], [0, 4.2, -0.5], [0.4, 3.6, 0.5], [-0.4, 3.6, 0.5], [0, 1.9, 0]].map((p) => new THREE.Vector3(...p));
  const tmp = new THREE.Vector3(), jitter = new THREE.Vector3();

  let phase = 0, lastSign = 1;
  function update(dt, speed01, t, onStep, dir = 1) {
    phase += dt * (4 + speed01 * 4) * (speed01 > 0.02 ? 1 : 0) * dir;
    const sw = Math.sin(phase) * 0.6 * speed01;
    legL.rotation.x = sw; legR.rotation.x = -sw;
    armL.rotation.x = -sw * 0.8; armR.rotation.x = sw * 0.8;
    armL.rotation.z = -0.1 - Math.sin(t * 1.5) * 0.02; armR.rotation.z = 0.1 + Math.sin(t * 1.5) * 0.02;
    body.position.y = Math.abs(Math.cos(phase)) * 0.1 * speed01 + Math.sin(t * 2) * 0.025;
    body.rotation.z = Math.sin(phase) * 0.035 * speed01;
    body.rotation.x = speed01 * 0.06 * dir;
    head.rotation.y = Math.sin(t * 0.7) * 0.12 * (1 - speed01);
    const sign = Math.sign(Math.sin(phase));
    if (speed01 > 0.15 && sign !== lastSign && onStep) onStep(sign > 0 ? legL : legR);
    lastSign = sign;

    const arr = capeGeo.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = capeBase[i], drop = -capeBase[i + 1];
      arr[i + 2] = -Math.pow(drop, 1.25) * (0.06 + speed01 * 0.32) + Math.sin(x * 2.5 + t * 5 - drop * 1.8) * 0.045 * drop * (0.35 + speed01);
    }
    capeGeo.attributes.position.needsUpdate = true; capeGeo.computeVertexNormals();

    orbit.rotation.y += dt * 1.2;
    stones.forEach((s, k) => { s.rotation.x += dt * 2; s.position.y = Math.sin(t * 2 + k * 1.7) * 0.4; });

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
    M.gem.emissiveIntensity = 1.5 + n * 1.2;
    M.gold.emissiveIntensity = 0.5 + n * 0.3;
    M.vein.emissiveIntensity = 1.6 + n * 0.9;
    M.eye.emissiveIntensity = 4 + n;
    stones.forEach((s, k) => { s.visible = k < n * 3; });
  }
  return { group: root, trickle, update, setPower };
}

/** a few glowing energy veins wandering over an ellipsoid surface */
function veinsOn(b, c, r, count, mat) {
  let seed = 7; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let v = 0; v < count; v++) {
    let th = Math.PI * (0.6 + R() * 0.8) * (R() < 0.5 ? 1 : -1), ph = (R() - 0.5) * 1.4;
    const pts = [];
    for (let k = 0; k < 5; k++) {
      th += (R() - 0.5) * 0.5; ph += (R() - 0.5) * 0.5;
      pts.push(new THREE.Vector3(c[0] + Math.cos(ph) * Math.sin(th) * r[0] * 1.03, c[1] + Math.sin(ph) * r[1], c[2] + Math.cos(ph) * Math.cos(th) * r[2] * 1.03));
    }
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.03, 5), mat);
  }
}
