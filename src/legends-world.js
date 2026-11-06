// legends-world.js — characters and the living city of Kem-Ashar for "אגדות נפירה". Built only from primitives.
import * as THREE from 'three';
import { Batch, MAT, rng } from './util.js';
import { groundAt } from './world.js';
import { toon, addOutline } from './golem.js';
import { buildHuman } from './story.js';

const cyl = (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, w = 14, h = 10, ...x) => new THREE.SphereGeometry(r, w, h, ...x);
const mesh = (geo, mat, pos = [0, 0, 0], rot = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); m.rotation.set(...rot); m.castShadow = true; return m; };

// ================================================================ people with moving arms and legs
/**
 * kind: 'nefiraChild' | 'nefira' | 'setharBoy' | 'sethar'
 * Returns { group, h, update(dt, speed01, t), setGlow(v) }
 */
export function buildPerson(kind) {
  const P = {
    nefiraChild: { h: 6.6, skin: 0xc98d5c, hair: 0x14100e, cloth: 0xf3ead6, sash: 0x2fa39a, gold: 0xffc94a, dress: true, crown: false, bob: true, scale: 0.62 },
    nefira: { h: 10.6, skin: 0xc68a5a, hair: 0x120e0c, cloth: 0xf1e7cf, sash: 0x2a6fd0, gold: 0xffc94a, dress: true, crown: true, bob: true, scale: 1 },
    setharBoy: { h: 8.4, skin: 0xb57a4c, hair: 0x120e0c, cloth: 0xe9dcc0, sash: 0x6a2ab4, gold: 0xffc94a, dress: false, nemes: true, scale: 0.8 },
    sethar: { h: 12.4, skin: 0xae744a, hair: 0x120e0c, cloth: 0xe6d6b4, sash: 0x5a1fa8, gold: 0xffc94a, dress: false, nemes: true, king: true, scale: 1.12 },
  }[kind];
  const s = P.scale;
  const M = { skin: toon(P.skin, { rim: 0.2 }), hair: toon(P.hair, { rim: 0.12 }), hairD: toon(P.hair, { rim: 0.12, side: THREE.DoubleSide }), cloth: toon(P.cloth, { rim: 0.22 }), sash: toon(P.sash, { rim: 0.25 }),
    gold: toon(P.gold, { rim: 0.4, rimColor: 0xffe7a0 }), eye: new THREE.MeshBasicMaterial({ color: 0x0e0a08 }), white: new THREE.MeshBasicMaterial({ color: 0xffffff }) };
  M.gold.emissive = new THREE.Color(0x4a2a00);
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const legH = 3.6 * s, hipY = legH;
  // legs (pivot at the hip)
  const legs = [-1, 1].map((side) => {
    const p = new THREE.Group(); p.position.set(side * 0.42 * s, hipY, 0);
    p.add(mesh(cyl(0.26 * s, 0.22 * s, legH, 10), P.dress ? M.skin : M.skin, [0, -legH / 2, 0]));
    p.add(mesh(box(0.42 * s, 0.22 * s, 0.8 * s), M.gold, [0, -legH + 0.1 * s, 0.16 * s]));   // sandal
    body.add(p); return p;
  });
  // kilt or dress
  if (P.dress) {
    body.add(mesh(new THREE.ConeGeometry(1.35 * s, 4.4 * s, 18, 1, true), M.cloth, [0, hipY - 0.9 * s, 0]));
  } else {
    body.add(mesh(new THREE.ConeGeometry(1.05 * s, 2.0 * s, 16, 1, true), M.cloth, [0, hipY - 0.35 * s, 0]));
    body.add(mesh(box(0.42 * s, 1.5 * s, 0.1 * s), M.sash, [0, hipY - 0.6 * s, 0.86 * s], [-0.18, 0, 0]));   // front panel
  }
  // torso
  const chestY = hipY + 1.45 * s;
  body.add(mesh(cyl(0.72 * s, 0.62 * s, 2.7 * s, 14), P.dress ? M.cloth : M.skin, [0, chestY, 0]));
  body.add(mesh(cyl(0.68 * s, 0.68 * s, 0.32 * s, 14), M.sash, [0, hipY + 0.2 * s, 0]));                      // belt / sash
  body.add(mesh(new THREE.TorusGeometry(0.62 * s, 0.2 * s, 8, 22), M.gold, [0, chestY + 1.15 * s, 0], [Math.PI / 2, 0, 0]));   // wide collar
  if (P.king) body.add(mesh(new THREE.TorusGeometry(0.75 * s, 0.12 * s, 8, 22), M.sash, [0, chestY + 0.95 * s, 0], [Math.PI / 2, 0, 0]));
  // arms (pivot at the shoulder)
  const armL = 2.6 * s;
  const arms = [-1, 1].map((side) => {
    const p = new THREE.Group(); p.position.set(side * 0.92 * s, chestY + 1.0 * s, 0);
    p.add(mesh(cyl(0.2 * s, 0.17 * s, armL, 10), M.skin, [0, -armL / 2, 0]));
    p.add(mesh(cyl(0.23 * s, 0.23 * s, 0.3 * s, 10), M.gold, [0, -armL * 0.72, 0]));                         // bracelet
    p.add(mesh(sph(0.22 * s), M.skin, [0, -armL, 0]));
    p.rotation.z = side * 0.12;
    body.add(p); return p;
  });
  // head
  const headY = chestY + 2.15 * s, hr = 0.78 * s;
  const head = new THREE.Group(); head.position.y = headY; body.add(head);
  head.add(mesh(cyl(0.26 * s, 0.3 * s, 0.6 * s, 10), M.skin, [0, -0.75 * s, 0]));   // neck
  head.add(mesh(sph(hr, 18, 14), M.skin));
  for (const e of [-1, 1]) {
    head.add(mesh(sph(0.13 * s, 10, 8), M.eye, [e * 0.3 * s, 0.08 * s, hr * 0.9]));
    head.add(mesh(sph(0.04 * s, 6, 4), M.white, [e * 0.27 * s, 0.13 * s, hr * 0.99]));
    head.add(mesh(box(0.34 * s, 0.07 * s, 0.05 * s), M.eye, [e * 0.32 * s, 0.25 * s, hr * 0.92], [0, 0, e * -0.15]));   // kohl line
  }
  if (P.nemes) {   // striped royal headcloth
    head.add(mesh(sph(hr * 1.08, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), M.cloth, [0, 0.05 * s, -0.05 * s]));
    for (const e of [-1, 1]) head.add(mesh(box(0.55 * s, 1.9 * s, 0.25 * s), M.sash, [e * 0.78 * s, -0.75 * s, 0.1 * s], [0, 0, e * 0.1]));
    for (let k = 0; k < 4; k++) head.add(mesh(new THREE.TorusGeometry(hr * 1.06, 0.035 * s, 4, 24, Math.PI), M.sash, [0, 0.55 * s - k * 0.22 * s, -0.05 * s], [0, 0, 0]));
    if (P.king) {   // the eclipse crown: a gold ring with a dark disc
      head.add(mesh(new THREE.TorusGeometry(0.55 * s, 0.1 * s, 8, 24), M.gold, [0, 1.25 * s, -0.1 * s]));
      head.add(mesh(new THREE.CircleGeometry(0.45 * s, 20), new THREE.MeshBasicMaterial({ color: 0x1a0a30, side: THREE.DoubleSide }), [0, 1.25 * s, -0.12 * s]));
    } else head.add(mesh(cyl(0.08 * s, 0.12 * s, 0.5 * s, 8), M.gold, [0, 0.85 * s, hr * 0.75], [0.5, 0, 0]));   // little cobra
  } else {   // black bob haircut with straight bangs
    head.add(mesh(sph(hr * 1.1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), M.hair, [0, 0.06 * s, -0.04 * s]));
    head.add(mesh(new THREE.CylinderGeometry(hr * 1.1, hr * 1.18, 1.0 * s, 18, 1, true, Math.PI * 0.62, Math.PI * 1.76), M.hairD, [0, -0.35 * s, -0.02 * s]));
    head.add(mesh(box(1.25 * s, 0.32 * s, 0.25 * s), M.hair, [0, 0.52 * s, hr * 0.78]));
    if (P.crown) {   // the vulture crown she still wears as a spirit
      head.add(mesh(sph(hr * 1.15, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), M.gold, [0, 0.12 * s, -0.04 * s]));
      for (const e of [-1, 1]) head.add(mesh(box(0.3 * s, 1.3 * s, 0.7 * s), M.gold, [e * 0.85 * s, -0.25 * s, 0], [0, 0, e * 0.15]));
    } else head.add(mesh(new THREE.TorusGeometry(hr * 1.02, 0.07 * s, 6, 24), M.sash, [0, 0.42 * s, 0], [Math.PI / 2 - 0.15, 0, 0]));   // ribbon
  }
  addOutline(g);
  const glowMats = [M.cloth, M.gold, M.sash];
  let phase = 0;
  return {
    group: g, h: P.h, head, arms, legs,
    /** speed01: 0 standing … 1 running; pose: optional { armsUp, kneel } */
    update(dt, speed01, t, pose = {}) {
      phase += dt * (4 + speed01 * 9);
      const sw = Math.sin(phase) * (0.15 + speed01 * 0.75);
      legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
      arms[0].rotation.x = -sw * 0.9 - (pose.armsUp || 0) * 2.6; arms[1].rotation.x = sw * 0.9 - (pose.armsUp || 0) * 2.6;
      arms[0].rotation.z = -0.12 - (pose.armsOut || 0) * 1.1; arms[1].rotation.z = 0.12 + (pose.armsOut || 0) * 1.1;
      body.position.y = Math.abs(Math.sin(phase)) * speed01 * 0.35 * s - (pose.kneel || 0) * 2.2 * s;
      body.rotation.x = (pose.lean || 0);
      head.rotation.x = (pose.headDown || 0) * 0.5 - (pose.headUp || 0) * 0.45;
      head.rotation.y = Math.sin(t * 0.7) * 0.08 * (1 - speed01);
    },
    setGlow(v) { for (const m of glowMats) { m.emissive = m.emissive || new THREE.Color(); m.emissive.setHex(0x7fd0ff).multiplyScalar(v); } },
  };
}

