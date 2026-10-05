class_name RunScoreService
extends RefCounted

const SCORE_EVENTS := {
	"energy": 10,
	"overdrive": 50,
	"powerup": 75,
	"sentinel_disable": 200,
	"stage_clear": 500,
}

var _score := 0
var _finalized := false
var _result: Dictionary = {}


func begin(initial_score: int = 0) -> void:
	_score = clampi(initial_score, 0, 999999999)
	_finalized = false
	_result.clear()


func award(event_id: String, count: int = 1) -> int:
	if _finalized or not SCORE_EVENTS.has(event_id) or count <= 0:
		return _score
	_score = clampi(_score + int(SCORE_EVENTS[event_id]) * count, 0, 999999999)
	return _score


func get_score() -> int:
	return _score


func finalize(stage: int, outcome: String, duration: float, ranked_eligible: bool, configuration_marker: String, tutorial: bool = false) -> Dictionary:
	if _finalized:
		return _result.duplicate(true)
	_finalized = true
	_result = {
		"score": _score,
		"stage": clampi(stage, 1, StageCatalog.count()),
		"outcome": outcome if outcome in ["victory", "defeat"] else "defeat",
		"duration": clampf(duration, 0.0, 99999.0),
		"ranked_eligible": ranked_eligible and not tutorial,
		"configuration_marker": configuration_marker,
		"tutorial": tutorial,
		"finalized_at": int(Time.get_unix_time_from_system()),
	}
	return _result.duplicate(true)


func get_result() -> Dictionary:
	return _result.duplicate(true)


static func event_value(event_id: String) -> int:
	return int(SCORE_EVENTS.get(event_id, 0))


static func authored_collectible_maximum(stage_data: Dictionary) -> int:
	var score := SCORE_EVENTS.stage_clear
	for raw_row: Variant in stage_data.get("rows", []):
		var row := str(raw_row)
		score += row.count(".") * SCORE_EVENTS.energy
		score += row.count("o") * SCORE_EVENTS.overdrive
		score += (row.count("s") + row.count("t") + row.count("m")) * SCORE_EVENTS.powerup
	return score
