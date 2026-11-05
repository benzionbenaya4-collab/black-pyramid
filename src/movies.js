// movies.js — "Kem-Ashar Cinema": the full-length film of the game (≈ 1.5 hours), played live in the game engine, with voiced lines
// (the browser's Hebrew text-to-speech voices) and subtitles. No video or audio files.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { PYR, CAMP, SHARD_SITES, SATELLITES, groundAt, createWorld, envUniforms } from './world.js';
import { glyphUniforms } from './glyphs.js';
import { createGolem } from './golem.js';
import { loadDesign } from './editor.js';
import { buildShadowKing, ARENA } from './combat.js';
import { buildNefira, buildHuman, buildTamunCamp, buildKeeper, buildTablet, buildScarab, NPC_POS, SPEAKERS, TABLETS, MEMORIES } from './story.js';
import { CHAPTERS, lineId } from './screenplay.js';
import { EXTRA, EXTRA2 } from './screenplay-extra.js';
import { MAT } from './util.js';
import { watchContext, createRenderGuard, quality, createAutoRes, setupMobile, checkWebGL, createGamepad, createMenuNav, BTN } from './platform.js';

const $ = (id) => document.getElementById(id);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ================================================================ renderer, painterly post-processing (same look as the game)
const Q = quality();
setupMobile();
if (!checkWebGL()) throw new Error('WebGL is not available');
const renderer = new (Q.webgl1 ? THREE.WebGL1Renderer : THREE.WebGLRenderer)({ antialias: Q.level === 'pc', powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = Q.shadow > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
$('stage').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xf3d3a0, 160, 1900);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.8, 7000);
const canHalf = Q.halfFloat && renderer.capabilities.isWebGL2 && !!renderer.extensions.get('EXT_color_buffer_float');
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: Q.msaa, type: canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType }));
composer.addPass(new RenderPass(scene, camera));
const bloom = Q.bloom ? new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6, 0.45, 1.0) : null;
if (bloom) composer.addPass(bloom);
composer.addPass(new OutputPass());
const PAINT_R = Q.painter || 1;
const painter = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio()) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; varying vec2 vUv;
    #define R ${PAINT_R}
    void main(){
      vec2 px = 1.0 / res;
      vec3 m0 = vec3(0.), m1 = vec3(0.), m2 = vec3(0.), m3 = vec3(0.), s0 = vec3(0.), s1 = vec3(0.), s2 = vec3(0.), s3 = vec3(0.);
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
      if (a1 < best) { best = a1; col = m1; } if (a2 < best) { best = a2; col = m2; } if (a3 < best) { col = m3; }
      gl_FragColor = vec4(col, 1.0);
    }`,
});
if (Q.painter) composer.addPass(painter);
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb; c = (c - 0.5) * 1.08 + 0.5;
      float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, 1.18); c *= vec3(1.04, 1.0, 0.96);
      float v = smoothstep(1.05, 0.35, length(vUv - 0.5) * 1.25);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0) * mix(0.68, 1.0, v), 1.0);
    }`,
}));
function resize() {
  // never draw more pixels than this device's graphics memory handles (Xbox: 1280×720, stretched to the TV)
  if (Q.maxPixels) { const cap = Math.sqrt(Q.maxPixels / (innerWidth * innerHeight)); if (renderer.getPixelRatio() > cap) renderer.setPixelRatio(cap); }
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  painter.uniforms.res.value.set(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
}
addEventListener('resize', resize);
resize();
// keeps the game smooth on every device: lowers/raises the render resolution by itself
// effects can be turned off by the auto-quality (temporarily) or by the broken-picture guard (for good)
const fxOn = { painter: true, bloom: true, safeNoPainter: false, safeNoBloom: false };
function applyFx() { painter.enabled = fxOn.painter && !fxOn.safeNoPainter; if (bloom) bloom.enabled = fxOn.bloom && !fxOn.safeNoBloom; }
const autoRes = createAutoRes(Q, (s) => {
  if (Math.abs(s.ratio - renderer.getPixelRatio()) > 0.01) { renderer.setPixelRatio(s.ratio); resize(); }
  fxOn.painter = s.painter; fxOn.bloom = s.bloom; applyFx();
});
// if this device draws a white / broken picture, effects are switched off one at a time (and remembered)
watchContext(renderer);
let useComposer = !Q.direct;
const renderGuard = createRenderGuard(renderer, [
  () => { fxOn.safeNoPainter = true; applyFx(); },
  () => { composer.reset(new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType })); },
  () => { fxOn.safeNoBloom = true; applyFx(); },
  () => { useComposer = false; },
  () => { renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((mt) => { mt.needsUpdate = true; }); }); },
], 'film');
const hemi = new THREE.HemisphereLight(0xa8d8ff, 0xe0a070, 0.6);
const sun = new THREE.DirectionalLight(0xfff1d6, 1.8);
sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow || 512, Q.shadow || 512);
Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 1, far: 1600 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
scene.add(hemi, sun, sun.target);

// ================================================================ the world and the cast
const world = createWorld(scene, { groundSeg: Q.groundSeg });
scene.traverse((o) => {   // the same matte, painted look as the game
  const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
  for (const mt of mats) {
    if (!mt.isMeshStandardMaterial || mt.userData.keepFlat || mt.userData.painted) continue;
    mt.userData.painted = true; mt.flatShading = false;
    if (mt.metalness < 0.5) mt.roughness = Math.max(mt.roughness, 0.8); else { mt.metalness = 0.6; mt.roughness = Math.max(mt.roughness, 0.4); }
    mt.needsUpdate = true;
  }
});
const G = (x, z) => groundAt(x, z);
const golem = createGolem(loadDesign());
scene.add(golem.group, golem.trickle);
const hero = { pos: V3(0, 0, 300), facing: Math.PI, speed: 0, target: null, walk: 20, emerge: 1, emerging: false, velY: 0 };

