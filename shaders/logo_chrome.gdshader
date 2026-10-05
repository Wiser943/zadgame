shader_type canvas_item;
// Chrome face + periodic shine sweep for the title lockup. Only the white glyph face is
// recoloured; shadow/outline passes (non-white font colours) render unchanged.

uniform float line_height = 72.0;
uniform float top_offset = 0.0;
uniform float sweep_width = 900.0;
uniform float shine_period = 5.5;
uniform float motion : hint_range(0.0, 1.0) = 1.0;

varying vec2 local_pos;

void vertex() {
	local_pos = VERTEX;
}

void fragment() {
	vec4 c = COLOR;
	float face = step(0.93, min(c.r, min(c.g, c.b)));
	float y = fract(max(local_pos.y - top_offset, 0.0) / line_height);
	vec3 chrome = mix(vec3(1.0), vec3(0.86, 0.91, 0.98), smoothstep(0.18, 0.52, y));
	chrome = mix(chrome, vec3(0.58, 0.69, 0.84), smoothstep(0.5, 0.6, y) * (1.0 - smoothstep(0.66, 0.92, y)));
	chrome = mix(chrome, vec3(0.93, 0.97, 1.0), smoothstep(0.82, 0.98, y));
	float t = fract(TIME / shine_period);
	float band_x = mix(-400.0, sweep_width * 2.2, t);
	float diagonal = local_pos.x + local_pos.y * 0.45;
	float shine = (1.0 - smoothstep(0.0, 34.0, abs(diagonal - band_x))) * motion;
	vec3 lit = chrome + vec3(0.55, 0.75, 1.0) * shine * 0.65;
	c.rgb = mix(c.rgb, lit, face);
	COLOR = c;
}
