shader_type canvas_item;
// Modal backdrop: soft blur of the game behind, darkened, with a vignette.

uniform sampler2D screen_texture : hint_screen_texture, repeat_disable, filter_linear;
uniform float blur_px = 3.0;
uniform vec4 tint : source_color = vec4(0.012, 0.018, 0.03, 0.66);

void fragment() {
	vec2 step_uv = SCREEN_PIXEL_SIZE * blur_px;
	vec3 sum = vec3(0.0);
	float weight = 0.0;
	for (int x = -2; x <= 2; x++) {
		for (int y = -2; y <= 2; y++) {
			float k = 1.0 / (1.0 + float(x * x + y * y));
			sum += texture(screen_texture, SCREEN_UV + vec2(float(x), float(y)) * step_uv).rgb * k;
			weight += k;
		}
	}
	vec3 blurred = sum / weight;
	float vignette = smoothstep(0.3, 0.85, distance(SCREEN_UV, vec2(0.5)));
	vec3 color = mix(blurred, tint.rgb, clamp(tint.a + vignette * 0.22, 0.0, 1.0));
	COLOR = vec4(color, COLOR.a);
}