const nefira = buildNefira(); scene.add(nefira);
const tamun = buildHuman(MAT.leather, { beard: true, staff: true, scale: 1.5 });
tamun.position.set(NPC_POS.tamun.x, G(NPC_POS.tamun.x, NPC_POS.tamun.z), NPC_POS.tamun.z); tamun.rotation.y = 0.9; scene.add(tamun);
const tcamp = buildTamunCamp(); tcamp.position.copy(tamun.position); scene.add(tcamp);
const keeper = buildKeeper(); keeper.g.position.set(NPC_POS.keeper.x, G(NPC_POS.keeper.x, NPC_POS.keeper.z) + 9, NPC_POS.keeper.z); keeper.g.rotation.y = Math.PI + 0.5; scene.add(keeper.g);
const lina = buildHuman(MAT.redDark, { scale: 0.95, turban: MAT.gold });
const yasif = buildHuman(MAT.turquoise, { beard: true, staff: true, scale: 1.4 });
scene.add(lina, yasif);
const tablets = TABLETS.map((tb) => { const g = buildTablet(); g.position.set(tb.x, G(tb.x, tb.z), tb.z); g.visible = false; scene.add(g); return g; });
const scarabs = MEMORIES.map((m) => { const g = buildScarab(); g.position.set(m.x, G(m.x, m.z) + 2, m.z); g.visible = false; scene.add(g); return g; });
const king = buildShadowKing(); king.g.visible = false; scene.add(king.g);
const kingPos = V3(0, -60, 0);
const CAST = {
  nefira: { obj: nefira, h: 12, near: 26 }, tamun: { obj: tamun, h: 6, near: 12 }, keeper: { obj: keeper.g, h: 6, near: 34 },
  lina: { obj: lina, h: 3.2, near: 8 }, yasif: { obj: yasif, h: 4.6, near: 10 },
};

// places the film moves between: [x, z, standing distance from the place]
const PLACES = {
  avenue: [0, 300, 0], avenueEnd: [0, 455, 0], west: [-260, 300, 0], east: [300, 120, 0], mid: [-150, 120, 0], pyramidEast: [300, 60, 0],
  head: [-760, 80, 60], legs: [100, 820, 45], desert: [-380, 360, 0],
  nefira: [NPC_POS.nefira.x, NPC_POS.nefira.z, 26], tamun: [NPC_POS.tamun.x, NPC_POS.tamun.z, 15], keeper: [NPC_POS.keeper.x, NPC_POS.keeper.z, 32],
  camp: [CAMP.x, CAMP.z, 34], yasif: [NPC_POS.yasif.x, NPC_POS.yasif.z, 15], lina: [NPC_POS.yasif.x + 3, NPC_POS.yasif.z + 1, 12],
  gate: [0, PYR.HALF + 42, 0], arena: [ARENA.x, ARENA.z, 0], arenaStart: [ARENA.x, ARENA.z - 60, 0],
  ...Object.fromEntries(SHARD_SITES.map((s, i) => [`shrine${i}`, [s.x, s.z, 20]])),
  ...Object.fromEntries(SATELLITES.map((s, i) => [`sat${i}`, [s.x, s.z + s.half + 12, 0]])),
  ...Object.fromEntries(TABLETS.map((s, i) => [`tablet${i}`, [s.x, s.z, 9]])),
  ...Object.fromEntries(MEMORIES.map((s, i) => [`scarab${i}`, [s.x, s.z, 8]])),
};
const placeV = (k) => { const p = PLACES[k] || [CAST[k]?.obj.position.x ?? 0, CAST[k]?.obj.position.z ?? 0, 0]; return V3(p[0], G(p[0], p[1]), p[1]); };
/** where the hero stands to visit a place: at its standing distance, on the side the hero comes from */
function standPoint(k, from = hero.pos) {
  const c = placeV(k), d = PLACES[k]?.[2] ?? 0;
  if (!d) return c;
  const dir = V3(from.x - c.x, 0, from.z - c.z); if (dir.lengthSq() < 1) dir.set(0, 0, 1);
  dir.normalize().multiplyScalar(d); return V3(c.x + dir.x, 0, c.z + dir.z);
}

// ================================================================ effects: sun-bolts, shockwaves, light bursts
const fx = new THREE.Group(); scene.add(fx);
const fxList = [];
const boltMat = new THREE.MeshBasicMaterial({ color: 0xffe28a });
const waveMat = new THREE.MeshBasicMaterial({ color: 0x9b3cff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
const burstMat = new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
let flash = 0, slamT = -1, dissolve = -1;
function bolt() {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), boltMat);
  m.position.set(hero.pos.x, hero.pos.y + 11, hero.pos.z); fx.add(m);
  fxList.push({ m, t: 0, update(dt) { const goal = kingPos.clone().add(V3(0, 27, 0)); const d = goal.clone().sub(m.position); m.position.addScaledVector(d.normalize(), dt * 140); m.rotation.y += dt * 10; if (m.position.distanceTo(goal) < 8) { flash = 0.12; world.dust.puff(m.position.x, m.position.y - 3, m.position.z, 6, 0.6); return true; } return (this.t += dt) > 3; } });
}
function wave() {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.8, 6, 64), waveMat); m.rotation.x = Math.PI / 2;
  m.position.set(kingPos.x, G(kingPos.x, kingPos.z) + 1, kingPos.z); fx.add(m);
  world.dust.puff(kingPos.x, m.position.y, kingPos.z, 50, 3);
  fxList.push({ m, r: 4, update(dt) { this.r += dt * 62; m.scale.set(this.r, this.r, 1); return this.r > 170; } });
}
function burst() {
  const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.6, 8, 48), burstMat.clone()); m.rotation.x = Math.PI / 2;
  m.position.set(hero.pos.x, hero.pos.y + 3, hero.pos.z); fx.add(m); world.dust.puff(hero.pos.x, hero.pos.y, hero.pos.z, 40, 2);
  fxList.push({ m, t: 0, update(dt) { this.t += dt; const r = 4 + this.t * 90; m.scale.set(r, r, 1); m.material.opacity = Math.max(0, 0.8 - this.t * 1.6); return this.t > 0.5; } });
}

