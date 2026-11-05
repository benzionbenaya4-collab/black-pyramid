// combat.js — the boss fight against the Shadow of Sethar on the Plain of Ash.
//
//  Player:  F / click = sun bolt (auto-aims)   R = burst of light (area, 6 s cooldown)   Space = jump over shockwaves
//  Boss phases (by health):  1 — shadow orbs + ground slam   2 — adds shadow wraiths   3 — adds eclipse rain (marked blasts)
import * as THREE from 'three';
import { Batch } from './util.js';

const $ = (id) => document.getElementById(id);
export const ARENA = { x: 0, z: 640, r: 150 };

/** The Shadow of Sethar — built from the player's own design sheet (front / side / back):
 *  faceted glossy dark-purple body, round head with a top spike, side spikes and red slit eyes, an eclipse crown,
 *  huge round shoulders, an inverted-trapezoid chest with long pointed tails, thin arms with giant claws,
 *  and four long spider-like legs. */
export function buildShadowKing() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a24b4, emissive: 0x16063a, emissiveIntensity: 1, roughness: 0.32, metalness: 0.35, flatShading: true });
  const red = new THREE.MeshBasicMaterial({ color: 0xff3a2a });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff8a2a, emissiveIntensity: 3 });
  const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), e = new THREE.Euler();
  /** a faceted limb segment between two points */
  const seg = (b, p0, p1, r0, r1, sides = 6) => {
    const a = new THREE.Vector3(...p0), c = new THREE.Vector3(...p1), d = c.clone().sub(a), len = d.length();
    q.setFromUnitVectors(up, d.normalize()); e.setFromQuaternion(q);
    b.add(new THREE.CylinderGeometry(r1, r0, len, sides), dark, a.clone().lerp(c, 0.5).toArray(), [e.x, e.y, e.z]);
  };
  const claw = (b, p0, p1, r) => {   // pointed tip
    const a = new THREE.Vector3(...p0), c = new THREE.Vector3(...p1), d = c.clone().sub(a), len = d.length();
    q.setFromUnitVectors(up, d.normalize()); e.setFromQuaternion(q);
    b.add(new THREE.ConeGeometry(r, len, 6), dark, a.clone().lerp(c, 0.5).toArray(), [e.x, e.y, e.z]);
  };
  const b = new Batch();
  // chest: inverted trapezoid, then long pointed tails front and back
  b.add(new THREE.CylinderGeometry(5.6, 2.6, 8.5, 4).rotateY(Math.PI / 4), dark, [0, 21, 0], [0, 0, 0], [1, 1, 0.55]);
  b.add(new THREE.CylinderGeometry(2.6, 1.8, 2, 6), dark, [0, 16, 0]);
  for (const z of [1.3, -1.3]) {
    const kite = new THREE.Shape(); kite.moveTo(-2.2, 0); kite.lineTo(2.2, 0); kite.lineTo(1.4, -6); kite.lineTo(0, -10.5); kite.lineTo(-1.4, -6); kite.lineTo(-2.2, 0);
    b.add(new THREE.ExtrudeGeometry(kite, { depth: 0.5, bevelEnabled: false }), dark, [0, 16.8, z - 0.25], [z > 0 ? -0.08 : 0.08, 0, 0]);
  }
  // huge round shoulders
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(3.8, 10, 7), dark, [s * 7.6, 24.2, 0], [0, 0, 0], [1.05, 0.82, 1]);
  // head: sphere with a top spike, side spikes, red slit eyes
  b.add(new THREE.CylinderGeometry(1.1, 1.3, 2, 6), dark, [0, 26.3, 0]);
  b.add(new THREE.SphereGeometry(2.9, 10, 8), dark, [0, 29, 0]);
  b.add(new THREE.ConeGeometry(1.2, 3.4, 6), dark, [0, 32.4, -0.2], [-0.15, 0, 0]);
  for (const s of [-1, 1]) {
    b.add(new THREE.ConeGeometry(0.75, 2.4, 5), dark, [s * 3.1, 29.6, 0], [0, 0, -s * 1.25]);
    b.add(new THREE.BoxGeometry(1.25, 0.42, 0.5), red, [s * 1.1, 29.3, 2.6], [0, s * 0.25, 0]);
  }
  const upper = b.build({ cast: true, receive: false }); upper.position.y = 6;   // the upper body stands high on the long legs
  g.add(upper);
  // four long spider-like legs (inner pair and outer arched pair)
  const lb = new Batch();
  const Ly = (p) => [p[0], (p[1] + 0.2) * 1.37 - 0.2, p[2]];
  const lseg = (bb, p0, p1, r0, r1) => seg(bb, Ly(p0), Ly(p1), r0 * 1.45, r1 * 1.45);
  const lclaw = (bb, p0, p1, r) => claw(bb, Ly(p0), Ly(p1), r * 1.45);
  for (const s of [-1, 1]) {
    lseg(lb, [s * 1.6, 16, 0.6], [s * 3.2, 8.5, 1.2], 0.85, 0.7); lseg(lb, [s * 3.2, 8.5, 1.2], [s * 4.3, 3.4, 1.8], 0.7, 0.55);
    lclaw(lb, [s * 4.3, 3.4, 1.8], [s * 5.1, -0.2, 2.8], 0.55);
    lseg(lb, [s * 2.8, 15.6, -0.6], [s * 9.2, 10.4, -1.2], 0.85, 0.7); lseg(lb, [s * 9.2, 10.4, -1.2], [s * 11.6, 4.2, -1.6], 0.7, 0.55);
    lclaw(lb, [s * 11.6, 4.2, -1.6], [s * 12.8, -0.2, -0.6], 0.55);
    for (const p of [[s * 3.2, 8.5, 1.2], [s * 9.2, 10.4, -1.2]]) lb.add(new THREE.SphereGeometry(1.3, 6, 5), dark, Ly(p));
    lseg(lb, [s * 1.6, 16, 0.6], [s * 1.6, 21.2, 0.6], 0.85, 0.85); lseg(lb, [s * 2.8, 15.6, -0.6], [s * 2.2, 21, -0.6], 0.85, 0.85);   // hips into the body
  }
  const body = lb.build({ cast: true, receive: false });
  g.add(body);
  const crown = new THREE.Group(); crown.position.set(0, 36, -2.4);               // eclipse crown: black disc + burning ring
  crown.add(new THREE.Mesh(new THREE.CircleGeometry(5.2, 48), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide })));
  crown.add(new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.45, 8, 56), ringMat));
  g.add(crown);
  // arms: pivot at the shoulder, thin upper arm and forearm, a big round hand with long claws
  const hands = [-1, 1].map((s) => {
    const arm = new THREE.Group(); arm.position.set(s * 8.2, 29.4, 0); arm.rotation.z = s * 0.22;
    const ab = new Batch();
    seg(ab, [0, 0, 0], [s * 1.2, -7, 0.4], 0.75, 0.6); ab.add(new THREE.SphereGeometry(0.85, 6, 5), dark, [s * 1.2, -7, 0.4]);
    seg(ab, [s * 1.2, -7, 0.4], [s * 1.6, -12.5, 0.8], 0.6, 0.85);
    ab.add(new THREE.SphereGeometry(2.4, 9, 7), dark, [s * 1.7, -14.2, 0.9], [0, 0, 0], [1, 1.05, 0.95]);
    for (let k = 0; k < 5; k++) {
      const x = s * 1.7 + (k - 2) * 0.95, z = 0.9 + Math.cos((k - 2) * 0.6) * 1.2;
      claw(ab, [x, -15.6, z], [x + (k - 2) * 0.35, -20.2, z + 0.6], 0.38);
    }
    const am = ab.build(); arm.add(am);
    const tip = new THREE.Object3D(); tip.position.set(s * 1.7, -16, 1.5); arm.add(tip); arm.userData.tip = tip;
    g.add(arm); return arm;
  });
  return { g, body, crown, hands, dark, ringMat };
}

