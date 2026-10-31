// The night: fireflies (night_fx.gd). Each quad's four corners share an anchor in
// the tall grass or by the water; here it drifts round it, bobbing, and blinks,
// a camera-facing dot with a soft glow, added on top. COLOR = four randoms.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;
#include "res://shaders/daynight.gdshaderinc"
varying float v_fa;
void vertex() {
	vec4 fr = COLOR;
	float ft = TIME * (0.25 + fr.x * 0.3) + fr.y * 50.0;
	vec3 fp = VERTEX + vec3(sin(ft) * 1.6 + sin(ft * 2.3 + fr.z * 6.0) * 0.5, 0.45 + fr.w * 1.1 + sin(ft * 1.7 + fr.x * 9.0) * 0.3, cos(ft * 0.8 + fr.w * 4.0) * 1.6);
	vec3 fv = (MODELVIEW_MATRIX * vec4(fp, 1.0)).xyz;
	float fd = -fv.z;
	// a blink: slow on, a short glow, off for a while
	float fb = smoothstep(0.55, 0.75, sin(TIME * (0.9 + fr.z * 0.9) + fr.x * 31.0)) * 0.85 + 0.15;
	v_fa = fb * dn_glow.z * (1.0 - smoothstep(30.0, 48.0, fd)) * step(0.5, fd);
	fv.xy += UV * (0.16 + fd * 0.006);
	POSITION = PROJECTION_MATRIX * vec4(fv, 1.0);
	if (v_fa <= 0.002) POSITION = vec4(0.0, 0.0, -2.0, 1.0);
}
void fragment() {
	float fr2 = length(UV);
	float fc = pow(max(0.0, 1.0 - fr2), 3.0) + (1.0 - smoothstep(0.0, 0.28, fr2)) * 0.9;
	ALBEDO = vec3(0.78, 1.0, 0.42) * fc * v_fa * 1.8;
}
