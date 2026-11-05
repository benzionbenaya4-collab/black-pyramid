// controls.js — player-changeable key bindings (keyboard + controller) and phone button size, saved in the browser.
const KEY = 'blackPyramid.controls.v1';
export const ACTIONS = [
  { id: 'fwd', name: 'הליכה קדימה', key: 'KeyW', pad: null },
  { id: 'back', name: 'הליכה אחורה', key: 'KeyS', pad: null },
  { id: 'left', name: 'סיבוב שמאלה', key: 'KeyA', pad: null },
  { id: 'right', name: 'סיבוב ימינה', key: 'KeyD', pad: null },
  { id: 'run', name: 'ריצה', key: 'ShiftLeft', pad: 7 },
  { id: 'jump', name: 'קפיצה', key: 'Space', pad: 1 },
  { id: 'action', name: 'פעולה ושיחה', key: 'KeyE', pad: 0 },
  { id: 'journal', name: 'יומן', key: 'KeyJ', pad: 8 },
  { id: 'shoot', name: 'קרן שמש (בקרב)', key: 'KeyF', pad: 2 },
  { id: 'burst', name: 'גל אור (בקרב)', key: 'KeyR', pad: 3 },
];
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'L3 (לחיצה על מקל שמאלי)', 'R3 (לחיצה על מקל ימני)', '↑', '↓', '←', '→'];
export function padName(i) { return i == null ? 'מקל שמאלי' : PAD_NAMES[i] || `כפתור ${i}`; }
export function keyName(code) {
  if (!code) return '—';
  const fixed = { Space: 'רווח', ShiftLeft: 'Shift', ShiftRight: 'Shift ימני', ControlLeft: 'Ctrl', ControlRight: 'Ctrl ימני', AltLeft: 'Alt', Enter: 'Enter', Tab: 'Tab',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: 'Backspace', CapsLock: 'CapsLock' };
  return fixed[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
export function createControls() {
  let saved = load();
  const bind = {};
  const rebuild = () => {
    for (const a of ACTIONS) bind[a.id] = { key: saved.keys?.[a.id] ?? a.key, pad: a.pad == null ? null : (saved.pads?.[a.id] ?? a.pad) };
  };
  rebuild();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ } };
  const ctl = {
    bind,
    touchSize: saved.touchSize || 1,
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
      for (const a of ACTIONS) if (a.id !== id && a.pad != null && bind[a.id].pad === b) saved.pads[a.id] = bind[id].pad;
      saved.pads[id] = b; rebuild(); save();
    },
    setTouchSize(v) { saved.touchSize = ctl.touchSize = v; save(); },
    reset() { saved = {}; ctl.touchSize = 1; rebuild(); save(); },
  };
  return ctl;
}
