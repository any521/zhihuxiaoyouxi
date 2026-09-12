extends Control

const EVENTS := preload("res://scripts/event_data.gd")
const DELIVERY_SCENE := preload("res://scenes/DeliveryMinigame.tscn")
const CJK_FONT := preload("res://assets/fonts/NotoSansSC-VF.ttf")
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
var active_delivery: Control
var event_loading: Control
var more_menu: PopupMenu
var message_reveal_running: Dictionary = {}
var hold_skip_active := false
var hold_skip_event := ""


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
	var avatar := rail_button("山", "刘看山")
	avatar.add_theme_stylebox_override("normal", flat_style(Color("#4b7f66"), Color("#ffffff")))
	avatar.add_theme_color_override("font_color", Color("#ffffff"))
	rail_content.add_child(avatar)
	message_mode_button = rail_button("●", "聊天")
	message_mode_button.pressed.connect(set_active_mode.bind("messages"))
	rail_content.add_child(message_mode_button)
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
	search.placeholder_text = "⌕  搜索"
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
	var header_icons := Label.new()
	header_icons.text = "⌁   ☎   ⋯"
	header_icons.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	header_icons.add_theme_font_size_override("font_size", 22)
	header_icons.add_theme_color_override("font_color", Color("#333333"))
	header_icons.custom_minimum_size.x = 130
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
	card.custom_minimum_size = Vector2(350, 142)
	card.set_anchors_and_offsets_preset(Control.PRESET_CENTER, Control.PRESET_MODE_MINSIZE, 175)
	card.add_theme_stylebox_override("panel", panel_style(Color("#ffffff"), 8, Color("#d6d6d6"), 1))
	event_loading.add_child(card)
	var box := VBoxContainer.new()
	box.alignment = BoxContainer.ALIGNMENT_CENTER
	box.add_theme_constant_override("separation", 10)
	card.add_child(box)
	var loading_title := Label.new()
	loading_title.text = "正在进入第 %d 天" % int(event.day)
	loading_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loading_title.add_theme_font_size_override("font_size", 20)
	loading_title.add_theme_color_override("font_color", INK)
	box.add_child(loading_title)
	var loading_subtitle := Label.new()
	loading_subtitle.text = str(event.title).split("·")[1].strip_edges()
	loading_subtitle.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loading_subtitle.add_theme_font_size_override("font_size", 15)
	loading_subtitle.add_theme_color_override("font_color", MUTED)
	box.add_child(loading_subtitle)
	var progress := ProgressBar.new()
	progress.show_percentage = false
	progress.max_value = 100.0
	progress.value = 8.0
	progress.custom_minimum_size = Vector2(290, 10)
	progress.add_theme_stylebox_override("background", panel_style(Color("#e5e5e5"), 5))
	progress.add_theme_stylebox_override("fill", panel_style(Color("#53b66b"), 5))
	box.add_child(progress)
	var tween := create_tween()
	tween.tween_property(progress, "value", 94.0, 0.72).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	await get_tree().create_timer(0.9).timeout
	if is_instance_valid(event_loading):
		event_loading.queue_free()
	event_loading = null
	render_current_view()


func render_current_view() -> void:
	if current_index >= events.size():
		show_ending()
		return
	refresh_navigation()
	clear_children(chat_list)
	clear_children(decision_box)
	var event: Dictionary = events[current_index]
	day_label.text = "实习第 %d / 20 天" % int(event.day)
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
		call_deferred("scroll_chat_to_bottom")
		return

	var is_event_channel: bool = active_tab == str(event.channel)
	title_label.text = tab_title(active_tab)
	subtitle_label.text = "看山创意部 · %s" % ("当前任务进行中" if is_event_channel else "聊天记录")
	if is_event_channel:
		add_system_line("%s" % event.title)
		if str(event.id) != "day-01":
			add_task_card(event)
		var revealed := int(game.revealed.get(event.id, 0))
		for index in range(mini(revealed, event.messages.size())):
			var item = event.messages[index]
			add_message(str(item[0]), str(item[1]), str(item[0]) == "刘看山")
		if revealed < event.messages.size():
			begin_message_reveal(event)
		else:
			add_history_for_channel(event, active_tab)
			if str(event.id) == "day-01":
				render_day_one_group_controls(event)
			else:
				add_dialogue_controls(event)
				if completed_event_ids().has(event.id):
					add_advisor_card(event)
				else:
					request_insights(event.id)
	else:
		add_system_line("这里是 %s 的消息窗口" % active_tab)
		add_empty_state("当前任务正在“%s”进行。这里会保留你和 %s 的消息。" % [event.channel, active_tab])
		add_history_for_channel(event, active_tab)
	call_deferred("scroll_chat_to_bottom")