// ================================================================ sky for the hour of the scene
const C = (h) => new THREE.Color(h);
const SKY = { dayTop: C(0x5aaed6), dayBot: C(0xffcf9e), setTop: C(0x56408e), setBot: C(0xff9256), nightTop: C(0x03040c), nightBot: C(0x1c1838) };
let hour = 17.2, hourGoal = 17.2;
function updateSky(focus) {
  const a = (hour - 6) / 12 * Math.PI, elev = Math.sin(a);
  const sunDir = V3(Math.cos(a), elev, -0.35).normalize();
  const dayF = THREE.MathUtils.smoothstep(elev, -0.12, 0.3), setF = 1 - THREE.MathUtils.smoothstep(Math.abs(elev), 0, 0.35);
  const top = SKY.nightTop.clone().lerp(SKY.dayTop, dayF).lerp(SKY.setTop, setF * 0.6);
  const bot = SKY.nightBot.clone().lerp(SKY.dayBot, dayF).lerp(SKY.setBot, setF * 0.75);
  const sky = world.sky;
  sky.uniforms.top.value.copy(top); sky.uniforms.bottom.value.copy(bot); sky.uniforms.sunDir.value.copy(sunDir);
  sky.uniforms.sunCol.value.setHex(0xffc070).multiplyScalar(dayF);
  scene.fog.color.copy(bot);
  sky.group.position.copy(camera.position);
  sky.sunMesh.position.copy(sunDir).multiplyScalar(2500); sky.moonMesh.position.copy(sunDir).multiplyScalar(-2500); sky.moonMesh.lookAt(camera.position);
  sky.starMat.opacity = 1 - dayF;
  sky.cloudMat.color.setHex(0xffffff).lerp(C(0xffa070), setF * 0.6).multiplyScalar(0.25 + 0.75 * dayF);
  const night = elev < -0.05, dir = night ? sky.moonMesh.position.clone().normalize() : sunDir;
  sun.position.copy(focus).addScaledVector(dir, 700); sun.target.position.copy(focus);
  if (night) { sun.color.setHex(0x9fb4ff); sun.intensity = 0.8; } else { sun.color.setHex(0xff9a5a).lerp(C(0xffe4bc), dayF); sun.intensity = 0.75 + 1.0 * dayF; }
  hemi.intensity = 0.55 + 0.45 * dayF; hemi.color.copy(top).lerp(C(0xbfe4ff), 0.5);
  glyphUniforms.uGlow.value = 1.1 + 1.6 * (1 - dayF); envUniforms.uSun.value = dayF;
}

