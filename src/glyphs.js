// glyphs.js — black stone material whose gold, glowing hieroglyphs are drawn entirely in the shader.
// Works for any 4-sided cone/frustum whose corners lie on the local X/Z axes (pyramids, obelisks).
import * as THREE from 'three';

export const glyphUniforms = { uTime: { value: 0 }, uGlow: { value: 2 } };

const GLSL_LIB = /* glsl */`
uniform float uTime; uniform float uGlow; varying vec3 vLPos;
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float glyph(vec2 p, float id){
  float d = 10.0;
  if (id < 1.0) {            // ankh
    d = abs(length((p - vec2(0.0, 0.2)) * vec2(1.0, 0.8)) - 0.1);
    d = min(d, seg(p, vec2(0.0, 0.1), vec2(0.0, -0.38)));
    d = min(d, seg(p, vec2(-0.2, 0.02), vec2(0.2, 0.02)));
  } else if (id < 2.0) {     // eye of Horus
    d = abs(length(p * vec2(1.0, 2.2)) - 0.26);
    d = min(d, max(length(p) - 0.07, 0.0));
    d = min(d, seg(p, vec2(-0.3, 0.17), vec2(0.3, 0.2)));
    d = min(d, seg(p, vec2(0.02, -0.12), vec2(-0.05, -0.36)));
    d = min(d, seg(p, vec2(0.12, -0.1), vec2(0.28, -0.32)));
  } else if (id < 3.0) {     // sun disk with rays
    float r = length(p); float a = atan(p.y, p.x);
    d = abs(r - 0.13); d = min(d, max(r - 0.05, 0.0));
    float ar = (fract(a / 6.28318 * 10.0 + 0.5) - 0.5) * 0.628318;
    d = min(d, max(abs(r - 0.3) - 0.08, abs(sin(ar)) * r));
  } else if (id < 4.0) {     // water
    for (int k = 0; k < 3; k++) {
      float y0 = -0.22 + 0.22 * float(k);
      float zz = y0 + 0.07 * (abs(fract(p.x * 4.0) * 2.0 - 1.0) * 2.0 - 1.0);
      d = min(d, max(abs(p.y - zz) * 0.8, abs(p.x) - 0.36));
    }
  } else if (id < 5.0) {     // scarab
    d = abs(length((p - vec2(0.0, -0.05)) * vec2(1.5, 1.0)) - 0.22);
    d = min(d, abs(length(p - vec2(0.0, 0.24)) - 0.07));
    d = min(d, seg(p, vec2(0.0, 0.17), vec2(0.0, -0.27)));
    d = min(d, seg(p, vec2(-0.14, 0.05), vec2(-0.34, 0.15))); d = min(d, seg(p, vec2(0.14, 0.05), vec2(0.34, 0.15)));
    d = min(d, seg(p, vec2(-0.13, -0.15), vec2(-0.32, -0.3))); d = min(d, seg(p, vec2(0.13, -0.15), vec2(0.32, -0.3)));
  } else if (id < 6.0) {     // pyramid
    d = min(seg(p, vec2(-0.32, -0.28), vec2(0.32, -0.28)), min(seg(p, vec2(-0.32, -0.28), vec2(0.0, 0.3)), seg(p, vec2(0.32, -0.28), vec2(0.0, 0.3))));
    d = min(d, max(length(p - vec2(0.0, -0.02)) - 0.06, 0.0));
  } else if (id < 7.0) {     // falcon
    d = seg(p, vec2(0.0, 0.3), vec2(0.0, -0.3));
    d = min(d, seg(p, vec2(0.0, 0.1), vec2(-0.32, 0.25))); d = min(d, seg(p, vec2(0.0, 0.1), vec2(0.32, 0.25)));
    d = min(d, seg(p, vec2(-0.32, 0.25), vec2(-0.2, -0.05))); d = min(d, seg(p, vec2(0.32, 0.25), vec2(0.2, -0.05)));
    d = min(d, abs(length(p - vec2(0.0, 0.34)) - 0.06));
    d = min(d, seg(p, vec2(-0.1, -0.38), vec2(0.1, -0.38)));
  } else {                   // cartouche
    vec2 q = abs(p) - vec2(0.18, 0.32);
    d = abs(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.08);
    d = min(d, seg(p, vec2(-0.1, 0.15), vec2(0.1, 0.15)));
    d = min(d, max(length(p) - 0.05, 0.0));
    d = min(d, seg(p, vec2(-0.1, -0.15), vec2(0.1, -0.15)));
    d = min(d, seg(p, vec2(-0.2, -0.44), vec2(0.2, -0.44)));
  }
  return d;
}`;

