// Cel shading in the style of the anime's background paintings: light falls in
// a few flat bands, and shade turns cool (teal and blue) instead of grey.
// Works on any Lambert material, keeps shadow maps and fog.
import * as THREE from 'three';

export const SUN_I = 2.9;   // the sun's intensity everywhere (scene and impostor bakes)
const NOFLIP = THREE.ShaderChunk.normal_fragment_begin.replace(/normal\s*\*=\s*faceDirection;/g, '');
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(3)).join(',')})`;

// opts:
//  ao      vertex colour red = ambient occlusion (foliage), not colour
//  detail  how much the texture's light and dark dots move the band edges
//  noflip  keep normals on back faces (leaf cards with puff normals)
//  bands   [deep, shadow, lit] thresholds; soft = edge width
//  deep, shade multipliers for the two shade bands; lit + litAdd for the top band
export function celify(m, o = {}) {
  const deep = o.deep || [0.26, 0.4, 0.62], shade = o.shade || [0.5, 0.68, 0.88];
  const lit = o.lit || [1.1, 1.08, 0.92], litAdd = o.litAdd || [0.05, 0.05, 0.0];
  const [b0, b1, b2] = o.bands || [0.18, 0.4, 0.72];
  const soft = o.soft ?? 0.025, detail = o.detail ?? 0, ao = !!o.ao, mid = o.mid ?? 0.3;
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev.call(m, sh, r);
    if (o.noflip) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', NOFLIP);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float lw = 0.0;
        vec3 base = diffuseColor.rgb;
        float lumB = dot(base, vec3(0.2126, 0.7152, 0.0722));
        float lit = dot(reflectedLight.directDiffuse, vec3(0.2126, 0.7152, 0.0722)) / max(lumB, 1e-4) * PI / ${SUN_I.toFixed(2)};
        float t = lit;
        ${ao ? `#ifdef USE_COLOR
          float aoK = vColor.r; base /= max(aoK, 0.05); lumB /= max(aoK, 0.05);
          t = lit * 0.8 + (aoK - 0.72) * 0.9;
        #endif` : ''}
        ${detail ? `t += (lumB / max(dot(diffuse, vec3(0.2126, 0.7152, 0.0722)), 1e-3) - ${mid.toFixed(3)}) * ${detail.toFixed(3)};` : ''}
        float s0 = smoothstep(${(b0 - soft).toFixed(3)}, ${(b0 + soft).toFixed(3)}, t);
        float s1 = smoothstep(${(b1 - soft).toFixed(3)}, ${(b1 + soft).toFixed(3)}, t);
        float s2 = smoothstep(${(b2 - soft).toFixed(3)}, ${(b2 + soft).toFixed(3)}, t);
        vec3 c = mix(base * ${v3(deep)}, base * ${v3(shade)}, s0);
        c = mix(c, base, s1);
        c = mix(c, base * ${v3(lit)} + ${v3(litAdd)}, s2);
        outgoingLight = c * ${(o.gain ?? 1).toFixed(3)} + totalEmissiveRadiance;
      }
      #include <opaque_fragment>`);
  };
  const key = JSON.stringify(o);
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => prevKey() + 'cel' + key;
  return m;
}

// A cel-shaded material for buildings and props.
export function toon(color, o = {}) {
  const m = new THREE.MeshLambertMaterial({ color, map: o.map || null, vertexColors: !!o.vertexColors, side: o.side ?? THREE.FrontSide });
  return celify(m, { bands: [0.12, 0.34, 0.62], deep: [0.42, 0.5, 0.68], shade: [0.62, 0.7, 0.86], lit: [1.06, 1.04, 0.98], litAdd: [0.02, 0.02, 0], ...o.cel });
}
