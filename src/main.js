// main.js — game loop, real-time timer, input, HUD, save, story hookup, endings.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { PYR, WORLD_RADIUS, CAMP, colliders, groundAt, createWorld, envUniforms } from './world.js';
import { glyphUniforms } from './glyphs.js';
import { createGolem } from './golem.js';
import { createEditor, loadDesign } from './editor.js';
import { createCinema } from './cinema.js';
import { createCombat, ARENA } from './combat.js';
import { createStory, defaultFlags, GATE_HOUR } from './story.js';
import { ENDINGS, determineEnding, endingStory } from './endings.js';
import { createControls, ACTIONS, keyName, padName, MOVE_OPTS, LOOK_OPTS, SPEED_OPTS } from './controls.js';
import { BUILD, watchContext, createRenderGuard, quality, createAutoRes, isConsole, isMobile, setupMobile, checkWebGL, createGamepad, createMenuNav, BTN } from './platform.js';

// ================================================================ constants
const REAL_DURATION = 2 * 60 * 60;   // 2 real hours of play (seconds)
const GAME_HOURS = 24;               // = 24 world hours (5 real minutes = 1 world hour)
const START_HOUR = 6;                // the world day starts at 06:00
const DEV = location.hash.includes('dev');   // add #dev to the address to enable the T test key
const WARP = 120;
const SAVE_KEY = 'blackPyramid.save.v3';
const ENDINGS_KEY = 'blackPyramid.endings.v1';
const START_POS = { x: 0, z: 300 };
const PLAYER_R = 4.5;
const WALK = 24, RUN = 50, TURN = 2.3;   // speeds (m/s) and turn rate (rad/s)
const $ = (id) => document.getElementById(id);

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

// ================================================================ renderer / scene
const Q = quality();
document.getElementById('build-id').textContent = `version ${BUILD} · ${Q.level}${Q.lowMem ? ' · safe ' + Q.lowMem : ''}`;            // high on computers, lighter automatically on phones and consoles
setupMobile();
if (!checkWebGL()) throw new Error('WebGL is not available');
const renderer = new (Q.webgl1 ? THREE.WebGL1Renderer : THREE.WebGLRenderer)({ antialias: Q.level === 'pc', powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf3d3a0, 300, 2300);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.8, 7000);

// post-processing: multisampled (anti-aliased) HDR target → bloom → tone mapping → cinematic colour grade
const canHalf = Q.halfFloat && renderer.capabilities.isWebGL2 && !!renderer.extensions.get('EXT_color_buffer_float');
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: Q.msaa, type: canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType }));
composer.addPass(new RenderPass(scene, camera));
const bloom = Q.bloom ? new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6, 0.45, 1.0) : null;
if (bloom) composer.addPass(bloom);
composer.addPass(new OutputPass());
// painterly pass (Kuwahara filter): flattens small details into soft brush-like patches of colour
const PAINT_R = Q.painter || 1;
const painter = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; varying vec2 vUv;
    #define R ${PAINT_R}
    void main(){
      vec2 px = 1.0 / res;
      vec3 m0 = vec3(0.), m1 = vec3(0.), m2 = vec3(0.), m3 = vec3(0.);
      vec3 s0 = vec3(0.), s1 = vec3(0.), s2 = vec3(0.), s3 = vec3(0.);
      for (int j = 0; j <= R; j++) for (int i = 0; i <= R; i++) {
        vec3 c;
        c = texture2D(tDiffuse, vUv + vec2(-i, -j) * px).rgb; m0 += c; s0 += c * c;
        c = texture2D(tDiffuse, vUv + vec2( i, -j) * px).rgb; m1 += c; s1 += c * c;
        c = texture2D(tDiffuse, vUv + vec2(-i,  j) * px).rgb; m2 += c; s2 += c * c;
        c = texture2D(tDiffuse, vUv + vec2( i,  j) * px).rgb; m3 += c; s3 += c * c;
      }
      float n = float((R + 1) * (R + 1));
      m0 /= n; m1 /= n; m2 /= n; m3 /= n;
      vec3 v0 = s0 / n - m0 * m0, v1 = s1 / n - m1 * m1, v2 = s2 / n - m2 * m2, v3 = s3 / n - m3 * m3;
      float a0 = v0.r + v0.g + v0.b, a1 = v1.r + v1.g + v1.b, a2 = v2.r + v2.g + v2.b, a3 = v3.r + v3.g + v3.b;
      vec3 col = m0; float best = a0;
      if (a1 < best) { best = a1; col = m1; }
      if (a2 < best) { best = a2; col = m2; }
      if (a3 < best) { col = m3; }
      gl_FragColor = vec4(col, 1.0);
    }`,
});
if (Q.painter) composer.addPass(painter);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = (c - 0.5) * 1.08 + 0.5;                                  // a touch more contrast
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.18);                                   // richer colour
      c *= vec3(1.04, 1.0, 0.96);                                  // warm desert grade
      float v = smoothstep(1.05, 0.35, length(vUv - 0.5) * 1.25);  // soft vignette
      gl_FragColor = vec4(clamp(c, 0.0, 1.0) * mix(0.72, 1.0, v), 1.0);
    }`,
}));

function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  painter.uniforms.res.value.set(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
}
addEventListener('resize', resize);
resize();
// keeps the game smooth on every device: lowers/raises the render resolution by itself
// effects can be turned off by the auto-quality (temporarily) or by the broken-picture guard (for good)
const fx = { painter: true, bloom: true, safeNoPainter: false, safeNoBloom: false };
function applyFx() { painter.enabled = fx.painter && !fx.safeNoPainter; if (bloom) bloom.enabled = fx.bloom && !fx.safeNoBloom; }
const autoRes = createAutoRes(Q, (s) => {
  if (Math.abs(s.ratio - renderer.getPixelRatio()) > 0.01) { renderer.setPixelRatio(s.ratio); resize(); }
  fx.painter = s.painter; fx.bloom = s.bloom; applyFx();
});
// if this device draws a white / broken picture, effects are switched off one at a time (and remembered)
watchContext(renderer);
let useComposer = !Q.direct;
const renderGuard = createRenderGuard(renderer, [
  () => { fx.safeNoPainter = true; applyFx(); },
  () => { composer.reset(new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType })); },
  () => { fx.safeNoBloom = true; applyFx(); },
  () => { useComposer = false; },
  () => { renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((mt) => { mt.needsUpdate = true; }); }); },
], 'game');

const hemi = new THREE.HemisphereLight(0xa8d8ff, 0xe0a070, 0.6);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(Q.shadow || 512, Q.shadow || 512);
Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 1, far: 1400 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
scene.add(hemi, sun, sun.target);