func render_boss_invitation() -> void:
	title_label.text = "林总"
	subtitle_label.text = "看山创意部 · 你的第一位联系人"
	add_system_line("今天")
	add_message("林总", "刘看山，欢迎加入。入职资料我已经准备好了，先带你进项目群认识大家。", false)
	var invite := Button.new()
	invite.text = "林总邀请你加入群聊\n看山创意部（6）\n\n点击加入"
	invite.alignment = HORIZONTAL_ALIGNMENT_CENTER
	invite.custom_minimum_size = Vector2(280, 118)
	invite.add_theme_font_size_override("font_size", 16)
	invite.add_theme_color_override("font_color", Color("#297c53"))
	invite.add_theme_stylebox_override("normal", panel_style(Color("#ffffff"), 8, Color("#d8e6dc"), 1))
	invite.add_theme_stylebox_override("hover", panel_style(Color("#f5fff8"), 8, Color("#8bcaa1"), 1))
	invite.pressed.connect(accept_group_invitation)
	chat_list.add_child(invite)
	var hint := Label.new()
	hint.text = "点击邀请信息进入群聊"
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.add_theme_font_size_override("font_size", 13)
	hint.add_theme_color_override("font_color", MUTED)
	chat_list.add_child(hint)


func accept_group_invitation() -> void:
	if bool(game.get("joined_main_group", false)):
		return
	game.joined_main_group = true
	game.groups = ["群聊"]
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
	while true:
		var event := EVENTS.get_event_by_id(event_id)
		if event.is_empty():
			break
		var revealed := int(game.revealed.get(event_id, 0))
		if revealed >= event.messages.size():
			break
		await get_tree().create_timer(1.0).timeout
		if current_index >= events.size() or str(events[current_index].id) != event_id:
			break
		game.revealed[event_id] = mini(revealed + 1, event.messages.size())
		save_game()
		if active_tab == str(event.channel):
			render_current_view()
	message_reveal_running[event_id] = false
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
	for historic in game.history:
		if str(historic.get("event_id", "")) != str(event.id):
			continue
		if str(historic.get("channel", event.channel)) != channel:
			continue
		var sender := str(historic.get("sender", ""))
		if sender == "系统":
			add_system_line(str(historic.get("text", "")))
		else:
			add_message(sender, str(historic.get("text", "")), sender == "刘看山")


func render_day_one_group_controls(event: Dictionary) -> void:
	if not bool(game.get("day01_intro_selected", false)):
		add_day_one_actions(event)
		return
	if not bool(game.get("day01_redirected", false)):
		add_group_question_box(event)
		return
	add_system_line("周岚已添加你为好友")
	var to_leader := Button.new()
	to_leader.text = "去和周岚私聊  →"
	to_leader.add_theme_stylebox_override("normal", button_style(WECHAT_GREEN, INK))
	to_leader.pressed.connect(set_active_tab.bind("周岚"))
	decision_box.add_child(to_leader)
	var finish := Button.new()
	finish.text = "结束第一天，查看下一个任务  →"
	finish.add_theme_stylebox_override("normal", button_style(Color("#e5e5e5"), INK))
	finish.pressed.connect(finish_event.bind(event.id))
	decision_box.add_child(finish)


func add_day_one_actions(event: Dictionary) -> void:
	var heading := Label.new()
	heading.text = "轮到刘看山介绍自己了"
	heading.add_theme_font_size_override("font_size", 16)
	heading.add_theme_color_override("font_color", INK)
	decision_box.add_child(heading)
	for action in event.actions:
		var button := Button.new()
		button.text = "  " + str(action.label)
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
	notice.text = "还想追问？在群里发一条消息试试。"
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
	if input.text.strip_edges().is_empty() or bool(game.get("day01_redirected", false)):
		return
	append_history(event.id, "系统", "周岚撤回了刘看山的一条消息", "群聊")
	append_history(event.id, "周岚", "我看到你刚才在群里发的消息了。这里主要做项目同步，有问题私聊我就好。", "周岚")
	game.day01_redirected = true
	unlock_contact("周岚", "周岚添加了你为好友", "friend-zhou-lan")
	mark_unread("周岚")
	save_game()
	render_current_view()


