// golem.js — Kharu, the Sand Warden: an original, highly detailed sand golem built only from primitives.
import * as THREE from 'three';
import { Batch, rockGeometry, rng, paint } from './util.js';

const std = (color, roughness = 0.9, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true, ...extra });

export function createGolem() {
  const M = {
    sand: std(0xd9a35f, 0.95), sandDark: std(0xa8743d, 1), sandLight: std(0xeac283, 0.95),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.24, emissive: 0x6b4300, emissiveIntensity: 0.5 }),
    goldDark: new THREE.MeshStandardMaterial({ color: 0xc98f2a, metalness: 0.95, roughness: 0.35 }),
    red: std(0xa3161a, 0.8, 0, { side: THREE.DoubleSide }), redDark: std(0x6e0d10, 0.85, 0, { side: THREE.DoubleSide }),
    lapis: std(0x1f3f9a, 0.35, 0.4), leather: std(0x5a3417),
    vein: new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xffa21e, emissiveIntensity: 1.6 }),
    eye: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0a0, emissiveIntensity: 4 }),
    gemRed: std(0xff3020, 0.2, 0.2, { emissive: 0xff2a10, emissiveIntensity: 1.5 }),
    gemBlue: std(0x3a7aff, 0.2, 0.2, { emissive: 0x2a6aff, emissiveIntensity: 1.2 }),
    black: new THREE.MeshBasicMaterial({ color: 0x050302 }),
    stripes: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.3, emissive: 0x221400 }),
    cape: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
  };
  const R = rng(2024);
  const cyl = (rt, rb, h, s = 14) => new THREE.CylinderGeometry(rt, rb, h, s);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const sph = (r, w = 12, h = 8, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
  const torus = (r, t, rs = 6, ts = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
  const rock = (r, d = 1, amp = 0.16) => rockGeometry(r, d, Math.floor(R() * 1000), amp);
  const part = (parent, fn) => { const b = new Batch(); fn(b); const g = b.build(); parent.add(g); return g; };

  /** glowing energy veins: tubes that wander over an ellipsoid surface */
  function veins(b, center, radii, count, avoidFront = false) {
    for (let v = 0; v < count; v++) {
      let th = R() * Math.PI * 2, ph = (R() - 0.5) * 2.2;
      if (avoidFront && Math.abs(Math.sin(th)) > 0.6 && Math.cos(th) > 0) th += Math.PI;
      const pts = [];
      for (let k = 0; k < 6; k++) {
        th += (R() - 0.5) * 0.7; ph += (R() - 0.5) * 0.5;
        const d = new THREE.Vector3(Math.cos(ph) * Math.sin(th), Math.sin(ph), Math.cos(ph) * Math.cos(th));
        pts.push(new THREE.Vector3(center[0] + d.x * radii[0] * 1.02, center[1] + d.y * radii[1] * 1.02, center[2] + d.z * radii[2] * 1.02));
      }
      b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.022 + R() * 0.015, 5), M.vein);
    }
  }

  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  // ================================================================ legs
  const makeLeg = (s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.48, 1.62, 0);
    part(pivot, (b) => {
      b.add(rock(0.36), M.sand, [0, -0.42, 0], [0, 0, 0], [1, 1.35, 1]);
      b.add(rock(0.3), M.sandDark, [0, -1.05, 0], [0, 0, 0], [1, 1.2, 1]);
      b.add(sph(0.27, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.gold, [0, -0.82, 0.22], [Math.PI / 2, 0, 0]);   // knee cap
      for (let k = 0; k < 3; k++) b.add(box(0.42 - k * 0.06, 0.08, 0.08), k % 2 ? M.lapis : M.gold, [0, -0.6 + k * 0.1, 0.3 - k * 0.02]);
      for (let k = 0; k < 5; k++) b.add(sph(0.03, 6, 4), M.goldDark, [Math.cos(k * 0.8 - 1.6) * 0.27, -0.82 + Math.sin(k * 0.8 - 1.6) * 0.27, 0.27]);
      b.add(cyl(0.33, 0.29, 0.5, 18), M.gold, [0, -1.12, 0]);                                                  // greave
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; b.add(box(0.05, 0.42, 0.03), M.lapis, [Math.sin(a) * 0.32, -1.12, Math.cos(a) * 0.32], [0, a, 0]); }
      b.add(torus(0.335, 0.03, 6, 24), M.red, [0, -0.88, 0], [Math.PI / 2, 0, 0]);
      b.add(torus(0.3, 0.03, 6, 24), M.red, [0, -1.36, 0], [Math.PI / 2, 0, 0]);
      b.add(rock(0.35), M.sandDark, [0, -1.47, 0.16], [0, 0, 0], [0.85, 0.5, 1.4]);                             // foot
      for (let k = 0; k < 3; k++) b.add(rock(0.12, 0), M.sand, [-0.15 + k * 0.15, -1.52, 0.62]);
      b.add(box(0.64, 0.08, 1.1), M.leather, [0, -1.58, 0.16]);                                                   // sandal sole
      for (const z of [0.0, 0.35]) b.add(box(0.66, 0.06, 0.08), M.gold, [0, -1.42 + z * 0.1, z]);
      b.add(box(0.06, 0.06, 0.5), M.gold, [0, -1.36, 0.25]);
      veins(b, [0, -0.42, 0], [0.36, 0.48, 0.36], 2);
    });
    body.add(pivot); return pivot;
  };
  const legL = makeLeg(-1), legR = makeLeg(1);

  // ================================================================ torso, belt, skirt, collar, shoulders
  part(body, (b) => {
    b.add(rockGeometry(0.75, 2, 7, 0.1), M.sand, [0, 1.98, 0], [0, 0, 0], [1.05, 0.55, 0.8]);                    // hips
    b.add(rockGeometry(1, 2, 11, 0.11), M.sand, [0, 2.72, 0], [0, 0, 0], [0.95, 0.78, 0.62]);                   // chest
    for (let k = 0; k < 10; k++) {                                                                               // rocky back
      const a = Math.PI + (R() - 0.5) * 2.2, y = 2.3 + R() * 0.9;
      b.add(rock(0.18 + R() * 0.2, 0), R() < 0.5 ? M.sandDark : M.sandLight, [Math.sin(a) * 0.75, y, Math.cos(a) * 0.5]);
    }
    veins(b, [0, 2.72, 0], [0.95, 0.78, 0.62], 9, true);

    // belt
    b.add(cyl(0.86, 0.86, 0.3, 28), M.leather, [0, 2.02, 0]);
    for (const y of [1.87, 2.17]) b.add(torus(0.865, 0.03, 6, 32), M.gold, [0, y, 0], [Math.PI / 2, 0, 0]);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; b.add(box(0.16, 0.2, 0.04), M.gold, [Math.sin(a) * 0.88, 2.02, Math.cos(a) * 0.88], [0, a, 0]); }
    b.add(cyl(0.22, 0.22, 0.08, 20), M.gold, [0, 2.02, 0.9], [Math.PI / 2, 0, 0]);
    b.add(torus(0.16, 0.025, 6, 20), M.lapis, [0, 2.02, 0.95]);
    b.add(sph(0.09, 10, 8), M.gemRed, [0, 2.02, 0.96]);

    // pleated skirt
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      b.at([0, 0, 0], [0, a, 0], 1, () => b.add(box(0.19, 1.15, 0.05), k % 2 ? M.red : M.redDark, [0, 1.3, 0.97], [-0.27, 0, 0]));
    }
    b.at([0, 1.38, 1.03], [-0.2, 0, 0], 1, () => {                                                              // front apron
      b.add(box(0.56, 1.05, 0.05), M.gold, [0, 0, 0]);
      for (let k = 0; k < 6; k++) b.add(box(0.5, 0.05, 0.02), k % 2 ? M.red : M.lapis, [0, 0.35 - k * 0.13, 0.035]);
      for (let k = 0; k < 7; k++) b.add(cyl(0.02, 0.02, 0.16, 5), M.gold, [-0.24 + k * 0.08, -0.6, 0]);
      for (const s of [-1, 1]) { b.add(cyl(0.025, 0.03, 0.22, 6), M.gold, [s * 0.18, -0.38, 0.05]); b.add(sph(0.045, 8, 6), M.gold, [s * 0.18, -0.25, 0.06], [0, 0, 0], [1.2, 1, 0.5]); }
    });
    for (let k = 0; k < 3; k++) {                                                                                // rear tassels
      const x = -0.2 + k * 0.2;
      b.add(cyl(0.015, 0.015, 0.6, 4), M.red, [x, 1.62, -0.92]);
      b.add(sph(0.05, 8, 6), M.gold, [x, 1.3, -0.93]);
    }

    // breastplate with winged scarab
    const shape = new THREE.Shape();
    shape.moveTo(-0.6, 0.42); shape.lineTo(0.6, 0.42); shape.quadraticCurveTo(0.72, -0.1, 0, -0.5); shape.quadraticCurveTo(-0.72, -0.1, -0.6, 0.42);
    const plate = new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 16 });
    b.add(plate, M.gold, [0, 2.78, 0.5], [-0.08, 0, 0]);
    b.add(new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false, curveSegments: 16 }), M.red, [0, 2.8, 0.6], [-0.08, 0, 0], [0.8, 0.8, 1]);
    b.add(new THREE.OctahedronGeometry(0.15, 0), M.gemRed, [0, 2.78, 0.68], [0, 0, 0], [1, 1.3, 0.6]);
    b.add(torus(0.17, 0.025, 6, 20), M.gold, [0, 2.78, 0.66]);
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
      b.add(box(0.07, 0.24 + k * 0.05, 0.02), k % 2 ? M.lapis : M.gold, [s * (0.22 + k * 0.065), 2.82 - k * 0.012, 0.665], [0, 0, s * (1.15 + k * 0.08)]);
    }
    for (let k = 0; k < 12; k++) {                                                                               // rivets around plate
      const t = k / 11, x = -0.55 + t * 1.1;
      b.add(sph(0.025, 6, 4), M.goldDark, [x, 3.19, 0.6]);
    }
    for (let k = 0; k < 4; k++) b.add(sph(0.05, 8, 6), M.gemBlue, [-0.3 + k * 0.2, 2.5, 0.64]);
    b.add(box(0.22, 1.9, 1.15), M.red, [0, 2.6, 0], [0, 0, 0.7]);                                               // sash

    // usekh broad collar
    [[0.55, M.gold], [0.66, M.lapis], [0.77, M.red], [0.88, M.gold]].forEach(([r, m], i) =>
      b.add(torus(r, 0.055, 6, 32, Math.PI), m, [0, 3.3 - i * 0.025, 0.03], [Math.PI / 2 + 0.35, 0, 0]));
    for (let k = 0; k <= 16; k++) {
      const a = (k / 16) * Math.PI, rr = 0.97;
      b.add(new THREE.ConeGeometry(0.04, 0.12, 6), k % 2 ? M.red : M.gold, [Math.cos(a) * rr, 3.27 - Math.sin(a) * rr * 0.34 - 0.06, 0.03 + Math.sin(a) * rr * 0.94], [Math.PI, 0, 0]);
    }
    b.add(torus(0.5, 0.05, 6, 28), M.gold, [0, 3.33, 0], [Math.PI / 2, 0, 0]);

    // pauldrons: three layered gold plates with red trim and rivets
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) {
      const r = 0.58 - k * 0.06;
      b.at([s * (1.05 + k * 0.08), 3.27 - k * 0.17, 0], [0, 0, -s * (0.35 + k * 0.14)], 1, () => {
        b.add(sph(r, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), k % 2 ? M.goldDark : M.gold, [0, 0, 0], [0, 0, 0], [1.15, 0.62, 1.05]);
        b.add(torus(r, 0.04, 6, 28), M.red, [0, 0.02, 0], [Math.PI / 2, 0, 0], [1.15, 1.05, 1]);
        for (let j = 0; j < 10; j++) { const a = (j / 10) * Math.PI * 2; b.add(sph(0.025, 6, 4), M.goldDark, [Math.cos(a) * r * 1.13, 0.05, Math.sin(a) * r * 1.03]); }
        if (k === 0) { b.add(cyl(0.14, 0.14, 0.05, 18), M.gold, [0, r * 0.62, 0]); b.add(sph(0.07, 8, 6), M.gemBlue, [0, r * 0.62 + 0.04, 0]); }
      });
    }
    for (const s of [-1, 1]) { b.add(cyl(0.11, 0.11, 0.05, 16), M.gold, [s * 0.55, 3.28, 0.42], [Math.PI / 2, 0, 0]); b.add(sph(0.05, 8, 6), M.gemRed, [s * 0.55, 3.28, 0.45]); }
  });

  // ================================================================ arms
  const makeArm = (s) => {
    const pivot = new THREE.Group(); pivot.position.set(s * 1.12, 3.12, 0);
    part(pivot, (b) => {
      b.add(rock(0.33), M.sand, [0, -0.45, 0], [0, 0, 0], [1, 1.6, 1]);
      b.add(torus(0.33, 0.045, 6, 24), M.gold, [0, -0.3, 0], [Math.PI / 2, 0, 0]);
      b.add(torus(0.33, 0.035, 6, 24), M.lapis, [0, -0.4, 0], [Math.PI / 2, 0, 0]);
      b.add(rock(0.3), M.sandDark, [0, -0.95, 0]);
      b.add(cyl(0.41, 0.37, 0.72, 20), M.gold, [0, -1.35, 0]);                                                   // bracer
      for (const y of [-1.04, -1.66]) b.add(torus(0.4, 0.035, 6, 24), M.red, [0, y, 0], [Math.PI / 2, 0, 0]);
      b.add(torus(0.4, 0.03, 6, 24), M.lapis, [0, -1.35, 0], [Math.PI / 2, 0, 0]);
      for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; b.add(box(0.04, 0.6, 0.03), M.goldDark, [Math.sin(a) * 0.4, -1.35, Math.cos(a) * 0.4], [0, a, 0]); }
      b.add(sph(0.08, 10, 8), M.gemBlue, [s * 0.41, -1.35, 0]);
      b.add(rock(0.5, 1, 0.18), M.sandDark, [0, -1.98, 0], [0, 0, 0], [1, 0.9, 1.05]);                          // boulder fist
      for (let k = 0; k < 4; k++) b.add(rock(0.14, 0), M.sand, [-0.24 + k * 0.16, -1.88, 0.4]);
      b.add(rock(0.16, 0), M.sand, [-s * 0.42, -1.9, 0.2]);
      b.add(torus(0.47, 0.05, 6, 24), M.gold, [0, -1.74, 0], [Math.PI / 2, 0, 0], [1, 1.05, 1]);
      veins(b, [0, -0.45, 0], [0.33, 0.53, 0.33], 2);
      veins(b, [0, -1.98, 0], [0.5, 0.45, 0.52], 2);
    });
    body.add(pivot); return pivot;
  };
  const armL = makeArm(-1), armR = makeArm(1);

  // ================================================================ head with nemes headdress
  const head = new THREE.Group(); head.position.set(0, 3.72, 0.05); body.add(head);
  part(head, (b) => {
    b.add(rockGeometry(0.5, 2, 21, 0.1), M.sand, [0, 0.12, 0], [0, 0, 0], [1, 1.1, 1.02]);
    b.add(rockGeometry(0.36, 1, 22, 0.15), M.sandDark, [0, -0.22, 0.12], [0, 0, 0], [1.25, 0.7, 1.1]);
    b.add(box(0.82, 0.13, 0.2), M.sandDark, [0, 0.26, 0.42], [-0.2, 0, 0]);
    for (const s of [-1, 1]) {
      b.add(box(0.22, 0.12, 0.06), M.black, [s * 0.2, 0.15, 0.46]);
      b.add(box(0.16, 0.07, 0.04), M.eye, [s * 0.2, 0.15, 0.49]);
      b.add(box(0.03, 0.25, 0.02), M.vein, [s * 0.32, -0.02, 0.44], [0, 0, s * 0.3]);   // glowing tear-cracks
    }
    b.add(rock(0.1, 0), M.sand, [0, 0.03, 0.5], [0, 0, 0], [0.8, 1.4, 1]);
    b.add(box(0.3, 0.03, 0.03), M.vein, [0, -0.16, 0.5]);

    const hood = paint(new THREE.SphereGeometry(0.6, 40, 16, 0, Math.PI * 2, 0, Math.PI * 0.47), (x, y, z, c) => {
      c.setHex(Math.floor((Math.atan2(z, x) / Math.PI + 1) * 14) % 2 ? 0xffc94a : 0x1f3f9a);
    });
    b.add(hood, M.stripes, [0, 0.22, -0.02], [0, 0, 0], [1.05, 0.95, 1.08]);
    b.add(cyl(0.62, 0.64, 0.12, 32), M.gold, [0, 0.26, -0.02]);
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; b.add(sph(0.03, 6, 4), k % 2 ? M.gemRed : M.gemBlue, [Math.sin(a) * 0.64, 0.26, Math.cos(a) * 0.64 - 0.02]); }
    for (const s of [-1, 1]) for (let k = 0; k < 8; k++) {                                                       // lappets
      b.add(box(0.26 + k * 0.012, 0.13, 0.42 + k * 0.02), k % 2 ? M.lapis : M.gold, [s * (0.56 + k * 0.025), 0.12 - k * 0.14, 0.12 + k * 0.025], [0, 0, s * 0.06]);
    }
    for (let k = 0; k < 6; k++) b.add(cyl(0.16 - k * 0.018, 0.15 - k * 0.018, 0.13, 10), k % 2 ? M.lapis : M.gold, [0, -0.05 - k * 0.13, -0.55 - k * 0.02]);
    // uraeus cobra
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.28, 0.6), new THREE.Vector3(0, 0.42, 0.67), new THREE.Vector3(0, 0.55, 0.62), new THREE.Vector3(0, 0.62, 0.69)]), 12, 0.035, 6), M.gold);
    b.add(sph(0.09, 10, 8), M.gold, [0, 0.6, 0.68], [0, 0, 0], [1.3, 1.5, 0.4]);
    for (const s of [-1, 1]) b.add(sph(0.015, 6, 4), M.gemRed, [s * 0.03, 0.64, 0.72]);
    // ceremonial braided beard
    for (let k = 0; k < 5; k++) b.add(cyl(0.085 - k * 0.004, 0.08 - k * 0.004, 0.09, 10), k % 2 ? M.lapis : M.gold, [0, -0.47 - k * 0.09, 0.33 + k * 0.012]);
    b.add(cyl(0.11, 0.07, 0.06, 10), M.gold, [0, -0.93, 0.39]);
  });

  // ================================================================ cape with woven pattern (vertex colours)
  const capeGeo = paint(new THREE.PlaneGeometry(2.0, 3.0, 18, 32), (x, y, z, c) => {
    const yy = y;
    const border = Math.abs(x) > 0.88 || yy < -1.38 || (yy > 1.2 && yy < 1.32);
    const disk = Math.hypot(x, yy - 0.35);
    const sun = disk < 0.3 || (disk > 0.38 && disk < 0.43) || (Math.abs(yy - 0.35) < 0.06 && Math.abs(x) < 0.8);
    const chevron = Math.abs(((yy + 1.2) * 4 - Math.abs(x) * 3) % 1) < 0.12 && yy < -0.4 && yy > -1.3;
    if (border) c.setHex(yy > 1.2 && yy < 1.32 ? 0x1f3f9a : 0xd9a531);
    else if (sun) c.setHex(0xe8b440);
    else if (chevron) c.setHex(0x1f3f9a);
    else c.setHex(Math.floor((x + 1) * 9) % 2 ? 0x9e1b1b : 0x86141a);
  });
  capeGeo.translate(0, -1.5, 0);
  const cape = new THREE.Mesh(capeGeo, M.cape); cape.position.set(0, 3.35, -0.63); cape.castShadow = true;
  body.add(cape);
  const capeBase = capeGeo.attributes.position.array.slice();

  // ================================================================ orbiting power stones (one ring per shard)
  const orbit = new THREE.Group(); orbit.position.y = 2.3; body.add(orbit);
  const stones = [];
  for (let k = 0; k < 12; k++) {
    const st = new THREE.Mesh(rockGeometry(0.11, 0, k, 0.3), M.gold);
    const a = (k / 12) * Math.PI * 2; st.position.set(Math.cos(a) * 1.7, Math.sin(k * 1.7) * 0.4, Math.sin(a) * 1.7);
    st.visible = false; orbit.add(st); stones.push(st);
  }

  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  root.scale.setScalar(2.1);

  // ================================================================ sand trickling off the body (world space)
  const TN = 160, tp = new Float32Array(TN * 3).fill(-9999), tl = [];
  for (let i = 0; i < TN; i++) tl.push({ life: Math.random() * 1.5, vy: 0 });
  const trickleGeo = new THREE.BufferGeometry(); trickleGeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  const trickle = new THREE.Points(trickleGeo, new THREE.PointsMaterial({ color: 0xe0b070, size: 0.12, transparent: true, opacity: 0.9, depthWrite: false }));
  trickle.frustumCulled = false;
  const emitters = [[1.1, 3.2, 0], [-1.1, 3.2, 0], [1.2, 1.2, 0], [-1.2, 1.2, 0], [0, 2.6, -0.6], [0.5, 2.2, 0.5], [-0.5, 2.2, 0.5], [0, 3.6, 0]].map((p) => new THREE.Vector3(...p));
  const tmp = new THREE.Vector3();

  let phase = 0, lastSign = 1;
  function update(dt, speed01, t, onStep) {
    phase += dt * (5 + speed01 * 5) * (speed01 > 0.02 ? 1 : 0);
    const sw = Math.sin(phase) * 0.7 * speed01;
    legL.rotation.x = sw; legR.rotation.x = -sw;
    armL.rotation.x = -sw * 0.9; armR.rotation.x = sw * 0.9;
    armL.rotation.z = -0.12 - Math.sin(t * 1.5) * 0.02; armR.rotation.z = 0.12 + Math.sin(t * 1.5) * 0.02;
    body.position.y = Math.abs(Math.cos(phase)) * 0.12 * speed01 + Math.sin(t * 2) * 0.03;
    body.rotation.z = Math.sin(phase) * 0.04 * speed01;
    body.rotation.x = speed01 * 0.08;
    head.rotation.y = Math.sin(t * 0.7) * 0.15 * (1 - speed01);
    const sign = Math.sign(Math.sin(phase));
    if (speed01 > 0.15 && sign !== lastSign && onStep) onStep(sign > 0 ? legL : legR);
    lastSign = sign;

    // cape cloth motion
    const arr = capeGeo.attributes.position.array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = capeBase[i], drop = -capeBase[i + 1];
      arr[i + 2] = -Math.pow(drop, 1.3) * (0.1 + speed01 * 0.5) + Math.sin(x * 2.5 + t * 6 - drop * 2.2) * 0.05 * drop * (0.4 + speed01);
      arr[i + 1] = capeBase[i + 1] + Math.pow(drop, 2) * speed01 * 0.05;
    }
    capeGeo.attributes.position.needsUpdate = true; capeGeo.computeVertexNormals();

    orbit.rotation.y += dt * 1.2;
    stones.forEach((s, k) => { s.rotation.x += dt * 2; s.position.y = Math.sin(t * 2 + k * 1.7) * 0.4; });

    root.updateMatrixWorld();
    for (let i = 0; i < TN; i++) {
      const p = tl[i]; p.life += dt;
      if (p.life > 1.5) {
        p.life = 0; p.vy = 0;
        tmp.copy(emitters[i % emitters.length]).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)).applyMatrix4(root.matrixWorld);
        tp[i * 3] = tmp.x; tp[i * 3 + 1] = tmp.y; tp[i * 3 + 2] = tmp.z;
      } else {
        p.vy -= 14 * dt; tp[i * 3 + 1] += p.vy * dt;
      }
    }
    trickleGeo.attributes.position.needsUpdate = true;
  }
  function setPower(n) {
    M.gemRed.emissiveIntensity = 1.5 + n * 1.2;
    M.gold.emissiveIntensity = 0.5 + n * 0.3;
    M.vein.emissiveIntensity = 1.6 + n * 0.9;
    M.eye.emissiveIntensity = 4 + n;
    stones.forEach((s, k) => { s.visible = k < n * 3; });
  }
  return { group: root, trickle, update, setPower };
}