// ================================================================ world + hero
const world = createWorld(scene, { groundSeg: Q.groundSeg });
const { pyramid, camp, sky } = world;
scene.traverse((o) => {
  const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
  for (const mt of mats) {
    if (!mt.isMeshStandardMaterial || mt.userData.keepFlat || mt.userData.painted) continue;
    mt.userData.painted = true;
    mt.flatShading = false;
    if (mt.metalness < 0.5) mt.roughness = Math.max(mt.roughness, 0.8);
    else { mt.metalness = 0.6; mt.roughness = Math.max(mt.roughness, 0.4); }
    mt.needsUpdate = true;
  }
});
let golem = createGolem(loadDesign());
scene.add(golem.group, golem.trickle);
function applyDesign(design) {
  scene.remove(golem.group, golem.trickle); golem.dispose();
  golem = createGolem(design); scene.add(golem.group, golem.trickle);
  golem.setPower(shardCount());
}
const editor = createEditor({ onSave: (d) => { applyDesign(d); toast('העיצוב החדש של חארו נשמר!'); } });

// ================================================================ state + the timer
let state = null;
let phase = 'title';           // title | playing | choice | cinema | fight | ended
let emerge = 1;                // 0..1 — the hero rising out of the sand in the intro
let warpOn = false;
let holdDtNow = 0;
const player = { pos: new THREE.Vector3(START_POS.x, 0.5, START_POS.z), velY: 0, facing: Math.PI, speed: 0, grounded: true };
const cam = { yaw: 0, pitch: 0.24, dist: 46, orbit: 0 };   // orbit = temporary look-around offset from dragging

function newState() { return { elapsed: 0, shards: [false, false, false, false], caravan: false, px: START_POS.x, pz: START_POS.z, ended: false, f: defaultFlags() }; }
function save() { if (state && !state.ended) { state.px = player.pos.x; state.pz = player.pos.z; store.set(SAVE_KEY, state); } }

// The clock runs in real time whenever the game is open (also in a background tab) and never pauses.
// It only stops while the page is closed, so every ending really takes the time it says.
let lastTick = Date.now();
setInterval(() => {
  const now = Date.now(), d = Math.min(70, (now - lastTick) / 1000); lastTick = now;
  if (state && !state.ended && phase !== 'title') state.elapsed += d * (warpOn ? WARP : 1);
}, 250);
function elapsedReal() { return state ? state.elapsed : 0; }
function gameHoursElapsed() { return Math.min(GAME_HOURS, elapsedReal() / REAL_DURATION * GAME_HOURS); }
function hoursLeft() { return GAME_HOURS - gameHoursElapsed(); }
function worldHour() { return START_HOUR + gameHoursElapsed(); }
function shardCount() { return state ? state.shards.filter(Boolean).length : 0; }

// ================================================================ UI helpers
let toastTimer = 0;
function toast(msg, secs = 4.5) { $('toast').innerHTML = msg; $('toast').classList.remove('hidden'); toastTimer = secs; }
const pad2 = (n) => String(Math.floor(n)).padStart(2, '0');
function fmtHM(h) { const m = Math.floor(h * 60); return `${pad2(m / 60)}:${pad2(m % 60)}`; }
function fmtReal(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 3600)}:${pad2((s % 3600) / 60)}:${pad2(s % 60)}`; }
function discovered() { return store.get(ENDINGS_KEY) || []; }

// ================================================================ story
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const cinema = createCinema();
let shoutTimer = 0;
function shout(text, secs = 3.5) { $('boss-shout').textContent = text; $('boss-shout').classList.remove('hidden'); shoutTimer = secs; }
const combat = createCombat({
  scene, groundAt, shout,
  puff: (x, y, z, n, p) => world.dust.puff(x, y, z, n, p),
  getHero: () => player,
  onDown: () => shout('נפלת... אבל רסיסי השמש מעירים אותך שוב.'),
  onWin: () => winFight(),
});
const story = createStory({
  scene, world, cinema, golem: { setPower: (n) => golem.setPower(n) }, toast,
  getState: () => state,
  hour: worldHour, hoursLeft, elapsed: elapsedReal,
  playerPos: () => player.pos,
  holdDt: () => holdDtNow,
  puff: (x, y, z, n, p) => world.dust.puff(x, y, z, n, p),
  endGame: (r) => endGame(r),
  openGateChoice: () => openGateChoice(),
});

function applyStateToWorld() {
  world.shards.forEach((s, i) => s.parts.forEach((p) => { p.visible = !state.shards[i]; }));
  if (state.caravan) camp.rescue();
  golem.setPower(shardCount());
  player.pos.set(state.px, groundAt(state.px, state.pz), state.pz);
  story.sync();
}

// ================================================================ input
const keys = {};
function pressAction() {
  if (phase !== 'playing') return;
  if (story.busy) story.dialog.advance(); else story.interact();
}
const ctl = createControls();
if (isConsole) document.body.classList.add('console');   // controls screen shows only the controller column
addEventListener('keydown', (e) => {
  if (editor.isOpen) return;   // typing in the designer must not move the hero
  if (ctlWait) { e.preventDefault(); if (e.code !== 'Escape' && ctlWait.kind === 'key') ctl.setKey(ctlWait.id, e.code); ctlWait = null; renderControls(); return; }
  if (!$('controls').classList.contains('hidden')) { if (e.code === 'Escape') toggleControls(false); return; }
  const ev0 = e; e = { code: ctl.key(ev0.code), repeat: ev0.repeat, preventDefault: () => ev0.preventDefault() };
  if (cinema.playing && ['Space', 'KeyE', 'Enter', 'Escape'].includes(e.code) && !e.repeat) { e.preventDefault(); cinema.finish(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (phase === 'playing' && story.busy) {
    if (!e.repeat && ['KeyE', 'Space', 'Enter'].includes(e.code)) story.dialog.advance();
    const m = e.code.match(/^(Digit|Numpad)([1-4])$/); if (m) story.dialog.choose(+m[2] - 1);
    return;
  }
  keys[e.code] = true;
  if (phase === 'fight') { if (e.code === 'KeyF') combat.shoot(); if (e.code === 'KeyR') combat.burst(); return; }
  if (phase !== 'playing') return;
  if (e.code === 'KeyE' && !e.repeat) story.interact();
  if (e.code === 'KeyJ') toggleJournal();
  if (e.code === 'KeyT' && DEV) { warpOn = !warpOn; $('warp').classList.toggle('hidden', !warpOn); }
});
addEventListener('keyup', (e) => { keys[ctl.key(e.code)] = false; keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

let dragging = false, lastX = 0, lastY = 0, dragDist = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; dragDist = 0; lastX = e.clientX; lastY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointerup', () => { dragging = false; if (phase === 'fight' && dragDist < 6) combat.shoot(); });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  dragDist += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY);
  cam.orbit -= (e.clientX - lastX) * 0.006;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - lastY) * 0.004, 0.03, 1.25);
  lastX = e.clientX; lastY = e.clientY;
});
renderer.domElement.addEventListener('wheel', (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.05, 24, 170); }, { passive: true });

// touch controller (phones / tablets): a floating joystick appears where the left thumb touches;
// pushing it all the way runs. Right side: A (action), B (jump), and in the fight X (sun ray) / Y (light wave).
// Dragging anywhere else on the screen turns the camera.
const touch = { x: 0, y: 0, active: false, run: false };
const hasTouch = isMobile && !isConsole;   // on-screen buttons only on phones / tablets, never on Xbox or PC
if (hasTouch) {
  $('touch').classList.remove('hidden');
  const zone = $('joy-zone'), joy = $('joy'), knob = $('joy-knob');
  let id = null, cx = 0, cy = 0;
  const R = 62;
  const setJoy = (e) => {
    let x = (e.clientX - cx) / R, y = (e.clientY - cy) / R;
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    touch.x = x; touch.y = y; touch.run = l > 0.92 && y < -0.5;
    knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`; joy.classList.toggle('run', touch.run);
  };
  zone.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    e.preventDefault(); id = e.pointerId; zone.setPointerCapture(id);
    const zr = zone.getBoundingClientRect();
    cx = e.clientX; cy = e.clientY;   // the stick jumps under the thumb
    joy.style.left = `${cx - zr.left - 68}px`; joy.style.top = `${cy - zr.top - 68}px`; joy.style.bottom = 'auto';
    joy.classList.add('on'); touch.active = true; setJoy(e);
    $('joy-hint').style.display = 'none';
  });
  zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) setJoy(e); });
  const endJoy = (e) => {
    if (e.pointerId !== id) return;
    id = null; touch.active = false; touch.run = false; touch.x = touch.y = 0;
    knob.style.transform = ''; joy.classList.remove('on', 'run'); joy.style.left = joy.style.top = joy.style.bottom = '';
  };
  zone.addEventListener('pointerup', endJoy); zone.addEventListener('pointercancel', endJoy);
  const hold = (bid, code, onDown) => {
    const el = $(bid);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); if (code) keys[code] = true; onDown?.(); navigator.vibrate?.(12); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { el.classList.remove('down'); if (code) keys[code] = false; });
  };
  hold('t-a', 'KeyE', pressAction);
  hold('t-b', 'Space');
  hold('t-x', 'KeyF', () => combat.shoot());
  hold('t-y', 'KeyR', () => combat.burst());
}
$('btn-journal').addEventListener('click', () => toggleJournal());
$('btn-design').addEventListener('click', () => editor.open());
$('btn-design-title').addEventListener('click', () => editor.open());
$('journal-close').addEventListener('click', () => toggleJournal(false));
function toggleJournal(force) {
  const el = $('journal'), show = force ?? el.classList.contains('hidden');
  if (show) $('journal-body').innerHTML = story.journalHTML();
  el.classList.toggle('hidden', !show);
}