// ================================================================ voices (browser text-to-speech) + subtitles
const VOICE = {
  narrator: { g: 'm', pitch: 0.95, rate: 0.92 }, kharu: { g: 'm', pitch: 0.72, rate: 0.88 }, nefira: { g: 'f', pitch: 1.08, rate: 0.9 },
  sethar: { g: 'm', pitch: 0.5, rate: 0.85 }, lina: { g: 'f', pitch: 1.35, rate: 1.04 }, yasif: { g: 'm', pitch: 0.86, rate: 0.88 },
  tamun: { g: 'm', pitch: 1.02, rate: 0.9 }, keeper: { g: 'm', pitch: 0.62, rate: 0.82 }, memory: { g: 'f', pitch: 0.95, rate: 0.86 },
};
const NAMES = { ...SPEAKERS, narrator: { name: '', color: '#f3e3c0' } };
let voiceOn = true, heVoices = [];
const choice = { m: null, f: null };
const hasTTS = 'speechSynthesis' in window;
const rankVoice = (v) => (/natural|online|neural/i.test(v.name) ? 10 : 0) + (/microsoft/i.test(v.name) ? 2 : 0) + (/google/i.test(v.name) ? 1 : 0);
function loadVoices() {
  if (!hasTTS) return;
  heVoices = speechSynthesis.getVoices().filter((v) => /^he|^iw/i.test(v.lang)).sort((a, b) => rankVoice(b) - rankVoice(a));
  const isF = (v) => /hila|carmit|female|אישה/i.test(v.name), isM = (v) => /avri|asaf|male|גבר/i.test(v.name) && !/female/i.test(v.name);
  if (!choice.m) choice.m = heVoices.find(isM) || heVoices[0] || null;
  if (!choice.f) choice.f = heVoices.find(isF) || heVoices.find((v) => v !== choice.m) || heVoices[0] || null;
  for (const [k, sel] of [['m', $('voice-m')], ['f', $('voice-f')]]) {
    sel.innerHTML = heVoices.length ? heVoices.map((v, i) => `<option value="${i}" ${v === choice[k] ? 'selected' : ''}>${v.name}</option>`).join('') : '<option>לא נמצא קול עברית</option>';
  }
  const natural = heVoices.some((v) => /natural|online|neural/i.test(v.name));
  $('voice-note').textContent = !heVoices.length
    ? 'בדפדפן הזה אין קול בעברית, ולכן יוצגו כתוביות בלבד. לקריינות בעברית פתחו את האתר ב-Microsoft Edge.'
    : natural ? 'נמצאו קולות עברית טבעיים. מוכן לצפייה!' : 'נמצא קול עברית בסיסי. לקולות טבעיים יותר (אברי והילה) פתחו את האתר ב-Microsoft Edge.';
}
if (hasTTS) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
$('voice-m').onchange = (e) => { choice.m = heVoices[+e.target.value] || choice.m; };
$('voice-f').onchange = (e) => { choice.f = heVoices[+e.target.value] || choice.f; };
// pre-generated voice files (tools/make_voices.py) are used when they exist; otherwise the browser's voices
let AUDIO = null, curAudio = null;
fetch('audio/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => {
  if (m && Object.keys(m).length) { AUDIO = m; $('voice-note').textContent = 'הסרט מדובב: לכל דמות קול משלה.'; document.querySelector('.voices')?.classList.add('hidden'); }
}).catch(() => {});
function playFile(id) {
  return new Promise((res) => {
    const a = new Audio(`audio/${id}.mp3`); curAudio = a;
    let done = false;
    const fin = () => { if (done) return; done = true; clearTimeout(to); if (curAudio === a) curAudio = null; finishSpeech = null; res(); };
    const to = setTimeout(fin, (AUDIO[id] || 10) * 1000 + 8000);
    a.onended = fin; a.onerror = fin; finishSpeech = () => { a.pause(); fin(); };
    a.play().catch(fin);
  });
}
let finishSpeech = null;
function speak(sp, text) {
  if (voiceOn && AUDIO && AUDIO[lineId(sp, text)] !== undefined) return playFile(lineId(sp, text));
  return new Promise((res) => {
    if (!hasTTS || !voiceOn || !heVoices.length) { res(); return; }
    const cfg = VOICE[sp] || VOICE.narrator, u = new SpeechSynthesisUtterance(text);
    u.voice = choice[cfg.g]; u.lang = u.voice ? u.voice.lang : 'he-IL'; u.pitch = cfg.pitch; u.rate = cfg.rate;
    let done = false;
    const fin = () => { if (done) return; done = true; clearTimeout(to); finishSpeech = null; res(); };
    const to = setTimeout(fin, text.length * 150 + 6000);
    u.onend = fin; u.onerror = fin; finishSpeech = fin;
    speechSynthesis.speak(u);
  });
}
function showSub(sp, text) {
  const n = NAMES[sp] || NAMES.narrator;
  $('sub-name').textContent = n.name || ''; $('sub-name').style.color = n.color;
  $('sub-text').textContent = text; $('sub-text').classList.toggle('narr', sp === 'narrator');
  $('subs').classList.remove('hidden');
}

// ================================================================ timeline (pause, skip)
let paused = false, running = null;
const waiters = [];
function sleep(sec) { return new Promise((res) => waiters.push({ left: sec, res })); }
function skipBeat() { waiters.splice(0).forEach((w) => w.res()); if (hasTTS) speechSynthesis.cancel(); finishSpeech?.(); }
function setPaused(p) {
  paused = p; $('btn-pause').textContent = p ? '▶ המשך' : '⏸ עצור';
  if (hasTTS) { if (p) speechSynthesis.pause(); else speechSynthesis.resume(); }
  if (curAudio) { if (p) curAudio.pause(); else curAudio.play().catch(() => {}); }
}

