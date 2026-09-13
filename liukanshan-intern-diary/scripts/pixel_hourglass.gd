extends Control
## A code-drawn pixel hourglass: crisp in native and Web builds, no font/emoji dependency.

var sand_phase := 0.0


func _ready() -> void:
	custom_minimum_size = Vector2(72, 72)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sand_tween := create_tween().set_loops()
	sand_tween.tween_method(set_sand_phase, 0.0, 1.0, 0.72)
	sand_tween.tween_callback(reset_sand)
	var flip_tween := create_tween().set_loops()
	flip_tween.tween_property(self, "rotation_degrees", 180.0, 0.16).set_delay(0.72)
	flip_tween.tween_interval(0.72)
	flip_tween.tween_property(self, "rotation_degrees", 360.0, 0.16)


func set_sand_phase(value: float) -> void:
	sand_phase = value
	queue_redraw()


func reset_sand() -> void:
	sand_phase = 0.0
	queue_redraw()


func _draw() -> void:
	var pixel := 6.0
	var frame := Color("#26333c")
	var sand := Color("#e3a72f")
	for x in range(2, 10):
		draw_rect(Rect2(x * pixel, pixel, pixel, pixel), frame)
		draw_rect(Rect2(x * pixel, 10 * pixel, pixel, pixel), frame)
	for y in range(2, 10):
		draw_rect(Rect2(2 * pixel + (y - 2) * pixel * 0.42, y * pixel, pixel, pixel), frame)
		draw_rect(Rect2(9 * pixel - (y - 2) * pixel * 0.42, y * pixel, pixel, pixel), frame)
	var upper_rows := maxi(0, 4 - int(sand_phase * 4.0))
	for row in range(upper_rows):
		for x in range(4 + row, 8 - row):
			draw_rect(Rect2(x * pixel, (3 + row) * pixel, pixel, pixel), sand)
	var lower_rows := mini(4, int(sand_phase * 4.0) + 1)
	for row in range(lower_rows):
		for x in range(6 - row, 6 + row + 1):
			draw_rect(Rect2(x * pixel, (9 - row) * pixel, pixel, pixel), sand)
	draw_rect(Rect2(5.5 * pixel, 6 * pixel, pixel, pixel), sand)