// ================================================================ title / start
function showTitle() {
  const saved = store.get(SAVE_KEY);
  $('btn-continue').classList.toggle('hidden', !(saved && !saved.ended));
  $('endings-found').textContent = `סופים שנחשפו: ${discovered().length} / 8`;
}
function startGame(fresh) {
  state = fresh ? newState() : store.get(SAVE_KEY);
  if (!state) state = newState();
  state.f = { ...defaultFlags(), ...state.f };
  store.set(SAVE_KEY, state);
  applyStateToWorld();
  cam.yaw = player.facing + Math.PI; cam.orbit = 0;
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  if (!fresh) { phase = 'playing'; toast('ברוך שובך, משמר החול. הזמן לא חיכה לך.'); return; }
  phase = 'cinema'; emerge = 0;
  const hp = () => player.pos;
  cinema.play([
    { from: [320, 150, 640], to: [190, 105, 430], look: [0, 75, 0], dur: 7, caption: 'לפני 3000 שנה כלא מלך הליקוי, סת\'אר, את השמש האפלה בתוך פירמידה שחורה.' },
    { from: [70, PYR.HEIGHT + 30, 110], to: [36, PYR.HEIGHT + 22, 64], look: [0, PYR.HEIGHT + 14, 0], dur: 6, caption: 'אחותו, הכוהנת נפירה, יצרה מחול העיר שומר אחד שישמור עליה לנצח.' },
    { from: () => hp().clone().add(V3(-6, 6, -38)), to: () => hp().clone().add(V3(-14, 14, -52)), look: () => hp().clone().add(V3(0, 9, 0)), dur: 6.5,
      caption: 'עכשיו החותם נסדק. חארו, משמר החול, פוקח את עיניו.',
      update: (k) => { emerge = Math.min(1, k * 1.3); if (Math.random() < 0.25) world.dust.puff(hp().x + (Math.random() - 0.5) * 8, hp().y, hp().z + (Math.random() - 0.5) * 8, 6, 1.4); } },
  ]).then(() => { emerge = 1; phase = 'playing'; toast('הפירמידה השחורה מתעוררת... רוח מחכה לך בשדרת הספינקסים.'); });
}
$('btn-new').onclick = () => startGame(true);
$('btn-continue').onclick = () => startGame(false);
$('btn-restart').onclick = () => { store.del(SAVE_KEY); location.reload(); };

// ================================================================ gate choice (opened by the story at 14:00)
function openGateChoice() {
  phase = 'choice';
  const n = shardCount();
  $('choice-title').textContent = 'שער הפירמידה השחורה';
  $('choice-text').innerHTML = n >= 4
    ? `ארבעת רסיסי השמש בוערים בחזך. נותרו <b>${fmtHM(hoursLeft())}</b> שעות עד שהפירמידה תבלע את העולם.<br>נפירה מחכה מימינך. קולו של סת'אר לוחש משמאלך. מה תעשה?`
    : `יש לך רק <b>${n} / 4</b> רסיסי שמש. השער פועם בחשכה ולוחש לך להיכנס...`;
  const boxEl = $('choice-buttons'); boxEl.innerHTML = '';
  const add = (label, cls, fn, disabled = false) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.disabled = disabled; b.onclick = fn; boxEl.appendChild(b);
  };
  add('🔒 חתום את הפירמידה (הקרב את הרסיסים)', '', () => startFight(), n < 4);
  add('👑 תבע את כוחה של הפירמידה', 'danger', () => endGame('claim'), n < 4);
  if (n < 4) add('🚪 היכנס בכל זאת', 'danger', () => endGame('enter'));
  add('↩ חזור למדבר', 'ghost', () => { phase = 'playing'; $('choice').classList.add('hidden'); });
  $('choice').classList.remove('hidden');
}

