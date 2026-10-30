// A sun shaft through a canopy (props/prop_mats.gd shaft): a tall card along the
// sun's slant, added over the scene in a warm haze, its streaks drifting slowly.
// It fades out as the camera comes close (never a sheet across the lens: by the
// pixel, a long card passes right by a battle's camera) and far off, and when
// seen edge on. Cheap on Mobile: unshaded, no depth write, a
// handful of cards per forest.
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_disabled, shadows_disabled, fog_disabled;

uniform sampler2D tex : source_color, filter_linear_mipmap, repeat_disable;
uniform vec4 tile = vec4(0.0, 0.5, 0.5, 0.5);
uniform vec3 tint : source_color = vec3(1.0, 0.94, 0.72);
uniform float power = 0.22;
uniform vec2 near_fade = vec2(2.5, 7.0);
uniform vec2 far_fade = vec2(55.0, 75.0);

varying float v_k;
varying vec3 v_wp;

void vertex() {
	vec3 wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	vec3 cam = INV_VIEW_MATRIX[3].xyz;
	vec3 n = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	float edge = abs(dot(n, normalize(cam - wp)));
	v_k = smoothstep(0.1, 0.45, edge);
	v_wp = wp;
}

void fragment() {
	float d = distance(v_wp, CAMERA_POSITION_WORLD);
	float k = v_k * smoothstep(near_fade.x, near_fade.y, d) * (1.0 - smoothstep(far_fade.x, far_fade.y, d));
	if (k <= 0.002) discard;
	vec2 uv = tile.xy + UV * tile.zw;
	float a = texture(tex, uv).a;
	float drift = 0.8 + 0.2 * sin(TIME * 0.6 + UV.x * 9.0 + NODE_POSITION_WORLD.x);
	ALBEDO = tint * a * power * k * drift;
}
