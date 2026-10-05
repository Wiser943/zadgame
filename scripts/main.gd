extends Control

const MapCanvasType := preload("res://scripts/game/map_canvas.gd")

const BG := Color("f4f7ff")
const PANEL := Color("ffffff")
const PANEL_2 := Color("eef2fb")
const BORDER := Color("d5ddef")
const TEXT := Color("1b2744")
const MUTED := Color("60708e")
const VIOLET := Color("8b5cf6")
const CYAN := Color("118f87")
const ORANGE := Color("a56b00")

var _map: Control
var _story_panel: PanelContainer
var _details_panel: PanelContainer
var _story_content: VBoxContainer
var _details_content: VBoxContainer
var _action_box: VBoxContainer
var _status_label: Label
var _toast_label: Label
var _credits_label: Label
var _energy_label: Label
var _connections_label: Label
var _xp_label: Label
var _selected_name: Label
var _selected_kind: Label
var _selected_description: Label
var _selected_tagline: Label
var _selected_badge: Label
var _player_name_label: Label
var _player_status_label: Label
var _title_overlay: Control
var _title_start_button: Button
var _phone_overlay: Control
var _phone_content: VBoxContainer
var _phone_title: Label
var _phone_search: LineEdit
var _phone_app := "home"
var _current_location_id := "nexus"
var _started := false
var _state := {
	"credits": 240,
	"energy": 78,
	"connections": 4,
	"xp": 120,
	"days": 1,
	"player_name": "MAYA",
	"player_status": "Open to new routes",
	"contacts": [
		{"name": "Kemi A.", "handle": "@kemi", "role": "Maker Row", "connected": false},
		{"name": "Zuri N.", "handle": "@zuri", "role": "Sunroom Gardens", "connected": true},
		{"name": "Jules O.", "handle": "@jules", "role": "Harbor Steps", "connected": false}
	],
	"messages": [
		{"from": "Zuri N.", "text": "Sunroom is lively today. Come say hi?", "read": false},
		{"from": "All Connect", "text": "Your route to Maker Row is ready.", "read": true}
	]
}

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_load_state()
	_build_interface()
	_update_hud()
	_select_location("nexus")
	_show_title()
	get_viewport().size_changed.connect(_responsive_layout)
	call_deferred("_responsive_layout")

func _build_interface() -> void:
	var background := ColorRect.new()
	background.color = BG
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(background)

	var outer := MarginContainer.new()
	outer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	outer.add_theme_constant_override("margin_left", 22)
	outer.add_theme_constant_override("margin_top", 18)
	outer.add_theme_constant_override("margin_right", 22)
	outer.add_theme_constant_override("margin_bottom", 18)
	add_child(outer)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 14)
	outer.add_child(column)

	var header := _build_header()
	header.custom_minimum_size.y = 68
	column.add_child(header)

	var body := HBoxContainer.new()
	body.name = "GameBody"
	body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 14)
	column.add_child(body)

	_story_panel = _panel(PANEL, BORDER, 18)
	_story_panel.custom_minimum_size = Vector2(228, 0)
	body.add_child(_story_panel)
	_story_content = VBoxContainer.new()
	_story_content.add_theme_constant_override("separation", 12)
	_story_panel.add_child(_story_content)
	_build_story_panel()

	var map_panel := _panel(Color("111b39"), BORDER, 20)
	map_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	body.add_child(map_panel)
	_map = MapCanvasType.new()
	_map.name = "ConnectedCityMap"
	_map.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_map.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_map.focus_mode = Control.FOCUS_ALL
	_map.location_selected.connect(_select_location)
	map_panel.add_child(_map)

	_details_panel = _panel(PANEL, BORDER, 18)
	_details_panel.custom_minimum_size = Vector2(316, 0)
	body.add_child(_details_panel)
	_details_content = VBoxContainer.new()
	_details_content.add_theme_constant_override("separation", 12)
	_details_panel.add_child(_details_content)
	_build_details_panel()

	var footer := HBoxContainer.new()
	footer.custom_minimum_size.y = 25
	var footer_label := _label("ALL CONNECT  /  A SMALL CITY, MANY WAYS TO BELONG", 11, MUTED)
	footer_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(footer_label)
	_status_label = _label("LOCAL SAVE READY", 11, CYAN)
	footer.add_child(_status_label)
	var phone_button := _secondary_button("▣  PHONE")
	phone_button.custom_minimum_size = Vector2(112, 30)
	phone_button.pressed.connect(_open_phone)
	footer.add_child(phone_button)
	column.add_child(footer)

	_toast_label = _label("", 13, TEXT)
	_toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_toast_label.visible = false
	_toast_label.z_index = 12
	_toast_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP, Control.PRESET_MODE_MINSIZE, 30)
	_toast_label.position.y = 88
	add_child(_toast_label)

	_build_title_overlay()
	_build_phone_overlay()

