class_name ScreenFactory
extends RefCounted

const INK := Color("0b0e13")
const PANEL := Color("161a21")
const BORDER := Color("2b323d")
const CYAN := Color("70b7ff")
const VIOLET := Color("aab8ce")
const CORAL := Color("ff9b8e")
const TEXT := Color("f5f7fa")
const MUTED := Color("a7afbd")
const SUBTLE := Color("6f7887")
const ACCENT := Color("2f6fe4")
const ACCENT_HOVER := Color("4180f0")
const ACCENT_PRESSED := Color("2459c2")

## Display type (titles, headings, big numbers). Body copy and buttons use the ui_* composites.
const FONT_TITLE := "res://assets/template/fonts/display/generic_title.tres"
const FONT_HEADING := "res://assets/template/fonts/display/generic_heading.tres"
const FONT_EYEBROW := "res://assets/template/fonts/display/generic_eyebrow.tres"
const FONT_MEDIUM := "res://assets/template/fonts/ui_medium.tres"
const FONT_BOLD := "res://assets/template/fonts/ui_bold.tres"
const FONT_MENU := "res://assets/template/fonts/display/generic_menu.tres"
const HOLO_SHADER := preload("res://shaders/holo_panel.gdshader")
const BACKDROP_SHADER := preload("res://shaders/modal_backdrop.gdshader")
const GLASS := Color(0.055, 0.07, 0.095, 0.82)
const GLASS_EDGE := Color(0.62, 0.78, 1.0, 0.16)


static func style_box(background: Color, border: Color, radius: int = 12, border_width: int = 1) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.border_color = border
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(radius)
	style.content_margin_left = 20.0
	style.content_margin_right = 20.0
	style.content_margin_top = 12.0
	style.content_margin_bottom = 12.0
	style.anti_aliasing = true
	return style


static func panel(background: Color = PANEL, border: Color = BORDER, padding: Vector2 = Vector2(20.0, 12.0)) -> PanelContainer:
	var result := PanelContainer.new()
	var style := style_box(Color(background, 0.96), border, 20, 1)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.38)
	style.shadow_size = 28
	style.shadow_offset = Vector2(0.0, 12.0)
	style.content_margin_left = padding.x
	style.content_margin_right = padding.x
	style.content_margin_top = padding.y
	style.content_margin_bottom = padding.y
	result.add_theme_stylebox_override("panel", style)
	return result


static func _focus_ring(color: Color, radius: int = 12) -> StyleBoxFlat:
	var focus := style_box(Color.TRANSPARENT, color, radius + 3, 2)
	focus.set_expand_margin_all(3.0)
	return focus


static func button(label: String, minimum_width: float = 260.0) -> Button:
	var result := Button.new()
	result.text = label
	result.custom_minimum_size = Vector2(minimum_width, 46.0)
	result.focus_mode = Control.FOCUS_ALL
	result.add_theme_font_size_override("font_size", 16)
	result.add_theme_color_override("font_color", TEXT)
	result.add_theme_color_override("font_hover_color", Color.WHITE)
	result.add_theme_color_override("font_focus_color", Color.WHITE)
	result.add_theme_color_override("font_pressed_color", Color.WHITE)
	result.add_theme_color_override("font_disabled_color", Color("646c78"))
	result.add_theme_stylebox_override("normal", plate(Color(0.09, 0.115, 0.15, 0.92), Color(1.0, 1.0, 1.0, 0.1)))
	result.add_theme_stylebox_override("hover", plate(Color(0.12, 0.16, 0.21, 0.96), Color(CYAN, 0.55), Color(CYAN, 0.18)))
	result.add_theme_stylebox_override("pressed", plate(Color(0.06, 0.08, 0.11, 0.96), CYAN))
	result.add_theme_stylebox_override("disabled", plate(Color(0.07, 0.08, 0.1, 0.7), Color(1.0, 1.0, 1.0, 0.05)))
	result.add_theme_stylebox_override("focus", _plate_focus(Color("a9d4ff")))
	add_press_juice(result)
	return result


