// story.js — the plot: characters, dialogue, quests, puzzles, riddles, memories and the journal.
//
// Chapters (in a natural order — several can be done in parallel):
//   1. Awakening        — Nefira's spirit on the sphinx avenue
//   2. Words of the Sun — find Old Tamun (west), bring him 5 gold tablets
//   3. Dawn Shard       — order-of-stones puzzle at the eastern shrine
//   4. The lost caravan — Lina calls for help; rescue Yasif's caravan at the oasis (optional, changes endings)
//   5. Keeper of Bones  — three riddles in the south unlock the Sunset Shard
//   6. Noon Shard       — appears only after 11:00; a longer stone puzzle
//   7. The Sisters      — wake 3 mirrors on the small pyramids to reveal the Night Shard
//   8. The Gate         — opens only at 14:00 (= 40 real minutes of play). Nefira's last words, then the choice.
//   + 7 golden memory scarabs that reveal Kharu's past (optional lore, recorded in the journal)
import * as THREE from 'three';
import { Batch, MAT, rockGeometry, rng } from './util.js';
import { PYR, SHARD_SITES, SATELLITES, CAMP, colliders, groundAt } from './world.js';

const $ = (id) => document.getElementById(id);
export const GATE_HOUR = 14;          // 06:00 + 8 world hours = 40 real minutes
export const NOON_HOUR = 11;

export const SPEAKERS = {
  nefira: { name: 'נפירה, רוח הכוהנת', color: '#8fd3ff' },
  tamun: { name: 'תאמון הזקן', color: '#ffd36a' },
  sethar: { name: 'קול מן הפירמידה', color: '#ff5a46' },
  lina: { name: 'לינה', color: '#ff9ad5' },
  yasif: { name: 'יאסיף, ראש השיירה', color: '#9be38a' },
  keeper: { name: 'שומר העצמות', color: '#7affc0' },
  kharu: { name: 'חארו', color: '#ffb84a' },
  memory: { name: 'זיכרון עתיק', color: '#e8d7a8' },
};

export const TABLETS = [
  { x: -560, z: 600, text: '"השמש נולדת בשחר, ומי שזוכר את סדר האבנים יעיר אותה."' },
  { x: -880, z: -220, text: '"בצהריים היא עומדת גבוה. רק הסבלני יראה את פניה."' },
  { x: -150, z: -560, text: '"בשקיעה היא נחה בין עצמות החיה שבלעה את הירח."' },
  { x: 380, z: 760, text: '"בלילה היא ישנה, עד שהאחיות יחזירו לה את האור."' },
  { x: 860, z: -40, text: '"ארבעתן יחד יחתמו את השמש האפלה, או ישחררו אותה."' },
];
export const MEMORIES = [
  { x: 130, z: 860, text: 'אני זוכר ידיים. ידיים קטנות וחמות שלשו חול רטוב לאור הירח. "תתעורר", לחשה. "העיר צריכה אותך".' },
  { x: -450, z: -60, text: 'כם-אשר הייתה עיר של אלף גנים. נהר כחול זרם בה, ואני הייתי רק פסל חול בחצר המקדש, מקשיב לילדים צוחקים.' },
  { x: 300, z: 380, text: 'סת\'אר עמד על גג הארמון וצעק אל השמש: "לעולם לא תשקעי!". באותו לילה נולד החושך הראשון.' },
  { x: -120, z: -880, text: 'נפירה בכתה כשבנתה אותי. היא אמרה שאחיה היה פעם ילד טוב, ילד שפחד מהחושך יותר מכל דבר אחר.' },
  { x: 960, z: 240, text: 'הפירמידה נבנתה ב-24 שעות בדיוק. הבונים שרו בזמן שהשחירו את האבנים, ואף אחד מהם לא שב הביתה.' },
  { x: -940, z: 420, text: 'השמש התנפצה לארבעה. ראיתי את הרסיסים בורחים: אחד אל השחר, אחד אל הצהריים, אחד אל השקיעה ואחד אל הלילה.' },
  { x: 620, z: -620, text: 'נפירה נתנה לי את האור שבליבה והפכה לרוח. "כל 3000 שנה", אמרה, "תצטרך לבחור מחדש מי אתה".' },
];
export const NPC_POS = {
  nefira: new THREE.Vector3(0, 0, 222),
  tamun: new THREE.Vector3(-715, 0, 125),
  keeper: new THREE.Vector3(-232, 0, 800),
  yasif: new THREE.Vector3(CAMP.x - 16, 0, CAMP.z + 20),
};
const RIDDLES = [
  { q: 'ככל שלוקחים ממני יותר, אני נעשה גדול יותר. מה אני?', a: ['בור', 'צל', 'שקר'], ok: 0 },
  { q: 'אני הולך אחריך ביום ונעלם בלילה. נולדתי מן האור, אבל אני עצמי חושך. מה אני?', a: ['רוח', 'צל', 'זיכרון'], ok: 1 },
  { q: 'ועכשיו חידה שרק מי שזוכר יכול לפתור: מה שבר את השמש לארבעה?', a: ['חרבו של סת\'אר', 'קללתה של נפירה', 'הפחד של סת\'אר מן החושך'], ok: 2 },
];

export function defaultFlags() {
  return {
    metNefira: false, metTamun: false, tablets: [false, false, false, false, false], words: false,
    puzzle: [false, false], riddles: false, keeperCooldown: 0, mirrors: [false, false, false],
    linaCalled: false, promise: false, metYasif: false, starMap: false, memories: [false, false, false, false, false, false, false],
    whispers: 0, gateAnnounced: false, finalTalk: false, log: [],
  };
}

// ================================================================ dialogue box
function createDialog(hooks = {}) {
  const box = $('dialog'), nameEl = $('dlg-name'), textEl = $('dlg-text'), choicesEl = $('dlg-choices'), hint = $('dlg-hint');
  let cur = null, depth = 0;
  function say(sp, text, choices = null) {
    return new Promise((resolve) => {
      const s = SPEAKERS[sp];
      hooks.onSay?.(sp);
      box.classList.remove('hidden'); box.style.setProperty('--sp', s.color);
      nameEl.textContent = s.name; textEl.textContent = ''; choicesEl.innerHTML = ''; hint.classList.add('hidden');
      cur = { full: text, shown: 0, resolve, choices };
    });
  }
  function revealChoices() {
    if (!cur.choices) { hint.classList.remove('hidden'); return; }
    if (choicesEl.childElementCount) return;
    cur.choices.forEach((c, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = `${i + 1}. ${c}`;
      b.onclick = (e) => { e.stopPropagation(); finish(i); };
      choicesEl.appendChild(b);
    });
  }
  function finish(i) { const r = cur.resolve; cur = null; r(i); }
  function advance() {
    if (!cur) return;
    if (cur.shown < cur.full.length) { cur.shown = cur.full.length; textEl.textContent = cur.full; revealChoices(); return; }
    if (!cur.choices) finish(0);
  }
  function choose(i) { if (cur && cur.choices && cur.shown >= cur.full.length && i < cur.choices.length) finish(i); }
  function update(dt) {
    if (!cur || cur.shown >= cur.full.length) return;
    cur.shown = Math.min(cur.full.length, cur.shown + dt * 55);
    textEl.textContent = cur.full.slice(0, Math.floor(cur.shown));
    if (cur.shown >= cur.full.length) revealChoices();
  }
  async function run(fn) {
    if (!depth) hooks.onBegin?.();
    depth++;
    try { await fn(); } finally { depth--; if (!depth) { box.classList.add('hidden'); hooks.onEnd?.(); } }
  }
  box.addEventListener('click', advance);
  return { say, advance, choose, update, run, get busy() { return depth > 0; }, close() { box.classList.add('hidden'); } };
}