function buildWraith() {
  const b = new Batch();
  const m = new THREE.MeshStandardMaterial({ color: 0x120818, emissive: 0x2a0844, emissiveIntensity: 0.8, flatShading: true, side: THREE.DoubleSide });
  b.add(new THREE.ConeGeometry(2.2, 6, 8, 1, true), m, [0, 3, 0]);
  b.add(new THREE.SphereGeometry(1.4, 10, 8), m, [0, 6.6, 0]);
  for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.28, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3040 }), [s * 0.5, 6.8, 1.2]);
  return b.build({ cast: true, receive: false });
}

export function createCombat({ scene, groundAt, puff, getHero, onWin, onDown, shout }) {
  const king = buildShadowKing(); king.g.visible = false; scene.add(king.g);
  const groundY = groundAt(ARENA.x, ARENA.z);

  // arena boundary: a ring of shadow fire
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x9b3cff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  const wall = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(ARENA.r, 0.9, 6, 128), ringMat); ring.rotation.x = Math.PI / 2; wall.add(ring);
  for (let k = 0; k < 24; k++) {   // shadow-flame pillars marking the edge of the arena
    const a = (k / 24) * Math.PI * 2;
    const f = new THREE.Mesh(new THREE.ConeGeometry(2.2, 12, 6, 1, true), ringMat); f.position.set(Math.cos(a) * ARENA.r, 6, Math.sin(a) * ARENA.r); wall.add(f);
  }
  wall.position.set(ARENA.x, groundY + 0.6, ARENA.z); wall.visible = false; scene.add(wall);

  // shared meshes and materials for projectiles / effects
  const orbGeo = new THREE.SphereGeometry(2.2, 12, 8), orbMat = new THREE.MeshBasicMaterial({ color: 0xb04aff });
  const boltGeo = new THREE.OctahedronGeometry(1.3, 0), boltMat = new THREE.MeshBasicMaterial({ color: 0xffe28a });
  const waveMat = new THREE.MeshBasicMaterial({ color: 0x9b3cff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const markMat = new THREE.MeshBasicMaterial({ color: 0xff2a3a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const burstMat = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const fx = new THREE.Group(); scene.add(fx);

  const S = {
    active: false, paused: false, bossHP: 500, maxHP: 500, hp: 100, phase: 1, timer: 3, hurtT: 9, shootCD: 0, burstCD: 0,
    orbs: [], bolts: [], waves: [], wraiths: [], marks: [], bursts: [], slamT: -1, flash: 0, t: 0, deaths: 0,
  };
  const bossPos = new THREE.Vector3(), core = new THREE.Vector3(), heroC = new THREE.Vector3(), tmp = new THREE.Vector3();

  function clearFx() {
    for (const list of [S.orbs, S.bolts, S.waves, S.wraiths, S.marks, S.bursts]) { for (const o of list) fx.remove(o.mesh); list.length = 0; }
  }
  function place(x, y, z) { bossPos.set(x, y, z); king.g.position.copy(bossPos); }
  function show(on) { king.g.visible = on; }
  function start() {
    S.active = true; S.paused = false; S.hp = 100; S.timer = 2.5; S.hurtT = 9; S.phase = 1; S.bossHP = S.maxHP;
    place(ARENA.x, groundY, ARENA.z + 50); show(true); wall.visible = true;
    $('bossbar').classList.remove('hidden'); $('hpbar').classList.remove('hidden'); updateBars();
  }
  function stop() { S.active = false; clearFx(); wall.visible = false; $('bossbar').classList.add('hidden'); $('hpbar').classList.add('hidden'); }
  function updateBars() {
    $('bossbar-fill').style.width = `${(S.bossHP / S.maxHP) * 100}%`;
    $('hpbar-fill').style.width = `${S.hp}%`;
    $('hp-text').textContent = Math.ceil(S.hp);
    $('burst-cd').textContent = S.burstCD > 0 ? `R: ${Math.ceil(S.burstCD)}` : 'R: מוכן';
  }

  function hurt(n) {
    if (S.paused) return;
    S.hp = Math.max(0, S.hp - n); S.hurtT = 0;
    const v = $('hurt'); v.classList.remove('on'); void v.offsetWidth; v.classList.add('on');
    if (S.hp <= 0) {
      S.paused = true; S.deaths++; S.pendingClear = true;
      onDown?.();
      setTimeout(() => {   // get back up, at the start of the current phase
        S.hp = 100; S.bossHP = Math.min(S.maxHP, Math.max(S.bossHP, [S.maxHP, S.maxHP * 0.66, S.maxHP * 0.33][S.phase - 1]));
        S.timer = 3; S.paused = false; updateBars();
      }, 3500);
    }
  }
  function damageBoss(n) {
    if (S.paused) return;
    S.bossHP = Math.max(0, S.bossHP - n); S.flash = 0.15;
    const ph = S.bossHP > S.maxHP * 0.66 ? 1 : S.bossHP > S.maxHP * 0.33 ? 2 : 3;
    if (ph > S.phase) {
      S.phase = ph; S.timer = 2;
      shout(ph === 2 ? 'אתה רק חול! וחול נושב ברוח!' : 'נפירה... גם את תיפלי איתו!');
    }
    if (S.bossHP <= 0) { S.active = false; clearFx(); wall.visible = false; $('bossbar').classList.add('hidden'); $('hpbar').classList.add('hidden'); onWin?.(); }
  }

  // ---------------------------------------------------------------- player actions
  function shoot() {
    if (!S.active || S.paused || S.shootCD > 0) return;
    S.shootCD = 0.32;
    const hero = getHero();
    const m = new THREE.Mesh(boltGeo, boltMat); m.position.set(hero.pos.x, hero.pos.y + 11, hero.pos.z); fx.add(m);
    let target = null, best = 60;
    for (const w of S.wraiths) { const d = w.mesh.position.distanceTo(m.position); if (d < best) { best = d; target = w; } }
    S.bolts.push({ mesh: m, target, life: 2.5, vel: new THREE.Vector3(Math.sin(hero.facing), 0.15, Math.cos(hero.facing)).multiplyScalar(130) });
  }
  function burst() {
    if (!S.active || S.paused || S.burstCD > 0) return;
    S.burstCD = 6;
    const hero = getHero();
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.6, 8, 48), burstMat.clone()); m.rotation.x = Math.PI / 2;
    m.position.set(hero.pos.x, hero.pos.y + 3, hero.pos.z); fx.add(m); S.bursts.push({ mesh: m, t: 0 });
    puff(hero.pos.x, hero.pos.y, hero.pos.z, 40, 2);
    for (const w of S.wraiths) if (w.mesh.position.distanceTo(hero.pos) < 50) w.hp = 0;
    tmp.set(bossPos.x, hero.pos.y, bossPos.z);
    if (tmp.distanceTo(hero.pos) < 60) damageBoss(30);
  }

  // ---------------------------------------------------------------- boss attacks
  function attackOrbs(n) {
    for (let k = 0; k < n; k++) {
      const hand = king.hands[k % 2]; hand.userData.tip.getWorldPosition(tmp);
      const m = new THREE.Mesh(orbGeo, orbMat); m.position.copy(tmp); fx.add(m);
      S.orbs.push({ mesh: m, life: 6, home: 1.2, delay: k * 0.25, vel: new THREE.Vector3() });
    }
  }
  function attackSlam() { S.slamT = 0; }
  function spawnWave() {
    const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.8, 6, 64), waveMat); m.rotation.x = Math.PI / 2;
    m.position.set(bossPos.x, groundY + 1, bossPos.z); fx.add(m);
    S.waves.push({ mesh: m, r: 4, hit: false });
    puff(bossPos.x, groundY, bossPos.z, 50, 3);
  }
  function attackWraiths() {
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2, m = buildWraith();
      m.position.set(ARENA.x + Math.cos(a) * 110, groundY + 2, ARENA.z + Math.sin(a) * 110); fx.add(m);
      S.wraiths.push({ mesh: m, hp: 16 });
    }
  }
  function attackRain() {
    const hero = getHero();
    for (let k = 0; k < 6; k++) {
      const x = hero.pos.x + (k === 0 ? 0 : (Math.random() - 0.5) * 70), z = hero.pos.z + (k === 0 ? 0 : (Math.random() - 0.5) * 70);
      const m = new THREE.Mesh(new THREE.CircleGeometry(10, 32).rotateX(-Math.PI / 2), markMat.clone());
      m.position.set(x, groundAt(x, z) + 0.6, z); fx.add(m);
      S.marks.push({ mesh: m, t: 0 });
    }
  }

  // ---------------------------------------------------------------- per frame
  function update(dt, t) {
    S.t = t;
    if (!king.g.visible) return;
    king.crown.rotation.z += dt * 0.8;
    king.ringMat.emissiveIntensity = 2.5 + Math.sin(t * 4) * 0.8;
    if (!S.active) return;
    const hero = getHero();
    heroC.set(hero.pos.x, hero.pos.y + 8, hero.pos.z);
    S.shootCD = Math.max(0, S.shootCD - dt); S.burstCD = Math.max(0, S.burstCD - dt);
    S.hurtT += dt; if (S.hurtT > 4 && S.hp < 100 && !S.paused) S.hp = Math.min(100, S.hp + 3 * dt);

    // keep the hero inside the arena
    tmp.set(hero.pos.x - ARENA.x, 0, hero.pos.z - ARENA.z);
    if (tmp.length() > ARENA.r - 6) { tmp.setLength(ARENA.r - 6); hero.pos.x = ARENA.x + tmp.x; hero.pos.z = ARENA.z + tmp.z; }

    // boss hovers around the arena and faces the hero
    const a = t * 0.18;
    const tx = ARENA.x + Math.cos(a) * 45, tz = ARENA.z + 30 + Math.sin(a) * 35;
    bossPos.x += (tx - bossPos.x) * Math.min(1, dt * 0.8); bossPos.z += (tz - bossPos.z) * Math.min(1, dt * 0.8);
    bossPos.y = groundY + Math.sin(t * 1.2) * 0.4;   // stands on its four legs
    king.g.position.copy(bossPos);
    king.g.rotation.y = Math.atan2(hero.pos.x - bossPos.x, hero.pos.z - bossPos.z);
    core.copy(bossPos).add(new THREE.Vector3(0, 27, 0));
    king.dark.emissive.setHex(S.flash > 0 ? 0xffffff : 0x3a0f55); S.flash -= dt;

    // slam animation: raise hands, then strike
    if (S.slamT >= 0) {
      S.slamT += dt;
      const ang = S.slamT < 0.9 ? -2.6 * (S.slamT / 0.9) : -2.6 + 2.1 * Math.min(1, (S.slamT - 0.9) * 6);   // raise the claws, then slam
      king.hands.forEach((h) => { h.rotation.x = ang; });
      if (S.slamT > 1.06 && !S.slamDone) { S.slamDone = true; spawnWave(); if (S.phase >= 3) setTimeout(spawnWave, 600); }
      if (S.slamT > 1.8) { S.slamT = -1; S.slamDone = false; }
    } else king.hands.forEach((h, i) => { h.rotation.x = Math.sin(t * 2 + i) * 0.12 - 0.1; });

    // choose the next attack
    if (!S.paused) {
      S.timer -= dt;
      if (S.timer <= 0) {
        const opts = ['orbs', 'slam']; if (S.phase >= 2) opts.push('wraiths'); if (S.phase >= 3) opts.push('rain');
        const pick = opts[Math.floor(Math.random() * opts.length)];
        if (pick === 'orbs') attackOrbs(3 + S.phase * 2);
        if (pick === 'slam') attackSlam();
        if (pick === 'wraiths' && S.wraiths.length < 4) attackWraiths();
        if (pick === 'rain') attackRain();
        S.timer = 3.4 - S.phase * 0.55 + Math.random() * 0.8;
      }
    }

    // orbs
    for (let i = S.orbs.length - 1; i >= 0; i--) {
      const o = S.orbs[i]; if (S.pendingClear) break;
      if (o.delay > 0) { o.delay -= dt; continue; }
      o.life -= dt;
      if (o.home > 0) { o.home -= dt; tmp.copy(heroC).sub(o.mesh.position).setLength(42 + S.phase * 8); o.vel.lerp(tmp, Math.min(1, dt * 4)); }
      o.mesh.position.addScaledVector(o.vel, dt);
      if (o.mesh.position.distanceTo(heroC) < 6.5) { hurt(10); o.life = 0; puff(o.mesh.position.x, o.mesh.position.y - 4, o.mesh.position.z, 12, 1); }
      if (o.life <= 0 || o.mesh.position.y < groundAt(o.mesh.position.x, o.mesh.position.z)) { fx.remove(o.mesh); S.orbs.splice(i, 1); }
    }
    // shockwaves (jump over them)
    for (let i = S.waves.length - 1; i >= 0; i--) {
      const w = S.waves[i]; if (S.pendingClear) break; w.r += dt * 62; w.mesh.scale.set(w.r, w.r, 1);
      const d = Math.hypot(hero.pos.x - bossPos.x, hero.pos.z - bossPos.z);
      if (!w.hit && Math.abs(d - w.r) < 3.5 && hero.pos.y - groundAt(hero.pos.x, hero.pos.z) < 3) { w.hit = true; hurt(15); }
      if (w.r > ARENA.r + 20) { fx.remove(w.mesh); S.waves.splice(i, 1); }
    }
    // wraiths
    for (let i = S.wraiths.length - 1; i >= 0; i--) {
      const w = S.wraiths[i]; if (S.pendingClear) break;
      tmp.set(hero.pos.x - w.mesh.position.x, 0, hero.pos.z - w.mesh.position.z);
      const d = tmp.length();
      w.mesh.position.addScaledVector(tmp.normalize(), dt * 24);
      w.mesh.position.y = groundAt(w.mesh.position.x, w.mesh.position.z) + 2 + Math.sin(t * 3 + i) * 0.8;
      w.mesh.rotation.y = Math.atan2(tmp.x, tmp.z);
      if (d < 7) { hurt(8); w.hp = 0; }
      if (w.hp <= 0) { puff(w.mesh.position.x, w.mesh.position.y, w.mesh.position.z, 20, 1.2); fx.remove(w.mesh); S.wraiths.splice(i, 1); }
    }
    // eclipse rain: marked circles explode after a moment
    for (let i = S.marks.length - 1; i >= 0; i--) {
      const m = S.marks[i]; if (S.pendingClear) break; m.t += dt;
      m.mesh.material.opacity = 0.25 + 0.4 * Math.abs(Math.sin(m.t * 10));
      if (m.t > 1.4) {
        const d = Math.hypot(hero.pos.x - m.mesh.position.x, hero.pos.z - m.mesh.position.z);
        if (d < 10) hurt(18);
        puff(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, 25, 2);
        fx.remove(m.mesh); S.marks.splice(i, 1);
      }
    }
    // hero bolts
    for (let i = S.bolts.length - 1; i >= 0; i--) {
      const b = S.bolts[i]; b.life -= dt;
      const goal = b.target && b.target.hp > 0 ? tmp.copy(b.target.mesh.position).add(new THREE.Vector3(0, 4, 0)) : tmp.copy(core);
      const want = goal.clone().sub(b.mesh.position).setLength(140);
      b.vel.lerp(want, Math.min(1, dt * 6));
      b.mesh.position.addScaledVector(b.vel, dt); b.mesh.rotation.y += dt * 10;
      let hit = false;
      if (b.target && b.target.hp > 0 && b.mesh.position.distanceTo(goal) < 4) { b.target.hp -= 8; hit = true; }
      else if (b.mesh.position.distanceTo(core) < 11) { damageBoss(8); hit = true; }
      if (hit || b.life <= 0) { if (hit) puff(b.mesh.position.x, b.mesh.position.y - 3, b.mesh.position.z, 6, 0.6); fx.remove(b.mesh); S.bolts.splice(i, 1); }
      if (!S.active) break;
    }
    // light bursts
    for (let i = S.bursts.length - 1; i >= 0; i--) {
      const b = S.bursts[i]; b.t += dt; const r = 4 + b.t * 90; b.mesh.scale.set(r, r, 1); b.mesh.material.opacity = Math.max(0, 0.8 - b.t * 1.6);
      if (b.t > 0.5) { fx.remove(b.mesh); S.bursts.splice(i, 1); }
    }
    if (S.pendingClear) { S.pendingClear = false; clearFx(); }
    updateBars();
  }

  return {
    start, stop, update, shoot, burst, place, show, king, _damage: (n) => damageBoss(n), _hurt: (n) => hurt(n),
    get active() { return S.active; }, get paused() { return S.paused; }, get deaths() { return S.deaths; }, bossPos,
  };
}
