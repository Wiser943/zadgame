extends Control

signal location_selected(location_id: String)

const WORLD_SIZE := Vector2(1180.0, 760.0)
const VIOLET := Color("8b5cf6")
const CYAN := Color("46d7c6")
const INK := Color("1b2744")
const MUTED := Color("60708e")

var zoom := 0.92
var camera := Vector2(590.0, 380.0)
var player_world := Vector2(470.0, 466.0)
var destination_world := Vector2(-1.0, -1.0)
var selected_id := "nexus"
var _dragging := false
var _drag_origin := Vector2.ZERO
var _camera_origin := Vector2.ZERO
var _did_drag := false
var _pulse := 0.0

var locations: Dictionary = {
	"nexus": {
		"name": "The Nexus",
		"short": "NEXUS",
		"kind": "COMMUNITY HUB",
		"pos": Vector2(588.0, 358.0),
		"color": Color("8b5cf6"),
		"description": "A bright meeting point where routes, ideas and new faces cross.",
		"tagline": "Make a first connection",
		"activities": ["connect", "wander"]
	},
	"northline": {
		"name": "Northline Market",
		"short": "NORTHLINE",
		"kind": "MARKET DISTRICT",
		"pos": Vector2(348.0, 180.0),
		"color": Color("f6b94f"),
		"description": "A lively strip of stalls, small businesses and the city’s best street stories.",
		"tagline": "Find your next opportunity",
		"activities": ["work", "wander"]
	},
	"sunroom": {
		"name": "Sunroom Gardens",
		"short": "SUNROOM",
		"kind": "CULTURE + LEISURE",
		"pos": Vector2(870.0, 184.0),
		"color": Color("f47fb5"),
		"description": "A green rooftop quarter for music, quiet time and easy conversations.",
		"tagline": "Reset your rhythm",
		"activities": ["rest", "culture"]
	},
	"maker": {
		"name": "Maker Row",
		"short": "MAKER ROW",
		"kind": "WORK QUARTER",
		"pos": Vector2(210.0, 516.0),
		"color": Color("39b9df"),
		"description": "Studios, repair shops and independent teams building useful things together.",
		"tagline": "Turn time into momentum",
		"activities": ["work", "connect"]
	},
	"harbor": {
		"name": "Harbor Steps",
		"short": "HARBOR",
		"kind": "TRANSIT + WATER",
		"pos": Vector2(904.0, 548.0),
		"color": Color("46d7c6"),
		"description": "A waterside interchange with slow routes, quick rides and room to breathe.",
		"tagline": "Take the scenic route",
		"activities": ["wander", "rest"]
	},
	"courtyard": {
		"name": "Courtyard 9",
		"short": "COURTYARD",
		"kind": "SOCIAL BLOCK",
		"pos": Vector2(520.0, 610.0),
		"color": Color("ef7e58"),
		"description": "A welcoming block of food, games and familiar faces after a long day.",
		"tagline": "Show up as you are",
		"activities": ["connect", "culture"]
	}
}

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_ALL
	set_process(true)
	queue_redraw()

func _process(delta: float) -> void:
	_pulse += delta
	if destination_world.x >= 0.0:
		player_world = player_world.lerp(destination_world, minf(delta * 5.0, 1.0))
		if player_world.distance_to(destination_world) < 2.0:
			player_world = destination_world
			destination_world = Vector2(-1.0, -1.0)
	queue_redraw()

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		queue_redraw()

func get_location_info(location_id: String) -> Dictionary:
	return (locations.get(location_id, locations["nexus"]) as Dictionary).duplicate(true)

func set_selected_location(location_id: String) -> void:
	if not locations.has(location_id):
		return
	selected_id = location_id
	var info: Dictionary = locations[location_id]
	destination_world = info.pos
	queue_redraw()

func screen_to_world(screen_point: Vector2) -> Vector2:
	var origin := size * 0.5 - camera * zoom
	return (screen_point - origin) / zoom

func world_to_screen(world_point: Vector2) -> Vector2:
	return size * 0.5 - camera * zoom + world_point * zoom

