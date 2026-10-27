// The modal scrim under a menu (UITheme.scrim()): the game dimmed toward
// ink, darker at the edges, with faint diagonal hatching (the HUD's lean).
// Cheap: no screen read. The node's modulate fades it.
shader_type canvas_item;

uniform vec4 tint : source_color = vec4(0.02, 0.03, 0.08, 0.5);
uniform float hatch = 0.05;      // the stripes' extra darkness
uniform float vignette = 0.3;    // extra darkness at the corners

void fragment() {
	float v = smoothstep(0.25, 0.85, distance(SCREEN_UV, vec2(0.5)));
	float s = step(0.5, fract((FRAGCOORD.x + FRAGCOORD.y * 0.4) / 12.0));
	COLOR = vec4(tint.rgb, (tint.a + v * vignette + s * hatch) * COLOR.a);
}
