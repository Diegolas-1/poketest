// The water parting round Ash's bike wheels (bike/bike_water.gd sets these on the
// sea's shallows and the fresh water each frame while he rides in it, else zero):
// a V of white foam lines spreading back from the front wheel (a Kelvin wedge,
// broken up further back), churned foam down the middle behind the rear wheel, a
// crescent of foam pushed up ahead of the tyre, and the parted water inside the V
// a shade deeper. Needs h() and n() (the water shaders' noise) defined first.
uniform vec4 part_p = vec4(0.0, 0.0, 0.0, 1.0);   // the front wheel's x, z; the heading (sin, cos)
uniform vec4 part_k = vec4(0.0);                  // strength 0..1, the wake's length (m), depth 0..1, speed (m/s)

// foam 0..1 at world point w (its parted water darkening in dark)
float bike_part(vec2 w, out float dark) {
	dark = 0.0;
	if (part_k.x < 0.002) return 0.0;
	vec2 d = w - part_p.xy;
	vec2 f = part_p.zw;
	float a = dot(d, f);
	float s = dot(d, vec2(f.y, -f.x));
	float len = part_k.y;
	if (a > 0.9 || a < -len || abs(s) > len * 0.5 + 0.8) return 0.0;
	float b = max(-a, 0.0);
	float u = b / len;                                   // 0 at the wheel .. 1 the wake's end
	float sp = part_k.w;
	// the V: two lines at the wedge's edges, wider and more broken further back
	float edge = 0.1 + b * (0.36 + 0.06 * part_k.z);
	float wid = 0.045 + b * 0.035;
	float brk = n(w * 2.6 + f * (TIME * sp * 0.25)) + 0.35 * n(w * 7.0 - TIME * 0.8);
	float line = (1.0 - smoothstep(wid * 0.55, wid, abs(abs(s) - edge))) * step(a, 0.05);
	line *= step(0.32 + 0.75 * u, brk);
	// a second, fainter line inside the first (the wave train behind the bow)
	float e2 = edge * 0.62;
	float line2 = (1.0 - smoothstep(wid * 0.35, wid * 0.7, abs(abs(s) - e2))) * step(a, -0.35) * step(0.5 + 0.6 * u, brk);
	// churned water down the middle behind the rear wheel (a bike length back)
	float ch = (1.0 - smoothstep(0.1 + b * 0.05, 0.22 + b * 0.09, abs(s))) * step(a, -1.0);
	float churn = ch * step(0.55 + 0.45 * u, n(w * 4.2 + f * (TIME * sp * 0.4)) + 0.25 * part_k.z);
	// the bow's crescent just ahead of the tyre
	float bow = (1.0 - smoothstep(0.09, 0.15, abs(length(vec2(a - 0.02, s * 0.75)) - 0.2))) * step(-0.05, a) * step(0.25, part_k.z + sp * 0.05);
	float fade = 1.0 - smoothstep(0.55, 1.0, u);
	dark = (1.0 - smoothstep(edge * 0.75, edge, abs(s))) * step(a, 0.0) * (1.0 - u) * part_k.x;
	return clamp(max(max(line, line2 * 0.85), max(churn, bow)) * fade * part_k.x, 0.0, 1.0);
}
