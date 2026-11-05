// platform.js — devices: phones, consoles (Xbox Edge), quality levels, gamepads, on-screen errors.
const UA = navigator.userAgent || '';
// Xbox Edge: deliver the controller to the game (no mouse-pointer emulation). Must be set as early as possible.
try { if ('gamepadInputEmulation' in navigator) navigator.gamepadInputEmulation = 'gamepad'; } catch { /* other browsers */ }
export const isXbox = /Xbox/i.test(UA);
export const isPlayStation = /PlayStation/i.test(UA);
export const isSwitch = /Nintendo/i.test(UA);
export const isConsole = isXbox || isPlayStation || isSwitch;
export const isMobile = !isConsole && (/Android|iPhone|iPad|iPod|Mobile/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1) || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900));

// ================================================================ automatic per-device graphics (no menu: the game detects the device)
// Every device keeps the full look (bloom + painterly pass); only the internal resolution is tuned,
// and it keeps adjusting itself while playing so the frame rate stays smooth.
export const device = isConsole ? 'console' : isMobile ? 'phone' : 'pc';
const PROFILES = {
  pc: { pixelRatio: 1.75, minRatio: 0.85, msaa: 4, halfFloat: true, painter: 3, bloom: true, shadow: 2048, groundSeg: 360 },
  // Xbox: every effect works, but full-TV-resolution buffers run out of graphics memory (diag.html, step 11):
  // draw internally at up to 1280×720 and let the browser stretch it to the screen, like console games do
  console: { pixelRatio: 1, minRatio: 0.6, maxPixels: 1280 * 720, msaa: 4, halfFloat: true, painter: 2, bloom: true, shadow: 2048, groundSeg: 300 },
  phone: { pixelRatio: 2, minRatio: 1, msaa: 4, halfFloat: true, painter: 2, bloom: true, shadow: 1024, groundSeg: 240 },
};
const MEM_KEY = `blackPyramid.lowMem.v2.${device}`;   // v2: old crash records (before the resolution cap) are ignored
const DEFAULT_SAFE = 0;
export function lowMem() { try { const v = localStorage.getItem(MEM_KEY); return v === null ? DEFAULT_SAFE : +v || 0; } catch { return DEFAULT_SAFE; } }
export function quality() {
  try { localStorage.removeItem('blackPyramid.quality'); } catch { /* old manual setting is no longer used */ }
  const p = { ...PROFILES[device] }, lm = lowMem();
  // set automatically only if this device's 3D engine crashed before (see watchContext)
  if (lm >= 1) Object.assign(p, { pixelRatio: Math.min(p.pixelRatio, 1), msaa: 0, halfFloat: false, shadow: 1024, groundSeg: Math.min(p.groundSeg, 220) });
  if (lm >= 2) Object.assign(p, { webgl1: true, pixelRatio: 0.75, minRatio: 0.5, painter: 0, bloom: false, shadow: 512, groundSeg: 160 });   // older, more stable WebGL1
  if (lm >= 3) Object.assign(p, { shadow: 0, direct: true });   // no shadows, no post-processing at all
  return { level: device, lowMem: lm, ...p, pixelRatio: Math.min(window.devicePixelRatio || 1, p.pixelRatio) };
}
function gpuInfo(gl) {
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return `GPU: ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)} · maxTex ${gl.getParameter(gl.MAX_TEXTURE_SIZE)} · ${innerWidth}x${innerHeight}@${devicePixelRatio}`;
  } catch { return 'GPU: ?'; }
}
/** retry with lighter graphics (up to three steps), then show the technical details on screen */
export function lighterAndReload(reason, gl) {
  const lm = lowMem();
  if (lm < 3) {
    // consoles: one crash already costs a full browser restart, so go straight to the safe WebGL1 mode
    const next = isConsole ? Math.max(lm + 1, 2) : lm + 1;
    try { localStorage.setItem(MEM_KEY, String(next)); } catch { /* no storage */ }
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:98;display:flex;align-items:center;justify-content:center;background:#140a02;color:#f6e7c8;font:22px/1.6 Arial,sans-serif;direction:rtl;text-align:center;padding:24px';
    el.textContent = 'מתאים את הגרפיקה למכשיר הזה… המשחק ייטען מחדש בעוד רגע.';
    document.body.appendChild(el);
    setTimeout(() => location.reload(), 1500);
  } else {
    window.dispatchEvent(new ErrorEvent('error', { message: `${reason} (after lighter graphics). ${gpuInfo(gl)}` }));
  }
}
/** the 3D engine (WebGL) can crash on consoles / phones, e.g. out of graphics memory → retry lighter */
export function watchContext(renderer) {
  const gl = renderer.getContext();
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lighterAndReload('WebGL context lost', gl); });
}
/** Automatic quality while playing: call tick() every frame. When the game gets slow it first drops the most
 *  expensive effect (painterly filter), then resolution step by step (never below the profile's floor), then bloom;
 *  when it is fast again it climbs back up. apply({ ratio, painter, bloom }) is called on every change. */