// ================================================================ camera shots
const H = (dx, dy, dz) => () => hero.pos.clone().add(V3(dx, dy, dz));
const front = (dist, up, side = 0) => () => {
  const f = V3(Math.sin(hero.facing), 0, Math.cos(hero.facing)), s = V3(f.z, 0, -f.x);
  return hero.pos.clone().addScaledVector(f, dist).addScaledVector(s, side).add(V3(0, up, 0));
};
const K = (dx, dy, dz) => () => kingPos.clone().add(V3(dx, dy, dz));
const castPos = (k) => CAST[k].obj.position;
function shotFor(name) {
  const [kind, arg] = name.split(':');
  const HH = 16;
  switch (kind) {
    case 'heroFront': return { from: front(30, 12, 8), to: front(26, 12, 4), look: H(0, 12, 0) };
    case 'heroBack': return { from: front(-42, 18, 12), to: front(-36, 16, 8), look: H(0, 12, 0) };
    case 'heroSide': return { from: front(4, 11, 38), to: front(-4, 12, 34), look: H(0, 11, 0) };
    case 'heroClose': return { from: front(19, 13, 5), to: front(17, 13.5, 3), look: H(0, 13, 0) };
    case 'heroLow': return { from: front(36, 4, -8), to: front(46, 12, -14), look: H(0, 9, 0) };
    case 'trail': return { from: front(-62, 30, 22), to: front(-56, 27, 14), look: H(0, 10, 0) };
    case 'travel': return { from: front(10, 18, 52), to: front(-10, 16, 48), look: H(0, 10, 0) };
    case 'sky': return { from: H(130, 170, 120), to: H(90, 200, 170), look: H(0, 0, 0) };
    case 'pyramidClose': return { from: [150, 40, 270], to: [100, 110, 210], look: [0, 95, 0] };
    case 'capstone': return { from: [70, PYR.HEIGHT + 30, 110], to: [36, PYR.HEIGHT + 22, 64], look: [0, PYR.HEIGHT + 14, 0] };
    case 'bossRise': return { from: [34, 14, 175], to: [20, 12, 172], look: K(0, 30, 0) };
    case 'bossFly': return { from: [90, 150, 330], to: [70, 120, 520], look: K(0, 20, 0) };
    case 'bossWide': return { from: K(95, 42, -70), to: K(75, 36, -90), look: K(0, 20, 0) };
    case 'bossClose': return { from: K(30, 32, -42), to: K(24, 33, -34), look: K(0, 30, 0) };
    case 'npc': case 'onNpc': case 'two': {
      const c = CAST[arg];
      const dirF = () => { const d = V3(castPos(arg).x - hero.pos.x, 0, castPos(arg).z - hero.pos.z); if (d.lengthSq() < 1) d.set(0, 0, -1); return d.normalize(); };
      const sideF = () => { const d = dirF(); return V3(d.z, 0, -d.x); };
      if (kind === 'npc') return { from: () => hero.pos.clone().addScaledVector(dirF(), -24).addScaledVector(sideF(), 13).add(V3(0, HH * 0.95, 0)), look: () => castPos(arg).clone().add(V3(0, c.h * 0.62, 0)) };
      if (kind === 'onNpc') return { from: () => castPos(arg).clone().addScaledVector(dirF(), -c.near).addScaledVector(sideF(), c.near * 0.35).add(V3(0, c.h * 0.75, 0)), to: () => castPos(arg).clone().addScaledVector(dirF(), -c.near * 0.85).addScaledVector(sideF(), c.near * 0.25).add(V3(0, c.h * 0.75, 0)), look: () => castPos(arg).clone().add(V3(0, c.h * 0.6, 0)) };
      return { from: () => hero.pos.clone().lerp(castPos(arg), 0.5).addScaledVector(sideF(), 55).add(V3(0, 15, 0)), look: () => hero.pos.clone().lerp(castPos(arg), 0.5).add(V3(0, 8, 0)) };
    }
    case 'wide': {
      if (arg === 'pyramid') return { from: [0, 70, 560], to: [0, 150, 410], look: [0, 80, 0] };
      if (arg === 'gate') return { from: [26, 15, 175], to: [12, 13, 166], look: [0, 14, PYR.HALF + 20] };
      if (arg === 'avenue') return { from: [44, 26, 490], to: [22, 18, 330], look: [0, 15, 200] };
      if (arg === 'desert') return { from: [-150, 160, 700], to: [-420, 120, 560], look: [-380, 20, 300] };
      const c = placeV(arg), r = arg === 'camp' ? 140 : arg === 'keeper' ? 150 : arg.startsWith('sat') ? 150 : 110, h = arg === 'camp' ? 70 : 55;
      const a0 = (c.x * 0.013 + c.z * 0.007) % (Math.PI * 2);
      return { from: [c.x + Math.cos(a0) * r, c.y + h, c.z + Math.sin(a0) * r], to: [c.x + Math.cos(a0 + 0.45) * r * 0.85, c.y + h * 0.8, c.z + Math.sin(a0 + 0.45) * r * 0.85], look: [c.x, c.y + 10, c.z] };
    }
    default: return { from: front(30, 12, 8), look: H(0, 12, 0) };
  }
}
const shot = { fns: null, t: 0, dur: 1 };
const evalP = (p) => (typeof p === 'function' ? p() : p ? V3(...p) : null);
function applyShot(dt) {
  if (!shot.fns) return;
  shot.t += dt;
  const k = Math.min(1, shot.t / shot.dur), e = k * k * (3 - 2 * k);
  const f = evalP(shot.fns.from), t2 = evalP(shot.fns.to) || f, l = evalP(shot.fns.look), l2 = evalP(shot.fns.lookTo) || l;
  camera.position.lerpVectors(f, t2, e);
  const g = G(camera.position.x, camera.position.z) + 2.5; if (camera.position.y < g) camera.position.y = g;
  camera.lookAt(new THREE.Vector3().lerpVectors(l, l2, e));
}

