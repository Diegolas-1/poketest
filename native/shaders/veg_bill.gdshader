// Far plants as billboards (web assets.js Impostor): the model drawn from 8
// sides with the sun on 4 sides of it; each quad turns to the camera, picks
// the view nearest the camera's and blends the two sun rows nearest the real
// sun. It takes exactly the pixels the near model gives up (same dither).
// All billboards share one atlas, so a chunk of far plants is one draw.
// Instance: origin in the transform, INSTANCE_CUSTOM = (rotation, scale,
// billboard index, fade start); the plant's model fades over [start, start + FADE_W].
shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled;
#include "res://shaders/aces.gdshaderinc"
#include "res://shaders/veg.gdshaderinc"

uniform sampler2D map : source_color, filter_linear_mipmap, repeat_disable;
uniform float views = 8.0;
uniform float rows = 4.0;
uniform vec2 far = vec2(500.0, 600.0);
uniform float fade_w = 5.0;
uniform vec4 imp_rect[64];   // place in the atlas (0..1): x, y, w, h
uniform vec4 imp_geo[64];    // width, height, bottom (m), sun azimuth

varying vec2 v_uv;
varying vec2 v_row;
varying float v_k;
varying flat vec4 v_rect;

void vertex() {
	vec3 c = MODEL_MATRIX[3].xyz;
	float rot = INSTANCE_CUSTOM.r, scl = INSTANCE_CUSTOM.g;
	int id = int(INSTANCE_CUSTOM.b + 0.5);
	vec4 geo = imp_geo[id];
	vec3 size = geo.xyz;
	float sun_az = geo.w;
	v_rect = imp_rect[id];
	vec3 to_cam = veg_cam - c;
	float d = length(to_cam);
	v_k = smoothstep(INSTANCE_CUSTOM.a, INSTANCE_CUSTOM.a + fade_w, d) * (1.0 - clamp((d - far.x) / (far.y - far.x), 0.0, 1.0));
	if (v_k <= 0.0) {
		VERTEX = vec3(0.0);
	} else {
		to_cam.y = 0.0; to_cam = normalize(to_cam);
		vec3 right = vec3(to_cam.z, 0.0, -to_cam.x);
		// the quad's corners come in as UV (0..1, v down)
		vec2 q = vec2((UV.x - 0.5) * size.x, (1.0 - UV.y) * size.y + size.z);
		VERTEX = (right * q.x + vec3(0.0, q.y, 0.0)) * scl;
		float cam_az = atan(to_cam.x, to_cam.z);
		float f = mod(floor((cam_az - rot) / 6.2831853 * views + 0.5), views);
		float rs = mod((sun_az - cam_az) / 6.2831853 * rows, rows);
		v_row = vec2(floor(rs), fract(rs));
		v_uv = vec2((f + UV.x) / views, 1.0 - UV.y);   // v up, as the web's atlas rows count
	}
}

void fragment() {
	if (fd_b8(FRAGCOORD.xy) >= v_k) discard;
	float r0 = floor(v_row.x + 0.5), r1 = r0 + 1.0 >= rows - 0.5 ? 0.0 : r0 + 1.0;
	// the PNG is stored top row first: flip the web's bottom-up rows
	vec4 a = texture(map, v_rect.xy + vec2(v_uv.x, 1.0 - (r0 + v_uv.y) / rows) * v_rect.zw);
	vec4 b = texture(map, v_rect.xy + vec2(v_uv.x, 1.0 - (r1 + v_uv.y) / rows) * v_rect.zw);
	float al = mix(a.a, b.a, v_row.y);
	vec2 px = v_uv * vec2(textureSize(map, 0)) * v_rect.zw * vec2(1.0, 1.0 / rows);
	float lod = max(0.0, 0.5 * log2(max(dot(dFdx(px), dFdx(px)), dot(dFdy(px), dFdy(px)))));
	if (al * (1.0 + lod * 0.3) < 0.5) discard;
	// (the importer fills clear texels with their neighbours' colour, so no
	// dark rim to divide out)
	ALBEDO = aces_three(mix(a.rgb, b.rgb, v_row.y));
}