func _build_header() -> Control:
	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 14)
	var brand := VBoxContainer.new()
	brand.custom_minimum_size.x = 238
	brand.add_theme_constant_override("separation", 0)
	var eyebrow := _label("CITY OPERATING SYSTEM", 10, VIOLET)
	brand.add_child(eyebrow)
	var logo := _label("ALL CONNECT", 27, TEXT)
	logo.add_theme_color_override("font_shadow_color", Color(VIOLET, 0.45))
	logo.add_theme_constant_override("shadow_offset_x", 0)
	logo.add_theme_constant_override("shadow_offset_y", 3)
	brand.add_child(logo)
	header.add_child(brand)
	var rule := ColorRect.new()
	rule.color = BORDER
	rule.custom_minimum_size = Vector2(1, 38)
	rule.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	header.add_child(rule)
	var context := VBoxContainer.new()
	context.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	context.add_theme_constant_override("separation", 1)
	context.add_child(_label("DAY 01  /  CITY PASS ACTIVE", 11, MUTED))
	context.add_child(_label("Your next connection is closer than you think.", 13, TEXT))
	header.add_child(context)
	_credits_label = _chip("◈  240 CREDITS", ORANGE)
	_energy_label = _chip("ϟ  78 ENERGY", CYAN)
	_connections_label = _chip("✦  4 CONNECTIONS", VIOLET)
	_xp_label = _chip("LEVEL 02", Color("f47fb5"))
	for chip in [_credits_label, _energy_label, _connections_label, _xp_label]:
		header.add_child(chip)
	return header

func _build_story_panel() -> void:
	_story_content.add_child(_label("YOUR STORY", 11, VIOLET))
	var avatar_card := _panel(PANEL_2, BORDER, 14)
	_story_content.add_child(avatar_card)
	var avatar_box := VBoxContainer.new()
	avatar_box.add_theme_constant_override("separation", 4)
	avatar_card.add_child(avatar_box)
	var avatar_row := HBoxContainer.new()
	avatar_row.add_theme_constant_override("separation", 10)
	var avatar_mark := _avatar_mark()
	avatar_row.add_child(avatar_mark)
	var avatar_meta := VBoxContainer.new()
	avatar_meta.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_player_name_label = _label(str(_state.player_name), 18, TEXT)
	avatar_meta.add_child(_player_name_label)
	_player_status_label = _label(str(_state.player_status), 11, CYAN)
	_player_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	avatar_meta.add_child(_player_status_label)
	avatar_row.add_child(avatar_meta)
	avatar_box.add_child(avatar_row)
	avatar_box.add_child(_label("DAY 01  ·  STARTER ROUTE", 10, MUTED))
	_story_content.add_child(_label("TODAY'S THREAD", 11, MUTED))
	var thread := _panel(Color("f5f7fc"), Color("d5ddef"), 12)
	_story_content.add_child(thread)
	var thread_box := VBoxContainer.new()
	thread_box.add_theme_constant_override("separation", 6)
	thread.add_child(thread_box)
	thread_box.add_child(_label("Find one useful thing", 13, TEXT))
	thread_box.add_child(_label("Visit a place. Do one thing. Leave with a little more city than you arrived with.", 11, MUTED))
	var progress := ProgressBar.new()
	progress.value = 58
	progress.custom_minimum_size.y = 6
	progress.show_percentage = false
	progress.add_theme_stylebox_override("background", _box(Color("25345a"), Color("25345a"), 4, 0))
	progress.add_theme_stylebox_override("fill", _box(VIOLET, VIOLET, 4, 0))
	thread_box.add_child(progress)
	_story_content.add_spacer(false)
	_story_content.add_child(_label("QUICK ROUTES", 11, MUTED))
	for item in [["Nexus", "Start here", "nexus"], ["Northline", "Work + trade", "northline"], ["Sunroom", "Culture + rest", "sunroom"]]:
		var button := _quiet_button("→  %s   %s" % [item[0], item[1]])
		button.pressed.connect(_select_location.bind(str(item[2])))
		_story_content.add_child(button)
	_story_content.add_spacer(false)
	var save_note := _label("Progress saves on this device.\nNo account needed for this first route.", 10, MUTED)
	save_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_story_content.add_child(save_note)