func send_day_one_group_message_from_button(event: Dictionary, input: LineEdit) -> void:
	send_day_one_group_message("", event, input)


func render_day_one_leader_chat(event: Dictionary) -> void:
	title_label.text = "周岚"
	subtitle_label.text = "组长 · 已是好友"
	add_system_line("周岚通过了你的好友申请")
	add_history_for_channel(event, "周岚")
	if not bool(game.get("day01_redirected", false)):
		add_empty_state("先完成林总的入群邀请，再和周岚私聊。")
		return
	add_dialogue_controls(event, false)
	var finish := Button.new()
	finish.text = "结束第一天，查看下一个任务  →"
	finish.add_theme_stylebox_override("normal", button_style(Color("#e5e5e5"), INK))
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
				row.text = "✓  第 %02d 天 · %s" % [int(event_data.day), str(event_data.title).split("·")[1].strip_edges()]
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


func add_dialogue_controls(event: Dictionary, include_actions: bool = true) -> void:
	var asks := int(game.asks.get(event.id, 0))
	var prompt_panel := PanelContainer.new()
	prompt_panel.add_theme_stylebox_override("panel", panel_style(Color("#f8fafc"), 10, Color("#e4eaf0"), 1))
	decision_box.add_child(prompt_panel)
	var prompt_box := VBoxContainer.new()
	prompt_panel.add_child(prompt_box)
	npc_hint = Label.new()
	npc_hint.text = "向 %s 追问（%d / 3）· 只补充信息，不改变结局分数" % [event.npc, asks]
	npc_hint.add_theme_font_size_override("font_size", 14)
	npc_hint.add_theme_color_override("font_color", MUTED)
	prompt_box.add_child(npc_hint)
	var input_row := HBoxContainer.new()
	prompt_box.add_child(input_row)
	npc_input = LineEdit.new()
	npc_input.placeholder_text = "例如：我现在最需要确认什么？"
	npc_input.max_length = 180
	npc_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	npc_input.add_theme_color_override("font_color", INK)
	npc_input.add_theme_color_override("font_placeholder_color", Color("#888888"))
	npc_input.add_theme_stylebox_override("normal", panel_style(Color("#ffffff"), 5, Color("#aaaaaa"), 1))
	npc_input.editable = asks < 3 and npc_http.get_http_client_status() != HTTPClient.STATUS_REQUESTING
	npc_input.text_submitted.connect(send_npc_question.bind(event))
	input_row.add_child(npc_input)
	npc_send = Button.new()
	npc_send.text = "追问"
	npc_send.disabled = asks >= 3
	npc_send.add_theme_color_override("font_color", INK)
	npc_send.add_theme_stylebox_override("normal", button_style(WECHAT_GREEN, INK))
	npc_send.pressed.connect(_ask_from_button.bind(event))
	input_row.add_child(npc_send)

	if not include_actions or completed_event_ids().has(event.id):
		return
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


func choose_action(event: Dictionary, action: Dictionary) -> void:
	if completed_event_ids().has(event.id):
		return
	if str(event.id) == "day-01":
		choose_day_one_intro(event, action)
		return
	append_history(event.id, "刘看山", str(action.label))
	apply_scores(action.scores)
	if bool(event.get("minigame", false)):
		save_game()
		start_delivery(action)
		return
	append_history(event.id, event.npc, str(action.reply))
	finish_event(event.id)


func choose_day_one_intro(event: Dictionary, action: Dictionary) -> void:
	if bool(game.get("day01_intro_selected", false)):
		return
	append_history(event.id, "刘看山", str(action.label), "群聊")
	apply_scores(action.scores)
	append_history(event.id, "周岚", str(action.reply), "群聊")
	game.day01_intro_selected = true
	save_game()
	render_current_view()


