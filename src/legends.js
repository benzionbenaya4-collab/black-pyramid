// legends.js — "אגדות נפירה" (Legends of Nefira): the story before the first game, in four chapters and one ending.
// Nefira as a child in the living city, as the young sun priestess, gathering the sand for the guardian,
// and the fight against her brother that she refuses to fight.
import * as THREE from 'three';
import { createEngine } from './engine.js';
import { PYR, groundAt, colliders } from './world.js';
import { glyphUniforms } from './glyphs.js';
import { createGolem } from './golem.js';
import { loadDesign } from './editor.js';
import { buildShadowKing, ARENA } from './combat.js';
import { buildNefira, buildHuman, NPC_POS } from './story.js';
import { createCinema } from './cinema.js';
import { createControls } from './controls.js';
import { MAT } from './util.js';
import { buildPerson, buildCity, buildSandSpot, buildMirror, CITY } from './legends-world.js';
import { trapBackButton, isConsole, isMobile, createGamepad, createMenuNav, BTN } from './platform.js';

const $ = (id) => document.getElementById(id);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const G = (x, z) => groundAt(x, z);
const SAVE = 'legends.progress';

// ================================================================ engine, world, city
const E = createEngine({ mount: $('app'), fov: 55, name: 'legends' });
const { scene, camera } = E;
const city = buildCity(scene, colliders);
E.paintScene();
const cinema = createCinema();

// Haru: the sand guardian Nefira builds (the player's own design from the first game)
const golem = createGolem(loadDesign());
golem.group.visible = false; golem.trickle.visible = false;
scene.add(golem.group, golem.trickle);
const FIELD = V3(ARENA.x, 0, ARENA.z - 80);          // the sand field at the edge of the city, where Haru is made
const haru = { pos: FIELD.clone(), emerge: 0, alive: false };
const haruGlow = []; golem.group.traverse((o) => { if (o.material && o.material.emissive && o.material.emissiveIntensity > 0.5) haruGlow.push({ m: o.material, i: o.material.emissiveIntensity }); });
const setHaruLife = (v) => haruGlow.forEach(({ m, i }) => { m.emissiveIntensity = i * v; });

// people
const MODELS = { child: buildPerson('nefiraChild'), adult: buildPerson('nefira') };
const setharBoy = buildPerson('setharBoy'), setharMan = buildPerson('sethar');
for (const m of [MODELS.child, MODELS.adult, setharBoy, setharMan]) { m.group.visible = false; scene.add(m.group); }
const ghost = buildNefira(); ghost.visible = false; scene.add(ghost);
const baker = buildHuman(MAT.leather, { beard: true, scale: 2.3, turban: MAT.cloth });
baker.position.set(CITY.market.x + 8, G(CITY.market.x + 8, CITY.market.z - 4), CITY.market.z - 4); scene.add(baker);
const merit = buildHuman(MAT.cloth, { staff: true, scale: 2.6, turban: MAT.gold });
merit.visible = false; scene.add(merit);
const king = buildShadowKing(); king.g.visible = false; scene.add(king.g);
E.paintScene();

const SPEAK = {
  nefira: { name: 'נפירה', color: '#8fd3ff' }, sethar: { name: 'סת\'אר', color: '#c9a0ff' }, baker: { name: 'חנוט, האופה', color: '#ffb070' },
  merit: { name: 'מרית, הכוהנת הגדולה', color: '#ffd86a' }, ghost: { name: 'נפירה, רוח הכוהנת', color: '#8fd3ff' }, narrator: { name: '', color: '#f6e7c8' },
};

// ================================================================ player
const player = { pos: V3(0, 0, 300), facing: Math.PI, speed: 0, velY: 0, grounded: true, model: MODELS.child, pose: {}, frozen: false };
function useModel(k) {
  for (const m of Object.values(MODELS)) m.group.visible = false;
  player.model = MODELS[k]; player.model.group.visible = true;
}
function placePlayer(x, z, facing) { player.pos.set(x, G(x, z), z); player.facing = facing; player.speed = 0; player.velY = 0; cam.yaw = facing + Math.PI; cam.orbit = 0; }
const H = () => player.model.h;

