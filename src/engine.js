// engine.js — renderer, painterly post-processing, lights and sky, shared by new pages (same look as the game).
// Includes every device safeguard: automatic quality, Xbox resolution cap, broken-picture guard, crash recovery.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { createWorld, envUniforms } from './world.js';
import { glyphUniforms } from './glyphs.js';
import { watchContext, createRenderGuard, quality, createAutoRes, setupMobile, checkWebGL } from './platform.js';

const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export function createEngine({ mount, fov = 55, name = 'page', fog = [160, 1900] } = {}) {
  const Q = quality();
  setupMobile();
  if (!checkWebGL()) throw new Error('WebGL is not available');
  const renderer = new (Q.webgl1 ? THREE.WebGL1Renderer : THREE.WebGLRenderer)({ antialias: Q.level === 'pc', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Q.pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = Q.shadow > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  mount.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf3d3a0, fog[0], fog[1]);
  const camera = new THREE.PerspectiveCamera(fov, innerWidth / innerHeight, 0.5, 7000);

  const canHalf = Q.halfFloat && renderer.capabilities.isWebGL2 && !!renderer.extensions.get('EXT_color_buffer_float');
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: Q.msaa, type: canHalf ? THREE.HalfFloatType : THREE.UnsignedByteType }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = Q.bloom ? new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.6, 0.45, 1.0) : null;
  if (bloom) composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const R = Q.painter || 1;
  const painter = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, res: { value: new THREE.Vector2(innerWidth, innerHeight) } },
    vertexShader: VS,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 res; varying vec2 vUv;
      #define R ${R}
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
  // colour grade; uTint lets a scene push the whole picture toward a colour (memories, darkness)
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTint: { value: new THREE.Color(1, 1, 1) }, uFade: { value: 0 }, uFadeCol: { value: new THREE.Color(0, 0, 0) } },
    vertexShader: VS,
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec3 uTint; uniform float uFade; uniform vec3 uFadeCol; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb; c = (c - 0.5) * 1.08 + 0.5;
        float l = dot(c, vec3(0.299, 0.587, 0.114)); c = mix(vec3(l), c, 1.18); c *= vec3(1.04, 1.0, 0.96) * uTint;
        float v = smoothstep(1.05, 0.35, length(vUv - 0.5) * 1.25);
        c = clamp(c, 0.0, 1.0) * mix(0.68, 1.0, v);
        gl_FragColor = vec4(mix(c, uFadeCol, uFade), 1.0);
      }`,
  });
  composer.addPass(grade);

  function resize() {
    if (Q.maxPixels) { const cap = Math.sqrt(Q.maxPixels / (innerWidth * innerHeight)); if (renderer.getPixelRatio() > cap) renderer.setPixelRatio(cap); }
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
    painter.uniforms.res.value.set(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  }
  addEventListener('resize', resize);
  resize();
  const fx = { painter: true, bloom: true, safeNoPainter: false, safeNoBloom: false };
  const applyFx = () => { painter.enabled = fx.painter && !fx.safeNoPainter; if (bloom) bloom.enabled = fx.bloom && !fx.safeNoBloom; };
  const autoRes = createAutoRes(Q, (s) => {
    if (Math.abs(s.ratio - renderer.getPixelRatio()) > 0.01) { renderer.setPixelRatio(s.ratio); resize(); }
    fx.painter = s.painter; fx.bloom = s.bloom; applyFx();
  });
  watchContext(renderer);
  let useComposer = !Q.direct;
  const guard = createRenderGuard(renderer, [
    () => { fx.safeNoPainter = true; applyFx(); },
    () => { composer.reset(new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType })); },
    () => { fx.safeNoBloom = true; applyFx(); },
    () => { useComposer = false; },
    () => { renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((mt) => { mt.needsUpdate = true; }); }); },
  ], name);

  const hemi = new THREE.HemisphereLight(0xa8d8ff, 0xe0a070, 0.6);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.8);
  sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow || 512, Q.shadow || 512);
  Object.assign(sun.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 1, far: 1500 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
  scene.add(hemi, sun, sun.target);

  const world = createWorld(scene, { groundSeg: Q.groundSeg });
  /** the same matte, painted look as the game, for everything added so far (call again after adding more) */
  function paintScene() {
    scene.traverse((o) => {
      for (const mt of o.material ? [].concat(o.material) : []) {
        if (!mt.isMeshStandardMaterial || mt.userData.keepFlat || mt.userData.painted) continue;
        mt.userData.painted = true; mt.flatShading = false;
        if (mt.metalness < 0.5) mt.roughness = Math.max(mt.roughness, 0.8); else { mt.metalness = 0.6; mt.roughness = Math.max(mt.roughness, 0.4); }
        mt.needsUpdate = true;
      }
    });
  }
  paintScene();

  // ---- sky for an hour of the day (0–24); dark > 0 darkens the sky toward the eclipse
  const C = (h) => new THREE.Color(h);
  const SKY = { dayTop: C(0x5aaed6), dayBot: C(0xffcf9e), setTop: C(0x56408e), setBot: C(0xff9256), nightTop: C(0x03040c), nightBot: C(0x1c1838), darkTop: C(0x0a0418), darkBot: C(0x2a1040) };
  const tA = new THREE.Color(), tB = new THREE.Color(), sunDir = new THREE.Vector3();
  function updateSky(hour, focus, dark = 0) {
    const a = (hour - 6) / 12 * Math.PI, elev = Math.sin(a);
    sunDir.set(Math.cos(a), elev, -0.35).normalize();
    const dayF = THREE.MathUtils.smoothstep(elev, -0.12, 0.3) * (1 - dark * 0.85), setF = 1 - THREE.MathUtils.smoothstep(Math.abs(elev), 0, 0.35);
    tA.copy(SKY.nightTop).lerp(SKY.dayTop, dayF).lerp(SKY.setTop, setF * 0.6).lerp(SKY.darkTop, dark);
    tB.copy(SKY.nightBot).lerp(SKY.dayBot, dayF).lerp(SKY.setBot, setF * 0.75).lerp(SKY.darkBot, dark);
    const sky = world.sky;
    sky.uniforms.top.value.copy(tA); sky.uniforms.bottom.value.copy(tB); sky.uniforms.sunDir.value.copy(sunDir);
    sky.uniforms.sunCol.value.setHex(dark > 0.5 ? 0x6a2aff : 0xffc070).multiplyScalar(Math.max(dayF, dark * 0.6));
    scene.fog.color.copy(tB);
    sky.group.position.copy(camera.position);
    sky.sunMesh.position.copy(sunDir).multiplyScalar(2500); sky.moonMesh.position.copy(sunDir).multiplyScalar(-2500); sky.moonMesh.lookAt(camera.position);
    sky.starMat.opacity = 1 - dayF;
    sky.cloudMat.color.setHex(0xffffff).lerp(C(0xffa070), setF * 0.6).multiplyScalar(0.25 + 0.75 * dayF);
    const night = elev < -0.05, dir = night ? sky.moonMesh.position.clone().normalize() : sunDir;
    sun.position.copy(focus).addScaledVector(dir, 700); sun.target.position.copy(focus);
    if (night) { sun.color.setHex(0x9fb4ff); sun.intensity = 0.8; } else { sun.color.setHex(0xff9a5a).lerp(C(0xffe4bc), dayF); sun.intensity = 0.75 + 1.0 * dayF; }
    if (dark > 0) { sun.color.lerp(C(0x8a5aff), dark); sun.intensity *= 1 - dark * 0.45; }
    hemi.intensity = 0.55 + 0.45 * dayF; hemi.color.copy(tA).lerp(C(0xbfe4ff), 0.5);
    glyphUniforms.uGlow.value = 1.1 + 1.6 * (1 - dayF); envUniforms.uSun.value = dayF;
  }

  function render() {
    autoRes();
    if (useComposer) composer.render(); else renderer.render(scene, camera);
    guard();
  }
  return { Q, renderer, scene, camera, composer, grade, sun, hemi, world, updateSky, render, paintScene, resize };
}