export function createAutoRes(Q, apply) {
  const mid = (Q.pixelRatio + Q.minRatio) / 2;
  const levels = [
    { ratio: Q.pixelRatio, painter: true, bloom: true },
    { ratio: Q.pixelRatio, painter: false, bloom: true },
    { ratio: mid, painter: false, bloom: true },
    { ratio: Q.minRatio, painter: false, bloom: true },
    { ratio: Q.minRatio, painter: false, bloom: false },
  ];
  let lv = 0, acc = 0, n = 0, warm = 3, slow = 0, fast = 0, last = performance.now();
  return function tick() {
    const now = performance.now(), d = (now - last) / 1000; last = now;
    if (d > 0.25 || document.hidden) return;   // tab switch / loading hitch: ignore
    acc += d; n++;
    if (acc < 1.2) return;
    const ms = (acc / n) * 1000; acc = 0; n = 0;
    if (warm > 0) { warm--; return; }
    if (ms > 24) { fast = 0; if (++slow >= 2 && lv < levels.length - 1) { lv++; slow = 0; apply(levels[lv]); } }
    else if (ms < 13) { slow = 0; if (++fast >= 5 && lv > 0) { lv--; fast = 0; apply(levels[lv]); } }
    else { slow = 0; fast = 0; }
  };
}