func _build_details_panel() -> void:
	_details_content.add_child(_label("SELECTED DESTINATION", 11, VIOLET))
	_selected_badge = _pill("COMMUNITY HUB", VIOLET)
	_details_content.add_child(_selected_badge)
	_selected_name = _label("The Nexus", 28, TEXT)
	_selected_name.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_details_content.add_child(_selected_name)
	_selected_kind = _label("A PLACE TO BEGIN", 10, CYAN)
	_details_content.add_child(_selected_kind)
	_selected_description = _label("", 13, MUTED)
	_selected_description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_details_content.add_child(_selected_description)
	_selected_tagline = _label("", 12, TEXT)
	_selected_tagline.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_details_content.add_child(_selected_tagline)
	var separator := HSeparator.new()
	separator.modulate = Color(BORDER, 0.8)
	_details_content.add_child(separator)
	_details_content.add_child(_label("WHAT WILL YOU DO?", 11, MUTED))
	_action_box = VBoxContainer.new()
	_action_box.add_theme_constant_override("separation", 8)
	_details_content.add_child(_action_box)
	_details_content.add_spacer(false)
	var hint := _panel(Color("f5f7fc"), Color("d5ddef"), 12)
	_details_content.add_child(hint)
	var hint_box := VBoxContainer.new()
	hint_box.add_theme_constant_override("separation", 4)
	hint.add_child(hint_box)
	hint_box.add_child(_label("MAP TIP", 10, VIOLET))
	hint_box.add_child(_label("Click a marker to set a route. Drag the map to scan the city.", 11, MUTED))

func _build_title_overlay() -> void:
	_title_overlay = Control.new()
	_title_overlay.name = "WelcomeOverlay"
	_title_overlay.z_index = 20
	_title_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(_title_overlay)
	var shade := ColorRect.new()
	shade.color = Color("e9effb", 0.86)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_title_overlay.add_child(shade)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_title_overlay.add_child(center)
	var card := _panel(Color("ffffff", 0.98), Color(VIOLET, 0.75), 24)
	card.custom_minimum_size = Vector2(590, 430)
	center.add_child(card)
	var content := VBoxContainer.new()
	content.alignment = BoxContainer.ALIGNMENT_CENTER
	content.add_theme_constant_override("separation", 14)
	card.add_child(content)
	content.add_child(_label("A SOCIAL MAP FOR CURIOUS PEOPLE", 11, CYAN))
	var title := _label("ALL CONNECT", 54, TEXT)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_color_override("font_shadow_color", Color(VIOLET, 0.55))
	title.add_theme_constant_override("shadow_offset_y", 5)
	content.add_child(title)
	var line := ColorRect.new()
	line.color = VIOLET
	line.custom_minimum_size = Vector2(70, 3)
	line.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	content.add_child(line)
	var copy := _label("A small city. Many ways to belong.\nTake a route, meet the neighborhood, leave a little more connected.", 16, MUTED)
	copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(copy)
	content.add_spacer(false)
	_title_start_button = _primary_button("ENTER THE CITY  →")
	_title_start_button.custom_minimum_size = Vector2(280, 52)
	_title_start_button.pressed.connect(_enter_city)
	content.add_child(_title_start_button)
	var note := _label("FIRST ROUTE  /  LOCAL SAVE  /  NO ACCOUNT REQUIRED", 10, Color("7388b1"))
	note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	content.add_child(note)

func _enter_city() -> void:
	_started = true
	_title_overlay.visible = false
	_status_label.text = "ROUTE ACTIVE  ·  LOCAL SAVE READY"
	_map.grab_focus()
	_show_toast("Welcome to All Connect. Choose your first stop.", CYAN)

func _show_title() -> void:
	_title_overlay.visible = true

func _select_location(location_id: String) -> void:
	_current_location_id = location_id
	var info: Dictionary = _map.get_location_info(location_id)
	_map.set_selected_location(location_id)
	_selected_name.text = str(info.name)
	_selected_kind.text = str(info.kind)
	_selected_description.text = str(info.description)
	_selected_tagline.text = "“%s”" % str(info.tagline)
	_selected_badge.text = "  %s  " % str(info.kind)
	_selected_badge.add_theme_color_override("font_color", info.color)
	for child in _action_box.get_children():
		child.queue_free()
	for action: String in info.activities:
		var button := _primary_button(_action_label(action)) if action == "connect" else _secondary_button(_action_label(action))
		button.pressed.connect(_perform_action.bind(action))
		_action_box.add_child(button)
	var route_button := _quiet_button("↗  SET ROUTE TO %s" % str(info.short))
	route_button.pressed.connect(_set_route)
	_action_box.add_child(route_button)
	if _started:
		_show_toast("Route set: %s" % str(info.name), info.color)

