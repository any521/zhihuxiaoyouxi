class_name InternEventData

## Authored goals stay local. AI may improvise dialogue and judge rubric evidence,
## but progression and score mapping remain deterministic.
##
## Message tuple layout: [sender, text, channel, kind, delay, stamp]
##   kind  : "text" | "file" | "system" | "typing"
##   delay : seconds before this line appears (variable pacing, see STORY_BIBLE §4.1)
##   stamp : WeChat style time divider inserted before this line ("" = none)
##
## Fixed actions: {id, label, bubbles, replies, scores}
##   label   : behaviour description (shown above the button)
##   bubbles : first-person messages 刘看山 actually sends (empty array = says nothing)
##   replies : [[sender, text], ...] authored reactions
##
## AI criteria add a "dimension" used only for the per-dimension failure penalty.

static func get_events() -> Array:
	return [
		{
			"id": "day-01", "day": 1, "phase_label": "第一月 · 入职第 1 天",
			"title": "第一印象与沟通入口", "channel": "群聊", "npc": "周岚", "mode": "fixed",
			"brief": "入职第一天。群里已经刷了十几条消息，只有你还没说话。",
			"keyword": "职场新人 自我介绍 第一印象",
			"messages": [
				sys("刘看山已加入群聊", 0.8, "群聊"),
				m("小鹿", "欢迎欢迎！手续办完了吗？我是坐窗户边的小鹿，有什么不懂的随时可以找我。", 1.2, "上午 10:06", "text", "群聊"),
				sticker_line("小鹿", "cat_peek", 0.6, "群聊"),
				m("周岚", "@刘看山 到了就好，可以先看群公告，公司的资料库地址就在里面。", 1.1, "上午 10:07", "text", "群聊"),
				m("阿麦", "欢迎新人，中午记得先不要点外卖，楼下有一家还不错的饭馆。", 1.0, "上午 10:08", "text", "群聊"),
				sticker_line("阿麦", "welcome_wave", 0.5, "群聊"),
				file_line("韩策", "项目排期_v4.xlsx", 1.1, "上午 10:09", "群聊"),
				m("韩策", "@刘看山 先看第 2 页。资料库地址在群公告，找不到 @ 我。", 0.8, "", "text", "群聊"),
				m("小鹿", "你之前接触过校园方向吗？我们手上正好有一个，回头聊～", 1.2, "上午 10:12", "text", "群聊"),
				m("周岚", "@全体成员 下午三点程女士要看初稿，中午之前把各自负责的发我。别卡点，卡点的我都会私聊。", 1.1, "上午 10:14", "text", "群聊"),
				m("阿麦", "收到。", 0.5, "", "text", "群聊"),
				m("韩策", "收到。", 0.4, "", "text", "群聊"),
				m("小鹿", "收到。", 0.4, "", "text", "群聊"),
				m("林总", "@刘看山 你也说一句。", 4.0, "上午 10:16", "text", "群聊")
			],
			"fallback": "说得具体一点：你能做什么、想学什么。这比把经历念一遍有用。",
			"actions": [
				act("intro-specific", "介绍自己并说明来处、为项目贡献一些自己的看法",
					["大家好，我是刘看山。", "之前在校园里做过一些活动的执行，小鹿说的校园方向，我想我可以补充一些学生的视角。"],
					[["小鹿", "那正好，下午找你！"], ["小鹿", "welcome_wave", "sticker"], ["周岚", "好。下午我带你过一遍，看不明白的地方可以直接和我说。"], ["林总", "thumbs_up", "sticker"]],
					{"trust": 1, "team": 2, "growth": 2}),
				act("intro-short", "礼貌地说一句「请大家多多关照」",
					["大家好，我是刘看山，以后请大家多多关照。"],
					[["韩策", "OK"], ["阿麦", "收到。"], ["周岚", "@刘看山 群公告先看一遍，有不懂的记得找我。"]],
					{"trust": 1, "team": 1, "growth": 0}),
				act("intro-silent", "先潜水观察，晚些时候再说", [],
					[["阿麦", "@刘看山 在吗？我下楼了，你要不要一起？"], ["周岚", "可能在办手续。@阿麦 你先去吧。"], ["林总", "@刘看山 第一天就没看到群消息，可不是个好兆头。"]],
					{"trust": -1, "team": -1, "growth": -1})
			]
		},
		{
			"id": "day-03", "day": 3, "phase_label": "第一月 · 第 3 天",
			"title": "一句模糊的任务", "channel": "林总", "npc": "林总", "mode": "fixed",
			"brief": "老板只发来一句：「下午三点前，给我看看年轻人会喜欢的方向。」",
			"keyword": "职场新人 模糊任务 需求澄清",
			"messages": [
				m("林总", "下午三点前，给我看看年轻人会喜欢的方向。", 1.2, "下午 2:21", "text", "林总")
			],
			"fallback": "好的执行不是猜中老板心思，而是用少量高价值问题把目标对齐。",
			"actions": [
				act("brief-clarify", "确认目标、受众和交付形式，再给三个方向",
					["我先确认三件事：「年轻人」大概指哪个年龄段？这次是给您内部看，还是要给客户？",
					 "三点前您要的是三个方向，还是一个能落地的方案？"],
					[["林总", "大一大二。内部看。三个方向，一页一个。"]],
					{"trust": 2, "team": 0, "growth": 2}),
				act("brief-prototype", "先做一份小样，再找林总确认",
					["我先做个小样给您看。"],
					[["林总", "有动作不错。下次先说清楚为什么要做。"]],
					{"trust": 1, "team": 0, "growth": 1}),
				act("brief-guess", "按自己的理解直接完成",
					["我按自己的理解做完了，您看下。"],
					[["林总", "漂亮不等于解决问题。方向要先对齐。"]],
					{"trust": -2, "team": 0, "growth": -1})
			]
		},
		{
			"id": "day-05", "day": 8, "phase_label": "第一月 · 第二周",
			"title": "临时跑腿请求", "channel": "阿麦", "npc": "阿麦", "mode": "fixed",
			"brief": "阿麦请你现在去取客户样品；而你的初稿 40 分钟后就要交。",
			"keyword": "职场 边界感 同事帮忙 deadline",
			"messages": [
				m("阿麦", "救命！客户样品到前台了，能不能帮我拿一下？我在跟甲方通话，走不开。", 1.0, "下午 4:41", "text", "阿麦"),
				m("阿麦", "就一个袋子，很快的！", 0.8, "", "text", "阿麦"),
				sys("你的初稿还有 40 分钟截止。", 1.0, "阿麦")
			],
			"fallback": "帮助同事不是无限让渡时间；把你的约束说清，并一起找一个可行的解法。",
			"actions": [
				act("errand-negotiate", "说明 deadline，协商先交初稿，再共同处理样品",
					["我 17:20 要交初稿，现在下去会来不及。前台能帮我们留到六点吗？",
					 "我先写完这两段，交完就下去。"],
					[["阿麦", "行！！我先给前台打个电话。"],
					 ["阿麦", "谢谢你把时间说清楚，下次我提前问你。"]],
					{"trust": 1, "team": 2, "growth": 2}),
				act("errand-help", "立即帮忙，回来后独自赶工",
					["好，我现在去。"],
					[["阿麦", "太感谢了！下次我提前说。"],
					 ["系统", "17:21 初稿已补交 · 晚了 12 分钟"]],
					{"trust": 0, "team": 2, "growth": -1}),
				act("errand-refuse", "直接拒绝，不说明原因或替代办法",
					["不行，我在忙。"],
					[["阿麦", "知道了。"]],
					{"trust": 0, "team": -2, "growth": 0})
			]
		},
		ai_event("day-07", 15, "第一月 · 第三周", "第一次客户拜访", "程女士", "程女士",
			"会议前，程女士临时要求解释校园联名风险，现有资料没有完整答案。",
			"客户拜访 承诺 信息确认", ["程女士", "林总"],
			[m("程女士", "授权和舆情这两块，你们现有资料能确认到哪一步？", 1.5, "上午 9:52", "text", "程女士")],
			[criterion("clarified_concern", "确认客户真正关心的问题", ["关心", "风险", "具体", "确认", "哪一类", "最怕"], "growth"),
			 criterion("set_boundary", "说明现有信息边界，不编造数据", ["资料", "数据", "目前", "不能确认", "不确定", "编"], "trust"),
			 criterion("confirmed_deadline", "约定明确的补充时间", ["明天", "今天", "时间", "回复", "补充", "几点"], "trust")],
			"面对未知，先确认关切、说明信息边界，再给出明确回复时间。",
			"程女士：那就先这样，我下周再问你们。"),
		ai_event("day-10", 32, "第二月 · 第一周", "会议里的不同意见", "群聊", "林总",
			"团队倾向 A 方案，但你的新用户记录显示它会忽略首次使用者。",
			"会议 分歧 证据 表达", ["林总", "阿麦", "小鹿"],
			[m("林总", "大家目前偏向 A 方案。看山，你刚做完新用户观察，有不同发现就直接说。", 1.5, "上午 10:31", "text", "群聊")],
			[criterion("cited_evidence", "提出具体用户证据", ["用户", "记录", "访谈", "数据", "观察", "新用户"], "growth"),
			 criterion("respected_plan", "承认现有方案的价值", ["同意", "保留", "优点", "认可", "基础", "主线"], "team"),
			 criterion("proposed_test", "提出可验证的下一步", ["测试", "验证", "A/B", "小范围", "试验", "两天"], "growth")],
			"不同意见要带着证据、尊重和可验证的下一步。",
			"林总：行，那先按 A 走。"),
		{
			"id": "ppt-assembly", "day": 40, "phase_label": "第二月 · 第二周",
			"title": "混乱的提案 PPT", "channel": "周岚", "npc": "周岚", "mode": "ppt_minigame",
			"brief": "在多个版本中整理出可以交付的客户提案。", "keyword": "PPT 文件协作 版本管理",
			"messages": [
				m("周岚", "明早九点半汇报，现在有三个「最终版」。", 1.0, "晚上 8:41", "text", "周岚"),
				m("周岚", "韩策的数据、小鹿的稿、阿麦的案例还没合到一起。", 1.2, "", "text", "周岚"),
				m("周岚", "这次交给你。先确认结构和版本，再动文件。", 1.4, "", "text", "周岚")
			],
			"fallback": "先核对版本、结构和署名，才谈得上交付。", "actions": []
		},
		ai_event("feedback-rework", 55, "第二月 · 第四周", "方案被全部打回", "周岚", "周岚",
			"程女士只回复「整体不对，再想想」，团队开始互相猜测原因。",
			"模糊反馈 迭代 优先级", ["周岚", "阿麦"],
			[m("周岚", "程女士只说整体不对。先别全盘返工，我们要把她真正不满意的地方问出来。", 1.5, "晚上 6:22", "text", "周岚")],
			[criterion("split_feedback", "把模糊反馈拆成具体问题", ["具体", "拆分", "哪部分", "问题", "原因", "洞察"], "growth"),
			 criterion("confirm_priority", "向客户确认修改优先级", ["优先", "确认", "最重要", "先改", "排序", "问过"], "trust"),
			 criterion("revision_list", "形成下一版修改清单", ["清单", "负责人", "修改", "下一版", "分工", "明早"], "team")],
			"先拆解反馈、确认优先级，再开始下一轮修改。",
			"周岚：那就先这样吧，明早再说。"),
		{
			"id": "day-13", "day": 64, "phase_label": "第三月 · 第一周",
			"title": "急件冲刺", "channel": "林总", "npc": "林总", "mode": "fixed_minigame",
			"brief": "签约文件遗漏在公司，客户即将离开。先把关键信息确认清楚。",
			"keyword": "突发事件 文件 交接 时间管理", "delivery_minigame": true,
			"messages": [
				m("林总", "签约件落在公司了，客户马上要走。", 1.0, "下午 4:06", "text", "林总"),
				m("林总", "出发前你需要确认什么，先回我。", 1.0, "", "text", "林总")
			],
			"fallback": "越紧急越要确认版本、交接人和时间。",
			"actions": [
				act("rush-confirm-all", "先确认版本、交接人和剩余时间，再出发",
					["我先确认三件事：带哪一版、交给谁、几点前必须到。"],
					[["林总", "v4 盖章版。地铁口 B 口，交给程女士本人。四十分钟。"]],
					{"trust": 2, "team": 1, "growth": 2},
					{"seconds": 90, "extra_files": 0}),
				act("rush-time-only", "只问时间，直接出发",
					["来得及，我现在就跑。"],
					[["林总", "哪一版你确认了吗？"]],
					{"trust": 1, "team": 0, "growth": 0},
					{"seconds": 90, "extra_files": 1}),
				act("rush-call-first", "先给客户打电话解释",
					["我先给程女士打个电话说明一下。"],
					[["林总", "电话打完，件还没出门。"]],
					{"trust": 0, "team": -1, "growth": 0},
					{"seconds": 75, "extra_files": 0})
			]
		},
		ai_event("day-16", 76, "第三月 · 第三周", "功劳与协作", "阿麦", "阿麦",
			"团队成果获得表扬，但汇报材料只写了刘看山的名字。",
			"团队协作 功劳 署名", ["阿麦", "周岚"],
			[m("阿麦", "方案被夸了，不过汇报页上好像只有你的名字。", 1.5, "晚上 7:11", "text", "阿麦")],
			[criterion("public_credit", "公开补全同事贡献", ["公开", "补充", "署名", "贡献", "更正", "群里"], "team"),
			 criterion("explain_action", "向阿麦说明具体处理办法", ["我会", "马上", "修改", "说明", "道歉", "贡献页"], "team"),
			 criterion("future_rule", "建立后续署名规则", ["以后", "规则", "分工", "提前", "共同确认", "对一遍"], "growth")],
			"公开信息出错，就应公开、具体地修正。",
			"阿麦：那……先这样吧。"),
		ai_event("day-20", 90, "第三月 · 最后一天", "结项答辩", "林总", "林总",
			"林总要求总结三个月实习，不接受只讲努力和加班。",
			"实习 答辩 复盘 成长", ["林总"],
			[m("林总", "别只说辛苦。用具体结果、协作、反思和下一步讲清这三个月。", 1.5, "下午 3:01", "text", "林总")],
			[criterion("specific_results", "说明具体成果与证据", ["结果", "数据", "完成", "提升", "反馈", "排期", "签约"], "trust"),
			 criterion("team_credit", "说明协作贡献并感谢团队", ["团队", "阿麦", "周岚", "韩策", "小鹿", "协作", "感谢"], "team"),
			 criterion("reflection_next", "提出反思和下一阶段责任", ["反思", "不足", "下一步", "承担", "改进", "错"], "growth")],
			"复盘要讲清行动、证据、协作、反思与下一步。",
			"林总：先到这。结果我回头给你。")
	]


