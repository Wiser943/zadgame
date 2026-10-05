class_name MazeWorld
extends Node2D

signal stats_changed(score: int, lives: int)
signal effects_changed(active_effects: Dictionary)
signal player_moved
signal pellet_collected
signal stage_completed(score: int, lives: int)
signal run_failed(score: int)
signal feedback_requested(kind: String)

const RunnerType := preload("res://scripts/entities/runner.gd")
const SentinelType := preload("res://scripts/entities/sentinel.gd")
const EffectsType := preload("res://scripts/effects/effects_director.gd")
const OVERDRIVE_TEXTURE := preload("res://assets/template/powerups/overdrive.png")
const SHIELD_TEXTURE := preload("res://assets/template/powerups/shield.png")
const SLOW_FIELD_TEXTURE := preload("res://assets/template/powerups/slow_field.png")
const MAGNET_TEXTURE := preload("res://assets/template/powerups/magnet.png")

const ENERGY_TEXTURE := preload("res://assets/template/powerups/energy.png")

const MAGNET_RANGE_STEPS := 2
const OVERDRIVE_SPEED_MULTIPLIER := 0.73
const SLOW_FIELD_SPEED_MULTIPLIER := 0.45
const WALL_EDGE_TOP := 1
const WALL_EDGE_RIGHT := 2
const WALL_EDGE_BOTTOM := 4
const WALL_EDGE_LEFT := 8
const WALL_EDGE_INSET := 2.3
const WALL_BORDER_OFFSET := 1.0
const WALL_BORDER_WIDTH := 1.35

var tile_size := 28.0
var stage_data: Dictionary = {}
var score := 0
var lives := 3
var elapsed_seconds := 0.0

var _rows: Array = []
var _dimensions := Vector2i.ZERO
var _walls: Dictionary = {}
var _pellets: Dictionary = {}
var _overdrive_cells: Dictionary = {}
var _shield_cells: Dictionary = {}
var _slow_field_cells: Dictionary = {}
var _magnet_cells: Dictionary = {}
var _runner_spawn := Vector2i.ZERO
var _enemy_spawns: Array[Vector2i] = []
var _runner: MazeRunner
var _sentinels: Array[MazeSentinel] = []
var _effects: EffectsDirector
var _overdrive_seconds := 0.0
var _shield_seconds := 0.0
var _slow_field_seconds := 0.0
var _magnet_seconds := 0.0
var _invulnerable_seconds := 0.0
var _simulation_active := true
var _input_enabled := true
var _resolving_collision := false
var _finishing_stage := false
var _has_moved := false
var _decision_counter := 0
var _score_service: RunScoreService


func setup(data: Dictionary, initial_score: int, initial_lives: int, score_service: RunScoreService = null) -> void:
	stage_data = data.duplicate(true)
	_score_service = score_service
	if _score_service == null:
		_score_service = RunScoreService.new()
		_score_service.begin(initial_score)
	score = _score_service.get_score()
	lives = initial_lives
	_rows = stage_data.get("rows", [])
	_dimensions = StageCatalog.dimensions(stage_data)
	_parse_stage()
	_effects = EffectsType.new()
	add_child(_effects)
	_effects.configure(get_pixel_size())
	_runner = RunnerType.new()
	add_child(_runner)
	_runner.setup(_runner_spawn, tile_size, cell_to_point)
	_runner.entered_cell.connect(_on_runner_entered_cell)
	for index: int in _enemy_spawns.size():
		var sentinel: MazeSentinel = SentinelType.new()
		add_child(sentinel)
		sentinel.setup(_enemy_spawns[index], index, tile_size, cell_to_point)
		_sentinels.append(sentinel)
	queue_redraw()
	_emit_stats()


