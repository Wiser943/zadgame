class_name TutorialCallout
extends Control

signal continued

var _panel: PanelContainer
var _title: Label
var _message: Label
var _input_hint: Label
var _continue_button: Button
var _line: Line2D
var _arrow_head: Polygon2D
var _anchor := Vector2.ZERO
var _callout_token := 0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	z_index = 50
	ScreenFactory.full_rect(self)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.025, 0.035, 0.5)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	ScreenFactory.full_rect(dim)
	add_child(dim)
	_line = Line2D.new()
	_line.width = 3.0
	_line.default_color = ScreenFactory.CYAN
	_line.z_index = 2
	add_child(_line)
	_arrow_head = Polygon2D.new()
	_arrow_head.color = ScreenFactory.CYAN
	_arrow_head.z_index = 2
	add_child(_arrow_head)
	_panel = ScreenFactory.holo_panel(ScreenFactory.CYAN, Vector2(24.0, 20.0))
	_panel.custom_minimum_size = Vector2(460.0, 245.0)
	_panel.size = Vector2(460.0, 245.0)
	_panel.z_index = 3
	add_child(_panel)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", 8)
	_panel.add_child(content)
	_title = ScreenFactory.display_label("", 24, ScreenFactory.CYAN, "heading")
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	content.add_child(_title)
	_message = ScreenFactory.label("", 18)
	_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_message.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_message.custom_minimum_size = Vector2(420.0, 56.0)
	content.add_child(_message)
	_input_hint = ScreenFactory.label("", 14, ScreenFactory.MUTED)
	_input_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_input_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	content.add_child(_input_hint)
	_continue_button = ScreenFactory.button("", 180.0)
	ScreenFactory.primary(_continue_button)
	_continue_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	_continue_button.pressed.connect(_on_continue)
	content.add_child(_continue_button)
	visible = false


func show_callout(title: String, message: String, input_hint: String, anchor: Vector2, timeout_seconds: float = 18.0) -> void:
	_callout_token += 1
	var token := _callout_token
	_title.text = title
	_message.text = message
	_input_hint.text = input_hint
	_input_hint.visible = not input_hint.is_empty()
	_continue_button.text = I18n.t("tutorial.continue")
	_anchor = anchor
	visible = true
	await get_tree().process_frame
	_place_panel()
	_pop_in()
	_continue_button.grab_focus()
	if timeout_seconds > 0.0:
		await get_tree().create_timer(timeout_seconds, true, false, true).timeout
		if token == _callout_token and visible:
			_on_continue()


func set_input_hint(text: String) -> void:
	_input_hint.text = text
	_input_hint.visible = not text.is_empty()


func _place_panel() -> void:
	var portrait := size.y > size.x * 1.15
	var panel_size := Vector2(minf(680.0 if portrait else 460.0, size.x - 36.0), 310.0 if portrait else 245.0)
	_panel.size = panel_size
	_title.add_theme_font_size_override("font_size", 34 if portrait else 25)
	_message.add_theme_font_size_override("font_size", 26 if portrait else 18)
	_input_hint.add_theme_font_size_override("font_size", 21 if portrait else 14)
	_message.custom_minimum_size.x = panel_size.x - 40.0
	_continue_button.add_theme_font_size_override("font_size", 25 if portrait else 18)
	_continue_button.custom_minimum_size = Vector2(250.0, 80.0) if portrait else Vector2(180.0, 46.0)
	var desired := _anchor + Vector2(54.0, -panel_size.y - 44.0)
	desired.x = clampf(desired.x, 18.0, maxf(18.0, size.x - panel_size.x - 18.0))
	desired.y = clampf(desired.y, 70.0, maxf(70.0, size.y - panel_size.y - 22.0))
	_panel.position = desired
	var line_start := _panel.position + Vector2(panel_size.x * 0.5, panel_size.y)
	_line.points = PackedVector2Array([line_start, _anchor])
	var direction := (_anchor - line_start).normalized()
	var perpendicular := Vector2(-direction.y, direction.x)
	_arrow_head.polygon = PackedVector2Array([
		_anchor,
		_anchor - direction * 16.0 + perpendicular * 8.0,
		_anchor - direction * 16.0 - perpendicular * 8.0,
	])


func _pop_in() -> void:
	if ScreenFactory.reduced_motion():
		return
	_panel.pivot_offset = _panel.size * 0.5
	_panel.scale = Vector2(0.9, 0.9)
	_panel.modulate.a = 0.0
	var tween := create_tween().set_parallel(true)
	tween.tween_property(_panel, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tween.tween_property(_panel, "modulate:a", 1.0, 0.18)


func _on_continue() -> void:
	_callout_token += 1
	visible = false
	continued.emit()
