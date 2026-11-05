// diag-gpu.js — step-by-step GPU test for diag.html: turns on the game's graphics features one at a time,
// saving the current step first, so even if the console's 3D engine crashes we know which feature did it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createWorld } from './world.js';
import { createGolem } from './golem.js';

const KEY = 'blackPyramid.diag.step';
const $ = (id) => document.getElementById(id);
const tb = $('adv').querySelector('tbody');
const row = (k, v, cls) => { const tr = document.createElement('tr'); tr.innerHTML = '<td></td><td></td>'; tr.children[0].textContent = k; tr.children[1].textContent = v; if (cls) tr.children[1].className = cls; tb.appendChild(tr); return tr; };

const STEPS = [
  'בסיס: three.js עם WebGL2',
  'הדמות (צבעי טון וקווי מתאר)',
  'צללים רכים 1024',
  'צללים רכים 2048',
  'עולם המשחק המלא (מדבר, פירמידה, שמיים)',
  'עיבוד תמונה רגיל (8-bit)',
  'עיבוד HDR (HalfFloat)',
  'החלקת קצוות MSAA ×4',
  'זוהר (Bloom)',
  'מסנן ציורי (Kuwahara)',
  'רזולוציה מלאה של המסך',
];

// last visit crashed in the middle of a step?
let prev = null;
try { prev = localStorage.getItem(KEY); } catch { /* no storage */ }
if (prev !== null) row('בפעם הקודמת', `הבדיקה קרסה בשלב ${+prev + 1}: ${STEPS[+prev] || '?'}`, 'bad');

$('run').onclick = run;