// ================================================================ input: keyboard, controller, touch
const keys = {};
const ctl = createControls({ console: isConsole });
const pad = createGamepad();
const menuNav = createMenuNav(['#beta', '#l-title', '#l-end']);
let actPressed = false, jumpPressed = false, back = false;
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  const code = ctl.key(e.code);
  keys[code] = true;
  if (e.repeat) return;
  if (dialogOpen) { if (['KeyE', 'Space', 'Enter'].includes(code)) advance(); return; }
  if (cinema.playing && ['KeyE', 'Space', 'Enter', 'Escape'].includes(code)) { cinema.finish(); return; }
  if (code === 'KeyE') actPressed = true;
  if (code === 'Space') jumpPressed = true;
});
addEventListener('keyup', (e) => { keys[ctl.key(e.code)] = false; keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
trapBackButton(() => { back = true; });

const touch = { x: 0, y: 0, active: false, run: false };
if (isMobile && !isConsole) {
  $('touch').classList.remove('hidden');
  const zone = $('joy-zone'), joy = $('joy'), knob = $('joy-knob');
  let id = null, cx = 0, cy = 0;
  const setJoy = (e) => {
    let x = (e.clientX - cx) / 62, y = (e.clientY - cy) / 62; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    touch.x = x; touch.y = y; touch.run = l > 0.92 && y < -0.5; knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`; joy.classList.toggle('run', touch.run);
  };
  zone.addEventListener('pointerdown', (e) => {
    if (id !== null) return; e.preventDefault(); id = e.pointerId; zone.setPointerCapture(id);
    const zr = zone.getBoundingClientRect(); cx = e.clientX; cy = e.clientY;
    joy.style.left = `${cx - zr.left - 68}px`; joy.style.top = `${cy - zr.top - 68}px`; joy.style.bottom = 'auto'; joy.classList.add('on'); touch.active = true; setJoy(e);
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) setJoy(e); });
  const end = (e) => { if (e.pointerId !== id) return; id = null; Object.assign(touch, { active: false, run: false, x: 0, y: 0 }); knob.style.transform = ''; joy.classList.remove('on', 'run'); joy.style.left = joy.style.top = joy.style.bottom = ''; };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
  const hold = (bid, code, fn) => {
    const el = $(bid);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); keys[code] = true; fn(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { el.classList.remove('down'); keys[code] = false; });
  };
  hold('t-a', 'KeyE', () => { if (dialogOpen) advance(); else if (cinema.playing) cinema.finish(); else actPressed = true; });
  hold('t-b', 'Space', () => { jumpPressed = true; });
}

// camera: behind Nefira; drag / right stick / D-pad looks around
const cam = { yaw: 0, orbit: 0, pitch: 0.28 };
let dragging = false, lx = 0;
renderer().domElement.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; });
addEventListener('pointerup', () => { dragging = false; });
addEventListener('pointermove', (e) => { if (dragging) { cam.orbit -= (e.clientX - lx) * 0.006; lx = e.clientX; } });
renderer().domElement.addEventListener('click', () => { if (dialogOpen) advance(); });
function renderer() { return E.renderer; }

// ================================================================ dialog
let dialogOpen = false, dialogRes = null, talkNpc = null;
function advance() { if (!dialogOpen) return; dialogOpen = false; const r = dialogRes; dialogRes = null; r?.(); }
function say(sp, text) {
  const s = SPEAK[sp] || SPEAK.narrator;
  $('dlg-name').textContent = s.name; $('dialog').style.setProperty('--sp', s.color);
  $('dlg-text').textContent = text; $('dlg-text').classList.toggle('narr', sp === 'narrator');
  $('dialog').classList.remove('hidden');
  if (talkNpc) cinema.speaker(null);   // one steady shot of both of them for the whole conversation
  dialogOpen = true;
  return new Promise((res) => { dialogRes = () => { $('dialog').classList.add('hidden'); res(); }; });
}
/** a conversation: camera frames Nefira and the other person */
async function talk(obj, h, lines) {
  talkNpc = obj; cinema.beginTalk({ npc: obj.position.clone(), h, stand: 20 }); player.frozen = true;
  faceTo(obj.position);
  for (const [sp, text] of lines) await say(sp, text);
  cinema.endTalk(); talkNpc = null; player.frozen = false;
}
async function monologue(lines) { cinema.beginTalk(null); player.frozen = true; for (const [sp, text] of lines) await say(sp, text); cinema.endTalk(); player.frozen = false; }
function faceTo(p) { player.facing = Math.atan2(p.x - player.pos.x, p.z - player.pos.z); }

// ================================================================ HUD helpers
let toastT = 0;
function toast(t, sec = 4) { $('toast').textContent = t; $('toast').classList.remove('hidden'); toastT = sec; }
function objective(main, sub = '', target = null) {
  $('objectives').innerHTML = main ? `<div class="quest">➤ ${main}</div>${sub ? `<div class="hint">${sub}</div>` : ''}` : '';
  if (target !== undefined) guide.target = main ? target : null;
}

// ---------------------------------------------------------------- the arrow path: glowing arrows on the ground toward the goal
// The path goes around houses (a small grid search over the colliders), and is refreshed as Nefira walks.
const guide = { target: null, path: [], timer: 0, from: new THREE.Vector3(Infinity, 0, 0) };
const ARROWS = 16, arrowGeo = (() => {
  const sh = new THREE.Shape(); sh.moveTo(0, 1.6); sh.lineTo(1.5, -0.4); sh.lineTo(0.8, -0.4); sh.lineTo(0, 0.6); sh.lineTo(-0.8, -0.4); sh.lineTo(-1.5, -0.4); sh.closePath();
  return new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2).scale(2.3, 1, 2.3);
})();
const arrows = Array.from({ length: ARROWS }, () => {
  const m = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0xffcf6a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.renderOrder = 2; m.visible = false; scene.add(m); return m;
});
function blockedCam(q) {
  for (const c of colliders) {
    if (c.type === 'box') { if (q.x > c.minX - 1 && q.x < c.maxX + 1 && q.z > c.minZ - 1 && q.z < c.maxZ + 1 && q.y < G(q.x, q.z) + 26) return true; }
    else if (c.r > 2.5 && Math.hypot(q.x - c.x, q.z - c.z) < c.r + 1 && q.y < G(q.x, q.z) + 14) return true;
  }
  return false;
}
function blocked(x, z) {
  for (const c of colliders) {
    if (c.type === 'box') { if (x > c.minX - 3 && x < c.maxX + 3 && z > c.minZ - 3 && z < c.maxZ + 3) return true; }
    else if (Math.hypot(x - c.x, z - c.z) < c.r + 3) return true;
  }
  return false;
}
// the obstacle map is computed once (houses, walls and statues don't move)
const NAV = { S: 6, minX: -420, minZ: 60, W: 0, D: 0, grid: null };
function buildNav() {
  NAV.W = Math.ceil(840 / NAV.S); NAV.D = Math.ceil(760 / NAV.S); NAV.grid = new Uint8Array(NAV.W * NAV.D);
  for (let j = 0; j < NAV.D; j++) for (let i = 0; i < NAV.W; i++) NAV.grid[j * NAV.W + i] = blocked(NAV.minX + i * NAV.S, NAV.minZ + j * NAV.S) ? 1 : 0;
}
function findPath(a, b) {
  if (!NAV.grid) buildNav();
  const { S, W, D, grid } = NAV, minX = NAV.minX, minZ = NAV.minZ;
  const idx = (i, j) => j * W + i;
  const cell = (p) => [THREE.MathUtils.clamp(Math.round((p.x - minX) / S), 0, W - 1), THREE.MathUtils.clamp(Math.round((p.z - minZ) / S), 0, D - 1)];
  const [si, sj] = cell(a), [ti, tj] = cell(b);
  const block = grid.slice();
  block[idx(si, sj)] = 0; block[idx(ti, tj)] = 0;
  const g = new Float32Array(W * D).fill(Infinity), came = new Int32Array(W * D).fill(-1);
  // binary heap of [f, cell]
  const heap = [];
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  g[idx(si, sj)] = 0; push(0, idx(si, sj));
  const h = (k) => Math.hypot((k % W) - ti, Math.floor(k / W) - tj);
  let found = false, guard = 0;
  while (heap.length && guard++ < 80000) {
    const [, cur] = pop();
    if (cur === idx(ti, tj)) { found = true; break; }
    const ci = cur % W, cj = Math.floor(cur / W);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= D) continue;
      const n = idx(ni, nj); if (block[n]) continue;
      if (di && dj && (block[idx(ci + di, cj)] || block[idx(ci, cj + dj)])) continue;   // no corner cutting
      const ng = g[cur] + (di && dj ? 1.414 : 1);
      if (ng < g[n]) { g[n] = ng; came[n] = cur; push(ng + h(n), n); }
    }
  }
  if (!found) return [a.clone(), b.clone()];
  const pts = []; for (let k = idx(ti, tj); k !== -1; k = came[k]) pts.push(V3(minX + (k % W) * S, 0, minZ + Math.floor(k / W) * S));
  pts.reverse(); pts[0] = a.clone(); pts[pts.length - 1] = b.clone();
  return pts;
}
function updateGuide(dt, t, show) {
  let target = typeof guide.target === 'function' ? guide.target() : guide.target;
  const on = show && target;
  if (on) {
    // re-plan only when Nefira has walked a bit, or the goal changed
    if (player.pos.distanceTo(guide.from) > 8 || !guide.to || guide.to.distanceTo(target) > 1) { guide.path = findPath(player.pos, target); guide.from.copy(player.pos); guide.to = target.clone(); }
  }
  // walk along the path from just ahead of Nefira, one arrow every 8 units
  let n = 0;
  if (on && guide.path.length > 1 && Math.hypot(target.x - player.pos.x, target.z - player.pos.z) > 10) {
    let carry = 5;
    for (let k = 0; k < guide.path.length - 1 && n < ARROWS; k++) {
      const a = guide.path[k], b = guide.path[k + 1], seg = Math.hypot(b.x - a.x, b.z - a.z); if (seg < 1e-3) continue;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      for (let d = carry; d < seg && n < ARROWS; d += 8) {
        const x = a.x + (b.x - a.x) * d / seg, z = a.z + (b.z - a.z) * d / seg;
        if (Math.hypot(target.x - x, target.z - z) < 7) { k = guide.path.length; break; }
        const m = arrows[n++]; m.visible = true; m.position.set(x, Math.max(G(x, z), G(x + Math.sin(yaw) * 2, z + Math.cos(yaw) * 2), G(x - Math.sin(yaw) * 2, z - Math.cos(yaw) * 2)) + 0.6, z); m.rotation.set(0, yaw, 0);
        m.material.opacity = (0.6 + 0.4 * Math.max(0, Math.sin(t * 4 - n * 0.6))) * Math.min(1, n / 2);
        carry = d + 8 - seg;
      }
      if (carry < 0) carry = 0;
    }
  }
  for (let k = n; k < ARROWS; k++) arrows[k].visible = false;
}
let cardTimer = null;
function card(main, sub, sec = 4.5) {
  const el = $('teaser-title'); el.querySelector('.tt-main').textContent = main; el.querySelector('.tt-sub').textContent = sub;
  el.classList.remove('hidden'); void el.offsetWidth; el.classList.add('on');
  clearTimeout(cardTimer);
  return new Promise((res) => { cardTimer = setTimeout(() => { el.classList.remove('on'); setTimeout(() => { el.classList.add('hidden'); res(); }, 1600); }, sec * 1000); });
}
let fadeGoal = 0, fadeV = 0;
const fadeTo = (v, col = 0x000000) => { fadeGoal = v; E.grade.uniforms.uFadeCol.value.setHex(col); return wait(1.4); };
function memory(title) { toast(`✦ זיכרון: ${title}`, 5); }

// time
const waiters = [];
const wait = (sec) => new Promise((res) => waiters.push({ t: sec, res }));
const until = (fn) => new Promise((res) => waiters.push({ fn, res }));

// world state for scenes
const world = { hour: 16, hourGoal: 16, dark: 0, darkGoal: 0, tint: new THREE.Color(1, 1, 1), tintGoal: new THREE.Color(1, 1, 1) };

// ================================================================ interactions
const inter = [];   // { pos, r, label, hold?, use(), on() }
let holdT = 0, curInter = null;
function addInter(o) { inter.push(o); return o; }
function clearInter() { inter.length = 0; }

// ================================================================ chapters
const CHAPTERS = ['פרולוג', 'פרק 1 · העיר החיה', 'פרק 2 · הכוהנת', 'פרק 3 · החול', 'פרק 4 · האח'];
let chapter = 0, phase = 'title';
const saveProgress = (n) => { try { localStorage.setItem(SAVE, String(Math.max(n, +localStorage.getItem(SAVE) || 0))); } catch { /* ignore */ } };

async function prologue() {
  chapter = 0; phase = 'cinema';
  world.hour = world.hourGoal = 6.4; world.dark = world.darkGoal = 0;
  city.group.visible = false; city.crowd.forEach((p) => { p.visible = false; }); city.lamps.forEach((l) => { l.g.visible = false; }); baker.visible = false;
  const base = NPC_POS.nefira.clone(); base.y = G(base.x, base.z);
  const N = (x, y, z) => base.clone().add(V3(x, y, z));
  ghost.visible = true; ghost.position.copy(base).setY(base.y + 1.5); ghost.rotation.set(0, 0, 0);
  const gm = []; ghost.traverse((o) => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; gm.push({ m: o.material, o: o.material.opacity ?? 1 }); } });
  const fadeG = (a) => gm.forEach(({ m, o }) => { m.opacity = o * a; });
  const glow = new THREE.PointLight(0x8fd3ff, 1.5, 60, 1.6); scene.add(glow);
  const place = (y, tilt, spin) => { ghost.position.copy(base).setY(base.y + y); ghost.rotation.set(tilt, spin, 0); glow.position.copy(ghost.position).add(V3(0, 8, 0)); };
  await fadeTo(0);
  await cinema.play([
    { from: N(4, 11, 30), to: N(2, 11, 22), look: N(0, 10.5, 0), dur: 5, caption: 'נפירה: "וואי… איזה זיכרונות מהעבר."', update: (k) => place(1.5 + Math.sin(k * 6) * 0.3, 0, Math.sin(k * 3) * 0.1) },
    { from: N(16, 8, 22), to: N(19, 6, 24), look: N(0, 5, 0), dur: 3.2, update: (k) => { const e = k * k; place(1.5 - e * 1.1, -e * 1.35, 0); } },
    { from: N(7, 2, -24), to: N(0, 20, -50), look: () => ghost.position.clone().add(V3(0, 3, 0)), dur: 8,
      update: (k) => { const e = k * k; place(0.4 + e * 150, -1.35 + k * 0.5, k * 2.2); glow.intensity = 1.5 + k * 4; fadeG(1 - THREE.MathUtils.smoothstep(k, 0.55, 0.98)); } },
    { from: N(0, 20, -50), to: N(0, 26, -56), look: N(0, 160, 0), dur: 3, start: () => { fadeTo(1, 0xffffff); }, end: () => { ghost.visible = false; scene.remove(glow); } },
  ]);
  ghost.visible = false; scene.remove(glow);
  await card('שלושת אלפים שנה קודם…', 'כם-אשר, העיר החיה', 4);
  return chapter1();
}

async function chapter1() {
  chapter = 1; phase = 'cinema'; saveProgress(1); clearInter();
  world.hour = world.hourGoal = 15.5; world.dark = world.darkGoal = 0; world.tintGoal.set(1, 1, 1);
  city.group.visible = true; city.crowd.forEach((p) => { p.visible = true; }); city.lamps.forEach((l) => { l.g.visible = true; l.set(false); }); baker.visible = true;
  useModel('child'); merit.visible = false; king.g.visible = false; golem.group.visible = false; golem.trickle.visible = false; setharMan.group.visible = false;
  const home = CITY.home;
  placePlayer(home.x, home.z - 6, Math.PI);
  setharBoy.group.visible = true; setharBoy.group.position.set(home.x + 8, G(home.x + 8, home.z - 20), home.z - 20); setharBoy.group.rotation.y = -2.2;
  await fadeTo(0, 0xffffff);
  card('אגדות נפירה', CHAPTERS[1], 4);
  phase = 'play';
  await talk(setharBoy.group, setharBoy.h, [
    ['sethar', 'נפירה! אמא אומרת שאת שוב מאחרת. השמש כבר באמצע השמיים, ואת עוד חולמת.'],
    ['nefira', 'חלמתי שהשמש מדברת איתי, סת\'אר.'],
    ['sethar', 'השמש לא מדברת, אחותי הקטנה. היא רק שורפת. ויש לה מזל שהיא שורפת, כי בלעדיה יש רק לילה.'],
    ['sethar', 'תביאי לחם מהאופה בשוק לפני השקיעה. אני אחכה לך ליד הבאר.'],
  ]);
  setharBoy.group.visible = false;
  objective('הביאי לחם מחנוט האופה, בשוק', 'עקבי אחרי החצים על הרצפה', baker.position);
  let gotBread = false;
  addInter({ pos: baker.position, r: 14, label: 'לדבר עם חנוט האופה', on: () => !gotBread, use: async () => {
    gotBread = true;
    await talk(baker, 6, [
      ['baker', 'הכוהנת הקטנה של כם-אשר! הנה, לחם חם. ועוגת תמרים בשביל אחיך. הוא אוהב מתוק, גם אם הוא לא מודה.'],
      ['nefira', 'תודה, חנוט!'],
      ['baker', 'מהרי, ילדה. השמש כבר נמוכה, ואחיך לא אוהב כשהשמש הולכת.'],
    ]);
  } });
  await until(() => gotBread && !dialogOpen);
  world.hourGoal = 18.9;
  objective('לכי אל סת\'אר, ליד הבאר', 'עקבי אחרי החצים על הרצפה', CITY.well);
  await until(() => player.pos.distanceTo(CITY.well) < 26);
  world.hourGoal = 20.3;
  await monologue([['nefira', 'סת\'אר? …הוא לא כאן. והשמש כבר שקעה.'], ['narrator', 'מאיפשהו בחושך נשמעת נשימה שקטה. מישהו מסתתר. אולי אור יעזור למצוא אותו.']]);
  let lit = 0;
  const nextLamp = () => { const l = city.lamps.filter((q) => !q.lit).sort((p, q) => Math.hypot(p.x - player.pos.x, p.z - player.pos.z) - Math.hypot(q.x - player.pos.x, q.z - player.pos.z))[0]; return l ? V3(l.x, 0, l.z) : null; };
  objective('הדליקי את הפנסים ברחוב (0/4)', 'החזיקי E / A ליד פנס כדי להדליק אותו', nextLamp);
  for (const l of city.lamps) addInter({ pos: V3(l.x, G(l.x, l.z), l.z), r: 9, label: 'להדליק את הפנס', hold: 1.2, on: () => !l.lit, use: () => {
    l.set(true); lit++; objective(`הדליקי את הפנסים ברחוב (${lit}/4)`, lit < 4 ? 'החזיקי E / A ליד פנס כדי להדליק אותו' : '', nextLamp);
  } });
  await until(() => lit >= 4);
  const hide = V3(CITY.well.x + 10, 0, CITY.well.z + 8); hide.y = G(hide.x, hide.z);
  setharBoy.group.visible = true; setharBoy.group.position.copy(hide); setharBoy.pose = { kneel: 0.55, headDown: 1 };
  objective('מצאי את סת\'אר', 'הוא מאחורי הבאר', hide);
  let found = false;
  addInter({ pos: hide, r: 12, label: 'לדבר עם סת\'אר', on: () => !found, use: async () => {
    found = true;
    await talk(setharBoy.group, 5, [
      ['nefira', 'סת\'אר? למה אתה יושב בחושך?'],
      ['sethar', 'אני… לא יושב בחושך. אני מתחבא ממנו.'],
      ['sethar', 'כשהשמש שוקעת, נדמה לי שהחושך מסתכל עליי. שהוא מחכה שאעצום עיניים.'],
      ['nefira', 'אז אני אהיה האור שלך. בכל לילה. אני מבטיחה.'],
      ['sethar', 'מבטיחה? גם כשתהיי כוהנת גדולה וחשובה?'],
      ['nefira', 'במיוחד אז.'],
      ['sethar', '…בואי הביתה, אחותי הקטנה. הלחם בטח כבר קר.'],
    ]);
    setharBoy.pose = {};
  } });
  await until(() => found && !dialogOpen);
  memory('ההבטחה');
  objective('');
  await wait(2.5);
  await fadeTo(1);
  setharBoy.group.visible = false;
  return chapter2();
}

async function chapter2() {
  chapter = 2; phase = 'cinema'; saveProgress(2); clearInter();
  world.hour = world.hourGoal = 10.5; world.dark = world.darkGoal = 0; world.tintGoal.set(1, 1, 1);
  city.group.visible = true; city.crowd.forEach((p) => { p.visible = true; }); city.lamps.forEach((l) => { l.g.visible = true; l.set(false); }); baker.visible = true;
  useModel('adult'); setharBoy.group.visible = false;
  placePlayer(0, 236, Math.PI);
  merit.visible = true; merit.position.set(22, G(22, 214), 214); merit.rotation.y = -2.4;
  setharMan.group.visible = true; setharMan.group.position.set(-26, G(-26, 206), 206); setharMan.group.rotation.y = 2.4;
  await card('שנים אחר כך', CHAPTERS[2], 4);
  await fadeTo(0);
  phase = 'play';
  await talk(merit, 10, [
    ['merit', 'נפירה. היום את הופכת לכוהנת השמש של כם-אשר.'],
    ['merit', 'כווני את שלוש המראות, כך שהאור של השמש יגיע אל דלת הזהב של הפירמידה. רק כוהנת אמיתית יודעת לאן האור רוצה ללכת.'],
    ['nefira', 'ואם אטעה?'],
    ['merit', 'אז תנסי שוב. גם השמש זורחת מחדש בכל בוקר.'],
  ]);
  // three mirrors; each has 4 directions, one of them sends the light to the gate
  const target = V3(0, 22, PYR.HALF + 24);
  const mirrors = [V3(-48, 0, 196), V3(48, 0, 196), V3(0, 0, 262)].map((p, i) => {
    p.y = G(p.x, p.z);
    const m = buildMirror(); m.g.position.copy(p); scene.add(m.g); scene.add(m.beam);
    const good = Math.atan2(target.x - p.x, target.z - p.z);
    const dirs = [good + Math.PI * 0.5, good + Math.PI, good - Math.PI * 0.5, good];
    const st = { m, p, idx: i, dir: 0, dirs, ok: false };
    const set = () => {
      st.ok = st.dir === 3; m.head.rotation.y = dirs[st.dir];
      m.beam.visible = st.ok;
      if (st.ok) { const from = p.clone().add(V3(0, 7, 0)), len = from.distanceTo(target); m.beam.position.copy(from).lerp(target, 0.5); m.beam.scale.set(1, len, 1); m.beam.lookAt(target); m.beam.rotateX(Math.PI / 2); }
    };
    set(); st.set = set; return st;
  });
  E.paintScene();
  const okCount = () => mirrors.filter((s) => s.ok).length;
  const nextMirror = () => { const m = mirrors.find((q) => !q.ok); return m ? m.p : null; };
  objective('כווני את מראות השמש (0/3)', 'לחצי E / A ליד מראה כדי לסובב אותה', nextMirror);
  for (const s of mirrors) addInter({ pos: s.p, r: 10, label: 'לסובב את המראה', on: () => !s.ok, use: () => {
    s.dir = (s.dir + 1) % 4; s.set();
    objective(`כווני את מראות השמש (${okCount()}/3)`, s.ok ? 'האור הגיע אל הדלת!' : 'לחצי E / A ליד מראה כדי לסובב אותה', nextMirror);
  } });
  await until(() => okCount() >= 3);
  clearInter(); objective('');
  glyphUniforms.uGlow.value = 4;
  await wait(1.5);
  // the eclipse
  phase = 'cinema';
  world.darkGoal = 0.85; world.tintGoal.set(0.85, 0.75, 1.1);
  await cinema.play([
    { from: [0, 30, 300], to: [0, 70, 330], look: [0, 120, 0], lookTo: [0, 180, -200], dur: 6, caption: 'ואז, באמצע היום, השמש התחילה להיעלם.' },
  ]);
  await talk(setharMan.group, setharMan.h, [
    ['sethar', 'את רואה, נפירה? ליקוי. אפילו השמש פוחדת.'],
    ['nefira', 'זה רק צל שעובר, סת\'אר. הוא ילך.'],
    ['sethar', 'לא הפעם. בניתי את הפירמידה הזאת בשביל רגע כזה. אכלא בתוכה את החושך, ואף אחד בכם-אשר לא יפחד ממנו יותר. אף פעם.'],
    ['merit', 'מלכי, אי אפשר לכלוא את החושך. אפשר רק להחזיק לו אור.'],
    ['sethar', 'אז אני אהיה זה שמחזיק אותו.'],
  ]);
  phase = 'cinema';
  setharMan.pose = { armsUp: 1 }; setharMan.setGlow(0.0);
  await cinema.play([
    { from: () => setharMan.group.position.clone().add(V3(20, 8, 30)), to: () => setharMan.group.position.clone().add(V3(12, 10, 20)), look: () => setharMan.group.position.clone().add(V3(0, 10, 0)), dur: 5,
      caption: 'סת\'אר הרים את ידיו אל השמש האפלה, והיא ירדה אליו.', update: (k) => { setharMan.setGlow(k * 0.6); E.grade.uniforms.uTint.value.setRGB(0.85 - k * 0.1, 0.75 - k * 0.15, 1.1 + k * 0.2); } },
  ]);
  setharMan.pose = {};
  await talk(setharMan.group, setharMan.h, [
    ['nefira', 'סת\'אר… העיניים שלך.'],
    ['sethar', 'אל תדאגי, אחותי הקטנה. עכשיו אני כבר לא מפחד.'],
  ]);
  memory('הליקוי');
  await wait(2);
  await fadeTo(1);
  mirrors.forEach((s) => { scene.remove(s.m.g, s.m.beam); });
  setharMan.group.visible = false; setharMan.setGlow(0); merit.visible = false;
  return chapter3();
}

async function chapter3() {
  chapter = 3; phase = 'cinema'; saveProgress(3); clearInter();
  world.hour = world.hourGoal = 18.2; world.dark = world.darkGoal = 0.45; world.tintGoal.set(0.9, 0.85, 1.05);
  city.group.visible = true; city.crowd.forEach((p) => { p.visible = false; }); city.lamps.forEach((l) => { l.g.visible = true; l.set(false); }); baker.visible = false;
  useModel('adult');
  const home = CITY.home;
  placePlayer(home.x, home.z - 6, Math.PI);
  merit.visible = true; merit.position.set(home.x + 8, G(home.x + 8, home.z - 20), home.z - 20); merit.rotation.y = -2.2;
  await card('העיר מתרוקנת', CHAPTERS[3], 4);
  await fadeTo(0);
  phase = 'play';
  await talk(merit, 10, [
    ['merit', 'האנשים בורחים, נפירה. מהמלך שלהם. החושך שבתוכו גדל בכל לילה.'],
    ['merit', 'את יודעת מה צריך לעשות. שומר. גוף מהחול של העיר, שישמור עליה גם כשאנחנו כבר לא נהיה כאן.'],
    ['nefira', 'גוף בלי חיים לא יכול לשמור על כלום.'],
    ['merit', 'אז אולי יום אחד נמצא לו חיים. אבל קודם, החול. מכל מקום שאת אוהבת בעיר הזאת.'],
  ]);
  merit.visible = false;
  let got = 0;
  const lines = [
    'כאן קנינו לחם. כאן הוא עוד צחק.',
    'כאן הדלקתי בשבילו את הפנסים.',
    'כאן גדלנו. שנינו.',
    'כאן ראיתי את העיניים שלו משתנות.',
  ];
  const spots = CITY.sandSpots.map((s, i) => {
    const sp = buildSandSpot(); sp.g.position.set(s.x, G(s.x, s.z), s.z); scene.add(sp.g);
    const st = { sp, done: false };
    addInter({ pos: sp.g.position, r: 9, label: `לאסוף ${s.name}`, hold: 1.5, on: () => !st.done, use: async () => {
      st.done = true; sp.g.visible = false; got++;
      objective(`אספי חול מארבעה מקומות בעיר (${got}/4)`, '', nextSand);
      await monologue([['nefira', lines[i]]]);
    } });
    return st;
  });
  const nextSand = () => { const s2 = spots.filter((q) => !q.done).sort((p, q) => p.sp.g.position.distanceTo(player.pos) - q.sp.g.position.distanceTo(player.pos))[0]; return s2 ? s2.sp.g.position : null; };
  objective('אספי חול מארבעה מקומות בעיר (0/4)', 'השוק, הבאר, הבית ומדרגות המקדש. החזיקי E / A', nextSand);
  await until(() => got >= 4 && !dialogOpen);
  spots.forEach((s) => scene.remove(s.sp.g));
  objective('לכי אל שדה החול שבקצה העיר', 'עקבי אחרי החצים על הרצפה', FIELD);
  await until(() => player.pos.distanceTo(FIELD) < 40);
  objective('');
  // the guardian rises from the sand
  phase = 'cinema'; player.frozen = true;
  faceTo(FIELD);
  haru.pos.copy(FIELD).setY(G(FIELD.x, FIELD.z)); haru.emerge = 0; haru.alive = false;
  golem.group.visible = true; golem.trickle.visible = true; golem.group.rotation.y = Math.atan2(player.pos.x - FIELD.x, player.pos.z - FIELD.z); setHaruLife(0.05); golem.setPower(0);
  player.pose = { armsOut: 1 };
  await cinema.play([
    { from: () => FIELD.clone().add(V3(34, 10, 30)), to: () => FIELD.clone().add(V3(22, 14, 26)), look: () => haru.pos.clone().add(V3(0, 8, 0)), dur: 7,
      caption: 'נפירה פיזרה את החול, והחול זכר את העיר. הוא התרומם, והתעצב, ועמד.',
      update: (k, dt) => { haru.emerge = THREE.MathUtils.smoothstep(k, 0.05, 0.95); if (Math.random() < 0.5) E.world.dust.puff(FIELD.x + (Math.random() - 0.5) * 14, G(FIELD.x, FIELD.z), FIELD.z + (Math.random() - 0.5) * 14, 8, 1.6); } },
  ]);
  player.pose = {}; player.frozen = false;
  await talk(golem.group, 15, [
    ['nefira', 'הנה אתה. השומר שלי.'],
    ['nefira', 'אתה גבוה יותר ממה שחשבתי.'],
    ['nefira', 'אבל אתה לא זז… יש לך גוף, ואין בך חיים. עוד לא.'],
  ]);
  await monologue([['sethar', 'נפירה. את בונה חייל נגדי?']]);
  memory('החול');
  await wait(1.5);
  return chapter4();
}

// ---------------------------------------------------------------- chapter 4: the fight she refuses to fight
const fight = { on: false, hp: 100, pleas: 0, cool: 3, orbs: [], waves: [], calm: 0, hit: 0 };
const fxGroup = new THREE.Group(); scene.add(fxGroup);
const orbMat = new THREE.MeshStandardMaterial({ color: 0x1a0830, emissive: 0x7a3aff, emissiveIntensity: 2.5 });
const warnMat = new THREE.MeshBasicMaterial({ color: 0xb06aff, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
const waveMat = new THREE.MeshBasicMaterial({ color: 0x9a5aff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
const KING = V3(ARENA.x, 0, ARENA.z + 40);
const PLEAS = [
  ['אני לא רוצה להילחם בך, סת\'אר.', 'שקט!'],
  ['זוכר את הפנסים? הבטחתי להיות האור שלך.', 'האור שלך לא הספיק!'],
  ['אתה לא החושך. אתה רק פוחד ממנו.', 'אני כבר לא פוחד!'],
  ['אני לא רוצה להרוג אותך. אני לא רוצה לפגוע בך.', '…אז תיפלי.'],
];
function shout(t) { const el = $('boss-shout'); el.textContent = t; el.classList.remove('hidden'); clearTimeout(shout.t); shout.t = setTimeout(() => el.classList.add('hidden'), 2600); }
function hurt(n) {
  if (fight.hit > 0) return;
  fight.hp = Math.max(20, fight.hp - n); fight.hit = 0.8;
  $('hurt').classList.remove('on'); void $('hurt').offsetWidth; $('hurt').classList.add('on');
  $('hpbar-fill').style.width = `${fight.hp}%`; $('hp-text').textContent = Math.round(fight.hp);
}
function spawnOrb() {
  const p = player.pos.clone().add(V3((Math.random() - 0.5) * 22, 0, (Math.random() - 0.5) * 22)); p.y = G(p.x, p.z);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 10), orbMat); orb.position.copy(p).add(V3(0, 70, 0));
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 5, 28), warnMat); ring.rotation.x = -Math.PI / 2; ring.position.copy(p).add(V3(0, 0.4, 0));
  fxGroup.add(orb, ring); fight.orbs.push({ orb, ring, p, t: 0 });
}
function spawnWave() {
  const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.7, 6, 48), waveMat); r.rotation.x = Math.PI / 2;
  r.position.copy(KING).setY(G(KING.x, KING.z) + 1); fxGroup.add(r); fight.waves.push({ r, rad: 4 });
}
function updateFight(dt, t) {
  king.g.position.set(KING.x, G(KING.x, KING.z) + 4 + Math.sin(t * 1.3) * 2, KING.z);
  king.g.rotation.y = Math.atan2(player.pos.x - KING.x, player.pos.z - KING.z);
  king.crown.rotation.z += dt * 0.8; king.ringMat.emissiveIntensity = 2.5 + Math.sin(t * 4) * 0.8;
  king.hands.forEach((h, i) => { h.rotation.x = Math.sin(t * 2 + i) * 0.15 - 0.1; });
  fight.hit -= dt;
  if (!fight.on) return;
  fight.calm -= dt; fight.cool -= dt;
  if (fight.calm <= 0 && fight.cool <= 0) {
    if (Math.random() < 0.45) spawnWave(); else { spawnOrb(); spawnOrb(); if (fight.pleas >= 2) spawnOrb(); }
    fight.cool = 2.6 - fight.pleas * 0.35;
  }
  for (let i = fight.orbs.length - 1; i >= 0; i--) {
    const o = fight.orbs[i]; o.t += dt;
    o.orb.position.y = o.p.y + 70 * Math.max(0, 1 - o.t / 1.5);
    o.ring.material.opacity = 0.3 + 0.3 * Math.sin(o.t * 12);
    if (o.t >= 1.5) {
      if (Math.hypot(player.pos.x - o.p.x, player.pos.z - o.p.z) < 5.5) hurt(12);
      E.world.dust.puff(o.p.x, o.p.y, o.p.z, 10, 2);
      fxGroup.remove(o.orb, o.ring); fight.orbs.splice(i, 1);
    }
  }
  for (let i = fight.waves.length - 1; i >= 0; i--) {
    const w = fight.waves[i]; w.rad += dt * 34; w.r.scale.set(w.rad, w.rad, 1); w.r.material.opacity = Math.max(0, 0.8 - w.rad / 140);
    const d = Math.hypot(player.pos.x - KING.x, player.pos.z - KING.z);
    if (Math.abs(d - w.rad) < 2.2 && player.pos.y - G(player.pos.x, player.pos.z) < 2) hurt(15);
    if (w.rad > 120) { fxGroup.remove(w.r); fight.waves.splice(i, 1); }
  }
}
function clearFight() { for (const o of fight.orbs) fxGroup.remove(o.orb, o.ring); for (const w of fight.waves) fxGroup.remove(w.r); fight.orbs = []; fight.waves = []; }

async function chapter4() {
  chapter = 4; phase = 'cinema'; saveProgress(4); clearInter();
  world.hour = world.hourGoal = 21; world.dark = world.darkGoal = 0.85; world.tintGoal.set(0.85, 0.78, 1.12);
  city.crowd.forEach((p) => { p.visible = false; }); baker.visible = false; merit.visible = false;
  useModel('adult');
  haru.pos.copy(FIELD).setY(G(FIELD.x, FIELD.z)); haru.emerge = 1; golem.group.visible = true; golem.trickle.visible = true; setHaruLife(0.05); golem.setPower(0);
  golem.group.rotation.y = 0;
  placePlayer(FIELD.x, FIELD.z + 30, 0);
  king.g.visible = true; king.g.scale.setScalar(1);
  card('אגדות נפירה', CHAPTERS[4], 4);
  await cinema.play([
    { from: () => KING.clone().add(V3(60, 30, -40)), to: () => KING.clone().add(V3(40, 24, -60)), look: () => king.g.position.clone().add(V3(0, 22, 0)), dur: 6, caption: 'מה שנשאר מסת\'אר ירד מהשמיים. כבר לא ילד שפוחד מהחושך. החושך עצמו.' },
  ]);
  phase = 'play';
  await talk(king.g, 34, [
    ['sethar', 'גם את עוזבת אותי? כמו כולם?'],
    ['nefira', 'אני כאן, סת\'אר. תמיד הייתי כאן.'],
    ['sethar', 'אז למה את בונה לי שומר מחול?!'],
  ]);
  $('hpbar').classList.remove('hidden'); $('hpbar-fill').style.width = '100%'; $('hp-text').textContent = '100';
  objective('אל תילחמי בו', 'אין לך נשק. התחמקי מהכדורים, קפצי מעל גלי החושך (רווח / B), והתקרבי אליו כדי לדבר (E / A).');
  Object.assign(fight, { on: true, hp: 100, pleas: 0, cool: 2, calm: 0 });
  addInter({ pos: KING, r: 46, label: 'לדבר עם סת\'אר', on: () => fight.on && fight.calm <= 0, use: async () => {
    const [plea, answer] = PLEAS[fight.pleas];
    fight.calm = 3.5; fight.pleas++;
    toast(`נפירה: "${plea}"`, 3.2);
    await wait(1.4); shout(`סת'אר: ${answer}`);
  } });
  await until(() => fight.pleas >= 4 || fight.hp <= 20);
  await wait(1.2);
  fight.on = false; clearFight(); clearInter();
  // the last blow
  phase = 'cinema';
  const fall = V3(FIELD.x + 4, 0, FIELD.z + 12); fall.y = G(fall.x, fall.z);
  await cinema.play([
    { from: () => KING.clone().add(V3(30, 20, -30)), look: () => king.g.position.clone().add(V3(0, 20, 0)), dur: 2.2, caption: 'סת\'אר אסף את כל החושך שבו, ושחרר אותו.', start: () => spawnWave() },
    { from: () => fall.clone().add(V3(20, 10, 22)), look: () => player.pos.clone().add(V3(0, 4, 0)), dur: 2.5,
      start: () => { placePlayer(fall.x, fall.z, Math.PI); player.pose = { kneel: 1, headDown: 1 }; hurt(0); fight.hp = 6; $('hpbar-fill').style.width = '6%'; $('hp-text').textContent = '6'; } },
  ]);
  clearFight();
  phase = 'play'; player.frozen = true;
  objective('תני לחארו את הנשמה ואת הגוף שלך', 'החזיקי E / A');
  let given = false;
  addInter({ pos: player.pos.clone(), r: 30, label: 'לתת לחארו את הנשמה ואת הגוף', hold: 4, on: () => !given, use: () => { given = true; } });
  await until(() => given);
  clearInter(); objective(''); $('hpbar').classList.add('hidden');
  player.frozen = true; phase = 'cinema';
  await monologue([
    ['nefira', 'אני יודעת שזה ייקח ממני את מי שאני, ולא ישאיר ממני כמעט כלום.'],
    ['nefira', 'אבל אני לא רוצה להילחם בך.'],
  ]);
  // soul to Haru
  const stream = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(240 * 3), 3)),
    new THREE.PointsMaterial({ color: 0xaee4ff, size: 1.3, transparent: true, opacity: 0.9, depthWrite: false }));
  stream.frustumCulled = false; scene.add(stream);
  const seeds = Array.from({ length: 240 }, () => Math.random());
  await cinema.play([
    { from: () => FIELD.clone().add(V3(36, 12, 24)), to: () => FIELD.clone().add(V3(26, 16, 14)), look: () => haru.pos.clone().add(V3(0, 9, 0)), dur: 6, caption: '',
      update: (k) => {
        const a = player.pos.clone().add(V3(0, 4, 0)), b = haru.pos.clone().add(V3(0, 10, 0)), arr = stream.geometry.attributes.position.array;
        for (let i = 0; i < seeds.length; i++) { const u = (seeds[i] + k * 1.6) % 1; const p = a.clone().lerp(b, u); p.y += Math.sin(u * Math.PI) * 10; arr[i * 3] = p.x + Math.sin(i) * 0.8; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z + Math.cos(i) * 0.8; }
        stream.geometry.attributes.position.needsUpdate = true;
        setHaruLife(0.05 + k * 1.2); golem.setPower(k); player.model.setGlow(k * 1.5);
        E.grade.uniforms.uTint.value.setRGB(0.85 + k * 0.3, 0.78 + k * 0.3, 1.12);
      } },
    { from: () => FIELD.clone().add(V3(26, 16, 14)), look: () => haru.pos.clone().add(V3(0, 9, 0)), dur: 1.4, start: () => { fadeTo(1, 0xffffff); } },
  ]);
  scene.remove(stream);
  // what is left of her: a spirit. Sethar is pulled into the black pyramid.
  player.model.group.visible = false; player.model.setGlow(0);
  ghost.visible = true; ghost.traverse((o) => { if (o.material) { o.material.opacity = 1; } }); ghost.position.copy(player.pos).setY(player.pos.y + 1.5); ghost.rotation.set(0, Math.PI, 0);
  setHaruLife(1); golem.setPower(1); haru.alive = true;
  world.darkGoal = 0.2; world.tintGoal.set(1, 1, 1);
  await fadeTo(0);
  const kingFrom = king.g.position.clone(), kingTo = V3(0, PYR.HEIGHT * 0.6, 0);
  await cinema.play([
    { from: () => FIELD.clone().add(V3(60, 40, 60)), to: () => FIELD.clone().add(V3(40, 60, 90)), look: () => king.g.position.clone(), dur: 6, caption: 'האור שעבר לחארו דחף את החושך אל המקום היחיד שנבנה כדי להחזיק אותו.',
      update: (k) => { king.g.position.lerpVectors(kingFrom, kingTo, THREE.MathUtils.smoothstep(k, 0.1, 1)); king.g.scale.setScalar(Math.max(0.05, 1 - k)); glyphUniforms.uGlow.value = 2 + k * 5; },
      end: () => { king.g.visible = false; } },
  ]);
  await talk(ghost, 12, [['ghost', 'לך לישון, אחי. השמש תשמור עליך עכשיו.']]);
  phase = 'cinema';
  await cinema.play([
    { from: () => haru.pos.clone().add(V3(0, 14, 34)), to: () => haru.pos.clone().add(V3(0, 12, 26)), look: () => haru.pos.clone().add(V3(0, 10, 0)), dur: 6,
      caption: 'והשומר שקע בחול, לחכות.', update: (k) => { haru.emerge = 1 - THREE.MathUtils.smoothstep(k, 0.25, 1); } },
  ]);
  await fadeTo(1);
  saveProgress(5);
  return ending();
}

