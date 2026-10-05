extends SceneTree

# Native renderer evidence only; tools/ is excluded from every playable export.

func _initialize() -> void:
	call_deferred("_capture")

func _capture() -> void:
	var capture_path := OS.get_environment("GENERIC2D_CAPTURE_PATH")
	if capture_path.is_empty():
		push_error("GENERIC2D_CAPTURE_PATH must name an output PNG")
		quit(1)
		return
	var packed: PackedScene = load("res://scenes/main.tscn")
	var main: Control = packed.instantiate()
	root.add_child(main)
	await process_frame
	await process_frame
	if OS.get_environment("GENERIC2D_CAPTURE_GAME") == "1":
		main.call("_enter_city")
		if not OS.get_environment("GENERIC2D_CAPTURE_LOCATION").is_empty():
			main.call("_select_location", OS.get_environment("GENERIC2D_CAPTURE_LOCATION"))
		if OS.get_environment("ALL_CONNECT_CAPTURE_PHONE") == "1":
			main.call("_open_phone")
			var phone_app := OS.get_environment("ALL_CONNECT_CAPTURE_PHONE_APP")
			if not phone_app.is_empty():
				main.call("_phone_open_app", phone_app)
		await process_frame
	for _frame: int in 8:
		await process_frame
	await create_timer(0.25).timeout
	var image := root.get_texture().get_image()
	var error := image.save_png(capture_path)
	print("[capture] %s (%s)" % [capture_path, error_string(error)])
	root.get_node("AudioDirector").call("release_streams")
	await process_frame
	quit(0 if error == OK else 1)