func _set_route() -> void:
	_map.set_selected_location(_current_location_id)
	_show_toast("Route plotted. Follow the violet line.", VIOLET)

func _perform_action(action: String) -> void:
	var info: Dictionary = _map.get_location_info(_current_location_id)
	var message := ""
	var color := CYAN
	match action:
		"connect":
			_state.connections = int(_state.connections) + 1
			_state.xp = int(_state.xp) + 18
			_state.energy = maxi(0, int(_state.energy) - 7)
			_state.player_status = "A little more connected"
			message = "You made a useful connection at %s." % str(info.name)
			color = VIOLET
		"work":
			_state.credits = int(_state.credits) + 38
			_state.xp = int(_state.xp) + 24
			_state.energy = maxi(0, int(_state.energy) - 12)
			_state.player_status = "Building momentum"
			message = "A good shift at %s. +38 credits." % str(info.name)
			color = ORANGE
		"culture":
			_state.connections = int(_state.connections) + 1
			_state.xp = int(_state.xp) + 12
			_state.energy = maxi(0, int(_state.energy) - 5)
			_state.player_status = "In a better rhythm"
			message = "You found a new rhythm at %s." % str(info.name)
			color = Color("f47fb5")
		"rest":
			_state.energy = mini(100, int(_state.energy) + 20)
			_state.xp = int(_state.xp) + 4
			_state.player_status = "Ready for another route"
			message = "A softer pace at %s. +20 energy." % str(info.name)
			color = CYAN
		"wander":
			_state.xp = int(_state.xp) + 7
			_state.energy = maxi(0, int(_state.energy) - 3)
			_state.player_status = "Learning the city"
			message = "You took the long way through %s." % str(info.name)
			color = Color("f6b94f")
	_save_state()
	_update_hud()
	_show_toast(message, color)

func _update_hud() -> void:
	if _credits_label == null:
		return
	_credits_label.text = "◈  %03d CREDITS" % int(_state.credits)
	_energy_label.text = "ϟ  %02d ENERGY" % int(_state.energy)
	_connections_label.text = "✦  %d CONNECTIONS" % int(_state.connections)
	_xp_label.text = "LEVEL %02d" % (1 + int(_state.xp) / 100)
	if _player_name_label != null:
		_player_name_label.text = str(_state.player_name)
		_player_status_label.text = str(_state.player_status)

func _responsive_layout() -> void:
	var width := size.x if size.x > 0.0 else get_viewport_rect().size.x
	if _story_panel == null:
		return
	_story_panel.visible = width >= 900.0
	_story_panel.custom_minimum_size.x = 228.0 if width >= 1100.0 else 196.0
	_details_panel.custom_minimum_size.x = 316.0 if width >= 980.0 else 268.0

func _apply_responsive_layout() -> void:
	_responsive_layout()

func _load_state() -> void:
	var path := "user://all_connect_save.json"
	if not FileAccess.file_exists(path):
		return
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	file.close()
	if parsed is Dictionary:
		for key: String in _state:
			if parsed.has(key):
				_state[key] = parsed[key]

func _save_state() -> void:
	var file := FileAccess.open("user://all_connect_save.json", FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify(_state, "  "))
	file.close()
	if _status_label != null:
		_status_label.text = "LOCAL SAVE UPDATED  ·  %02d CONNECTIONS" % int(_state.connections)

func _show_toast(message: String, color: Color) -> void:
	if _toast_label == null:
		return
	_toast_label.text = message
	_toast_label.add_theme_color_override("font_color", color)
	_toast_label.visible = true
	var tween := create_tween()
	tween.tween_interval(2.2)
	tween.tween_property(_toast_label, "modulate:a", 0.0, 0.25)
	tween.tween_callback(func() -> void:
		_toast_label.visible = false
		_toast_label.modulate.a = 1.0
	)

func _avatar_mark() -> Control:
	var mark := ColorRect.new()
	mark.custom_minimum_size = Vector2(44, 44)
	mark.color = Color("dfe6f7")
	mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return mark

func _panel(bg: Color, border: Color, radius: int) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _box(bg, border, radius, 1))
	return panel

func _box(bg: Color, border: Color, radius: int, width: int) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = bg
	style.border_color = border
	style.set_border_width_all(width)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 14
	style.content_margin_bottom = 14
	return style

func _label(text: String, size: int, color: Color) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", color)
	return label