// ================================================================ broken-picture guard
// Some console / phone GPUs draw a plain white (or flat) picture with certain effects. This samples the
// rendered frame now and then; if it looks broken it switches the next effect off, and remembers it.
export function createRenderGuard(renderer, steps, name) {
  const KEY = `blackPyramid.safeLevel.v2.${name}.${device}`;
  let level = 0;
  try { level = Math.min(steps.length, +localStorage.getItem(KEY) || 0); } catch { /* no storage */ }
  for (let i = 0; i < level; i++) steps[i]();
  const gl = renderer.getContext(), px = new Uint8Array(4);
  let frame = 0, strikes = 0, told = false;
  return function check() {
    frame++;
    if (frame < 40 || frame % 30 || gl.isContextLost()) return;
    renderer.setRenderTarget(null);
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    let white = 0, n = 0, lo = [255, 255, 255], hi = [0, 0, 0];
    for (let j = 1; j <= 5; j++) for (let i = 1; i <= 5; i++) {
      gl.readPixels(Math.floor(w * i / 6), Math.floor(h * j / 6), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      n++; if (Math.min(px[0], px[1], px[2]) > 232) white++;
      for (let c = 0; c < 3; c++) { lo[c] = Math.min(lo[c], px[c]); hi[c] = Math.max(hi[c], px[c]); }
    }
    const flat = hi[0] - lo[0] < 4 && hi[1] - lo[1] < 4 && hi[2] - lo[2] < 4;
    if (white < n * 0.85 && !flat) { strikes = 0; return; }
    if (++strikes < 2) return;
    strikes = 0;
    if (level < steps.length) {
      steps[level](); level++;
      try { localStorage.setItem(KEY, String(level)); } catch { /* no storage */ }
      console.warn(`render guard: picture looked broken, safe level ${level}`);
    } else if (!told) {
      told = true;
      try { localStorage.setItem(KEY, '0'); } catch { /* no storage */ }   // effects back on, lighter memory instead
      lighterAndReload(`Picture still ${white >= n * 0.85 ? 'white' : 'flat'} after all fallbacks`, gl);
    }
  };
}

// ================================================================ errors on screen instead of a blank page
export function installErrorOverlay() {
  const show = (msg) => {
    let el = document.getElementById('fatal');
    if (!el) {
      el = document.createElement('div'); el.id = 'fatal';
      el.style.cssText = 'position:fixed;inset:auto 12px 12px 12px;z-index:99;background:#2a0a0a;color:#ffd9d0;border:1px solid #ff6a4a;border-radius:10px;padding:12px 16px;font:14px/1.5 Arial,sans-serif;direction:rtl;max-height:45vh;overflow:auto';
      el.innerHTML = '<b>אירעה שגיאה.</b> צלם את ההודעה הזאת ושלח אותה, כדי שאפשר יהיה לתקן:<pre style="white-space:pre-wrap;direction:ltr;text-align:left;margin:8px 0 0"></pre>';
      document.body.appendChild(el);
    }
    el.querySelector('pre').textContent += `${msg}\n[build ${BUILD}] [${UA}]\n`;
  };
  addEventListener('error', (e) => show(`${e.message || e} @ ${e.filename || ''}:${e.lineno || ''}`));
  addEventListener('unhandledrejection', (e) => show(`Promise: ${e.reason && (e.reason.stack || e.reason.message) || e.reason}`));
  return show;
}
/** true if the browser can draw 3D; otherwise shows a clear message */
export const BUILD = document.querySelector('meta[name=build]')?.content || 'dev';
export function checkWebGL() {
  let reason = '';
  for (const type of ['webgl2', 'webgl', 'experimental-webgl']) {
    try {
      const c = document.createElement('canvas');
      c.addEventListener('webglcontextcreationerror', (e) => { reason = reason || e.statusMessage || ''; }, false);
      if (c.getContext(type, { failIfMajorPerformanceCaveat: false })) return true;
    } catch (e) { reason = reason || String(e?.message || e); }
  }
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#140a02;color:#f6e7c8;font:22px/1.6 Arial,sans-serif;text-align:center;padding:24px;direction:rtl;z-index:100';
  let crashed = false; try { crashed = localStorage.getItem(MEM_KEY) !== null; } catch { /* no storage */ }
  el.innerHTML = (crashed
    ? '<div><b>הגרפיקה נתקעה בפעם הקודמת, והדפדפן חסם זמנית תלת-ממד.</b><br>סגרו את הדפדפן <b>לגמרי</b> ופתחו אותו מחדש. המשחק יעלה במצב בטוח.</div>'
    : '<div><b>הדפדפן לא מצליח להפעיל גרפיקה תלת-ממדית (WebGL) כרגע.</b></div>')
    + (isXbox ? '<div style="margin-top:12px;font-size:18px">באקס בוקס: אם סגירת Edge לא עזרה, הפעילו מחדש את הקונסולה: החזיקו את כפתור ה-Xbox בבקר ← "הפעל מחדש את הקונסולה" (Restart console).</div>' : '')
    + '<div style="margin-top:12px;font-size:18px"><a href="diag.html" style="color:#ffd86a">לדף בדיקת הגרפיקה</a></div>'
    + `<div style="margin-top:12px;font-size:15px;opacity:.75;direction:ltr">build ${BUILD} · safe ${lowMem()} · ${reason || 'no reason given'}</div>`;
  document.body.appendChild(el);
  setTimeout(() => el.querySelector('a')?.focus(), 50);
  return false;
}

// ================================================================ phones: landscape
export function setupMobile() {
  if (!isMobile) return;
  document.body.classList.add('mobile');
  const lock = () => {
    const el = document.documentElement;
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
    Promise.resolve(p).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  };
  addEventListener('pointerdown', lock, { once: true });
}

// ================================================================ gamepads (Xbox controller and others, "standard" mapping)
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
export function createGamepad() {
  // deadzone: how far a stick must move before it counts (changeable in the controls screen)
  const st = { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, down: new Set(), pressed: new Set(), used: false, deadzone: 0.25, id: '' };
  let prev = new Set(), padIndex = -1, rest = null, restN = 0, stuck = [], calib = 0;
  // radial deadzone for a stick, after removing the stick's resting offset (worn sticks drift a little)
  const stick = (x, y) => {
    const l = Math.hypot(x, y), d = st.deadzone;
    if (l < d) return [0, 0];
    const k = Math.min(1, (l - d) / (1 - d)) / l;
    return [x * k, y * k];
  };
  const reset = () => { rest = null; restN = 0; stuck = []; calib = 0.6; };
  st.calibrate = reset;   // "hands off the controller" recalibration
  addEventListener('gamepadconnected', () => { st.connected = true; padIndex = -1; reset(); });
  addEventListener('gamepaddisconnected', () => { padIndex = -1; reset(); });
  // pick the real controller: Xbox Edge can list extra entries (headset, remote, virtual pad)
  function choose(pads) {
    const real = pads.filter((p) => p && p.connected !== false);
    if (!real.length) return null;
    const cur = real.find((p) => p.index === padIndex);
    const active = real.find((p) => p.index !== padIndex && p.buttons.some((b) => b.pressed));
    if (active && (!cur || !cur.buttons.some((b) => b.pressed))) { padIndex = active.index; reset(); return active; }   // whichever pad presses a button wins
    if (cur) return cur;
    const best = real.find((p) => p.mapping === 'standard') || real[0];
    padIndex = best.index; reset();
    return best;
  }
  st.poll = (dt = 1 / 60) => {
    const p = choose(navigator.getGamepads ? [...navigator.getGamepads()] : []);
    st.pressed = new Set();
    if (!p) { st.connected = false; st.lx = st.ly = st.rx = st.ry = st.lt = st.rt = 0; st.down = new Set(); prev = new Set(); return st; }
    st.connected = true; st.id = p.id || '';
    const ax = [0, 1, 2, 3].map((i) => +p.axes[i] || 0);
    // calibration: average the resting stick position for a moment after connecting
    if (!rest) rest = [0, 0, 0, 0];
    if (calib > 0) {
      calib -= Math.min(dt, 0.1); restN++;
      for (let i = 0; i < 4; i++) rest[i] += (ax[i] - rest[i]) / restN;
      // an axis resting near ±1 is not a stick (e.g. a trigger reported as an axis): ignore it until it moves
      if (calib <= 0) stuck = rest.map((r) => Math.abs(r) > 0.6);
      st.lx = st.ly = st.rx = st.ry = 0;
    } else {
      const v = ax.map((x, i) => {
        if (stuck[i]) { if (Math.abs(x - rest[i]) > 0.5 && Math.abs(x) < 0.6) stuck[i] = false; else return 0; }
        const off = Math.abs(rest[i]) < 0.35 ? rest[i] : 0;   // remove a small resting drift
        return Math.max(-1, Math.min(1, x - off));
      });
      [st.lx, st.ly] = stick(v[0], v[1]);
      [st.rx, st.ry] = stick(v[2], v[3]);
    }
    const down = new Set();
    p.buttons.forEach((b, i) => { if (b.pressed || b.value > 0.5) down.add(i); });
    st.lt = p.buttons[6]?.value || 0; st.rt = p.buttons[7]?.value || 0;
    for (const b of down) if (!prev.has(b)) st.pressed.add(b);
    if (down.size || st.lx || st.ly || st.rx || st.ry) st.used = true;
    st.down = down; prev = down;
    return st;
  };
  st.isDown = (b) => st.down.has(b);
  st.hit = (b) => st.pressed.has(b);
  st.raw = () => { const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []; return pads.map((q) => `${q.index}: ${q.id.slice(0, 40)} · ${q.mapping || 'no mapping'} · axes ${[...q.axes].map((a) => a.toFixed(2)).join(' ')}`); };
  return st;
}

/** Move a highlight between the visible buttons of the open menu with the D-pad / left stick; A presses it. */
export function createMenuNav(containers) {
  let idx = 0, cool = 0, lastScope = null;
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const visible = (el) => el && !el.classList.contains('hidden') && shown(el);
  function scope() { for (const sel of containers) { const el = document.querySelector(sel); if (visible(el)) return el; } return null; }
  function items(sc) { return [...sc.querySelectorAll('button, a, select, input[type=checkbox], input[type=color], input[type=range]')].filter((b) => !b.disabled && shown(b)); }
  return function update(pad, dt) {
    const sc = scope();
    document.querySelectorAll('.pad-focus').forEach((e) => { if (!sc || !sc.contains(e)) e.classList.remove('pad-focus'); });
    if (!sc || !pad.connected) return false;
    const list = items(sc); if (!list.length) return false;
    if (sc !== lastScope) { idx = 0; lastScope = sc; }
    cool -= dt;
    const dir = pad.hit(BTN.DOWN) || pad.hit(BTN.RIGHT) || (cool <= 0 && (pad.ly > 0.6 || pad.lx > 0.6)) ? 1
      : pad.hit(BTN.UP) || pad.hit(BTN.LEFT) || (cool <= 0 && (pad.ly < -0.6 || pad.lx < -0.6)) ? -1 : 0;
    if (dir) { idx = (idx + dir + list.length) % list.length; cool = 0.25; }
    idx = Math.min(idx, list.length - 1);
    list.forEach((b, i) => b.classList.toggle('pad-focus', i === idx));
    const cur = list[idx];
    if (dir) cur.scrollIntoView?.({ block: 'nearest' });
    if (pad.hit(BTN.A)) {
      if (cur.type === 'checkbox') { cur.checked = !cur.checked; cur.dispatchEvent(new Event('change')); }
      else cur.click();
    }
    if (cur.type === 'range' && (pad.hit(BTN.RB) || pad.hit(BTN.LB))) { cur.value = +cur.value + (pad.hit(BTN.RB) ? 1 : -1) * (+cur.step || 0.05); cur.dispatchEvent(new Event('input')); }
    return true;
  };
}
