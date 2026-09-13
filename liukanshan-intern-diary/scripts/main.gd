extends Control

const EVENTS := preload("res://scripts/event_data.gd")
const DELIVERY_SCENE := preload("res://scenes/DeliveryMinigame.tscn")
const CJK_FONT := preload("res://assets/fonts/NotoSansSC-VF.ttf")
const AVATAR := preload("res://scripts/avatar.gd")
const UI_ICONS := preload("res://scripts/ui_icons.gd")
const PIXEL_HOURGLASS := preload("res://scripts/pixel_hourglass.gd")
const SAVE_PATH := "user://liukanshan_intern_diary_save.json"
const SAVE_VERSION := 2

const BG := Color("#f7f7f7")
const RAIL := Color("#e7e7e7")
const CONVERSATION_BG := Color("#f2f2f2")
const INK := Color("#202020")
const MUTED := Color("#777777")
const WECHAT_GREEN := Color("#95ec69")
const BUBBLE := Color("#ffffff")
const ME_BUBBLE := Color("#95ec69")

var events: Array = []
var current_index := 0
var active_tab := "林总"
var active_mode := "messages"
var game: Dictionary = {}
var pending_npc_event := ""
var pending_npc_text := ""
var pending_npc_channel := ""
var pending_evaluation_event := ""
var pending_evaluation_channel := ""
var insight_cache: Dictionary = {}
var insight_loaded: Dictionary = {}
var knowledge_items: Array = []
var knowledge_loaded := false

var title_label: Label
var subtitle_label: Label
var day_label: Label
var chat_scroll: ScrollContainer
var chat_list: VBoxContainer
var decision_box: VBoxContainer
var conversation_list: VBoxContainer
var message_mode_button: Button
var contacts_mode_button: Button
var npc_input: LineEdit
var npc_send: Button
var npc_hint: Label
var npc_http: HTTPRequest
var insights_http: HTTPRequest
var knowledge_http: HTTPRequest
var evaluation_http: HTTPRequest
var active_delivery: Control
var event_loading: Control
var more_menu: PopupMenu
var message_reveal_running: Dictionary = {}
var hold_skip_active := false
var hold_skip_event := ""
var day_one_withdraw_running := false
var ppt_web_callback
var pending_typing_sender := ""
var boss_invite_running := false
var action_sequence_running := false
var reveal_epoch: Dictionary = {}

## 跑团式 AI 事件：每轮 AI 回 1–2 条气泡；15 轮内未完成即判定失败（见 规则书.md §2、§8）。
const AI_ROUND_LIMIT := 15
## 占位模式：模型不可用时，NPC 台词以空白气泡占位，等接入模型后自动显示真实内容。
const AI_PLACEHOLDER_BUBBLES := true
## 测试用评价码：在跑团式事件的输入框里输入 159 / 258 / 357 可强制判定，不必把对话打满。
const DEBUG_EVAL_CODES := {"159": "excellent", "258": "completed", "357": "incomplete"}
const DEBUG_STATUS_LABELS := {"excellent": "优秀", "completed": "良好", "incomplete": "未完成"}


func _ready() -> void:
	var cjk_theme := Theme.new()
	var readable_font := FontVariation.new()
	readable_font.base_font = CJK_FONT
	readable_font.variation_embolden = 0.75
	cjk_theme.default_font = readable_font
	cjk_theme.default_font_size = 17
	theme = cjk_theme
	events = EVENTS.get_events()
	load_game()
	build_interface()
	register_ppt_minigame_bridge()
	render_current_view()


func build_interface() -> void:
	var backdrop := ColorRect.new()
	backdrop.color = BG
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(backdrop)

	var root := HBoxContainer.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.add_theme_constant_override("separation", 0)
	add_child(root)

	var rail := PanelContainer.new()
	rail.custom_minimum_size.x = 76
	rail.add_theme_stylebox_override("panel", flat_style(RAIL, INK))
	root.add_child(rail)
	var rail_content := VBoxContainer.new()
	rail_content.alignment = BoxContainer.ALIGNMENT_CENTER
	rail_content.add_theme_constant_override("separation", 14)
	rail.add_child(rail_content)
	rail_content.add_child(make_avatar("刘看山", 48))
	message_mode_button = rail_button("●", "聊天")
	message_mode_button.pressed.connect(set_active_mode.bind("messages"))
	rail_content.add_child(message_mode_button)
	var rail_divider := MarginContainer.new()
	rail_divider.add_theme_constant_override("margin_left", 18)
	rail_divider.add_theme_constant_override("margin_right", 18)
	var horizontal_line := ColorRect.new()
	horizontal_line.color = Color("#cccccc")
	horizontal_line.custom_minimum_size.y = 1
	horizontal_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	rail_divider.add_child(horizontal_line)
	rail_content.add_child(rail_divider)
	contacts_mode_button = rail_button("♙", "联系人")
	contacts_mode_button.pressed.connect(set_active_mode.bind("contacts"))
	rail_content.add_child(contacts_mode_button)
	var rail_spacer := Control.new()
	rail_spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	rail_content.add_child(rail_spacer)
	var phone := rail_button("▯", "建议使用电脑浏览器体验")
	phone.pressed.connect(show_phone_hint)
	rail_content.add_child(phone)
	var menu := rail_button("☰", "任务、档案与重新开始")
	menu.pressed.connect(show_more_menu)
	rail_content.add_child(menu)

	var vertical_line := ColorRect.new()
	vertical_line.color = Color("#d3d3d3")
	vertical_line.custom_minimum_size.x = 1
	vertical_line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.add_child(vertical_line)
	var conversations := PanelContainer.new()
	conversations.custom_minimum_size.x = 305
	conversations.add_theme_stylebox_override("panel", flat_style(CONVERSATION_BG, INK))
	root.add_child(conversations)
	var conversation_box := VBoxContainer.new()
	conversation_box.add_theme_constant_override("separation", 8)
	conversations.add_child(conversation_box)
	var search_row := HBoxContainer.new()
	conversation_box.add_child(search_row)
	var search := LineEdit.new()
	search.placeholder_text = "搜索"
	search.editable = false
	search.custom_minimum_size = Vector2(0, 42)
	search.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	search.add_theme_color_override("font_color", INK)
	search.add_theme_color_override("font_placeholder_color", Color("#777777"))
	search.add_theme_stylebox_override("normal", panel_style(Color("#ffffff"), 7, Color("#dedede"), 1))
	search_row.add_child(search)
	var plus := Button.new()
	plus.text = "+"
	plus.tooltip_text = "通过剧情添加联系人或群聊"
	plus.custom_minimum_size = Vector2(45, 42)
	plus.add_theme_font_size_override("font_size", 24)
	plus.add_theme_color_override("font_color", INK)
	plus.add_theme_stylebox_override("normal", flat_style(CONVERSATION_BG, INK))
	search_row.add_child(plus)
	conversation_list = VBoxContainer.new()
	conversation_list.size_flags_vertical = Control.SIZE_EXPAND_FILL
	conversation_list.add_theme_constant_override("separation", 1)
	conversation_box.add_child(conversation_list)

	var content := PanelContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.add_theme_stylebox_override("panel", flat_style(BG, INK))
	root.add_child(content)
	var content_stack := VBoxContainer.new()
	content_stack.add_theme_constant_override("separation", 8)
	content.add_child(content_stack)

	var content_header := HBoxContainer.new()
	content_header.custom_minimum_size.y = 56
	content_stack.add_child(content_header)
	var head_text := VBoxContainer.new()
	head_text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content_header.add_child(head_text)
	title_label = Label.new()
	title_label.add_theme_font_size_override("font_size", 20)
	title_label.add_theme_color_override("font_color", INK)
	head_text.add_child(title_label)
	subtitle_label = Label.new()
	subtitle_label.add_theme_font_size_override("font_size", 14)
	subtitle_label.add_theme_color_override("font_color", MUTED)
	head_text.add_child(subtitle_label)
	day_label = Label.new()
	day_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	day_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	day_label.add_theme_font_size_override("font_size", 14)
	day_label.add_theme_color_override("font_color", MUTED)
	day_label.custom_minimum_size.x = 120
	content_header.add_child(day_label)
	var header_icons := HBoxContainer.new()
	header_icons.alignment = BoxContainer.ALIGNMENT_END
	header_icons.add_theme_constant_override("separation", 18)
	header_icons.custom_minimum_size.x = 130
	for kind in ["video", "call", "more"]:
		var icon := TextureRect.new()
		icon.texture = UI_ICONS.get_icon(kind)
		icon.custom_minimum_size = Vector2(22, 22)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		header_icons.add_child(icon)
	content_header.add_child(header_icons)

	var separator := HSeparator.new()
	content_stack.add_child(separator)
	chat_scroll = ScrollContainer.new()
	chat_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	chat_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	content_stack.add_child(chat_scroll)
	chat_list = VBoxContainer.new()
	chat_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_list.add_theme_constant_override("separation", 10)
	chat_scroll.add_child(chat_list)

	decision_box = VBoxContainer.new()
	decision_box.add_theme_constant_override("separation", 6)
	content_stack.add_child(decision_box)

	npc_http = HTTPRequest.new()
	npc_http.timeout = 12.0
	npc_http.request_completed.connect(_on_npc_request_completed)
	add_child(npc_http)
	insights_http = HTTPRequest.new()
	insights_http.timeout = 8.0
	insights_http.request_completed.connect(_on_insights_request_completed)
	add_child(insights_http)
	knowledge_http = HTTPRequest.new()
	knowledge_http.timeout = 8.0
	knowledge_http.request_completed.connect(_on_knowledge_request_completed)
	add_child(knowledge_http)
	evaluation_http = HTTPRequest.new()
	evaluation_http.timeout = 12.0
	evaluation_http.request_completed.connect(_on_evaluation_request_completed)
	add_child(evaluation_http)


func start_event_loading() -> void:
	if current_index >= events.size():
		show_ending()
		return
	if is_instance_valid(event_loading):
		return
	unlock_contacts_for_event(events[current_index])
	refresh_navigation()
	var event: Dictionary = events[current_index]
	event_loading = ColorRect.new()
	event_loading.color = Color(0.1, 0.1, 0.1, 0.36)
	event_loading.mouse_filter = Control.MOUSE_FILTER_STOP
	event_loading.z_index = 30
	event_loading.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(event_loading)
	var card := PanelContainer.new()
	card.custom_minimum_size = Vector2(420, 250)
	card.set_anchors_and_offsets_preset(Control.PRESET_CENTER, Control.PRESET_MODE_MINSIZE, 210)
	card.add_theme_stylebox_override("panel", panel_style(Color("#ffffff"), 8, Color("#d6d6d6"), 1))
	event_loading.add_child(card)
	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 12)
	card.add_child(box)
	var hourglass_center := CenterContainer.new()
	box.add_child(hourglass_center)
	var hourglass := PIXEL_HOURGLASS.new()
	hourglass.pivot_offset = Vector2(36, 36)
	hourglass_center.add_child(hourglass)
	var loading_title := Label.new()
	loading_title.text = "时间悄悄向前走……"
	loading_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loading_title.add_theme_font_size_override("font_size", 20)
	loading_title.add_theme_color_override("font_color", INK)
	box.add_child(loading_title)
	var loading_subtitle := Label.new()
	loading_subtitle.text = transition_tip(current_index)
	loading_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loading_subtitle.add_theme_font_size_override("font_size", 15)
	loading_subtitle.add_theme_color_override("font_color", MUTED)
	box.add_child(loading_subtitle)
	await get_tree().create_timer(0.9).timeout
	loading_title.text = str(event.get("phase_label", "实习第 %d 天" % int(event.day)))
	loading_subtitle.text = str(event.title)
	card.add_theme_stylebox_override("panel", panel_style(Color("#f4fbf7"), 8, Color("#9fcdb1"), 1))
	await get_tree().create_timer(0.75).timeout
	if is_instance_valid(event_loading):
		event_loading.queue_free()
	event_loading = null
	render_current_view()


