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
import { createStory, defaultFlags, GATE_HOUR } from './story.js';
import { ENDINGS, determineEnding, endingStory } from './endings.js';

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
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf3d3a0, 300, 2300);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.8, 7000);

// post-processing: multisampled (anti-aliased) HDR target → bloom → tone mapping → cinematic colour grade
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.45, 1.0));
composer.addPass(new OutputPass());
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = (c - 0.5) * 1.08 + 0.5;                                  // a touch more contrast
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 1.12);                                   // richer colour
      c *= vec3(1.03, 1.0, 0.95);                                  // warm desert grade
      float v = smoothstep(1.05, 0.35, length(vUv - 0.5) * 1.25);  // soft vignette
      gl_FragColor = vec4(clamp(c, 0.0, 1.0) * mix(0.72, 1.0, v), 1.0);
    }`,
}));

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

const hemi = new THREE.HemisphereLight(0xbfd8ff, 0xc99a5c, 0.6);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 1, far: 1400 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
scene.add(hemi, sun, sun.target);

// ================================================================ world + hero
const world = createWorld(scene);
const { pyramid, camp, sky } = world;
const golem = createGolem();
scene.add(golem.group, golem.trickle);

// ================================================================ state + the timer
let state = null;
let phase = 'title';           // title | playing | choice | ended
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
const pad = (n) => String(Math.floor(n)).padStart(2, '0');
function fmtHM(h) { const m = Math.floor(h * 60); return `${pad(m / 60)}:${pad(m % 60)}`; }
function fmtReal(s) { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`; }
function discovered() { return store.get(ENDINGS_KEY) || []; }

// ================================================================ story
const story = createStory({
  scene, world, golem, toast,
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
addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (phase === 'playing' && story.busy) {
    if (!e.repeat && ['KeyE', 'Space', 'Enter'].includes(e.code)) story.dialog.advance();
    const m = e.code.match(/^(Digit|Numpad)([1-4])$/); if (m) story.dialog.choose(+m[2] - 1);
    return;
  }
  keys[e.code] = true;
  if (phase !== 'playing') return;
  if (e.code === 'KeyE' && !e.repeat) story.interact();
  if (e.code === 'KeyJ') toggleJournal();
  if (e.code === 'KeyT' && DEV) { warpOn = !warpOn; $('warp').classList.toggle('hidden', !warpOn); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

let dragging = false, lastX = 0, lastY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointerup', () => { dragging = false; });
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  cam.orbit -= (e.clientX - lastX) * 0.006;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - lastY) * 0.004, 0.03, 1.25);
  lastX = e.clientX; lastY = e.clientY;
});
renderer.domElement.addEventListener('wheel', (e) => { cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * 0.05, 24, 170); }, { passive: true });

// touch controls: virtual joystick + buttons
const touch = { x: 0, y: 0, active: false };
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
  $('touch').classList.remove('hidden');
  const joy = $('joy'), knob = $('joy-knob');
  const setJoy = (e) => {
    const r = joy.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / (r.width / 2), y = (e.clientY - r.top - r.height / 2) / (r.height / 2);
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    touch.x = x; touch.y = y; knob.style.transform = `translate(${x * 37}px, ${y * 37}px)`;
  };
  joy.addEventListener('pointerdown', (e) => { touch.active = true; joy.setPointerCapture(e.pointerId); setJoy(e); });
  joy.addEventListener('pointermove', (e) => { if (touch.active) setJoy(e); });
  const endJoy = () => { touch.active = false; touch.x = touch.y = 0; knob.style.transform = ''; };
  joy.addEventListener('pointerup', endJoy); joy.addEventListener('pointercancel', endJoy);
  const hold = (id, code, onDown) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); keys[code] = true; onDown?.(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => { keys[code] = false; });
  };
  hold('t-e', 'KeyE', pressAction);
  hold('t-jump', 'Space');
  $('t-run').addEventListener('pointerdown', (e) => { e.preventDefault(); keys.ShiftRight = !keys.ShiftRight; $('t-run').classList.toggle('on', !!keys.ShiftRight); });
}
$('btn-journal').addEventListener('click', () => toggleJournal());
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
  phase = 'playing';
  cam.yaw = player.facing + Math.PI; cam.orbit = 0;
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  toast(fresh ? 'הפירמידה השחורה מתעוררת... רוח מחכה לך בשדרת הספינקסים.' : 'ברוך שובך, משמר החול. הזמן לא חיכה לך.');
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
  add('🔒 חתום את הפירמידה (הקרב את הרסיסים)', '', () => endGame('seal'), n < 4);
  add('👑 תבע את כוחה של הפירמידה', 'danger', () => endGame('claim'), n < 4);
  if (n < 4) add('🚪 היכנס בכל זאת', 'danger', () => endGame('enter'));
  add('↩ חזור למדבר', 'ghost', () => { phase = 'playing'; $('choice').classList.add('hidden'); });
  $('choice').classList.remove('hidden');
}

// ================================================================ endings
function endGame(reason) {
  if (phase === 'ended') return;
  const left = hoursLeft();
  const ending = determineEnding({ reason, shards: shardCount(), caravan: state.caravan, hoursLeft: left });
  state.ended = true;
  store.set(SAVE_KEY, state);
  const found = new Set(discovered()); found.add(ending.id); store.set(ENDINGS_KEY, [...found]);
  phase = 'ended';
  story.dialog.close();
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
  setTimeout(() => $('ending').classList.remove('hidden'), 1800);
}