// ================================================================ the boss fight
async function startFight() {
  $('choice').classList.add('hidden');
  phase = 'cinema';
  const gz = PYR.HALF + 20;
  combat.place(0, -40, gz); combat.show(true);
  await cinema.play([
    { from: [26, 15, 174], to: [12, 13, 166], look: [0, 14, gz], dur: 4.5, caption: 'חארו מקרב את ארבעת הרסיסים אל השער... והשער מתחיל לרעוד.' },
    { from: [34, 14, 175], to: [20, 12, 172], look: () => combat.bossPos.clone().add(V3(0, 22, 0)), dur: 5.5,
      caption: 'סת\'אר: "אם לא תפתח לי, אקח את השמש בכוח! בוא, אחי הקטן, אל מישור האפר!"',
      update: (k) => combat.place(0, -40 + k * 50, gz + 10 + k * 25) },
    { from: [90, 150, 330], to: [70, 120, 520], look: () => combat.bossPos.clone().add(V3(0, 15, 0)), dur: 5,
      caption: 'צל סת\'אר עף מעל שדרת הספינקסים, אל המישור שבקצה הדרך.',
      update: (k) => combat.place(0, 10 + Math.sin(k * Math.PI) * 70, gz + 35 + k * (ARENA.z + 50 - gz - 35)) },
  ]);
  if (state.ended) return;
  player.pos.set(ARENA.x, groundAt(ARENA.x, ARENA.z - 60), ARENA.z - 60); player.facing = 0; player.speed = 0; player.velY = 0;
  cam.yaw = player.facing + Math.PI; cam.orbit = 0;
  combat.start();
  phase = 'fight'; document.body.classList.add('fight');
  shout('הבס את צל סת\'אר!');
}
async function winFight() {
  phase = 'cinema'; document.body.classList.remove('fight');
  const k0 = combat.king.g;
  await cinema.play([
    { from: () => combat.bossPos.clone().add(V3(60, 25, -50)), to: () => combat.bossPos.clone().add(V3(40, 35, -70)), look: () => combat.bossPos.clone().add(V3(0, 18, 0)), dur: 5,
      caption: 'צל סת\'אר מתפורר לאבק של אור...',
      update: (k) => { k0.scale.setScalar(Math.max(0.05, 1 - k)); if (Math.random() < 0.5) world.dust.puff(combat.bossPos.x + (Math.random() - 0.5) * 30, combat.bossPos.y + Math.random() * 30, combat.bossPos.z, 10, 2); },
      end: () => { combat.show(false); k0.scale.setScalar(1); } },
  ]);
  if (state.ended) return;
  phase = 'playing';
  await story.dialog.run(async () => {
    await story.dialog.say('sethar', 'לא... האור... הוא חם. חם כמו הבקרים של כם-אשר, כשעוד הייתי ילד.');
    await story.dialog.say('sethar', 'אחותי... אני כבר לא מפחד מהחושך.');
    await story.dialog.say('nefira', 'לך לישון, אחי. השמש תשמור עליך עכשיו.');
    await story.dialog.say('kharu', 'הגיע הזמן לחתום את השער.');
  });
  endGame('seal');
}

// ================================================================ endings
function endingShots(id, paragraphs) {
  const ground = (x, z) => groundAt(x, z);
  const S = {
    gate: (c) => ({ from: [26, 15, 175], to: [12, 13, 167], look: [0, 14, PYR.HALF + 20], caption: c }),
    gateIn: (c) => ({ from: [0, 14, 174], to: [0, 12, PYR.HALF + 26], look: [0, 12, PYR.HALF], caption: c }),
    wide: (c) => ({ from: [0, 60, 540], to: [0, 140, 390], look: [0, 80, 0], caption: c }),
    high: (c) => ({ from: [-420, 260, 420], to: [-300, 220, 300], look: [0, 40, 0], caption: c }),
    camp: (c) => ({ from: [CAMP.x + 75, ground(CAMP.x, CAMP.z) + 32, CAMP.z + 80], to: [CAMP.x + 38, ground(CAMP.x, CAMP.z) + 20, CAMP.z + 45], look: [CAMP.x, ground(CAMP.x, CAMP.z) + 6, CAMP.z], caption: c }),
    hero: (c) => ({ from: () => player.pos.clone().add(V3(-28, 12, -32)), to: () => player.pos.clone().add(V3(-12, 15, -24)), look: () => player.pos.clone().add(V3(0, 12, 0)), caption: c }),
  };
  const seq = {
    oasis: ['gate', 'wide', 'camp', 'camp', 'wide', 'hero'], silent: ['gate', 'wide', 'hero', 'hero'], lastlight: ['high', 'gate', 'hero', 'hero'],
    sunking: ['hero', 'wide', 'camp', 'high', 'hero'], tyrant: ['hero', 'wide', 'high'], swallowed: ['gate', 'gateIn', 'wide'],
    storm: ['high', 'wide', 'hero'], unclaimed: ['hero', 'wide', 'high'],
  }[id];
  return paragraphs.map((p, i) => ({ ...S[seq[Math.min(i, seq.length - 1)]](p), dur: 3 + p.length * 0.055 }));
}
function endGame(reason) {
  if (phase === 'ended' || state.ended) return;
  combat.stop(); combat.show(false); document.body.classList.remove('fight');
  const left = hoursLeft();
  const ending = determineEnding({ reason, shards: shardCount(), caravan: state.caravan, hoursLeft: left });
  state.ended = true;
  store.set(SAVE_KEY, state);
  const found = new Set(discovered()); found.add(ending.id); store.set(ENDINGS_KEY, [...found]);
  phase = 'cinema';
  story.dialog.close(); cinema.endTalk();
  pyramid.setTint(ending.tint);
  $('choice').classList.add('hidden'); $('journal').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('ending-num').textContent = `סוף ${ending.num} מתוך 8${ending.special ? ' · ' + ending.special : ''}`;
  $('ending-title').textContent = ending.title;
  $('ending-text').innerHTML = endingStory(ending.id, { f: state.f, caravan: state.caravan }).map((p) => `<p>${p}</p>`).join('');
  $('ending-stats').innerHTML = `זמן משחק: ${fmtReal(elapsedReal())} · רסיסי שמש: ${shardCount()}/4 · שיירה: ${state.caravan ? 'חולצה' : 'לא חולצה'} · זיכרונות: ${state.f.memories.filter(Boolean).length}/7 · זמן עולם שנותר: ${fmtHM(left)}`;
  $('ending-list').innerHTML = ENDINGS.map((e) => {
    const got = found.has(e.id);
    return `<div class="${got ? 'got' : ''} ${e.id === ending.id ? 'cur' : ''}">${e.num}. ${got ? e.title : '???'}</div>`;
  }).join('');
  if (['seal', 'claim', 'enter'].includes(reason)) { player.pos.set(0, groundAt(0, PYR.HALF + 42), PYR.HALF + 42); player.facing = Math.PI; player.speed = 0; }
  const paragraphs = endingStory(ending.id, { f: state.f, caravan: state.caravan });
  cinema.play(endingShots(ending.id, paragraphs)).then(() => { phase = 'ended'; $('ending').classList.remove('hidden'); });
}

