class_name StageCatalog
extends RefCounted

const DIRECTIONS := [Vector2i.RIGHT, Vector2i.DOWN, Vector2i.LEFT, Vector2i.UP]
const COLLECTIBLE_SYMBOLS := [".", "o", "s", "t", "m"]
const SUPPORTED_SYMBOLS := ["#", ".", "o", "s", "t", "m", "P", "E", " "]

const STAGES := [
	{
		"id": "stage_1",
		"name_key": "stage.1.name",
		"floor_color": Color("141820"),
		"wall_color": Color("66788f"),
		"accent_color": Color("70b7ff"),
		"enemy_speed_multiplier": 1.0,
		"rows": [
			"#####################",
			"#o...s....#....t...o#",
			"#.###.###.#.###.###.#",
			"#...................#",
			"#.###.#.#####.#.###.#",
			"#.....#...#...#.....#",
			"#####.###.#.###.#####",
			"#.....#..EEE..#.....#",
			"#.###.#.#####.#.###.#",
			"#...#...........#...#",
			"###.#.###.#.###.#.###",
			"#.....#...P...#.....#",
			"#.#####.#####.#####.#",
			"#o.......m.........o#",
			"#.###.###.#.###.###.#",
			"#.........#.........#",
			"#####################",
		],
	},
	{
		"id": "stage_2",
		"name_key": "stage.2.name",
		"floor_color": Color("151921"),
		"wall_color": Color("687889"),
		"accent_color": Color("c8d6e8"),
		"enemy_speed_multiplier": 1.14,
		"rows": [
			"#####################",
			"#o.s..#...t...#....o#",
			"#.##.#.#####.#.##...#",
			"#....#...#...#......#",
			"####.###.#.###.####.#",
			"#.................#.#",
			"#.###.#.#####.#.###.#",
			"#...#.#..EEE..#.#...#",
			"###.#.###.#.###.#.###",
			"#.....#.......#.....#",
			"#.#####.#####.#####.#",
			"#.........P.........#",
			"#.###.#######.###.#.#",
			"#o..#.........#...#o#",
			"#.#.###.###.###.###.#",
			"#........m..........#",
			"#####################",
		],
	},
]


static func count() -> int:
	return STAGES.size()


static func get_stage(index: int) -> Dictionary:
	if index < 0 or index >= STAGES.size():
		return {}
	return STAGES[index].duplicate(true)


static func dimensions(stage: Dictionary) -> Vector2i:
	var rows: Array = stage.get("rows", [])
	if rows.is_empty():
		return Vector2i.ZERO
	return Vector2i(str(rows[0]).length(), rows.size())


static func validate_stage(stage: Dictionary) -> PackedStringArray:
	var errors := PackedStringArray()
	var rows: Array = stage.get("rows", [])
	if rows.is_empty():
		errors.append("stage has no rows")
		return errors
	var width := str(rows[0]).length()
	var player_count := 0
	var enemy_count := 0
	var collectible_count := 0
	var first_walkable := Vector2i(-1, -1)
	var all_walkable: Dictionary = {}
	for y: int in rows.size():
		var row := str(rows[y])
		if row.length() != width:
			errors.append("row %d has width %d instead of %d" % [y, row.length(), width])
			continue
		for x: int in width:
			var cell := row.substr(x, 1)
			if cell not in SUPPORTED_SYMBOLS:
				errors.append("unsupported cell '%s' at %d,%d" % [cell, x, y])
			if cell == "P":
				player_count += 1
			if cell == "E":
				enemy_count += 1
			if cell in COLLECTIBLE_SYMBOLS:
				collectible_count += 1
			if cell != "#":
				var point := Vector2i(x, y)
				all_walkable[point] = true
				if first_walkable.x < 0:
					first_walkable = point
	if player_count != 1:
		errors.append("stage must contain exactly one player spawn")
	if enemy_count < 1:
		errors.append("stage must contain at least one enemy spawn")
	if collectible_count < 1:
		errors.append("stage must contain collectibles")
	if not all_walkable.is_empty():
		var visited := _flood_fill(first_walkable, all_walkable)
		if visited.size() != all_walkable.size():
			errors.append("all walkable cells must be connected")
	return errors


static func _flood_fill(start: Vector2i, walkable: Dictionary) -> Dictionary:
	var visited := {start: true}
	var queue: Array[Vector2i] = [start]
	var cursor := 0
	while cursor < queue.size():
		var current := queue[cursor]
		cursor += 1
		for direction: Vector2i in DIRECTIONS:
			var next := current + direction
			if walkable.has(next) and not visited.has(next):
				visited[next] = true
				queue.append(next)
	return visited