// ================================================================ actions
const SHARD_ORDER = [0, 2, 1, 3];   // dawn, sunset, noon, night
let shardsTaken = new Set();
function setShards(set) {
  shardsTaken = new Set(set);
  world.shards.forEach((s, i) => s.parts.forEach((p) => { p.visible = !shardsTaken.has(i); }));
  golem.setPower(shardsTaken.size);
}
const heroAt = (p, facingTo) => { hero.pos.set(p.x, G(p.x, p.z), p.z); hero.target = null; hero.speed = 0; if (facingTo) hero.facing = Math.atan2(facingTo.x - p.x, facingTo.z - p.z); };
const lookAtObj = (obj, x, z) => { obj.rotation.y = Math.atan2(x - obj.position.x, z - obj.position.z); };
function show(who) {
  if (who === 'nefira') { nefira.position.set(NPC_POS.nefira.x, G(NPC_POS.nefira.x, NPC_POS.nefira.z) + 1.5, NPC_POS.nefira.z); nefira.visible = true; }
  if (who === 'nefiraGate') { nefira.position.set(22, G(22, PYR.HALF + 58) + 1.5, PYR.HALF + 58); nefira.visible = true; }
  if (who === 'nefiraArena') { nefira.position.set(hero.pos.x + 8, hero.pos.y + 1.5, hero.pos.z - 28); nefira.visible = true; }
  if (who === 'tamun') { tamun.visible = true; }
  if (who === 'yasifCamp') { yasif.position.set(NPC_POS.yasif.x, G(NPC_POS.yasif.x, NPC_POS.yasif.z), NPC_POS.yasif.z); lina.position.set(NPC_POS.yasif.x + 3, G(NPC_POS.yasif.x, NPC_POS.yasif.z), NPC_POS.yasif.z + 1); yasif.visible = lina.visible = true; }
  if (who === 'linaGate') { lina.position.set(26, G(26, 212), 212); yasif.position.set(36, G(36, 220), 220); lina.visible = yasif.visible = true; }
  nefira.userData.baseY = nefira.position.y;
}
function act(a) {
  if (!a) return;
  for (const cmd of a.split(' ')) {
    const [k, v] = cmd.split(':');
    if (k === 'show') show(v);
    else if (k === 'hide') { if (CAST[v]) CAST[v].obj.visible = false; }
    else if (k === 'emerge') { hero.emerge = 0; hero.emerging = true; }
    else if (k === 'bury') { hero.emerge = 0; hero.emerging = false; }
    else if (k === 'tint') world.pyramid.setTint(parseInt(v, 16));
    else if (k === 'hour') hourGoal = parseFloat(v);
    else if (k === 'goto') { const sp = standPoint(v); heroAt(sp, placeV(v)); }
    else if (k === 'walk') { hero.target = standPoint(v); hero.walk = 20; }
    else if (k === 'travel') {
      const s = standPoint(v), from = V3(hero.pos.x - s.x, 0, hero.pos.z - s.z);
      if (from.lengthSq() < 1) from.set(0, 0, 1);
      from.normalize().multiplyScalar(Math.min(240, Math.max(120, Math.hypot(hero.pos.x - s.x, hero.pos.z - s.z))));
      heroAt(V3(s.x + from.x, 0, s.z + from.z), s); hero.target = s; hero.walk = 32;
    }
    else if (k === 'face') { const p = CAST[v] ? castPos(v) : placeV(v); hero.facing = Math.atan2(p.x - hero.pos.x, p.z - hero.pos.z); for (const c of ['tamun', 'yasif', 'lina']) if (CAST[c].obj.visible) lookAtObj(CAST[c].obj, hero.pos.x, hero.pos.z); }
    else if (k === 'rescue') world.camp.rescue();
    else if (k === 'storm') world.camp.reset();
    else if (k === 'shard') { shardsTaken.add(+v); setShards(shardsTaken); world.dust.puff(hero.pos.x, hero.pos.y + 8, hero.pos.z, 30, 1.5); }
    else if (k === 'tablet' && v === 'all') tablets.forEach((t) => { t.visible = true; });
    else if (k === 'takeTablet') { tablets[+v].visible = false; world.dust.puff(tablets[+v].position.x, tablets[+v].position.y + 3, tablets[+v].position.z, 25, 1.4); }
    else if (k === 'takeScarab') { scarabs[+v].visible = false; world.dust.puff(scarabs[+v].position.x, scarabs[+v].position.y, scarabs[+v].position.z, 20, 1); }
    else if (k === 'boss') {
      king.g.visible = true;
      if (v === 'rise') { kingPos.set(0, -50, PYR.HALF + 30); kingPos.goal = V3(0, 6, PYR.HALF + 50); }
      if (v === 'fly') kingPos.fly = { from: kingPos.clone(), to: V3(ARENA.x, G(ARENA.x, ARENA.z), ARENA.z + 50), t: 0, dur: 7 };
      if (v === 'arena') { kingPos.goal = null; kingPos.fly = null; kingPos.set(ARENA.x, G(ARENA.x, ARENA.z), ARENA.z + 50); }
    }
    else if (k === 'slam') { slamT = 0; setTimeout(() => { hero.velY = 24; }, 800); }
    else if (k === 'bolts') { for (let i = 0; i < 8; i++) setTimeout(bolt, i * 450); }
    else if (k === 'burst') burst();
    else if (k === 'dissolve') dissolve = 0;
  }
}

