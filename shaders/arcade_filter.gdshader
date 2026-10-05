shader_type canvas_item;

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear;
uniform float strength : hint_range(0.0, 1.0) = 0.18;

void fragment() {
	vec2 uv = SCREEN_UV;
	vec4 base = texture(screen_texture, uv);
	float distance_from_center = distance(uv, vec2(0.5));
	float vignette = smoothstep(0.82, 0.28, distance_from_center);
	vec3 graded = base.rgb * mix(0.84, 1.025, vignette);
	graded = graded * vec3(0.99, 1.0, 1.015);
	COLOR = vec4(mix(base.rgb, graded, strength), base.a);
}