func _parse_stage() -> void:
	_walls.clear()
	_pellets.clear()
	_overdrive_cells.clear()
	_shield_cells.clear()
	_slow_field_cells.clear()
	_magnet_cells.clear()
	_enemy_spawns.clear()
	for y: int in _rows.size():
		var row := str(_rows[y])
		for x: int in row.length():
			var cell := Vector2i(x, y)
			match row.substr(x, 1):
				"#":
					_walls[cell] = true
				".":
					_pellets[cell] = true
				"o":
					_overdrive_cells[cell] = true
				"s":
					_shield_cells[cell] = true
				"t":
					_slow_field_cells[cell] = true
				"m":
					_magnet_cells[cell] = true
				"P":
					_runner_spawn = cell
				"E":
					_enemy_spawns.append(cell)


func _process(delta: float) -> void:
	if not _simulation_active or _finishing_stage:
		return
	elapsed_seconds += delta
	_invulnerable_seconds = maxf(0.0, _invulnerable_seconds - delta)
	var was_fluttering := _overdrive_seconds > 0.0
	var was_guarded := _shield_seconds > 0.0
	var was_slow_fielded := _slow_field_seconds > 0.0
	var was_whistling := _magnet_seconds > 0.0
	_overdrive_seconds = maxf(0.0, _overdrive_seconds - delta)
	_shield_seconds = maxf(0.0, _shield_seconds - delta)
	_slow_field_seconds = maxf(0.0, _slow_field_seconds - delta)
	_magnet_seconds = maxf(0.0, _magnet_seconds - delta)
	if (
		was_fluttering != (_overdrive_seconds > 0.0)
		or was_guarded != (_shield_seconds > 0.0)
		or was_slow_fielded != (_slow_field_seconds > 0.0)
		or was_whistling != (_magnet_seconds > 0.0)
	):
		_update_actor_state()
		queue_redraw()
	if _input_enabled:
		_read_direction_input()
	var player_speed := float(TuningStore.get_value("player.move.max_speed", 170.0))
	_runner.advance(delta, player_speed, is_walkable, cell_to_point)
	var enemy_speed := 124.0 * float(TuningStore.get_value("enemies.move.speed_multiplier", 1.0))
	enemy_speed *= float(stage_data.get("enemy_speed_multiplier", 1.0))
	enemy_speed *= float(TuningStore.get_value("enemies.ai.aggression", 1.0))
	enemy_speed *= get_enemy_effect_speed_multiplier()
	for sentinel: MazeSentinel in _sentinels:
		sentinel.advance(delta, enemy_speed, _choose_sentinel_direction, cell_to_point)
	_check_collisions()
	if _has_active_effect():
		queue_redraw()
	_emit_stats()


func _read_direction_input() -> void:
	if Input.is_action_just_pressed("move_left"):
		_runner.request_move(Vector2i.LEFT)
	elif Input.is_action_just_pressed("move_right"):
		_runner.request_move(Vector2i.RIGHT)
	elif Input.is_action_just_pressed("move_up"):
		_runner.request_move(Vector2i.UP)
	elif Input.is_action_just_pressed("move_down"):
		_runner.request_move(Vector2i.DOWN)


func request_player_direction(direction: Vector2i) -> void:
	if _input_enabled and _runner != null and direction in StageCatalog.DIRECTIONS:
		_runner.request_move(direction)