async function run() {
  $('run').disabled = true;
  tb.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;aspect-ratio:16/9;display:block;margin:10px 0;border:1px solid #8a6a3a;background:#000';
  $('adv-view').innerHTML = ''; $('adv-view').appendChild(canvas);
  let lost = false, cur = -1;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; row('קריסה', `מנוע התלת-ממד קרס בשלב ${cur + 1}: ${STEPS[cur]}`, 'bad'); });

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  const size = () => { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); return [w, h]; };
  let [W, H] = size();
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87a8c8);
  scene.fog = new THREE.Fog(0xf3d3a0, 300, 2300);
  const camera = new THREE.PerspectiveCamera(58, W / H, 0.8, 7000);
  camera.position.set(0, 30, 360); camera.lookAt(0, 20, 290);
  const hemi = new THREE.HemisphereLight(0xa8d8ff, 0xe0a070, 0.6);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.8);
  sun.position.set(-200, 300, 400); sun.target.position.set(0, 0, 300);
  Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 1, far: 1400 });
  scene.add(hemi, sun, sun.target);
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), new THREE.MeshStandardMaterial({ color: 0xd99a2b }));
  box.position.set(0, 20, 300); box.castShadow = true; scene.add(box);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xc8955a }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 300); floor.receiveShadow = true; scene.add(floor);
  let composer = null, world = null, t = 0;
  const gl = renderer.getContext();

  const makeComposer = (opts) => {
    const c = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, opts));
    c.addPass(new RenderPass(scene, camera));
    return c;
  };
  const actions = [
    () => {},
    () => { const g = createGolem(); g.group.position.set(-14, 0, 300); g.group.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(g.group); },
    () => { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); }); },
    () => { sun.shadow.map?.dispose(); sun.shadow.map = null; sun.shadow.mapSize.set(2048, 2048); },
    () => { scene.remove(floor); scene.background = null; world = createWorld(scene, { groundSeg: 300 }); },
    () => { composer = makeComposer({ type: THREE.UnsignedByteType }); composer.addPass(new OutputPass()); },
    () => { composer = makeComposer({ type: THREE.HalfFloatType }); composer.addPass(new OutputPass()); },
    () => { composer = makeComposer({ type: THREE.HalfFloatType, samples: 4 }); composer.addPass(new OutputPass()); },
    () => { composer = makeComposer({ type: THREE.HalfFloatType, samples: 4 }); composer.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.6, 0.45, 1.0)); composer.addPass(new OutputPass()); },
    () => {
      composer.addPass(new ShaderPass({
        uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(W, H) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; varying vec2 vUv;
          #define R 3
          void main(){ vec2 px = 1.0 / res; vec3 m0 = vec3(0.), m1 = vec3(0.), s0 = vec3(0.), s1 = vec3(0.);
            for (int j = 0; j <= R; j++) for (int i = 0; i <= R; i++) {
              vec3 c = texture2D(tDiffuse, vUv + vec2(-i, -j) * px).rgb; m0 += c; s0 += c * c;
              c = texture2D(tDiffuse, vUv + vec2(i, j) * px).rgb; m1 += c; s1 += c * c; }
            float n = float((R + 1) * (R + 1)); m0 /= n; m1 /= n;
            vec3 v0 = s0 / n - m0 * m0, v1 = s1 / n - m1 * m1;
            gl_FragColor = vec4((v0.r + v0.g + v0.b) < (v1.r + v1.g + v1.b) ? m0 : m1, 1.0); }`,
      }));
    },
    () => {
      canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:50;background:#000';
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75)); [W, H] = size(); camera.aspect = W / H; camera.updateProjectionMatrix();
      composer?.setPixelRatio(renderer.getPixelRatio()); composer?.setSize(W, H);
    },
  ];

  const frame = () => new Promise((res) => requestAnimationFrame(res));
  const px = new Uint8Array(4);
  for (cur = 0; cur < STEPS.length && !lost; cur++) {
    try { localStorage.setItem(KEY, String(cur)); } catch { /* no storage */ }
    const tr = row(STEPS[cur], '…בודק');
    await frame();
    try { actions[cur](); } catch (e) { tr.children[1].textContent = 'שגיאה: ' + (e?.message || e); tr.children[1].className = 'bad'; continue; }
    let worst = 0, sum = 0, n = 0;
    for (let f = 0; f < 60 && !lost; f++) {
      const a = performance.now();
      t += 1 / 60; box.rotation.y = t;
      world?.update?.(1 / 60, t, { center: camera.position, wind: 6 });
      if (composer) composer.render(); else renderer.render(scene, camera);
      gl.finish?.();
      const ms = performance.now() - a; if (f > 5) { worst = Math.max(worst, ms); sum += ms; n++; }
      await frame();
    }
    if (lost) { tr.children[1].textContent = 'קרס כאן'; tr.children[1].className = 'bad'; break; }
    // look at the result: white or a single flat colour means the GPU did not draw it properly
    if (composer) composer.render(); else renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    let white = 0, lo = 255, hi = 0;
    for (let j = 1; j <= 4; j++) for (let i = 1; i <= 4; i++) {
      gl.readPixels(Math.floor(gl.drawingBufferWidth * i / 5), Math.floor(gl.drawingBufferHeight * j / 5), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (Math.min(px[0], px[1], px[2]) > 232) white++;
      lo = Math.min(lo, px[0] + px[1] + px[2]); hi = Math.max(hi, px[0] + px[1] + px[2]);
    }
    const bad = white >= 14 ? 'התמונה לבנה' : hi - lo < 6 ? 'התמונה בצבע אחד' : '';
    const err = gl.getError();
    tr.children[1].textContent = (bad || 'עובד') + ` · ${Math.round(sum / Math.max(1, n))} ms לפריים (הכי איטי ${Math.round(worst)})` + (err ? ` · GL error ${err}` : '');
    tr.children[1].className = bad ? 'bad' : 'ok';
  }
  if (!lost) { try { localStorage.removeItem(KEY); } catch { /* no storage */ } row('סיום', 'כל השלבים הסתיימו בלי קריסה', 'ok'); }
  canvas.style.position = ''; canvas.style.cssText = 'width:100%;aspect-ratio:16/9;display:block;margin:10px 0;border:1px solid #8a6a3a';
  [W, H] = size();
  $('run').disabled = false;
  scrollTo(0, $('adv').offsetTop - 20);
}