// ================================================================ day / night
const C = (h) => new THREE.Color(h);
const SKY = {
  dayTop: C(0x5aaed6), dayBot: C(0xffcf9e), setTop: C(0x56408e), setBot: C(0xff9256),
  nightTop: C(0x03040c), nightBot: C(0x1c1838), stormBot: C(0x9a5a2a),
};
const tmpA = new THREE.Color(), tmpB = new THREE.Color(), sunDir = new THREE.Vector3();
function updateSky(hour, doom, focus) {
  const a = (hour - 6) / 12 * Math.PI;
  const elev = Math.sin(a);
  sunDir.set(Math.cos(a), elev, -0.35).normalize();
  const dayF = THREE.MathUtils.smoothstep(elev, -0.12, 0.3);
  const setF = 1 - THREE.MathUtils.smoothstep(Math.abs(elev), 0.0, 0.35);
  tmpA.copy(SKY.nightTop).lerp(SKY.dayTop, dayF).lerp(SKY.setTop, setF * 0.6);
  tmpB.copy(SKY.nightBot).lerp(SKY.dayBot, dayF).lerp(SKY.setBot, setF * 0.75);
  tmpB.lerp(SKY.stormBot, doom * 0.7 * Math.max(dayF, 0.3));
  tmpA.lerp(tmpB, doom * 0.6);
  sky.uniforms.top.value.copy(tmpA);
  sky.uniforms.bottom.value.copy(tmpB);
  sky.uniforms.sunDir.value.copy(sunDir);
  sky.uniforms.sunCol.value.setHex(0xffc070).multiplyScalar(dayF * (1 - doom * 0.8));
  scene.fog.color.copy(tmpB);
  scene.fog.far = THREE.MathUtils.lerp(1900, 300, doom);
  scene.fog.near = THREE.MathUtils.lerp(160, 30, doom);
  sky.group.position.copy(camera.position);
  sky.sunMesh.position.copy(sunDir).multiplyScalar(2500);
  sky.moonMesh.position.copy(sunDir).multiplyScalar(-2500);
  sky.moonMesh.lookAt(camera.position);
  sky.starMat.opacity = (1 - dayF) * (1 - doom * 0.8);
  sky.cloudMat.color.setHex(0xffffff).lerp(C(0xffa070), setF * 0.6).multiplyScalar(0.25 + 0.75 * dayF);
  const night = elev < -0.05;
  const lightDir = night ? sky.moonMesh.position.clone().normalize() : sunDir;
  sun.position.copy(focus).addScaledVector(lightDir, 700);
  sun.target.position.copy(focus);
  if (night) { sun.color.setHex(0x9fb4ff); sun.intensity = 0.8; }
  else { sun.color.setHex(0xff9a5a).lerp(C(0xffe4bc), dayF); sun.intensity = 0.75 + 1.0 * dayF; }
  hemi.intensity = 0.55 + 0.45 * dayF;
  hemi.color.copy(tmpA).lerp(C(0xbfe4ff), 0.5);
  glyphUniforms.uGlow.value = 1.1 + 1.6 * (1 - dayF) + doom * 1.2;
  envUniforms.uSun.value = dayF * (1 - doom);
  world.sand.mat.opacity = 0.5 + doom * 0.5;
}

// ================================================================ gameplay
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), move = new THREE.Vector3();
function resolveCollisions(p) {
  for (const c of colliders) {
    if (c.type === 'box') {
      const minX = c.minX - PLAYER_R, maxX = c.maxX + PLAYER_R, minZ = c.minZ - PLAYER_R, maxZ = c.maxZ + PLAYER_R;
      if (p.x > minX && p.x < maxX && p.z > minZ && p.z < maxZ) {
        const pen = [maxX - p.x, p.x - minX, maxZ - p.z, p.z - minZ];
        const i = pen.indexOf(Math.min(...pen));
        if (i === 0) p.x = maxX; else if (i === 1) p.x = minX; else if (i === 2) p.z = maxZ; else p.z = minZ;
      }
    } else {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + PLAYER_R;
      if (d < m && d > 1e-4) { p.x = c.x + (dx / d) * m; p.z = c.z + (dz / d) * m; }
    }
  }
  const r = Math.hypot(p.x, p.z);
  if (r > WORLD_RADIUS) { p.x *= WORLD_RADIUS / r; p.z *= WORLD_RADIUS / r; }
}

const footPos = new THREE.Vector3();
function onStep(leg) {
  leg.getWorldPosition(footPos);
  const fx = footPos.x + Math.sin(player.facing) * 1.2, fz = footPos.z + Math.cos(player.facing) * 1.2;
  world.footprints.add(fx, fz, player.facing);
  if (player.speed > 30) world.dust.puff(fx, groundAt(fx, fz), fz, 5, 0.8);
}