func _on_runner_entered_cell(cell: Vector2i) -> void:
	if not _has_moved:
		_has_moved = true
		player_moved.emit()
	if _pellets.has(cell):
		_pellets.erase(cell)
		_award_score("energy")
		_effects.burst(cell_to_point(cell), Color("70b7ff"), 0.55)
		AudioDirector.play_cue("score.reward", 1.15)
		pellet_collected.emit()
		queue_redraw()
	elif _overdrive_cells.has(cell):
		_overdrive_cells.erase(cell)
		TuningStore.apply_boundary("NEXT_ACTION")
		_award_score("overdrive")
		_overdrive_seconds = 7.0 * float(TuningStore.get_value("gameplay.pickup.duration_multiplier", 1.0))
		_effects.burst(cell_to_point(cell), Color("e9ba70"), 1.15)
		AudioDirector.play_cue("player.action", 1.12)
		feedback_requested.emit("reward")
		_update_actor_state()
		queue_redraw()
	elif _shield_cells.has(cell):
		_shield_cells.erase(cell)
		TuningStore.apply_boundary("NEXT_ACTION")
		_award_score("powerup")
		_shield_seconds = 10.0 * float(TuningStore.get_value("gameplay.pickup.duration_multiplier", 1.0))
		_effects.burst(cell_to_point(cell), Color("7edaca"), 1.15)
		AudioDirector.play_cue("player.action", 0.94)
		feedback_requested.emit("reward")
		_update_actor_state()
		queue_redraw()
	elif _slow_field_cells.has(cell):
		_slow_field_cells.erase(cell)
		TuningStore.apply_boundary("NEXT_ACTION")
		_award_score("powerup")
		_slow_field_seconds = 6.0 * float(TuningStore.get_value("gameplay.pickup.duration_multiplier", 1.0))
		_effects.burst(cell_to_point(cell), Color("86aaff"), 1.15)
		AudioDirector.play_cue("player.action", 0.82)
		feedback_requested.emit("reward")
		_update_actor_state()
		queue_redraw()
	elif _magnet_cells.has(cell):
		_magnet_cells.erase(cell)
		TuningStore.apply_boundary("NEXT_ACTION")
		_award_score("powerup")
		_magnet_seconds = 8.0 * float(TuningStore.get_value("gameplay.pickup.duration_multiplier", 1.0))
		_effects.burst(cell_to_point(cell), Color("c4d7ee"), 1.15)
		AudioDirector.play_cue("player.action", 1.24)
		feedback_requested.emit("reward")
		_update_actor_state()
		queue_redraw()
	if _magnet_seconds > 0.0:
		_collect_nearby_energy_nodes(cell)
	_emit_stats()
	if remaining_collectibles() == 0 and not _finishing_stage:
		_complete_stage()


func _collect_nearby_energy_nodes(origin: Vector2i) -> void:
	var collected: Array[Vector2i] = []
	for candidate_value: Variant in _pellets.keys():
		var candidate: Vector2i = candidate_value
		if _path_distance(origin, candidate) <= MAGNET_RANGE_STEPS:
			collected.append(candidate)
	if collected.is_empty():
		return
	for candidate: Vector2i in collected:
		_pellets.erase(candidate)
		_award_score("energy")
		_effects.burst(cell_to_point(candidate), Color("70b7ff"), 0.4)
	pellet_collected.emit()
	queue_redraw()


func _check_collisions() -> void:
	if _resolving_collision or _invulnerable_seconds > 0.0:
		return
	for sentinel: MazeSentinel in _sentinels:
		if sentinel.position.distance_to(_runner.position) > tile_size * 0.58:
			continue
		if _overdrive_seconds > 0.0:
			_award_score("sentinel_disable")
			_effects.burst(sentinel.position, Color("ffb4ca"), 1.2)
			AudioDirector.play_cue("enemy.impact")
			feedback_requested.emit("impact")
			sentinel.reset_to_spawn(cell_to_point)
			_invulnerable_seconds = 0.3
			_update_actor_state()
			_emit_stats()
		elif _shield_seconds > 0.0:
			_shield_seconds = 0.0
			_effects.burst(_runner.position, Color("9df1c8"), 1.35)
			sentinel.reset_to_spawn(cell_to_point)
			_invulnerable_seconds = 0.45
			_update_actor_state()
			_emit_stats()
		else:
			_handle_player_hit()
		return