func transition_tip(next_index: int) -> String:
	var tips := [
		"职场节奏并不只在大事里改变。",
		"先对齐目标，再开始行动。",
		"边界说清楚，协作才会轻松。",
		"不知道答案时，记录与确认也是专业。",
		"不同意见若有证据，就值得被听见。",
		"文件可信，协作才真正完成。",
		"先拆解反馈，再投入下一轮努力。",
		"越是紧急，越要确认目标和交接人。",
		"让每一份贡献都被准确看见。",
		"复盘不是总结辛苦，而是看见下一步。"
	]
	return tips[clampi(next_index, 0, tips.size() - 1)]


func render_current_view() -> void:
	if current_index >= events.size():
		show_ending()
		return
	refresh_navigation()
	clear_children(chat_list)
	clear_children(decision_box)
	var event: Dictionary = events[current_index]
	day_label.text = str(event.get("phase_label", "实习第 %d 天" % int(event.day)))
	if active_tab == "任务":
		render_task_view(event)
		return
	if active_tab == "档案":
		render_profile_view(event)
		return
	if active_tab == "联系人通知":
		render_contact_notices_view()
		return
	if not bool(game.get("joined_main_group", false)) and active_tab == "林总":
		render_boss_invitation()
		return
	if str(event.id) == "day-01" and active_tab == "周岚":
		render_day_one_leader_chat(event)
		call_deferred("deferred_scroll_chat_to_bottom")
		return

	var is_event_channel: bool = active_tab == str(event.channel)
	title_label.text = tab_title(active_tab)
	subtitle_label.text = "看山创意部 · %s" % ("当前任务进行中" if is_event_channel else "聊天记录")
	if active_tab == "林总":
		add_boss_invitation_messages()
	if is_event_channel:
		add_system_line("%s" % event.title)
		if str(event.id) != "day-01":
			add_task_card(event)
		render_revealed_messages(event, active_tab)
		var revealed := int(game.revealed.get(event.id, 0))
		if revealed < event.messages.size():
			begin_message_reveal(event)
		elif completed_event_ids().has(event.id):
			add_history_for_channel(event, active_tab)
			add_advisor_card(event)
			add_dialogue_controls(event, false, true)
			add_next_event_button(event)
		else:
			add_history_for_channel(event, active_tab)
			if action_sequence_running:
				# 反应还在逐条播放：先不收选项，避免玩家在对话中途再点一次。
				add_system_line("……")
				call_deferred("deferred_scroll_chat_to_bottom")
				return
			if str(event.id) == "day-01":
				render_day_one_group_controls(event)
			elif str(event.get("mode", "fixed")) == "ai":
				add_ai_event_controls(event)
				request_insights(event.id)
			elif str(event.get("mode", "fixed")) == "ppt_minigame":
				add_ppt_minigame_card(event)
				request_insights(event.id)
			elif bool(event.get("delivery_minigame", false)) and game.get("minigame_pending", {}).has(str(event.id)):
				add_rush_minigame_card(event)
			else:
				add_fixed_actions(event)
				request_insights(event.id)
	else:
		add_system_line("这里是 %s 的消息窗口" % active_tab)
		if active_tab != "林总":
			add_empty_state("当前任务正在“%s”进行。这里会保留你和 %s 的消息。" % [event.channel, active_tab])
		add_revealed_event_messages(event, active_tab)
		add_history_for_channel(event, active_tab)
	call_deferred("deferred_scroll_chat_to_bottom")


func render_boss_invitation() -> void:
	title_label.text = "林总"
	subtitle_label.text = "看山创意部 · 你的第一位联系人"
	add_boss_invitation_messages()


func run_boss_invite_stage() -> void:
	# 给第一句欢迎语留出明确的阅读节奏，再显示入群邀请卡。
	await get_tree().create_timer(0.8).timeout
	boss_invite_running = false
	if bool(game.get("joined_main_group", false)):
		return
	game.boss_invite_stage = 1
	save_game()
	if active_tab == "林总":
		render_current_view()


func add_boss_invitation_messages() -> void:
	add_system_line("入职第一天")
	add_message("林总", "欢迎你，刘看山。", false)
	if int(game.get("boss_invite_stage", 0)) < 1:
		# 消息必须逐条出现：先出第一句，再出入群邀请卡。
		if not boss_invite_running:
			boss_invite_running = true
			run_boss_invite_stage()
		return
	add_message("林总", "我先拉你进项目群，项目组的同事都在里面。", false)
	# 第二句消息和邀请卡必须分开出现，避免像同一条消息一起刷出。
	if int(game.get("boss_invite_stage", 0)) < 2:
		if not boss_invite_running:
			boss_invite_running = true
			run_boss_invite_card_stage()
		return
	var stack := make_message_row("林总", false)
	var card := PanelContainer.new()
	card.name = "GroupInvitation"
	card.custom_minimum_size.x = 300
	card.add_theme_stylebox_override("panel", panel_style(BUBBLE, 6, Color("#d8d8d8"), 1))
	stack.add_child(card)
	var contents := VBoxContainer.new()
	contents.add_theme_constant_override("separation", 12)
	card.add_child(contents)
	var heading := Label.new()
	heading.text = "邀请你加入群聊"
	heading.add_theme_font_size_override("font_size", 17)
	heading.add_theme_color_override("font_color", INK)
	contents.add_child(heading)
	var group_row := HBoxContainer.new()
	group_row.add_theme_constant_override("separation", 12)
	group_row.add_child(make_avatar("群聊"))
	var group_name := Label.new()
	group_name.text = "看山创意部（6）"
	group_name.add_theme_font_size_override("font_size", 16)
	group_name.add_theme_color_override("font_color", INK)
	group_row.add_child(group_name)
	contents.add_child(group_row)
	contents.add_child(HSeparator.new())
	var invite := Button.new()
	invite.name = "JoinGroup"
	invite.text = "已加入 · 打开群聊" if bool(game.get("joined_main_group", false)) else "加入群聊"
	style_readable_button(invite)
	invite.pressed.connect(accept_group_invitation)
	contents.add_child(invite)


func run_boss_invite_card_stage() -> void:
	# 第二条欢迎消息出现后再停顿一秒，随后才显示邀请卡。
	await get_tree().create_timer(0.7).timeout
	boss_invite_running = false
	if bool(game.get("joined_main_group", false)):
		return
	game.boss_invite_stage = 2
	save_game()
	if active_tab == "林总":
		render_current_view()


func accept_group_invitation() -> void:
	if bool(game.get("joined_main_group", false)):
		set_active_tab("群聊")
		return
	game.joined_main_group = true
	if not game.groups.has("群聊"):
		game.groups.append("群聊")
	add_contact_notice("joined-main-group", "林总邀请你加入「看山创意部」", "group")
	mark_unread("群聊")
	active_tab = "群聊"
	save_game()
	render_current_view()


func begin_message_reveal(event: Dictionary) -> void:
	var event_id := str(event.id)
	if bool(message_reveal_running.get(event_id, false)):
		return
	message_reveal_running[event_id] = true
	play_reveal_sequence(event_id)


func play_reveal_sequence(event_id: String) -> void:
	var epoch := int(reveal_epoch.get(event_id, 0))
	var typing_shown := false
	while true:
		var event := EVENTS.get_event_by_id(event_id)
		if event.is_empty():
			break
		var revealed := int(game.revealed.get(event_id, 0))
		if revealed >= event.messages.size():
			break
		var item: Array = event.messages[revealed]
		var channel := str(event.channel)
		var delay := maxf(0.25, message_delay(item))
		if message_kind(item) == "typing":
			if active_tab == channel and channel != "群聊":
				pending_typing_sender = str(item[0])
				render_current_view()
			await get_tree().create_timer(delay).timeout
			if epoch != int(reveal_epoch.get(event_id, 0)):
				pending_typing_sender = ""
				return
			pending_typing_sender = ""
			game.revealed[event_id] = mini(revealed + 1, event.messages.size())
			save_game()
			if active_tab == channel:
				render_current_view()
			continue
		var sender := str(item[0])
		var typing_time := 0.0
		# 正在输入只在联系人窗口出现，且每轮对话只显示一次。
		if not typing_shown and channel != "群聊" and not sender.is_empty() and sender != "刘看山" and sender != "系统" and message_kind(item) == "text" and delay >= 1.2:
			typing_time = clampf(delay - 0.6, 0.0, 1.2)
			typing_shown = true
		if typing_time > 0.2:
			if active_tab == channel:
				pending_typing_sender = sender
				render_current_view()
			await get_tree().create_timer(typing_time).timeout
			if epoch != int(reveal_epoch.get(event_id, 0)):
				pending_typing_sender = ""
				return
			pending_typing_sender = ""
		await get_tree().create_timer(maxf(0.05, delay - typing_time)).timeout
		if epoch != int(reveal_epoch.get(event_id, 0)):
			pending_typing_sender = ""
			return
		if current_index >= events.size() or str(events[current_index].id) != event_id:
			pending_typing_sender = ""
			break
		game.revealed[event_id] = mini(revealed + 1, event.messages.size())
		save_game()
		if active_tab == channel:
			render_current_view()
	message_reveal_running[event_id] = false
	pending_typing_sender = ""
	if current_index < events.size() and str(events[current_index].id) == event_id and active_tab == str(EVENTS.get_event_by_id(event_id).channel):
		render_current_view()


func skip_current_messages() -> void:
	if current_index >= events.size():
		return
	var event: Dictionary = events[current_index]
	if active_tab != str(event.channel):
		return
	if int(game.revealed.get(event.id, 0)) >= event.messages.size():
		return
	game.revealed[event.id] = event.messages.size()
	message_reveal_running[event.id] = false
	# 让正在等待的播放协程作废，否则它醒来后会把 revealed 覆盖回旧值。
	reveal_epoch[event.id] = int(reveal_epoch.get(event.id, 0)) + 1
	pending_typing_sender = ""
	save_game()
	render_current_view()


func _input(input: InputEvent) -> void:
	if current_index >= events.size():
		return
	var event: Dictionary = events[current_index]
	if active_tab != str(event.channel) or int(game.revealed.get(event.id, 0)) >= event.messages.size():
		return
	if input is InputEventMouseButton and input.button_index == MOUSE_BUTTON_LEFT:
		if input.pressed:
			hold_skip_active = true
			hold_skip_event = str(event.id)
			await get_tree().create_timer(0.8).timeout
			if hold_skip_active and hold_skip_event == str(event.id):
				skip_current_messages()
		else:
			hold_skip_active = false


func add_history_for_channel(event: Dictionary, channel: String) -> void:
	var last_stamp := ""
	for historic in game.history:
		if str(historic.get("event_id", "")) != str(event.id):
			continue
		if str(historic.get("channel", event.channel)) != channel:
			continue
		var stamp := str(historic.get("stamp", ""))
		if not stamp.is_empty() and stamp != last_stamp:
			add_time_divider(stamp)
			last_stamp = stamp
		var sender := str(historic.get("sender", ""))
		var text := str(historic.get("text", ""))
		var kind := str(historic.get("kind", "text"))
		if sender == "系统":
			add_system_line(text)
		elif kind == "sticker":
			add_sticker_message(sender, text)
		elif kind == "file":
			add_file_message(sender, text)
		else:
			add_message(sender, text, sender == "刘看山")


func event_message_channel(item: Array, event: Dictionary) -> String:
	if item.size() >= 3 and not str(item[2]).is_empty():
		return str(item[2])
	return str(event.channel)


func message_kind(item: Array) -> String:
	if item.size() >= 4 and not str(item[3]).is_empty():
		return str(item[3])
	return "text"


func message_delay(item: Array) -> float:
	return float(item[4]) if item.size() >= 5 else 1.0


func message_stamp(item: Array) -> String:
	return str(item[5]) if item.size() >= 6 else ""


func render_revealed_messages(event: Dictionary, channel: String) -> void:
	var revealed := mini(int(game.revealed.get(event.id, 0)), event.messages.size())
	var last_stamp := ""
	for index in range(revealed):
		var item: Array = event.messages[index]
		if event_message_channel(item, event) != channel:
			continue
		var kind := message_kind(item)
		if kind == "typing":
			continue
		var stamp := message_stamp(item)
		if not stamp.is_empty() and stamp != last_stamp:
			add_time_divider(stamp)
			last_stamp = stamp
		render_message_item(item)
	if not pending_typing_sender.is_empty() and str(event.channel) == channel:
		add_typing_line(pending_typing_sender)


