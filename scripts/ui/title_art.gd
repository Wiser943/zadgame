extends Control
## Title key art composed in code from the template's own sprites: a faint drifting
## silhouette of the Stage 1 maze, a glowing chrome runner orb with halo rings,
## orbiting sentinels, floating power-ups and ambient energy motes.

const RUNNER := preload("res://assets/template/characters/runner.png")
const SENTINEL := preload("res://assets/template/characters/sentinel.png")
const ENERGY := preload("res://assets/template/powerups/energy.png")
const OVERDRIVE := preload("res://assets/template/powerups/overdrive.png")
const SHIELD := preload("res://assets/template/powerups/shield.png")
const CYAN := Color("70b7ff")

## Hero anchor in local pixels and overall art scale; set by the owner's layout.
var hero_position := Vector2(900.0, 360.0)
var art_scale := 1.0
## 0 → 1 entrance progress (tweened by play_intro).
var intro := 1.0

var _time := 0.0
var _glow: GradientTexture2D
var _maze_rows: Array = []
var _motes: CPUParticles2D


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_glow = ScreenFactory.radial_glow(Color.WHITE)
	_maze_rows = StageCatalog.get_stage(0).get("rows", [])
	_motes = CPUParticles2D.new()
	_motes.amount = 26
	_motes.lifetime = 7.0
	_motes.preprocess = 7.0
	_motes.texture = ScreenFactory.radial_glow(Color.WHITE, 32)
	_motes.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	_motes.direction = Vector2(0.0, -1.0)
	_motes.spread = 25.0
	_motes.gravity = Vector2(0.0, -4.0)
	_motes.initial_velocity_min = 6.0
	_motes.initial_velocity_max = 18.0
	_motes.scale_amount_min = 0.12
	_motes.scale_amount_max = 0.36
	var fade := Gradient.new()
	fade.offsets = PackedFloat32Array([0.0, 0.2, 0.75, 1.0])
	fade.colors = PackedColorArray([Color(CYAN, 0.0), Color(CYAN, 0.7), Color(Color("b8dcff"), 0.45), Color(CYAN, 0.0)])
	_motes.color_ramp = fade
	add_child(_motes)
	resized.connect(_fit_motes)
	visibility_changed.connect(_sync_motion)
	_fit_motes()
	_sync_motion()


func _fit_motes() -> void:
	if _motes == null:
		return
	_motes.position = size * 0.5
	_motes.emission_rect_extents = size * 0.5


func _sync_motion() -> void:
	if _motes != null:
		_motes.emitting = is_visible_in_tree() and not ScreenFactory.reduced_motion()
		_motes.visible = _motes.emitting


func play_intro() -> void:
	if ScreenFactory.reduced_motion():
		intro = 1.0
		return
	intro = 0.0
	create_tween().tween_property(self, "intro", 1.0, 1.1).set_trans(Tween.TRANS_QUART).set_ease(Tween.EASE_OUT)


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	if not ScreenFactory.reduced_motion():
		_time += delta
	queue_redraw()


