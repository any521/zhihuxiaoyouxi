extends Control

signal finished(success: bool)

const ROAD := Color("#313b4c")
const ROAD_LINE := Color("#e7eef9")
const DANGER := Color("#fb6b6b")
const MINT := Color("#30d48a")

var player_x := 0.5
var time_left := 90.0
var progress := 0.0
var hits := 0
var done := false
var extra_files := 0
var obstacles: Array = []
var damage_flash_time := 0.0
var status_label: Label
var countdown_label: Label
var progress_label: Label


## 开局条件由事件 8 的固定选项决定（见 STORY_BIBLE §6.8）：可用时间与桌面干扰文件数。
func configure(seconds: float, distractors: int) -> void:
	time_left = seconds
	extra_files = maxi(0, distractors)
	obstacles.clear()
	spawn_obstacles()


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	build_overlay()
	spawn_obstacles()
	queue_redraw()


func build_overlay() -> void:
	var shade := ColorRect.new()
	shade.color = Color(0.04, 0.08, 0.13, 0.94)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(shade)

	var title := Label.new()
	title.text = "紧急送件 · 文件绝不能折"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 26)
	title.add_theme_color_override("font_color", Color("#ffffff"))
	title.set_anchors_preset(Control.PRESET_CENTER_TOP)
	title.position = Vector2(-290, 26)
	title.size = Vector2(580, 42)
	add_child(title)

	status_label = Label.new()
	status_label.text = "A / ← 向左 · D / → 向右 · 躲开人群、单车和雨伞"
	status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	status_label.add_theme_font_size_override("font_size", 14)
	status_label.add_theme_color_override("font_color", Color("#c7d4e7"))
	status_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	status_label.position = Vector2(-320, 70)
	status_label.size = Vector2(640, 28)
	add_child(status_label)

	countdown_label = Label.new()
	countdown_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	countdown_label.add_theme_font_size_override("font_size", 18)
	countdown_label.add_theme_color_override("font_color", Color("#ffd7a1"))
	countdown_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	countdown_label.position = Vector2(-150, 106)
	countdown_label.size = Vector2(300, 28)
	add_child(countdown_label)

	progress_label = Label.new()
	progress_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	progress_label.add_theme_font_size_override("font_size", 14)
	progress_label.add_theme_color_override("font_color", Color("#b5f2d0"))
	progress_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	progress_label.position = Vector2(-220, -82)
	progress_label.size = Vector2(440, 26)
	add_child(progress_label)

	var controls := HBoxContainer.new()
	controls.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	controls.position = Vector2(-150, -52)
	controls.size = Vector2(300, 40)
	controls.add_theme_constant_override("separation", 12)
	add_child(controls)
	var left := Button.new()
	left.text = "← 左移"
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	left.pressed.connect(move_by.bind(-0.12))
	controls.add_child(left)
	var right := Button.new()
	right.text = "右移 →"
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.pressed.connect(move_by.bind(0.12))
	controls.add_child(right)


func spawn_obstacles() -> void:
	var pattern := [0.2, 0.68, 0.42, 0.78, 0.28, 0.58]
	for i in range(pattern.size() + extra_files):
		obstacles.append({
			"x": float(pattern[i % pattern.size()]),
			"y": 180.0 + float(i) * 92.0,
			"speed": 115.0 + float((i % 3) * 16),
			"kind": ["件", "伞", "人"][i % 3]
		})


func _process(delta: float) -> void:
	if done:
		return
	var direction := Input.get_axis("move_left", "move_right")
	if direction != 0.0:
		move_by(direction * delta * 0.6)
	time_left = maxf(0.0, time_left - delta)
	progress = minf(100.0, progress + delta * 1.76)
	damage_flash_time = maxf(0.0, damage_flash_time - delta)
	for obstacle in obstacles:
		obstacle.y += float(obstacle.speed) * delta
		check_collision(obstacle)
		if obstacle.y > size.y - 100:
			obstacle.y = 150.0
			obstacle.x = wrapf(float(obstacle.x) + 0.31, 0.1, 0.9)
	if progress >= 100.0:
		end_game(true)
	elif time_left <= 0.0 or hits >= 3:
		end_game(false)
	update_labels()
	queue_redraw()


func move_by(amount: float) -> void:
	player_x = clampf(player_x + amount, 0.12, 0.88)


func check_collision(obstacle: Dictionary) -> void:
	var road_rect := road_rect()
	var player_position := Vector2(road_rect.position.x + road_rect.size.x * player_x, size.y - 150)
	var obstacle_position := Vector2(road_rect.position.x + road_rect.size.x * float(obstacle.x), float(obstacle.y))
	if absf(player_position.x - obstacle_position.x) < 35.0 and absf(player_position.y - obstacle_position.y) < 30.0:
		hits += 1
		damage_flash_time = 0.22
		obstacle.y = 150.0
		obstacle.x = wrapf(float(obstacle.x) + 0.42, 0.1, 0.9)
		status_label.text = "文件被碰到了！再碰 %d 次就会损坏。" % (3 - hits)


func update_labels() -> void:
	countdown_label.text = "剩余 %02d 秒   ·   文件完好度 %d / 3" % [ceili(time_left), 3 - hits]
	progress_label.text = "送件进度  %d%%  %s" % [roundi(progress), "· 快到地铁口了！" if progress > 72 else ""]


func end_game(success: bool) -> void:
	if done:
		return
	done = true
	status_label.text = "客户已收到签约件" if success else "文件没能及时完好送达"
	await get_tree().create_timer(1.5).timeout
	finished.emit(success)


func road_rect() -> Rect2:
	var width := minf(size.x * 0.56, 660.0)
	return Rect2(Vector2((size.x - width) * 0.5, 142), Vector2(width, maxf(260.0, size.y - 250)))


func _draw() -> void:
	var rect := road_rect()
	if damage_flash_time > 0.0:
		draw_rect(Rect2(Vector2.ZERO, size), Color(1.0, 0.22, 0.22, damage_flash_time * 0.7), true)
	draw_rect(rect, ROAD, true)
	draw_rect(rect, Color("#617089"), false, 3)
	for y in range(int(rect.position.y + 22), int(rect.end.y), 44):
		draw_rect(Rect2(rect.get_center().x - 4, y, 8, 22), ROAD_LINE, true)
	for obstacle in obstacles:
		var point := Vector2(rect.position.x + rect.size.x * float(obstacle.x), float(obstacle.y))
		draw_circle(point, 23.0, DANGER)
		draw_string(ThemeDB.fallback_font, point + Vector2(-11, 7), str(obstacle.kind), HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color("#ffffff"))
	var player_point := Vector2(rect.position.x + rect.size.x * player_x, size.y - 150)
	draw_circle(player_point, 31.0, MINT)
	draw_string(ThemeDB.fallback_font, player_point + Vector2(-9, 9), "刘", HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color("#ffffff"))
	var progress_width := rect.size.x * (progress / 100.0)
	draw_rect(Rect2(rect.position.x, rect.end.y + 20, rect.size.x, 8), Color("#455267"), true)
	draw_rect(Rect2(rect.position.x, rect.end.y + 20, progress_width, 8), MINT, true)
