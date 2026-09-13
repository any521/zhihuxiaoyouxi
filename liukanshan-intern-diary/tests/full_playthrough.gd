extends SceneTree

## 完整通关走查：从新存档一路跑到结局。
## 需要 AI 现场生成的内容在剧本里是空白气泡占位，本测试会把它们打印为 〔空白气泡·角色〕。
## 运行：
##   Godot_v4.4.1-stable_win64_console.exe --path . --script res://tests/full_playthrough.gd

const TEST_MAIN := preload("res://tests/isolated_main.gd")
const BLANK := "〔空白气泡·%s〕"

var app: Control
var failures: Array[String] = []
var transcript: Array[String] = []


func _initialize() -> void:
	call_deferred("run")


func check(condition: bool, description: String) -> void:
	print(("PASS " if condition else "FAIL ") + description)
	if not condition:
		failures.append(description)


func say(line: String) -> void:
	transcript.append(line)
	print(line)


func settle() -> void:
	for i in range(4):
		await process_frame


func find_button(label: String) -> Button:
	for node in app.find_children("*", "Button", true, false):
		if node.text == label and not node.is_queued_for_deletion():
			return node
	return null


func click_button(button: Button) -> void:
	check(button != null, "button exists: " + (button.text if button != null else "<null>"))
	if button == null:
		return
	button.pressed.emit()
	await settle()


func find_node_named(node_name: String) -> Node:
	var direct: Node = app.find_child(node_name, true, false)
	if direct != null:
		return direct
	for node in app.find_children(node_name + "*", "", true, false):
		if str(node.name).begins_with(node_name):
			return node
	return null


func wait_reveal(event_id: String, timeout: float = 30.0) -> void:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000.0)
	var event: Dictionary = app.EVENTS.get_event_by_id(event_id)
	if event.is_empty():
		return
	while Time.get_ticks_msec() < deadline:
		if app.current_index >= app.events.size():
			return
		if int(app.game.revealed.get(event_id, 0)) >= event.messages.size():
			await settle()
			return
		await create_timer(0.2).timeout
	check(false, "reveal finished in time: " + event_id)


func wait_transition() -> void:
	var deadline := Time.get_ticks_msec() + 8000
	while is_instance_valid(app.event_loading) and Time.get_ticks_msec() < deadline:
		await create_timer(0.05).timeout
	await settle()


## 选项之后的对话是逐条播放的：等它播完再断言。
func wait_sequence(timeout: float = 40.0) -> void:
	var deadline := Time.get_ticks_msec() + int(timeout * 1000.0)
	while app.action_sequence_running and Time.get_ticks_msec() < deadline:
		await create_timer(0.05).timeout
	await settle()


func continue_to_next_day() -> void:
	var button := find_button("收好今天的经验，继续实习生活……")
	if button == null:
		button = find_button("继续实习生活……")
	if button == null:
		button = find_button("查看实习结局……")
	await click_button(button)
	await wait_transition()


func dump_event(event_id: String, channel: String) -> void:
	say("  —— %s 聊天记录 ——" % channel)
	var event: Dictionary = app.EVENTS.get_event_by_id(event_id)
	for item in event.messages:
		if app.event_message_channel(item, event) != channel:
			continue
		if app.message_kind(item) == "typing":
			continue
		if app.message_kind(item) == "system":
			say("  〔系统〕%s" % str(item[1]))
		elif app.message_kind(item) == "file":
			say("  %s：［文件］%s" % [str(item[0]), str(item[1])])
		else:
			say("  %s：%s" % [str(item[0]), str(item[1])])
	for item in app.game.history:
		if str(item.get("event_id", "")) != event_id or str(item.get("channel", "")) != channel:
			continue
		var sender := str(item.get("sender", ""))
		var text := str(item.get("text", ""))
		if sender == "系统":
			say("  〔系统〕%s" % text)
		elif text.strip_edges().is_empty():
			say("  %s：%s　← AI 待生成" % [sender, BLANK % sender])
		else:
			say("  %s：%s" % [sender, text])