func _chip(text: String, color: Color) -> Label:
	var chip := _label(text, 11, color)
	chip.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	chip.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	chip.custom_minimum_size = Vector2(118, 34)
	chip.add_theme_stylebox_override("normal", _box(Color(color, 0.1), Color(color, 0.35), 10, 1))
	return chip

func _pill(text: String, color: Color) -> Label:
	var pill := _label("  %s  " % text, 10, color)
	pill.custom_minimum_size.y = 24
	pill.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	return pill

func _primary_button(text: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 42
	button.add_theme_font_size_override("font_size", 12)
	button.add_theme_color_override("font_color", Color.WHITE)
	button.add_theme_stylebox_override("normal", _box(VIOLET, Color("a78bfa"), 10, 1))
	button.add_theme_stylebox_override("hover", _box(Color("9c72ff"), Color.WHITE, 10, 1))
	button.add_theme_stylebox_override("pressed", _box(Color("7043d8"), Color.WHITE, 10, 1))
	button.add_theme_stylebox_override("focus", _box(Color("9c72ff"), Color.WHITE, 10, 2))
	return button

func _secondary_button(text: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 42
	button.add_theme_font_size_override("font_size", 12)
	button.add_theme_color_override("font_color", TEXT)
	button.add_theme_stylebox_override("normal", _box(PANEL_2, BORDER, 10, 1))
	button.add_theme_stylebox_override("hover", _box(Color("243563"), VIOLET, 10, 1))
	button.add_theme_stylebox_override("pressed", _box(Color("1c2b55"), VIOLET, 10, 1))
	button.add_theme_stylebox_override("focus", _box(Color("243563"), Color("c4b5fd"), 10, 2))
	return button

func _quiet_button(text: String) -> Button:
	var button := Button.new()
	button.text = text
	button.alignment = HORIZONTAL_ALIGNMENT_LEFT
	button.custom_minimum_size.y = 32
	button.add_theme_font_size_override("font_size", 11)
	button.add_theme_color_override("font_color", MUTED)
	button.add_theme_color_override("font_hover_color", TEXT)
	button.add_theme_stylebox_override("normal", _box(Color("0f1934", 0.0), Color("0f1934", 0.0), 8, 0))
	button.add_theme_stylebox_override("hover", _box(Color(VIOLET, 0.12), Color(VIOLET, 0.35), 8, 1))
	button.add_theme_stylebox_override("focus", _box(Color(VIOLET, 0.12), Color(VIOLET, 0.85), 8, 2))
	return button

func _action_label(action: String) -> String:
	match action:
		"connect": return "✦  Meet someone new"
		"work": return "◈  Pick up a useful shift"
		"culture": return "◌  Follow the local rhythm"
		"rest": return "⌁  Take a softer pace"
		"wander": return "↗  Wander the neighborhood"
	return action.capitalize()


func _build_phone_overlay() -> void:
	_phone_overlay = Control.new()
	_phone_overlay.name = "PhoneOverlay"
	_phone_overlay.z_index = 15
	_phone_overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_phone_overlay.visible = false
	add_child(_phone_overlay)
	var shade := ColorRect.new()
	shade.color = Color("111321", 0.58)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	_phone_overlay.add_child(shade)
	var center := CenterContainer.new()
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_phone_overlay.add_child(center)
	var shell := _panel(Color("111217"), Color("08090e"), 38)
	shell.custom_minimum_size = Vector2(410, 760)
	center.add_child(shell)
	var shell_column := VBoxContainer.new()
	shell_column.add_theme_constant_override("separation", 10)
	shell.add_child(shell_column)
	var top := HBoxContainer.new()
	var device_label := _label("8:31 PM    4G  ▮▮▮", 13, Color("f8fafc"))
	device_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(device_label)
	var close := _quiet_button("✕  CLOSE")
	close.add_theme_color_override("font_color", Color("ffffff"))
	close.add_theme_color_override("font_hover_color", Color("ffffff"))
	close.pressed.connect(_close_phone)
	top.add_child(close)
	shell_column.add_child(top)
	var screen := Control.new()
	screen.custom_minimum_size = Vector2(374, 680)
	screen.size_flags_vertical = Control.SIZE_EXPAND_FILL
	shell_column.add_child(screen)
	var gradient := Gradient.new()
	gradient.colors = PackedColorArray([Color("4031c5"), Color("7b36d9"), Color("ff9a2d")])
	var wallpaper_texture := GradientTexture2D.new()
	wallpaper_texture.gradient = gradient
	wallpaper_texture.width = 1
	wallpaper_texture.height = 720
	wallpaper_texture.fill_from = Vector2(0.1, 0.0)
	wallpaper_texture.fill_to = Vector2(0.9, 1.0)
	var wallpaper := TextureRect.new()
	wallpaper.texture = wallpaper_texture
	wallpaper.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	wallpaper.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	wallpaper.mouse_filter = Control.MOUSE_FILTER_IGNORE
	screen.add_child(wallpaper)
	var screen_margin := MarginContainer.new()
	screen_margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	screen_margin.add_theme_constant_override("margin_left", 16)
	screen_margin.add_theme_constant_override("margin_top", 15)
	screen_margin.add_theme_constant_override("margin_right", 16)
	screen_margin.add_theme_constant_override("margin_bottom", 15)
	screen.add_child(screen_margin)
	var screen_column := VBoxContainer.new()
	screen_column.add_theme_constant_override("separation", 8)
	screen_margin.add_child(screen_column)
	var screen_heading := HBoxContainer.new()
	_phone_title = _label("PHONE", 17, Color("ffffff"))
	_phone_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	screen_heading.add_child(_phone_title)
	screen_heading.add_child(_label("ALL CONNECT", 9, Color("ffffff", 0.75)))
	screen_column.add_child(screen_heading)
	_phone_content = VBoxContainer.new()
	_phone_content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_phone_content.add_theme_constant_override("separation", 8)
	screen_column.add_child(_phone_content)
	_phone_open_app("home")

func _open_phone() -> void:
	if not _started:
		return
	_phone_overlay.visible = true
	_phone_open_app("home")

func _close_phone() -> void:
	_phone_overlay.visible = false
	if _map != null:
		_map.grab_focus()

func _clear_phone_content() -> void:
	for child in _phone_content.get_children():
		child.free()

func _phone_open_app(app: String) -> void:
	_phone_app = app
	_clear_phone_content()
	match app:
		"home":
			_phone_title.text = "PHONE"
			_render_phone_home()
		"messages":
			_phone_title.text = "MESSAGES"
			_render_phone_messages()
		"phone":
			_phone_title.text = "PHONE / SEARCH"
			_render_phone_contacts()
		"gamehub":
			_phone_title.text = "GAMEHUB"
			_render_phone_gamehub()
		"settings":
			_phone_title.text = "SETTINGS"
			_render_phone_settings()
		"map":
			_close_phone()
		_:
			_phone_title.text = app.to_upper()
			_render_phone_coming_soon(app.to_upper())

func _phone_back_button() -> Button:
	var back := _quiet_button("←  PHONE HOME")
	back.pressed.connect(_phone_open_app.bind("home"))
	return back

func _render_phone_home() -> void:
	var clock := _label("8:31", 45, Color("ffffff"))
	clock.add_theme_color_override("font_shadow_color", Color("30247f", 0.4))
	clock.add_theme_constant_override("shadow_offset_y", 3)
	_phone_content.add_child(clock)
	_phone_content.add_child(_label("Monday 5 October · Lagos", 14, Color("ffffff", 0.86)))
	var grid := GridContainer.new()
	grid.columns = 4
	grid.size_flags_vertical = Control.SIZE_EXPAND_FILL
	grid.add_theme_constant_override("h_separation", 7)
	grid.add_theme_constant_override("v_separation", 8)
	_phone_content.add_child(grid)
	var apps := [
		["◈", "JOBS", "jobs", "Find useful shifts"], ["✉", "MESSAGES", "messages", "Read and reply"], ["✦", "CONNECT", "phone", "Find local people"], ["$", "WALLET", "wallet", "Credits and progress"],
		["▱", "TICKETS", "tickets", "Local events"], ["▦", "GAMEHUB", "gamehub", "Games coming soon"], ["◌", "CULTURE", "culture", "Follow the rhythm"], ["◎", "CHALLENGES", "challenges", "Community goals"],
		["✺", "RESIDENTS", "residents", "Meet the neighborhood"], ["★", "EVENTS", "events", "What is happening"], ["⌕", "PHONE", "phone", "Search and add"], ["☎", "RIDE", "ride", "Move around the city"],
		["⌂", "MAP", "map", "Return to the city"], ["¤", "BANK", "bank", "Local economy"], ["⚙", "SETTINGS", "settings", "Local preferences"], ["●", "PROFILE", "profile", "Your city life"]
	]
	for app: Array in apps:
		grid.add_child(_phone_app_button(str(app[0]), str(app[1]), str(app[2]), str(app[3])))
	var footer := _label("LOCAL PHONE  ·  %d CONNECTIONS  ·  %d UNREAD" % [_state.connections, _unread_message_count()], 8, Color("ffffff", 0.82))
	footer.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_phone_content.add_child(footer)

func _phone_app_button(icon: String, text: String, app: String, hint: String) -> Button:
	var button := Button.new()
	button.text = "%s\n%s" % [icon, text]
	button.tooltip_text = hint
	button.custom_minimum_size = Vector2(78, 78)
	button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button.alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.add_theme_font_size_override("font_size", 10)
	button.add_theme_color_override("font_color", Color("ffffff"))
	button.add_theme_color_override("font_hover_color", Color("ffffff"))
	var tile := Color("2f7eea")
	match text:
		"JOBS": tile = Color("26bd83")
		"MESSAGES": tile = Color("3f8df0")
		"CONNECT": tile = Color("102c3a")
		"WALLET": tile = Color("3c8d16")
		"TICKETS": tile = Color("ffffff")
		"GAMEHUB": tile = Color("141722")
		"CULTURE": tile = Color("1d3f2d")
		"CHALLENGES": tile = Color("f02f3d")
		"RESIDENTS": tile = Color("23252d")
		"EVENTS": tile = Color("ffffff")
		"PHONE": tile = Color("2ac774")
		"RIDE": tile = Color("f3ae18")
		"MAP": tile = Color("7d3ee0")
		"BANK": tile = Color("6242db")
		"SETTINGS": tile = Color("374151")
		"PROFILE": tile = Color("e44e93")
	if text == "TICKETS" or text == "EVENTS":
		button.add_theme_color_override("font_color", TEXT)
		button.add_theme_color_override("font_hover_color", TEXT)
	button.add_theme_stylebox_override("normal", _box(tile, Color(tile, 0.9), 16, 1))
	button.add_theme_stylebox_override("hover", _box(tile.lightened(0.14), Color("ffffff", 0.85), 16, 2))
	button.add_theme_stylebox_override("pressed", _box(tile.darkened(0.16), Color("ffffff"), 16, 2))
	button.pressed.connect(_phone_open_app.bind(app))
	return button

func _render_phone_messages() -> void:
	_phone_content.add_child(_phone_back_button())
	_phone_content.add_child(_label("INBOX / %d UNREAD" % _unread_message_count(), 10, VIOLET))
	for index in _state.messages.size():
		var message: Dictionary = _state.messages[index]
		var card := _panel(PANEL_2 if not bool(message.get("read", false)) else PANEL, BORDER, 12)
		var body := VBoxContainer.new()
		var heading := HBoxContainer.new()
		var sender := _label(str(message.get("from", "Unknown")), 13, TEXT)
		sender.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		heading.add_child(sender)
		heading.add_child(_label("NEW" if not bool(message.get("read", false)) else "READ", 9, VIOLET if not bool(message.get("read", false)) else MUTED))
		body.add_child(heading)
		var copy := _label(str(message.get("text", "")), 11, MUTED)
		copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		body.add_child(copy)
		var reply := _secondary_button("REPLY")
		reply.custom_minimum_size.y = 30
		reply.pressed.connect(_phone_reply_message.bind(index))
		body.add_child(reply)
		card.add_child(body)
		_phone_content.add_child(card)
	_phone_content.add_spacer(false)

func _phone_reply_message(index: int) -> void:
	if index < 0 or index >= _state.messages.size():
		return
	var message: Dictionary = _state.messages[index]
	message.read = true
	message.text = "%s  You replied: On my way." % str(message.text)
	_state.messages[index] = message
	_save_state()
	_render_phone_messages()
	_show_toast("Reply saved to your local phone.", CYAN)

func _render_phone_contacts(query: String = "") -> void:
	_phone_content.add_child(_phone_back_button())
	_phone_content.add_child(_label("FIND PEOPLE IN THE CITY", 10, VIOLET))
	_phone_search = LineEdit.new()
	_phone_search.placeholder_text = "Search by name or handle…"
	_phone_search.text = query
	_phone_search.custom_minimum_size.y = 40
	_phone_search.add_theme_color_override("font_color", TEXT)
	_phone_search.add_theme_color_override("font_placeholder_color", MUTED)
	_phone_search.add_theme_stylebox_override("normal", _box(PANEL_2, BORDER, 10, 1))
	_phone_search.text_changed.connect(_render_phone_contacts)
	_phone_content.add_child(_phone_search)
	var found := 0
	for index in _state.contacts.size():
		var contact: Dictionary = _state.contacts[index]
		var needle := query.to_lower()
		if not needle.is_empty() and not (str(contact.name).to_lower().contains(needle) or str(contact.handle).to_lower().contains(needle)):
			continue
		found += 1
		var row := _panel(PANEL_2, BORDER, 12)
		var row_box := HBoxContainer.new()
		var copy := VBoxContainer.new()
		copy.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		copy.add_child(_label(str(contact.name), 13, TEXT))
		copy.add_child(_label("%s  /  %s" % [str(contact.handle), str(contact.role)], 10, MUTED))
		row_box.add_child(copy)
		var action := _secondary_button("ADDED" if bool(contact.get("connected", false)) else "ADD")
		action.disabled = bool(contact.get("connected", false))
		action.custom_minimum_size = Vector2(72, 34)
		action.pressed.connect(_phone_add_contact.bind(index))
		row_box.add_child(action)
		row.add_child(row_box)
		_phone_content.add_child(row)
	if found == 0:
		_phone_content.add_child(_label("No local residents match that search yet.", 12, MUTED))
	_phone_content.add_spacer(false)
	_phone_content.add_child(_label("Search currently uses the local resident directory.", 10, MUTED))

func _phone_add_contact(index: int) -> void:
	if index < 0 or index >= _state.contacts.size():
		return
	var contact: Dictionary = _state.contacts[index]
	if bool(contact.get("connected", false)):
		return
	contact.connected = true
	_state.contacts[index] = contact
	_state.connections = int(_state.connections) + 1
	_state.xp = int(_state.xp) + 8
	_save_state()
	_update_hud()
	_render_phone_contacts(_phone_search.text if _phone_search != null else "")
	_show_toast("Added %s to your connections." % str(contact.name), VIOLET)

func _render_phone_gamehub() -> void:
	_phone_content.add_child(_phone_back_button())
	_phone_content.add_spacer(false)
	var icon := _label("▦", 58, VIOLET)
	icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_phone_content.add_child(icon)
	var title := _label("GAMEHUB", 24, TEXT)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_phone_content.add_child(title)
	var coming := _label("COMING SOON", 14, VIOLET)
	coming.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_phone_content.add_child(coming)
	var copy := _label("New social mini-games, neighborhood challenges, and community events will appear here.", 12, MUTED)
	copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_phone_content.add_child(copy)
	_phone_content.add_spacer(false)

func _render_phone_coming_soon(name: String) -> void:
	_phone_content.add_child(_phone_back_button())
	_phone_content.add_spacer(false)
	var icon := _label("▦", 52, Color("ffffff"))
	icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_phone_content.add_child(icon)
	var title := _label(name, 22, Color("ffffff"))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_phone_content.add_child(title)
	var coming := _label("COMING SOON", 13, Color("ffffff", 0.86))
	coming.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_phone_content.add_child(coming)
	var copy := _label("This All Connect app will open in a future city update.", 11, Color("ffffff", 0.82))
	copy.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	copy.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_phone_content.add_child(copy)
	_phone_content.add_spacer(false)

func _render_phone_settings() -> void:
	_phone_content.add_child(_phone_back_button())
	_phone_content.add_child(_label("LOCAL EXPERIENCE", 10, VIOLET))
	var theme_card := _panel(PANEL_2, BORDER, 12)
	var theme_box := VBoxContainer.new()
	theme_box.add_child(_label("LIGHT MAP THEME", 13, TEXT))
	theme_box.add_child(_label("All Connect is currently using the light civic-map theme.", 11, MUTED))
	theme_card.add_child(theme_box)
	_phone_content.add_child(theme_card)
	var notifications := CheckButton.new()
	notifications.text = "  Route notifications"
	notifications.button_pressed = true
	notifications.add_theme_color_override("font_color", TEXT)
	notifications.toggled.connect(func(enabled: bool) -> void: _show_toast("Route notifications %s." % ("on" if enabled else "off"), CYAN))
	_phone_content.add_child(notifications)
	var reset := _secondary_button("RESET LOCAL ROUTE")
	reset.pressed.connect(_reset_local_route)
	_phone_content.add_child(reset)
	_phone_content.add_spacer(false)
	_phone_content.add_child(_label("All settings are local to this browser.", 10, MUTED))

func _reset_local_route() -> void:
	_state.player_status = "Open to new routes"
	_current_location_id = "nexus"
	_save_state()
	_update_hud()
	_select_location("nexus")
	_show_toast("Local route reset. Your connections were kept.", CYAN)

func _unread_message_count() -> int:
	var count := 0
	for message: Dictionary in _state.messages:
		if not bool(message.get("read", false)):
			count += 1
	return count