func render_message_item(item: Array) -> void:
	var sender := str(item[0])
	var text := str(item[1])
	match message_kind(item):
		"system":
			add_system_line(text)
		"file":
			add_file_message(sender, text)
		"sticker":
			add_sticker_message(sender, text)
		_:
			if sender == "系统":
				add_system_line(text)
			else:
				add_message(sender, text, sender == "刘看山")


func add_time_divider(stamp: String) -> void:
	var line := Label.new()
	line.text = stamp
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	line.add_theme_font_size_override("font_size", 12)
	line.add_theme_color_override("font_color", MUTED)
	chat_list.add_child(line)


func add_typing_line(sender: String) -> void:
	var line := Label.new()
	line.name = "TypingLine"
	line.text = "%s 正在输入…" % sender
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	line.add_theme_font_size_override("font_size", 12)
	line.add_theme_color_override("font_color", MUTED)
	chat_list.add_child(line)


func add_file_message(sender: String, file_name: String) -> void:
	var bubble_stack := make_message_row(sender, false)
	var card := PanelContainer.new()
	card.custom_minimum_size.x = 260
	card.add_theme_stylebox_override("panel", panel_style(BUBBLE, 6, Color("#d8d8d8"), 1))
	bubble_stack.add_child(card)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	card.add_child(box)
	var title := Label.new()
	title.text = "［文件］%s" % file_name
	title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", INK)
	box.add_child(title)
	var meta := Label.new()
	meta.text = "微信文件 · 原型不提供下载"
	meta.add_theme_font_size_override("font_size", 12)
	meta.add_theme_color_override("font_color", MUTED)
	box.add_child(meta)


func add_sticker_message(sender: String, label: String) -> void:
	var bubble_stack := make_message_row(sender, false)
	var bubble := PanelContainer.new()
	bubble.custom_minimum_size = Vector2(132, 132)
	bubble.add_theme_stylebox_override("panel", panel_style(BUBBLE, 8, Color("#d8d8d8"), 1))
	bubble_stack.add_child(bubble)
	var sticker_path := "res://assets/stickers/day01_stickers.png"
	if ResourceLoader.exists(sticker_path):
		var atlas := AtlasTexture.new()
		atlas.atlas = load(sticker_path)
		var frame := 0
		match label:
			"cat_peek": frame = 0
			"thumbs_up": frame = 1
			"welcome_wave": frame = 2
		atlas.region = Rect2(frame * 512, 0, 512, 1024)
		var image := TextureRect.new()
		image.texture = atlas
		image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		image.custom_minimum_size = Vector2(112, 112)
		image.tooltip_text = "原创聊天表情"
		bubble.add_child(image)
	else:
		var body := Label.new()
		body.text = "［表情］%s" % label
		body.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		body.add_theme_font_size_override("font_size", 15)
		body.add_theme_color_override("font_color", MUTED)
		bubble.add_child(body)


func add_revealed_event_messages(event: Dictionary, channel: String) -> void:
	render_revealed_messages(event, channel)


func render_day_one_group_controls(event: Dictionary) -> void:
	if not bool(game.get("day01_intro_selected", false)):
		add_fixed_actions(event)
		return
	if not bool(game.get("day01_redirected", false)):
		add_group_question_box(event)
		return
	add_system_line("周岚已添加你为好友")
	var to_leader := Button.new()
	to_leader.text = "去私聊周岚  →"
	style_readable_button(to_leader)
	to_leader.add_theme_stylebox_override("normal", button_style(WECHAT_GREEN, INK))
	to_leader.pressed.connect(set_active_tab.bind("周岚"))
	decision_box.add_child(to_leader)


func add_fixed_actions(event: Dictionary) -> void:
	var heading := Label.new()
	heading.text = "选择你要在群里发的话" if str(event.channel) == "群聊" else "现在，刘看山会怎么做？"
	heading.add_theme_font_size_override("font_size", 16)
	heading.add_theme_color_override("font_color", INK)
	decision_box.add_child(heading)
	var actions: Array = event.get("actions", [])
	for index in range(actions.size()):
		var action: Dictionary = actions[index]
		var behaviour := Label.new()
		var option_letter := char(65 + index)
		behaviour.text = "%s  %s" % [option_letter, str(action.get("label", ""))]
		behaviour.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		behaviour.add_theme_font_size_override("font_size", 13)
		behaviour.add_theme_color_override("font_color", MUTED)
		decision_box.add_child(behaviour)
		var button := Button.new()
		button.name = "FixedAction%d" % index
		var bubbles: Array = action.get("bubbles", [])
		if bubbles.is_empty():
			button.text = "  （什么都不发，先看着）"
		else:
			button.text = "  %s" % str(bubbles[0])
		button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		button.custom_minimum_size.y = 44
		button.add_theme_font_size_override("font_size", 16)
		button.add_theme_color_override("font_color", INK)
		button.add_theme_color_override("font_hover_color", INK)
		button.add_theme_stylebox_override("normal", button_style(Color("#ffffff"), INK, Color("#d5d5d5")))
		button.add_theme_stylebox_override("hover", button_style(Color("#f2fff1"), INK, Color("#75bd72")))
		button.pressed.connect(choose_action.bind(event, action))
		decision_box.add_child(button)


func add_group_question_box(event: Dictionary) -> void:
	var notice := Label.new()
	notice.text = "有问题就在群里问。"
	notice.add_theme_font_size_override("font_size", 14)
	notice.add_theme_color_override("font_color", MUTED)
	decision_box.add_child(notice)
	var row := HBoxContainer.new()
	decision_box.add_child(row)
	var group_input := LineEdit.new()
	group_input.placeholder_text = "在群里说点什么…"
	group_input.max_length = 180
	group_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	group_input.add_theme_color_override("font_color", INK)
	group_input.add_theme_color_override("font_placeholder_color", Color("#888888"))
	group_input.add_theme_stylebox_override("normal", panel_style(Color("#ffffff"), 5, Color("#aaaaaa"), 1))
	group_input.text_submitted.connect(send_day_one_group_message.bind(event, group_input))
	row.add_child(group_input)
	var send := Button.new()
	send.text = "发送"
	send.add_theme_font_size_override("font_size", 15)
	send.add_theme_color_override("font_color", INK)
	send.add_theme_stylebox_override("normal", button_style(WECHAT_GREEN, INK))
	send.pressed.connect(send_day_one_group_message_from_button.bind(event, group_input))
	row.add_child(send)


func send_day_one_group_message(_submitted: String, event: Dictionary, input: LineEdit) -> void:
	if input.text.strip_edges().is_empty() or bool(game.get("day01_redirected", false)) or day_one_withdraw_running:
		return
	day_one_withdraw_running = true
	var sent_text := input.text.strip_edges()
	input.clear()
	append_history(event.id, "刘看山", sent_text, "群聊")
	save_game()
	render_current_view()
	await get_tree().process_frame
	await get_tree().process_frame
	scroll_chat_to_bottom()
	await get_tree().create_timer(1.1).timeout
	remove_last_history_message(event.id, "刘看山", sent_text, "群聊")
	append_history(event.id, "系统", "周岚撤回了一条消息", "群聊")
	save_game()
	render_current_view()
	# 周岚的引导按真实微信消息节奏逐条发送，而不是一次性刷出四条。
	var leader_messages := [
		"群里那条我撤了，项目群不能闲聊，只发进展和待办。",
		"有问题随时私聊我就行，看到后我会第一时间回复的。",
		"对了，给你一个建议：入职第一天，别急着表现，也别什么都不问。",
		"我翻到两篇讲这个的，你可以看看。"
	]
	for index in range(leader_messages.size()):
		await get_tree().create_timer(0.75 if index == 0 else 0.95).timeout
		append_history(event.id, "周岚", str(leader_messages[index]), "周岚")
		save_game()
		render_current_view()
	game.day01_redirected = true
	unlock_contact("周岚", "周岚添加了你为好友", "friend-zhou-lan")
	mark_unread("周岚")
	day_one_withdraw_running = false
	save_game()
	render_current_view()


func send_day_one_group_message_from_button(event: Dictionary, input: LineEdit) -> void:
	send_day_one_group_message("", event, input)


func render_day_one_leader_chat(event: Dictionary) -> void:
	title_label.text = "周岚"
	subtitle_label.text = "组长 · 已是好友"
	add_system_line("你已添加了周岚，现在可以开始聊天了")
	add_history_for_channel(event, "周岚")
	if not bool(game.get("day01_redirected", false)):
		add_empty_state("先完成林总的入群邀请，再和周岚私聊。")
		return
	request_insights(str(event.id))
	add_advisor_card(event)
	add_dialogue_controls(event, false, true)
	var finish := Button.new()
	finish.text = "继续实习生活……"
	style_readable_button(finish)
	finish.pressed.connect(finish_event.bind(event.id))
	decision_box.add_child(finish)


func render_task_view(event: Dictionary) -> void:
	title_label.text = "任务提醒"
	subtitle_label.text = "把模糊的一天拆成可执行的下一步"
	add_system_line("实习进度 · %d / 8 个关键节点" % [current_index + 1])
	add_task_card(event)
	var brief := Label.new()
	brief.text = "\n%s\n\n在对应聊天窗口完成决定。你的选择会被写入本地实习档案，并在第二十天形成结局。" % event.brief
	brief.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	brief.add_theme_font_size_override("font_size", 15)
	brief.add_theme_color_override("font_color", INK)
	chat_list.add_child(brief)
	var go_button := Button.new()
	go_button.text = "前往 %s 处理任务  →" % event.channel
	go_button.add_theme_stylebox_override("normal", button_style(WECHAT_GREEN, Color("#ffffff")))
	go_button.pressed.connect(set_active_tab.bind(str(event.channel)))
	decision_box.add_child(go_button)


func render_profile_view(event: Dictionary) -> void:
	title_label.text = "我的实习档案"
	subtitle_label.text = "记录已完成的节点；评价将在结项答辩后公开"
	add_system_line("刘看山 · 看山创意部实习生")
	var archive := PanelContainer.new()
	archive.add_theme_stylebox_override("panel", panel_style(Color("#f7fbff"), 12, Color("#dce8f4"), 1))
	chat_list.add_child(archive)
	var text := VBoxContainer.new()
	archive.add_child(text)
	var name_label := Label.new()
	name_label.text = "刘看山"
	name_label.add_theme_font_size_override("font_size", 20)
	name_label.add_theme_color_override("font_color", INK)
	text.add_child(name_label)
	var states := ["老板信任", "团队协作", "职业成长"]
	for state in states:
		var row := Label.new()
		row.text = "%s  ·  结项后解锁" % state
		row.add_theme_font_size_override("font_size", 14)
		row.add_theme_color_override("font_color", MUTED)
		text.add_child(row)
	var timeline_heading := Label.new()
	timeline_heading.text = "\n已完成节点"
	timeline_heading.add_theme_font_size_override("font_size", 16)
	timeline_heading.add_theme_color_override("font_color", INK)
	chat_list.add_child(timeline_heading)
	var done: Array = completed_event_ids()
	if done.is_empty():
		add_empty_state("还没有完成事件。第一条消息正在群聊等你。")
	else:
		for event_data in events:
			if done.has(event_data.id):
				var row := Label.new()
				var title_parts := str(event_data.title).split("·")
				var short_title := str(title_parts[title_parts.size() - 1]).strip_edges()
				row.text = "✓  第 %02d 天 · %s" % [int(event_data.day), short_title]
				row.add_theme_font_size_override("font_size", 14)
				row.add_theme_color_override("font_color", Color("#348f65"))
				chat_list.add_child(row)
	add_knowledge_corner()
	var continue_button := Button.new()
	continue_button.text = "继续今天的任务  →"
	continue_button.add_theme_stylebox_override("normal", button_style(WECHAT_GREEN, Color("#ffffff")))
	continue_button.pressed.connect(set_active_tab.bind(str(event.channel)))
	decision_box.add_child(continue_button)