async function ending() {
  phase = 'ended'; objective('');
  $('hud').classList.add('hidden');
  $('l-end').classList.remove('hidden');
}

// ================================================================ title screen
function showTitle() {
  phase = 'title';
  $('hud').classList.add('hidden'); $('l-end').classList.add('hidden'); $('l-title').classList.remove('hidden');
  let best = 0; try { best = +localStorage.getItem(SAVE) || 0; } catch { /* ignore */ }
  const cont = $('l-continue');
  cont.classList.toggle('hidden', best < 1 || best > 4);
  if (best >= 1 && best <= 4) cont.textContent = `המשך: ${CHAPTERS[best]}`;
}
const STARTS = [prologue, chapter1, chapter2, chapter3, chapter4];
function start(n) {
  $('l-title').classList.add('hidden'); $('hud').classList.remove('hidden');
  E.grade.uniforms.uFade.value = fadeV = 1; fadeGoal = 1;
  STARTS[n]().catch((e) => { console.error(e); throw e; });
}
$('l-new').onclick = () => start(0);
$('l-continue').onclick = () => { let b = 1; try { b = +localStorage.getItem(SAVE) || 1; } catch { /* ignore */ } start(Math.min(4, Math.max(1, b))); };
$('l-again').onclick = () => { $('l-end').classList.add('hidden'); start(0); };
$('l-menu').onclick = () => location.reload();
$('cine-skip').addEventListener('click', () => cinema.finish());