func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mouse_event := event as InputEventMouseButton
		if mouse_event.button_index == MOUSE_BUTTON_LEFT:
			if mouse_event.pressed:
				_dragging = true
				_did_drag = false
				_drag_origin = mouse_event.position
				_camera_origin = camera
				accept_event()
			else:
				if _dragging and not _did_drag:
					var world := screen_to_world(mouse_event.position)
					var hit := _location_at(world)
					if not hit.is_empty():
						selected_id = str(hit.id)
						location_selected.emit(selected_id)
				_dragging = false
				accept_event()
		elif mouse_event.button_index == MOUSE_BUTTON_WHEEL_UP or mouse_event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			var before := screen_to_world(mouse_event.position)
			var multiplier := 1.08 if mouse_event.button_index == MOUSE_BUTTON_WHEEL_UP else 0.92
			zoom = clampf(zoom * multiplier, 0.72, 1.45)
			var after := screen_to_world(mouse_event.position)
			camera += before - after
			accept_event()
	elif event is InputEventMouseMotion and _dragging:
		var motion := event as InputEventMouseMotion
		if motion.position.distance_to(_drag_origin) > 5.0:
			_did_drag = true
			camera = _camera_origin - motion.position / zoom + _drag_origin / zoom
			camera.x = clampf(camera.x, 130.0, WORLD_SIZE.x - 130.0)
			camera.y = clampf(camera.y, 110.0, WORLD_SIZE.y - 110.0)
			accept_event()

func _unhandled_key_input(event: InputEvent) -> void:
	if event.pressed and event.keycode == KEY_ESCAPE:
		return
	if event is InputEventKey and event.pressed:
		var step := 44.0 / zoom
		if event.keycode in [KEY_A, KEY_LEFT]:
			camera.x -= step
		elif event.keycode in [KEY_D, KEY_RIGHT]:
			camera.x += step
		elif event.keycode in [KEY_W, KEY_UP]:
			camera.y -= step
		elif event.keycode in [KEY_S, KEY_DOWN]:
			camera.y += step
		else:
			return
		camera.x = clampf(camera.x, 130.0, WORLD_SIZE.x - 130.0)
		camera.y = clampf(camera.y, 110.0, WORLD_SIZE.y - 110.0)
		accept_event()

func _location_at(world_point: Vector2) -> Dictionary:
	for location_id: String in locations:
		var info: Dictionary = locations[location_id]
		if world_point.distance_to(info.pos) <= 48.0:
			return {"id": location_id, "info": info}
	return {}

func _draw() -> void:
	var bg := Color("eef3fb")
	draw_rect(Rect2(Vector2.ZERO, size), bg)
	var origin := size * 0.5 - camera * zoom
	draw_set_transform(origin, 0.0, Vector2(zoom, zoom))
	_draw_world()
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	_draw_controls()

func _draw_world() -> void:
	draw_rect(Rect2(Vector2.ZERO, WORLD_SIZE), Color("e8eef9"))
	# Soft district fields give the map a readable, illustrated atlas feel.
	draw_style_box(_box(Color("e1e9f7"), Color("cbd7ec"), 22.0, 1.0), Rect2(76, 70, 445, 260))
	draw_style_box(_box(Color("e7edf8"), Color("cbd7ec"), 22.0, 1.0), Rect2(650, 62, 438, 282))
	draw_style_box(_box(Color("e4edf8"), Color("cbd7ec"), 22.0, 1.0), Rect2(58, 385, 450, 290))
	draw_style_box(_box(Color("e8edf7"), Color("cbd7ec"), 22.0, 1.0), Rect2(600, 392, 478, 296))
	# River and shoreline.
	var river := PackedVector2Array([Vector2(690, -20), Vector2(830, -20), Vector2(780, 120), Vector2(860, 240), Vector2(790, 356), Vector2(860, 490), Vector2(780, 790), Vector2(610, 790), Vector2(692, 650), Vector2(640, 522), Vector2(720, 398), Vector2(662, 255), Vector2(748, 120)])
	draw_colored_polygon(river, Color("d9edf1"))
	var shore := PackedVector2Array([Vector2(690, -20), Vector2(830, -20), Vector2(780, 120), Vector2(860, 240), Vector2(790, 356), Vector2(860, 490), Vector2(780, 790)])
	draw_polyline(shore, Color("9bbbc8"), 5.0, true)
	# Main transit arteries.
	var roads := [
		PackedVector2Array([Vector2(30, 365), Vector2(240, 365), Vector2(420, 330), Vector2(610, 358), Vector2(760, 366), Vector2(1145, 388)]),
		PackedVector2Array([Vector2(286, 26), Vector2(322, 190), Vector2(434, 300), Vector2(524, 420), Vector2(520, 730)]),
		PackedVector2Array([Vector2(103, 615), Vector2(290, 560), Vector2(468, 534), Vector2(665, 522), Vector2(1115, 546)]),
		PackedVector2Array([Vector2(590, 36), Vector2(578, 192), Vector2(588, 358), Vector2(600, 515), Vector2(625, 733)])
	]
	for road: PackedVector2Array in roads:
		draw_polyline(road, Color("c9d5e8"), 25.0, true)
		draw_polyline(road, Color("8fa2bd"), 2.0, true)
	# Neighborhood texture: small blocks and trees.
	_draw_city_blocks()
	_draw_residents()
	_draw_route()
	# District titles.
	_draw_text(Vector2(112, 112), "NORTHLINE", Color("263858"), 16)
	_draw_text(Vector2(112, 133), "MARKET DISTRICT", MUTED, 10)
	_draw_text(Vector2(770, 108), "SUNROOM", Color("263858"), 16)
	_draw_text(Vector2(770, 129), "GARDENS + CULTURE", MUTED, 10)
	_draw_text(Vector2(112, 437), "MAKER ROW", Color("263858"), 16)
	_draw_text(Vector2(112, 458), "WORK QUARTER", MUTED, 10)
	_draw_text(Vector2(716, 448), "HARBOR BELT", Color("263858"), 16)
	_draw_text(Vector2(716, 469), "TRANSIT + WATER", MUTED, 10)
	# Location markers.
	for location_id: String in locations:
		_draw_location(location_id, locations[location_id] as Dictionary)
	_draw_avatar(player_world)
	# World frame.
	draw_rect(Rect2(Vector2.ZERO, WORLD_SIZE), Color("a5b5cf"), false, 2.0)