func add_knowledge_corner() -> void:
	var heading := Label.new()
	heading.text = "\n下班充电 · 知乎知识"
	heading.add_theme_font_size_override("font_size", 16)
	heading.add_theme_color_override("font_color", INK)
	chat_list.add_child(heading)
	if not knowledge_loaded:
		request_knowledge()
		var loading := Label.new()
		loading.text = "正在读取赛事专用「知乎知识」内容…"
		loading.add_theme_font_size_override("font_size", 12)
		loading.add_theme_color_override("font_color", MUTED)
		chat_list.add_child(loading)
		return
	if knowledge_items.is_empty():
		var unavailable := Label.new()
		unavailable.text = "当前没有可展示的官方知识内容。离线试玩不会以虚构内容替代。"
		unavailable.add_theme_font_size_override("font_size", 12)
		unavailable.add_theme_color_override("font_color", MUTED)
		chat_list.add_child(unavailable)
		return
	for item in knowledge_items.slice(0, 3):
		var card := PanelContainer.new()
		card.add_theme_stylebox_override("panel", panel_style(Color("#fffaf1"), 9, Color("#f1e2be"), 1))
		chat_list.add_child(card)
		var card_text := Label.new()
		card_text.text = "%s\n%s" % [str(item.title), str(item.description)]
		card_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		card_text.add_theme_font_size_override("font_size", 12)
		card_text.add_theme_color_override("font_color", INK)
		card.add_child(card_text)


func request_knowledge() -> void:
	if knowledge_loaded:
		return
	var api_origin := get_api_origin()
	if api_origin.is_empty():
		knowledge_loaded = true
		return
	knowledge_loaded = true
	var error := knowledge_http.request(api_origin + "/api/zhihu/knowledge")
	if error != OK:
		knowledge_items = []


func _on_knowledge_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	knowledge_items = []
	if result == HTTPRequest.RESULT_SUCCESS and response_code == 200:
		var parsed = JSON.parse_string(body.get_string_from_utf8())
		if typeof(parsed) == TYPE_DICTIONARY and typeof(parsed.get("items", [])) == TYPE_ARRAY:
			knowledge_items = parsed.get("items", [])
	if active_tab == "档案":
		render_current_view()


func add_dialogue_controls(event: Dictionary, include_actions: bool = true, include_prompt: bool = true) -> void:
	if include_prompt:
		var asks := int(game.asks.get(event.id, 0))
		var prompt_panel := PanelContainer.new()
		prompt_panel.name = "NpcFollowupPanel"
		prompt_panel.add_theme_stylebox_override("panel", panel_style(Color("#f8fafc"), 10, Color("#e4eaf0"), 1))
		decision_box.add_child(prompt_panel)
		var prompt_box := VBoxContainer.new()
		prompt_panel.add_child(prompt_box)
		npc_hint = Label.new()
		npc_hint.text = "围绕上方两条知乎回答，向 %s 继续追问 · 已追问 %d 次" % [event.npc, asks]
		npc_hint.add_theme_font_size_override("font_size", 14)
		npc_hint.add_theme_color_override("font_color", MUTED)
		prompt_box.add_child(npc_hint)
		var input_row := HBoxContainer.new()
		prompt_box.add_child(input_row)
		npc_input = LineEdit.new()
		npc_input.placeholder_text = "围绕上方回答继续追问…"
		npc_input.max_length = 180
		npc_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		npc_input.add_theme_color_override("font_color", INK)
		npc_input.add_theme_color_override("font_placeholder_color", Color("#888888"))
		npc_input.add_theme_stylebox_override("normal", panel_style(Color("#ffffff"), 5, Color("#aaaaaa"), 1))
		npc_input.editable = npc_http.get_http_client_status() != HTTPClient.STATUS_REQUESTING
		npc_input.text_submitted.connect(send_npc_question.bind(event))
		input_row.add_child(npc_input)
		npc_send = Button.new()
		npc_send.text = "追问"
		npc_send.disabled = npc_http.get_http_client_status() == HTTPClient.STATUS_REQUESTING
		npc_send.add_theme_color_override("font_color", INK)
		npc_send.add_theme_stylebox_override("normal", button_style(WECHAT_GREEN, INK))
		npc_send.pressed.connect(_ask_from_button.bind(event))
		input_row.add_child(npc_send)

	if not include_actions or completed_event_ids().has(event.id):
		return
	if include_prompt:
		var divider := HSeparator.new()
		decision_box.add_child(divider)
	var decision_title := Label.new()
	decision_title.text = "现在，刘看山会怎么做？"
	decision_title.add_theme_font_size_override("font_size", 16)
	decision_title.add_theme_color_override("font_color", INK)
	decision_box.add_child(decision_title)
	for action in event.actions:
		var action_button := Button.new()
		action_button.text = "  " + str(action.label)
		action_button.alignment = HORIZONTAL_ALIGNMENT_LEFT
		action_button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		action_button.custom_minimum_size.y = 44
		action_button.add_theme_font_size_override("font_size", 16)
		action_button.add_theme_color_override("font_color", INK)
		action_button.add_theme_color_override("font_hover_color", INK)
		action_button.add_theme_stylebox_override("normal", button_style(Color("#ffffff"), INK, Color("#d5d5d5")))
		action_button.add_theme_stylebox_override("hover", button_style(Color("#f2fff1"), INK, Color("#75bd72")))
		action_button.pressed.connect(choose_action.bind(event, action))
		decision_box.add_child(action_button)


func add_ai_event_controls(event: Dictionary) -> void:
	var panel := PanelContainer.new()
	panel.name = "AiEventDialoguePanel"
	panel.add_theme_stylebox_override("panel", panel_style(Color("#f8fafc"), 10, Color("#d9e1e8"), 1))
	decision_box.add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 7)
	panel.add_child(box)
	var objective := Label.new()
	objective.text = "自由沟通 · 目标：%s" % str(event.brief)
	objective.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	objective.add_theme_font_size_override("font_size", 14)
	objective.add_theme_color_override("font_color", INK)
	box.add_child(objective)
	var row := HBoxContainer.new()
	box.add_child(row)
	npc_input = LineEdit.new()
	npc_input.placeholder_text = "像微信一样输入你的处理方式…"
	npc_input.max_length = 180
	npc_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	npc_input.add_theme_color_override("font_color", INK)
	npc_input.add_theme_color_override("font_placeholder_color", Color("#777777"))
	npc_input.add_theme_stylebox_override("normal", panel_style(Color("#ffffff"), 5, Color("#aaaaaa"), 1))
	npc_input.editable = npc_http.get_http_client_status() != HTTPClient.STATUS_REQUESTING and evaluation_http.get_http_client_status() != HTTPClient.STATUS_REQUESTING
	npc_input.text_submitted.connect(send_npc_question.bind(event))
	row.add_child(npc_input)
	npc_send = Button.new()
	npc_send.text = "发送"
	npc_send.disabled = not npc_input.editable
	npc_send.add_theme_color_override("font_color", INK)
	npc_send.add_theme_stylebox_override("normal", button_style(WECHAT_GREEN, INK))
	npc_send.pressed.connect(_ask_from_button.bind(event))
	row.add_child(npc_send)
	var turns := count_player_messages(str(event.id), active_tab)
	var round_limit := int(event.get("round_limit", AI_ROUND_LIMIT))
	var round_counter := Label.new()
	round_counter.name = "RoundCounter"
	round_counter.text = "第 %d / %d 轮 · 到上限仍未完成即判定失败" % [int(game.get("rounds", {}).get(str(event.id), 0)), round_limit]
	round_counter.add_theme_font_size_override("font_size", 13)
	round_counter.add_theme_color_override("font_color", MUTED)
	box.add_child(round_counter)
	var submit := Button.new()
	submit.name = "SubmitAiEvent"
	submit.text = "提交处理结果（已沟通 %d / 至少 2 轮 · 上限 %d 轮）" % [turns, round_limit]
	submit.disabled = turns < 2 or evaluation_http.get_http_client_status() == HTTPClient.STATUS_REQUESTING
	style_readable_button(submit)
	submit.pressed.connect(evaluate_ai_event.bind(event))
	box.add_child(submit)
	var prior: Dictionary = game.get("event_results", {}).get(str(event.id), {})
	if str(prior.get("status", "")) == "incomplete":
		var missing := Label.new()
		missing.text = "还需要补充：%s" % "、".join(PackedStringArray(prior.get("missing_labels", [])))
		missing.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		missing.add_theme_color_override("font_color", Color("#a33b2d"))
		box.add_child(missing)


func count_player_messages(event_id: String, channel: String) -> int:
	var count := 0
	for item in game.get("history", []):
		if str(item.get("event_id", "")) == event_id and str(item.get("channel", "")) == channel and str(item.get("sender", "")) == "刘看山":
			count += 1
	return count


func evaluation_history(event: Dictionary, channel: String = "") -> Array:
	var scope := channel if not channel.is_empty() else active_tab
	var result: Array = []
	for item in game.get("history", []):
		if str(item.get("event_id", "")) != str(event.id) or str(item.get("channel", "")) != scope:
			continue
		result.append({"sender": str(item.get("sender", "")), "text": str(item.get("text", "")).left(180)})
		if result.size() > 20:
			result.pop_front()
	return result


func evaluate_ai_event(event: Dictionary) -> void:
	if count_player_messages(str(event.id), active_tab) < 2 or completed_event_ids().has(event.id):
		return
	var attempts: Dictionary = game.get("evaluation_attempts", {})
	attempts[event.id] = int(attempts.get(event.id, 0)) + 1
	game.evaluation_attempts = attempts
	var origin := get_api_origin()
	if origin.is_empty():
		apply_ai_evaluation(event, evaluate_event_locally(event))
		return
	pending_evaluation_event = str(event.id)
	pending_evaluation_channel = active_tab
	var payload := JSON.stringify({"eventId": event.id, "history": evaluation_history(event)})
	var error := evaluation_http.request(origin + "/api/events/evaluate", ["Content-Type: application/json"], HTTPClient.METHOD_POST, payload)
	if error != OK:
		pending_evaluation_event = ""
		apply_ai_evaluation(event, evaluate_event_locally(event))
	else:
		render_current_view()


func _on_evaluation_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var event := EVENTS.get_event_by_id(pending_evaluation_event)
	var evaluation: Dictionary = {}
	if result == HTTPRequest.RESULT_SUCCESS and response_code == 200:
		var parsed = JSON.parse_string(body.get_string_from_utf8())
		if typeof(parsed) == TYPE_DICTIONARY:
			evaluation = parsed
	if event.is_empty():
		pending_evaluation_event = ""
		return
	if evaluation.is_empty():
		evaluation = evaluate_event_locally(event)
	pending_evaluation_event = ""
	apply_ai_evaluation(event, evaluation)


func evaluate_event_locally(event: Dictionary, channel: String = "") -> Dictionary:
	var player_text := ""
	for item in evaluation_history(event, channel):
		if str(item.get("sender", "")) == "刘看山":
			player_text += " " + str(item.get("text", "")).to_lower()
	var met: Array[String] = []
	var missing: Array[String] = []
	var missing_labels: Array[String] = []
	for criterion_data in event.get("criteria", []):
		var matched := false
		for keyword in criterion_data.get("keywords", []):
			if player_text.contains(str(keyword).to_lower()):
				matched = true
				break
		if matched:
			met.append(str(criterion_data.id))
		else:
			missing.append(str(criterion_data.id))
			missing_labels.append(str(criterion_data.label))
	var status := "excellent" if met.size() >= 3 else ("completed" if met.size() >= 2 else "incomplete")
	var feedback := "处理得很完整，目标、边界和下一步都说清楚了。" if status == "excellent" else ("任务已经完成，关键行动基本明确。" if status == "completed" else "目前还不足以完成任务，请把缺少的关键信息说清楚。")
	return {"status": status, "feedback": feedback, "metCriteria": met, "missingCriteria": missing, "missing_labels": missing_labels, "scoreDelta": score_for_evaluation(status)}


func score_for_evaluation(status: String) -> Dictionary:
	if status == "excellent":
		return {"trust": 2, "team": 2, "growth": 2}
	if status == "completed":
		return {"trust": 1, "team": 1, "growth": 1}
	return {"trust": 0, "team": 0, "growth": 0}


func evaluation_feedback(status: String) -> String:
	if status == "excellent":
		return "处理得很完整，目标、边界和下一步都说清楚了。"
	if status == "completed":
		return "任务已经完成，关键行动基本明确。"
	return "目前还不足以完成任务，请把缺少的关键信息说清楚。"


