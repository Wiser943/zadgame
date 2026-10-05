extends SceneTree

var _failures: Array[String] = []


func _initialize() -> void:
	call_deferred("_verify")


func _verify() -> void:
	_check(ProjectSettings.get_setting("application/config/name") == "Generic Game Template", "exported identity")
	for path: String in [
		"environment/backdrop.png", "environment/foreground.png",
		"characters/runner.png", "characters/sentinel.png",
		"powerups/energy.png", "powerups/overdrive.png", "powerups/shield.png",
		"powerups/slow_field.png", "powerups/magnet.png",
		"ui/title_glass.png", "ui/pause_glass.png",
		"fonts/Figtree-VF.subset.woff2", "fonts/NotoSansSC-VF.subset.woff2", "fonts/display/Sora-VF.subset.woff2",
	]:
		_check(ResourceLoader.exists("res://assets/template/" + path), "pack resource: " + path)
	_check(not ResourceLoader.exists("res://test/test_suite.tscn"), "test scene excluded")
	_check(not ResourceLoader.exists("res://tools/capture_native.gd"), "native capture tool excluded")
	_check(not ResourceLoader.exists("res://autoload/global_leaderboard.gd"), "retired host adapter excluded")
	_check(not root.has_node("GlobalLeaderboard"), "no dormant network autoload")
	_check(not DirAccess.dir_exists_absolute("res://assets/template/generated"), "retired creative assets excluded")
	_check(not DirAccess.dir_exists_absolute("res://assets/template/audio"), "no default audio assets")
	var font := load("res://assets/template/fonts/ui_regular.tres") as Font
	_check(font != null, "exported font")
	for locale: String in ["en", "zh-CN"]:
		var path := "res://localization/%s.json" % locale
		_check(FileAccess.file_exists(path), "exported locale: " + locale)
		var catalog: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(path))
		for value: String in catalog.values():
			for index: int in value.length():
				var codepoint := value.unicode_at(index)
				if codepoint >= 32:
					_check(font != null and font.has_char(codepoint), "exported glyph: %d" % codepoint)
	var packed := load("res://scenes/main.tscn") as PackedScene
	_check(packed != null, "exported main scene")
	if packed != null:
		var main := packed.instantiate()
		root.add_child(main)
		await process_frame
		await process_frame
		_check(bool((main.get("_title_screen") as Control).visible), "pack boots to title")
		_check(not main.has_method("_maybe_capture"), "capture routing removed from runtime")
		# The shared release projection strips development controls even when
		# this Web PCK is inspected by a debug-capable native editor binary.
		_check(not main.has_method("_open_tuning"), "release tuning entry point excluded")
		_check(not ResourceLoader.exists("res://scripts/ui/tuning_panel.gd"), "release tuning panel excluded")
		main.call("_start_new_run")
		await process_frame
		_check(main.get("_world") != null, "pack starts gameplay")
		var audio := root.get_node("AudioDirector")
		_check(not bool(audio.call("play_cue", "ui.confirm")), "pack missing SFX is silent")
		_check(not bool(audio.call("play_music", "music.gameplay")), "pack missing BGM is silent")
		audio.call("release_streams")
		main.queue_free()
		await process_frame
	if _failures.is_empty():
		print("[exported-pack] PASS: identity, resources, fonts, exclusions, boot, gameplay, silent audio")
		quit(0)
	else:
		for failure: String in _failures:
			push_error("[exported-pack] " + failure)
		quit(1)


func _check(condition: bool, context: String) -> void:
	if not condition and context not in _failures:
		_failures.append(context)