// ================================================================ frame loop
const clock = new THREE.Clock();
let t = 0;
const fwd = new THREE.Vector3();
function resolveCollisions(p, r) {
  for (const c of colliders) {
    if (c.type === 'box') {
      const minX = c.minX - r, maxX = c.maxX + r, minZ = c.minZ - r, maxZ = c.maxZ + r;
      if (p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ) {
        const pen = [maxX - p.x, p.x - minX, maxZ - p.z, p.z - minZ], i = pen.indexOf(Math.min(...pen));
        if (i === 0) p.x = maxX; else if (i === 1) p.x = minX; else if (i === 2) p.z = maxZ; else p.z = minZ;
      }
    } else {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-4) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
    }
  }
}
function handlePad(dt) {
  pad.deadzone = ctl.deadzone; pad.poll(dt);
  if (!pad.connected) return;
  const A = ctl.pad('action');
  if (phase === 'title' || phase === 'ended') { menuNav(pad, dt); return; }
  if (dialogOpen) { if (pad.hit(A) || pad.hit(BTN.B)) advance(); return; }
  if (cinema.playing) { if (pad.hit(A) || pad.hit(BTN.MENU)) cinema.finish(); return; }
  if (pad.hit(A)) { if (ctl.smartA && !curInter) jumpPressed = true; else actPressed = true; }
  if (!ctl.smartA && pad.hit(ctl.pad('jump'))) jumpPressed = true;
  if (pad.isDown(A)) keys.PadA = true; else keys.PadA = false;
  const [lxx] = ctl.lookAxes(pad); if (lxx) cam.orbit -= lxx * dt * 2.4;
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05) * (window.__legendsSpeed || 1);   // __legendsSpeed: test speed-up only
  t += dt;
  handlePad(dt);
  for (let i = waiters.length - 1; i >= 0; i--) {
    const w = waiters[i];
    if (w.fn ? w.fn() : (w.t -= dt) <= 0) { waiters.splice(i, 1); w.res(); }
  }
  // sky and colour
  world.hour += (world.hourGoal - world.hour) * Math.min(1, dt * 0.35);
  world.dark += (world.darkGoal - world.dark) * Math.min(1, dt * 0.4);
  world.tint.lerp(world.tintGoal, Math.min(1, dt * 0.5));
  if (phase !== 'cinema') E.grade.uniforms.uTint.value.copy(world.tint);
  fadeV += (fadeGoal - fadeV) * Math.min(1, dt * 2.6); E.grade.uniforms.uFade.value = fadeV;

  // player movement
  const m = player.model;
  const canMove = phase === 'play' && !dialogOpen && !player.frozen && !cinema.playing;
  let fwdIn = 0, turnIn = 0;
  if (canMove) {
    if (keys.KeyW || keys.ArrowUp) fwdIn += 1; if (keys.KeyS || keys.ArrowDown) fwdIn -= 1;
    if (keys.KeyD || keys.ArrowRight) turnIn -= 1; if (keys.KeyA || keys.ArrowLeft) turnIn += 1;
    if (touch.active) { fwdIn += -touch.y; turnIn += -touch.x; }
    if (pad.connected) { const [mx, my] = ctl.moveAxes(pad); fwdIn += -my; turnIn += -mx; if (pad.isDown(ctl.pad('walk')) || pad.isDown(ctl.pad('run'))) fwdIn = Math.max(fwdIn, 1); }
  }
  fwdIn = THREE.MathUtils.clamp(fwdIn, -1, 1); turnIn = THREE.MathUtils.clamp(turnIn, -1, 1);
  const run = (keys.ShiftLeft || keys.ShiftRight || touch.run || (pad.connected && pad.isDown(ctl.pad('run')))) && fwdIn > 0;
  const scale = m.h / 10.6, WALK = 16 * Math.max(0.75, scale), RUN = WALK * 1.9;
  player.facing += turnIn * 2.3 * dt;
  player.speed = THREE.MathUtils.damp(player.speed, fwdIn > 0 ? (run ? RUN : WALK) * fwdIn : fwdIn * WALK * 0.55, 7, dt);
  fwd.set(Math.sin(player.facing), 0, Math.cos(player.facing));
  player.pos.addScaledVector(fwd, player.speed * dt);
  resolveCollisions(player.pos, 1.6 * scale);
  const g = G(player.pos.x, player.pos.z);
  if (canMove && jumpPressed && player.grounded) { player.velY = 20; player.grounded = false; }
  jumpPressed = false;
  player.velY -= 55 * dt; player.pos.y += player.velY * dt;
  if (player.pos.y <= g) { player.pos.y = g; player.velY = 0; player.grounded = true; }
  m.group.position.copy(player.pos); m.group.rotation.y = player.facing;
  m.update(dt, Math.min(1, Math.abs(player.speed) / RUN), t, player.pose);

  // other characters
  setharBoy.group.visible && setharBoy.update(dt, 0, t, setharBoy.pose || {});
  setharMan.group.visible && setharMan.update(dt, 0, t, setharMan.pose || {});
  for (const npc of [setharBoy.group, setharMan.group, merit, baker]) if (npc.visible && talkNpc === npc) npc.rotation.y = Math.atan2(player.pos.x - npc.position.x, player.pos.z - npc.position.z);
  if (ghost.visible && phase !== 'cinema') ghost.position.y = (ghost.userData.y ??= ghost.position.y) + Math.sin(t * 1.2) * 0.5;
  if (golem.group.visible) {
    golem.group.position.copy(haru.pos); golem.group.position.y -= (1 - haru.emerge) * 18;
    golem.update(dt, 0, t, null);
  }
  if (king.g.visible && chapter === 4 && phase !== 'ended') updateFight(dt, t);
  city.update(t);
  updateGuide(dt, t, canMove && !fight.on);

  // interactions
  curInter = null;
  if (canMove) {
    let best = Infinity;
    for (const it of inter) { if (it.on && !it.on()) continue; const d = Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z); if (d < it.r && d < best) { best = d; curInter = it; } }
  } else if (phase === 'play' && player.frozen) {
    for (const it of inter) if (it.hold && (!it.on || it.on())) curInter = it;   // the last moment: she can't move, only give
  }
  const holding = keys.KeyE || keys.PadA;
  if (curInter) {
    const k = isConsole || pad.connected || isMobile ? 'A' : 'E';
    $('prompt').innerHTML = curInter.hold ? `החזיקי <b>${k}</b>: ${curInter.label}` : `לחצי <b>${k}</b>: ${curInter.label}`;
    $('prompt').classList.remove('hidden');
    if (curInter.hold) {
      holdT = holding ? holdT + dt : Math.max(0, holdT - dt * 2);
      $('progress').classList.toggle('hidden', holdT <= 0); $('progress-bar').style.width = `${Math.min(100, (holdT / curInter.hold) * 100)}%`;
      if (holdT >= curInter.hold) { holdT = 0; const it = curInter; $('progress').classList.add('hidden'); it.use(); }
    } else if (actPressed) { const it = curInter; it.use(); }
  } else { $('prompt').classList.add('hidden'); $('progress').classList.add('hidden'); holdT = 0; }
  actPressed = false;
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.add('hidden'); }
  document.body.classList.toggle('touch-live', isMobile && !isConsole && !pad.connected && phase === 'play' && !dialogOpen);
  document.body.classList.toggle('fight', fight.on);

  // camera
  const talkCtx = { heroPos: player.pos, heroFacing: player.facing, heroH: m.h, talkScale: Math.max(0.45, m.h / 16) };
  const cineCam = cinema.apply(camera, dt, talkCtx);
  if (cineCam) {
    const c = camera.position;
    for (const b of colliders) if (b.type === 'box' && c.x > b.minX - 1.5 && c.x < b.maxX + 1.5 && c.z > b.minZ - 1.5 && c.z < b.maxZ + 1.5) { c.y = Math.max(c.y, G(c.x, c.z) + 34); camera.lookAt(player.pos.x, player.pos.y + m.h * 0.6, player.pos.z); break; }
  }
  if (!cineCam) {
    if (!dragging) cam.orbit *= Math.exp(-dt * 1.4);
    const want = player.facing + Math.PI + cam.orbit;
    let dy = want - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); cam.yaw += dy * Math.min(1, dt * 4);
    const dist = m.h * 2.4 + 12, height = m.h * 1.05 + 3;
    const tp = V3(player.pos.x + Math.sin(cam.yaw) * dist, player.pos.y + height, player.pos.z + Math.cos(cam.yaw) * dist);
    if (phase === 'title') { const a = t * 0.05; tp.set(Math.sin(a) * 300, 60, 380 + Math.cos(a) * 120); camera.position.lerp(tp, 1); camera.lookAt(0, 60, 0); }
    else {
      const head = V3(player.pos.x, player.pos.y + m.h * 0.8, player.pos.z);
      for (let k = 1; k <= 20; k++) {   // walk from Nefira toward the camera; stop just before the first wall
        const q = head.clone().lerp(tp, k / 20);
        if (blockedCam(q)) { tp.copy(head.clone().lerp(tp, Math.max(0.12, (k - 1.5) / 20))); tp.y = Math.max(tp.y, head.y + 1); break; }
      }
      tp.y = Math.max(tp.y, G(tp.x, tp.z) + 2.5); camera.position.lerp(tp, Math.min(1, dt * 6)); camera.lookAt(player.pos.x, player.pos.y + m.h * 0.75, player.pos.z); }
  }
  E.world.update(dt, t, { center: phase === 'title' ? V3(0, 0, 300) : player.pos, wind: 5 + world.dark * 20 });
  E.updateSky(world.hour, phase === 'title' ? V3(0, 0, 300) : player.pos, world.dark);
  E.render();
}
// one-time beta notice (its own memory, separate from the first game)
(() => {
  let seen = false;
  try { seen = localStorage.getItem('legends.betaSeen') === '1'; } catch { /* no storage: show it */ }
  if (seen) return;
  $('beta').classList.remove('hidden');
  $('beta-ok').addEventListener('click', () => { $('beta').classList.add('hidden'); try { localStorage.setItem('legends.betaSeen', '1'); } catch { /* ignore */ } });
})();
useModel('child'); placePlayer(CITY.home.x, CITY.home.z + 2, Math.PI);
world.hour = world.hourGoal = 17.4;
showTitle();
frame();
window.__legends = { get arrowsVisible() { return arrows.filter((a) => a.visible).length; }, start, get phase() { return phase; }, get chapter() { return chapter; }, cinema, player, fight, get dialog() { return dialogOpen; }, advance, teleport: (x, z) => placePlayer(x, z, player.facing), get inter() { return curInter && curInter.label; } };