// ================================================================ characters & story props (primitives only)
const ghostMat = new THREE.MeshStandardMaterial({ color: 0xa8e0ff, emissive: 0x4fa8ff, emissiveIntensity: 1.3, transparent: true, opacity: 0.72, roughness: 0.4, flatShading: true });
const ghostGold = new THREE.MeshStandardMaterial({ color: 0xffe3a0, emissive: 0xffb52e, emissiveIntensity: 1.6, transparent: true, opacity: 0.85 });
const spiritGreen = new THREE.MeshBasicMaterial({ color: 0x7affc0, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
const cyl = (a, b, h, s = 12) => new THREE.CylinderGeometry(a, b, h, s);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, w = 12, h = 8, ...x) => new THREE.SphereGeometry(r, w, h, ...x);

export function buildNefira() {
  const b = new Batch();
  b.add(new THREE.ConeGeometry(1.7, 6, 16, 1, true), ghostMat, [0, 3, 0]);
  b.add(cyl(0.55, 0.8, 2.2, 12), ghostMat, [0, 6.6, 0]);
  b.add(sph(0.6, 14, 10), ghostMat, [0, 8.3, 0]);
  b.add(new THREE.TorusGeometry(0.85, 0.14, 6, 24, Math.PI), ghostGold, [0, 7.6, 0.1], [Math.PI / 2 + 0.3, 0, 0]);
  b.add(sph(0.66, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), ghostGold, [0, 8.4, 0]);                         // vulture crown
  for (const s of [-1, 1]) {
    b.add(box(0.25, 1.3, 0.7), ghostGold, [s * 0.62, 7.9, 0], [0, 0, s * 0.15]);
    b.add(cyl(0.18, 0.22, 2.2, 8), ghostMat, [s * 1.1, 6.5, 0.4], [0.6, 0, s * 0.9]);                       // arms
    for (let k = 0; k < 6; k++) b.add(box(0.18, 3.6 - k * 0.4, 0.06), ghostMat, [s * (1.0 + k * 0.42), 6.8 - k * 0.15, -0.5], [0, 0, s * (0.9 + k * 0.08)]); // spirit wings
  }
  b.add(new THREE.TorusGeometry(0.35, 0.08, 6, 16), ghostGold, [1.9, 7.1, 1.2]);                             // ankh
  b.add(box(0.12, 0.9, 0.12), ghostGold, [1.9, 6.4, 1.2]); b.add(box(0.7, 0.12, 0.12), ghostGold, [1.9, 6.6, 1.2]);
  const g = b.build({ cast: false }); g.scale.setScalar(1.35); return g;
}
export function buildHuman(robe, { beard = false, staff = false, scale = 1.3, turban = MAT.cloth } = {}) {
  const b = new Batch();
  b.add(new THREE.ConeGeometry(0.8, 2.7, 12), robe, [0, 1.35, 0]);
  b.add(cyl(0.48, 0.62, 0.25, 12), MAT.red, [0, 1.95, 0]);
  b.add(sph(0.37, 12, 8), MAT.leather, [0, 3.0, 0]);
  for (const s of [-1, 1]) b.add(sph(0.05, 6, 4), MAT.black, [s * 0.13, 3.05, 0.33]);
  b.add(new THREE.TorusGeometry(0.34, 0.14, 6, 14), turban, [0, 3.22, 0], [Math.PI / 2, 0, 0]);
  b.add(sph(0.34, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), turban, [0, 3.27, 0]);
  if (beard) b.add(new THREE.ConeGeometry(0.25, 0.8, 8), MAT.bone, [0, 2.55, 0.25], [Math.PI, 0, 0]);
  for (const s of [-1, 1]) b.add(cyl(0.12, 0.15, 1.3, 6), robe, [s * 0.62, 2.05, 0.1], [0.3, 0, s * 0.35]);
  if (staff) {
    b.add(cyl(0.06, 0.07, 4.2, 6), MAT.wood, [0.9, 2.1, 0.4]);
    b.add(box(0.35, 0.45, 0.35), MAT.goldGlow, [0.9, 4.35, 0.4]);
  }
  const g = b.build(); g.scale.setScalar(scale); return g;
}
export function buildTamunCamp() {
  const b = new Batch();
  b.add(new THREE.ConeGeometry(4, 4.2, 6, 1, true), MAT.cloth, [-7, 2.1, -5]);
  for (let k = 0; k < 6; k++) b.add(box(1.4, 0.15, 1.9), MAT.stonePale, [-2 + (k % 3) * 1.6, 0.1 + Math.floor(k / 3) * 0.16, 4], [0, k * 0.3, 0]);   // scrolls/tablets
  for (let k = 0; k < 4; k++) b.add(cyl(0.18, 0.18, 1.3, 8), MAT.cloth, [3, 0.2 + k * 0.36, 3], [0, 0, Math.PI / 2]);
  b.add(box(2.5, 1.1, 1.6), MAT.wood, [3.5, 0.55, -2]);
  for (let k = 0; k < 7; k++) b.add(rockGeometry(0.35, 0, k, 0.3), MAT.stoneDark, [Math.cos(k) * 1.3, 0.2, Math.sin(k) * 1.3 + 7]);
  b.add(new THREE.ConeGeometry(0.8, 1.8, 8, 1, true), MAT.goldGlow, [0, 0.9, 7]);
  return b.build();
}
export function buildKeeper() {
  const g = new THREE.Group();
  const b = new Batch();
  b.add(rockGeometry(1, 1, 31, 0.15), MAT.bone, [0, 0, 0], [0, 0, 0], [3.2, 2.8, 3.6]);
  b.add(box(4, 1.2, 3), MAT.bone, [0, -2.6, 1.2]);
  for (let k = 0; k < 8; k++) b.add(new THREE.ConeGeometry(0.22, 1, 5), MAT.bone, [-1.6 + k * 0.45, -1.8, 2.7], [Math.PI, 0, 0]);
  for (const s of [-1, 1]) { b.add(sph(0.75, 10, 8), MAT.black, [s * 1.3, 0.4, 3.0]); b.add(new THREE.ConeGeometry(0.5, 4, 8), MAT.bone, [s * 2.2, 2.6, 0], [0, 0, s * -0.6]); }
  g.add(b.build({ cast: false }));
  const eyes = [];
  for (const s of [-1, 1]) { const e = new THREE.Mesh(sph(0.35, 10, 8), spiritGreen); e.position.set(s * 1.3, 0.4, 3.3); g.add(e); eyes.push(e); }
  const flames = [];
  for (let k = 0; k < 7; k++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.6 + (k % 3) * 0.2, 3 + (k % 2), 8, 1, true), spiritGreen);
    const a = (k / 7) * Math.PI * 2; f.position.set(Math.cos(a) * 3.2, 2 + (k % 2), Math.sin(a) * 3.2); g.add(f); flames.push(f);
  }
  return { g, flames };
}
export function buildTablet() {
  const g = new THREE.Group();
  const b = new Batch();
  b.add(box(3, 2, 3), MAT.sandstone, [0, 1, 0]);
  b.add(box(3.3, 0.3, 3.3), MAT.stoneDark, [0, 2.1, 0]);
  b.add(box(2, 2.8, 0.3), MAT.gold, [0, 3.7, 0], [-0.2, 0, 0]);
  for (let k = 0; k < 4; k++) b.add(box(1.5 - (k % 2) * 0.5, 0.12, 0.08), MAT.goldGlow, [0, 4.6 - k * 0.55, 0.18 - k * 0.1], [-0.2, 0, 0]);
  g.add(b.build());
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.2, 260, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 132; g.add(beam);
  return g;
}
export function buildScarab() {
  const b = new Batch();
  b.add(sph(1, 14, 10), MAT.gold, [0, 0, 0], [0, 0, 0], [0.9, 0.5, 1.2]);
  b.add(sph(0.45, 10, 8), MAT.gold, [0, 0.05, 1.25], [0, 0, 0], [1, 0.7, 0.8]);
  for (const s of [-1, 1]) {
    b.add(box(0.85, 0.08, 1.9), MAT.lapis, [s * 0.45, 0.35, -0.1], [0, s * 0.12, s * 0.25]);
    for (let k = 0; k < 3; k++) b.add(cyl(0.05, 0.04, 1, 5), MAT.gold, [s * 0.95, -0.2, 0.6 - k * 0.6], [0, 0, s * 1.1]);
  }
  b.add(sph(0.35, 10, 8), MAT.goldGlow, [0, 0.5, 1.4]);  // sun disc held by the scarab
  const g = b.build({ cast: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.6, 40, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.y = 20; g.add(beam);
  return g;
}
function buildStone(color) {
  const g = new THREE.Group();
  const b = new Batch();
  b.add(box(3, 1, 3), MAT.stoneDark, [0, 0.5, 0]);
  b.add(new THREE.CylinderGeometry(0.9, 1.3, 6, 4).rotateY(Math.PI / 4), MAT.basalt, [0, 4, 0]);
  b.add(new THREE.ConeGeometry(0.95, 1.4, 4).rotateY(Math.PI / 4), MAT.gold, [0, 7.7, 0]);
  g.add(b.build());
  const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0.25 });
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), mat); gem.position.set(0, 4.5, 1.0); gem.scale.set(1, 1.5, 0.5);
  g.add(gem);
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 6, 32), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.4; g.add(ring);
  return { g, mat, ringMat, color };
}

