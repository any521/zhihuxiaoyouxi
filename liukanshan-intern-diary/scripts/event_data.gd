class_name InternEventData

## The story is intentionally authored and scored locally. AI can add texture, never alter these routes.
static func get_events() -> Array:
	return [
		{
			"id": "day-01",
			"day": 1,
			"title": "第一天 · 进群自我介绍",
			"channel": "群聊",
			"npc": "周岚",
			"avatar": "🦊",
			"brief": "刚进「看山创意部」群，大家都在等你开口。",
			"keyword": "职场新人 自我介绍 第一印象",
			"messages": [
				["林总", "刘看山已加入群聊。欢迎加入看山创意部，简单介绍一下自己，也说说这三个月想收获什么。"],
				["周岚", "欢迎看山！我是周岚，负责带大家推进项目。第一天不用急着证明自己，先把问题问清、把节奏跟上。"],
				["阿麦", "欢迎欢迎！午饭别一个人吃，十二点我喊你一起去。"],
				["韩策", "资料库和项目排期我都放在群公告了，找不到就 @ 我。"],
				["小鹿", "欢迎新同事！我们最近在做校园方向，有好玩的观察都可以记下来。"]
			],
			"fallback": "第一天最重要的不是回答得多漂亮，而是把问题说具体、把下一步落下来。",
			"actions": [
				{"id": "intro-specific", "label": "说明来处、想学什么，并主动约同事喝咖啡", "reply": "欢迎！下午茶时我带你熟悉项目和资料库。", "scores": {"trust": 1, "team": 2, "growth": 2}},
				{"id": "intro-short", "label": "礼貌地说“请大家多多关照”", "reply": "收到，之后有问题直接在群里问。", "scores": {"trust": 1, "team": 1, "growth": 0}},
				{"id": "intro-silent", "label": "先潜水观察，晚些时候再说", "reply": "林总：第一天就错过回应，不是很好的信号。", "scores": {"trust": -1, "team": -1, "growth": -1}}
			]
		},
		{
			"id": "day-03",
			"day": 3,
			"title": "第三天 · 一句模糊的任务",
			"channel": "林总",
			"npc": "林总",
			"avatar": "🧑‍💼",
			"brief": "老板只发来一句：“下午给我看看年轻人会喜欢的方向。”",
			"keyword": "职场新人 模糊任务 需求澄清",
			"messages": [
				["林总", "下午三点前，给我看看年轻人会喜欢的方向。"],
				["刘看山", "（“年轻人”是什么年龄、什么场景、什么目标？）"]
			],
			"fallback": "好的执行不是猜中老板心思，而是用少量高价值问题把目标对齐。",
			"actions": [
				{"id": "brief-clarify", "label": "先追问目标、受众和交付形式，再给 3 个方向", "reply": "林总：问得对。先以校园社群为核心，给我可比较的三个方案。", "scores": {"trust": 2, "team": 0, "growth": 2}},
				{"id": "brief-prototype", "label": "先做一版，再带着样稿去确认", "reply": "林总：有动作不错，但下次先确认“为什么做”。", "scores": {"trust": 1, "team": 0, "growth": 1}},
				{"id": "brief-guess", "label": "凭感觉定一个方向，闷头做完", "reply": "林总：漂亮不等于解决问题，方向需要先对齐。", "scores": {"trust": -2, "team": 0, "growth": -1}}
			]
		},
		{
			"id": "day-05",
			"day": 5,
			"title": "第五天 · 临时跑腿请求",
			"channel": "阿麦",
			"npc": "阿麦",
			"avatar": "🧋",
			"brief": "阿麦请你现在去取客户样品；而你的初稿 40 分钟后就要交。",
			"keyword": "职场 边界感 同事帮忙 deadline",
			"messages": [
				["阿麦", "救命！客户样品在前台，能不能帮我拿一下？我在和甲方通话。"],
				["系统", "你的“校园观察初稿”将在 40 分钟后截止。"]
			],
			"fallback": "帮助同事不是无限让渡时间；把你的约束说清，并一起找一个可行的解法。",
			"actions": [
				{"id": "errand-negotiate", "label": "说明 deadline，约定先发初稿后一起去取", "reply": "阿麦：太好了，我先让前台留着。谢谢你把时间说清楚。", "scores": {"trust": 1, "team": 2, "growth": 2}},
				{"id": "errand-help", "label": "立刻去取样品，回来后赶工", "reply": "阿麦：太感谢了！下次我会提前说。", "scores": {"trust": 0, "team": 2, "growth": -1}},
				{"id": "errand-refuse", "label": "只回复“不方便”，不解释也不协调", "reply": "阿麦：知道了。下次我们还是提前对齐吧。", "scores": {"trust": 0, "team": -2, "growth": 0}}
			]
		},
		{
			"id": "day-07",
			"day": 7,
			"title": "第七天 · 第一次客户拜访",
			"channel": "林总",
			"npc": "林总",
			"avatar": "🧑‍💼",
			"brief": "客户临时改变了会议主题，资料里没有答案。",
			"keyword": "客户拜访 职场新人 会议记录 向上汇报",
			"messages": [
				["林总", "今天你跟我去客户现场。问题不确定时，别抢着承诺。"],
				["程女士", "你们能不能下周把“校园联名”的风险也讲清？"]
			],
			"fallback": "面对未知，诚实说明边界、记录关键问题、承诺明确的回复时间，是专业而不是示弱。",
			"actions": [
				{"id": "visit-record", "label": "确认客户关切，记录问题，约定明日书面回复", "reply": "林总：这次处理很稳。回去把问题、责任人和时间点写清。", "scores": {"trust": 2, "team": 1, "growth": 2}},
				{"id": "visit-answer", "label": "基于已有资料给一个保守回答", "reply": "林总：可以，但关键数据别在现场猜。", "scores": {"trust": 1, "team": 0, "growth": 1}},
				{"id": "visit-promise", "label": "为了显得专业，承诺下周一定全部解决", "reply": "林总：没有资源和确认就承诺，是给团队埋雷。", "scores": {"trust": -2, "team": -1, "growth": -1}}
			]
		},
		{
			"id": "day-10",
			"day": 10,
			"title": "第十天 · 会议里的不同意见",
			"channel": "群聊",
			"npc": "阿麦",
			"avatar": "🗣️",
			"brief": "团队都倾向一个方案，你发现它忽略了新用户的真实使用场景。",
			"keyword": "职场新人 会议 分歧 提意见",
			"messages": [
				["阿麦", "大家都偏 A 方案，你的用户笔记里有没有不同发现？"],
				["林总", "有不同意见就讲事实，别只讲偏好。"]
			],
			"fallback": "提出反对不是制造对立：带上证据、承认不确定性，并给团队一个能验证的下一步。",
			"actions": [
				{"id": "meeting-evidence", "label": "提出用户观察，建议用小测试验证 A/B 两案", "reply": "林总：很好，保留 A，明天补一个小测试。", "scores": {"trust": 2, "team": 2, "growth": 2}},
				{"id": "meeting-follow", "label": "不反对，私下再和阿麦说担忧", "reply": "阿麦：你的观察很重要，下次可以在会上让大家一起看。", "scores": {"trust": 0, "team": 1, "growth": 0}},
				{"id": "meeting-attack", "label": "直接说“这个方案不行”，但不给依据", "reply": "林总：可以不同意，但请把问题说得能被解决。", "scores": {"trust": -1, "team": -1, "growth": -1}}
			]
		},
		{
			"id": "day-13",
			"day": 13,
			"title": "第十三天 · 紧急送件",
			"channel": "林总",
			"npc": "林总",
			"avatar": "📦",
			"brief": "客户签约件遗漏在公司。距离约定见面只剩 60 秒。",
			"keyword": "职场 突发事件 时间管理 应急",
			"messages": [
				["林总", "刘看山，签约件在你这边？现在送到地铁口，客户还有一分钟到。"],
				["系统", "限时任务已开启：在拥挤的通勤路上保住文件。"]
			],
			"fallback": "紧急任务里，先确认目标物、路线和交接人；越忙越要减少无效动作。",
			"minigame": true,
			"actions": [
				{"id": "delivery-checklist", "label": "检查文件与交接点，立刻出发", "reply": "林总：收到定位。路上注意安全。", "scores": {"trust": 1, "team": 1, "growth": 1}},
				{"id": "delivery-rush", "label": "拿起文件就冲，不做确认", "reply": "林总：先确认你拿的是签约件，别跑错。", "scores": {"trust": 0, "team": 0, "growth": 0}},
				{"id": "delivery-delay", "label": "反复问细节，迟迟不出发", "reply": "林总：信息不足要问，但现在需要你做判断。", "scores": {"trust": -1, "team": -1, "growth": -1}}
			]
		},
		{
			"id": "day-16",
			"day": 16,
			"title": "第十六天 · 功劳与协作",
			"channel": "阿麦",
			"npc": "阿麦",
			"avatar": "🤝",
			"brief": "你和阿麦共同完成的方案被表扬，汇报时却只写了你的名字。",
			"keyword": "职场 团队协作 功劳归属 沟通",
			"messages": [
				["阿麦", "方案被夸了！不过 PPT 封面好像只有你的名字。"],
				["系统", "你记得阿麦负责了访谈和用户反馈整理。"]
			],
			"fallback": "贡献要被看见，也要被准确记录；及时、具体地补全署名，比尴尬地回避更能建立信任。",
			"actions": [
				{"id": "credit-correct", "label": "马上补充阿麦的贡献，并当面感谢她", "reply": "阿麦：谢谢你。下次我们一开始就把分工和署名写下来。", "scores": {"trust": 1, "team": 2, "growth": 2}},
				{"id": "credit-private", "label": "私下解释是疏忽，之后再改", "reply": "阿麦：我知道不是故意的，但公开场合也需要更准确。", "scores": {"trust": 0, "team": 1, "growth": 1}},
				{"id": "credit-ignore", "label": "装作没注意到，继续庆祝成果", "reply": "阿麦：我会记得这件事。", "scores": {"trust": -1, "team": -2, "growth": -1}}
			]
		},
		{
			"id": "day-20",
			"day": 20,
			"title": "第二十天 · 结项答辩",
			"channel": "林总",
			"npc": "林总",
			"avatar": "🎤",
			"brief": "实习最后一天。你要用一次复盘说明：做了什么、学到了什么、下一步想承担什么。",
			"keyword": "实习 结项答辩 复盘 职业成长",
			"messages": [
				["林总", "别只说辛苦。用具体结果、复盘和下一步来讲你的实习。"],
				["阿麦", "把我们一起做的用户测试也写进去呀。"]
			],
			"fallback": "好的复盘既不夸大，也不把成长说成空话：讲清行动、证据、反思与下一个可承担的责任。",
			"actions": [
				{"id": "final-reflect", "label": "用数据复盘成果，感谢协作，并提出下阶段目标", "reply": "林总：你已经能把问题、团队和结果连在一起了。", "scores": {"trust": 2, "team": 2, "growth": 2}},
				{"id": "final-effort", "label": "重点说自己很努力、加班很多", "reply": "林总：努力值得肯定，但我们更要能说清产生了什么价值。", "scores": {"trust": 0, "team": 0, "growth": 1}},
				{"id": "final-blame", "label": "把不顺利归因于任务和同事", "reply": "林总：先学会对自己的选择负责，才谈得上下一步。", "scores": {"trust": -2, "team": -2, "growth": -2}}
			]
		}
	]


static func get_event_by_id(event_id: String) -> Dictionary:
	for event in get_events():
		if event.id == event_id:
			return event
	return {}
