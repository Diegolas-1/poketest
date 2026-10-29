// The catalogue's patterns (catalog.json: pattern.type and its params) as shader
// code for paint.js: patternGLSL(pattern) -> statements that change `col` (which
// starts as the main colour). Coordinates: P = vG.xy (shells and tubes: u round
// the part, v along it, metres on the reference body; uP[0] = (hem, top, -, -)
// canonical heights the garment spans, for placements like "lower half").
const ROLE = { main: 'uMain', second: 'uSecond', accent: 'uAccent', trim: 'uTrim' };
const role = (r, d = 'second') => ROLE[r] || ROLE[d];
const f = (x) => (+x).toFixed(4);
const SCALE = { small: 0.6, medium: 1, large: 1.6 };

export function patternGLSL(p = {}) {
  const t = p.type || 'solid';
  const k = SCALE[p.scale] ?? 1;
  // a garment height span in metres (for stripe widths given as fractions of it)
  const span = '(max(uP[0].y - uP[0].x, 0.15))';
  const where = (pl) => {
    switch (pl) {
      case 'lower_half': return `step(P.y, mix(uP[0].x, uP[0].y, 0.5))`;
      case 'band_hem': case 'hem': return `step(P.y, uP[0].x + ${span} * 0.22)`;
      case 'band_chest': case 'chest_and_hem': return `(band(P.y, mix(uP[0].x, uP[0].y, 0.55), mix(uP[0].x, uP[0].y, 0.8)) + (${pl === 'chest_and_hem' ? 1 : 0}.0) * step(P.y, uP[0].x + ${span} * 0.15))`;
      case 'sleeves': case 'hem_and_sleeves': return `(step(0.5, vG.z) * step(vG.z, 2.5))`;
      case 'side_seam': return `1.0`;
      default: return '1.0';
    }
  };
  switch (t) {
    case 'solid': return '';
    case 'stripes_h': case 'breton': {
      const w = (p.width ?? 0.06), gap = (p.gap ?? w), c = role(p.colour);
      if (p.count && p.count !== 'all') {
        // a few stripes from the hem up (or in the band)
        const n = +p.count;
        return `{ float y0 = uP[0].x + ${span} * ${f(p.placement === 'band_chest' ? 0.55 : 0.05)}; float s = 0.0;
          for (int i = 0; i < ${n}; i++) { float c0 = y0 + float(i) * ${span} * ${f(w + gap)}; s = max(s, band(P.y, c0, c0 + ${span} * ${f(w)})); }
          col = mix(col, ${c}, s * (vG.z > 4.5 ? 1.0 : 1.0)); }`;
      }
      const yoke = p.plain_yoke ? `* step(P.y, mix(uP[0].x, uP[0].y, 0.72))` : '';
      return `col = mix(col, ${c}, stripes(P.y, ${f(Math.max(0.012, (w + gap) * 0.5))}, ${f(Math.max(0.005, w * 0.5))}) * ${where(p.placement)} ${yoke});`;
    }
    case 'stripes_v': case 'pinstripe': {
      const w = p.width ?? (t === 'pinstripe' ? 0.008 : 0.03), gap = p.gap ?? 0.04, c = role(p.colour);
      if (p.placement === 'side_seam') {
        const n = +p.count || 2;
        return `{ float sd = abs(abs(P.x) - 0.11); float s = 0.0; for (int i = 0; i < ${n}; i++) s = max(s, line(sd, ${f(w * 0.3)} * (float(i) * 2.0 - float(${n - 1})), ${f(w * 0.25)}));
          col = mix(col, ${c}, s * step(vG.z, 0.5) + line(abs(P.x), ${f(0.065)}, ${f(w * 0.25)}) * step(2.5, vG.z) * step(vG.z, 4.5)); }`;
      }
      return `col = mix(col, ${c}, stripes(P.x, ${f(Math.max(0.01, w + gap) * 0.5)}, ${f(Math.max(0.002, w * 0.4))}));`;
    }
    case 'plaid': case 'tartan': {
      const g = role(p.ground, 'main'), b = (p.bars || ['second', 'accent']).map((r) => role(r));
      const s = 0.06 * k;
      return `{ vec3 g0 = ${g}; float a = stripes(P.x, ${f(s)}, ${f(s * 0.35)}), c = stripes(P.y, ${f(s)}, ${f(s * 0.35)});
        col = mix(g0, ${b[0]}, max(a, c) * 0.85); col = mix(col, ${b[0]} * 0.75, a * c);
        col = mix(col, ${b[1] || b[0]}, max(line(fract(P.x / ${f(s)} + 0.5), 0.5, 0.06), line(fract(P.y / ${f(s)} + 0.5), 0.5, 0.06)) * ${t === 'tartan' ? '1.0' : '0.0'}); }`;
    }
    case 'gingham': {
      const g = role(p.ground, 'second'), b = role((p.bars || ['main'])[0], 'main'), s = 0.022 * k;
      return `{ float a = stripes(P.x, ${f(s)}, ${f(s * 0.5)}), c = stripes(P.y, ${f(s)}, ${f(s * 0.5)}); col = mix(${g}, ${b}, (a + c) * 0.5); }`;
    }
    case 'polka': case 'stars': case 'floral_small': {
      const c = role(p.colour || (p.colours || [])[0] || 'accent'), r = p.dot === 'medium' ? 0.008 : 0.005, per = p.spacing === 'tight' ? 0.028 : 0.042;
      const shape = t === 'stars' ? `star(fract(P / ${f(per)} + vec2(0.5 * mod(floor(P.y / ${f(per)}), 2.0), 0.0)) * ${f(per)}, vec2(${f(per / 2)}), ${f(r * 1.6)})`
        : t === 'floral_small' ? `flower(fract(P / ${f(per)} + vec2(0.5 * mod(floor(P.y / ${f(per)}), 2.0), 0.0)) * ${f(per)}, vec2(${f(per / 2)}), ${f(r * 1.6)}, 5.0)`
        : `dotsHex(P, ${f(per)}, ${f(r)})`;
      return `col = mix(col, ${c}, ${shape});`;
    }
    case 'checker': return `col = mix(col, ${role((p.colours || [])[1] || 'second')}, checker(P, ${f(0.03 * k)}));`;
    case 'houndstooth': {
      const s = 0.012 * k;
      return `{ vec2 q = P / ${f(s)}; vec2 i = floor(q), fr = fract(q); float m = mod(i.x + i.y, 2.0); float tooth = step(fr.x + fr.y, 1.0) * (1.0 - m) + m * step(0.5, fr.y) * step(fr.x, 0.5);
        col = mix(col, ${role((p.colours || [])[1] || 'second')}, clamp(checker(P, ${f(s)}) * 0.6 + tooth * 0.4, 0.0, 1.0)); }`;
    }
    case 'argyle': {
      const s = 0.05 * k;
      return `{ vec2 q = P / ${f(s)}; vec2 d = abs(fract(vec2(q.x + q.y, q.x - q.y) * 0.5) - 0.5); float dia = step(max(d.x, d.y), 0.25);
        col = mix(col, ${role((p.colours || [])[0] || 'second')}, dia); col = mix(col, ${role((p.colours || [])[1] || 'accent')}, line(fract(q.x + 0.5), 0.5, 0.05) * 0.8); }`;
    }
    case 'camo': {
      const cs = (p.colours || ['main', 'second', 'accent']).map((r) => role(r)), s = p.blob_scale === 'small' ? 0.03 : 0.05;
      return `col = mix(col, ${cs[1]}, camo(P, ${f(s)}, 0.42)); col = mix(col, ${cs[2] || cs[1]}, camo(P + 3.7, ${f(s * 0.8)}, 0.34));`;
    }
    case 'splatter': {
      const cs = (p.colours || ['second', 'accent']).map((r) => role(r)), cov = p.coverage ?? 0.15;
      return `{ float n = noise2(P / 0.035) * 0.7 + noise2(P / 0.012) * 0.3; col = mix(col, ${cs[0]}, aa(${f(1 - cov * 0.8)} - n) * 0.0 + step(${f(1 - cov)}, n));
        col = mix(col, ${cs[1] || cs[0]}, step(${f(1 - cov * 0.4)}, noise2(P / 0.02 + 9.1))); }`;
    }
    case 'colour_block': {
      const yoke = role(p.yoke || 'second'), out = [];
      if (p.layout === 'yoke_top' || p.layout === 'panels') out.push(`col = mix(col, ${yoke}, step(mix(uP[0].x, uP[0].y, 0.74), P.y) * step(vG.z, 0.5) + step(0.5, vG.z) * step(vG.z, 2.5) * step(vPart.y, 0.2));`);
      if (p.layout === 'sleeves_contrast') out.push(`col = mix(col, uSecond, step(0.5, vG.z) * step(vG.z, 2.5));`);
      if (p.layout === 'left_right') out.push(`col = mix(col, ${role(p.side_panel || 'second')}, step(0.0, vCanon.x) * step(vG.z, 0.5));`);
      if (p.layout === 'top_bottom') out.push(`col = mix(col, uSecond, step(P.y, mix(uP[0].x, uP[0].y, 0.45)));`);
      if (p.side_panels) out.push(`col = mix(col, ${role(p.side_panels)}, aa(abs(vCanon.z) - 0.035) * step(vG.z, 0.5));`);
      if (p.chest_stripe) out.push(`col = mix(col, ${role(p.chest_stripe)}, band(P.y, mix(uP[0].x, uP[0].y, 0.62), mix(uP[0].x, uP[0].y, 0.68)) * step(vG.z, 0.5) + step(0.5, vG.z) * step(vG.z, 2.5) * band(vPart.y, 0.24, 0.3));`);
      if (p.cuffs_hem) out.push(`col = mix(col, ${role(p.cuffs_hem)}, step(P.y, uP[0].x + 0.03) * step(vG.z, 0.5) + step(0.5, vG.z) * step(vG.z, 2.5) * step(0.9, vPart.y));`);
      return out.join('\n');
    }
    case 'raglan_two_tone': return `col = mix(${role(p.body, 'main')}, ${role(p.sleeves, 'second')}, step(0.5, vG.z) * step(vG.z, 2.5) + step(vG.z, 0.5) * step(0.4, vShare.x));`;
    case 'two_tone_split': return `col = mix(col, ${role(p.saddle || 'second')}, band(vG.y, 0.3, 0.7));`;
    case 'alternating_pleats': return `col = mix(col, ${role((p.colours || [])[1] || 'second')}, step(0.5, fract(atan(vCanon.x, vCanon.z) / 6.2831853 * uP[1].x)));`;
    case 'tiers_alternating': {
      const cs = (p.colours || ['main', 'main', 'second']).map((r) => role(r)), n = p.tiers || 3;
      return `{ float tt = clamp((uP[0].y - P.y) / max(uP[0].y - uP[0].x, 0.01), 0.0, 0.999); float ti = floor(tt * ${n}.0);
        col = ti < 0.5 ? ${cs[0]} : ti < 1.5 ? ${cs[1] || cs[0]} : ${cs[2] || cs[0]};
        col = mix(col, ${role(p.edge || 'trim')}, line(fract(tt * ${n}.0), 0.97, 0.05)); }`;
    }
    case 'chevron_band': case 'wave_hem': {
      const cs = (p.colours || ['second', 'accent']).map((r) => role(r));
      return `{ float y = P.y - (uP[0].x + 0.035); float zz = abs(fract(P.x / 0.03) - 0.5) * 0.02; float w = ${t === 'wave_hem' ? 'sin(P.x / 0.02) * 0.006' : 'zz'};
        col = mix(col, ${cs[0]}, aa(y - w) * step(-0.04, y)); col = mix(col, ${cs[1] || cs[0]}, line(y - w, 0.012, 0.005)); }`;
    }
    case 'fair_isle': {
      const cs = (p.colours || ['second', 'accent']).map((r) => role(r)), h = p.height ?? 0.12;
      const y0 = p.placement === 'band_hem' ? 'uP[0].x + 0.01' : `mix(uP[0].x, uP[0].y, 0.62)`;
      return `{ float y0 = ${y0}, y1 = y0 + ${span} * ${f(h)}; float b = band(P.y, y0, y1); vec2 q = vec2(P.x, P.y - y0) / 0.012;
        float motif = step(abs(fract(q.x * 0.25) - 0.5) + abs(fract(q.y * 0.33) - 0.5), 0.35);
        col = mix(col, ${cs[0]}, b * (line(P.y, y0 + 0.004, 0.004) + line(P.y, y1 - 0.004, 0.004) + motif * 0.9)); col = mix(col, ${cs[1] || cs[0]}, b * dotsHex(q * 0.012, 0.024, 0.003)); }`;
    }
    case 'print_motif': {
      const cs = (p.colours || ['accent', 'trim']).map((r) => role(r));
      if (p.placement === 'all_over_sparse') return `col = mix(col, ${cs[0]}, star(fract(P / 0.07 + vec2(0.5 * mod(floor(P.y / 0.07), 2.0), 0.0)) * 0.07, vec2(0.035), 0.007));`;
      const big = p.scale === 'large' ? 0.06 : p.scale === 'small' ? 0.02 : 0.04;
      const at = p.placement === 'hem_left' ? `vec2(0.06, uP[0].x + 0.05)` : p.placement === 'back' ? `vec2(0.0, mix(uP[0].x, uP[0].y, 0.6))` : `vec2(0.0, mix(uP[0].x, uP[0].y, 0.62))`;
      const face = p.placement === 'back' ? 'step(vCanon.z, 0.0)' : 'step(0.0, vCanon.z)';
      return `{ vec2 q = vec2(vCanon.x, vCanon.y); float o = orb(q, ${at}, ${f(big)}) * ${face} * step(vG.z, 0.5);
        col = o > 0.5 ? (o < 1.5 ? ${cs[0]} : o < 2.5 ? vec3(0.12, 0.12, 0.14) : o < 3.5 ? ${cs[1] || 'uTrim'} : ${cs[1] || 'uTrim'}) : col; }`;
    }
    default: return '';
  }
}

