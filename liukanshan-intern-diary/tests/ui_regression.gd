extends SceneTree

const TEST_MAIN := preload("res://tests/isolated_main.gd")
var app: Control
var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("run")

func check(condition: bool, description: String) -> void:
	print(("PASS " if condition else "FAIL ") + description)
	if not condition:
		failures.append(description)

func settle() -> void:
	for i in range(4):
		await process_frame

func capture(label: String) -> Image:
	await settle()
	await RenderingServer.frame_post_draw
	var shot := root.get_texture().get_image()
	shot.save_png("res://tests/screenshots/" + label + ".png")
	return shot

func find_button(label: String) -> Button:
	for node in app.find_children("*", "Button", true, false):
		if node.text == label and not node.is_queued_for_deletion():
			return node
	return null

func click_button(button: Button) -> void:
	check(button != null, "button exists")
	if button == null:
		return
	button.pressed.emit()
	await settle()


func wait_sequence(timeout: float = 30.0) -> void:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000.0)
	while app.action_sequence_running and Time.get_ticks_msec() < deadline:
		await create_timer(0.05).timeout
	await settle()

func run() -> void:
	root.size = Vector2i(1280, 720)
	root.title = "刘看山 · 独立回归测试（不写入玩家存档）"
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://tests/screenshots"))
	app = TEST_MAIN.new()
	root.add_child(app)
	app.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	await settle()
	check(app.game.contacts == ["林总"] and app.game.groups.is_empty(), "fresh isolated save: boss only")
	check(app.find_child("GroupInvitation", true, false) == null, "boss invitation appears message by message")
	await create_timer(1.6).timeout
	var invitation := app.find_child("GroupInvitation", true, false)
	check(invitation != null and is_equal_approx(invitation.size.x, 300), "invitation is 300px message card")
	await capture("01-invitation")
	await click_button(find_button("加入群聊"))
	check(app.active_tab == "群聊" and app.game.groups == ["群聊"], "click invitation joins and opens group")
	var initial := int(app.game.revealed.get("day-01", 0))
	await create_timer(1.15).timeout
	check(int(app.game.revealed.get("day-01", 0)) == initial + 1, "welcome messages reveal individually")
	app.skip_current_messages()
	await settle()
	await capture("02-welcome")
	app.set_active_tab("林总")
	await settle()
	var notice_count: int = app.game.contact_notices.size()
	var revealed: int = app.game.revealed["day-01"]
	check(find_button("已加入 · 打开群聊") != null, "invitation persists after joining")
	await capture("03-invitation-retained")
	await click_button(find_button("已加入 · 打开群聊"))
	check(app.active_tab == "群聊" and app.game.contact_notices.size() == notice_count and app.game.groups.size() == 1 and app.game.revealed["day-01"] == revealed, "reopen does not duplicate groups, notices, or welcomes")
	var event: Dictionary = app.events[0]
	await click_button(app.find_child("FixedAction2", true, false))
	await wait_sequence()
	var silent_reply: Dictionary = app.game.history.filter(func(h): return str(h.get("event_id", "")) == "day-01" and str(h.get("text", "")) == "@刘看山 第一天就没看到群消息，可不是个好兆头。").back()
	check(str(silent_reply.get("sender", "")) == "林总", "silent intro feedback is sent by boss")
	check(not str(silent_reply.get("text", "")).contains("林总："), "sender name is not duplicated in bubble text")
	var group_input: LineEdit
	for control in app.decision_box.find_children("*", "LineEdit", true, false):
		group_input = control
	group_input.text = "第一天有什么需要注意的吗？"
	await click_button(find_button("发送"))
	check(app.game.history.any(func(h): return str(h.get("text", "")) == "第一天有什么需要注意的吗？"), "group question appears before withdrawal")
	await create_timer(1.25).timeout
	check(app.game.day01_redirected and app.game.contacts.has("周岚"), "first group question unlocks leader")
	check(app.game.history.any(func(h): return str(h.text).contains("撤回")), "withdrawal recorded")
	check(not app.game.history.any(func(h): return str(h.get("text", "")) == "第一天有什么需要注意的吗？"), "withdrawn question disappears after animation")
	await capture("04-group-redirect")
	check(find_button("继续实习生活……") == null, "group chat cannot bypass Zhihu cards")
	await click_button(find_button("去私聊周岚  →"))
	check(app.active_tab == "周岚", "open leader chat")
	var day_one_cards := app.find_child("ZhihuAnswerSlots", true, false)
	var day_one_prompt := app.find_child("NpcFollowupPanel", true, false)
	check(day_one_cards != null and day_one_cards.find_child("ZhihuAnswerSlot1", true, false) != null and day_one_cards.find_child("ZhihuAnswerSlot2", true, false) != null, "day one shows two Zhihu answer cards")
	check(day_one_prompt != null and day_one_cards.get_index() < day_one_prompt.get_index(), "day one cards appear before follow-up panel")
	app.npc_input.text = "我现在最需要确认什么？"
	await click_button(find_button("追问"))
	check(app.game.asks.get("day-01", 0) == 1, "private follow-up still works")
	for row in app.chat_list.get_children():
		if row.name.begins_with("OwnMessage"):
			check(row.get_child(row.get_child_count() - 1).get_script() == app.AVATAR, "own avatar follows bubble on right")
	await capture("05-private-chat")
	var finish := find_button("继续实习生活……")
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_disabled_color", "font_focus_color"]:
		check(finish.get_theme_color(state) == Color("#202020"), "explicit button text " + state)
	check(finish.size.y >= 44 and finish.get_theme_font_size("font_size") == 18, "readable continuation size")
	finish.disabled = true
	await capture("06-disabled-button")
	finish.disabled = false
	finish.grab_focus()
	await capture("07-focus-button")
	var transition_started := Time.get_ticks_msec()
	await click_button(finish)
	check(app.current_index == 1, "continuation advances day")
	check(is_instance_valid(app.event_loading), "transition begins with time-passing screen")
	await capture("08-event-loading")
	while is_instance_valid(app.event_loading):
		await create_timer(0.05).timeout
	check(Time.get_ticks_msec() - transition_started >= 1500, "two-stage transition lasts at least 1.5 seconds")
	check(not is_instance_valid(app.event_loading), "transition finishes after both stages")
	await create_timer(1.8).timeout
	app.unlock_contacts_for_event(app.events[2])
	app.set_active_mode("contacts")
	await capture("09-contacts")
	check(app.game.contacts.has("阿麦"), "later character unlocked normally")
	# Task completion stays on the same day until the player explicitly continues.
	app.current_index = 1
	app.active_tab = "林总"
	app.game.revealed["day-03"] = app.events[1].messages.size()
	app.game.completed = []
	app.render_current_view()
	await settle()
	check(app.find_child("NpcFollowupPanel", true, false) == null, "follow-up panel stays hidden before task completion")
	await click_button(app.find_child("FixedAction0", true, false))
	await wait_sequence()
	check(app.current_index == 1 and app.game.completed.has("day-03"), "task completion waits on current day")
	check(app.find_child("ZhihuAnswerSlot1", true, false) != null and app.find_child("ZhihuAnswerSlot2", true, false) != null, "two Zhihu answer placeholders appear")
	var task_cards := app.find_child("ZhihuAnswerSlots", true, false)
	var task_prompt := app.find_child("NpcFollowupPanel", true, false)
	check(task_prompt != null and task_cards.get_index() < task_prompt.get_index(), "Zhihu cards appear before task follow-up panel")
	check(find_button("收好今天的经验，继续实习生活……") != null, "explicit next-day choice appears")
	await capture("11-task-complete-with-zhihu-slots")
	app.game.asks["day-03"] = 3
	app.render_current_view()
	await settle()
	check(not app.npc_send.disabled and app.npc_input.editable, "follow-ups remain unlimited after three asks")
	check(app.events.size() == 10, "three-month story contains ten events")
	var ai_count := 0
	for story_event in app.events:
		if str(story_event.get("mode", "fixed")) == "ai":
			ai_count += 1
	check(ai_count == 5, "five events use free-form AI dialogue")
	# AI event: two weak turns remain incomplete, then explicit goal evidence completes it.
	app.current_index = 3
	app.active_tab = "程女士"
	app.game.revealed["day-07"] = app.events[3].messages.size()
	app.game.completed = []
	app.game.history = []
	app.render_current_view()
	await settle()
	check(app.find_child("AiEventDialoguePanel", true, false) != null, "AI event shows free-form dialogue panel")
	check(find_button("  " + str(app.events[3].get("brief", ""))) == null, "AI event has no fixed action choice")
	app.npc_input.text = "我先看看。"
	await click_button(find_button("发送"))
	app.npc_input.text = "稍后再说。"
	await click_button(find_button("发送"))
	await click_button(app.find_child("SubmitAiEvent", true, false))
	check(not app.game.completed.has("day-07") and str(app.game.event_results["day-07"].status) == "incomplete", "incomplete AI evaluation blocks progression")
	app.npc_input.text = "我先确认您具体关心哪一类风险，目前资料和数据不足，不能确认。"
	await click_button(find_button("发送"))
	app.npc_input.text = "我会在明天十点前补充完整数据并回复。"
	await click_button(find_button("发送"))
	await click_button(app.find_child("SubmitAiEvent", true, false))
	check(app.game.completed.has("day-07") and str(app.game.event_results["day-07"].status) == "excellent", "goal evidence completes AI event with excellent result")
	check(app.find_child("ZhihuAnswerSlot1", true, false) != null, "Zhihu cards appear after AI evaluation")
	# Event six is a retained message card from Zhou Lan with a playable fallback result.
	app.current_index = 5
	app.active_tab = "周岚"
	app.game.completed = []
	app.game.revealed["ppt-assembly"] = app.events[5].messages.size()
	app.render_current_view()
	await settle()
	check(app.find_child("PptMinigameCard", true, false) != null and find_button("开始整理") != null, "Zhou Lan sends PPT minigame card")
	await click_button(find_button("使用演示结果继续"))
	check(app.game.completed.has("ppt-assembly") and app.game.minigame_results.has("ppt-assembly"), "PPT demo callback completes event")
	# Cross-channel authored lines never render in the boss chat.
	app.current_index = 3
	app.active_tab = "林总"
	app.game.revealed["day-07"] = app.events[3].messages.size()
	app.render_current_view()
	await settle()
	var boss_text := ""
	for label in app.chat_list.find_children("*", "Label", true, false):
		boss_text += label.text
	check(not boss_text.contains("授权和舆情"), "client message does not leak into boss chat")
	app.set_active_tab("程女士")
	await settle()
	var client_text := ""
	for label in app.chat_list.find_children("*", "Label", true, false):
		client_text += label.text
	check(client_text.contains("授权和舆情"), "client message appears in client chat")
	app.save_game()
	var saved: Dictionary = app.test_save.duplicate(true)
	app.load_game()
	check(app.game == saved, "progress survives reload without migration")
	await crop_and_states_test()
	# 收尾等待：让在飞的"正在输入/占位气泡"协程跑完，避免退出时 ObjectDB 泄漏导致非零退出码。
	await create_timer(1.8).timeout
	await settle()
	print("UI_REGRESSION_RESULT: " + ("PASS" if failures.is_empty() else str(failures)))
	quit(0 if failures.is_empty() else 1)