static func m(sender: String, text: String, delay: float, stamp: String = "", kind: String = "text", channel: String = "") -> Array:
	return [sender, text, channel, kind, delay, stamp]


static func sys(text: String, delay: float, channel: String) -> Array:
	return ["系统", text, channel, "system", delay, ""]


static func typing(sender: String, delay: float, channel: String) -> Array:
	return [sender, "", channel, "typing", delay, ""]


static func file_line(sender: String, file_name: String, delay: float, stamp: String, channel: String) -> Array:
	return [sender, file_name, channel, "file", delay, stamp]


static func sticker_line(sender: String, sticker_id: String, delay: float, channel: String, stamp: String = "") -> Array:
	return [sender, sticker_id, channel, "sticker", delay, stamp]


static func act(id: String, label: String, bubbles: Array, replies: Array, scores: Dictionary, minigame: Dictionary = {}) -> Dictionary:
	return {"id": id, "label": label, "bubbles": bubbles, "replies": replies, "scores": scores, "minigame": minigame}


static func criterion(id: String, label: String, keywords: Array, dimension: String) -> Dictionary:
	return {"id": id, "label": label, "keywords": keywords, "dimension": dimension}


static func ai_event(id: String, day: int, phase: String, title: String, channel: String, npc: String, brief: String, keyword: String, participants: Array, messages: Array, criteria: Array, fallback: String, fail_text: String) -> Dictionary:
	return {"id": id, "day": day, "phase_label": phase, "title": title, "channel": channel, "npc": npc, "mode": "ai",
		"brief": brief, "keyword": keyword, "participants": participants, "criteria": criteria, "fallback": fallback,
		"fail_text": fail_text, "messages": messages, "actions": []}


static func get_event_by_id(event_id: String) -> Dictionary:
	for event in get_events():
		if event.id == event_id:
			return event
	return {}