// details from the vocabulary drawn in paint (a garment builder adds its own on top)
export function detailsGLSL(details = [], o = {}) {
  const out = [];
  const front = 'step(0.0, vCanon.z)', trunk = 'step(vG.z, 0.5)';
  for (const d of details) switch (d) {
    case 'emblem_ball': case 'logo_small_hem':
      out.push(`{ float e = orb(vCanon.xy, vec2(0.075, uP[0].x + 0.045), 0.016) * ${front} * ${trunk}; col = e > 0.5 ? (e < 1.5 ? uAccent : e < 2.5 ? vec3(0.13) : uTrim) : col; }`); break;
    case 'logo_small_chest': case 'embroidery_small': case 'patch_flag':
      out.push(`col = mix(col, uAccent, box2(vCanon.xy, vec2(0.07, mix(uP[0].x, uP[0].y, 0.8)), vec2(0.016, 0.012), 0.004) * ${front} * ${trunk});`); break;
    case 'logo_chest_large':
      out.push(`{ float e = orb(vCanon.xy, vec2(0.0, mix(uP[0].x, uP[0].y, 0.66)), 0.05) * ${front} * ${trunk}; col = e > 0.5 ? (e < 1.5 ? uAccent : e < 2.5 ? vec3(0.13) : uTrim) : col; }`); break;
    case 'logo_sleeve':
      out.push(`col = mix(col, uAccent, circle(vec2(vG.x, vPart.y), vec2(0.0, 0.18), 0.012) * step(0.5, vG.z) * step(vG.z, 1.5));`); break;
    case 'chest_stripe':
      out.push(`col = mix(col, uTrim, band(P.y, mix(uP[0].x, uP[0].y, 0.62), mix(uP[0].x, uP[0].y, 0.67)) * ${trunk} + band(vPart.y, 0.22, 0.27) * step(0.5, vG.z) * step(vG.z, 2.5));`); break;
    case 'shoulder_stripes':
      out.push(`col = mix(col, uTrim, (line(vG.x, 0.012, 0.006) + line(vG.x, -0.012, 0.006)) * step(0.5, vG.z) * step(vG.z, 2.5));`); break;
    case 'side_stripes':
      out.push(`col = mix(col, uTrim, (line(vG.x, -0.004, 0.005) + line(vG.x, 0.006, 0.005)) * step(2.5, vG.z) * step(vG.z, 4.5));`); break;
    case 'piping': case 'stitch_contrast':
      out.push(`col = mix(col, uTrim, line(vG.w, 0.5, 2.0) * 0.0 + dashes(P.x, P.y, uP[0].x + 0.012, 0.0015, 0.008, 0.005) * ${trunk});`); break;
    case 'reflective_tape':
      out.push(`col = mix(col, vec3(0.9), band(P.y, mix(uP[0].x, uP[0].y, 0.3), mix(uP[0].x, uP[0].y, 0.36)) * ${trunk} + band(vPart.y, 0.8, 0.86) * step(0.5, vG.z));`); break;
    case 'tipping_stripes': case 'collar_contrast':
      out.push(`col = mix(col, uTrim, step(0.5, vG.w));`); break;
    case 'number_back':
      out.push(`col = mix(col, uTrim, box2(vCanon.xy, vec2(0.0, mix(uP[0].x, uP[0].y, 0.6)), vec2(0.035, 0.05), 0.01) * step(vCanon.z, 0.0) * ${trunk} * (1.0 - box2(vCanon.xy, vec2(0.0, mix(uP[0].x, uP[0].y, 0.6)), vec2(0.022, 0.037), 0.008)));`); break;
    case 'elbow_patches':
      out.push(`col = mix(col, uSecond, circle(vec2(vG.x - (vPart.z > 0.0 ? -0.06 : 0.06), vPart.y), vec2(0.0, 0.52), 0.035) * step(0.5, vG.z) * step(vG.z, 2.5));`); break;
    case 'kneepads':
      out.push(`col = mix(col, uSecond, box2(vec2(vG.x, vPart.y), vec2(0.0, 0.5), vec2(0.04, 0.05), 0.015) * step(2.5, vG.z) * step(vG.z, 4.5));`); break;
    default: break;
  }
  return out.join('\n');
}