func start_delivery(action: Dictionary) -> void:
	active_delivery = DELIVERY_SCENE.instantiate()
	add_child(active_delivery)
	active_delivery.finished.connect(_on_delivery_finished.bind(action))


func _on_delivery_finished(success: bool, action: Dictionary) -> void:
	if is_instance_valid(active_delivery):
		active_delivery.queue_free()
	active_delivery = null
	var event: Dictionary = events[current_index]
	if success:
		apply_scores({"trust": 2, "team": 1, "growth": 2})
		append_history(event.id, "林总", "签约件顺利交到客户手里。林总：稳住了，做得漂亮。")
	else:
		apply_scores({"trust": -1, "team": -1, "growth": 0})
		append_history(event.id, "林总", "客户先走了。林总：复盘一下路线和交接，别让同样的失误再发生。")
	finish_event(event.id)


func finish_event(event_id: String) -> void:
	var done: Array = completed_event_ids()
	if not done.has(event_id):
		done.append(event_id)
		game.completed = done
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
	var asks := int(game.asks.get(event.id, 0))
	if asks >= 3:
		return
	game.asks[event.id] = asks + 1
	append_history(event.id, "刘看山", question, active_tab)
	npc_input.clear()
	save_game()
	var api_origin := get_api_origin()
	if api_origin.is_empty():
		append_history(event.id, event.npc, str(event.fallback), active_tab)
		render_current_view()
		return
	pending_npc_event = str(event.id)
	pending_npc_text = str(event.fallback)
	pending_npc_channel = active_tab
	var recent_history: Array = []
	for item in game.history:
		if str(item.event_id) == str(event.id):
			recent_history.append({"sender": str(item.sender), "text": str(item.text)})
			if recent_history.size() > 6:
				recent_history.pop_front()
	var payload := JSON.stringify({"eventId": event.id, "role": event.npc, "message": question, "history": recent_history})
	var request_error := npc_http.request(api_origin + "/api/npc/reply", ["Content-Type: application/json"], HTTPClient.METHOD_POST, payload)
	if request_error != OK:
		append_history(event.id, event.npc, str(event.fallback), active_tab)
		render_current_view()


func _ask_from_button(event: Dictionary) -> void:
	send_npc_question("", event)


func _on_npc_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var response_text := pending_npc_text
	if result == HTTPRequest.RESULT_SUCCESS and response_code == 200:
		var parsed = JSON.parse_string(body.get_string_from_utf8())
		if typeof(parsed) == TYPE_DICTIONARY and parsed.has("reply") and str(parsed.reply).length() > 0:
			response_text = str(parsed.reply)
	var event := EVENTS.get_event_by_id(pending_npc_event)
	if not event.is_empty():
		append_history(pending_npc_event, str(event.npc), response_text, pending_npc_channel)
		save_game()
		if current_index < events.size() and str(events[current_index].id) == pending_npc_event:
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
	if current_index < events.size() and str(events[current_index].id) == event_id and completed_event_ids().has(event_id):
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
	var card := PanelContainer.new()
	card.add_theme_stylebox_override("panel", panel_style(Color("#f8f5ff"), 10, Color("#e4dbff"), 1))
	chat_list.add_child(card)
	var box := VBoxContainer.new()
	card.add_child(box)
	var title := Label.new()
	title.text = "知乎参谋卡"
	title.add_theme_font_size_override("font_size", 14)
	title.add_theme_color_override("font_color", Color("#6548b9"))
	box.add_child(title)
	var entries: Array = insight_cache.get(event.id, [])
	if entries.is_empty():
		var no_source := Label.new()
		no_source.text = "本地试玩版不展示未经验证的引用。部署后配置官方知乎检索缓存，即会在此展示真实问题、作者和原文链接。\n检索关键词：%s" % event.keyword
		no_source.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		no_source.add_theme_font_size_override("font_size", 12)
		no_source.add_theme_color_override("font_color", MUTED)
		box.add_child(no_source)
		return
	for item in entries:
		var source := LinkButton.new()
		source.text = "%s · %s\n%s" % [str(item.title), str(item.author), str(item.summary)]
		source.tooltip_text = str(item.url)
		source.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		source.add_theme_font_size_override("font_size", 12)
		source.uri = str(item.url)
		box.add_child(source)


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


