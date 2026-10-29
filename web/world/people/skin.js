// The body's material: skin, the doll's painted-on underwear and the face, all
// worked out in the shader from the reference body's coordinates (paint.js).
// skinMaterial(look, land) -> material; material.userData.set(look) updates it.
// land: the reference body's landmarks (base.bin), the coordinates every
// person's paint is laid out in.
import * as THREE from 'three';
import { celify } from '../toon.js';
import { LIB, SKIN_CEL } from './paint.js';

export const UNDERWEAR = {
  tank: 'Tank and shorts',
  sport: 'Sports top and shorts',
  tee: 'Undershirt and briefs',
  suit: 'One-piece',
};

export function skinMaterial(look = {}, land) {
  const m = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const u = {
    uSkin: { value: new THREE.Color('#f6d2b8') }, uUnder: { value: new THREE.Color('#f2f0ee') }, uUnder2: { value: new THREE.Color('#9fb6d8') },
    uStyle: { value: 0 },
    uLand: { value: [land.chinY, land.hh, land.hw, land.eyeY, land.shY, land.waistY, land.hipJ, land.crotchY, land.chestY, land.faceZ || 0.1, 0, 0] },
  };
  const set = (lk = {}) => {
    const s = lk.skin || {}, uw = lk.underwear || {};
    u.uSkin.value.set(s.tone || '#f6d2b8');
    u.uUnder.value.set(uw.color || '#f2f0ee'); u.uUnder2.value.set(uw.trim || '#9fb6d8');
    u.uStyle.value = Object.keys(UNDERWEAR).indexOf(uw.style || 'tank');
  };
  set(look);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 canon; attribute vec4 part; attribute vec4 share; attribute float hide;
        varying vec3 vCanon; varying vec4 vPart; varying vec4 vShare; varying float vHide;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCanon = canon; vPart = part; vShare = share; vHide = hide;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vCanon; varying vec4 vPart; varying vec4 vShare; varying float vHide; vec4 vG = vec4(0.0);
        uniform vec3 uSkin, uUnder, uUnder2; uniform float uStyle; uniform float uLand[12];
        ${LIB}
        vec3 paintSkin() {
          vec3 col = uSkin;
          float chinY = uLand[0], hh = uLand[1], hw = uLand[2], eyeY = uLand[3], shY = uLand[4], waistY = uLand[5], hipJ = uLand[6], crotchY = uLand[7], chestY = uLand[8];
          float x = abs(vCanon.x), y = vCanon.y, trunk = step(vPart.x, 0.5), leg = step(1.5, vPart.x) * step(vPart.x, 2.5);
          // underwear
          float topY = uStyle < 1.5 ? (shY - 0.02 - 0.05 * smoothstep(0.0, 0.07, x) * step(0.0, vCanon.z)) : shY - 0.03;
          float bottomOfTop = uStyle == 1.0 ? chestY - 0.07 : waistY - 0.02;
          float top = trunk * aa(y - topY) * aa(bottomOfTop - y) * aa(vShare.x - 0.32);
          if (uStyle == 3.0) top = trunk * aa(y - (shY - 0.04 - 0.04 * smoothstep(0.0, 0.06, x))) * aa(vShare.x - 0.3);
          float shortsTop = waistY - 0.015;
          float legCut = uStyle == 2.0 || uStyle == 3.0 ? 0.04 : 0.12;
          float shorts = trunk * aa(y - shortsTop) + leg * aa(vPart.y - legCut) * aa(vShare.w - 0.4);
          float under = max(top, shorts);
          float trim = trunk * line(y, shortsTop - 0.008, 0.012) * shorts + leg * line(vPart.y, legCut - 0.008, 0.01) * shorts;
          col = mix(col, uUnder, under);
          col = mix(col, uUnder2, trim * (uStyle == 3.0 ? 0.0 : 1.0));
          // placeholder face: eyes
          float head = step(2.5, vPart.x) * step(0.0, vCanon.z);
          vec2 e = vec2(x - hw * 0.3, (y - eyeY) * 0.75);
          col = mix(col, vec3(0.12, 0.1, 0.14), head * aa(length(e) - hw * 0.085));
          return col;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vHide > 0.99) discard;
        diffuseColor.rgb = paintSkin();`);
  };
  m.customProgramCacheKey = () => 'skin1';
  celify(m, SKIN_CEL);
  m.userData.set = set;
  m.userData.u = u;
  return m;
}