## 调试码入口：159 = 优秀，258 = 良好，357 = 未完成。不改动轮次，也不把码写进聊天记录。
func apply_debug_evaluation(event: Dictionary, status: String) -> void:
	var criteria: Array = event.get("criteria", [])
	var met: Array = []
	var missing: Array = []
	var missing_labels: Array = []
	var keep := 3 if status == "excellent" else (2 if status == "completed" else 0)
	for index in range(criteria.size()):
		var criterion_data: Dictionary = criteria[index]
		if index < keep:
			met.append(str(criterion_data.id))
		else:
			missing.append(str(criterion_data.id))
			missing_labels.append(str(criterion_data.label))
	append_history(str(event.id), "系统", "〔调试〕强制评价：%s" % str(DEBUG_STATUS_LABELS.get(status, status)), active_tab)
	apply_ai_evaluation(event, {
		"status": status,
		"feedback": evaluation_feedback(status),
		"metCriteria": met,
		"missingCriteria": missing,
		"missing_labels": missing_labels
	})


func apply_ai_evaluation(event: Dictionary, evaluation: Dictionary) -> void:
	var status := str(evaluation.get("status", "incomplete"))
	if not ["excellent", "completed", "incomplete"].has(status):
		status = "incomplete"
	var missing_labels: Array[String] = []
	var missing_ids: Array = evaluation.get("missingCriteria", [])
	for criterion_data in event.get("criteria", []):
		if missing_ids.has(str(criterion_data.id)):
			missing_labels.append(str(criterion_data.label))
	var results: Dictionary = game.get("event_results", {})
	results[event.id] = {"status": status, "feedback": str(evaluation.get("feedback", "")), "metCriteria": evaluation.get("metCriteria", []), "missingCriteria": missing_ids, "missing_labels": missing_labels}
	game.event_results = results
	append_history(str(event.id), str(event.npc), str(evaluation.get("feedback", "请继续补充。")), active_tab)
	if status == "incomplete":
		save_game()
		if int(game.get("rounds", {}).get(str(event.id), 0)) >= int(event.get("round_limit", AI_ROUND_LIMIT)):
			fail_ai_event(event)
			return
		render_current_view()
		return
	apply_scores(score_for_evaluation(status))
	complete_event(str(event.id))


func fail_ai_event(event: Dictionary) -> void:
	# 15 轮用尽仍未完成：按未命中标准所属维度扣分，事件以 failed 收尾，不可重试（规则书.md §8）。
	var event_id := str(event.id)
	if completed_event_ids().has(event_id) or str(event.get("mode", "fixed")) != "ai":
		return
	var channel := str(event.channel)
	var local := evaluate_event_locally(event, channel)
	var missing: Array = local.get("missingCriteria", [])
	var penalty := failure_penalty(event, missing)
	apply_scores(penalty)
	var results: Dictionary = game.get("event_results", {})
	results[event_id] = {
		"status": "failed",
		"feedback": str(event.get("fail_text", "")),
		"metCriteria": local.get("metCriteria", []),
		"missingCriteria": missing,
		"missing_labels": local.get("missing_labels", []),
		"penalty": penalty
	}
	game.event_results = results
	var fail_text := str(event.get("fail_text", ""))
	if not fail_text.is_empty():
		var sender := str(event.npc)
		var parts := fail_text.split("：")
		if parts.size() >= 2:
			sender = parts[0]
			fail_text = "：".join(parts.slice(1))
		append_history(event_id, sender, fail_text, channel)
	complete_event(event_id)


func failure_penalty(event: Dictionary, missing_ids: Array) -> Dictionary:
	var penalty := {"trust": 0, "team": 0, "growth": 0}
	for criterion_data in event.get("criteria", []):
		if not missing_ids.has(str(criterion_data.id)):
			continue
		var dimension := str(criterion_data.get("dimension", "growth"))
		if penalty.has(dimension):
			penalty[dimension] = int(penalty[dimension]) - 1
	return penalty


func add_ppt_minigame_card(event: Dictionary) -> void:
	var row := make_message_row("周岚", false)
	var card := PanelContainer.new()
	card.name = "PptMinigameCard"
	card.custom_minimum_size.x = 360
	card.add_theme_stylebox_override("panel", panel_style(Color("#ffffff"), 7, Color("#d8d8d8"), 1))
	row.add_child(card)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	card.add_child(box)
	var title := Label.new()
	title.text = "PPT 整理挑战"
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", INK)
	box.add_child(title)
	var brief := Label.new()
	brief.text = "在多个版本中整理出可以交付的客户提案"
	brief.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	brief.add_theme_color_override("font_color", MUTED)
	box.add_child(brief)
	var launch := Button.new()
	launch.text = "开始整理"
	style_readable_button(launch)
	launch.pressed.connect(launch_minigame.bind("ppt-assembly", {"returnEventId": str(event.id)}))
	box.add_child(launch)
	var demo := Button.new()
	demo.name = "PptDemoResult"
	demo.text = "使用演示结果继续"
	demo.add_theme_color_override("font_color", INK)
	demo.add_theme_stylebox_override("normal", button_style(Color("#f4f4f4"), INK, Color("#cccccc")))
	demo.pressed.connect(complete_ppt_minigame.bind({"eventId": "ppt-assembly", "status": "completed", "details": {"versionCorrect": true, "structureComplete": true, "creditsComplete": true}}))
	box.add_child(demo)


func launch_minigame(event_id: String, return_context: Dictionary = {}) -> void:
	if not ["ppt-assembly", "day-13"].has(event_id):
		return
	var event := EVENTS.get_event_by_id(event_id)
	var url := OS.get_environment("PPT_MINIGAME_URL" if event_id == "ppt-assembly" else "RUSH_MINIGAME_URL")
	if OS.has_feature("web"):
		var window = JavaScriptBridge.get_interface("window")
		if window != null:
			if event_id == "ppt-assembly" and window.PPT_MINIGAME_URL != null:
				url = str(window.PPT_MINIGAME_URL)
			elif event_id == "day-13" and window.RUSH_MINIGAME_URL != null:
				url = str(window.RUSH_MINIGAME_URL)
	if url.is_empty():
		if event_id == "day-13":
			# 未配置外部地址时使用内置的急件冲刺场景，主线不阻塞。
			start_delivery(pending_minigame_action(event))
			return
		append_history(str(event.id), "系统", "PPT 小游戏正在准备中；可先使用演示结果继续。", str(event.channel))
		save_game()
		render_current_view()
		return
	var separator := "&" if url.contains("?") else "?"
	OS.shell_open(url + separator + "eventId=" + event_id.uri_encode() + "&returnContext=" + JSON.stringify(return_context).uri_encode())


func register_ppt_minigame_bridge() -> void:
	if not OS.has_feature("web"):
		return
	var window = JavaScriptBridge.get_interface("window")
	if window == null:
		return
	ppt_web_callback = JavaScriptBridge.create_callback(_on_ppt_web_callback)
	window.completePptMinigame = ppt_web_callback


func _on_ppt_web_callback(arguments: Array) -> void:
	if arguments.is_empty():
		return
	var result = JSON.parse_string(str(arguments[0]))
	if typeof(result) == TYPE_DICTIONARY:
		complete_ppt_minigame(result)


func complete_ppt_minigame(result: Dictionary) -> void:
	if str(result.get("eventId", "")) != "ppt-assembly" or completed_event_ids().has("ppt-assembly"):
		return
	var status := str(result.get("status", "failed"))
	var minigames: Dictionary = game.get("minigame_results", {})
	minigames["ppt-assembly"] = result.duplicate(true)
	game.minigame_results = minigames
	if status == "failed":
		append_history("ppt-assembly", "周岚", "先检查版本、结构和署名，再试一次。", "周岚")
		save_game()
		render_current_view()
		return
	apply_scores({"trust": 2 if status == "excellent" else 1, "team": 2 if status == "excellent" else 1, "growth": 2 if status == "excellent" else 1})
	append_history("ppt-assembly", "周岚", "文件结构、版本和署名都核对好了，可以交付。", "周岚")
	complete_event("ppt-assembly")


func choose_action(event: Dictionary, action: Dictionary) -> void:
	if completed_event_ids().has(event.id) or action_sequence_running:
		return
	run_action_sequence(event, action)


## 选项之后的对话也要逐条出现：我方气泡、对方的反应、系统行，间隔不一致。
func run_action_sequence(event: Dictionary, action: Dictionary) -> void:
	action_sequence_running = true
	var channel := active_tab if not active_tab.is_empty() else str(event.channel)
	var lines := action_lines(action)
	var typing_shown := false
	for index in range(lines.size()):
		var line: Dictionary = lines[index]
		var sender := str(line.get("sender", ""))
		var text := str(line.get("text", ""))
		var kind := str(line.get("kind", "text"))
		var stamp := str(line.get("stamp", ""))
		var delay := float(line.get("delay", -1.0))
		if delay < 0.0:
			delay = sequence_delay(sender, index)
		var typing_time := 0.0
		# 正在输入只在联系人窗口出现，且每轮对话只显示一次。
		if not typing_shown and channel != "群聊" and sender != "刘看山" and sender != "系统" and kind == "text" and delay >= 1.2:
			typing_time = minf(1.0, delay - 0.4)
			typing_shown = true
			pending_typing_sender = sender
			render_current_view()
			await get_tree().create_timer(typing_time).timeout
			pending_typing_sender = ""
		await get_tree().create_timer(maxf(0.05, delay - typing_time)).timeout
		append_history(str(event.id), sender, text, channel, kind, stamp)
		save_game()
		render_current_view()
	if is_instance_valid(event_loading):
		# 转场期间被打断（重开存档等）：不再写入后续状态。
		action_sequence_running = false
		pending_typing_sender = ""
		return
	action_sequence_running = false
	pending_typing_sender = ""
	apply_scores(action.scores)
	if str(event.id) == "day-01":
		game.day01_intro_selected = true
		save_game()
		render_current_view()
		return
	if bool(event.get("delivery_minigame", false)):
		var pending: Dictionary = game.get("minigame_pending", {})
		pending[str(event.id)] = str(action.get("id", ""))
		game.minigame_pending = pending
		save_game()
		render_current_view()
		return
	complete_event(event.id)


func action_lines(action: Dictionary) -> Array:
	var lines: Array = []
	for index in range(action.get("bubbles", []).size()):
		lines.append({"sender": "刘看山", "text": str(action.bubbles[index]), "kind": "text", "stamp": ""})
	for reply in action.get("replies", []):
		if reply.size() >= 2:
			lines.append({"sender": str(reply[0]), "text": str(reply[1]), "kind": str(reply[2]) if reply.size() >= 3 else "text", "stamp": str(reply[3]) if reply.size() >= 4 else ""})
	return lines


func sequence_delay(sender: String, index: int) -> float:
	if sender == "系统":
		return 1.2
	if sender == "刘看山":
		# 自己打字几乎立刻出现，第二条稍作停顿。
		return 0.4 if index == 0 else 1.0
	# 对方回应：1.2 / 1.65 / 2.1 / 2.55 秒交替，避免匀速感。
	return 1.2 + float(index % 4) * 0.45


func start_delivery(action: Dictionary) -> void:
	active_delivery = DELIVERY_SCENE.instantiate()
	add_child(active_delivery)
	var config: Dictionary = action.get("minigame", {})
	if config.is_empty():
		config = pending_minigame_config(str(action.get("id", "")))
	if active_delivery.has_method("configure"):
		active_delivery.configure(float(config.get("seconds", 90.0)), int(config.get("extra_files", 0)))
	active_delivery.finished.connect(_on_delivery_finished.bind(action))


func pending_minigame_config(action_id: String) -> Dictionary:
	var pending: Dictionary = game.get("minigame_pending", {})
	return pending.get(action_id, {})


