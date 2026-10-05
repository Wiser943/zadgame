extends Node

var _checks := 0
var _failures := PackedStringArray()

func _ready() -> void:
	call_deferred("_run")

func _run() -> void:
	var packed: PackedScene = load("res://scenes/main.tscn")
	_check(packed != null, "main scene must load")
	if packed != null:
		var instance := packed.instantiate()
		get_tree().root.add_child(instance)
		await get_tree().process_frame
		await get_tree().process_frame
		var overlay: Control = instance.get("_title_overlay")
		_check(overlay != null and overlay.visible, "welcome overlay must be visible on boot")
		var map: Control = instance.get("_map")
		_check(map != null, "city map must be created on boot")
		_check(map.has_method("get_location_info"), "city map must expose location data")
		instance.set("_started", true)
		instance.call("_enter_city")
		await get_tree().process_frame
		_check(not overlay.visible, "entering the city must dismiss the welcome overlay")
		instance.call("_select_location", "maker")
		await get_tree().process_frame
		var selected: Label = instance.get("_selected_name")
		_check(selected != null and selected.text == "Maker Row", "location selection must update the detail card")
		var before_connections := int((instance.get("_state") as Dictionary).get("connections", 0))
		instance.call("_perform_action", "connect")
		await get_tree().process_frame
		var state: Dictionary = instance.get("_state")
		_check(int(state.get("connections", 0)) == before_connections + 1, "connect action must update the local player state")
		_check(FileAccess.file_exists("user://all_connect_save.json"), "player state must be saved locally")
		instance.size = Vector2(720.0, 900.0)
		instance.call("_apply_responsive_layout")
		await get_tree().process_frame
		_check(not (instance.get("_story_panel") as Control).visible, "story panel must collapse on a narrow viewport")
		var fixture_state: Dictionary = instance.get("_state")
		var fixture_contact: Dictionary = fixture_state.contacts[0]
		fixture_contact.connected = false
		fixture_state.contacts[0] = fixture_contact
		var fixture_message: Dictionary = fixture_state.messages[0]
		fixture_message.read = false
		fixture_state.messages[0] = fixture_message
		instance.set("_state", fixture_state)
		instance.call("_open_phone")
		await get_tree().process_frame
		var phone: Control = instance.get("_phone_overlay")
		_check(phone != null and phone.visible, "phone launcher must open from the footer navigation")
		instance.call("_phone_open_app", "phone")
		await get_tree().process_frame
		_check(instance.get("_phone_search") != null, "Phone app must expose a player search field")
		var before_phone_add := int((instance.get("_state") as Dictionary).get("connections", 0))
		instance.call("_phone_add_contact", 0)
		_check(int((instance.get("_state") as Dictionary).get("connections", 0)) == before_phone_add + 1, "Phone app must add a local player")
		instance.call("_phone_open_app", "messages")
		await get_tree().process_frame
		_check((instance.get("_phone_title") as Label).text == "MESSAGES", "Messages app must open inside the phone frame")
		instance.call("_phone_reply_message", 0)
		_check(bool(((instance.get("_state") as Dictionary).messages[0] as Dictionary).get("read", false)), "Messages app must save a reply/read state")
		instance.call("_phone_open_app", "settings")
		_check((instance.get("_phone_title") as Label).text == "SETTINGS", "Settings app must open inside the phone frame")
		instance.call("_phone_open_app", "gamehub")
		await get_tree().process_frame
		var gamehub_has_coming_soon := false
		for child in (instance.get("_phone_content") as VBoxContainer).get_children():
			if child is Label and "COMING SOON" in (child as Label).text:
				gamehub_has_coming_soon = true
		_check(gamehub_has_coming_soon, "Gamehub must show its Coming Soon state")
		instance.queue_free()
	await get_tree().process_frame
	if _failures.is_empty():
		print("[all-connect-tests] PASS: %d checks" % _checks)
		get_tree().quit(0)
	else:
		for failure: String in _failures:
			push_error("[all-connect-tests] " + failure)
		print("[all-connect-tests] FAIL: %d failures across %d checks" % [_failures.size(), _checks])
		get_tree().quit(1)

func _check(condition: bool, message: String) -> void:
	_checks += 1
	if not condition:
		_failures.append(message)
