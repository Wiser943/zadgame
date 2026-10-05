shader_type canvas_item;
// Holo glass panel: fine scanlines plus a slow light sweep. Applied to a panel's own
// drawing (stylebox + corner brackets); child controls keep their normal material.

uniform float panel_height = 600.0;
uniform float sweep_period = 4.0;
uniform vec3 sweep_color : source_color = vec3(0.44, 0.72, 1.0);
uniform float motion : hint_range(0.0, 1.0) = 1.0;

varying vec2 local_pos;

void vertex() {
	local_pos = VERTEX;
}

void fragment() {
	vec4 c = COLOR;
	float lines = 0.5 + 0.5 * sin(local_pos.y * 1.5708);
	c.rgb *= 1.0 - 0.07 * lines;
	float sweep_y = mix(-120.0, panel_height + 120.0, fract(TIME / sweep_period));
	float sweep = exp(-pow((local_pos.y - sweep_y) / 46.0, 2.0)) * motion;
	c.rgb += sweep_color * sweep * 0.05;
	COLOR = c;
}