func _draw_city_blocks() -> void:
	var blocks := [
		Rect2(144, 164, 72, 42), Rect2(236, 116, 84, 52), Rect2(367, 112, 60, 58), Rect2(414, 190, 86, 48),
		Rect2(152, 236, 98, 44), Rect2(284, 228, 62, 55), Rect2(382, 264, 94, 36), Rect2(818, 154, 76, 48),
		Rect2(946, 120, 76, 58), Rect2(844, 234, 52, 44), Rect2(956, 244, 96, 48), Rect2(136, 490, 74, 50),
		Rect2(272, 430, 88, 40), Rect2(146, 585, 100, 48), Rect2(320, 574, 72, 58), Rect2(720, 580, 82, 48),
		Rect2(840, 490, 65, 48), Rect2(982, 596, 72, 54)
	]
	for i in blocks.size():
		var color := Color("d2ddef") if i % 3 else Color("d8e2f2")
		draw_style_box(_box(color, Color("c0cde4"), 9.0, 1.0), blocks[i])
		var window_color := Color("8094b6", 0.55)
		for col in range(2):
			for row in range(2):
				draw_rect(Rect2(blocks[i].position + Vector2(13 + col * 24, 10 + row * 14), Vector2(9, 5)), window_color)
	# Pocket parks.
	for tree in [Vector2(146, 330), Vector2(185, 347), Vector2(226, 330), Vector2(1040, 348), Vector2(1000, 328), Vector2(408, 650), Vector2(452, 674), Vector2(1024, 468)]:
		draw_circle(tree, 11.0, Color("b9d9d5"))
		draw_circle(tree + Vector2(-3, -4), 6.0, Color("6fa99b"))

func _draw_residents() -> void:
	var residents := [
		{"pos": Vector2(330.0, 270.0), "color": Color("f6b94f"), "name": "KAI"},
		{"pos": Vector2(820.0, 302.0), "color": Color("f47fb5"), "name": "ZURI"},
		{"pos": Vector2(760.0, 604.0), "color": Color("46d7c6"), "name": "JULES"}
	]
	for resident: Dictionary in residents:
		var point: Vector2 = resident.pos
		var color: Color = resident.color
		_draw_ellipse(point + Vector2(0, 12), Vector2(10, 4), Color("526480", 0.18))
		draw_circle(point + Vector2(0, 1), 8.0, color)
		draw_circle(point + Vector2(0, -9), 6.0, Color("ffd0a8"))
		draw_arc(point + Vector2(0, -9), 6.0, PI, TAU, 10, Color("31224b"), 3.0)
		draw_circle(point + Vector2(-2, -10), 1.2, Color("ffffff"))
		draw_circle(point + Vector2(2, -10), 1.2, Color("ffffff"))
		draw_circle(point + Vector2(-2, -10), 0.6, INK)
		draw_circle(point + Vector2(2, -10), 0.6, INK)
		_draw_text(point + Vector2(14, 4), str(resident.name), Color("60708e"), 9)

func _draw_route() -> void:
	var selected: Dictionary = locations.get(selected_id, {})
	if selected.is_empty():
		return
	var route := PackedVector2Array([player_world, Vector2((player_world.x + selected.pos.x) * 0.5, player_world.y), selected.pos])
	draw_polyline(route, Color(VIOLET, 0.3), 10.0, true)
	draw_polyline(route, Color(VIOLET, 0.9), 2.0, true)
	for point in [player_world, selected.pos]:
		draw_circle(point, 5.0, Color(VIOLET, 0.8))

