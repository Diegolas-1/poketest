// Ink inside the grass blades (grass.gdshader, grass_lip.gdshader): a thin line
// along each blade's two sides, drawn in the blade's own fragment shader (no
// second pass over the field). UV2.y runs -1 .. 1 across the blade (grass.gd
// _clump), so a fragment knows how many pixels it is from the blade's edge, and
// the line gets the vector ink's soft edge (ink_aa.gdshaderinc). It stays clean:
//  - inside the blade, so a blade never grows and a field never fills with ink;
//  - a blade only a few pixels wide (far off, or near its tip, where the line
//    tapers away like a brush stroke) gets none, else it would be all ink;
//  - it thins to nothing ink_near metres from the player (the field beyond
//    is a soft mass of colour) and fades with the camera like the other ink.
// width_1080 is set by Ink.track (the Outline weight; 0 while outlines are off).
#include "res://shaders/ink_aa.gdshaderinc"

global uniform vec3 ink_focus;
uniform float width_1080 = 0.0;
uniform vec4 ink_color : source_color = vec4(0.165, 0.129, 0.196, 1.0);
uniform float ink_strength = 0.8;   // the line over the blade's colour (1: full ink)
uniform vec2 ink_near = vec2(5.0, 24.0);
uniform vec2 ink_fade = vec2(70.0, 170.0);

varying float v_ink_px;
varying float v_side;

// in vertex(): v_side = the blade's side coordinate (UV2.y), v_ink_px = this: the
// line's width in pixels here (wp: the vertex in world space, cam_d: its distance
// from the camera). (A function may not write varyings.)
float grass_ink_px(vec3 wp, float cam_d, vec2 vp) {
	float w = 1.0 - smoothstep(ink_near.x, ink_near.y, distance(wp, ink_focus));
	w *= 1.0 - smoothstep(ink_fade.x, ink_fade.y, cam_d);
	return width_1080 > 0.0 ? max(width_1080 * vp.y / 1080.0, 0.75) * w : 0.0;
}

// in fragment(): the blade's colour c with its ink
vec3 grass_ink(vec3 c) {
	if (v_ink_px <= 0.02) return c;
	float fw = max(length(vec2(dFdx(v_side), dFdy(v_side))), 1e-5);
	float bw = 2.0 / fw;                     // the blade's width here (px)
	float dpx = (1.0 - abs(v_side)) / fw;    // to its nearer side (px)
	float w = v_ink_px;
	float cov = clamp((w - dpx) / (2.0 * INK_SOFT) + 0.5, 0.0, 1.0);
	float k = smoothstep(2.0 * w + 1.0, 4.0 * w + 3.0, bw);
	vec3 ink = aces_three(ink_color.rgb * dn_unlit());
	return mix(c, ink, ink_even(cov) * k * ink_strength * min(w, 1.0));
}
