// (shared by battle_fx.gdshader, blended, and battle_fx_add.gdshader, added)
// The battle's particles (battle/battle_fx.gd): camera-facing quads placed on
// the CPU (one MultiMesh per shape), coloured by the instance colour. Shapes:
//  0 soft   a round puff (dust, sand, smoke)
//  1 streak a bright line tapering at both ends (wind streaks, speed lines, sparks)
//  2 star   an anime impact star (a flash of spikes)
//  3 ring   a thin ring (shock waves, the shout)
//  4 blade  a grass blade or a leaf (the mesh's own shape, lit flat, two-sided)
//  5 slash  a crescent cut (the razor leaves' slashes)
// INSTANCE_CUSTOM.x: a random number per particle (the star's spikes, the blade's shade).
uniform int shape = 0;
uniform float boost = 1.0;   // additive shapes: brightness

varying vec4 v_col;
varying float v_r;

void vertex() {
	v_col = COLOR;
	v_r = INSTANCE_CUSTOM.x;
}

void fragment() {
	vec2 q = UV * 2.0 - 1.0;
	float a = 0.0;
	vec3 c = v_col.rgb;
	if (shape == 0) {
		float r = length(q);
		a = smoothstep(1.0, 0.15, r);
		a *= a;
		c *= mix(1.08, 0.82, smoothstep(-0.6, 0.8, q.y));   // a little lit on top
	} else if (shape == 1) {
		float along = 1.0 - abs(q.x);
		float w = max(0.02, along * 0.9);
		a = smoothstep(w, w * 0.25, abs(q.y)) * smoothstep(0.0, 0.35, along);
		c = mix(c, vec3(1.0), smoothstep(w * 0.5, 0.0, abs(q.y)) * 0.6) * boost;
	} else if (shape == 2) {
		float r = length(q);
		float ang = atan(q.y, q.x);
		float spikes = 0.32 + 0.68 * pow(abs(cos(ang * 4.0 + v_r * 6.0)), 18.0) + 0.25 * pow(abs(cos(ang * 2.0 + v_r * 3.0)), 30.0);
		a = smoothstep(spikes, spikes * 0.55, r);
		c = mix(c, vec3(1.0), smoothstep(0.45, 0.0, r)) * boost;
	} else if (shape == 3) {
		float r = length(q);
		a = smoothstep(0.08, 0.0, abs(r - 0.86)) * 1.2;
		c *= boost;
	} else if (shape == 4) {
		a = 1.0;
		c *= mix(0.8, 1.15, v_r) * (FRONT_FACING ? 1.0 : 0.82);
	} else {
		// a crescent: a disc minus an offset disc, the tips tapering
		float r1 = length(q);
		float r2 = length(q - vec2(0.0, 0.32));
		a = smoothstep(1.0, 0.92, r1) * smoothstep(0.86, 0.96, r2) * smoothstep(-0.2, 0.4, -q.y + 0.2);
		c = mix(c, vec3(1.0), 0.5) * boost;
	}
	a *= v_col.a;
	if (a < 0.004) discard;
	ALBEDO = c;
	ALPHA = clamp(a, 0.0, 1.0);
}