func _draw() -> void:
	var s := art_scale
	var appear := clampf(intro * 1.3, 0.0, 1.0)
	var rise := (1.0 - intro) * 70.0 * s
	var center := hero_position + Vector2(0.0, rise)
	_draw_maze(center, s, appear)
	draw_texture_rect(_glow, Rect2(center - Vector2(420.0, 420.0) * s, Vector2(840.0, 840.0) * s), false, Color(0.2, 0.45, 1.0, 0.6 * appear))
	draw_texture_rect(_glow, Rect2(center - Vector2(190.0, 190.0) * s, Vector2(380.0, 380.0) * s), false, Color(0.55, 0.8, 1.0, 0.5 * appear))
	# Halo rings: a steady inner ring and a slowly rotating dashed outer ring.
	draw_arc(center, 156.0 * s, 0.0, TAU, 96, Color(CYAN, 0.28 * appear), 1.5 * s, true)
	var dashes := 36
	for index: int in dashes:
		var start := _time * 0.12 + float(index) * TAU / float(dashes)
		draw_arc(center, 196.0 * s, start, start + TAU / float(dashes) * 0.55, 6, Color(CYAN, 0.2 * appear), 2.0 * s, true)
	draw_arc(center, 238.0 * s, -_time * 0.05, -_time * 0.05 + PI * 0.6, 48, Color(CYAN, 0.35 * appear), 2.0 * s, true)
	draw_arc(center, 238.0 * s, PI - _time * 0.05, PI - _time * 0.05 + PI * 0.25, 24, Color(CYAN, 0.2 * appear), 2.0 * s, true)
	# Orbiting sentinels (back half drawn before the hero, front half after).
	var orbit := Vector2(290.0, 120.0) * s
	var sentinels: Array[Dictionary] = []
	for index: int in 2:
		var angle := _time * 0.45 + float(index) * PI + 0.6
		var depth := sin(angle)
		sentinels.append({"pos": center + Vector2(cos(angle) * orbit.x, depth * orbit.y + 30.0 * s), "depth": depth})
	for sentinel: Dictionary in sentinels:
		if float(sentinel.depth) < 0.0:
			_draw_sprite(SENTINEL, sentinel.pos, (70.0 + 16.0 * float(sentinel.depth)) * s, appear * 0.6)
	var bob := sin(_time * 1.7) * 9.0 * s
	draw_set_transform(center + Vector2(0.0, 150.0 * s), 0.0, Vector2(1.0, 0.22))
	draw_circle(Vector2.ZERO, (96.0 - bob * 0.8) * s, Color(0.0, 0.0, 0.0, 0.35 * appear))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	_draw_sprite(RUNNER, center + Vector2(0.0, bob), 232.0 * s, appear)
	for sentinel: Dictionary in sentinels:
		if float(sentinel.depth) >= 0.0:
			_draw_sprite(SENTINEL, sentinel.pos, (70.0 + 16.0 * float(sentinel.depth)) * s, appear)
	# Floating power-ups with independent bobbing.
	_draw_sprite(OVERDRIVE, center + Vector2(-250.0, -168.0 + sin(_time * 1.3 + 1.0) * 10.0) * s, 70.0 * s, appear * 0.95)
	_draw_sprite(SHIELD, center + Vector2(262.0, -150.0 + sin(_time * 1.1 + 2.3) * 10.0) * s, 64.0 * s, appear * 0.9)
	_draw_sprite(ENERGY, center + Vector2(214.0, 196.0 + sin(_time * 1.5 + 0.4) * 8.0) * s, 34.0 * s, appear * 0.9)
	_draw_sprite(ENERGY, center + Vector2(-196.0, 178.0 + sin(_time * 1.2 + 2.0) * 8.0) * s, 26.0 * s, appear * 0.8)


func _draw_sprite(texture: Texture2D, at: Vector2, extent: float, alpha: float) -> void:
	draw_texture_rect(texture, Rect2(at - Vector2(extent, extent) * 0.5, Vector2(extent, extent)), false, Color(1.0, 1.0, 1.0, alpha))


func _draw_maze(center: Vector2, s: float, appear: float) -> void:
	if _maze_rows.is_empty():
		return
	var tile := 46.0 * s
	var columns: int = str(_maze_rows[0]).length()
	var grid := Vector2(columns, _maze_rows.size()) * tile
	var drift := Vector2(sin(_time * 0.11) * 14.0, cos(_time * 0.09) * 10.0) * s
	var origin := center - grid * 0.5 + drift
	var reach := 560.0 * s
	for row: int in _maze_rows.size():
		var line := str(_maze_rows[row])
		for column: int in line.length():
			var cell := origin + Vector2(column, row) * tile
			var mid := cell + Vector2(tile, tile) * 0.5
			var falloff := 1.0 - smoothstep(reach * 0.35, reach, mid.distance_to(center))
			if falloff <= 0.0:
				continue
			var symbol := line.substr(column, 1)
			if symbol == "#":
				# Only the wall edges that face a corridor, like the in-game maze renderer.
				var wall := Color(0.5, 0.66, 0.86, 0.3 * falloff * appear)
				draw_rect(Rect2(cell, Vector2(tile, tile)), Color(0.35, 0.5, 0.75, 0.035 * falloff * appear))
				for edge: Array in [[Vector2i(0, -1), Vector2(0, 0), Vector2(1, 0)], [Vector2i(0, 1), Vector2(0, 1), Vector2(1, 1)], [Vector2i(-1, 0), Vector2(0, 0), Vector2(0, 1)], [Vector2i(1, 0), Vector2(1, 0), Vector2(1, 1)]]:
					var n: Vector2i = Vector2i(column, row) + edge[0]
					if n.y < 0 or n.y >= _maze_rows.size() or n.x < 0 or n.x >= line.length():
						continue
					if str(_maze_rows[n.y]).substr(n.x, 1) != "#":
						draw_line(cell + (edge[1] as Vector2) * tile, cell + (edge[2] as Vector2) * tile, wall, 1.5 * s)
			elif symbol in [".", "o"]:
				var twinkle := 0.55 + 0.45 * sin(_time * 2.2 + float(row * 7 + column * 3))
				draw_circle(mid, (3.0 if symbol == "." else 6.0) * s, Color(CYAN, 0.55 * falloff * twinkle * appear))