func crop_and_states_test() -> void:
	app.hide()
	var panel := PanelContainer.new()
	panel.position = Vector2(120, 100)
	panel.size = Vector2(1000, 500)
	panel.theme = app.theme
	panel.add_theme_stylebox_override("panel", app.panel_style(Color("#f7f7f7"), 6))
	root.add_child(panel)
	var stack := VBoxContainer.new()
	panel.add_child(stack)
	var title := Label.new()
	title.text = "裁剪回归：横图 / 竖图的红色圆形应保持正圆；下方为按钮各状态"
	title.add_theme_color_override("font_color", Color("#202020"))
	stack.add_child(title)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	stack.add_child(row)
	for dimensions in [Vector2i(256, 128), Vector2i(128, 256)]:
		var fixture := Image.create(dimensions.x, dimensions.y, false, Image.FORMAT_RGBA8)
		fixture.fill(Color("#3688d4"))
		for y in range(dimensions.y):
			for x in range(dimensions.x):
				if Vector2(x - dimensions.x / 2, y - dimensions.y / 2).length() < 28:
					fixture.set_pixel(x, y, Color.RED)
		var avatar: TextureRect = app.AVATAR.new()
		avatar.setup("fixture", 128, ImageTexture.create_from_image(fixture))
		row.add_child(avatar)
	for role in ["刘看山", "林总", "周岚", "阿麦", "韩策", "小鹿", "群聊"]:
		row.add_child(app.make_avatar(role, 72))
	var buttons := HBoxContainer.new()
	stack.add_child(buttons)
	for state in ["normal", "hover", "pressed", "disabled", "focus"]:
		var b := Button.new()
		b.text = "继续实习生活……"
		app.style_readable_button(b)
		if state != "focus":
			b.add_theme_stylebox_override("normal", b.get_theme_stylebox(state))
		if state == "disabled":
			b.disabled = true
		buttons.add_child(b)
		if state == "focus":
			b.grab_focus()
	var shot := await capture("10-cover-and-button-states")
	for avatar in row.get_children().slice(0, 2):
		var area := Rect2i(avatar.get_global_rect())
		var rendered := shot.get_region(area)
		var min_x := 128
		var min_y := 128
		var max_x := 0
		var max_y := 0
		for y in range(128):
			for x in range(128):
				var c := rendered.get_pixel(x, y)
				if c.r > 0.8 and c.g < 0.2 and c.b < 0.2:
					min_x = mini(min_x, x)
					min_y = mini(min_y, y)
					max_x = maxi(max_x, x)
					max_y = maxi(max_y, y)
		check(abs((max_x - min_x) - (max_y - min_y)) <= 1 and max_x > min_x, "non-square texture cover preserves circular landmark")
	panel.queue_free()