function updatePlaying(dt) {
  if (elapsedReal() >= REAL_DURATION) { endGame('timeout'); return; }
  const canMove = !story.busy && phase !== 'cinema';
  // W/S walk along the facing direction, A/D turn the hero — the camera stays behind, so we always see his back
  let fwdIn = 0, turnIn = 0;
  const tt = cinema.talkTarget();
  if (tt) {   // in a conversation the hero walks up to the person and turns to face them
    const dx = tt.npc.x - player.pos.x, dz = tt.npc.z - player.pos.z, d = Math.hypot(dx, dz);
    let df = Math.atan2(dx, dz) - player.facing; df = Math.atan2(Math.sin(df), Math.cos(df));
    player.facing += df * Math.min(1, dt * 5);
    if (d > tt.stand + 2 && Math.abs(df) < 0.8) fwdIn = 0.75;
  } else if (canMove) {
    if (keys.KeyW || keys.ArrowUp) fwdIn += 1;
    if (keys.KeyS || keys.ArrowDown) fwdIn -= 1;
    if (keys.KeyD || keys.ArrowRight) turnIn -= 1;
    if (keys.KeyA || keys.ArrowLeft) turnIn += 1;
    if (touch.active) { fwdIn += -touch.y; turnIn += -touch.x; }
    if (pad.connected) { const [mx, my] = ctl.moveAxes(pad); fwdIn += -my; turnIn += -mx; }
  }
  fwdIn = THREE.MathUtils.clamp(fwdIn, -1, 1); turnIn = THREE.MathUtils.clamp(turnIn, -1, 1);
  const running = (keys.ShiftLeft || keys.ShiftRight || touch.run || pad.isDown(ctl.pad('run')) || pad.isDown(BTN.LS)) && fwdIn > 0;
  player.turn = THREE.MathUtils.damp(player.turn || 0, turnIn, 10, dt);
  player.facing += player.turn * TURN * (running ? 0.75 : 1) * dt;
  const target = fwdIn > 0 ? (running ? RUN : WALK) * fwdIn : fwdIn * WALK * 0.55;
  player.speed = THREE.MathUtils.damp(player.speed, target, 7, dt);
  fwd.set(Math.sin(player.facing), 0, Math.cos(player.facing));
  player.pos.addScaledVector(fwd, player.speed * dt);
  resolveCollisions(player.pos);
  const g = groundAt(player.pos.x, player.pos.z);
  if (canMove && (keys.Space || pad.isDown(ctl.pad('jump'))) && player.grounded) { player.velY = 24; player.grounded = false; }
  player.velY -= 60 * dt;
  player.pos.y += player.velY * dt;
  if (player.pos.y <= g) {
    if (!player.grounded && player.velY < -15) world.dust.puff(player.pos.x, g, player.pos.z, 24, 1.4);
    player.pos.y = g; player.velY = 0; player.grounded = true;
  }
}

// ================================================================ HUD
function updateHUD(prompt, progress) {
  const left = hoursLeft();
  $('clk-hour').textContent = fmtHM(worldHour() % 24);
  $('clk-left').textContent = fmtHM(left);
  $('clk-real').textContent = fmtReal(REAL_DURATION - elapsedReal());
  $('clock').classList.toggle('danger', left < 4);
  const q = phase === 'fight' ? { text: 'הבס את צל סת\'אר במישור האפר', target: null } : story.quest();
  const dist = q.target ? Math.round(Math.hypot(player.pos.x - q.target.x, player.pos.z - q.target.z)) : 0;
  const n = shardCount();
  $('objectives').innerHTML =
    `<div class="quest">➤ ${q.text}${q.target && dist > 20 ? ` <span class="dist">(${dist} מ')</span>` : ''}</div>` +
    `<div class="${n === 4 ? 'done' : ''}">☀ רסיסי שמש: ${n} / 4</div>` +
    story.sideQuests().map((s) => `<div class="${s.done ? 'done' : 'hint'}">${s.text}</div>`).join('') +
    `<div class="hint">🚪 השער: ${story.gateOpen() ? 'פתוח' : `נפתח ב-${GATE_HOUR}:00`}</div>` +
    (left < EARLY_WARN ? '<div class="hint warn">⚠ פחות מ-8 שעות. הסוף האמיתי כבר לא זמין</div>' : '');
  $('prompt').innerHTML = prompt;
  $('prompt').classList.toggle('hidden', !prompt);
  $('progress').classList.toggle('hidden', progress <= 0);
  $('progress-bar').style.width = `${Math.min(1, progress) * 100}%`;
}
const EARLY_WARN = 8;

const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const W = 200, S = W / 1700;
  const tx = (x) => W / 2 + (x - player.pos.x) * S, tz = (z) => W / 2 + (z - player.pos.z) * S;
  mm.clearRect(0, 0, W, W);
  mm.save(); mm.beginPath(); mm.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); mm.clip();
  mm.fillStyle = '#c79d62'; mm.fillRect(0, 0, W, W);
  mm.fillStyle = '#a8845a'; mm.fillRect(tx(-PYR.PLAZA), tz(-PYR.PLAZA), PYR.PLAZA * 2 * S, PYR.PLAZA * 2 * S);
  mm.fillRect(tx(-14), tz(PYR.PLAZA), 28 * S, 280 * S);
  mm.fillStyle = '#111'; mm.strokeStyle = story.gateOpen() ? '#ffe9a0' : '#ffc04a'; mm.lineWidth = 2;
  const ps = PYR.HALF * 2 * S; mm.fillRect(tx(-PYR.HALF), tz(-PYR.HALF), ps, ps); mm.strokeRect(tx(-PYR.HALF), tz(-PYR.HALF), ps, ps);
  world.shards.forEach((s, i) => {
    if (state.shards[i]) return;
    mm.fillStyle = '#' + s.color.toString(16).padStart(6, '0');
    mm.globalAlpha = story.unlocked(i) ? 1 : 0.45;
    mm.beginPath(); mm.arc(tx(s.x), tz(s.z), 5, 0, Math.PI * 2); mm.fill();
    mm.strokeStyle = '#fff'; mm.lineWidth = 1; mm.stroke(); mm.globalAlpha = 1;
  });
  mm.fillStyle = '#2a7fa0'; mm.beginPath(); mm.arc(tx(752), tz(600), 26 * S + 2, 0, Math.PI * 2); mm.fill();
  mm.fillStyle = state.caravan ? '#5fd35a' : '#8e1d1d'; mm.fillRect(tx(CAMP.x) - 4, tz(CAMP.z) - 4, 8, 8);
  for (const m of story.mapMarks()) { mm.fillStyle = m.c; mm.beginPath(); mm.arc(tx(m.x), tz(m.z), m.s || 3.5, 0, Math.PI * 2); mm.fill(); }
  const q = story.quest();
  if (q.target) {
    let qx = tx(q.target.x), qz = tz(q.target.z);
    const dx = qx - W / 2, dz = qz - W / 2, d = Math.hypot(dx, dz);
    if (d > W / 2 - 8) { qx = W / 2 + (dx / d) * (W / 2 - 8); qz = W / 2 + (dz / d) * (W / 2 - 8); }
    mm.strokeStyle = '#fff'; mm.lineWidth = 2.5; mm.beginPath(); mm.arc(qx, qz, 6 + Math.sin(performance.now() / 200) * 1.5, 0, Math.PI * 2); mm.stroke();
  }
  mm.restore();
  mm.save(); mm.translate(W / 2, W / 2); mm.rotate(-player.facing + Math.PI);
  mm.fillStyle = '#ffeb8a'; mm.strokeStyle = '#000'; mm.lineWidth = 1.5;
  mm.beginPath(); mm.moveTo(0, -8); mm.lineTo(6, 6); mm.lineTo(0, 3); mm.lineTo(-6, 6); mm.closePath(); mm.fill(); mm.stroke();
  mm.restore();
}

