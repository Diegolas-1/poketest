// Gust's vortex (battle/battle_fx.gd): a few nested open funnels, each a band of
// wind streaks spiralling round and up at its own speed, bright edges, the
// ends fading out. UV.x runs round the funnel, UV.y from its foot (0) to its
// lip (1). Blended white over the scene (it reads over the green grass and the sky alike).
shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled, fog_disabled;

uniform vec4 tint : source_color = vec4(0.86, 1.0, 0.94, 1.0);
uniform float strength = 1.0;      // 0 gone .. 1 full (battle_fx.gd fades it in and out)
uniform float spin = 2.4;          // turns a second
uniform float bands = 5.0;         // streaks round the funnel
uniform float twist = 1.6;         // how far a streak winds round from foot to lip
uniform float seed = 0.0;
uniform float pulse = 0.0;         // the wing beat's push (a brighter, faster ring rising)

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p), f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

void fragment() {
	float u = UV.x, v = UV.y;
	float t = TIME * spin + seed;
	// streaks: thin bands wound round the funnel, broken up by noise so they read as gusts, not stripes
	float s = fract(u * bands + v * twist - t);
	float streak = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.12, 0.42, s));
	float brk = noise(vec2(u * bands * 3.0 - t * 2.0, v * 6.0 - t * 1.3 + seed));
	streak *= smoothstep(0.25, 0.75, brk);
	// a fine hiss of lines over it
	float fine = smoothstep(0.85, 1.0, sin((u * bands * 7.0 + v * twist * 3.0 - t * 2.6) * 6.2831) * 0.5 + 0.5) * 0.35 * noise(vec2(u * 40.0, v * 3.0 + t));
	// the beat's ring of air rising up the funnel
	float ring = pulse * smoothstep(0.12, 0.0, abs(v - fract(t * 0.6))) * 0.8;
	float ends = smoothstep(0.0, 0.18, v) * (1.0 - smoothstep(0.72, 1.0, v));
	float rim = 0.55 + 0.45 * pow(1.0 - abs(dot(normalize(NORMAL), normalize(VIEW))), 1.5);   // brighter seen edge-on
	float a = (streak + fine + ring) * ends * rim * strength;
	ALBEDO = mix(tint.rgb, vec3(1.0), clamp(a - 0.6, 0.0, 1.0));
	ALPHA = clamp(a * 1.7, 0.0, 0.95);
}
