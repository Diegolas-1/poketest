// Vector ink for hard surfaces (the web build's outline.js addEdgeLines):
// every baked edge is a camera-facing quad. Per frame the vertex shader keeps
// an edge only when it is
//   - an open boundary (kind 2),
//   - a hard crease (kind 1) with at least one of its faces toward the camera,
//   - or a silhouette right now (one face toward the camera, the other away),
// and drops the rest. Lines are a constant number of pixels wide (about
// width_1080 at 1080p, set by Ink.set_weight: Settings "Outline weight") with
// analytic anti-aliased sides (the fragment's coverage of the line from its
// distance to the line's centre in pixels, over a filter a little wider than a
// pixel, then evened out for the linear blend: see ink_cover), so they read as
// clean vector strokes; below a pixel a line keeps one pixel and fades instead
// of thinning (no shimmer). They thin to nothing with
// distance from the player (ink_focus) and fade into the distance, creases
// sooner than silhouettes. A silhouette quad sits wholly outside the shape so
// the shape's own faces never cover half of it.
// Mesh layout (native/ink.gd): VERTEX = this end of the edge,
// CUSTOM0 = other end minus this end (half floats) + w (+-1 = side of the
// quad, |w| 2 = this is end B),
// CUSTOM1 = face normal 1 (snorm8), CUSTOM2 = face normal 2 + kind / 2.
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
#include "res://shaders/aces.gdshaderinc"
#include "res://shaders/ink_aa.gdshaderinc"

global uniform vec3 ink_focus;
uniform vec4 ink_color : source_color = vec4(0.165, 0.129, 0.196, 1.0);   // #2a2132
uniform float width_1080 = 1.1;
uniform vec2 fade = vec2(70.0, 170.0);
uniform vec2 focus_range = vec2(10.0, 55.0);
uniform float crease_w = 0.72;
// lines step toward the camera so the faces they lie on never eat them
uniform float pull = 0.0012;
uniform float pull_min = 0.006;

varying float v_side;
varying float v_alpha;
varying float v_core;   // line core width in pixels (already times the focus weight)
varying float v_half;   // half the quad's width in pixels
varying vec3 v_col;

void vertex() {
	vec3 me = (VIEW_MATRIX * MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 ot = (VIEW_MATRIX * MODEL_MATRIX * vec4(VERTEX + CUSTOM0.xyz, 1.0)).xyz;
	bool is_b = abs(CUSTOM0.w) > 1.5;
	float side = sign(CUSTOM0.w);
	vec3 a = is_b ? ot : me;
	vec3 b = is_b ? me : ot;
	mat3 nm = mat3(VIEW_MATRIX) * mat3(MODEL_MATRIX);
	vec3 n1 = nm * CUSTOM1.xyz;
	vec3 n2 = nm * CUSTOM2.xyz;
	float kind = CUSTOM2.w * 2.0;
	vec3 mid = 0.5 * (a + b);
	float f1 = dot(n1, -mid), f2 = dot(n2, -mid);
	bool sil = (f1 > 0.0) != (f2 > 0.0);
	vec3 outn = f1 > 0.0 ? n1 : n2;
	bool show = kind > 1.5 || (kind > 0.5 && (f1 > 0.0 || f2 > 0.0)) || sil;
	float dist = -mid.z;
	float fl = 1.0 - smoothstep(fade.x, fade.y, dist);
	float w = sil ? 1.0 : crease_w;
	float df = distance(mid, (VIEW_MATRIX * vec4(ink_focus, 1.0)).xyz);
	w *= 1.0 - smoothstep(focus_range.x, focus_range.y, df);
	fl *= smoothstep(0.0, 0.2, w);
	if (!sil) fl *= 1.0 - smoothstep(fade.x * 0.35, fade.x * 0.85, dist);
	float core = max(1.0, width_1080 * VIEWPORT_SIZE.y / 1080.0);
	// the quad: the core (never under a pixel) plus room for the soft sides
	float cw = max(core * w, 1.0);
	float half_w = cw * 0.5 + INK_SOFT;
	// trim at the near plane
	float nz = 0.3;
	if (a.z > -nz && b.z > -nz) show = false;
	if (a.z > -nz) a = mix(a, b, (-nz - a.z) / (b.z - a.z));
	if (b.z > -nz) b = mix(b, a, (-nz - b.z) / (a.z - b.z));
	if (!show || fl <= 0.0) {
		POSITION = vec4(0.0, 0.0, -2.0, 1.0);
	} else {
		a *= 1.0 - pull - pull_min / max(1.0, -a.z);
		b *= 1.0 - pull - pull_min / max(1.0, -b.z);
		vec4 ca = PROJECTION_MATRIX * vec4(a, 1.0);
		vec4 cb = PROJECTION_MATRIX * vec4(b, 1.0);
		vec2 sa = ca.xy / ca.w * 0.5 * VIEWPORT_SIZE;
		vec2 sb = cb.xy / cb.w * 0.5 * VIEWPORT_SIZE;
		vec2 d = sb - sa;
		float l = length(d);
		d = l > 1e-4 ? d / l : vec2(1.0, 0.0);
		vec2 perp = vec2(-d.y, d.x);
		vec2 off = perp * side * half_w;
		// a silhouette: the line's core moves just outside the shape (its soft
		// inner side lies over the shape's own edge pixels and smooths them)
		// (outn into screen axes: the projection may flip y)
		vec2 outs = outn.xy * vec2(sign(PROJECTION_MATRIX[0][0]), sign(PROJECTION_MATRIX[1][1]));
		if (sil && length(outs) > 1e-4) off += perp * cw * 0.5 * sign(dot(perp, outs));
		// a little overhang at both ends so joined lines meet without gaps
		off += d * (is_b ? 1.0 : -1.0) * 0.5 * cw;
		vec4 c = is_b ? cb : ca;
		c.xy += off / (0.5 * VIEWPORT_SIZE) * c.w;
		POSITION = c;
	}
	v_side = side;
	v_col = aces_three(ink_color.rgb * dn_unlit());   // the web's lines are tone mapped like the lit surfaces
	v_alpha = fl * ink_color.a;
	v_core = core * w;
	v_half = half_w;
}

void fragment() {
	float dpx = abs(v_side) * v_half;
	ALBEDO = v_col;
	ALPHA = ink_cover(dpx, v_core) * v_alpha;
}
