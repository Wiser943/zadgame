class_name MazeRunner
extends Node2D

signal entered_cell(cell: Vector2i)

const TEXTURE := preload("res://assets/template/characters/runner.png")

var grid_position := Vector2i.ZERO
var direction := Vector2i.RIGHT
var requested_direction := Vector2i.RIGHT
var target_cell := Vector2i.ZERO
var tile_size := 28.0
var _sprite: Sprite2D
var _base_scale := Vector2.ONE
var _effect_scale := 1.0


func setup(spawn_cell: Vector2i, size: float, cell_to_point: Callable) -> void:
	tile_size = size
	grid_position = spawn_cell
	target_cell = spawn_cell
	position = cell_to_point.call(spawn_cell)
	_sprite = Sprite2D.new()
	_sprite.texture = TEXTURE
	_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	var source_size := maxf(TEXTURE.get_width(), TEXTURE.get_height())
	_sprite.scale = Vector2.ONE * (tile_size * 0.94 / source_size)
	_base_scale = _sprite.scale
	_sprite.z_index = 6
	add_child(_sprite)


func request_move(next_direction: Vector2i) -> void:
	requested_direction = next_direction


func advance(delta: float, speed: float, is_walkable: Callable, cell_to_point: Callable) -> void:
	if _sprite != null:
		_apply_visual_scale()
	var remaining := maxf(0.0, speed * delta)
	while remaining > 0.0:
		var target_point: Vector2 = cell_to_point.call(target_cell)
		var distance := position.distance_to(target_point)
		if distance <= 0.05:
			position = target_point
			if target_cell != grid_position:
				grid_position = target_cell
				entered_cell.emit(grid_position)
			if is_walkable.call(grid_position + requested_direction):
				direction = requested_direction
			if not is_walkable.call(grid_position + direction):
				target_cell = grid_position
				break
			target_cell = grid_position + direction
			target_point = cell_to_point.call(target_cell)
			distance = position.distance_to(target_point)
		var step := minf(remaining, distance)
		position = position.move_toward(target_point, step)
		remaining -= step
		if _sprite != null and direction != Vector2i.ZERO:
			_sprite.rotation = Vector2(direction).angle()
		if step <= 0.001:
			break


func reset_to(spawn_cell: Vector2i, cell_to_point: Callable) -> void:
	grid_position = spawn_cell
	target_cell = spawn_cell
	direction = Vector2i.RIGHT
	requested_direction = Vector2i.RIGHT
	position = cell_to_point.call(spawn_cell)
	modulate = Color.WHITE
	if _sprite != null:
		_sprite.rotation = 0.0
	set_effect_state(false, false, false)


func set_effect_state(overdrive: bool, shield_active: bool, magnet_active: bool) -> void:
	if _sprite == null:
		return
	if shield_active:
		_sprite.modulate = Color("abf4e7")
	elif magnet_active:
		_sprite.modulate = Color("bbd8ff")
	elif overdrive:
		_sprite.modulate = Color("ffe0a2")
	else:
		_sprite.modulate = Color.WHITE
	_effect_scale = 1.08 if shield_active else 1.0
	_apply_visual_scale()


func _apply_visual_scale() -> void:
	if _sprite != null:
		_sprite.scale = _base_scale * _effect_scale * float(TuningStore.get_value("player.visual.scale", 1.0))
