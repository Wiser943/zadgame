extends Control
## Glowing arena frame drawn behind the maze: soft halo, bevelled rim and corner brackets.

const CYAN := Color("70b7ff")

var arena := Rect2()
var _time := 0.0
var _glow: GradientTexture2D


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_glow = ScreenFactory.radial_glow(Color.WHITE)


func set_arena(rect: Rect2) -> void:
	arena = rect
	queue_redraw()


func _process(delta: float) -> void:
	if not is_visible_in_tree() or ScreenFactory.reduced_motion():
		return
	_time += delta
	queue_redraw()


func _draw() -> void:
	if arena.size == Vector2.ZERO:
		return
	var pulse := 0.85 + 0.15 * sin(_time * 1.6)
	var halo := arena.grow(arena.size.x * 0.35)
	draw_texture_rect(_glow, halo, false, Color(0.22, 0.45, 0.95, 0.22))
	var rim := arena.grow(10.0)
	draw_rect(rim, Color(0.02, 0.03, 0.045, 0.85), true)
	for index: int in 4:
		draw_rect(rim.grow(float(index) * 2.0 + 1.0), Color(CYAN, (0.1 - index * 0.022) * pulse), false, 2.0)
	draw_rect(rim, Color(0.62, 0.74, 0.9, 0.35), false, 1.0)
	draw_line(rim.position + Vector2(8.0, 1.0), Vector2(rim.end.x - 8.0, rim.position.y + 1.0), Color(1.0, 1.0, 1.0, 0.18), 1.0)
	var arm := 26.0
	var bracket := rim.grow(6.0)
	var color := Color(CYAN, 0.85 * pulse)
	for corner: Array in [[bracket.position, Vector2(1, 1)], [Vector2(bracket.end.x, bracket.position.y), Vector2(-1, 1)], [Vector2(bracket.position.x, bracket.end.y), Vector2(1, -1)], [bracket.end, Vector2(-1, -1)]]:
		var p: Vector2 = corner[0]
		var d: Vector2 = corner[1]
		draw_line(p, p + Vector2(arm * d.x, 0.0), color, 3.0)
		draw_line(p, p + Vector2(0.0, arm * d.y), color, 3.0)
	# Tick marks along the top and bottom rim, like a calibrated arena gauge.
	var ticks := 24
	for index: int in range(1, ticks):
		var x := rim.position.x + rim.size.x * float(index) / float(ticks)
		var tall := 6.0 if index % 4 == 0 else 3.0
		draw_line(Vector2(x, rim.position.y - 4.0), Vector2(x, rim.position.y - 4.0 - tall), Color(CYAN, 0.25), 1.0)
		draw_line(Vector2(x, rim.end.y + 4.0), Vector2(x, rim.end.y + 4.0 + tall), Color(CYAN, 0.25), 1.0)