/**
 * @param {object} o  H: height, half: half base width, top: half top width (0 for pyramid),
 *                    cellW/cellH: glyph cell size, gMin/gMax: glyph region (y), goldTop: y where gold cladding starts,
 *                    edge: width of glowing corner edges, course/block: stone block size
 */
export function makeGlyphMaterial(o) {
  const P = { top: 0, cellW: 8, cellH: 6.8, gMin: 8, gMax: o.H * 0.72, goldTop: o.H * 0.8, edge: 1.0, course: 2.6, block: 5.5, ...o };
  const f = (n) => Number(n).toFixed(4);
  const slant = Math.sqrt(1 + ((P.half - P.top) / P.H) ** 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.65, emissive: 0xffb02e, flatShading: true });
  mat.userData.keepFlat = true;
  const key = 'glyph-' + JSON.stringify(P);
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = glyphUniforms.uTime;
    shader.uniforms.uGlow = glyphUniforms.uGlow;
    shader.vertexShader = 'varying vec3 vLPos;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLPos = position;');
    shader.fragmentShader = GLSL_LIB + '\n' + shader.fragmentShader
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
      float pg = 0.0, pm = 0.0, ps = 0.0;
      {
        vec3 lp = vLPos;
        float y = lp.y; float ax = abs(lp.x), az = abs(lp.z);
        float faceId = step(0.0, lp.x) + 2.0 * step(0.0, lp.z);
        float u = (ax - az) * 0.70710678;
        float hw = mix(${f(P.half)}, ${f(P.top)}, clamp(y / ${f(P.H)}, 0.0, 1.0));
        float edgeDist = hw - abs(u);
        float edge = 1.0 - smoothstep(${f(P.edge * 0.45)}, ${f(P.edge)}, edgeDist);
        // stone courses in a brick bond
        float course = y / ${f(P.course)}; float row = floor(course);
        float bu = u / ${f(P.block)} + 0.5 * mod(row, 2.0); float col = floor(bu);
        float dl = min(fract(course), 1.0 - fract(course)) * ${f(P.course)};
        float du = min(fract(bu), 1.0 - fract(bu)) * ${f(P.block)};
        pm = 1.0 - smoothstep(0.05, 0.13, min(dl, du));
        ps = h12(vec2(row, col) + faceId * 17.0);
        // hieroglyph cells
        float cv = y / ${f(P.cellH)}; float crow = floor(cv);
        float cu = u / ${f(P.cellW)}; float ccol = floor(cu + 0.5);
        vec2 gp = vec2(fract(cu + 0.5) - 0.5, (fract(cv) - 0.5) * ${f(P.cellH * slant / P.cellW)});
        float inRegion = step(${f(P.gMin)}, y) * step(y, ${f(P.gMax)}) * step(${f(P.cellW * 0.6)}, edgeDist);
        float id = floor(h12(vec2(crow, ccol) + faceId * 31.0) * 8.0);
        float gd = glyph(gp * 1.15, id);
        float gl = (1.0 - smoothstep(0.022, 0.048, gd)) * inRegion;
        float dyl = min(fract(cv * 0.5), 1.0 - fract(cv * 0.5)) * ${f(P.cellH * 2)};
        float band = (1.0 - smoothstep(0.1, 0.26, dyl)) * step(${f(P.gMin - 1)}, y) * step(y, ${f(P.goldTop)});
        float dxl = min(fract(cu + 0.5), 1.0 - fract(cu + 0.5)) * ${f(P.cellW)};
        float sep = (1.0 - smoothstep(0.05, 0.13, dxl)) * inRegion * 0.45;
        float topC = smoothstep(${f(P.goldTop - 0.4)}, ${f(P.goldTop + 0.4)}, y);
        float topStripes = 0.6 + 0.4 * step(0.5, fract(y / 1.6));
        float baseTrim = 1.0 - smoothstep(0.15, 0.35, abs(y - 1.6));
        pg = max(max(edge, band), max(gl, sep));
        pg = max(pg, max(topC * topStripes * 0.8, baseTrim));
        vec3 stoneC = vec3(0.016, 0.016, 0.022) + ps * vec3(0.03, 0.027, 0.036);
        stoneC *= 1.0 - pm * 0.65;
        diffuseColor.rgb = mix(stoneC, vec3(0.95, 0.66, 0.22), clamp(pg, 0.0, 1.0));
      }`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
      {
        float yy = vLPos.y / ${f(P.H)};
        float pulse = 0.75 + 0.25 * sin(uTime * 1.6 - vLPos.y * 0.08);
        float wave = exp(-pow((yy - fract(uTime * 0.09)) * 22.0, 2.0));
        totalEmissiveRadiance = emissive * pg * pulse * uGlow * (1.0 + 1.6 * wave);
      }`);
  };
  return mat;
}
