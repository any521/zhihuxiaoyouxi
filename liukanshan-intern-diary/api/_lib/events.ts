import type { EventCriterion, ScoreDelta, StoryAction, StoryEvent, ZhihuInsight } from "./types";

export const curatedInsights: Record<string, ZhihuInsight[]> = {};

/** 跑团式 AI 事件：每轮 1–2 条气泡，15 轮内未完成即判定失败。 */
export const AI_ROUND_LIMIT = 15;

const criterion = (
  id: string, label: string, keywords: string[], dimension: "trust" | "team" | "growth"
): EventCriterion => ({ id, label, keywords, dimension });

const action = (
  id: string, label: string, bubbles: string[], replies: [string, string][], scores: ScoreDelta
): StoryAction => ({ id, label, bubbles, replies, scores });

const aiEvent = (
  id: string, day: number, phaseLabel: string, title: string, channel: string, npc: string,
  brief: string, keyword: string, participants: string[], criteria: EventCriterion[],
  fallbackReply: string, failText: string
): StoryEvent => ({
  id, day, phaseLabel, title, channel, npc, mode: "ai", participants, brief, keyword,
  criteria, fallbackReply, failText, roundLimit: AI_ROUND_LIMIT
});

export const storyEvents: StoryEvent[] = [
  {
    id: "day-01", day: 1, phaseLabel: "第一月 · 入职第 1 天", title: "初入看山创意部", channel: "群聊", npc: "周岚", mode: "fixed",
    participants: ["林总", "周岚", "阿麦", "韩策", "小鹿"],
    brief: "入职第一天。群里已经刷了十几条消息，只有你还没说话。",
    keyword: "职场新人 自我介绍 第一印象",
    fallbackReply: "说得具体一点：你能做什么、想学什么。这比把经历念一遍有用。",
    actions: [
      action("intro-specific", "说明来处、想学什么，并主动约同事喝咖啡",
        ["大家好，我是刘看山。之前做过一点校园活动的执行，主要想学怎么把想法落到能交付的东西上。",
          "查资料、跑腿的活都可以丢给我。下午谁有空，我请咖啡。"],
        [["阿麦", "咖啡可以！楼下那家我熟，不踩雷。"],
          ["周岚", "好。下午我带你过一遍资料库，你把看不明白的地方记下来。"],
          ["小鹿", "那我先把校园那个题的背景发你。"],
          ["林总", "行。"]],
        { trust: 1, team: 2, growth: 2 }),
      action("intro-short", "礼貌地说「请大家多多关照」",
        ["大家好，我是刘看山，以后请大家多多关照。"],
        [["韩策", "收到。"],
          ["阿麦", "就这？哈哈"],
          ["周岚", "@阿麦 别催。@刘看山 群公告先看一遍，下午有事我喊你。"]],
        { trust: 1, team: 1, growth: 0 }),
      action("intro-silent", "先潜水观察，晚些时候再说", [],
        [["阿麦", "@刘看山 在吗？我下楼了。"],
          ["周岚", "可能在办手续。@阿麦 你先去吧。"],
          ["林总", "@刘看山 一句话就行，不用写小作文。"]],
        { trust: -1, team: -1, growth: -1 })
    ]
  },
  {
    id: "day-03", day: 3, phaseLabel: "第一月 · 第 3 天", title: "一句模糊的任务", channel: "林总", npc: "林总", mode: "fixed",
    participants: ["林总"],
    brief: "老板只发来一句：「下午三点前，给我看看年轻人会喜欢的方向。」",
    keyword: "职场新人 模糊任务 需求澄清",
    fallbackReply: "好的执行不是猜中老板心思，而是用少量高价值问题把目标对齐。",
    actions: [
      action("brief-clarify", "确认目标、受众和交付形式，再给三个方向",
        ["我先确认三件事：「年轻人」大概指哪个年龄段？这次是给您内部看，还是要给客户？",
          "三点前您要的是三个方向，还是一个能落地的方案？"],
        [["林总", "大一大二。内部看。三个方向，一页一个。"]],
        { trust: 2, team: 0, growth: 2 }),
      action("brief-prototype", "先做一份小样，再找林总确认",
        ["我先做个小样给您看。"],
        [["林总", "有动作不错。下次先说清楚为什么要做。"]],
        { trust: 1, team: 0, growth: 1 }),
      action("brief-guess", "按自己的理解直接完成",
        ["我按自己的理解做完了，您看下。"],
        [["林总", "漂亮不等于解决问题。方向要先对齐。"]],
        { trust: -2, team: 0, growth: -1 })
    ]
  },
  {
    id: "day-05", day: 8, phaseLabel: "第一月 · 第二周", title: "临时跑腿请求", channel: "阿麦", npc: "阿麦", mode: "fixed",
    participants: ["阿麦"],
    brief: "阿麦请你现在去取客户样品；而你的初稿 40 分钟后就要交。",
    keyword: "职场 边界感 同事帮忙 deadline",
    fallbackReply: "帮助同事不是无限让渡时间；把你的约束说清，并一起找一个可行的解法。",
    actions: [
      action("errand-negotiate", "说明 deadline，协商先交初稿，再共同处理样品",
        ["我 17:20 要交初稿，现在下去会来不及。前台能帮我们留到六点吗？",
          "我先写完这两段，交完就下去。"],
        [["阿麦", "行！！我先给前台打个电话。"],
          ["阿麦", "谢谢你把时间说清楚，下次我提前问你。"]],
        { trust: 1, team: 2, growth: 2 }),
      action("errand-help", "立即帮忙，回来后独自赶工",
        ["好，我现在去。"],
        [["阿麦", "太感谢了！下次我提前说。"],
          ["系统", "17:21 初稿已补交 · 晚了 12 分钟"]],
        { trust: 0, team: 2, growth: -1 }),
      action("errand-refuse", "直接拒绝，不说明原因或替代办法",
        ["不行，我在忙。"],
        [["阿麦", "知道了。"]],
        { trust: 0, team: -2, growth: 0 })
    ]
  },
  aiEvent("day-07", 15, "第一月 · 第三周", "第一次客户拜访", "程女士", "程女士",
    "会议前，程女士临时要求解释校园联名风险，现有资料没有完整答案。",
    "客户拜访 承诺 信息确认", ["程女士", "林总"],
    [criterion("clarified_concern", "确认客户真正关心的问题", ["关心", "风险", "具体", "确认", "哪一类", "最怕"], "growth"),
      criterion("set_boundary", "说明现有信息边界，不编造数据", ["资料", "数据", "目前", "不能确认", "不确定", "编"], "trust"),
      criterion("confirmed_deadline", "约定明确的补充时间", ["明天", "今天", "时间", "回复", "补充", "几点"], "trust")],
    "面对未知，先确认关切、说明信息边界，再给出明确回复时间。",
    "程女士：那就先这样，我下周再问你们。"),
  aiEvent("day-10", 32, "第二月 · 第一周", "会议里的不同意见", "群聊", "林总",
    "团队倾向 A 方案，但你的新用户记录显示它会忽略首次使用者。",
    "会议 分歧 证据 表达", ["林总", "阿麦", "小鹿"],
    [criterion("cited_evidence", "提出具体用户证据", ["用户", "记录", "访谈", "数据", "观察", "新用户"], "growth"),
      criterion("respected_plan", "承认现有方案的价值", ["同意", "保留", "优点", "认可", "基础", "主线"], "team"),
      criterion("proposed_test", "提出可验证的下一步", ["测试", "验证", "A/B", "小范围", "试验", "两天"], "growth")],
    "不同意见要带着证据、尊重和可验证的下一步。",
    "林总：行，那先按 A 走。"),
  {
    id: "ppt-assembly", day: 40, phaseLabel: "第二月 · 第二周", title: "混乱的提案 PPT", channel: "周岚", npc: "周岚", mode: "ppt_minigame",
    participants: ["周岚", "韩策", "小鹿", "阿麦"],
    brief: "在多个版本中整理出可以交付的客户提案。",
    keyword: "PPT 文件协作 版本管理",
    fallbackReply: "先核对版本、结构和署名，才谈得上交付。",
    actions: []
  },
  aiEvent("feedback-rework", 55, "第二月 · 第四周", "方案被全部打回", "周岚", "周岚",
    "程女士只回复「整体不对，再想想」，团队开始互相猜测原因。",
    "模糊反馈 迭代 优先级", ["周岚", "阿麦"],
    [criterion("split_feedback", "把模糊反馈拆成具体问题", ["具体", "拆分", "哪部分", "问题", "原因", "洞察"], "growth"),
      criterion("confirm_priority", "向客户确认修改优先级", ["优先", "确认", "最重要", "先改", "排序", "问过"], "trust"),
      criterion("revision_list", "形成下一版修改清单", ["清单", "负责人", "修改", "下一版", "分工", "明早"], "team")],
    "先拆解反馈、确认优先级，再开始下一轮修改。",
    "周岚：那就先这样吧，明早再说。"),
  {
    id: "day-13", day: 64, phaseLabel: "第三月 · 第一周", title: "急件冲刺", channel: "林总", npc: "林总", mode: "fixed_minigame",
    participants: ["林总", "程女士"],
    brief: "签约文件遗漏在公司，客户即将离开。先把关键信息确认清楚。",
    keyword: "突发事件 文件 交接 时间管理",
    fallbackReply: "越紧急越要确认版本、交接人和时间。",
    deliveryMinigame: true,
    actions: [
      action("rush-confirm-all", "先确认版本、交接人和剩余时间，再出发",
        ["我先确认三件事：带哪一版、交给谁、几点前必须到。"],
        [["林总", "v4 盖章版。地铁口 B 口，交给程女士本人。四十分钟。"]],
        { trust: 2, team: 1, growth: 2 }),
      action("rush-time-only", "只问时间，直接出发",
        ["来得及，我现在就跑。"],
        [["林总", "哪一版你确认了吗？"]],
        { trust: 1, team: 0, growth: 0 }),
      action("rush-call-first", "先给客户打电话解释",
        ["我先给程女士打个电话说明一下。"],
        [["林总", "电话打完，件还没出门。"]],
        { trust: 0, team: -1, growth: 0 })
    ]
  },
  aiEvent("day-16", 76, "第三月 · 第三周", "功劳与协作", "阿麦", "阿麦",
    "团队成果获得表扬，但汇报材料只写了刘看山的名字。",
    "团队协作 功劳 署名", ["阿麦", "周岚"],
    [criterion("public_credit", "公开补全同事贡献", ["公开", "补充", "署名", "贡献", "更正", "群里"], "team"),
      criterion("explain_action", "向阿麦说明具体处理办法", ["我会", "马上", "修改", "说明", "道歉", "贡献页"], "team"),
      criterion("future_rule", "建立后续署名规则", ["以后", "规则", "分工", "提前", "共同确认", "对一遍"], "growth")],
    "公开信息出错，就应公开、具体地修正。",
    "阿麦：那……先这样吧。"),
  aiEvent("day-20", 90, "第三月 · 最后一天", "结项答辩", "林总", "林总",
    "林总要求总结三个月实习，不接受只讲努力和加班。",
    "实习 答辩 复盘 成长", ["林总"],
    [criterion("specific_results", "说明具体成果与证据", ["结果", "数据", "完成", "提升", "反馈", "排期", "签约"], "trust"),
      criterion("team_credit", "说明协作贡献并感谢团队", ["团队", "阿麦", "周岚", "韩策", "小鹿", "协作", "感谢"], "team"),
      criterion("reflection_next", "提出反思和下一阶段责任", ["反思", "不足", "下一步", "承担", "改进", "错"], "growth")],
    "复盘要讲清行动、证据、协作、反思与下一步。",
    "林总：先到这。结果我回头给你。")
];

export function getStoryEvent(id: string): StoryEvent | undefined {
  return storyEvents.find((event) => event.id === id);
}