// ================================================================ controller (Xbox and others)
const pad = createGamepad();
const menuNav = createMenuNav(['#controls', '#editor', '#journal', '#choice', '#ending', '#title', '#dlg-choices']);
// ---------------------------------------------------------------- controls screen (change keys / buttons)
let ctlWait = null, ctlCool = 0;
function renderControls() {
  const tb = $('ctl-table').querySelector('tbody'); tb.innerHTML = '';
  for (const a of ACTIONS) {
    const tr = document.createElement('tr');
    const b = ctl.bind[a.id];
    tr.innerHTML = `<td>${a.name}</td><td></td><td></td>`;
    const kb = document.createElement('button'); kb.type = 'button';
    kb.textContent = ctlWait && ctlWait.id === a.id && ctlWait.kind === 'key' ? 'לחץ מקש…' : keyName(b.key);
    kb.classList.toggle('wait', !!(ctlWait && ctlWait.id === a.id && ctlWait.kind === 'key'));
    kb.onclick = () => { ctlWait = { id: a.id, kind: 'key' }; renderControls(); };
    tr.children[1].appendChild(kb);
    if (a.pad == null) { tr.children[2].textContent = MOVE_OPTS[ctl.padMove]; tr.children[2].className = 'fixed'; }
    else {
      const pb = document.createElement('button'); pb.type = 'button';
      const w = ctlWait && ctlWait.id === a.id && ctlWait.kind === 'pad';
      pb.textContent = w ? 'לחץ בבקר…' : padName(b.pad); pb.classList.toggle('wait', !!w);
      pb.onclick = () => { ctlWait = { id: a.id, kind: 'pad' }; ctlCool = 0; pad.pressed = new Set(); renderControls(); };
      tr.children[2].appendChild(pb);
    }
    tb.appendChild(tr);
  }
  for (const btn of document.querySelectorAll('#ctl-pad [data-cycle]')) {
    const n = btn.dataset.cycle;
    btn.textContent = n === 'padMove' ? MOVE_OPTS[ctl.padMove] : n === 'padLook' ? LOOK_OPTS[ctl.padLook] : n === 'invertY' ? (ctl.invertY ? 'פועל' : 'כבוי') : SPEED_OPTS[ctl.lookSpeed];
  }
  $('ctl-wait').classList.toggle('hidden', !ctlWait);
  $('ctl-wait').textContent = ctlWait ? (ctlWait.kind === 'key' ? 'לחץ עכשיו על המקש החדש במקלדת (Esc לביטול)' : 'לחץ עכשיו על הכפתור החדש בבקר') : '';
  updateHelp();
}
function updateHelp() {
  const k = (id) => keyName(ctl.bind[id].key), p = (id) => padName(ctl.bind[id].pad).split(' ')[0];
  $('help').textContent = `${k('fwd')}/${k('back')}: הליכה קדימה ואחורה · ${k('left')}/${k('right')}: סיבוב · ${k('run')}: ריצה · ${k('jump')}: קפיצה · גרירת עכבר: הסתכלות מסביב · גלגלת: זום · ${k('action')}: דיבור ופעולה · ${k('journal')}: יומן`;
  $('help-pad').textContent = `🎮 ${MOVE_OPTS[ctl.padMove]}: הליכה וסיבוב · ${LOOK_OPTS[ctl.padLook]}: מצלמה · ${p('action')}: פעולה ושיחה · ${p('jump')}: קפיצה · ${p('run')}: ריצה · ${p('shoot')}: קרן שמש · ${p('burst')}: גל אור · ${p('journal')}: יומן · Menu: שליטה`;
}
function toggleControls(force) {
  const el = $('controls'), show = force ?? el.classList.contains('hidden');
  el.classList.toggle('hidden', !show); ctlWait = null;
  if (show) { $('ctl-size').value = ctl.touchSize; renderControls(); }
}
for (const btn of document.querySelectorAll('#ctl-pad [data-cycle]')) btn.addEventListener('click', () => { ctl.cycle(btn.dataset.cycle); renderControls(); });
$('btn-controls').addEventListener('click', () => toggleControls(true));
$('btn-controls-title').addEventListener('click', () => toggleControls(true));
$('ctl-close').addEventListener('click', () => toggleControls(false));
$('ctl-reset').addEventListener('click', () => { ctl.reset(); $('ctl-size').value = 1; document.body.style.setProperty('--tsize', 1); renderControls(); });
$('ctl-size').addEventListener('input', (e) => { ctl.setTouchSize(+e.target.value); document.body.style.setProperty('--tsize', ctl.touchSize); });
document.body.style.setProperty('--tsize', ctl.touchSize);
updateHelp();

function handlePad(dt) {
  pad.poll();
  $('help-pad').classList.toggle('hidden', !pad.used); $('help').classList.toggle('hidden', pad.used);
  $('pad-note').classList.toggle('hidden', !pad.connected);
  if (!pad.connected) return;
  if (ctlWait) { if (ctlWait.kind === 'pad' && pad.pressed.size) { const b = [...pad.pressed][0]; ctl.setPad(ctlWait.id, b); ctlWait = null; ctlCool = 0.4; renderControls(); } return; }
  if (!$('controls').classList.contains('hidden')) { if (ctlCool > 0) { ctlCool -= dt; return; } if (pad.hit(BTN.B)) { toggleControls(false); return; } menuNav(pad, dt); return; }
  const aHeld = pad.isDown(ctl.pad('action')) && phase === 'playing' && !story.busy;   // hold A = hold E (rescue, mirrors)
  if (aHeld) { keys.KeyE = true; padE = true; } else if (padE) { keys.KeyE = false; padE = false; }
  if (cinema.playing && (pad.hit(BTN.A) || pad.hit(BTN.B) || pad.hit(BTN.MENU))) { cinema.finish(); return; }
  const dlgChoices = story.busy && $('dlg-choices').childElementCount > 0;
  if (dlgChoices || !$('editor').classList.contains('hidden') || !$('journal').classList.contains('hidden') || ['title', 'choice', 'ended'].includes(phase)) {
    if (pad.hit(BTN.B) && !$('journal').classList.contains('hidden')) { toggleJournal(false); return; }
    if (pad.hit(BTN.B) && !$('editor').classList.contains('hidden')) { $('ed-cancel').click(); return; }
    menuNav(pad, dt); return;
  }
  if (phase === 'playing') {
    if (pad.hit(ctl.pad('action'))) pressAction();
    if (pad.hit(ctl.pad('journal'))) toggleJournal();
    if (pad.hit(BTN.MENU) && ctl.pad('journal') !== BTN.MENU) toggleControls(true);
  }
  if (phase === 'fight') {
    if (pad.isDown(ctl.pad('shoot'))) combat.shoot();
    if (pad.hit(ctl.pad('burst'))) combat.burst();
  }
  const [lx, ly] = ctl.lookAxes(pad);
  if (lx || ly) {   // camera stick (chosen in the controls screen): look around
    cam.orbit -= lx * dt * 2.4; dragging = true; padLook = 0.6;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + ly * dt * 1.2, 0.03, 1.25);
  } else if (padLook > 0) { padLook -= dt; if (padLook <= 0) dragging = false; }
}
let padLook = 0, padE = false;

