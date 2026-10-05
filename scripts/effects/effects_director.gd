class_name EffectsDirector
extends Node2D

const MAX_BURST_EMITTERS := 12
const BASE_BURST_AMOUNT := 18

var _burst_pool: Array[CPUParticles2D] = []
var _pool_cursor := 0
var _ambient: CPUParticles2D


func _ready() -> void:
	for index: int in MAX_BURST_EMITTERS:
		var emitter := CPUParticles2D.new()
		emitter.name = "Burst%d" % index
		emitter.one_shot = true
		emitter.emitting = false
		emitter.z_index = 10
		add_child(emitter)
		_burst_pool.append(emitter)
	_ambient = CPUParticles2D.new()
	_ambient.name = "AmbientLight"
	_ambient.amount = 32
	_ambient.lifetime = 5.5
	_ambient.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	_ambient.direction = Vector2.UP
	_ambient.spread = 28.0
	_ambient.gravity = Vector2(5.0, -2.0)
	_ambient.initial_velocity_min = 3.0
	_ambient.initial_velocity_max = 10.0
	_ambient.scale_amount_min = 0.7
	_ambient.scale_amount_max = 1.8
	_ambient.color = Color(0.65, 0.77, 0.94, 0.18)
	_ambient.z_index = 1
	add_child(_ambient)
	TuningStore.value_changed.connect(_on_tuning_changed)
	_refresh_density()


func configure(world_size: Vector2) -> void:
	_ambient.position = world_size * 0.5
	_ambient.emission_rect_extents = world_size * 0.48
	_refresh_density()


func burst(world_position: Vector2, color: Color, scale_multiplier: float = 1.0) -> void:
	var density := float(TuningStore.get_value("environment.particles.density", 1.0))
	if density <= 0.0:
		return
	var reduced_motion := bool(TuningStore.get_value("ui.reduced_motion", false))
	var particles: CPUParticles2D = _burst_pool[_pool_cursor]
	_pool_cursor = (_pool_cursor + 1) % _burst_pool.size()
	particles.position = world_position
	particles.amount = 4 if reduced_motion else clampi(roundi(BASE_BURST_AMOUNT * density), 4, 48)
	particles.lifetime = 0.22 if reduced_motion else 0.52 * scale_multiplier
	particles.explosiveness = 1.0 if reduced_motion else 0.92
	particles.direction = Vector2.UP
	particles.spread = 180.0
	particles.gravity = Vector2.ZERO if reduced_motion else Vector2(0.0, 42.0)
	particles.initial_velocity_min = 0.0 if reduced_motion else 45.0 * scale_multiplier
	particles.initial_velocity_max = 8.0 if reduced_motion else 115.0 * scale_multiplier
	particles.scale_amount_min = 1.6
	particles.scale_amount_max = 2.4 if reduced_motion else 3.8 * scale_multiplier
	particles.color = color
	particles.restart()


func stage_clear(world_size: Vector2, color: Color) -> void:
	if bool(TuningStore.get_value("ui.reduced_motion", false)):
		burst(world_size * 0.5, color, 1.0)
		return
	for index: int in 8:
		var position := Vector2(
			world_size.x * (0.1 + 0.8 * float(index % 4) / 3.0),
			world_size.y * (0.25 + 0.5 * float(index / 4)),
		)
		burst(position, color, 1.35)


func debug_snapshot() -> Dictionary:
	return {
		"burst_capacity": _burst_pool.size(),
		"child_count": get_child_count(),
		"ambient": _ambient != null,
		"reduced_motion": bool(TuningStore.get_value("ui.reduced_motion", false)),
	}


func _refresh_density() -> void:
	if _ambient == null:
		return
	var density := float(TuningStore.get_value("environment.particles.density", 1.0))
	var reduced := bool(TuningStore.get_value("ui.reduced_motion", false))
	_ambient.amount = clampi(roundi(32.0 * density), 1, 64)
	_ambient.emitting = density > 0.0 and not reduced


func _on_tuning_changed(id: String, _requested: Variant, _active: Variant) -> void:
	if id in ["environment.particles.density", "ui.reduced_motion"]:
		_refresh_density()
