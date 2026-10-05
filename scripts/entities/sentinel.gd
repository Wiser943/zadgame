class_name MazeSentinel
extends Node2D

const TEXTURE := preload("res://assets/template/characters/sentinel.png")

var grid_position := Vector2i.ZERO
var target_cell := Vector2i.ZERO
var direction := Vector2i.LEFT
var spawn_cell := Vector2i.ZERO
var sentinel_index := 0
var tile_size := 28.0
var _sprite: Sprite2D
var _base_tint := Color.WHITE
var _base_scale := Vector2.ONE
var _effect_scale := 1.0


func setup(cell: Vector2i, index: int, size: float, cell_to_point: Callable) -> void:
	spawn_cell = cell
	grid_position = cell
	target_cell = cell
	sentinel_index = index
	tile_size = size
	position = cell_to_point.call(cell)
	_base_tint = [Color.WHITE, Color("ccd7eb"), Color("dfddda"), Color("adc8e3")][index % 4]
	_sprite = Sprite2D.new()
	_sprite.texture = TEXTURE
	_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	var source_size := maxf(TEXTURE.get_width(), TEXTURE.get_height())
	_sprite.scale = Vector2.ONE * (tile_size * 0.94 / source_size)
	_base_scale = _sprite.scale
	_sprite.modulate = _base_tint
	_sprite.z_index = 5
	add_child(_sprite)


func advance(delta: float, speed: float, choose_direction: Callable, cell_to_point: Callable) -> void:
	if _sprite != null:
		_apply_visual_scale()
	var remaining := maxf(0.0, speed * delta)
	while remaining > 0.0:
		var target_point: Vector2 = cell_to_point.call(target_cell)
		var distance := position.distance_to(target_point)
		if distance <= 0.05:
			position = target_point
			grid_position = target_cell
			direction = choose_direction.call(grid_position, direction, sentinel_index)
			target_cell = grid_position + direction
			target_point = cell_to_point.call(target_cell)
			distance = position.distance_to(target_point)
		var step := minf(remaining, distance)
		position = position.move_toward(target_point, step)
		remaining -= step
		if step <= 0.001:
			break


func set_effect_state(overdriven: bool, slow_field_active: bool) -> void:
	if _sprite == null:
		return
	if overdriven:
		_sprite.modulate = Color("e9ba70")
	elif slow_field_active:
		_sprite.modulate = Color("86aaff")
	else:
		_sprite.modulate = _base_tint
	_effect_scale = 0.86 if slow_field_active else (0.92 if overdriven else 1.0)
	_apply_visual_scale()


func reset_to_spawn(cell_to_point: Callable) -> void:
	grid_position = spawn_cell
	target_cell = spawn_cell
	direction = [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN][sentinel_index % 4]
	position = cell_to_point.call(spawn_cell)
	set_effect_state(false, false)


func _apply_visual_scale() -> void:
	if _sprite != null:
		_sprite.scale = _base_scale * _effect_scale * float(TuningStore.get_value("enemies.visual.scale", 1.0))