func _draw_location(location_id: String, info: Dictionary) -> void:
	var point: Vector2 = info.pos
	var color: Color = info.color
	var is_selected := location_id == selected_id
	var pulse := (sin(_pulse * 2.2) + 1.0) * 0.5 if is_selected else 0.0
	if is_selected:
		draw_circle(point, 37.0 + pulse * 8.0, Color(color, 0.12))
		draw_circle(point, 29.0 + pulse * 4.0, Color(color, 0.16), false, 2.0)
	draw_circle(point, 20.0, Color("ffffff"))
	draw_circle(point, 17.0, color)
	draw_circle(point, 17.0, Color("ffffff", 0.35), false, 2.0)
	# A tiny pictogram keeps each zone distinct without relying on external assets.
	if location_id == "harbor":
		draw_line(point + Vector2(-8, 3), point + Vector2(8, 3), Color.WHITE, 2.0)
		draw_line(point + Vector2(-5, 3), point + Vector2(0, -5), Color.WHITE, 2.0)
		draw_line(point + Vector2(0, -5), point + Vector2(7, 3), Color.WHITE, 2.0)
	elif location_id == "sunroom":
		draw_circle(point, 5.0, Color.WHITE, false, 2.0)
		draw_line(point + Vector2(0, -9), point + Vector2(0, 9), Color.WHITE, 2.0)
		draw_line(point + Vector2(-9, 0), point + Vector2(9, 0), Color.WHITE, 2.0)
	else:
		draw_rect(Rect2(point - Vector2(6, 6), Vector2(12, 12)), Color.WHITE, false, 2.0)
	_draw_text(point + Vector2(28, 5), str(info.short), Color("263858"), 12)
	_draw_text(point + Vector2(28, 21), str(info.kind), Color("60708e"), 9)

func _draw_avatar(point: Vector2) -> void:
	# Shadow, body and bright head make the player easy to read at every zoom.
	_draw_ellipse(point + Vector2(0, 17), Vector2(18, 7), Color("526480", 0.25))
	draw_circle(point + Vector2(0, 4), 13.0, Color("f08b66"))
	draw_circle(point + Vector2(0, -10), 9.0, Color("ffd0a8"))
	draw_arc(point + Vector2(0, -10), 9.0, PI, TAU, 12, Color("31224b"), 4.0)
	draw_line(point + Vector2(-7, 9), point + Vector2(-12, 22), Color("e0b3ff"), 4.0)
	draw_line(point + Vector2(7, 9), point + Vector2(12, 22), Color("e0b3ff"), 4.0)
	draw_circle(point + Vector2(0, -11), 2.0, Color("ffffff"))
	draw_circle(point + Vector2(0, -11), 1.0, INK)

func _draw_controls() -> void:
	var pad := 18.0
	var help_rect := Rect2(Vector2(pad, size.y - 54.0), Vector2(300.0, 36.0))
	draw_style_box(_box(Color("101a38", 0.92), Color("31436d", 0.85), 12.0, 1.0), help_rect)
	_draw_screen_text(help_rect.position + Vector2(14, 23), "DRAG TO EXPLORE   •   SCROLL TO ZOOM", Color("60708e"), 11)
	var north := Rect2(size - Vector2(64, 62), Vector2(42, 42))
	draw_style_box(_box(Color("101a38", 0.92), Color(VIOLET, 0.7), 12.0, 1.0), north)
	_draw_screen_text(north.position + Vector2(16, 27), "N", Color("e9ddff"), 14)

func _box(bg: Color, border: Color, radius: float, width: float) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = bg
	box.border_color = border
	box.set_border_width_all(int(width))
	box.set_corner_radius_all(int(radius))
	return box

func _draw_text(point: Vector2, text: String, color: Color, font_size: int) -> void:
	draw_string(ThemeDB.fallback_font, point, text, HORIZONTAL_ALIGNMENT_LEFT, -1.0, font_size, color)

func _draw_screen_text(point: Vector2, text: String, color: Color, font_size: int) -> void:
	draw_string(ThemeDB.fallback_font, point, text, HORIZONTAL_ALIGNMENT_LEFT, -1.0, font_size, color)

func _draw_ellipse(center: Vector2, radius: Vector2, color: Color) -> void:
	var points := PackedVector2Array()
	for i in 24:
		var angle := TAU * float(i) / 24.0
		points.append(center + Vector2(cos(angle) * radius.x, sin(angle) * radius.y))
	draw_colored_polygon(points, color)
