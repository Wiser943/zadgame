extends VBoxContainer
## Game-style menu: every Button child becomes a text-only menu item and a glowing
## selection cursor slides between items. The cursor follows keyboard/gamepad focus,
## and hovering an item focuses it, so mouse and controller share one highlight.

const CURSOR := Color("70b7ff")
const FOCUS_SHIFT := 12.0

var item_font_size := 22
var _items: Array[Button] = []
var _cursor := Rect2()
var _cursor_alpha := 0.0
var _time := 0.0
var _focus_amount: Dictionary = {}
var _slide: Dictionary = {}
var _highlight: GradientTexture2D


func _init() -> void:
	add_theme_constant_override("separation", 2)
	child_entered_tree.connect(_on_child_entered)


func _ready() -> void:
	_highlight = ScreenFactory.linear_fade(Color(CURSOR, 0.26))


func _on_child_entered(node: Node) -> void:
	if not node is Button or _items.has(node):
		return
	var item := node as Button
	_items.append(item)
	ScreenFactory.style_menu_item(item, item_font_size)
	_focus_amount[item] = 0.0
	_slide[item] = 0.0
	item.mouse_entered.connect(func() -> void:
		if item.visible and not item.disabled and item.focus_mode != Control.FOCUS_NONE:
			item.grab_focus()
	)
	item.button_down.connect(func() -> void:
		item.pivot_offset = Vector2(0.0, item.size.y * 0.5)
		if not ScreenFactory.reduced_motion():
			item.create_tween().tween_property(item, "scale", Vector2(0.96, 0.96), 0.05)
	)
	item.button_up.connect(func() -> void:
		item.create_tween().tween_property(item, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	)


## Staggered entrance: items fade in while sliding from the left.
func play_intro(delay: float = 0.0) -> void:
	var reduced := ScreenFactory.reduced_motion()
	var index := 0
	for item: Button in _items:
		if not item.visible:
			continue
		if reduced:
			item.modulate.a = 1.0
			_slide[item] = 0.0
			continue
		item.modulate.a = 0.0
		_slide[item] = 56.0
		var tween := create_tween().set_parallel(true)
		var start := delay + index * 0.075
		tween.tween_property(item, "modulate:a", 1.0, 0.28).set_delay(start)
		tween.tween_method(_set_slide.bind(item), 56.0, 0.0, 0.42).set_delay(start).set_trans(Tween.TRANS_QUINT).set_ease(Tween.EASE_OUT)
		index += 1


func _set_slide(value: float, item: Button) -> void:
	_slide[item] = value


func _process(delta: float) -> void:
	if not is_visible_in_tree():
		return
	_time += delta
	var owner_control := get_viewport().gui_get_focus_owner()
	var focused: Button = owner_control as Button if owner_control is Button and _items.has(owner_control) else null
	var reduced := ScreenFactory.reduced_motion()
	var blend := 1.0 if reduced else 1.0 - exp(-delta * 20.0)
	if focused != null:
		var target := focused.get_rect()
		if _cursor.size == Vector2.ZERO or _cursor_alpha <= 0.01:
			_cursor = target
		else:
			_cursor = Rect2(_cursor.position.lerp(target.position, blend), _cursor.size.lerp(target.size, blend))
	_cursor_alpha = move_toward(_cursor_alpha, 1.0 if focused != null else 0.0, delta * 8.0)
	for item: Button in _items:
		var amount := move_toward(float(_focus_amount[item]), 1.0 if item == focused else 0.0, delta * (60.0 if reduced else 9.0))
		_focus_amount[item] = amount
		var box := item.get_meta("menu_box") as StyleBoxEmpty
		var margin := 30.0 + FOCUS_SHIFT * ease(amount, -2.0) + float(_slide[item])
		if box != null and absf(box.content_margin_left - margin) > 0.25:
			box.content_margin_left = margin
	queue_redraw()


func _draw() -> void:
	if _cursor_alpha <= 0.01 or _highlight == null:
		return
	var alpha := _cursor_alpha
	var pulse := 1.0 if ScreenFactory.reduced_motion() else 0.8 + 0.2 * sin(_time * 3.4)
	var r := _cursor
	draw_texture_rect(_highlight, Rect2(r.position + Vector2(2.0, 0.0), Vector2(r.size.x, r.size.y)), false, Color(1.0, 1.0, 1.0, alpha))
	# Glowing bar: a bright core with two soft halo passes.
	for pass_index: int in 3:
		var spread := float(pass_index) * 3.0
		var bar := Rect2(r.position.x - spread, r.position.y + 7.0 - spread, 3.0 + spread * 2.0, r.size.y - 14.0 + spread * 2.0)
		var strength := 1.0 if pass_index == 0 else 0.22 / float(pass_index)
		draw_rect(bar, Color(CURSOR.lightened(0.2 if pass_index == 0 else 0.0), alpha * strength * pulse))
	# Chevron that nudges forward with the breathing pulse.
	var cy := r.position.y + r.size.y * 0.5
	var cx := r.position.x + 14.0 + (0.0 if ScreenFactory.reduced_motion() else sin(_time * 3.4) * 1.5)
	draw_colored_polygon(PackedVector2Array([Vector2(cx, cy - 6.0), Vector2(cx + 7.0, cy), Vector2(cx, cy + 6.0)]), Color(CURSOR.lightened(0.35), alpha))