// ================================================================ Kem-Ashar, the living city (both sides of the sphinx avenue)
export const CITY = {
  market: new THREE.Vector3(-120, 0, 335),
  well: new THREE.Vector3(118, 0, 438),
  home: new THREE.Vector3(-150, 0, 482),
  temple: new THREE.Vector3(0, 0, 168),
  sandSpots: [
    { x: -120, z: 362, name: 'חול מהשוק' }, { x: 132, z: 452, name: 'חול מהבאר' },
    { x: -150, z: 458, name: 'חול מהבית' }, { x: 38, z: 205, name: 'חול ממדרגות המקדש' },
  ],
};

const LAMP_SPOTS = [[-60, 300], [-104, 372], [36, 410], [96, 424]];

export function buildCity(scene, colliders) {
  const R = rng(77);
  const b = new Batch();
  const mud = new THREE.MeshStandardMaterial({ color: 0xd9b07a, roughness: 0.95 }), mudDark = new THREE.MeshStandardMaterial({ color: 0xb98a58, roughness: 0.95 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2e6cc, roughness: 0.9 });
  const cloths = [0xb8322a, 0x2f7fb8, 0xe2a52a, 0x2fa39a, 0x8a3ab8].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }));
  const doorM = new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 1 });
  const occupied = [];
  const free = (x, z, r) => occupied.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r) && Math.abs(x) > 34 + r;
  const beamM = new THREE.MeshStandardMaterial({ color: 0x6b4524, roughness: 1 });
  /** a house on a slope sits level on its highest point; wooden support beams fill the gap down to the ground */
  function supports(x, z, w, d, rot, baseY) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const nx = Math.max(2, Math.ceil(w / 6)), nz = Math.max(2, Math.ceil(d / 6));
    let any = false;
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
      if (i > 0 && i < nx && j > 0 && j < nz) continue;                         // only around the edges
      const lx = -w / 2 + 0.6 + (w - 1.2) * (i / nx), lz = -d / 2 + 0.6 + (d - 1.2) * (j / nz);
      const wx = x + lx * c + lz * s, wz = z - lx * s + lz * c, g = groundAt(wx, wz), gap = baseY - g;
      if (gap < 0.7) continue;
      any = true;
      b.add(box(0.9, gap + 1.2, 0.9), beamM, [wx, g - 0.6 + (gap + 1.2) / 2, wz], [0, rot, 0]);
      if (gap > 3.5) b.add(box(0.5, Math.min(gap, 6) * 1.25, 0.5), beamM, [wx, g + Math.min(gap, 6) * 0.45, wz], [0, rot, (i === 0 ? 1 : -1) * 0.6]);   // a diagonal brace
    }
    if (any) {   // a wooden frame along the bottom of the house
      b.at([x, baseY - 0.3, z], [0, rot, 0], 1, () => {
        for (const e of [-1, 1]) { b.add(box(w, 0.7, 0.7), beamM, [0, 0, e * (d / 2 - 0.3)]); b.add(box(0.7, 0.7, d), beamM, [e * (w / 2 - 0.3), 0, 0]); }
      });
    }
  }
  function baseFor(x, z, w, d, rot) {
    const c = Math.cos(rot), s = Math.sin(rot);
    let hi = -Infinity;
    for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) hi = Math.max(hi, groundAt(x + lx * c + lz * s, z - lx * s + lz * c));
    return hi - 0.4;
  }
  function house(x, z, w, d, h, rot) {
    const y = baseFor(x, z, w, d, rot);
    supports(x, z, w, d, rot, y);
    b.at([x, y, z], [0, rot, 0], 1, () => {
      b.add(box(w, h, d), R() < 0.3 ? white : mud, [0, h / 2, 0]);
      b.add(box(w + 0.8, 1.2, d + 0.8), mudDark, [0, h + 0.4, 0]);                                   // parapet
      b.add(box(w - 2, 1.0, d - 2), mud, [0, h + 0.9, 0]);
      b.add(box(3.2, 6, 0.6), doorM, [0, 3, d / 2 + 0.05]);                                         // door
      for (const e of [-1, 1]) b.add(box(1.8, 1.8, 0.5), doorM, [e * w * 0.3, h * 0.66, d / 2 + 0.05]);   // windows
      if (R() < 0.6) b.add(box(w * 0.7, 0.25, 5), cloths[Math.floor(R() * cloths.length)], [0, h * 0.55, d / 2 + 2.4], [-0.35, 0, 0]);   // awning
      if (R() < 0.4) b.add(box(w * 0.5, h * 0.5, d * 0.5), mud, [w * 0.15, h + h * 0.25 + 0.4, -d * 0.1]);   // upper room
    });
    const c = Math.cos(rot), s = Math.sin(rot), hx = Math.abs(c * w / 2) + Math.abs(s * d / 2), hz = Math.abs(s * w / 2) + Math.abs(c * d / 2);
    colliders.push({ type: 'box', minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz });
    occupied.push({ x, z, r: Math.max(w, d) * 0.6 });
  }
  function palm(x, z) {
    const y = groundAt(x, z), hgt = 18 + R() * 10, lean = (R() - 0.5) * 0.3;
    b.at([x, y, z], [lean, R() * 6, 0], 1, () => {
      for (let i = 0; i < 6; i++) b.add(cyl(0.8 - i * 0.07, 0.9 - i * 0.07, hgt / 6, 8), MAT.palmTrunk, [0, hgt / 12 + i * hgt / 6, 0]);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        b.add(box(1.6, 0.2, 9), MAT.palmLeaf, [Math.sin(a) * 4, hgt + 0.4, Math.cos(a) * 4], [0.55, a, 0]);
      }
    });
    colliders.push({ type: 'circle', x, z, r: 1.6 }); occupied.push({ x, z, r: 4 });
  }
  // special places first
  occupied.push({ x: CITY.market.x, z: CITY.market.z, r: 42 }, { x: CITY.well.x, z: CITY.well.z, r: 20 }, { x: CITY.home.x, z: CITY.home.z, r: 18 });
  // keep the story's places clear of houses: the street lamps, the sand spots, Sethar's hiding place behind the well
  for (const [x, z] of LAMP_SPOTS) occupied.push({ x, z, r: 9 });
  for (const sp of CITY.sandSpots) occupied.push({ x: sp.x, z: sp.z, r: 10 });
  occupied.push({ x: CITY.well.x + 10, z: CITY.well.z + 8, r: 10 }, { x: CITY.home.x, z: CITY.home.z - 14, r: 16 });
  // the family home (bigger, white, with a garden wall)
  {
    const { x, z } = CITY.home, y = baseFor(x, z + 18, 30, 20, Math.PI);
    supports(x, z + 18, 30, 20, Math.PI, y);
    b.at([x, y, z + 18], [0, Math.PI, 0], 1, () => {
      b.add(box(30, 16, 20), white, [0, 8, 0]); b.add(box(31, 1.4, 21), MAT.gold, [0, 16.4, 0]);
      b.add(box(4, 8, 0.6), doorM, [0, 4, 10.1]); for (const e of [-1, 1]) b.add(cyl(1.1, 1.3, 14, 10), MAT.lapis, [e * 6, 7, 11]);
    });
    colliders.push({ type: 'box', minX: x - 15, maxX: x + 15, minZ: z + 8, maxZ: z + 28 });
  }
  // the well
  {
    const { x, z } = CITY.well, y = groundAt(x, z);
    b.add(cyl(5, 5.4, 3.2, 20), MAT.stone, [x, y + 1.6, z]); b.add(cyl(4, 4, 0.4, 20), new THREE.MeshStandardMaterial({ color: 0x1a3a5a, roughness: 0.2, metalness: 0.4 }), [x, y + 2.9, z]);
    for (const e of [-1, 1]) b.add(box(0.8, 9, 0.8), MAT.wood, [x + e * 4.5, y + 4.5, z]);
    b.add(cyl(0.4, 0.4, 10, 8), MAT.wood, [x, y + 8.6, z], [0, 0, Math.PI / 2]);
    colliders.push({ type: 'circle', x, z, r: 5.4 });
  }
  // market stalls around the square
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3, x = CITY.market.x + Math.cos(a) * 30, z = CITY.market.z + Math.sin(a) * 30, y = groundAt(x, z);
    b.at([x, y, z], [0, -a + Math.PI / 2, 0], 1, () => {
      for (const ex of [-1, 1]) for (const ez of [-1, 1]) b.add(box(0.5, 8, 0.5), MAT.wood, [ex * 4.5, 4, ez * 3]);
      b.add(box(10.5, 0.3, 7.5), cloths[k % cloths.length], [0, 8.2, 0], [0.12, 0, 0]);
      b.add(box(9, 2.6, 2.2), MAT.woodDark, [0, 1.3, 2]);
      for (let i = 0; i < 4; i++) b.add(sph(0.9, 10, 8), [MAT.gold, MAT.redDark, MAT.turquoise, MAT.stonePale][(i + k) % 4], [-3 + i * 2, 3.1, 2]);   // fruit, pots, cloth
    });
    colliders.push({ type: 'circle', x, z, r: 5 });
  }
  // houses on both sides of the avenue
  for (let n = 0, tries = 0; n < 46 && tries < 900; tries++) {
    const side = R() < 0.5 ? -1 : 1, x = side * (48 + R() * 190), z = 250 + R() * 235;
    const w = 14 + R() * 12, d = 12 + R() * 10, h = 9 + R() * 8;
    if (!free(x, z, Math.max(w, d) * 0.62)) continue;
    house(x, z, w, d, h, Math.round(R() * 3) * Math.PI / 2 + (R() - 0.5) * 0.15); n++;
  }
  for (let n = 0, tries = 0; n < 26 && tries < 600; tries++) {
    const x = (R() < 0.5 ? -1 : 1) * (40 + R() * 210), z = 240 + R() * 245;
    if (!free(x, z, 4)) continue; palm(x, z); n++;
  }
  const group = b.build();
  scene.add(group);

  // street lamps (the ones Nefira lights for her brother are interactive)
  const lampMatOff = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, emissive: 0x000000 });
  function lamp(x, z) {
    const y = groundAt(x, z), g = new THREE.Group(); g.position.set(x, y, z);
    g.add(mesh(cyl(0.35, 0.5, 9, 8), MAT.wood, [0, 4.5, 0]));
    const bowl = mesh(cyl(1.4, 0.8, 1.0, 12), MAT.gold, [0, 9.4, 0]); g.add(bowl);
    const flame = mesh(new THREE.ConeGeometry(0.7, 1.8, 10), lampMatOff.clone(), [0, 10.6, 0]); g.add(flame);
    const light = new THREE.PointLight(0xffb052, 0, 70, 1.6); light.position.set(0, 11, 0); g.add(light);
    scene.add(g); colliders.push({ type: 'circle', x, z, r: 1.2 });
    return { g, flame, light, lit: false, x, z, set(on) { this.lit = on; flame.material.emissive.setHex(on ? 0xffa030 : 0); flame.material.emissiveIntensity = on ? 3 : 0; flame.material.color.setHex(on ? 0xffd27a : 0x3a2a1a); light.intensity = on ? 2.2 : 0; } };
  }
  const lamps = LAMP_SPOTS.map(([x, z]) => lamp(x, z));

  // townspeople (they leave in chapter 3)
  const robes = [MAT.lapis, MAT.turquoise, MAT.redDark, MAT.cloth, MAT.leather];
  const crowd = [];
  for (let n = 0, tries = 0; n < 34 && tries < 400; tries++) {
    const near = R() < 0.45, x = near ? CITY.market.x + (R() - 0.5) * 50 : (R() < 0.5 ? -1 : 1) * (36 + R() * 200), z = near ? CITY.market.z + (R() - 0.5) * 50 : 250 + R() * 230;
    if (!occupied.every((o) => Math.hypot(o.x - x, o.z - z) > o.r * 0.7) && !near) continue;
    const p = buildHuman(robes[n % robes.length], { beard: R() < 0.3, staff: R() < 0.15, scale: 1.9 + R() * 0.6, turban: R() < 0.5 ? MAT.cloth : MAT.gold });
    p.position.set(x, groundAt(x, z), z); p.rotation.y = R() * 6.28; p.userData.ph = R() * 6;
    scene.add(p); crowd.push(p); n++;
  }
  return {
    group, lamps, crowd,
    update(t) { for (const p of crowd) if (p.visible) p.position.y = groundAt(p.position.x, p.position.z) + Math.abs(Math.sin(t * 1.5 + p.userData.ph)) * 0.25; },
  };
}

