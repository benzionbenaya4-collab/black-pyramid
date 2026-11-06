// cinema.js — cinematic camera: letterbox bars, scripted camera shots with captions, and conversation framing
// (the camera cuts between over-the-shoulder shots depending on who is speaking).
import * as THREE from 'three';

const $ = (id) => document.getElementById(id);

export function createCinema() {
  const bars = $('letterbox'), cap = $('cine-caption'), skipEl = $('cine-skip');
  const look = new THREE.Vector3(), tPos = new THREE.Vector3(), tLook = new THREE.Vector3(), curLook = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let mode = null;                     // null | 'talk' | 'shots'
  let talk = null;                     // { npc: Vector3, h, stand, speaker } or { solo: true, speaker }
  let shots = null, idx = 0, st = 0, resolve = null, fresh = true;

  const showBars = (on) => bars.classList.toggle('on', on);
  const setCaption = (t) => { if (t) { cap.textContent = t; cap.classList.remove('hidden'); } else cap.classList.add('hidden'); };
  const V = (a, ctx) => (typeof a === 'function' ? a(ctx) : new THREE.Vector3(...a));

  function beginTalk(npc) { if (mode === 'shots') return; mode = 'talk'; talk = npc ? { ...npc, speaker: null } : { solo: true, speaker: null }; showBars(true); fresh = true; }
  function endTalk() { if (mode === 'talk') { mode = null; talk = null; showBars(false); } }
  function speaker(sp) { if (talk) talk.speaker = sp; }
  function talkTarget() { return mode === 'talk' && talk && !talk.solo ? talk : null; }

  /** Play a list of shots: { from, to?, look, lookTo?, dur, caption?, start?(), update?(k, dt) } */
  function play(list) {
    return new Promise((res) => {
      mode = 'shots'; shots = list; idx = 0; st = 0; resolve = res; fresh = true;
      showBars(true); setCaption(list[0].caption); skipEl.classList.remove('hidden');
      list[0].start?.();
    });
  }
  function finish() {
    if (mode !== 'shots') return;
    for (let i = idx; i < shots.length; i++) { if (i > idx) shots[i].start?.(); shots[i].update?.(1, 0); shots[i].end?.(); }
    mode = null; shots = null; showBars(false); setCaption(''); skipEl.classList.add('hidden');
    const r = resolve; resolve = null; r?.();
  }
  skipEl.addEventListener('click', () => finish());

  /** Moves the camera when a cinematic is running. Returns true if it controlled the camera. */
  function apply(camera, dt, ctx) {
    if (!mode) return false;
    if (mode === 'shots') {
      const s = shots[idx]; st += dt;
      const k = Math.min(1, st / s.dur), e = k * k * (3 - 2 * k);
      const p0 = V(s.from, ctx), p1 = V(s.to || s.from, ctx), l0 = V(s.look, ctx), l1 = V(s.lookTo || s.look, ctx);
      camera.position.lerpVectors(p0, p1, e); look.lerpVectors(l0, l1, e); camera.lookAt(look);
      s.update?.(k, dt);
      if (st >= s.dur) {
        s.end?.();
        idx++; st = 0;
        if (idx >= shots.length) { mode = null; shots = null; showBars(false); setCaption(''); skipEl.classList.add('hidden'); const r = resolve; resolve = null; r?.(); }
        else { setCaption(shots[idx].caption); shots[idx].start?.(); }
      }
      return true;
    }
    // conversation framing
    const hero = ctx.heroPos, H = ctx.heroH, sp = talk.speaker, S = ctx.talkScale ?? 1;   // talkScale: smaller characters, closer camera
    if (sp === 'sethar') {                                           // the villain's voice: look past the hero at the pyramid
      const d = new THREE.Vector3(-hero.x, 0, -hero.z).normalize();
      tPos.copy(hero).addScaledVector(d, -42).addScaledVector(up, 24); tLook.set(0, 85, 0);
    } else if (talk.solo) {                                          // the hero alone: a 3/4 front shot
      const f = new THREE.Vector3(Math.sin(ctx.heroFacing), 0, Math.cos(ctx.heroFacing)), side = new THREE.Vector3(f.z, 0, -f.x);
      tPos.copy(hero).addScaledVector(f, 34 * S).addScaledVector(side, 14 * S).addScaledVector(up, H * 0.75);
      tLook.copy(hero).addScaledVector(up, H * 0.6);
    } else {
      const dir = new THREE.Vector3(talk.npc.x - hero.x, 0, talk.npc.z - hero.z).normalize(), side = new THREE.Vector3(dir.z, 0, -dir.x);
      if (sp === 'kharu') {                                          // reverse shot on the hero's face
        tPos.copy(hero).addScaledVector(dir, 32 * S).addScaledVector(side, 9 * S).addScaledVector(up, H * 0.72);
        tLook.copy(hero).addScaledVector(up, H * 0.64);
      } else if (sp && sp !== 'memory') {                            // over the hero's shoulder at the speaker
        tPos.copy(hero).addScaledVector(dir, -24 * S).addScaledVector(side, 13 * S).addScaledVector(up, H * 0.95);
        tLook.copy(talk.npc).addScaledVector(up, talk.h * 0.62);
      } else {                                                       // two-shot from the side
        const mid = new THREE.Vector3().lerpVectors(hero, talk.npc, 0.5);
        tPos.copy(mid).addScaledVector(side, 55 * S).addScaledVector(up, 15 * S); tLook.copy(mid).addScaledVector(up, 8 * S);
      }
    }
    if (fresh) { curLook.copy(tLook); fresh = false; }
    const k = Math.min(1, dt * 3.2);
    camera.position.lerp(tPos, k); curLook.lerp(tLook, k); camera.lookAt(curLook);
    return true;
  }

  return { play, finish, apply, beginTalk, endTalk, speaker, talkTarget, get active() { return mode !== null; }, get playing() { return mode === 'shots'; } };
}