func ask_npc(text: String) -> void:
	app.npc_input.text = text
	await click_button(find_button("追问"))


func send_ai_message(text: String) -> void:
	app.npc_input.text = text
	await click_button(find_button("发送"))


func run() -> void:
	root.size = Vector2i(1280, 720)
	root.title = "刘看山 · 完整通关走查（内存存档）"
	app = TEST_MAIN.new()
	root.add_child(app)
	app.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	await settle()

	say("")
	say("======== 完整通关走查 · 优秀路线 ========")
	say("【开局】新存档：只有林总一个联系人，scores 0/0/0")

	# ---------- 事件 1 ----------
	say("")
	say("【事件 1 · 初入看山创意部】")
	check(app.game.contacts == ["林总"] and app.game.groups.is_empty(), "fresh save has boss only")
	check(find_node_named("GroupInvitation") == null, "invitation is not shown in the same tick")
	await create_timer(1.6).timeout
	check(find_node_named("GroupInvitation") != null, "invitation card appears after the first bubble")
	await click_button(find_button("加入群聊"))
	check(app.active_tab == "群聊" and app.game.groups == ["群聊"], "joining opens the group")
	await wait_reveal("day-01")
	check(int(app.game.revealed["day-01"]) == 11, "day one reveals all eleven rows (system + ten bubbles)")
	var group_text := ""
	for label in app.chat_list.find_children("*", "Label", true, false):
		group_text += label.text + "\n"
	check(group_text.contains("［文件］项目排期_v4.xlsx"), "file bubble renders as a file card")
	check(group_text.contains("正在输入…") == false, "group chat never shows a typing hint")
	await create_timer(0.2).timeout
	check(find_node_named("TypingLine") == null, "no typing line while the group reveal plays")
	await click_button(find_node_named("FixedAction0"))
	await wait_sequence()
	check(bool(app.game.day01_intro_selected), "intro option recorded")
	check(int(app.game.scores.trust) == 1 and int(app.game.scores.team) == 2 and int(app.game.scores.growth) == 2, "intro option A scores +1/+2/+2")
	var day_one_history := ""
	for item in app.game.history:
		if str(item.get("event_id", "")) == "day-01":
			day_one_history += str(item.get("sender", "")) + "：" + str(item.get("text", "")) + "\n"
	check(day_one_history.contains("大家好，我是刘看山。之前做过一点校园活动的执行"), "player bubble uses first-person wording")
	check(not day_one_history.contains("说明来处、想学什么，并主动约同事咖啡"), "behaviour label never becomes a chat bubble")
	# 群内追问 → 被撤回 → 周岚加好友
	var group_input: LineEdit
	for control in app.decision_box.find_children("*", "LineEdit", true, false):
		group_input = control
	check(group_input != null, "group question box exists after the intro")
	group_input.text = "第一天有什么需要注意的吗？"
	await click_button(find_button("发送"))
	await create_timer(1.4).timeout
	await settle()
	check(bool(app.game.day01_redirected), "asking in the group triggers the withdrawal beat")
	check(app.game.history.any(func(h): return str(h.get("text", "")) == "周岚撤回了一条消息"), "withdrawal system row uses WeChat wording")
	check(not app.game.history.any(func(h): return str(h.get("text", "")) == "第一天有什么需要注意的吗？"), "withdrawn question disappears")
	check(app.game.contacts.has("周岚"), "Zhou Lan adds the player after the withdrawal")
	dump_event("day-01", "群聊")
	await click_button(find_button("去私聊周岚  →"))
	check(app.active_tab == "周岚", "leader chat opens")
	check(find_node_named("ZhihuAnswerSlot1") != null and find_node_named("ZhihuAnswerSlot2") != null, "two Zhihu cards appear in the leader chat")
	var zhou_chat := ""
	for label in app.chat_list.find_children("*", "Label", true, false):
		zhou_chat += label.text + "\n"
	check(zhou_chat.contains("我翻到两篇讲这个的，你看看。"), "event one cards are forwarded by the leader")
	await ask_npc("那两篇里说的「具体」，具体到什么程度算够？")
	check(int(app.game.asks.get("day-01", 0)) == 1, "follow-up question recorded")
	await create_timer(1.5).timeout
	await settle()
	var blank_bubble: Node = app.chat_list.find_child("AiPlaceholderBubble", true, false)
	check(blank_bubble != null, "AI follow-up answer is a blank placeholder bubble")
	dump_event("day-01", "周岚")
	await continue_to_next_day()
	check(str(app.events[app.current_index].id) == "day-03", "day one completes and moves to event two")

	# ---------- 事件 2 ----------
	say("")
	say("【事件 2 · 一句模糊的任务】")
	await wait_reveal("day-03")
	await click_button(find_node_named("FixedAction0"))
	await wait_sequence()
	check(app.game.completed.has("day-03"), "event two completes")
	check(int(app.game.scores.trust) == 3 and int(app.game.scores.growth) == 4, "event two adds +2 growth and +2 trust")
	dump_event("day-03", "林总")
	await continue_to_next_day()

	# ---------- 事件 3 ----------
	say("")
	say("【事件 3 · 临时跑腿请求】")
	check(app.game.contacts.has("阿麦"), "Amai becomes a contact before asking the favour")
	await wait_reveal("day-05")
	await click_button(find_node_named("FixedAction0"))
	await wait_sequence()
	check(app.game.completed.has("day-05"), "event three completes")
	check(int(app.game.scores.team) == 4, "event three adds +2 team")
	dump_event("day-05", "阿麦")
	await continue_to_next_day()

	# ---------- 事件 4（跑团式 AI）----------
	say("")
	say("【事件 4 · 第一次客户拜访（跑团式）】")
	await wait_reveal("day-07")
	check(app.active_tab == "程女士", "client window opens for the visit")
	app.npc_input.text = "我想先确认您最关心的是哪一类风险，是授权、舆情，还是执行本身？"
	find_button("发送").pressed.emit()
	await create_timer(0.4).timeout
	check(find_node_named("TypingLine") != null, "private chat shows the typing hint once")
	await create_timer(1.0).timeout
	await settle()
	check(int(app.game.rounds.get("day-07", 0)) == 1, "round one counted")
	await send_ai_message("我理解您下周一要跟老板汇报。您最怕在会上被问到哪一种情况？")
	await send_ai_message("目前资料里没有完整的舆情结论，我不能给您编一个数据。今天下班前我把能确认的部分发您，剩下两块明早十点前补齐。")
	check(int(app.game.rounds.get("day-07", 0)) == 3, "three rounds counted")
	check(find_node_named("RoundCounter") != null, "round counter is visible")
	await click_button(find_node_named("SubmitAiEvent"))
	check(app.game.completed.has("day-07"), "event four completes")
	check(str(app.game.event_results["day-07"].status) == "excellent", "event four judged excellent offline")
	check(int(app.game.scores.trust) == 6 and int(app.game.scores.team) == 6 and int(app.game.scores.growth) == 8, "event four adds +2/+2/+2")
	dump_event("day-07", "程女士")
	await continue_to_next_day()

	# ---------- 事件 5（跑团式 AI，群聊）----------
	say("")
	say("【事件 5 · 会议里的不同意见（跑团式）】")
	await wait_reveal("day-10")
	check(app.active_tab == "群聊", "meeting happens in the group")
	app.npc_input.text = "我同意 A 方案的主线。但我上周跟了 6 个新用户，有 5 个在前三步就退出了。"
	find_button("发送").pressed.emit()
	await create_timer(0.4).timeout
	check(find_node_named("TypingLine") == null, "group chat never shows a typing hint in a turn")
	await create_timer(0.6).timeout
	await settle()
	await send_ai_message("把首次使用者的引导页提前一屏，小范围先测 30 个人，两天就能看到验证数据。")
	await send_ai_message("我整理成三行发群里，明天上午给结论。")
	await click_button(find_node_named("SubmitAiEvent"))
	check(app.game.completed.has("day-10") and str(app.game.event_results["day-10"].status) == "excellent", "event five judged excellent")
	dump_event("day-10", "群聊")
	await continue_to_next_day()

	# ---------- 事件 6（PPT 小游戏）----------
	say("")
	say("【事件 6 · 混乱的提案 PPT】")
	await wait_reveal("ppt-assembly")
	check(find_node_named("PptMinigameCard") != null, "PPT minigame arrives as a chat bubble card")
	check(find_button("开始整理") != null and find_button("使用演示结果继续") != null, "card offers both the real jump and the offline fallback")
	app.complete_ppt_minigame({"eventId": "ppt-assembly", "status": "excellent", "details": {"versionCorrect": true, "structureComplete": true, "creditsComplete": true}})
	await settle()
	check(app.game.completed.has("ppt-assembly"), "event six completes")
	check(str(app.game.minigame_results["ppt-assembly"].status) == "excellent", "PPT result recorded")
	check(int(app.game.scores.trust) == 10 and int(app.game.scores.team) == 10 and int(app.game.scores.growth) == 12, "event six adds +2/+2/+2")
	dump_event("ppt-assembly", "周岚")
	await continue_to_next_day()

	# ---------- 事件 7 ----------
	say("")
	say("【事件 7 · 方案被全部打回（跑团式）】")
	await wait_reveal("feedback-rework")
	check(app.active_tab == "周岚", "feedback loop opens in the leader chat")
	var feedback_participants: Array = app.events[6].participants
	check(not feedback_participants.has("程女士"), "client is not whitelisted in the leader window")
	await send_ai_message("先别猜。我们把「整体」拆开：是用户洞察、方案本身，还是数据站不住？")
	await send_ai_message("我今晚把这三个问题发程女士，请她确认最想先改哪一个。")
	await send_ai_message("下一版修改清单我列出来：韩策补数据、小鹿改首屏、阿麦补案例，明早发你。")
	await click_button(find_node_named("SubmitAiEvent"))
	check(app.game.completed.has("feedback-rework") and str(app.game.event_results["feedback-rework"].status) == "excellent", "event seven judged excellent")
	dump_event("feedback-rework", "周岚")
	await continue_to_next_day()

	# ---------- 事件 8（固定三选一 + 限时小游戏）----------
	say("")
	say("【事件 8 · 急件冲刺】")
	await wait_reveal("day-13")
	check(find_node_named("FixedAction0") != null, "event eight now uses fixed options instead of free dialogue")
	await click_button(find_node_named("FixedAction0"))
	await wait_sequence()
	check(str(app.game.minigame_pending.get("day-13", "")) == "rush-confirm-all", "option records the minigame start condition")
	check(int(app.game.scores.trust) == 14 and int(app.game.scores.team) == 13 and int(app.game.scores.growth) == 16, "event eight option A adds +2/+1/+2")
	check(find_node_named("RushMinigameCard") != null, "rush minigame also arrives as a chat bubble card")
	await click_button(find_button("进会议室"))
	check(is_instance_valid(app.active_delivery), "local rush scene starts when no external URL is configured")
	check(app.active_delivery.time_left > 85.0 and app.active_delivery.time_left <= 90.0, "option A starts the scene with 90 seconds")
	check(app.active_delivery.extra_files == 0, "option A starts with no distractor file")
	var rush_action: Dictionary = app.pending_minigame_action(app.events[7])
	app._on_delivery_finished(true, rush_action)
	await settle()
	check(app.game.completed.has("day-13"), "event eight completes after the rush")
	check(str(app.game.minigame_results["day-13"].status) == "excellent", "rush success recorded as excellent")
	check(int(app.game.scores.trust) == 16 and int(app.game.scores.team) == 14 and int(app.game.scores.growth) == 18, "rush success adds +2/+1/+2")
	dump_event("day-13", "林总")
	await continue_to_next_day()

	# ---------- 事件 9 ----------
	say("")
	say("【事件 9 · 功劳与协作（跑团式）】")
	await wait_reveal("day-16")
	await send_ai_message("我刚看到。这版是我整理的，但数据是韩策跑的、视觉是小鹿改的、案例是你谈的。")
	await send_ai_message("我现在就在部门群里公开更正，把三条贡献写清楚；最后一页我会马上改成贡献页。")
	await send_ai_message("以后这类汇报我们提前一天共同确认署名，谁做了什么就写谁。")
	await click_button(find_node_named("SubmitAiEvent"))
	check(app.game.completed.has("day-16") and str(app.game.event_results["day-16"].status) == "excellent", "event nine judged excellent")
	dump_event("day-16", "阿麦")
	await continue_to_next_day()

	# ---------- 事件 10 ----------
	say("")
	say("【事件 10 · 结项答辩（跑团式）】")
	await wait_reveal("day-20")
	await send_ai_message("三个可举证的结果：排期表、被打回后重做的提案、准时送达的签约件。")
	await send_ai_message("提案的数据是韩策跑的、视觉是小鹿改的、案例是阿麦谈的，我只做了整理，也感谢团队。")
	await send_ai_message("我做错的是第一周没问清目标就动手；下一步我想自己带一个小模块，先学会先对齐再开工。")
	await click_button(find_node_named("SubmitAiEvent"))
	check(app.game.completed.has("day-20") and str(app.game.event_results["day-20"].status) == "excellent", "event ten judged excellent")
	dump_event("day-20", "林总")
	await continue_to_next_day()

	# ---------- 结局 ----------
	say("")
	say("【结局】")
	var scores: Dictionary = app.game.scores
	say("  老板信任 %d · 团队协作 %d · 职业成长 %d · 合计 %d" % [int(scores.trust), int(scores.team), int(scores.growth), int(scores.trust) + int(scores.team) + int(scores.growth)])
	var ending_text := ""
	for label in app.chat_list.find_children("*", "Label", true, false):
		ending_text += label.text + "\n"
	check(ending_text.contains("跳级升职"), "excellent route reaches the promotion ending")
	check(app.game.completed.size() == 10, "all ten events completed")
	await capture_state("full-01-ending")

	# ---------- 15 轮失败路径 ----------
	say("")
	say("【15 轮失败路径 · 事件 4 重开】")
	app.reset_game()
	await settle()
	app.current_index = 3
	app.active_tab = "程女士"
	app.game.revealed["day-07"] = app.events[3].messages.size()
	app.game.completed = []
	app.game.history = []
	app.game.scores = {"trust": 0, "team": 0, "growth": 0}
	app.render_current_view()
	await settle()
	for i in range(14):
		await send_ai_message("我再想想。")
	check(int(app.game.rounds.get("day-07", 0)) == 14, "fourteen rounds recorded")
	check(not app.game.completed.has("day-07"), "event is still open after fourteen rounds")
	await send_ai_message("还是没想好。")
	check(int(app.game.rounds.get("day-07", 0)) == 15, "fifteenth round recorded")
	check(app.game.completed.has("day-07"), "the fifteenth round settles the event as failed")
	check(str(app.game.event_results["day-07"].status) == "failed", "failure recorded with a failed status")
	var penalty: Dictionary = app.game.event_results["day-07"].get("penalty", {})
	check(int(penalty.get("trust", 0)) == -2 and int(penalty.get("growth", 0)) == -1, "failure deducts per dimension: trust -2, growth -1")
	check(int(app.game.scores.trust) == -2 and int(app.game.scores.team) == 0 and int(app.game.scores.growth) == -1, "per-dimension penalty applied to the score board")
	check(find_node_named("SubmitAiEvent") == null or find_button("收好今天的经验，继续实习生活……") != null, "failed event still lets the player continue")
	dump_event("day-07", "程女士")
	await capture_state("full-02-failed-event")

	# ---------- 调试评价码 ----------
	say("")
	say("【调试评价码 159 / 258 / 357】")
	app.reset_game()
	await settle()
	app.current_index = 3
	app.active_tab = "程女士"
	app.game.revealed["day-07"] = app.events[3].messages.size()
	app.game.completed = []
	app.game.history = []
	app.game.scores = {"trust": 0, "team": 0, "growth": 0}
	app.render_current_view()
	await settle()
	await send_ai_message("159")
	check(str(app.game.event_results["day-07"].status) == "excellent", "159 forces an excellent evaluation")
	check(int(app.game.scores.trust) == 2 and int(app.game.scores.team) == 2 and int(app.game.scores.growth) == 2, "159 awards +2/+2/+2")
	check(int(app.game.rounds.get("day-07", 0)) == 0, "the debug code does not consume a round")
	check(not app.game.history.any(func(h): return str(h.get("text", "")) == "159"), "the debug code never becomes a chat bubble")
	app.game.completed = []
	app.game.history = []
	app.game.event_results = {}
	app.game.scores = {"trust": 0, "team": 0, "growth": 0}
	app.render_current_view()
	await settle()
	await send_ai_message("258")
	check(str(app.game.event_results["day-07"].status) == "completed", "258 forces a completed evaluation")
	check(int(app.game.scores.trust) == 1 and int(app.game.scores.team) == 1 and int(app.game.scores.growth) == 1, "258 awards +1/+1/+1")
	app.game.completed = []
	app.game.history = []
	app.game.event_results = {}
	app.game.scores = {"trust": 0, "team": 0, "growth": 0}
	app.render_current_view()
	await settle()
	await send_ai_message("357")
	check(str(app.game.event_results["day-07"].status) == "incomplete", "357 forces an incomplete evaluation")
	check(not app.game.completed.has("day-07"), "357 keeps the event open and awards nothing")
	check(int(app.game.scores.trust) == 0 and int(app.game.scores.team) == 0 and int(app.game.scores.growth) == 0, "357 awards no score")

	# ---------- 维度映射单测 ----------
	say("")
	say("【维度扣分映射单测】")
	var mapping := {
		"day-07": {"trust": -2, "team": 0, "growth": -1},
		"day-10": {"trust": 0, "team": -1, "growth": -2},
		"feedback-rework": {"trust": -1, "team": -1, "growth": -1},
		"day-16": {"trust": 0, "team": -2, "growth": -1},
		"day-20": {"trust": -1, "team": -1, "growth": -1}
	}
	for event_id in mapping.keys():
		var event: Dictionary = app.EVENTS.get_event_by_id(event_id)
		var all_ids: Array = []
		for criterion_data in event.criteria:
			all_ids.append(str(criterion_data.id))
		var result: Dictionary = app.failure_penalty(event, all_ids)
		check(result == mapping[event_id], "failure mapping matches for " + event_id)

	# 收尾等待：让还在等待计时器的"正在输入/占位气泡"协程跑完，否则退出时会报 ObjectDB 泄漏并返回非零码。
	await create_timer(1.8).timeout
	await settle()
	print("")
	print("======== 走查结束 ========")
	print("FULL_PLAYTHROUGH_RESULT: " + ("PASS" if failures.is_empty() else str(failures)))
	quit(0 if failures.is_empty() else 1)


func capture_state(label: String) -> void:
	await settle()
	await RenderingServer.frame_post_draw
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://tests/screenshots"))
	var shot := root.get_texture().get_image()
	shot.save_png("res://tests/screenshots/" + label + ".png")
