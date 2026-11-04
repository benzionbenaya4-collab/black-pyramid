// editor.js — in-game character designer: live 3D preview, colours, sizes, parts, presets and a shareable design code.
import * as THREE from 'three';
import { createGolem, DEFAULT_DESIGN, normalizeDesign } from './golem.js';

const $ = (id) => document.getElementById(id);
const KEY = 'blackPyramid.hero.v2';

const COLOR_LABELS = {
  armor: 'שריון ומעיל', armorDark: 'מעיל תחתון', trim: 'עיטורי זהב', hood: 'ברדס וצווארון', glow: 'זוהר (אבני חן וקווים)',
  gloves: 'כפפות', suit: 'שרוולים ומכנסיים', belt: 'חגורה', boots: 'מגפיים', shoes: 'נעליים', cape: 'גלימה',
};
const SIZE_LABELS = { height: ['גובה', 0.7, 1.4], hood: ['גודל הברדס', 0.7, 1.5], shoulders: ['גודל הכתפיים', 0.6, 1.6], hands: ['גודל הידיים', 0.6, 1.6] };
const PART_LABELS = { crest: 'טבעת זהב ואבן על הברדס', sideBars: 'מוטות זהב לצד הברדס', cape: 'גלימה', tabard: 'סינר קדמי מעוטר', chestEmblem: 'גלגל השמש על החזה' };
const PRESETS = {
  'העיצוב שלך': DEFAULT_DESIGN.colors,
  'שומר החולות': { armor: '#d9a35f', armorDark: '#a8743d', trim: '#f2d27a', hood: '#2a8f8f', glow: '#3df0d0', gloves: '#8a5a30', suit: '#3b2a1c', belt: '#5a3417', boots: '#e8d6b0', shoes: '#2a8f8f', cape: '#2a8f8f' },
  'ליקוי': { armor: '#2b2b38', armorDark: '#17171f', trim: '#c9a0ff', hood: '#3a2266', glow: '#ff4a6a', gloves: '#3a2266', suit: '#101018', belt: '#2a1a3a', boots: '#6c6c86', shoes: '#3a2266', cape: '#3a2266' },
  'שקיעה': { armor: '#ff7a2a', armorDark: '#c2431a', trim: '#ffd36a', hood: '#7a1f3a', glow: '#fff2a0', gloves: '#c2431a', suit: '#3a1420', belt: '#5a2a14', boots: '#ffc9a0', shoes: '#7a1f3a', cape: '#7a1f3a' },
};

export function loadDesign() { try { return normalizeDesign(JSON.parse(localStorage.getItem(KEY))); } catch { return normalizeDesign(null); } }
function storeDesign(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage unavailable */ } }