// ================================================================ day / night
const C = (h) => new THREE.Color(h);
const SKY = {
  dayTop: C(0x3f86d6), dayBot: C(0xf4d6a4), setTop: C(0x3b2a6e), setBot: C(0xff8a4a),
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
  scene.fog.far = THREE.MathUtils.lerp(2300, 300, doom);
  scene.fog.near = THREE.MathUtils.lerp(300, 30, doom);
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
  else { sun.color.setHex(0xff9a5a).lerp(C(0xfff1d6), dayF); sun.intensity = 0.8 + 1.2 * dayF; }
  hemi.intensity = 0.45 + 0.4 * dayF;
  hemi.color.copy(tmpA).lerp(C(0xffffff), 0.4);
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
  const canMove = !story.busy;
  // W/S walk along the facing direction, A/D turn the hero — the camera stays behind, so we always see his back
  let fwdIn = 0, turnIn = 0;
  if (canMove) {
    if (keys.KeyW || keys.ArrowUp) fwdIn += 1;
    if (keys.KeyS || keys.ArrowDown) fwdIn -= 1;
    if (keys.KeyD || keys.ArrowRight) turnIn -= 1;
    if (keys.KeyA || keys.ArrowLeft) turnIn += 1;
    if (touch.active) { fwdIn += -touch.y; turnIn += -touch.x; }
  }
  fwdIn = THREE.MathUtils.clamp(fwdIn, -1, 1); turnIn = THREE.MathUtils.clamp(turnIn, -1, 1);
  const running = (keys.ShiftLeft || keys.ShiftRight) && fwdIn > 0;
  player.turn = THREE.MathUtils.damp(player.turn || 0, turnIn, 10, dt);
  player.facing += player.turn * TURN * (running ? 0.75 : 1) * dt;
  const target = fwdIn > 0 ? (running ? RUN : WALK) * fwdIn : fwdIn * WALK * 0.55;
  player.speed = THREE.MathUtils.damp(player.speed, target, 7, dt);
  fwd.set(Math.sin(player.facing), 0, Math.cos(player.facing));
  player.pos.addScaledVector(fwd, player.speed * dt);
  resolveCollisions(player.pos);
  const g = groundAt(player.pos.x, player.pos.z);
  if (canMove && keys.Space && player.grounded) { player.velY = 24; player.grounded = false; }
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
  const q = story.quest();
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

// ================================================================ main loop
const clock = new THREE.Clock();
let t = 0, saveTimer = 0;
const camTarget = new THREE.Vector3(), camWant = new THREE.Vector3();

function frame() {
  requestAnimationFrame(frame);
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  holdDtNow = Math.min(rawDt, 0.5);   // real time for hold-to-act and messages, even on slow machines
  t += dt;

  if (phase === 'playing') updatePlaying(dt);
  if (phase === 'playing' || phase === 'choice') {
    if (phase === 'choice' && elapsedReal() >= REAL_DURATION) endGame('timeout');   // the clock never stops
    const s = story.update(dt, t, phase === 'playing' ? keys : {}, player.pos);
    if (phase !== 'ended') { updateHUD(phase === 'playing' ? s.prompt : '', s.progress); drawMinimap(); }
    saveTimer += dt; if (saveTimer > 2) { saveTimer = 0; save(); }
    if (toastTimer > 0) { toastTimer -= holdDtNow; if (toastTimer <= 0) $('toast').classList.add('hidden'); }
  }

  pyramid.doorGlowMat.opacity = state && story.gateOpen() ? 0.35 + (shardCount() / 4) * 0.4 + 0.2 * Math.sin(t * 3) : 0;
  golem.group.position.copy(player.pos);
  golem.group.rotation.y = player.facing;
  golem.group.visible = phase !== 'title';
  golem.update(dt, Math.min(1, Math.abs(player.speed) / WALK + Math.abs(player.turn || 0) * 0.35), t, phase === 'playing' ? onStep : null, player.speed < -0.5 ? -1 : 1);

  const cinematic = phase === 'title' || phase === 'ended';
  if (cinematic) {
    const a = t * 0.04 + 0.5, r = phase === 'ended' ? 330 : 420;
    camera.position.set(Math.sin(a) * r, 95 + Math.sin(t * 0.1) * 18, Math.cos(a) * r);
    camera.lookAt(0, 60, 0);
  } else {
    if (!dragging) cam.orbit *= Math.exp(-dt * 1.6);   // look-around offset eases back behind the hero
    let dy = player.facing + Math.PI + cam.orbit - cam.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    cam.yaw += dy * Math.min(1, dt * 6);
    camTarget.set(player.pos.x, player.pos.y + 15, player.pos.z);
    const cx = camTarget.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
    const cz = camTarget.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
    const cy = Math.max(camTarget.y + Math.sin(cam.pitch) * cam.dist, groundAt(cx, cz) + 2.5);
    camera.position.lerp(camWant.set(cx, cy, cz), Math.min(1, dt * 8));
    camera.lookAt(camTarget);
  }

  const hour = state ? worldHour() % 24 : 17.3;
  const doom = state ? THREE.MathUtils.smoothstep(4 - hoursLeft(), 0, 4) : 0;   // sandstorm in the last 4 world hours
  updateSky(hour, doom, cinematic ? new THREE.Vector3() : player.pos);
  world.update(dt, t, { center: cinematic ? camera.position : player.pos, wind: 6 + doom * 30 });

  composer.render();
}

showTitle();
frame();
// debugging helpers for the browser console
window.__game = {
  get state() { return state; }, get phase() { return phase; }, endGame, startGame, story,
  teleport(x, z) { player.pos.set(x, groundAt(x, z), z); },
  view(orbit) { cam.orbit = orbit; cam.yaw = player.facing + Math.PI + orbit; dragging = true; },
  look(yaw, pitch, dist) { player.facing = yaw + Math.PI; cam.yaw = yaw; if (pitch !== undefined) cam.pitch = pitch; if (dist !== undefined) cam.dist = dist; },
};