static func primary(button_control: Button) -> void:
	button_control.custom_minimum_size.y = maxf(button_control.custom_minimum_size.y, 52.0)
	button_control.add_theme_font_override("font", load(FONT_BOLD) as Font)
	button_control.add_theme_font_size_override("font_size", 17)
	for key: String in ["font_color", "font_hover_color", "font_focus_color", "font_pressed_color"]:
		button_control.add_theme_color_override(key, Color.WHITE)
	button_control.add_theme_font_override("font", load(FONT_MENU) as Font)
	button_control.add_theme_stylebox_override("normal", plate(ACCENT, Color("8fb8ff"), Color(ACCENT, 0.45)))
	button_control.add_theme_stylebox_override("hover", plate(ACCENT_HOVER, Color("b9d3ff"), Color(ACCENT_HOVER, 0.7)))
	button_control.add_theme_stylebox_override("pressed", plate(ACCENT_PRESSED, ACCENT_PRESSED))
	button_control.add_theme_stylebox_override("focus", _plate_focus(Color.WHITE))


## Quiet footer / utility action: text-only until hovered, focus ring stays visible.
static func quiet_button(label: String, font_size: int = 13) -> Button:
	var result := Button.new()
	result.text = label
	result.focus_mode = Control.FOCUS_ALL
	result.custom_minimum_size = Vector2(0.0, 32.0)
	result.add_theme_font_size_override("font_size", font_size)
	result.add_theme_color_override("font_color", SUBTLE)
	result.add_theme_color_override("font_hover_color", TEXT)
	result.add_theme_color_override("font_focus_color", TEXT)
	result.add_theme_color_override("font_pressed_color", CYAN)
	var normal := style_box(Color.TRANSPARENT, Color.TRANSPARENT, 8, 0)
	normal.content_margin_left = 10.0
	normal.content_margin_right = 10.0
	normal.content_margin_top = 6.0
	normal.content_margin_bottom = 6.0
	result.add_theme_stylebox_override("normal", normal)
	var hover := normal.duplicate() as StyleBoxFlat
	hover.bg_color = Color(1.0, 1.0, 1.0, 0.06)
	result.add_theme_stylebox_override("hover", hover)
	result.add_theme_stylebox_override("pressed", hover)
	result.add_theme_stylebox_override("focus", _focus_ring(CYAN, 8))
	return result


static func label(text: String, font_size: int = 18, color: Color = TEXT) -> Label:
	var result := Label.new()
	result.text = text
	result.add_theme_font_size_override("font_size", font_size)
	result.add_theme_color_override("font_color", color)
	return result


## kind: "title" | "heading" | "eyebrow"
static func display_label(text: String, font_size: int, color: Color = TEXT, kind: String = "heading") -> Label:
	var result := label(text, font_size, color)
	var path := FONT_TITLE if kind == "title" else (FONT_EYEBROW if kind == "eyebrow" else FONT_HEADING)
	result.add_theme_font_override("font", load(path) as Font)
	return result


static func medium_label(text: String, font_size: int, color: Color = TEXT) -> Label:
	var result := label(text, font_size, color)
	result.add_theme_font_override("font", load(FONT_MEDIUM) as Font)
	return result


## Short accent rule used under headings (replaces full-width HSeparators).
static func accent_rule(width: float = 40.0, color: Color = CYAN) -> Control:
	var holder := CenterContainer.new()
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var bar := ColorRect.new()
	bar.color = color
	bar.custom_minimum_size = Vector2(width, 3.0)
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	holder.add_child(bar)
	return holder


static func spacer(height: float) -> Control:
	var result := Control.new()
	result.custom_minimum_size.y = height
	result.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return result


static func full_rect(control: Control) -> void:
	control.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)



# --- Round-3 game UI kit: skewed plates, holo panels, menu items, key chips, glows. ---

static func reduced_motion() -> bool:
	return bool(TuningStore.get_value("ui.reduced_motion", false))


## Skewed glass plate with a vertical bevel (lighter top border) and optional outer glow.
static func plate(background: Color, border: Color, glow: Color = Color.TRANSPARENT, skew: float = 0.18) -> StyleBoxFlat:
	var style := style_box(background, border, 4, 1)
	style.skew = Vector2(skew, 0.0)
	style.border_width_top = 1
	style.border_width_bottom = 2
	style.content_margin_left = 24.0
	style.content_margin_right = 24.0
	if glow.a > 0.0:
		style.shadow_color = glow
		style.shadow_size = 14
		style.shadow_offset = Vector2(0.0, 2.0)
	return style


