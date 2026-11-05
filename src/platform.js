// platform.js — devices: phones, consoles (Xbox Edge), quality levels, gamepads, on-screen errors.
const UA = navigator.userAgent || '';
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
  console: { pixelRatio: 1, minRatio: 0.6, msaa: 0, halfFloat: true, painter: 2, bloom: true, shadow: 2048, groundSeg: 300 },
  phone: { pixelRatio: 1.5, minRatio: 0.6, msaa: 0, halfFloat: true, painter: 2, bloom: true, shadow: 1024, groundSeg: 240 },
};
export function quality() {
  try { localStorage.removeItem('blackPyramid.quality'); } catch { /* old manual setting is no longer used */ }
  const p = PROFILES[device];
  return { level: device, ...p, pixelRatio: Math.min(window.devicePixelRatio || 1, p.pixelRatio) };
}
/** Dynamic resolution: call tick() every frame; apply(ratio) is called when the render scale should change. */
export function createAutoRes(Q, apply) {
  let r = Q.pixelRatio, acc = 0, n = 0, warm = 3, last = performance.now();
  return function tick() {
    const now = performance.now(), d = (now - last) / 1000; last = now;
    if (d > 0.25 || document.hidden) return;   // tab switch / loading hitch: ignore
    acc += d; n++;
    if (acc < 1.2) return;
    const ms = (acc / n) * 1000; acc = 0; n = 0;
    if (warm > 0) { warm--; return; }
    let nr = r;
    if (ms > 22) nr = Math.max(Q.minRatio, r - (ms > 34 ? 0.2 : 0.1));
    else if (ms < 15) nr = Math.min(Q.pixelRatio, r + 0.05);
    if (Math.abs(nr - r) > 0.01) { r = nr; apply(r); }
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
    el.querySelector('pre').textContent += `${msg}\n[${UA}]\n`;
  };
  addEventListener('error', (e) => show(`${e.message || e} @ ${e.filename || ''}:${e.lineno || ''}`));
  addEventListener('unhandledrejection', (e) => show(`Promise: ${e.reason && (e.reason.stack || e.reason.message) || e.reason}`));
  return show;
}
/** true if the browser can draw 3D; otherwise shows a clear message */
export function checkWebGL() {
  try {
    const c = document.createElement('canvas');
    if (c.getContext('webgl2') || c.getContext('webgl')) return true;
  } catch { /* fall through */ }
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#140a02;color:#f6e7c8;font:20px/1.6 Arial,sans-serif;text-align:center;padding:24px;direction:rtl;z-index:100';
  el.textContent = 'הדפדפן הזה לא תומך בגרפיקה תלת-ממדית (WebGL). נסו דפדפן אחר, למשל Microsoft Edge או Chrome.';
  document.body.appendChild(el);
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
  try { if ('gamepadInputEmulation' in navigator) navigator.gamepadInputEmulation = 'gamepad'; } catch { /* Xbox Edge only */ }
  const st = { connected: false, lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, down: new Set(), pressed: new Set(), used: false };
  let prev = new Set();
  const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
  addEventListener('gamepadconnected', () => { st.connected = true; });
  st.poll = () => {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const p = pads[0];
    st.pressed = new Set();
    if (!p) { st.connected = false; st.lx = st.ly = st.rx = st.ry = st.lt = st.rt = 0; st.down = new Set(); prev = new Set(); return st; }
    st.connected = true;
    st.lx = dz(p.axes[0] || 0); st.ly = dz(p.axes[1] || 0); st.rx = dz(p.axes[2] || 0); st.ry = dz(p.axes[3] || 0);
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
    if (pad.hit(BTN.A)) {
      if (cur.type === 'checkbox') { cur.checked = !cur.checked; cur.dispatchEvent(new Event('change')); }
      else cur.click();
    }
    if (cur.type === 'range' && (pad.hit(BTN.RB) || pad.hit(BTN.LB))) { cur.value = +cur.value + (pad.hit(BTN.RB) ? 1 : -1) * (+cur.step || 0.05); cur.dispatchEvent(new Event('input')); }
    return true;
  };
}