export function createEditor({ onSave }) {
  let design = loadDesign();
  let renderer = null, scene, camera, hero = null, raf = 0, yaw = 0.5, dragging = false, lastX = 0;

  // ---- build the controls once
  const colorsEl = $('ed-colors'), sizesEl = $('ed-sizes'), partsEl = $('ed-parts'), presetsEl = $('ed-presets');
  for (const [k, label] of Object.entries(COLOR_LABELS)) {
    const row = document.createElement('label'); row.className = 'ed-row';
    row.innerHTML = `<span>${label}</span><input type="color" id="edc-${k}">`;
    colorsEl.appendChild(row);
    row.querySelector('input').addEventListener('input', (e) => { design.colors[k] = e.target.value; rebuildSoon(); });
  }
  for (const [k, [label, min, max]] of Object.entries(SIZE_LABELS)) {
    const row = document.createElement('label'); row.className = 'ed-row';
    row.innerHTML = `<span>${label}</span><input type="range" id="eds-${k}" min="${min}" max="${max}" step="0.05"><output id="edo-${k}"></output>`;
    sizesEl.appendChild(row);
    row.querySelector('input').addEventListener('input', (e) => { design.size[k] = +e.target.value; $(`edo-${k}`).textContent = `×${(+e.target.value).toFixed(2)}`; rebuildSoon(); });
  }
  for (const [k, label] of Object.entries(PART_LABELS)) {
    const row = document.createElement('label'); row.className = 'ed-check';
    row.innerHTML = `<input type="checkbox" id="edp-${k}"><span>${label}</span>`;
    partsEl.appendChild(row);
    row.querySelector('input').addEventListener('change', (e) => { design.parts[k] = e.target.checked; rebuildSoon(); });
  }
  for (const [name, colors] of Object.entries(PRESETS)) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost';
    b.innerHTML = `<i style="background:${colors.armor}"></i><i style="background:${colors.hood}"></i><i style="background:${colors.trim}"></i> ${name}`;
    b.onclick = () => { design.colors = { ...colors }; syncControls(); rebuildSoon(); };
    presetsEl.appendChild(b);
  }
  function syncControls() {
    for (const k of Object.keys(COLOR_LABELS)) $(`edc-${k}`).value = design.colors[k];
    for (const k of Object.keys(SIZE_LABELS)) { $(`eds-${k}`).value = design.size[k]; $(`edo-${k}`).textContent = `×${(+design.size[k]).toFixed(2)}`; }
    for (const k of Object.keys(PART_LABELS)) $(`edp-${k}`).checked = !!design.parts[k];
  }

  // ---- live 3D preview
  function setupPreview() {
    const canvas = $('ed-canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(30, 1, 1, 400);
    scene.add(new THREE.HemisphereLight(0xbfe4ff, 0xe0a070, 1.3));
    const sun = new THREE.DirectionalLight(0xffe4bc, 2.2); sun.position.set(30, 60, 40); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd9a565, roughness: 1 }));
    scene.add(ground);
    canvas.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', () => { dragging = false; });
    canvas.addEventListener('pointermove', (e) => { if (dragging) { yaw -= (e.clientX - lastX) * 0.01; lastX = e.clientX; } });
  }
  let rebuildTimer = 0;
  function rebuildSoon() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 120); }
  function rebuild() {
    if (!scene) return;
    if (hero) { scene.remove(hero.group); hero.dispose(); }
    hero = createGolem(design);
    scene.add(hero.group);
  }
  function loop(tt) {
    raf = requestAnimationFrame(loop);
    const canvas = renderer.domElement, w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(hgt * renderer.getPixelRatio())) {
      renderer.setSize(w, hgt, false); camera.aspect = w / Math.max(1, hgt); camera.updateProjectionMatrix();
    }
    if (!dragging) yaw += 0.004;
    const H = 16 * design.size.height, dist = 30 + H * 1.6;
    camera.position.set(Math.sin(yaw) * dist, H * 0.6, Math.cos(yaw) * dist);
    camera.lookAt(0, H * 0.48, 0);
    if (hero) hero.update(0.016, 0, tt / 1000, null);
    renderer.render(scene, camera);
  }

  function open() {
    design = loadDesign();
    syncControls();
    $('editor').classList.remove('hidden');
    if (!renderer) setupPreview();
    rebuild();
    cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }
  function close() { $('editor').classList.add('hidden'); cancelAnimationFrame(raf); $('ed-code-box').classList.add('hidden'); }

  $('ed-save').onclick = () => { storeDesign(design); onSave(normalizeDesign(design)); close(); };
  $('ed-cancel').onclick = close;
  $('ed-reset').onclick = () => { design = normalizeDesign(null); syncControls(); rebuild(); };
  $('ed-copy').onclick = async () => {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(design))));
    $('ed-code').value = code; $('ed-code-box').classList.remove('hidden');
    try { await navigator.clipboard.writeText(code); $('ed-msg').textContent = 'קוד העיצוב הועתק. אפשר לשלוח אותו לחבר.'; }
    catch { $('ed-code').select(); $('ed-msg').textContent = 'סמן את הקוד והעתק אותו (Ctrl+C).'; }
  };
  $('ed-paste').onclick = () => { $('ed-code').value = ''; $('ed-code-box').classList.remove('hidden'); $('ed-msg').textContent = 'הדבק כאן קוד עיצוב ולחץ "טען קוד".'; $('ed-code').focus(); };
  $('ed-load').onclick = () => {
    try { design = normalizeDesign(JSON.parse(decodeURIComponent(escape(atob($('ed-code').value.trim()))))); syncControls(); rebuild(); $('ed-msg').textContent = 'העיצוב נטען. לחץ "שמור" כדי להשתמש בו במשחק.'; }
    catch { $('ed-msg').textContent = 'הקוד לא תקין. בדוק שהעתקת את כולו.'; }
  };
  return { open, close, get isOpen() { return !$('editor').classList.contains('hidden'); } };
}