func _handle_player_hit() -> void:
	_resolving_collision = true
	_simulation_active = false
	lives -= 1
	_effects.burst(_runner.position, Color("ff87aa"), 1.45)
	AudioDirector.play_cue("enemy.impact", 0.8)
	feedback_requested.emit("damage")
	_emit_stats()
	await get_tree().create_timer(0.8).timeout
	if not is_instance_valid(self):
		return
	if lives <= 0:
		run_failed.emit(score)
		return
	_runner.reset_to(_runner_spawn, cell_to_point)
	for sentinel: MazeSentinel in _sentinels:
		sentinel.reset_to_spawn(cell_to_point)
	_overdrive_seconds = 0.0
	_shield_seconds = 0.0
	_slow_field_seconds = 0.0
	_magnet_seconds = 0.0
	TuningStore.apply_boundary("NEXT_ACTION")
	_invulnerable_seconds = float(TuningStore.get_value("gameplay.respawn.invulnerability", 1.2))
	_resolving_collision = false
	_simulation_active = true
	_update_actor_state()


func _complete_stage() -> void:
	_finishing_stage = true
	_simulation_active = false
	_award_score("stage_clear")
	_effects.stage_clear(get_pixel_size(), Color(stage_data.get("accent_color", Color.WHITE)))
	AudioDirector.play_cue("score.reward", 0.82)
	feedback_requested.emit("stage_clear")
	_emit_stats()
	await get_tree().create_timer(float(TuningStore.get_value("gameplay.stage.transition_delay", 1.0))).timeout
	if is_instance_valid(self):
		stage_completed.emit(score, lives)


func _choose_sentinel_direction(cell: Vector2i, current: Vector2i, sentinel_index: int) -> Vector2i:
	var candidates: Array[Vector2i] = []
	for direction: Vector2i in StageCatalog.DIRECTIONS:
		if is_walkable(cell + direction):
			candidates.append(direction)
	if candidates.is_empty():
		return Vector2i.ZERO
	if candidates.size() > 1:
		candidates.erase(-current)
	if candidates.is_empty():
		return -current
	_decision_counter += 1
	if _overdrive_seconds > 0.0:
		var farthest := candidates[0]
		var farthest_distance := -1
		for direction: Vector2i in candidates:
			var distance := (cell + direction).distance_squared_to(_runner.grid_position)
			if distance > farthest_distance:
				farthest_distance = distance
				farthest = direction
		return farthest
	var target := _sentinel_target(sentinel_index)
	var best := candidates[(_decision_counter + sentinel_index) % candidates.size()]
	var best_distance := 999999
	for direction: Vector2i in candidates:
		var distance := _path_distance(cell + direction, target)
		if distance < best_distance:
			best_distance = distance
			best = direction
	return best


func _sentinel_target(index: int) -> Vector2i:
	var scatter := fmod(elapsed_seconds + index * 1.3, 12.0) < 3.0
	if scatter:
		var corners := [
			Vector2i(1, 1),
			Vector2i(_dimensions.x - 2, 1),
			Vector2i(_dimensions.x - 2, _dimensions.y - 2),
			Vector2i(1, _dimensions.y - 2),
		]
		return _nearest_walkable(corners[index % corners.size()])
	if index % 3 == 1:
		return _nearest_walkable(_runner.grid_position + _runner.direction * 3)
	if index % 3 == 2:
		var mirrored := _runner.grid_position + (_runner.grid_position - _runner_spawn)
		return _nearest_walkable(mirrored)
	return _runner.grid_position


func _nearest_walkable(target: Vector2i) -> Vector2i:
	var clamped := Vector2i(
		clampi(target.x, 1, _dimensions.x - 2),
		clampi(target.y, 1, _dimensions.y - 2),
	)
	if is_walkable(clamped):
		return clamped
	for radius: int in 8:
		for y: int in range(-radius, radius + 1):
			for x: int in range(-radius, radius + 1):
				var candidate := clamped + Vector2i(x, y)
				if is_walkable(candidate):
					return candidate
	return _runner.grid_position


func _path_distance(start: Vector2i, target: Vector2i) -> int:
	if start == target:
		return 0
	var visited := {start: true}
	var queue: Array[Vector2i] = [start]
	var distances: Array[int] = [0]
	var cursor := 0
	while cursor < queue.size():
		var current := queue[cursor]
		var distance := distances[cursor]
		cursor += 1
		for direction: Vector2i in StageCatalog.DIRECTIONS:
			var next := current + direction
			if not is_walkable(next) or visited.has(next):
				continue
			if next == target:
				return distance + 1
			visited[next] = true
			queue.append(next)
			distances.append(distance + 1)
	return 999999