// ================================================================ the film: chapters merged into one continuous story
const SCENES = CHAPTERS.map((c) => {
  const beats = [...c.beats];
  for (const ins of [...(EXTRA[c.id] || []), ...(EXTRA2[c.id] || [])].sort((a, b) => b.at - a.at)) beats.splice(ins.at, 0, ...ins.beats);
  return { ...c, beats };
});
const beatDur = (b) => {
  const spoken = b.t ? (AUDIO && AUDIO[lineId(b.s, b.t)] !== undefined ? AUDIO[lineId(b.s, b.t)] + 0.8 : b.t.length * 0.085 + 1.8) : 0;
  return Math.max(b.w ?? (b.s === 'narrator' ? 10 : (b.t ? 6 : 12)), spoken);
};
const TRANSITION = 14;
const sceneDur = SCENES.map((sc) => TRANSITION + sc.beats.reduce((a, b) => a + beatDur(b) + 1.3, 0));
const TOTAL = sceneDur.reduce((a, b) => a + b, 0);
let watched = 0, beatStart = 0, curBeatDur = 0;
const fmt = (s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
$('film-len').textContent = `אורך: כשעה וחצי (${Math.round(TOTAL / 60)} דקות בהערכה)`;

function setupScene(sc) {
  hour = hourGoal = sc.hour;
  world.pyramid.setTint(0xffb02e);
  fxList.splice(0).forEach((o) => fx.remove(o.m));
  king.g.visible = false; king.g.scale.setScalar(1); kingPos.set(0, -60, 0); kingPos.goal = null; kingPos.fly = null; dissolve = -1; slamT = -1;
  nefira.visible = false; tamun.visible = true;
  const st = sc.state || {};
  setShards(SHARD_ORDER.slice(0, st.shards || 0));
  if (st.caravan) world.camp.rescue(); else world.camp.reset();
  show('yasifCamp');
  tablets.forEach((t) => { t.visible = !!st.tablets; });
  scarabs.forEach((t) => { t.visible = !!st.scarabs; });
  hero.emerge = 1; hero.emerging = false; hero.velY = 0;
  const p = placeV(sc.start.place);
  heroAt(standPoint(sc.start.place, V3(p.x, 0, p.z + 40)), V3(p.x, 0, p.z - 60));
  if (sc.start.place === 'avenue' || sc.start.place === 'gate') hero.facing = Math.PI;
  if (sc.start.buried) hero.emerge = 0;
  if (sc.start.boss === 'gate') { king.g.visible = true; kingPos.set(0, -50, PYR.HALF + 30); }
}
function fade(on) { $('fade').classList.toggle('on', on); return sleep(1.3); }
function savePos(si, bi) { try { localStorage.setItem('blackPyramid.film.pos', JSON.stringify({ si, bi })); } catch { /* storage unavailable */ } }
function loadPos() { try { return JSON.parse(localStorage.getItem('blackPyramid.film.pos')); } catch { return null; } }

async function playFilm(fromScene = 0) {
  stop();
  const token = {}; running = token;
  $('library').classList.add('hidden'); $('player').classList.remove('hidden'); $('end-card').classList.add('hidden');
  setPaused(false);
  watched = sceneDur.slice(0, fromScene).reduce((a, b) => a + b, 0);
  for (let si = fromScene; si < SCENES.length; si++) {
    const sc = SCENES[si];
    $('subs').classList.add('hidden');
    await fade(true); if (running !== token) return;
    setupScene(sc);
    shot.fns = shotFor(sc.beats[0]?.c || 'heroFront'); shot.t = 0; shot.dur = TRANSITION;
    await fade(false); if (running !== token) return;
    beatStart = watched; curBeatDur = TRANSITION - 2.6;
    await sleep(TRANSITION - 2.6); if (running !== token) return;
    watched += TRANSITION;
    for (let bi = 0; bi < sc.beats.length; bi++) {
      const b = sc.beats[bi];
      savePos(si, bi);
      act(b.a);
      const d = beatDur(b);
      shot.fns = shotFor(b.c || 'heroFront'); shot.t = 0; shot.dur = d;
      beatStart = watched; curBeatDur = d + 1.3;
      if (b.t) showSub(b.s, b.t); else $('subs').classList.add('hidden');
      await Promise.all([sleep(d), b.t ? speak(b.s, b.t) : null]);
      if (running !== token) return;
      await sleep(1.3);
      if (running !== token) return;
      watched += d + 1.3;
    }
  }
  savePos(0, 0);
  $('subs').classList.add('hidden');
  await sleep(2);
  if (running === token) $('end-card').classList.remove('hidden');
}
function stop() { running = null; skipBeat(); $('subs').classList.add('hidden'); }
function backToLibrary() { stop(); $('player').classList.add('hidden'); $('library').classList.remove('hidden'); $('fade').classList.remove('on'); shot.fns = null; refreshResume(); }
function currentScene() { const p = loadPos(); return p ? p.si : 0; }
function refreshResume() {
  const p = loadPos();
  $('btn-resume').classList.toggle('hidden', !(p && (p.si > 0 || p.bi > 0)));
}
refreshResume();
$('btn-play').onclick = () => { if (hasTTS) speechSynthesis.cancel(); playFilm(0); };
$('btn-resume').onclick = () => { if (hasTTS) speechSynthesis.cancel(); playFilm(currentScene()); };
$('btn-pause').onclick = () => setPaused(!paused);
$('btn-next').onclick = () => skipBeat();
$('btn-scene').onclick = () => { const si = Math.min(SCENES.length - 1, currentScene() + 1); playFilm(si); };
$('btn-back').onclick = backToLibrary;
$('btn-end-back').onclick = backToLibrary;
$('btn-voice').onclick = () => { voiceOn = !voiceOn; $('btn-voice').textContent = voiceOn ? '🔊 קול' : '🔇 כתוביות בלבד'; if (!voiceOn) { if (hasTTS) speechSynthesis.cancel(); finishSpeech?.(); } };
$('btn-test-voice').onclick = () => { if (hasTTS) { speechSynthesis.cancel(); speak('narrator', 'שלום! אני הקול של המספר בסרט משמר הפירמידה השחורה.'); } };
addEventListener('keydown', (e) => {
  if ($('player').classList.contains('hidden')) return;
  if (e.code === 'Space') { e.preventDefault(); setPaused(!paused); }
  if (e.code === 'ArrowLeft') skipBeat();
  if (e.code === 'Escape') backToLibrary();
});

// ================================================================ frame loop
const clock = new THREE.Clock();
let t = 0;
const pad = createGamepad();
const menuNav = createMenuNav(['#end-card', '#library']);
function handlePad(dt) {
  pad.poll(dt);
  if (!pad.connected) return;
  if (!$('player').classList.contains('hidden') && $('end-card').classList.contains('hidden')) {
    if (pad.hit(BTN.A) || pad.hit(BTN.MENU)) setPaused(!paused);
    if (pad.hit(BTN.B) || pad.hit(BTN.VIEW)) backToLibrary();
    if (pad.hit(BTN.RB) || pad.hit(BTN.RIGHT)) skipBeat();
    if (pad.hit(BTN.LB) || pad.hit(BTN.UP)) $('btn-scene').click();
    if (pad.hit(BTN.Y)) $('btn-voice').click();
    return;
  }
  menuNav(pad, dt);
}
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  autoRes();
  handlePad(dt);
  if (!paused) {
    t += dt;
    for (let i = waiters.length - 1; i >= 0; i--) { waiters[i].left -= dt; if (waiters[i].left <= 0) { waiters[i].res(); waiters.splice(i, 1); } }
    hour += (hourGoal - hour) * Math.min(1, dt * 0.25);
    if (hero.target) {
      const d = V3(hero.target.x - hero.pos.x, 0, hero.target.z - hero.pos.z), dist = d.length();
      if (dist < 2) hero.target = null;
      else {
        let df = Math.atan2(d.x, d.z) - hero.facing; df = Math.atan2(Math.sin(df), Math.cos(df));
        hero.facing += df * Math.min(1, dt * 5); hero.speed = THREE.MathUtils.damp(hero.speed, hero.walk, 6, dt);
        hero.pos.addScaledVector(V3(Math.sin(hero.facing), 0, Math.cos(hero.facing)), hero.speed * dt);
      }
    } else hero.speed = THREE.MathUtils.damp(hero.speed, 0, 6, dt);
    const g = G(hero.pos.x, hero.pos.z);
    hero.velY -= 60 * dt; hero.pos.y = Math.max(g, hero.pos.y + hero.velY * dt); if (hero.pos.y <= g) hero.velY = 0;
    if (hero.emerging) { hero.emerge = Math.min(1, hero.emerge + dt / 5); if (Math.random() < 0.3) world.dust.puff(hero.pos.x + (Math.random() - 0.5) * 8, g, hero.pos.z + (Math.random() - 0.5) * 8, 6, 1.4); if (hero.emerge >= 1) hero.emerging = false; }
    golem.group.position.copy(hero.pos); golem.group.position.y -= (1 - hero.emerge) * 18;
    golem.group.rotation.y = hero.facing;
    golem.update(dt, Math.min(1, hero.speed / 24), t, null);
    if (kingPos.goal) { kingPos.lerp(kingPos.goal, Math.min(1, dt * 0.9)); if (kingPos.distanceTo(kingPos.goal) < 0.5) kingPos.goal = null; }
    if (kingPos.fly) { const f = kingPos.fly; f.t += dt; const k = Math.min(1, f.t / f.dur); kingPos.lerpVectors(f.from, f.to, k); kingPos.y += Math.sin(k * Math.PI) * 70; if (k >= 1) kingPos.fly = null; }
    king.g.position.copy(kingPos);
    if (king.g.visible) {
      king.g.rotation.y = Math.atan2(hero.pos.x - kingPos.x, hero.pos.z - kingPos.z);
      king.crown.rotation.z += dt * 0.8; king.ringMat.emissiveIntensity = 2.5 + Math.sin(t * 4) * 0.8;
      if (slamT >= 0) { slamT += dt; const ang = slamT < 0.9 ? -2.6 * (slamT / 0.9) : -2.6 + 2.1 * Math.min(1, (slamT - 0.9) * 6); king.hands.forEach((h) => { h.rotation.x = ang; }); if (slamT > 1.06 && !king.slammed) { king.slammed = true; wave(); } if (slamT > 1.8) { slamT = -1; king.slammed = false; } }
      else king.hands.forEach((h, i) => { h.rotation.x = Math.sin(t * 2 + i) * 0.12 - 0.1; });
      king.dark.emissive.setHex(flash > 0 ? 0xffffff : 0x16063a); flash -= dt;
      if (dissolve >= 0) { dissolve += dt / 8; king.g.scale.setScalar(Math.max(0.03, 1 - dissolve)); if (Math.random() < 0.5) world.dust.puff(kingPos.x + (Math.random() - 0.5) * 30, kingPos.y + Math.random() * 35, kingPos.z, 10, 2); if (dissolve >= 1) { king.g.visible = false; dissolve = -1; } }
    }
    for (let i = fxList.length - 1; i >= 0; i--) if (fxList[i].update(dt)) { fx.remove(fxList[i].m); fxList.splice(i, 1); }
    if (nefira.visible) { nefira.position.y = (nefira.userData.baseY ?? nefira.position.y) + Math.sin(t * 1.2) * 0.6; lookAtObj(nefira, hero.pos.x, hero.pos.z); }
    keeper.g.position.y = G(NPC_POS.keeper.x, NPC_POS.keeper.z) + 9 + Math.sin(t * 0.8) * 1.2;
    keeper.flames.forEach((f, k) => { f.scale.y = 1 + Math.sin(t * 7 + k) * 0.25; });
    tablets.forEach((tb) => { if (tb.visible) tb.children[0].rotation.y = Math.sin(t * 0.5) * 0.2; });
    scarabs.forEach((s, i) => { s.rotation.y = t * 0.8 + i; });
    world.update(dt, t, { center: hero.pos, wind: 6 });
    applyShot(dt);
  }
  if (!shot.fns) { const a = t * 0.04 + 0.5; camera.position.set(Math.sin(a) * 420, 95, Math.cos(a) * 420); camera.lookAt(0, 60, 0); }
  $('time').textContent = running ? `${fmt(watched)} / ${fmt(TOTAL)}` : '';
  $('progress-fill').style.width = `${Math.min(100, (watched / TOTAL) * 100)}%`;
  updateSky(shot.fns ? hero.pos : new THREE.Vector3());
  if (useComposer) composer.render(); else renderer.render(scene, camera);
  renderGuard();
}
frame();
window.__film = { play: playFilm, skip: skipBeat, SCENES, TOTAL, get voices() { return heVoices.map((v) => v.name); }, get watched() { return watched; } };
