// Made by tools/native/bake.mjs from web/world/stone.js STONE_GLSL: edit it there.
float st_h(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float st_n(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(st_h(i), st_h(i + vec3(1.0, 0.0, 0.0)), f.x), mix(st_h(i + vec3(0.0, 1.0, 0.0)), st_h(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(st_h(i + vec3(0.0, 0.0, 1.0)), st_h(i + vec3(1.0, 0.0, 1.0)), f.x), mix(st_h(i + vec3(0.0, 1.0, 1.0)), st_h(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
vec3 stone_paint(vec3 p, vec3 n, vec2 r, float px) {
  float k = 1.0;
  // mottled blotches in two painted steps
  float m = st_n(p * 1.4) * 0.6 + st_n(p * 3.3 + 4.1) * 0.4;
  k *= mix(1.0, 0.86, smoothstep(0.58, 0.62, m));
  k *= mix(1.0, 1.07, smoothstep(0.34, 0.3, m));
  // small pits (dark) and light specks
  float s = st_n(p * 13.0);
  k *= mix(1.0, 0.72, smoothstep(0.79, 0.83, s));
  k *= mix(1.0, 1.1, smoothstep(0.2, 0.16, st_n(p * 9.0 + 7.3)));
  // a few thin cracks: edges between big cells (straight, jointed), only
  // here and there
  vec3 q = p * 0.6, qi = floor(q), qf = fract(q);
  float f1 = 8.0, f2 = 8.0;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 g = vec3(float(x), float(y), float(z));
    vec3 o = vec3(st_h(qi + g), st_h(qi + g + 11.3), st_h(qi + g + 27.1));
    float d = length(g + o - qf);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  float e = (f2 - f1) / 0.6, w = max(px * 1.0, 0.004);
  float mask = smoothstep(0.66, 0.72, st_n(p * 0.45 + 9.1));
  k *= mix(1.0, 0.42, (1.0 - smoothstep(w * 0.6, w * 1.2, e)) * mask);
  k *= mix(1.0, 1.08, smoothstep(w * 1.2, w * 1.8, e) * (1.0 - smoothstep(w * 2.6, w * 3.4, e)) * mask);
  // the stone's own tone
  k *= 0.94 + r.y * 0.12;
  vec3 col = vec3(k);
  // moss on the tops, in patches
  float moss = smoothstep(0.7, 0.9, n.y) * smoothstep(0.55, 0.62, st_n(p * 0.9 + 1.3));
  col = mix(col, vec3(0.68, 0.86, 0.46) * k, moss * 0.4);
  return col;
}
