// controls.js — player-changeable key bindings (keyboard + controller) and phone button size, saved in the browser.
const KEY = 'blackPyramid.controls.v1';
export const ACTIONS = [
  { id: 'fwd', name: 'הליכה קדימה', key: 'KeyW', pad: null },
  { id: 'back', name: 'הליכה אחורה', key: 'KeyS', pad: null },
  { id: 'left', name: 'סיבוב שמאלה', key: 'KeyA', pad: null },
  { id: 'right', name: 'סיבוב ימינה', key: 'KeyD', pad: null },
  { id: 'walk', name: 'הליכה קדימה (כפתור בבקר)', key: null, pad: 6 },
  { id: 'run', name: 'ריצה (בבקר: גם בלי מקל)', key: 'ShiftLeft', pad: 7 },
  { id: 'jump', name: 'קפיצה', key: 'Space', pad: 1 },
  { id: 'action', name: 'פעולה ושיחה', key: 'KeyE', pad: 0 },
  { id: 'journal', name: 'יומן', key: 'KeyJ', pad: 8 },
  { id: 'shoot', name: 'קרן שמש (בקרב)', key: 'KeyF', pad: 2 },
  { id: 'burst', name: 'גל אור (בקרב)', key: 'KeyR', pad: 3 },
];
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3 (לחיצה על מקל שמאלי)', 'R3 (לחיצה על מקל ימני)', '↑', '↓', '←', '→'];
export const MOVE_OPTS = { left: 'מקל שמאלי', right: 'מקל ימני', dpad: 'חצים (D-pad)' };
export const LOOK_OPTS = { right: 'מקל ימני', left: 'מקל שמאלי', dpad: 'חצים (D-pad)', none: 'כבוי' };
export const SPEED_OPTS = { 0.5: 'איטית', 1: 'רגילה', 1.6: 'מהירה' };
export const DEADZONE_OPTS = { 0.15: 'קטן', 0.25: 'רגיל', 0.35: 'גדול', 0.45: 'גדול מאוד' };
export function padName(i) { return i == null ? 'לפי הגדרת ההליכה' : PAD_NAMES[i] || `כפתור ${i}`; }
export function keyName(code) {
  if (!code) return '—';
  const fixed = { Space: 'רווח', ShiftLeft: 'Shift', ShiftRight: 'Shift ימני', ControlLeft: 'Ctrl', ControlRight: 'Ctrl ימני', AltLeft: 'Alt', Enter: 'Enter', Tab: 'Tab',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'Backspace', CapsLock: 'CapsLock' };
  return fixed[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export function createControls(opts = {}) {
  let saved = load();
  // Xbox defaults (the player's own choice): the lower (right) stick walks, A also jumps, LT walks, RT runs
  const defPad = (a) => (opts.console && a.id === 'jump' ? 0 : a.pad);
  const bind = {};
  const rebuild = () => {
    for (const a of ACTIONS) bind[a.id] = { key: saved.keys?.[a.id] ?? a.key, pad: a.pad == null ? null : (saved.pads?.[a.id] ?? defPad(a)) };
  };
  rebuild();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ } };
  const ctl = {
    bind,
    touchSize: saved.touchSize || 1,
    get padMove() { return saved.padMove || (opts.console ? 'right' : 'left'); },
    get padLook() { return saved.padLook || (opts.console ? 'dpad' : 'right'); },
    /** A does both: talk/act when something is near, otherwise jump */
    get smartA() { return bind.jump.pad === bind.action.pad; },
    get invertY() { return !!saved.invertY; },
    get lookSpeed() { return saved.lookSpeed || 1; },
    get deadzone() { return saved.deadzone || 0.25; },
    /** cycle a controller option to its next value (buttons that cycle work well with a controller) */
    cycle(name) {
      const lists = { padMove: Object.keys(MOVE_OPTS), padLook: Object.keys(LOOK_OPTS), lookSpeed: Object.keys(SPEED_OPTS).map(Number), deadzone: Object.keys(DEADZONE_OPTS).map(Number) };
      if (name === 'invertY') saved.invertY = !saved.invertY;
      else { const l = lists[name], cur = ctl[name]; saved[name] = l[(l.indexOf(cur) + 1) % l.length]; }
      // walking and camera can't share the same stick: move the camera to the other one
      if (name === 'padMove' && ctl.padLook === ctl.padMove) saved.padLook = ctl.padMove === 'right' ? 'left' : 'right';
      if (name === 'padLook' && ctl.padLook === ctl.padMove) saved.padMove = ctl.padLook === 'left' ? 'right' : 'left';
      save();
    },
    /** stick / D-pad reading for walking and for the camera, following the player's choice */
    moveAxes(gp) {
      if (ctl.padMove === 'right') return [gp.rx, gp.ry];
      if (ctl.padMove === 'dpad') return [(gp.isDown(15) ? 1 : 0) - (gp.isDown(14) ? 1 : 0), (gp.isDown(13) ? 1 : 0) - (gp.isDown(12) ? 1 : 0)];
      return [gp.lx, gp.ly];
    },
    lookAxes(gp) {
      const k = ctl.lookSpeed, iy = ctl.invertY ? -1 : 1;
      if (ctl.padLook === 'none') return [0, 0];
      if (ctl.padLook === 'dpad') return [((gp.isDown(15) ? 1 : 0) - (gp.isDown(14) ? 1 : 0)) * k, ((gp.isDown(13) ? 1 : 0) - (gp.isDown(12) ? 1 : 0)) * k * iy];
      const [x, y] = ctl.padLook === 'left' ? [gp.lx, gp.ly] : [gp.rx, gp.ry];
      return [x * k, y * k * iy];
    },
    /** physical key → the built-in key the game understands (so all game code keeps using the default names) */
    key(code) {
      for (const a of ACTIONS) if (bind[a.id].key === code) return a.key;
      if (ACTIONS.some((a) => a.key === code && bind[a.id].key !== code)) return `Unbound:${code}`;   // default key now used elsewhere
      return code;
    },
    pad(id) { return bind[id].pad; },
    setKey(id, code) {
      saved.keys = saved.keys || {};
      for (const a of ACTIONS) if (a.id !== id && bind[a.id].key === code) saved.keys[a.id] = bind[id].key;   // swap if already used
      saved.keys[id] = code; rebuild(); save();
    },
    setPad(id, b) {
      saved.pads = saved.pads || {};
      const shareOk = (x, y) => (x === 'jump' && y === 'action') || (x === 'action' && y === 'jump');   // smart A
      for (const a of ACTIONS) if (a.id !== id && a.pad != null && bind[a.id].pad === b && !shareOk(id, a.id)) saved.pads[a.id] = bind[id].pad;
      saved.pads[id] = b; rebuild(); save();
    },
    setTouchSize(v) { saved.touchSize = ctl.touchSize = v; save(); },
    reset() { saved = {}; ctl.touchSize = 1; rebuild(); save(); },
  };
  return ctl;
}