// ================================================================ the sand Nefira gathers, and the sun mirrors of the temple
export function buildSandSpot() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffa53a, emissiveIntensity: 1.6, transparent: true, opacity: 0.9 });
  const pile = mesh(new THREE.ConeGeometry(2.2, 1.6, 16), m, [0, 0.8, 0]); g.add(pile);
  const ring = mesh(new THREE.TorusGeometry(3.2, 0.12, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffd27a }), [0, 0.3, 0], [Math.PI / 2, 0, 0]); g.add(ring);
  const light = new THREE.PointLight(0xffc060, 1.4, 30, 1.8); light.position.y = 3; g.add(light);
  return { g, pile, ring, light };
}
export function buildMirror() {
  const g = new THREE.Group();
  g.add(mesh(cyl(1.4, 1.8, 2, 12), MAT.stone, [0, 1, 0]));
  const head = new THREE.Group(); head.position.y = 5.5; g.add(head);
  head.add(mesh(box(0.6, 6, 0.6), MAT.gold, [0, -1.5, 0]));
  const disc = mesh(cyl(2.6, 2.6, 0.35, 28), new THREE.MeshStandardMaterial({ color: 0xfff3d0, metalness: 1, roughness: 0.08, emissive: 0x3a2a00 }), [0, 1.4, 0], [Math.PI / 2, 0, 0]);
  head.add(disc);
  const beam = mesh(cyl(0.35, 0.35, 1, 10), new THREE.MeshBasicMaterial({ color: 0xffe6a0, transparent: true, opacity: 0.75 }), [0, 0, 0]);
  beam.visible = false; beam.castShadow = false;
  return { g, head, disc, beam };
}