// ================================================================ the story controller
export function createStory(ctx) {
  const { scene, world, golem, getState, toast, hour, hoursLeft, endGame, openGateChoice, elapsed, puff } = ctx;
  let pendingNpc = null, speaking = null;
  const dialog = createDialog({
    onSay: (sp) => { speaking = sp; ctx.cinema.speaker(sp); },
    onBegin: () => { ctx.cinema.beginTalk(pendingNpc); },
    onEnd: () => { pendingNpc = null; speaking = null; ctx.cinema.endTalk(); },
  });
  const NPC_FRAME = {
    nefira: { h: 12, stand: 26 }, tamun: { h: 6, stand: 15 }, keeper: { h: 14, stand: 30 }, yasif: { h: 5, stand: 15 }, gate: { h: 22, stand: 10 },
  };
  /** run a conversation with a character: the hero walks up, the camera frames the speakers */
  function talkTo(key, fn) {
    const p = key === 'gate' ? PYR.GATE : NPC_POS[key];
    pendingNpc = { npc: new THREE.Vector3(p.x, groundAt(p.x, p.z), p.z), ...NPC_FRAME[key], key };
    dialog.run(fn);
  }
  const F = () => getState().f;
  const say = dialog.say;
  const log = (text) => { const f = F(); if (!f.log.includes(text)) f.log.push(text); };

  // ---- place characters
  const nefira = buildNefira(); nefira.position.copy(NPC_POS.nefira).setY(groundAt(NPC_POS.nefira.x, NPC_POS.nefira.z) + 1.5); scene.add(nefira);
  const tamun = buildHuman(MAT.leather, { beard: true, staff: true, scale: 1.5 });
  tamun.position.copy(NPC_POS.tamun).setY(groundAt(NPC_POS.tamun.x, NPC_POS.tamun.z)); tamun.rotation.y = 0.9; scene.add(tamun);
  const tcamp = buildTamunCamp(); tcamp.position.copy(tamun.position); scene.add(tcamp);
  const keeper = buildKeeper(); keeper.g.position.copy(NPC_POS.keeper).setY(groundAt(NPC_POS.keeper.x, NPC_POS.keeper.z) + 9); keeper.g.rotation.y = Math.PI + 0.5; scene.add(keeper.g);
  const yasif = buildHuman(MAT.turquoise, { beard: true, staff: true, scale: 1.4 });
  const lina = buildHuman(MAT.redDark, { scale: 0.95, turban: MAT.gold });
  const yp = new THREE.Vector3(NPC_POS.yasif.x, groundAt(NPC_POS.yasif.x, NPC_POS.yasif.z), NPC_POS.yasif.z);
  yasif.position.copy(yp); lina.position.copy(yp).add(new THREE.Vector3(2.5, 0, 1)); yasif.rotation.y = lina.rotation.y = Math.PI * 0.85;
  scene.add(yasif, lina);
  for (const p of [NPC_POS.nefira, NPC_POS.tamun, NPC_POS.yasif]) colliders.push({ type: 'circle', x: p.x, z: p.z, r: 2 });

  const tablets = TABLETS.map((t) => { const g = buildTablet(); g.position.set(t.x, groundAt(t.x, t.z), t.z); g.visible = false; scene.add(g); colliders.push({ type: 'circle', x: t.x, z: t.z, r: 2.2 }); return { ...t, g }; });
  const scarabs = MEMORIES.map((m) => { const g = buildScarab(); g.position.set(m.x, groundAt(m.x, m.z) + 2, m.z); scene.add(g); return { ...m, g }; });

  // ---- order-of-stones puzzles at the Dawn (0) and Noon (1) shrines
  const STONE_COLORS = [0xff5a3c, 0x5ad1ff, 0x9bff5a, 0xffd34a, 0xd18cff];
  const puzzles = [{ shard: 0, n: 4, len: 5 }, { shard: 1, n: 5, len: 7 }].map((p, pi) => {
    const site = SHARD_SITES[p.shard], r = rng(77 + pi);
    const stones = [];
    for (let j = 0; j < p.n; j++) {
      const a = (j / p.n) * Math.PI * 2 + 0.4, x = site.x + Math.cos(a) * 31, z = site.z + Math.sin(a) * 31;
      const st = buildStone(STONE_COLORS[j]); st.g.position.set(x, groundAt(x, z), z); st.g.rotation.y = -a - Math.PI / 2; scene.add(st.g);
      colliders.push({ type: 'circle', x, z, r: 1.8 });
      stones.push({ ...st, x, z, flash: 0, flashColor: null });
    }
    const seq = []; for (let k = 0; k < p.len; k++) seq.push(Math.floor(r() * p.n));
    return { ...p, site, stones, seq, step: 0, showT: -1, ready: false };
  });

  // ---- the three "sisters": mirrors on the small pyramids that beam light to the Night shrine
  const night = SHARD_SITES[3];
  const mirrors = SATELLITES.map((s) => {
    const y = groundAt(s.x, s.z) + 1.5 + s.h + 7;
    const g = new THREE.Group(); g.position.set(s.x, y, s.z);
    const b = new Batch();
    b.add(new THREE.TorusGeometry(3, 0.3, 8, 32), MAT.gold);
    b.add(cyl(2.7, 2.7, 0.2, 32), new THREE.MeshStandardMaterial({ color: 0xdfe8ff, metalness: 1, roughness: 0.05 }), [0, 0, 0], [Math.PI / 2, 0, 0]);
    g.add(b.build({ cast: false })); scene.add(g);
    const target = new THREE.Vector3(night.x, groundAt(night.x, night.z) + 12, night.z);
    const dir = target.clone().sub(g.position); const len = dir.length();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, len, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.position.copy(g.position).addScaledVector(dir, 0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    beam.visible = false; scene.add(beam);
    return { g, beam, x: s.x, z: s.z + s.half + 12, progress: 0 };
  });
  let caravanProgress = 0;

  // ---- quest marker floating over the current objective
  const marker = new THREE.Group();
  const mb = new Batch();
  mb.add(new THREE.ConeGeometry(1.4, 3.2, 4), MAT.goldGlow, [0, 0, 0], [Math.PI, 0, 0]);
  mb.add(new THREE.TorusGeometry(1.9, 0.18, 6, 24), MAT.goldGlow, [0, 2.4, 0], [Math.PI / 2, 0, 0]);
  marker.add(mb.build({ cast: false })); scene.add(marker);

  // ================================================================ helpers
  const S = () => getState();
  const shardsTaken = () => S().shards.filter(Boolean).length;
  const gateOpen = () => hour() >= GATE_HOUR || elapsed() >= 2400;
  const minsToGate = () => Math.max(0, Math.ceil((2400 - elapsed()) / 60));
  function unlocked(i) {
    const f = F();
    if (i === 0) return f.puzzle[0];
    if (i === 1) return f.puzzle[1];
    if (i === 2) return f.riddles;
    return f.mirrors.every(Boolean);
  }

  // ================================================================ scripted scenes
  async function sceneNefira() {
    const f = F();
    if (!f.metNefira) {
      await say('nefira', 'חארו... משמר החול. סוף סוף פקחת את עיניך.');
      await say('nefira', 'אני נפירה, הכוהנת שיצרה אותך מחול העיר כם-אשר. מה שאתה רואה מולך הוא רק רוח, הד של מי שהייתי פעם.');
      await say('kharu', '...נפירה. השם הזה חם, כמו אבן בשמש. אבל אני לא זוכר כמעט דבר.');
      await say('nefira', 'הזיכרונות שלך התפזרו במדבר, כמו חיפושיות זהב. אולי תמצא אותם בדרך.');
      await say('nefira', 'הקשב לי היטב. הפירמידה השחורה מתעוררת. בתוכה כלואה השמש האפלה של אחי, סת\'אר, מלך הליקוי.');
      await say('nefira', 'בעוד 24 שעות החותם שלי יישבר, והחושך יבלע את המדבר כולו: כל דיונה, כל נווה, כל נשמה.');
      const c = await say('nefira', 'כדי לחתום אותה מחדש תצטרך את ארבעת רסיסי השמש. אבל המקדשים שלהם נעולים במילים עתיקות שאני כבר לא זוכרת.', ['מה יקרה אם אכשל?', 'למה אחיך עשה את זה?', 'איפה אמצא את המילים?']);
      if (c === 0) await say('nefira', 'אז השמש לא תזרח עוד לעולם. ואתה... תהפוך לעוד גרגר חול בסופה.');
      if (c === 1) await say('nefira', 'סת\'אר רצה יום שלא נגמר. הוא חשב שאם ישלוט בשמש, לא יצטרך לפחד עוד. זה תמיד מתחיל בפחד, חארו.');
      await say('nefira', 'במערב, ליד ראש הפסל הקבור בחול, חי חכם זקן בשם תאמון. הוא קורא את כתב האבות. לך אליו.');
      await say('nefira', 'ודבר אחרון: שער הפירמידה לא ייפתח לפני השעה 14:00, כשצל האובליסק נוגע בדלת. עד אז, אסוף את כוחך.');
      f.metNefira = true; log('נפירה, רוח הכוהנת, שלחה אותי אל תאמון החכם במערב.');
      toast('משימה חדשה: מצא את תאמון הזקן במערב');
      return;
    }
    const n = shardsTaken();
    const lines = [
      'תאמון מחכה לך במערב, ליד ראש הפסל הקבור.',
      'כל רסיס שתאסוף יחזק אותך. אבל גם יקרב אותך לקולו של אחי. אל תקשיב לו.',
      'אני מרגישה את השמש מתאחדת. עוד קצת, חארו.',
      'כמעט. אני מבקשת ממך רק דבר אחד: כשתעמוד מול השער, זכור למה נוצרת.',
      gateOpen() ? 'השער פתוח. לך אליו. אני אחכה לך שם.' : `ארבעת הרסיסים איתך. השער ייפתח בעוד כ-${minsToGate()} דקות. בינתיים חפש את הזיכרונות שלך.`,
    ];
    await say('nefira', f.metTamun ? lines[n] : lines[0]);
    if (f.memories.every(Boolean) && !f.truthTold) {
      await say('nefira', 'אתה... זוכר הכול עכשיו. אז אתה יודע גם את האמת.');
      await say('nefira', 'אני זו שנעלתי את אחי בפירמידה. לא כי שנאתי אותו, אלא כי אהבתי אותו מספיק כדי לעצור אותו.');
      await say('nefira', 'סת\'אר ינסה לשכנע אותך שאני הבוגדת. אולי הוא צודק. אבל ההחלטה עכשיו שלך, לא שלי.');
      f.truthTold = true; log('נפירה גילתה לי את האמת: היא כלאה את אחיה מתוך אהבה.');
    }
  }

  async function sceneTamun() {
    const f = F();
    if (!f.metTamun) {
      await say('tamun', 'הו! גולם מהלך! חשבתי שזו עוד הזיה של החום.');
      await say('tamun', 'חכה... השריון, העיניים... חארו? משמר החול מהאגדות? ארבעים שנה אני מפענח את הכתובות האלה, ואתה עומד מולי!');
      const c = await say('tamun', 'מה מביא את השומר אל זקן כמוני?', ['נפירה שלחה אותי', 'אני צריך את מילות השמש']);
      if (c === 0) await say('tamun', 'הכוהנת עצמה? אם רוחה התעוררה, המצב גרוע ממה שחשבתי.');
      await say('tamun', 'מילות השמש... כן. הן נחרטו על חמישה לוחות זהב, שהתפזרו כשהעיר נקברה.');
      await say('tamun', 'הלוחות עונים לאש של הזיכרון. הנה, אני מדליק את אבן הקריאה שלי. מעכשיו תראה את האור שלהם עולה לשמיים, גם ביום.');
      await say('tamun', 'תביא לי את חמשת הלוחות, ואלמד אותך לקרוא אותם. ואל תתעכב: הסופה מתחזקת עם כל שעה.');
      f.metTamun = true; log('תאמון הזקן ביקש שאביא לו חמישה לוחות זהב.');
      toast('משימה חדשה: אסוף 5 לוחות זהב (עמודי אור תכלת)');
      return;
    }
    const got = f.tablets.filter(Boolean).length;
    if (!f.words && got < 5) { await say('tamun', `יש לך ${got} מתוך 5 לוחות. חפש את עמודי האור התכלת במדבר.`); return; }
    if (!f.words) {
      await say('tamun', 'חמישה! מדהים. תן לי לראות... האותיות עוד חמות.');
      await say('tamun', '"השחר נפתח למי שזוכר את הסדר. הצהריים למי שמחכה לגובה. השקיעה למי שעונה לעצמות. הלילה למי שמחזיר את האור מן האחיות."');
      await say('tamun', 'כלומר: במקדש השחר, במזרח, תצטרך לחזור על סדר האבנים הזוהרות. לחץ ליד המזבח כדי לראות אותו.');
      await say('tamun', 'רסיס הצהריים, בדרום-מערב, יופיע רק כשהשמש תעמוד גבוה, אחרי 11:00. ויהיה לו סדר ארוך יותר.');
      await say('tamun', 'רסיס השקיעה שמור בידי שומר העצמות, רוח החיה הענקית שנחה בדרום. הוא אוהב חידות. ושונא טיפשים.');
      await say('tamun', '"האחיות" הן שלוש הפירמידות הקטנות בצפון-מזרח. העיר את המראות שעל ראשן, והן יחזירו את האור אל מקדש הלילה.');
      const c = await say('tamun', 'ועוד דבר, חארו. אם תשמע קול שלוחש לך מתוך הפירמידה...', ['מה הוא ירצה ממני?', 'אני לא אקשיב לו']);
      if (c === 0) await say('tamun', 'מה שכל עריץ רוצה: שתאמין שהכוח יציל אותך מהפחד. הוא לא יציל.');
      else await say('tamun', 'כולם אומרים את זה. עד שהקול מתחיל להישמע כמו הקול שלהם עצמם.');
      f.words = true; log('תאמון לימד אותי את מילות השמש: לכל רסיס יש מבחן משלו.');
      toast('המקדשים התעוררו! פתח את רסיסי השמש');
      return;
    }
    const tips = ['השחר במזרח, הצהריים בדרום-מערב אחרי 11:00, השקיעה אצל שומר העצמות בדרום, הלילה דרך האחיות בצפון-מזרח.', 'כתוב בלוחות: "ארבעתן יחד יחתמו את השמש האפלה, או ישחררו אותה". שים לב למילה "או", חארו.'];
    await say('tamun', tips[shardsTaken() % 2]);
  }

  async function sceneKeeper() {
    const f = F();
    if (f.riddles) { await say('keeper', 'כבר עניתי לך, חול מהלך. רסיס השקיעה מחכה במקדש שבצפון-מערב.'); return; }
    if (elapsed() < f.keeperCooldown) { await say('keeper', `עוד לא. חזור בעוד ${Math.ceil((f.keeperCooldown - elapsed()) / 60)} דקות, כשתחכים.`); return; }
    await say('keeper', 'מי מעז להעיר את אמוּק, החיה שבלעה את הירח?');
    await say('keeper', 'אה... החול המהלך. הבובה של נפירה. גם לפני 3000 שנה באת אליי, והיית צעיר וטיפש באותה מידה.');
    await say('keeper', 'ענה על שלוש חידותיי, ואשחרר את רסיס השקיעה. טעה אפילו פעם אחת, ותחכה.');
    for (const r of RIDDLES) {
      const a = await say('keeper', r.q, r.a);
      if (a !== r.ok) {
        await say('keeper', 'טעות. העצמות שלי צוחקות עליך. חזור בעוד שתי דקות.');
        f.keeperCooldown = elapsed() + 120;
        return;
      }
      await say('keeper', 'נכון...');
    }
    await say('keeper', 'שלוש מתוך שלוש. אולי בכל זאת יש לב בתוך החול הזה.');
    await say('keeper', 'לך למקדש השקיעה בצפון-מערב. ודע לך: גם סת\'אר ענה פעם על כל החידות שלי.');
    f.riddles = true; log('עניתי על שלוש החידות של שומר העצמות. רסיס השקיעה השתחרר.');
    toast('רסיס השקיעה השתחרר! (צפון-מערב)');
  }

  async function sceneWhisper(n) {
    const lines = [
      ['...חארו...', 'אתה מרגיש את זה, נכון? החום. הכוח. וזה רק רסיס אחד.', 'נפירה השתמשה בך. היא יצרה אותך כדי לשמור על כלא. אבל אתה יכול להיות הרבה יותר משומר.'],
      ['כל רסיס שאתה אוסף מקרב אותך אליי. אתה כבר יודע את זה.', 'שאל את עצמך: למה הבובה צריכה לבחור, אם היא רק בובה?'],
      ['נפירה סיפרה לך שאני המפלצת? היא סיפרה לך שהיא זו שנעלה אותי כאן, בחושך, 3000 שנה?', 'אני הייתי ילד שפחד מהלילה. היא הפכה את הפחד שלי לבית.'],
      ['ארבעה. השמש כולה בידיים שלך.', 'בוא לשער, אחי הקטן מחול. פתח אותו... ונשלוט יחד בשמש שלא שוקעת לעולם.'],
    ][n];
    for (const l of lines) await say('sethar', l);
    log(['שמעתי לראשונה את קולו של סת\'אר מתוך הפירמידה.', 'סת\'אר לחש שוב. הקול שלו מתקרב.', 'סת\'אר טוען שנפירה כלאה אותו.', 'סת\'אר מחכה לי בשער.'][n]);
  }

  async function sceneLinaCall() {
    await say('lina', 'הלו?! מישהו שומע אותי?! הבז של סבא אמור להגיע למישהו!');
    await say('lina', 'סופת חול כלאה את השיירה שלנו ליד נווה המדבר, בדרום-מזרח. הגמלים לא זזים, וסבא יאסיף... הוא כבר לא צועק.');
    await say('kharu', 'ילדה. הקול שלה רועד. הפירמידה לא מחכה... אבל גם היא לא.');
    log('לינה ביקשה עזרה: השיירה של סבה כלואה בסופה ליד נווה המדבר.');
    toast('משימה אופציונלית: הצל את השיירה בנווה המדבר (דרום-מזרח)');
  }

  async function sceneRescue() {
    const f = F();
    await say('lina', 'זה הוא! המשמר מהסיפורים של סבא! אמרתי לך שהוא אמיתי!');
    await say('yasif', 'שמונים שנה אני חוצה את המדבר הזה... ומעולם לא חשבתי שאראה אותך בעיניים שלי.');
    await say('yasif', 'האגדה של השבט שלנו אומרת שהמשמר יעמוד יום אחד בפני בחירה: לחתום את החושך, או ללבוש אותו.');
    await say('yasif', 'קח את זה. מפת הכוכבים של אבי. היא מראה איפה נחים הזיכרונות שלך, חיפושיות הזהב.');
    const c = await say('lina', 'אתה תחזור? תבטיח? אני רוצה לראות את השמש זורחת מחר.', ['אני מבטיח, לינה', 'אני לא יכול להבטיח דבר']);
    f.promise = c === 0;
    await say('lina', c === 0 ? 'אז אני אחכה ליד המדורה. כל הלילה אם צריך!' : 'אז... אז אני אבטיח במקומך. ככה זה יחשב.');
    f.metYasif = true; f.starMap = true;
    log(f.promise ? 'הצלתי את השיירה והבטחתי ללינה שאחזור.' : 'הצלתי את השיירה. לינה הבטיחה במקומי שאחזור.');
    toast('קיבלת את מפת הכוכבים: חיפושיות הזיכרון מסומנות במפה');
  }

  async function sceneYasifAgain() {
    const lines = ['השבט שלנו נודד כבר אלף שנה. אולי, אם השמש תזרח מחר, נוכל סוף סוף לעצור.', 'לינה לא מפסיקה לדבר עליך. היא כבר בונה לך פסל מחול. הוא קטן יותר ממך, אבל מחייך יותר.'];
    await say(shardsTaken() % 2 ? 'lina' : 'yasif', lines[shardsTaken() % 2]);
  }

  async function sceneMemory(i) {
    await say('memory', MEMORIES[i].text);
    const n = F().memories.filter(Boolean).length;
    if (n === 7) { await say('kharu', 'עכשיו אני זוכר הכול. אני צריך לדבר עם נפירה.'); }
  }

  async function sceneGate() {
    const f = F(), n = shardsTaken();
    if (!gateOpen()) {
      await say('kharu', `השער סגור. צל האובליסק עוד רחוק מהדלת. הוא ייפתח בשעה 14:00, בעוד כ-${minsToGate()} דקות.`);
      return;
    }
    if (n === 4 && !f.finalTalk) {
      await say('nefira', 'הגעת. ארבעת הרסיסים בוערים בחזך, ואני רואה בעיניך שהקול שלו כבר מדבר אליך.');
      await say('sethar', 'פתח, אחי. תן לי לראות את השמש פעם אחת אחרונה. ביחד נהיה נצחיים.');
      await say('nefira', 'אני לא אכריח אותך. אתה כבר לא הבובה שלי, חארו. מה שתבחר עכשיו, הוא באמת שלך.');
      if (S().caravan) await say('kharu', f.promise ? 'הבטחתי ללינה שאחזור.' : 'לינה הבטיחה במקומי. הבטחה של ילדה שווה יותר מכל השמש.');
      f.finalTalk = true;
    } else if (n < 4) {
      await say('kharu', `יש לי רק ${n} מתוך 4 רסיסים. אם אכנס עכשיו... אהיה לבד מולו.`);
    }
    openGateChoice();
  }

  // ================================================================ interactables
  const items = [];
  const add = (o) => items.push(o);
  add({ pos: () => NPC_POS.nefira, r: 16, label: 'לדבר עם נפירה', on: () => true, act: () => talkTo('nefira', sceneNefira) });
  add({ pos: () => NPC_POS.tamun, r: 13, label: 'לדבר עם תאמון', on: () => F().metNefira, act: () => talkTo('tamun', sceneTamun) });
  add({ pos: () => NPC_POS.keeper, r: 20, label: 'להעיר את שומר העצמות', on: () => F().metTamun, act: () => talkTo('keeper', sceneKeeper) });
  add({ pos: () => NPC_POS.yasif, r: 12, label: 'לדבר עם יאסיף ולינה', on: () => S().caravan, act: () => talkTo('yasif', F().metYasif ? sceneYasifAgain : sceneRescue) });
  add({ pos: () => PYR.GATE, r: 14, label: 'לגשת לשער הפירמידה', on: () => true, act: () => talkTo('gate', sceneGate) });
  tablets.forEach((t, i) => add({ pos: () => t.g.position, r: 9, label: 'לקחת את לוח הזהב', on: () => F().metTamun && !F().tablets[i], act: () => {
    F().tablets[i] = true; t.g.visible = false; puff(t.x, groundAt(t.x, t.z) + 3, t.z, 30, 1.5);
    const got = F().tablets.filter(Boolean).length;
    log(`לוח זהב ${got}/5: ${t.text}`);
    dialog.run(async () => { await say('memory', `לוח זהב ${got} מתוך 5: ${t.text}`); if (got === 5) await say('kharu', 'חמישה לוחות. תאמון יוכל לקרוא אותם.'); });
  } }));
  scarabs.forEach((s, i) => add({ pos: () => s.g.position, r: 8, label: 'לגעת בחיפושית הזהב', on: () => !F().memories[i], act: () => {
    F().memories[i] = true; s.g.visible = false; puff(s.x, s.g.position.y, s.z, 25, 1);
    log(`זיכרון ${F().memories.filter(Boolean).length}/7: ${s.text}`);
    dialog.run(() => sceneMemory(i));
  } }));
  puzzles.forEach((pz, pi) => {
    const center = new THREE.Vector3(pz.site.x, 0, pz.site.z);
    add({ pos: () => center, r: 17, label: 'להתבונן בסדר האבנים', on: () => !F().puzzle[pi] && pz.showT < 0, act: () => {
      const f = F();
      if (!f.words) { dialog.run(() => say('kharu', 'המקדש נעול במילים שאני לא מבין. תאמון במערב יודע לקרוא אותן.')); return; }
      if (pi === 1 && !S().shards[0]) { dialog.run(() => say('kharu', 'האבנים שותקות. קודם צריך להעיר את השחר, במקדש המזרחי.')); return; }
      if (pi === 1 && hour() < NOON_HOUR) { dialog.run(() => say('kharu', `השמש עוד לא גבוהה מספיק. תאמון אמר שרסיס הצהריים יופיע אחרי 11:00.`)); return; }
      pz.showT = 0; pz.step = 0; pz.ready = false;
      toast('הסתכל היטב על סדר האבנים...');
    } });
    pz.stones.forEach((st, j) => add({ pos: () => st.g.position, r: 7, label: 'לגעת באבן', on: () => pz.ready && !F().puzzle[pi], act: () => {
      if (pz.seq[pz.step] === j) {
        st.flash = 0.6; st.flashColor = st.color; pz.step++;
        if (pz.step === pz.seq.length) {
          F().puzzle[pi] = true; pz.ready = false;
          pz.stones.forEach((s) => { s.flash = 2; s.flashColor = 0xffffff; });
          log(pi === 0 ? 'פתרתי את חידת הסדר במקדש השחר.' : 'פתרתי את חידת הצהריים הארוכה.');
          toast(pi === 0 ? 'רסיס השחר השתחרר!' : 'רסיס הצהריים השתחרר!');
        }
      } else {
        pz.stones.forEach((s) => { s.flash = 0.8; s.flashColor = 0xff2010; });
        pz.step = 0; pz.ready = false;
        toast('הסדר שגוי. האבנים כבו. גש למזבח כדי לראות שוב.');
      }
    } }));
  });
  world.shards.forEach((sh, i) => {
    const center = new THREE.Vector3(sh.x, 0, sh.z);
    add({ pos: () => center, r: 16, label: `לקחת את ${sh.name}`, on: () => unlocked(i) && !S().shards[i], act: () => takeShard(i) });
  });
  mirrors.forEach((m, k) => add({ hold: 6, pos: () => new THREE.Vector3(m.x, 0, m.z), r: 13, label: 'החזק E כדי להעיר את המראה', on: () => F().words && !F().mirrors[k], done: () => {
    F().mirrors[k] = true; m.beam.visible = true;
    const n = F().mirrors.filter(Boolean).length;
    log(`העירותי מראה ${n}/3 על האחיות.`);
    toast(n === 3 ? 'שלוש האחיות זוהרות! רסיס הלילה התגלה (צפון)' : `מראה ${n}/3 התעוררה`);
  } }));
  add({ hold: 12, pos: () => new THREE.Vector3(CAMP.x, 0, CAMP.z), r: 40, label: 'החזק E כדי לפזר את הסופה ולחלץ את השיירה', on: () => !S().caravan, done: () => {
    S().caravan = true; world.camp.rescue();
    talkTo('yasif', sceneRescue);
  } });

  function takeShard(i) {
    const s = world.shards[i];
    S().shards[i] = true;
    s.parts.forEach((p) => { p.visible = false; });
    golem.setPower(shardsTaken());
    puff(s.x, groundAt(s.x, s.z) + 8, s.z, 40, 2);
    const n = shardsTaken();
    log(`אספתי את ${s.name} (${n}/4).`);
    toast(`✨ אספת את <b>${s.name}</b> (${n}/4)`);
    dialog.run(async () => {
      await sceneWhisper(Math.min(3, F().whispers)); F().whispers++;
      if (n === 1 && !S().caravan && !F().linaCalled) { F().linaCalled = true; await sceneLinaCall(); }
      if (n === 4) await say('kharu', gateOpen() ? 'כל ארבעת הרסיסים איתי. הגיע הזמן לשער.' : `כל ארבעת הרסיסים איתי. השער ייפתח בשעה 14:00, בעוד כ-${minsToGate()} דקות.`);
    });
  }

  // ================================================================ apply saved progress
  function sync() {
    const f = F();
    tablets.forEach((t, i) => { t.g.visible = f.metTamun && !f.tablets[i]; });
    scarabs.forEach((s, i) => { s.g.visible = !f.memories[i]; });
    mirrors.forEach((m, k) => { m.beam.visible = f.mirrors[k]; });
    yasif.visible = lina.visible = true;
  }

  // ================================================================ objective for the HUD
  function quest() {
    const f = F(), st = S();
    const T = (text, p) => ({ text, target: p ? new THREE.Vector3(p.x, 0, p.z) : null });
    if (!f.metNefira) return T('דבר עם רוח הכוהנת בשדרת הספינקסים', NPC_POS.nefira);
    if (!f.metTamun) return T('מצא את תאמון הזקן ליד ראש הפסל הקבור במערב', NPC_POS.tamun);
    if (!f.words) {
      const left = tablets.filter((t, i) => !f.tablets[i]);
      if (left.length) {
        const pp = ctx.playerPos(); left.sort((a, b) => Math.hypot(a.x - pp.x, a.z - pp.z) - Math.hypot(b.x - pp.x, b.z - pp.z));
        return T(`אסוף את לוחות הזהב (${5 - left.length}/5): עמודי אור תכלת`, left[0]);
      }
      return T('חזור לתאמון עם חמשת הלוחות', NPC_POS.tamun);
    }
    const sh = SHARD_SITES;
    if (!st.shards[0]) return T(f.puzzle[0] ? 'קח את רסיס השחר' : 'מקדש השחר (מזרח): גש למזבח וחזור על סדר האבנים', sh[0]);
    if (!f.riddles) return T('ענה לחידות של שומר העצמות (דרום)', NPC_POS.keeper);
    if (!st.shards[2]) return T('קח את רסיס השקיעה (צפון-מערב)', sh[2]);
    if (!st.shards[1] && hour() >= NOON_HOUR) return T(f.puzzle[1] ? 'קח את רסיס הצהריים' : 'מקדש הצהריים (דרום-מערב): פתור את סדר האבנים הארוך', sh[1]);
    if (!f.mirrors.every(Boolean)) {
      const k = f.mirrors.findIndex((x) => !x);
      return T(`העֵר את מראות האחיות (${f.mirrors.filter(Boolean).length}/3) בצפון-מזרח`, mirrors[k]);
    }
    if (!st.shards[3]) return T('קח את רסיס הלילה (צפון)', sh[3]);
    if (!st.shards[1]) return T(`רסיס הצהריים יתגלה אחרי 11:00. חפש זיכרונות בינתיים`, sh[1]);
    if (!gateOpen()) return T(`השער ייפתח ב-14:00 (עוד כ-${minsToGate()} דק'). חפש את זיכרונותיך`, PYR.GATE);
    return T('לך לשער הפירמידה וקבל את ההחלטה', PYR.GATE);
  }
  function sideQuests() {
    const f = F(), st = S(), out = [];
    if (f.linaCalled && !st.caravan) out.push({ text: 'הצל את השיירה בנווה המדבר (דרום-מזרח)', done: false });
    if (st.caravan) out.push({ text: 'השיירה ניצלה', done: true });
    out.push({ text: `זיכרונות: ${f.memories.filter(Boolean).length}/7`, done: f.memories.every(Boolean) });
    return out;
  }

  // ================================================================ per-frame update
  let near = null, holdItem = null;
  function update(dt, t, keys, playerPos) {
    dialog.update(dt);
    const f = F();
    // animate characters & props
    nefira.position.y = groundAt(NPC_POS.nefira.x, NPC_POS.nefira.z) + 1.5 + Math.sin(t * 1.2) * 0.6;
    nefira.rotation.y = Math.atan2(playerPos.x - nefira.position.x, playerPos.z - nefira.position.z);
    keeper.g.position.y = groundAt(NPC_POS.keeper.x, NPC_POS.keeper.z) + 9 + Math.sin(t * 0.8) * 1.2;
    keeper.flames.forEach((fl, k) => { fl.scale.y = 1 + Math.sin(t * 7 + k) * 0.25; });
    const kOn = f.metTamun && !f.riddles;
    keeper.flames.forEach((fl) => { fl.visible = kOn || f.riddles; });
    lina.position.y = yp.y + (S().caravan ? Math.abs(Math.sin(t * 3)) * 0.6 : 0);
    const face = (obj, k) => { const want = Math.atan2(playerPos.x - obj.position.x, playerPos.z - obj.position.z); let d = want - obj.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); obj.rotation.y += d * Math.min(1, dt * k); };
    if (dialog.busy && pendingNpc) {
      if (pendingNpc.key === 'tamun') face(tamun, 4);
      if (pendingNpc.key === 'keeper') face(keeper.g, 2);
      if (pendingNpc.key === 'yasif') { face(yasif, 4); face(lina, 4); }
    }
    const talkBob = (obj, who, base) => { obj.scale.y = base * (speaking === who ? 1 + Math.abs(Math.sin(t * 9)) * 0.035 : 1); };
    talkBob(tamun, 'tamun', 1.5); talkBob(yasif, 'yasif', 1.4); talkBob(lina, 'lina', 0.95);
    if (speaking === 'keeper') keeper.g.rotation.x = Math.sin(t * 8) * 0.06; else keeper.g.rotation.x = 0;
    tablets.forEach((tb) => { if (tb.g.visible) tb.g.children[0].rotation.y = Math.sin(t * 0.5) * 0.2; });
    scarabs.forEach((s, i) => { s.g.rotation.y = t * 0.8 + i; s.g.position.y = groundAt(s.x, s.z) + 2 + Math.sin(t * 2 + i) * 0.4; });
    mirrors.forEach((m, k) => { m.g.rotation.y = t * 0.6 + k; m.g.rotation.x = f.mirrors[k] ? 0.3 : 0; });
    // puzzle playback and stone glow
    puzzles.forEach((pz) => {
      if (pz.showT >= 0) {
        pz.showT += ctx.holdDt();
        const idx = Math.floor(pz.showT / 0.95), frac = (pz.showT % 0.95) / 0.95;
        if (idx >= pz.seq.length) { pz.showT = -1; pz.ready = true; toast('עכשיו גע באבנים באותו הסדר (E)'); }
        else if (frac < 0.65) { const s = pz.stones[pz.seq[idx]]; s.flash = 0.1; s.flashColor = s.color; }
      }
      pz.stones.forEach((s) => {
        s.flash = Math.max(0, s.flash - ctx.holdDt());
        const on = s.flash > 0;
        s.mat.emissive.setHex(on ? s.flashColor : s.color);
        s.mat.emissiveIntensity = on ? 5 : (pz.ready ? 0.8 : 0.25);
        s.ringMat.opacity = on ? 0.9 : 0;
      });
    });
    // gate announcement at 14:00
    if (gateOpen() && !f.gateAnnounced) {
      f.gateAnnounced = true; log('בשעה 14:00 צל האובליסק נגע בדלת, והשער נפתח.');
      toast('צל האובליסק נגע בדלת. <b>שער הפירמידה נפתח!</b>', 6);
    }

    // nearest active interactable
    near = null; let best = Infinity;
    for (const it of items) {
      if (!it.on()) continue;
      const p = it.pos(); const d = Math.hypot(playerPos.x - p.x, playerPos.z - p.z);
      if (d < it.r && d < best) { best = d; near = it; }
    }
    // hold-to-act
    let progress = 0;
    if (near && near.hold && !dialog.busy) {
      near.progress = near.progress || 0;
      if (keys.KeyE) near.progress += ctx.holdDt(); else near.progress = Math.max(0, near.progress - ctx.holdDt() * 2);
      progress = near.progress / near.hold;
      if (near.progress >= near.hold) { near.progress = 0; near.done(); }
    }
    items.forEach((it) => { if (it !== near && it.hold) it.progress = 0; });

    // quest marker
    const q = quest();
    marker.visible = !!q.target && !dialog.busy;
    if (q.target) {
      const d = Math.hypot(playerPos.x - q.target.x, playerPos.z - q.target.z);
      const s = THREE.MathUtils.clamp(d / 70, 1, 9);
      marker.scale.setScalar(s);
      marker.position.set(q.target.x, groundAt(q.target.x, q.target.z) + 22 + s * 3 + Math.sin(t * 2) * 1.5, q.target.z);
      marker.rotation.y = t * 1.5;
    }
    return { prompt: near && !dialog.busy ? (near.hold ? near.label : `לחץ <b>E</b>: ${near.label}`) : '', progress };
  }

  function interact() { if (near && !near.hold && !dialog.busy) near.act(); }

  // ================================================================ journal + map data
  function journalHTML() {
    const f = F();
    const mem = MEMORIES.map((m, i) => (f.memories[i] ? `<li>${m.text}</li>` : '<li class="locked">זיכרון שעוד לא נמצא...</li>')).join('');
    const tabs = TABLETS.map((t, i) => (f.tablets[i] ? `<li>${t.text}</li>` : '<li class="locked">לוח שעוד לא נמצא...</li>')).join('');
    const ev = f.log.filter((l) => !l.startsWith('זיכרון') && !l.startsWith('לוח זהב')).map((l) => `<li>${l}</li>`).join('') || '<li class="locked">המסע עוד לא התחיל.</li>';
    return `<h3>מהלך המסע</h3><ol>${ev}</ol><h3>זיכרונות חארו (${f.memories.filter(Boolean).length}/7)</h3><ul>${mem}</ul><h3>לוחות הזהב (${f.tablets.filter(Boolean).length}/5)</h3><ul>${tabs}</ul>`;
  }
  function mapMarks() {
    const f = F(), out = [];
    out.push({ x: NPC_POS.nefira.x, z: NPC_POS.nefira.z, c: '#8fd3ff' });
    if (f.metNefira) out.push({ x: NPC_POS.tamun.x, z: NPC_POS.tamun.z, c: '#ffd36a' });
    if (f.metTamun) { out.push({ x: NPC_POS.keeper.x, z: NPC_POS.keeper.z, c: '#7affc0' }); tablets.forEach((t, i) => { if (!f.tablets[i]) out.push({ x: t.x, z: t.z, c: '#7fe8ff', s: 3 }); }); }
    if (f.words) mirrors.forEach((m, k) => { if (!f.mirrors[k]) out.push({ x: m.x, z: m.z, c: '#dfe8ff', s: 3 }); });
    if (f.starMap) scarabs.forEach((s, i) => { if (!f.memories[i]) out.push({ x: s.x, z: s.z, c: '#ffd36a', s: 2.5 }); });
    return out;
  }

  return { dialog, update, interact, quest, sideQuests, sync, unlocked, gateOpen, journalHTML, mapMarks, nefira, get busy() { return dialog.busy; },
    _dbg: { puzzles, mirrors, tablets, scarabs, NPC_POS } };
}