func add_rush_minigame_card(event: Dictionary) -> void:
	var action := pending_minigame_action(event)
	var config := pending_minigame_config(str(action.get("id", "")))
	var row := make_message_row("林总", false)
	var card := PanelContainer.new()
	card.name = "RushMinigameCard"
	card.custom_minimum_size.x = 360
	card.add_theme_stylebox_override("panel", panel_style(Color("#ffffff"), 7, Color("#d8d8d8"), 1))
	row.add_child(card)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	card.add_child(box)
	var title := Label.new()
	title.text = "急件冲刺"
	title.add_theme_font_size_override("font_size", 18)
	title.add_theme_color_override("font_color", INK)
	box.add_child(title)
	var brief := Label.new()
	brief.text = "四个工位 · 订单同时来 · 限时 %d 秒" % int(config.get("seconds", 90.0))
	brief.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	brief.add_theme_color_override("font_color", MUTED)
	box.add_child(brief)
	var launch := Button.new()
	launch.name = "RushLaunch"
	launch.text = "进会议室"
	style_readable_button(launch)
	launch.pressed.connect(launch_minigame.bind("day-13", {"returnEventId": str(event.id)}))
	box.add_child(launch)
	var demo := Button.new()
	demo.name = "RushDemoResult"
	demo.text = "使用演示结果继续"
	demo.add_theme_color_override("font_color", INK)
	demo.add_theme_stylebox_override("normal", button_style(Color("#f4f4f4"), INK, Color("#cccccc")))
	demo.pressed.connect(demo_rush_result)
	box.add_child(demo)


func pending_minigame_action(event: Dictionary) -> Dictionary:
	var pending: Dictionary = game.get("minigame_pending", {})
	var action_id := str(pending.get(str(event.id), ""))
	for action in event.get("actions", []):
		if str(action.get("id", "")) == action_id:
			return action
	return {}


func _on_delivery_finished(success: bool, action: Dictionary) -> void:
	if is_instance_valid(active_delivery):
		active_delivery.queue_free()
	active_delivery = null
	if current_index >= events.size():
		return
	var event: Dictionary = events[current_index]
	if str(event.id) != "day-13" or completed_event_ids().has(event.id):
		return
	var minigames: Dictionary = game.get("minigame_results", {})
	minigames["day-13"] = {"eventId": "day-13", "status": "excellent" if success else "failed", "details": {}}
	game.minigame_results = minigames
	if success:
		apply_scores({"trust": 2, "team": 1, "growth": 2})
		append_history(event.id, "林总", "签约件交到程女士手上了。稳住了。", str(event.channel))
		complete_event(event.id)
		return
	# 小游戏 failed 允许重试（见 STORY_BIBLE §7.1）：不扣分，也不阻塞主线。
	append_history(event.id, "林总", "客户先走了。复盘一下路线和交接，别让同样的失误再发生。", str(event.channel))
	save_game()
	render_current_view()


func demo_rush_result() -> void:
	if current_index >= events.size():
		return
	var event: Dictionary = events[current_index]
	if str(event.id) != "day-13" or completed_event_ids().has(event.id):
		return
	var minigames: Dictionary = game.get("minigame_results", {})
	minigames["day-13"] = {"eventId": "day-13", "status": "completed", "details": {"source": "demo"}}
	game.minigame_results = minigames
	apply_scores({"trust": 1, "team": 1, "growth": 1})
	append_history(event.id, "林总", "签约件交到程女士手上了。稳住了。", str(event.channel))
	complete_event(event.id)


func finish_event(event_id: String) -> void:
	complete_event(event_id, false)
	advance_to_next_event(event_id)


func complete_event(event_id: String, rerender: bool = true) -> void:
	var done: Array = completed_event_ids()
	if not done.has(event_id):
		done.append(event_id)
		game.completed = done
	save_game()
	if rerender:
		render_current_view()


func add_next_event_button(event: Dictionary) -> void:
	var divider := HSeparator.new()
	decision_box.add_child(divider)
	var next := Button.new()
	next.name = "NextInternDay"
	next.text = "查看实习结局……" if current_index == events.size() - 1 else "收好今天的经验，继续实习生活……"
	style_readable_button(next)
	next.pressed.connect(advance_to_next_event.bind(str(event.id)))
	decision_box.add_child(next)


func advance_to_next_event(event_id: String) -> void:
	if current_index >= events.size() or str(events[current_index].id) != event_id or not completed_event_ids().has(event_id):
		return
	current_index += 1
	save_game()
	if current_index >= events.size():
		show_ending()
	else:
		active_tab = str(events[current_index].channel)
		unlock_contacts_for_event(events[current_index])
		start_event_loading()


func send_npc_question(_submitted: String = "", event: Dictionary = {}) -> void:
	if event.is_empty() or npc_input == null:
		return
	var question := npc_input.text.strip_edges()
	if question.is_empty():
		return
	var forced_status := str(DEBUG_EVAL_CODES.get(question, ""))
	if not forced_status.is_empty() and str(event.get("mode", "fixed")) == "ai" and not completed_event_ids().has(event.id):
		npc_input.clear()
		apply_debug_evaluation(event, forced_status)
		return
	var asks := int(game.asks.get(event.id, 0))
	game.asks[event.id] = asks + 1
	append_history(event.id, "刘看山", question, active_tab)
	npc_input.clear()
	var in_task_phase := str(event.get("mode", "fixed")) == "ai" and not completed_event_ids().has(event.id)
	if in_task_phase:
		var rounds: Dictionary = game.get("rounds", {})
		rounds[event.id] = int(rounds.get(event.id, 0)) + 1
		game.rounds = rounds
	save_game()
	var api_origin := get_api_origin()
	if api_origin.is_empty():
		if in_task_phase and int(game.get("rounds", {}).get(str(event.id), 0)) >= int(event.get("round_limit", AI_ROUND_LIMIT)):
			# 轮次用尽：直接结算，不再表演"正在输入"。
			fail_ai_event(event)
			return
		await stream_placeholder_reply(event)
		render_current_view()
		return
	pending_npc_event = str(event.id)
	pending_npc_text = str(event.fallback)
	pending_npc_channel = active_tab
	var recent_history: Array = []
	for item in game.history:
		if str(item.event_id) == str(event.id) and str(item.get("channel", event.channel)) == active_tab:
			recent_history.append({"sender": str(item.sender), "text": str(item.text)})
			if recent_history.size() > 6:
				recent_history.pop_front()
	var payload := JSON.stringify({"eventId": event.id, "role": event.npc, "message": question, "history": recent_history, "round": int(game.get("rounds", {}).get(str(event.id), 0)), "roundLimit": int(event.get("round_limit", AI_ROUND_LIMIT))})
	var request_error := npc_http.request(api_origin + "/api/npc/reply", ["Content-Type: application/json"], HTTPClient.METHOD_POST, payload)
	if request_error != OK:
		append_history(event.id, event.npc, str(event.fallback), active_tab)
		render_current_view()


func _ask_from_button(event: Dictionary) -> void:
	send_npc_question("", event)


## 模型不可用时的占位回复：联系人窗口先显示"某某 正在输入…"，群聊里静默等一拍再落气泡。
func stream_placeholder_reply(event: Dictionary) -> void:
	if active_tab != "群聊":
		pending_typing_sender = str(event.npc)
		render_current_view()
		await get_tree().create_timer(1.1).timeout
		pending_typing_sender = ""
	else:
		await get_tree().create_timer(0.8).timeout
	append_history(str(event.id), str(event.npc), "" if AI_PLACEHOLDER_BUBBLES else str(event.fallback), active_tab)
	save_game()


func _on_npc_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var response_text := pending_npc_text
	var response_messages: Array = []
	if result == HTTPRequest.RESULT_SUCCESS and response_code == 200:
		var parsed = JSON.parse_string(body.get_string_from_utf8())
		if typeof(parsed) == TYPE_DICTIONARY:
			if typeof(parsed.get("messages", [])) == TYPE_ARRAY:
				response_messages = parsed.get("messages", [])
			elif parsed.has("reply") and str(parsed.reply).length() > 0:
				response_text = str(parsed.reply)
	var event := EVENTS.get_event_by_id(pending_npc_event)
	if not event.is_empty():
		if response_messages.is_empty():
			append_history(pending_npc_event, str(event.npc), "" if AI_PLACEHOLDER_BUBBLES else response_text, pending_npc_channel)
		else:
			for message in response_messages.slice(0, 2):
				var sender := str(message.get("sender", event.npc))
				if not event.get("participants", [event.npc]).has(sender):
					continue
				append_history(pending_npc_event, sender, str(message.get("text", "")).left(180), pending_npc_channel)
		save_game()
		if int(game.get("rounds", {}).get(str(event.id), 0)) >= int(event.get("round_limit", AI_ROUND_LIMIT)) and str(event.get("mode", "fixed")) == "ai" and not completed_event_ids().has(str(event.id)):
			fail_ai_event(event)
		elif current_index < events.size() and str(events[current_index].id) == pending_npc_event:
			render_current_view()
	pending_npc_event = ""
	pending_npc_text = ""
	pending_npc_channel = ""


func request_insights(event_id: String) -> void:
	if insight_loaded.has(event_id):
		return
	var api_origin := get_api_origin()
	if api_origin.is_empty():
		insight_loaded[event_id] = true
		insight_cache[event_id] = []
		return
	insight_loaded[event_id] = true
	insights_http.set_meta("event_id", event_id)
	var error := insights_http.request(api_origin + "/api/zhihu/insights/" + event_id)
	if error != OK:
		insight_cache[event_id] = []


func _on_insights_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var event_id := str(insights_http.get_meta("event_id", ""))
	var entries: Array = []
	if result == HTTPRequest.RESULT_SUCCESS and response_code == 200:
		var parsed = JSON.parse_string(body.get_string_from_utf8())
		if typeof(parsed) == TYPE_DICTIONARY and typeof(parsed.get("insights", [])) == TYPE_ARRAY:
			entries = parsed.get("insights", [])
	insight_cache[event_id] = entries
	var should_refresh_day_one := event_id == "day-01" and bool(game.get("day01_redirected", false)) and active_tab == "周岚"
	if current_index < events.size() and str(events[current_index].id) == event_id and (completed_event_ids().has(event_id) or should_refresh_day_one):
		render_current_view()


func add_task_card(event: Dictionary) -> void:
	var task := PanelContainer.new()
	task.add_theme_stylebox_override("panel", panel_style(Color("#effaf4"), 10, Color("#ccebd9"), 1))
	chat_list.add_child(task)
	var task_box := VBoxContainer.new()
	task.add_child(task_box)
	var task_title := Label.new()
	task_title.text = "今日任务 · %s" % event.title
	task_title.add_theme_font_size_override("font_size", 14)
	task_title.add_theme_color_override("font_color", Color("#168453"))
	task_box.add_child(task_title)
	var task_body := Label.new()
	task_body.text = str(event.brief)
	task_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	task_body.add_theme_font_size_override("font_size", 14)
	task_body.add_theme_color_override("font_color", INK)
	task_box.add_child(task_body)


func add_advisor_card(event: Dictionary) -> void:
	var title := Label.new()
	title.text = "知乎高赞回答 · 延伸阅读"
	title.add_theme_font_size_override("font_size", 14)
	title.add_theme_color_override("font_color", Color("#6548b9"))
	decision_box.add_child(title)
	var cards := GridContainer.new()
	cards.name = "ZhihuAnswerSlots"
	cards.columns = 2
	cards.add_theme_constant_override("h_separation", 12)
	decision_box.add_child(cards)
	var entries: Array = insight_cache.get(event.id, [])
	if entries.is_empty():
		for index in range(2):
			add_zhihu_answer_slot(cards, index, {}, str(event.keyword))
		return
	for index in range(2):
		add_zhihu_answer_slot(cards, index, entries[index] if index < entries.size() else {}, str(event.keyword))


func add_zhihu_answer_slot(parent: GridContainer, index: int, item: Dictionary, keyword: String) -> void:
	var card := PanelContainer.new()
	card.name = "ZhihuAnswerSlot%d" % (index + 1)
	card.custom_minimum_size = Vector2(320, 94)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.add_theme_stylebox_override("panel", panel_style(Color("#f8f5ff"), 10, Color("#e4dbff"), 1))
	parent.add_child(card)
	var content := VBoxContainer.new()
	card.add_child(content)
	var source := Button.new()
	source.alignment = HORIZONTAL_ALIGNMENT_LEFT
	source.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	source.add_theme_font_size_override("font_size", 13)
	source.add_theme_stylebox_override("normal", flat_style(Color.TRANSPARENT, INK))
	source.add_theme_stylebox_override("hover", flat_style(Color("#eee8ff"), INK))
	source.add_theme_stylebox_override("disabled", flat_style(Color.TRANSPARENT, INK))
	if item.is_empty():
		source.text = "高赞回答预留 %02d\n接入知乎 API 后显示真实标题、作者与摘要" % (index + 1)
		source.tooltip_text = "待接入 · 检索关键词：%s" % keyword
		source.disabled = true
		source.add_theme_color_override("font_disabled_color", Color("#55505f"))
	else:
		source.text = "%s · %s\n%s" % [str(item.get("title", "知乎回答")), str(item.get("author", "知乎用户")), str(item.get("summary", ""))]
		source.tooltip_text = str(item.get("url", ""))
		source.pressed.connect(open_zhihu_source.bind(str(item.get("url", ""))))
	content.add_child(source)
	var footer := Label.new()
	footer.text = "知乎 · 查看原回答 ↗" if not item.is_empty() else "知乎内容接口占位"
	footer.add_theme_font_size_override("font_size", 11)
	footer.add_theme_color_override("font_color", Color("#775fb2"))
	content.add_child(footer)