static func _plate_focus(color: Color) -> StyleBoxFlat:
	var focus := plate(Color.TRANSPARENT, color, Color.TRANSPARENT)
	focus.set_border_width_all(2)
	focus.set_expand_margin_all(3.0)
	return focus


## Press squash + release overshoot; hover lift is handled by the plate glow.
static func add_press_juice(control: Button) -> void:
	control.button_down.connect(func() -> void:
		control.pivot_offset = control.size * 0.5
		if reduced_motion():
			return
		var tween := control.create_tween()
		tween.tween_property(control, "scale", Vector2(0.95, 0.92), 0.06)
	)
	control.button_up.connect(func() -> void:
		var tween := control.create_tween()
		tween.tween_property(control, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	)


## Holo glass modal: sharp sci-fi corners, scanline sweep shader, drawn corner brackets.
static func holo_panel(accent: Color = CYAN, padding: Vector2 = Vector2(44.0, 36.0)) -> PanelContainer:
	var result := PanelContainer.new()
	var style := style_box(Color(0.04, 0.055, 0.078, 0.94), Color(accent, 0.28), 6, 1)
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.55)
	style.shadow_size = 40
	style.shadow_offset = Vector2(0.0, 16.0)
	style.content_margin_left = padding.x
	style.content_margin_right = padding.x
	style.content_margin_top = padding.y
	style.content_margin_bottom = padding.y
	result.add_theme_stylebox_override("panel", style)
	var material := ShaderMaterial.new()
	material.shader = HOLO_SHADER
	material.set_shader_parameter("sweep_color", Vector3(accent.r, accent.g, accent.b))
	material.set_shader_parameter("motion", 0.0 if reduced_motion() else 1.0)
	result.material = material
	result.resized.connect(func() -> void: material.set_shader_parameter("panel_height", result.size.y))
	result.draw.connect(draw_brackets.bind(result, accent))
	return result


## Corner brackets + top accent notch, drawn on the panel canvas (under its children).
static func draw_brackets(canvas: Control, accent: Color, arm: float = 22.0, inset: float = -1.0) -> void:
	var r := Rect2(Vector2.ONE * inset, canvas.size - Vector2.ONE * inset * 2.0)
	var c := Color(accent, 0.95)
	var w := 2.0
	for corner: Array in [[r.position, Vector2(1, 1)], [Vector2(r.end.x, r.position.y), Vector2(-1, 1)], [Vector2(r.position.x, r.end.y), Vector2(1, -1)], [r.end, Vector2(-1, -1)]]:
		var p: Vector2 = corner[0]
		var d: Vector2 = corner[1]
		canvas.draw_line(p, p + Vector2(arm * d.x, 0.0), c, w)
		canvas.draw_line(p, p + Vector2(0.0, arm * d.y), c, w)
	var notch := Rect2(Vector2(r.get_center().x - 36.0, r.position.y - 1.0), Vector2(72.0, 3.0))
	canvas.draw_rect(notch, Color(accent, 0.9))
	canvas.draw_rect(Rect2(Vector2(r.position.x + 1.0, r.position.y + 1.0), Vector2(r.size.x - 2.0, 1.0)), Color(1.0, 1.0, 1.0, 0.06))


## Full-screen blurred, vignetted dim for modals (BackBufferCopy guarantees a fresh capture).
static func modal_backdrop(parent: Control) -> ColorRect:
	var copy := BackBufferCopy.new()
	copy.copy_mode = BackBufferCopy.COPY_MODE_VIEWPORT
	parent.add_child(copy)
	var dim := ColorRect.new()
	dim.color = Color.WHITE
	var material := ShaderMaterial.new()
	material.shader = BACKDROP_SHADER
	dim.material = material
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	full_rect(dim)
	parent.add_child(dim)
	return dim


