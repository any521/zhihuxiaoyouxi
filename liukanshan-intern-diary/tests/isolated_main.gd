extends "res://scripts/main.gd"
## Test-only in-memory save. Never reads, deletes, or overwrites the player's save.
var test_save: Dictionary = {}

func load_game() -> void:
	game = new_game_state() if test_save.is_empty() else test_save.duplicate(true)
	current_index = int(game.get("current_index", 0))
	active_tab = str(game.get("active_tab", "林总"))

func save_game() -> void:
	game.version = SAVE_VERSION
	game.current_index = current_index
	game.active_tab = active_tab
	test_save = game.duplicate(true)

func reset_game() -> void:
	test_save = {}
	load_game()
	render_current_view()

func get_api_origin() -> String:
	return ""