func add_message(sender: String, content: String, from_me: bool) -> void:
	var row := HBoxContainer.new()
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	chat_list.add_child(row)
	if from_me:
		var left_space := Control.new()
		left_space.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(left_space)
	var avatar := Label.new()
	avatar.text = "刘" if from_me else sender_avatar(sender)
	avatar.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	avatar.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	avatar.custom_minimum_size = Vector2(42, 42)
	avatar.add_theme_font_size_override("font_size", 23)
	row.add_child(avatar)
	var bubble_stack := VBoxContainer.new()
	bubble_stack.custom_minimum_size.x = 210
	bubble_stack.size_flags_horizontal = Control.SIZE_SHRINK_END if from_me else Control.SIZE_SHRINK_BEGIN
	row.add_child(bubble_stack)
	var sender_label := Label.new()
	sender_label.text = "我" if from_me else sender
	sender_label.add_theme_font_size_override("font_size", 13)
	sender_label.add_theme_color_override("font_color", MUTED)
	bubble_stack.add_child(sender_label)
	var bubble := PanelContainer.new()
	bubble.add_theme_stylebox_override("panel", panel_style(ME_BUBBLE if from_me else BUBBLE, 6, Color("#d8d8d8"), 1))
	bubble_stack.add_child(bubble)
	var body := Label.new()
	body.text = content
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.custom_minimum_size.x = 230
	body.add_theme_font_size_override("font_size", 17)
	body.add_theme_color_override("font_color", INK)
	bubble.add_child(body)
	if not from_me:
		var right_space := Control.new()
		right_space.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(right_space)


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
	button.text = glyph
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
	var item := Button.new()
	item.alignment = HORIZONTAL_ALIGNMENT_LEFT
	item.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	item.custom_minimum_size.y = 72
	item.add_theme_font_size_override("font_size", 16)
	item.add_theme_color_override("font_color", INK)
	item.add_theme_color_override("font_hover_color", INK)
	var unread := unread_count(chat)
	var dot := " ●" if unread > 0 else ""
	item.text = "  %s  %s%s\n       %s" % [sender_avatar(chat), display_contact_name(chat), dot, conversation_preview(chat)]
	item.tooltip_text = display_contact_name(chat)
	item.add_theme_stylebox_override("normal", flat_style(Color("#dedede") if chat == active_tab else CONVERSATION_BG, INK))
	item.add_theme_stylebox_override("hover", flat_style(Color("#e7e7e7"), INK))
	item.pressed.connect(set_active_tab.bind(chat))
	conversation_list.add_child(item)


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


func add_contact_item(contact: String, is_group: bool) -> void:
	var item := Button.new()
	item.text = "  %s  %s" % ["群" if is_group else sender_avatar(contact), display_contact_name(contact)]
	item.alignment = HORIZONTAL_ALIGNMENT_LEFT
	item.custom_minimum_size.y = 48
	item.add_theme_font_size_override("font_size", 16)
	item.add_theme_color_override("font_color", INK)
	item.add_theme_color_override("font_hover_color", INK)
	item.add_theme_stylebox_override("normal", flat_style(CONVERSATION_BG, INK))
	item.add_theme_stylebox_override("hover", flat_style(Color("#e7e7e7"), INK))
	item.pressed.connect(set_active_tab.bind(contact))
	conversation_list.add_child(item)


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
		if chat == str(event.channel):
			return str(event.brief)
	for historic in game.get("history", []):
		if str(historic.get("channel", "")) == chat:
			return str(historic.get("text", ""))
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


func append_history(event_id: String, sender: String, content: String, channel: String = "") -> void:
	var history: Array = game.get("history", [])
	if channel.is_empty():
		var event := EVENTS.get_event_by_id(event_id)
		channel = str(event.get("channel", "群聊"))
	history.append({"event_id": event_id, "sender": sender, "text": content, "channel": channel})
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
		current_index = min(int(game.get("current_index", 0)), events.size())
		active_tab = str(game.get("active_tab", "林总"))
	else:
		# The old navigation revealed the group immediately, so it cannot reproduce the new first day.
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))


func save_game() -> void:
	game.version = SAVE_VERSION
	game.current_index = current_index
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


func clear_children(node: Node) -> void:
	for child in node.get_children():
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