// ================================================================ main loop
const clock = new THREE.Clock();
let t = 0, saveTimer = 0;
const camTarget = new THREE.Vector3(), camWant = new THREE.Vector3();

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  autoRes();
  holdDtNow = Math.min(rawDt, 0.5);   // real time for hold-to-act and messages, even on slow machines
  t += dt;
  handlePad(dt);
  document.body.classList.toggle('touch-live', hasTouch && !pad.connected && ((phase === 'playing' && !story.busy) || phase === 'fight') && $('journal').classList.contains('hidden') && $('editor').classList.contains('hidden') && $('controls').classList.contains('hidden'));

  if (phase === 'playing' || phase === 'fight') updatePlaying(dt);
  if (phase === 'fight') {
    if (keys.KeyF) combat.shoot();
    story.update(dt, t, {}, player.pos);
    if (phase === 'fight') { updateHUD('', 0); drawMinimap(); }
  }
  combat.update(dt, t);
  document.body.classList.toggle('cine', cinema.active);
  if (shoutTimer > 0) { shoutTimer -= holdDtNow; if (shoutTimer <= 0) $('boss-shout').classList.add('hidden'); }
  if ((phase === 'cinema' || phase === 'fight') && toastTimer > 0) { toastTimer -= holdDtNow; if (toastTimer <= 0) $('toast').classList.add('hidden'); }
  if (phase === 'playing' || phase === 'choice') {
    if (phase === 'choice' && elapsedReal() >= REAL_DURATION) endGame('timeout');   // the clock never stops
    const s = story.update(dt, t, phase === 'playing' ? keys : {}, player.pos);
    if (phase !== 'ended') { updateHUD(phase === 'playing' ? ((pad.connected || hasTouch) ? s.prompt.replace('<b>E</b>', '<b>A</b>') : s.prompt) : '', s.progress); drawMinimap(); }
    saveTimer += dt; if (saveTimer > 2) { saveTimer = 0; save(); }
    if (toastTimer > 0) { toastTimer -= holdDtNow; if (toastTimer <= 0) $('toast').classList.add('hidden'); }
  }

  pyramid.doorGlowMat.opacity = state && story.gateOpen() ? 0.35 + (shardCount() / 4) * 0.4 + 0.2 * Math.sin(t * 3) : 0;
  golem.group.position.copy(player.pos);
  golem.group.position.y -= (1 - emerge) * 18;
  golem.group.rotation.y = player.facing;
  golem.group.visible = phase !== 'title';
  golem.update(dt, Math.min(1, Math.abs(player.speed) / WALK + Math.abs(player.turn || 0) * 0.35), t, phase === 'playing' || phase === 'fight' ? onStep : null, player.speed < -0.5 ? -1 : 1);

  const cinematic = phase === 'title' || phase === 'ended';
  if (cinema.apply(camera, dt, { heroPos: player.pos, heroFacing: player.facing, heroH: 16 })) {
    // a cinematic shot or a conversation is framing the camera
  } else if (cinematic) {
    const a = t * 0.04 + 0.5, r = phase === 'ended' ? 330 : 420;
    camera.position.set(Math.sin(a) * r, 95 + Math.sin(t * 0.1) * 18, Math.cos(a) * r);
    camera.lookAt(0, 60, 0);
  } else {
    if (!dragging) cam.orbit *= Math.exp(-dt * 1.6);   // look-around offset eases back behind the hero
    let dy = player.facing + Math.PI + cam.orbit - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    cam.yaw += dy * Math.min(1, dt * 6);
    const fight = phase === 'fight', dist = fight ? Math.max(cam.dist, 72) : cam.dist;
    camTarget.set(player.pos.x, player.pos.y + (fight ? 22 : 15), player.pos.z);
    const cx = camTarget.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * dist;
    const cz = camTarget.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * dist;
    let cy = Math.max(camTarget.y + Math.sin(cam.pitch) * dist, groundAt(cx, cz) + 2.5);
    if (fight) {   // keep the fight camera inside the arena
      const ax = cx - ARENA.x, az = cz - ARENA.z, ar = Math.hypot(ax, az), lim = ARENA.r - 8;
      if (ar > lim) { camWant.set(ARENA.x + ax / ar * lim, cy + (ar - lim) * 0.4, ARENA.z + az / ar * lim); camera.position.lerp(camWant, Math.min(1, dt * 8)); camera.lookAt(camTarget); cy = null; }
    }
    if (cy !== null) { camera.position.lerp(camWant.set(cx, cy, cz), Math.min(1, dt * 8)); camera.lookAt(camTarget); }
  }

  const hour = state ? worldHour() % 24 : 17.3;
  const doom = state ? THREE.MathUtils.smoothstep(4 - hoursLeft(), 0, 4) : 0;   // sandstorm in the last 4 world hours
  updateSky(hour, doom, cinematic ? new THREE.Vector3() : player.pos);
  world.update(dt, t, { center: cinematic ? camera.position : player.pos, wind: 6 + doom * 30 });

  if (useComposer) composer.render(); else renderer.render(scene, camera);
  renderGuard();
}

showTitle();
frame();
// debugging helpers for the browser console
window.__game = {
  get state() { return state; }, get phase() { return phase; }, get gfx() { let tri = 0, vb = 0; scene.traverse((o) => { const g = o.geometry; if (!g || !o.visible) return; const n = g.index ? g.index.count : g.attributes.position.count; tri += n / 3 * (o.count || 1); for (const a of Object.values(g.attributes)) vb += a.array.byteLength; if (g.index) vb += g.index.array.byteLength; }); return { sceneTris: Math.round(tri), geoMB: Math.round(vb / 1e6), shadow: sun.shadow.mapSize.x, ...renderer.info.memory, tris: renderer.info.render.triangles, calls: renderer.info.render.calls, ratio: renderer.getPixelRatio() }; }, get pos() { return [Math.round(player.pos.x), Math.round(player.pos.z)]; }, endGame, startGame, story, startFight, combat, cinema,
  teleport(x, z) { player.pos.set(x, groundAt(x, z), z); },
  view(orbit) { cam.orbit = orbit; cam.yaw = player.facing + Math.PI + orbit; dragging = true; },
  look(yaw, pitch, dist) { player.facing = yaw + Math.PI; cam.yaw = yaw; if (pitch !== undefined) cam.pitch = pitch; if (dist !== undefined) cam.dist = dist; },
};