func open_zhihu_source(url: String) -> void:
	var host := url.get_slice("://", 1).get_slice("/", 0).to_lower()
	if url.begins_with("https://") and (host == "zhihu.com" or host.ends_with(".zhihu.com")):
		OS.shell_open(url)


func add_system_line(content: String) -> void:
	var line := Label.new()
	line.text = "──  %s  ──" % content
	line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	line.add_theme_font_size_override("font_size", 12)
	line.add_theme_color_override("font_color", MUTED)
	chat_list.add_child(line)


func add_empty_state(content: String) -> void:
	var label := Label.new()
	label.text = content
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	label.add_theme_font_size_override("font_size", 15)
	label.add_theme_color_override("font_color", MUTED)
	chat_list.add_child(label)


func make_avatar(person: String, diameter: int = 44) -> TextureRect:
	var avatar := AVATAR.new()
	avatar.setup(person, diameter)
	return avatar


func make_message_row(sender: String, from_me: bool) -> VBoxContainer:
	var row := HBoxContainer.new()
	row.name = "OwnMessage" if from_me else "IncomingMessage"
	row.add_theme_constant_override("separation", 10)
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_list.add_child(row)
	if from_me:
		var left_space := Control.new()
		left_space.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(left_space)
	if not from_me:
		row.add_child(make_avatar(sender))
	var bubble_stack := VBoxContainer.new()
	bubble_stack.name = "MessageContent"
	bubble_stack.custom_minimum_size.x = 300
	bubble_stack.size_flags_horizontal = Control.SIZE_SHRINK_END if from_me else Control.SIZE_SHRINK_BEGIN
	row.add_child(bubble_stack)
	var sender_label := Label.new()
	sender_label.text = "我" if from_me else sender
	sender_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT if from_me else HORIZONTAL_ALIGNMENT_LEFT
	sender_label.add_theme_font_size_override("font_size", 13)
	sender_label.add_theme_color_override("font_color", MUTED)
	bubble_stack.add_child(sender_label)
	if from_me:
		row.add_child(make_avatar("刘看山"))
	else:
		var right_space := Control.new()
		right_space.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(right_space)
	return bubble_stack


func add_message(sender: String, content: String, from_me: bool) -> void:
	var bubble_stack := make_message_row(sender, from_me)
	var bubble := PanelContainer.new()
	bubble.add_theme_stylebox_override("panel", panel_style(ME_BUBBLE if from_me else BUBBLE, 6, Color("#d8d8d8"), 1))
	bubble_stack.add_child(bubble)
	var body := Label.new()
	body.name = "BubbleBody"
	body.text = content
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.custom_minimum_size.x = 230
	body.add_theme_font_size_override("font_size", 17)
	body.add_theme_color_override("font_color", INK)
	if content.strip_edges().is_empty():
		# AI 占位气泡：模型尚未接入时，NPC 台词用空白气泡占位（见 规则书.md §10）。
		body.name = "AiPlaceholderBubble"
		body.text = " "
		body.custom_minimum_size.y = 22
	bubble.add_child(body)


func show_ending() -> void:
	refresh_navigation()
	clear_children(chat_list)
	clear_children(decision_box)
	title_label.text = "实习结局"
	subtitle_label.text = "20 天的选择，汇成你留下的职业印象"
	day_label.text = "结项完成"
	var scores: Dictionary = game.scores
	var trust := int(scores.trust)
	var team := int(scores.team)
	var growth := int(scores.growth)
	var total := trust + team + growth
	var ending := "结束实习"
	var badge := "继续"
	var text := "林总：这段实习说明你还需要把判断、协作和复盘落到行动里。带着这次经验，下一段旅程会更稳。"
	if trust >= 9 and team >= 9 and growth >= 9 and total >= 29:
		ending = "跳级升职"
		badge = "优"
		text = "林总：你不只完成了任务，还能让团队更好地完成任务。欢迎提前进入项目负责人培养计划。"
	elif min(trust, team, growth) >= 3 and total >= 14:
		ending = "实习转正"
		badge = "正"
		text = "林总：你已经形成了可靠的工作方法。欢迎继续留在看山创意部，把下一轮问题做得更漂亮。"
	add_system_line("你的实习档案已生成")
	var ending_card := PanelContainer.new()
	ending_card.add_theme_stylebox_override("panel", panel_style(Color("#f0fbf5"), 14, Color("#bee9d0"), 1))
	chat_list.add_child(ending_card)
	var end_box := VBoxContainer.new()
	ending_card.add_child(end_box)
	var ending_label := Label.new()
	ending_label.text = "%s · %s" % [badge, ending]
	ending_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ending_label.add_theme_font_size_override("font_size", 28)
	ending_label.add_theme_color_override("font_color", Color("#158253"))
	end_box.add_child(ending_label)
	var ending_body := Label.new()
	ending_body.text = text
	ending_body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	ending_body.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	ending_body.add_theme_font_size_override("font_size", 15)
	ending_body.add_theme_color_override("font_color", INK)
	end_box.add_child(ending_body)
	var numbers := Label.new()
	numbers.text = "\n老板信任 %d   ·   团队协作 %d   ·   职业成长 %d" % [trust, team, growth]
	numbers.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	numbers.add_theme_font_size_override("font_size", 14)
	numbers.add_theme_color_override("font_color", MUTED)
	end_box.add_child(numbers)
	var replay := Button.new()
	replay.text = "换一条职业路径再试试"
	replay.add_theme_stylebox_override("normal", button_style(WECHAT_GREEN, Color("#ffffff")))
	replay.pressed.connect(reset_game)
	decision_box.add_child(replay)


func set_active_tab(tab: String) -> void:
	if is_instance_valid(event_loading):
		return
	active_tab = tab
	active_mode = "messages"
	clear_unread(tab)
	save_game()
	render_current_view()


func set_active_mode(mode: String) -> void:
	if is_instance_valid(event_loading):
		return
	active_mode = mode
	refresh_navigation()


func refresh_navigation() -> void:
	if message_mode_button == null or conversation_list == null:
		return
	message_mode_button.add_theme_stylebox_override("normal", flat_style(Color("#d2d2d2") if active_mode == "messages" else RAIL, INK))
	contacts_mode_button.add_theme_stylebox_override("normal", flat_style(Color("#d2d2d2") if active_mode == "contacts" else RAIL, INK))
	render_conversation_list()


func rail_button(glyph: String, tooltip: String) -> Button:
	var button := Button.new()
	button.icon = UI_ICONS.get_icon(glyph)
	button.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	button.add_theme_constant_override("icon_max_width", 24)
	button.tooltip_text = tooltip
	button.custom_minimum_size = Vector2(60, 48)
	button.add_theme_font_size_override("font_size", 24)
	button.add_theme_color_override("font_color", INK)
	button.add_theme_color_override("font_hover_color", INK)
	button.add_theme_stylebox_override("normal", flat_style(RAIL, INK))
	button.add_theme_stylebox_override("hover", flat_style(Color("#d4d4d4"), INK))
	return button


func render_conversation_list() -> void:
	clear_children(conversation_list)
	if active_mode == "contacts":
		render_contact_list()
		return
	for chat in visible_conversations():
		add_conversation_item(str(chat))


func add_conversation_item(chat: String) -> void:
	add_identity_item(chat, conversation_preview(chat), unread_count(chat), false)


func add_identity_item(person: String, preview: String, unread: int, contact_only: bool) -> void:
	var item := Button.new()
	item.name = "ContactItem" if contact_only else "ConversationItem"
	item.custom_minimum_size = Vector2(0, 64 if contact_only else 76)
	item.tooltip_text = display_contact_name(person)
	item.add_theme_stylebox_override("normal", flat_style(Color("#dedede") if person == active_tab else CONVERSATION_BG, INK))
	item.add_theme_stylebox_override("hover", flat_style(Color("#e7e7e7"), INK))
	item.add_theme_stylebox_override("pressed", flat_style(Color("#d6d6d6"), INK))
	item.add_theme_stylebox_override("focus", panel_style(Color.TRANSPARENT, 3, Color("#7a8a95"), 2))
	item.pressed.connect(set_active_tab.bind(person))
	conversation_list.add_child(item)
	var row := HBoxContainer.new()
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.offset_left = 12
	row.offset_right = -12
	row.offset_top = 10
	row.offset_bottom = -10
	row.add_theme_constant_override("separation", 12)
	item.add_child(row)
	var avatar_frame := Control.new()
	avatar_frame.custom_minimum_size = Vector2(44, 44)
	avatar_frame.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	avatar_frame.add_child(make_avatar(person))
	row.add_child(avatar_frame)
	if unread > 0:
		# Badge is a sibling of the masked image, so it is never circularly clipped.
		var badge := Panel.new()
		badge.name = "UnreadBadge"
		badge.position = Vector2(35, -3)
		badge.size = Vector2(12, 12)
		var badge_style := panel_style(Color("#d93535"), 6, Color("#f2f2f2"), 1)
		badge.add_theme_stylebox_override("panel", badge_style)
		avatar_frame.add_child(badge)
	var words := VBoxContainer.new()
	words.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	words.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	words.add_theme_constant_override("separation", 4)
	row.add_child(words)
	var name_text := Label.new()
	name_text.text = display_contact_name(person)
	name_text.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_text.add_theme_font_size_override("font_size", 16)
	name_text.add_theme_color_override("font_color", INK)
	words.add_child(name_text)
	if not contact_only:
		var summary := Label.new()
		summary.name = "Preview"
		summary.text = preview.replace("\n", " ")
		summary.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		summary.add_theme_font_size_override("font_size", 13)
		summary.add_theme_color_override("font_color", Color("#606060"))
		words.add_child(summary)
	ignore_pointer_events(row)


func ignore_pointer_events(control: Control) -> void:
	control.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for child in control.get_children():
		if child is Control:
			ignore_pointer_events(child)


func render_contact_list() -> void:
	var title := Label.new()
	title.text = "联系人"
	title.add_theme_font_size_override("font_size", 16)
	title.add_theme_color_override("font_color", MUTED)
	conversation_list.add_child(title)
	var notices: Array = game.get("contact_notices", [])
	var unread_notices := 0
	for notice in notices:
		if not bool(notice.get("read", false)):
			unread_notices += 1
	var notification := Button.new()
	notification.text = "  新的通知%s\n       %s" % [" ●" if unread_notices > 0 else "", "点击查看好友与群聊提醒"]
	notification.alignment = HORIZONTAL_ALIGNMENT_LEFT
	notification.custom_minimum_size.y = 66
	notification.add_theme_font_size_override("font_size", 16)
	notification.add_theme_color_override("font_color", INK)
	notification.add_theme_color_override("font_hover_color", INK)
	notification.add_theme_stylebox_override("normal", flat_style(CONVERSATION_BG, INK))
	notification.pressed.connect(open_contact_notices)
	conversation_list.add_child(notification)
	for group in game.get("groups", []):
		add_contact_item(str(group), true)
	for contact in game.get("contacts", ["林总"]):
		add_contact_item(str(contact), false)


func add_contact_item(contact: String, _is_group: bool) -> void:
	add_identity_item(contact, "", unread_count(contact), true)


func visible_conversations() -> Array:
	var result: Array = []
	for contact in game.get("contacts", ["林总"]):
		result.append(str(contact))
	for group in game.get("groups", []):
		if not result.has(str(group)):
			result.append(str(group))
	return result


func display_contact_name(contact: String) -> String:
	match contact:
		"群聊":
			return "看山创意部（6）"
		"周岚":
			return "周岚（组长）"
		"程女士":
			return "程女士（客户）"
	return contact