## Small glass chip used by HUD widgets and footers.
static func glass_chip(accent: Color = Color.TRANSPARENT, padding: Vector2 = Vector2(16.0, 8.0)) -> StyleBoxFlat:
	var style := style_box(GLASS, GLASS_EDGE, 10, 1)
	style.content_margin_left = padding.x
	style.content_margin_right = padding.x
	style.content_margin_top = padding.y
	style.content_margin_bottom = padding.y
	style.shadow_color = Color(0.0, 0.0, 0.0, 0.35)
	style.shadow_size = 14
	style.shadow_offset = Vector2(0.0, 6.0)
	if accent.a > 0.0:
		style.border_color = Color(accent, 0.3)
		style.border_width_left = 3
	return style


## Menu list item: text-only, left aligned; MenuList draws the sliding selection cursor.
static func style_menu_item(control: Button, font_size: int = 22) -> void:
	control.alignment = HORIZONTAL_ALIGNMENT_LEFT
	control.focus_mode = Control.FOCUS_ALL
	control.custom_minimum_size = Vector2(maxf(control.custom_minimum_size.x, 300.0), font_size * 2.1)
	control.add_theme_font_override("font", load(FONT_MENU) as Font)
	control.add_theme_font_size_override("font_size", font_size)
	control.add_theme_color_override("font_color", Color("b7c1cf"))
	control.add_theme_color_override("font_hover_color", Color.WHITE)
	control.add_theme_color_override("font_focus_color", Color.WHITE)
	control.add_theme_color_override("font_hover_pressed_color", Color.WHITE)
	control.add_theme_color_override("font_pressed_color", CYAN)
	control.add_theme_color_override("font_disabled_color", Color("4e5664"))
	control.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.5))
	control.add_theme_constant_override("outline_size", 4)
	var box := StyleBoxEmpty.new()
	box.content_margin_left = 30.0
	box.content_margin_right = 20.0
	for state: String in ["normal", "hover", "pressed", "hover_pressed", "focus", "disabled"]:
		control.add_theme_stylebox_override(state, box)
	control.set_meta("menu_box", box)


## "[Enter] Select" style key prompt chip.
static func key_hint(key: String, action: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var cap := Label.new()
	cap.text = key
	cap.add_theme_font_override("font", load(FONT_BOLD) as Font)
	cap.add_theme_font_size_override("font_size", 12)
	cap.add_theme_color_override("font_color", TEXT)
	var cap_style := style_box(Color(1.0, 1.0, 1.0, 0.08), Color(1.0, 1.0, 1.0, 0.22), 5, 1)
	cap_style.border_width_bottom = 3
	cap_style.content_margin_left = 8.0
	cap_style.content_margin_right = 8.0
	cap_style.content_margin_top = 2.0
	cap_style.content_margin_bottom = 2.0
	cap.add_theme_stylebox_override("normal", cap_style)
	cap.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(cap)
	var text := label(action, 13, MUTED)
	text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	text.name = "Action"
	row.add_child(text)
	return row


static func radial_glow(color: Color = Color.WHITE, resolution: int = 128) -> GradientTexture2D:
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 0.35, 1.0])
	gradient.colors = PackedColorArray([color, Color(color, 0.35), Color(color, 0.0)])
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1.0, 0.5)
	texture.width = resolution
	texture.height = resolution
	return texture


static func linear_fade(color: Color, resolution: int = 256) -> GradientTexture2D:
	var gradient := Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 1.0])
	gradient.colors = PackedColorArray([color, Color(color, 0.0)])
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.width = resolution
	texture.height = 4
	return texture


## Modal entrance: backdrop fade + panel settle, replayed every time the overlay opens.
static func install_modal_motion(overlay: Control, panel: Control) -> void:
	overlay.visibility_changed.connect(func() -> void:
		if not overlay.visible:
			return
		if reduced_motion():
			overlay.modulate.a = 1.0
			return
		overlay.modulate.a = 0.0
		var target := panel.scale
		panel.pivot_offset = panel.size * 0.5
		panel.scale = target * 0.92
		var tween := overlay.create_tween().set_parallel(true)
		tween.tween_property(overlay, "modulate:a", 1.0, 0.18)
		tween.tween_property(panel, "scale", target, 0.34).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	)