func is_walkable(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < _dimensions.x and cell.y < _dimensions.y and not _walls.has(cell)


func cell_to_point(cell: Vector2i) -> Vector2:
	return (Vector2(cell) + Vector2(0.5, 0.5)) * tile_size


func get_pixel_size() -> Vector2:
	return Vector2(_dimensions) * tile_size


func get_runner_screen_position() -> Vector2:
	return global_position + _runner.position * global_scale


func set_simulation_active(active: bool) -> void:
	_simulation_active = active and not _finishing_stage and not _resolving_collision


func set_input_enabled(enabled: bool) -> void:
	_input_enabled = enabled


func set_actors_visible(actors_visible: bool) -> void:
	if _runner != null:
		_runner.visible = actors_visible
	for sentinel: MazeSentinel in _sentinels:
		sentinel.visible = actors_visible


func remaining_collectibles() -> int:
	return (
		_pellets.size()
		+ _overdrive_cells.size()
		+ _shield_cells.size()
		+ _slow_field_cells.size()
		+ _magnet_cells.size()
	)


func get_active_effects() -> Dictionary:
	return {
		"overdrive": _overdrive_seconds,
		"shield": _shield_seconds,
		"slow_field": _slow_field_seconds,
		"magnet": _magnet_seconds,
	}


func get_enemy_effect_speed_multiplier() -> float:
	if _slow_field_seconds > 0.0:
		return SLOW_FIELD_SPEED_MULTIPLIER
	if _overdrive_seconds > 0.0:
		return OVERDRIVE_SPEED_MULTIPLIER
	return 1.0


func _has_active_effect() -> bool:
	return _overdrive_seconds > 0.0 or _shield_seconds > 0.0 or _slow_field_seconds > 0.0 or _magnet_seconds > 0.0


func _update_actor_state() -> void:
	for sentinel: MazeSentinel in _sentinels:
		sentinel.set_effect_state(_overdrive_seconds > 0.0, _slow_field_seconds > 0.0)
	if _runner != null:
		_runner.set_effect_state(_overdrive_seconds > 0.0, _shield_seconds > 0.0, _magnet_seconds > 0.0)


func _emit_stats() -> void:
	stats_changed.emit(score, lives)
	effects_changed.emit(get_active_effects())


func _award_score(event_id: String) -> void:
	score = _score_service.award(event_id)


func debug_effects_snapshot() -> Dictionary:
	return _effects.debug_snapshot() if _effects != null else {}


func _draw() -> void:
	var pixel_size := get_pixel_size()
	var floor_color := Color(stage_data.get("floor_color", Color("141820")))
	draw_rect(Rect2(Vector2.ZERO, pixel_size), floor_color, true)
	var wall_color := Color(stage_data.get("wall_color", Color("66788f")))
	var wall_inner_color := wall_color.darkened(0.72)
	for cell: Vector2i in _walls:
		var top_left := Vector2(cell) * tile_size
		var edge_mask := _wall_edge_mask(cell)
		draw_rect(Rect2(top_left, Vector2.ONE * tile_size), Color(wall_color, 0.18), true)
		var left_inset := WALL_EDGE_INSET if edge_mask & WALL_EDGE_LEFT else 0.0
		var right_inset := WALL_EDGE_INSET if edge_mask & WALL_EDGE_RIGHT else 0.0
		var top_inset := WALL_EDGE_INSET if edge_mask & WALL_EDGE_TOP else 0.0
		var bottom_inset := WALL_EDGE_INSET if edge_mask & WALL_EDGE_BOTTOM else 0.0
		draw_rect(
			Rect2(
				top_left + Vector2(left_inset, top_inset),
				Vector2(tile_size - left_inset - right_inset, tile_size - top_inset - bottom_inset),
			),
			wall_inner_color,
			true
		)
		_draw_exposed_wall_edges(top_left, edge_mask, Color(wall_color, 0.62))
	for cell: Vector2i in _pellets:
		var center := cell_to_point(cell)
		var icon_size := Vector2.ONE * 9.0
		draw_texture_rect(ENERGY_TEXTURE, Rect2(center - icon_size * 0.5, icon_size), false)
	for cell: Vector2i in _overdrive_cells:
		_draw_powerup(cell, OVERDRIVE_TEXTURE, Color("e9ba70"), 0.0)
	for cell: Vector2i in _shield_cells:
		_draw_powerup(cell, SHIELD_TEXTURE, Color("7edaca"), 1.1)
	for cell: Vector2i in _slow_field_cells:
		_draw_powerup(cell, SLOW_FIELD_TEXTURE, Color("86aaff"), 2.2)
	for cell: Vector2i in _magnet_cells:
		_draw_powerup(cell, MAGNET_TEXTURE, Color("c4d7ee"), 3.3)
	if _runner != null and _shield_seconds > 0.0:
		var shield_radius := tile_size * (0.62 + sin(elapsed_seconds * 5.5) * 0.04)
		draw_arc(_runner.position, shield_radius, 0.0, TAU, 32, Color("7edaca"), 2.2)
	if _runner != null and _magnet_seconds > 0.0:
		var breeze_radius := tile_size * (0.86 + sin(elapsed_seconds * 4.0) * 0.05)
		draw_arc(_runner.position, breeze_radius, 0.0, TAU, 32, Color(0.7, 0.82, 1.0, 0.5), 1.4)


func _wall_edge_mask(cell: Vector2i) -> int:
	if not _walls.has(cell):
		return 0
	var mask := 0
	if is_walkable(cell + Vector2i.UP):
		mask |= WALL_EDGE_TOP
	if is_walkable(cell + Vector2i.RIGHT):
		mask |= WALL_EDGE_RIGHT
	if is_walkable(cell + Vector2i.DOWN):
		mask |= WALL_EDGE_BOTTOM
	if is_walkable(cell + Vector2i.LEFT):
		mask |= WALL_EDGE_LEFT
	return mask


func _draw_exposed_wall_edges(top_left: Vector2, edge_mask: int, border_color: Color) -> void:
	var far_edge := tile_size - WALL_BORDER_OFFSET
	if edge_mask & WALL_EDGE_TOP:
		draw_line(
			top_left + Vector2(0.0, WALL_BORDER_OFFSET),
			top_left + Vector2(tile_size, WALL_BORDER_OFFSET),
			border_color,
			WALL_BORDER_WIDTH,
		)
	if edge_mask & WALL_EDGE_RIGHT:
		draw_line(
			top_left + Vector2(far_edge, 0.0),
			top_left + Vector2(far_edge, tile_size),
			border_color,
			WALL_BORDER_WIDTH,
		)
	if edge_mask & WALL_EDGE_BOTTOM:
		draw_line(
			top_left + Vector2(0.0, far_edge),
			top_left + Vector2(tile_size, far_edge),
			border_color,
			WALL_BORDER_WIDTH,
		)
	if edge_mask & WALL_EDGE_LEFT:
		draw_line(
			top_left + Vector2(WALL_BORDER_OFFSET, 0.0),
			top_left + Vector2(WALL_BORDER_OFFSET, tile_size),
			border_color,
			WALL_BORDER_WIDTH,
		)


func _draw_powerup(cell: Vector2i, texture: Texture2D, color: Color, phase: float) -> void:
	var center := cell_to_point(cell)
	var pulse := tile_size * (0.38 + (0.0 if bool(TuningStore.get_value("ui.reduced_motion", false)) else sin(elapsed_seconds * 3.0 + phase)) * 0.035)
	draw_circle(center, pulse, Color(color, 0.09))
	var icon_size := Vector2.ONE * tile_size * 0.9
	draw_texture_rect(texture, Rect2(center - icon_size * 0.5, icon_size), false)