func conversation_preview(chat: String) -> String:
	if not bool(game.get("joined_main_group", false)) and chat == "林总":
		return "邀请你加入看山创意部"
	if current_index < events.size():
		var event: Dictionary = events[current_index]
		var revealed := mini(int(game.revealed.get(event.id, 0)), event.messages.size())
		for index in range(revealed - 1, -1, -1):
			var message: Array = event.messages[index]
			if event_message_channel(message, event) == chat:
				return str(message[1])
		if chat == str(event.channel):
			return str(event.brief)
	var history: Array = game.get("history", [])
	for index in range(history.size() - 1, -1, -1):
		var historic: Dictionary = history[index]
		if str(historic.get("channel", "")) == chat:
			return str(historic.get("text", ""))
	if chat == "林总" and bool(game.get("joined_main_group", false)):
		return "[群聊邀请] 已加入看山创意部"
	return "暂无消息"


func unread_count(chat: String) -> int:
	var unread: Dictionary = game.get("unread", {})
	return int(unread.get(chat, 0))


func mark_unread(chat: String) -> void:
	var unread: Dictionary = game.get("unread", {})
	unread[chat] = int(unread.get(chat, 0)) + 1
	game.unread = unread


func clear_unread(chat: String) -> void:
	var unread: Dictionary = game.get("unread", {})
	if unread.has(chat):
		unread[chat] = 0
		game.unread = unread


func open_contact_notices() -> void:
	var notices: Array = game.get("contact_notices", [])
	for index in range(notices.size()):
		var notice: Dictionary = notices[index]
		notice["read"] = true
		notices[index] = notice
	game.contact_notices = notices
	active_mode = "messages"
	active_tab = "联系人通知"
	save_game()
	render_current_view()


func render_contact_notices_view() -> void:
	title_label.text = "联系人通知"
	subtitle_label.text = "好友添加、拉群与工作群提醒"
	add_system_line("联系人通知")
	var notices: Array = game.get("contact_notices", [])
	if notices.is_empty():
		add_empty_state("暂时没有联系人或群聊通知。")
		return
	for notice in notices:
		var row := PanelContainer.new()
		row.add_theme_stylebox_override("panel", panel_style(Color("#ffffff"), 6, Color("#dddddd"), 1))
		chat_list.add_child(row)
		var text := Label.new()
		text.text = str(notice.get("text", ""))
		text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		text.add_theme_font_size_override("font_size", 16)
		text.add_theme_color_override("font_color", INK)
		row.add_child(text)


func show_phone_hint() -> void:
	if subtitle_label != null:
		subtitle_label.text = "手机图标保留为桌面微信视觉入口；建议在电脑浏览器游玩。"


func show_more_menu() -> void:
	if more_menu == null:
		more_menu = PopupMenu.new()
		more_menu.add_item("任务提醒", 1)
		more_menu.add_item("我的实习档案", 2)
		more_menu.add_separator()
		more_menu.add_item("重新开始", 3)
		more_menu.id_pressed.connect(_on_more_menu_pressed)
		add_child(more_menu)
	more_menu.position = Vector2i(78, 560)
	more_menu.popup()


func _on_more_menu_pressed(id: int) -> void:
	match id:
		1:
			set_active_tab("任务")
		2:
			set_active_tab("档案")
		3:
			reset_game()


func tab_title(tab: String) -> String:
	match tab:
		"群聊":
			return "看山创意部（6）"
		"林总":
			return "林总"
		"周岚":
			return "周岚"
	return tab


func sender_avatar(sender: String) -> String:
	match sender:
		"林总":
			return "总"
		"阿麦":
			return "麦"
		"周岚":
			return "岚"
		"韩策":
			return "韩"
		"小鹿":
			return "鹿"
		"程女士":
			return "程"
		"群聊":
			return "群"
		_:
			return "部"


func apply_scores(delta: Dictionary) -> void:
	for key in ["trust", "team", "growth"]:
		game.scores[key] = int(game.scores.get(key, 0)) + int(delta.get(key, 0))


func completed_event_ids() -> Array:
	return game.get("completed", [])


func append_history(event_id: String, sender: String, content: String, channel: String = "", kind: String = "text", stamp: String = "") -> void:
	var history: Array = game.get("history", [])
	if channel.is_empty():
		var event := EVENTS.get_event_by_id(event_id)
		channel = str(event.get("channel", "群聊"))
	history.append({"event_id": event_id, "sender": sender, "text": content, "channel": channel, "kind": kind, "stamp": stamp})
	game.history = history


func remove_last_history_message(event_id: String, sender: String, content: String, channel: String) -> void:
	var history: Array = game.get("history", [])
	for index in range(history.size() - 1, -1, -1):
		var item: Dictionary = history[index]
		if str(item.get("event_id", "")) == event_id and str(item.get("sender", "")) == sender and str(item.get("text", "")) == content and str(item.get("channel", "")) == channel:
			history.remove_at(index)
			break
	game.history = history


func load_game() -> void:
	game = new_game_state()
	if not FileAccess.file_exists(SAVE_PATH):
		return
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return
	var parsed = JSON.parse_string(file.get_as_text())
	if typeof(parsed) == TYPE_DICTIONARY and int(parsed.get("version", 0)) == SAVE_VERSION:
		game = parsed
		normalize_game_state()
		current_index = resolve_saved_event_index()
		active_tab = str(game.get("active_tab", "林总"))
	else:
		# The old navigation revealed the group immediately, so it cannot reproduce the new first day.
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))


func save_game() -> void:
	game.version = SAVE_VERSION
	game.current_index = current_index
	game.current_event_id = str(events[current_index].id) if current_index < events.size() else "ending"
	game.active_tab = active_tab
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(game))


func reset_game() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))
	game = new_game_state()
	current_index = 0
	active_tab = "林总"
	active_mode = "messages"
	insight_cache = {}
	insight_loaded = {}
	knowledge_items = []
	knowledge_loaded = false
	render_current_view()


func new_game_state() -> Dictionary:
	return {
		"version": SAVE_VERSION,
		"current_index": 0,
		"current_event_id": "day-01",
		"active_tab": "林总",
		"completed": [],
		"history": [],
		"asks": {},
		"revealed": {},
		"joined_main_group": false,
		"groups": [],
		"contacts": ["林总"],
		"unread": {"林总": 0},
		"contact_notices": [],
		"day01_intro_selected": false,
		"day01_redirected": false,
		"boss_invite_stage": 0,
		"event_dialogues": {},
		"evaluation_attempts": {},
		"event_results": {},
		"minigame_results": {},
		"minigame_pending": {},
		"rounds": {},
		"scores": {"trust": 0, "team": 0, "growth": 0}
	}


func normalize_game_state() -> void:
	if not game.has("revealed"):
		game.revealed = {}
	if not game.has("joined_main_group"):
		game.joined_main_group = false
	if not game.has("groups"):
		game.groups = []
	if not game.has("contacts"):
		game.contacts = ["林总"]
	if not game.has("unread"):
		game.unread = {"林总": 0}
	if not game.has("contact_notices"):
		game.contact_notices = []
	if not game.has("day01_intro_selected"):
		game.day01_intro_selected = false
	if not game.has("day01_redirected"):
		game.day01_redirected = false
	for field in ["event_dialogues", "evaluation_attempts", "event_results", "minigame_results", "minigame_pending", "rounds"]:
		if not game.has(field):
			game[field] = {}


func resolve_saved_event_index() -> int:
	var saved_id := str(game.get("current_event_id", ""))
	if not saved_id.is_empty() and saved_id != "ending":
		for index in range(events.size()):
			if str(events[index].id) == saved_id:
				return index
	if saved_id == "ending":
		return events.size()
	var legacy_ids := ["day-01", "day-03", "day-05", "day-07", "day-10", "day-13", "day-16", "day-20"]
	var legacy_index := clampi(int(game.get("current_index", 0)), 0, legacy_ids.size())
	if legacy_index >= legacy_ids.size():
		return events.size()
	for index in range(events.size()):
		if str(events[index].id) == str(legacy_ids[legacy_index]):
			return index
	return 0


func unlock_contact(contact: String, notice_text: String, notice_id: String) -> void:
	var contacts: Array = game.get("contacts", ["林总"])
	if contacts.has(contact):
		return
	contacts.append(contact)
	game.contacts = contacts
	add_contact_notice(notice_id, notice_text, "friend")


func unlock_group(group: String, notice_text: String, notice_id: String) -> void:
	var groups: Array = game.get("groups", [])
	if groups.has(group):
		return
	groups.append(group)
	game.groups = groups
	add_contact_notice(notice_id, notice_text, "group")


func add_contact_notice(notice_id: String, text: String, kind: String) -> void:
	var notices: Array = game.get("contact_notices", [])
	for notice in notices:
		if str(notice.get("id", "")) == notice_id:
			return
	notices.append({"id": notice_id, "text": text, "kind": kind, "read": false})
	game.contact_notices = notices


func unlock_contacts_for_event(event: Dictionary) -> void:
	match str(event.id):
		"day-05":
			unlock_contact("阿麦", "阿麦添加了你为好友", "friend-a-mai")
			mark_unread("阿麦")
		"day-07":
			unlock_contact("程女士", "林总把程女士的名片发给了你", "friend-cheng")
			unlock_group("客户拜访临时群", "林总邀请你加入「客户拜访临时群」", "group-client-visit")
			mark_unread("程女士")
		"ppt-assembly":
			unlock_contact("周岚", "周岚发来了 PPT 整理任务", "ppt-task-zhou")
			mark_unread("周岚")
		"feedback-rework":
			unlock_contact("周岚", "周岚邀请你一起处理客户反馈", "feedback-zhou")
			mark_unread("周岚")
		"day-13":
			unlock_group("紧急送件行动群", "林总邀请你加入「紧急送件行动群」", "group-delivery")


func get_api_origin() -> String:
	if not OS.has_feature("web"):
		return ""
	var window = JavaScriptBridge.get_interface("window")
	if window == null:
		return ""
	return str(window.location.origin)


func scroll_chat_to_bottom() -> void:
	chat_scroll.scroll_vertical = int(chat_scroll.get_v_scroll_bar().max_value)


func deferred_scroll_chat_to_bottom() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	scroll_chat_to_bottom()


func clear_children(node: Node) -> void:
	for child in node.get_children():
		# 立刻从树上摘掉：queue_free 要等帧末，否则同一帧内重复渲染会让重名节点被 Godot 自动改名。
		node.remove_child(child)
		child.queue_free()


func panel_style(background: Color, radius: int, border: Color = Color.TRANSPARENT, border_width: int = 0) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.corner_radius_top_left = radius
	style.corner_radius_top_right = radius
	style.corner_radius_bottom_left = radius
	style.corner_radius_bottom_right = radius
	style.border_color = border
	style.border_width_left = border_width
	style.border_width_right = border_width
	style.border_width_top = border_width
	style.border_width_bottom = border_width
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 9
	style.content_margin_bottom = 9
	return style


func button_style(background: Color, color: Color, border: Color = Color.TRANSPARENT) -> StyleBoxFlat:
	var style := panel_style(background, 8, border, 1 if border != Color.TRANSPARENT else 0)
	style.content_margin_left = 12
	style.content_margin_right = 12
	return style


func style_readable_button(button: Button) -> void:
	button.custom_minimum_size.y = 44
	button.add_theme_font_size_override("font_size", 18)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_disabled_color", "font_focus_color", "font_hover_pressed_color"]:
		button.add_theme_color_override(state, INK)
	button.add_theme_stylebox_override("normal", button_style(Color("#e5e5e5"), INK, Color("#bdbdbd")))
	button.add_theme_stylebox_override("hover", button_style(Color("#d8d8d8"), INK, Color("#969696")))
	button.add_theme_stylebox_override("pressed", button_style(Color("#c9c9c9"), INK, Color("#777777")))
	button.add_theme_stylebox_override("disabled", button_style(Color("#ededed"), INK, Color("#c7c7c7")))
	button.add_theme_stylebox_override("focus", panel_style(Color.TRANSPARENT, 6, Color("#52738a"), 2))


func flat_style(background: Color, _color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = background
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	style.content_margin_top = 8
	style.content_margin_bottom = 8
	return style
