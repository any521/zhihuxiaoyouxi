import type { StoryEvent, ZhihuInsight } from "./types";

// No fabricated citations: this starts empty and is only populated by the curation script
// after a human verifies returned Zhihu results.
export const curatedInsights: Record<string, ZhihuInsight[]> = {};

export const storyEvents: StoryEvent[] = [
  {
    id: "day-01", day: 1, title: "第一天 · 进群自我介绍", channel: "群聊", npc: "阿麦",
    brief: "刚进看山创意部群，大家都在等你开口。", keyword: "职场新人 自我介绍 第一印象",
    fallbackReply: "先把你能为团队解决什么说清楚，比把经历念一遍更有用。",
    actions: [
      { id: "intro-specific", label: "说明来处、想学什么，并主动约同事喝咖啡", scores: { trust: 1, team: 2, growth: 2 } },
      { id: "intro-short", label: "礼貌地说“请大家多多关照”", scores: { trust: 1, team: 1, growth: 0 } },
      { id: "intro-silent", label: "先潜水观察，晚些时候再说", scores: { trust: -1, team: -1, growth: -1 } }
    ]
  },
  {
    id: "day-03", day: 3, title: "第三天 · 一句模糊的任务", channel: "林总", npc: "林总",
    brief: "老板只发来一句：下午给我看看年轻人会喜欢的方向。", keyword: "职场新人 模糊任务 需求澄清",
    fallbackReply: "好的执行不是猜中老板心思，而是用少量高价值问题把目标对齐。",
    actions: [
      { id: "brief-clarify", label: "先追问目标、受众和交付形式，再给三个方向", scores: { trust: 2, team: 0, growth: 2 } },
      { id: "brief-prototype", label: "先做一版，再带着样稿去确认", scores: { trust: 1, team: 0, growth: 1 } },
      { id: "brief-guess", label: "凭感觉定一个方向，闷头做完", scores: { trust: -2, team: 0, growth: -1 } }
    ]
  },
  {
    id: "day-05", day: 5, title: "第五天 · 临时跑腿请求", channel: "阿麦", npc: "阿麦",
    brief: "阿麦请你现在去取客户样品；而你的初稿40分钟后就要交。", keyword: "职场 边界感 同事帮忙 deadline",
    fallbackReply: "帮助同事不是无限让渡时间；把你的约束说清，并一起找一个可行的解法。",
    actions: [
      { id: "errand-negotiate", label: "说明deadline，约定先发初稿后一起去取", scores: { trust: 1, team: 2, growth: 2 } },
      { id: "errand-help", label: "立刻去取样品，回来后赶工", scores: { trust: 0, team: 2, growth: -1 } },
      { id: "errand-refuse", label: "只回复不方便，不解释也不协调", scores: { trust: 0, team: -2, growth: 0 } }
    ]
  },
  {
    id: "day-07", day: 7, title: "第七天 · 第一次客户拜访", channel: "林总", npc: "林总",
    brief: "客户临时改变了会议主题，资料里没有答案。", keyword: "客户拜访 职场新人 会议记录 向上汇报",
    fallbackReply: "面对未知，诚实说明边界、记录关键问题、承诺明确的回复时间，是专业而不是示弱。",
    actions: [
      { id: "visit-record", label: "确认客户关切，记录问题，约定明日书面回复", scores: { trust: 2, team: 1, growth: 2 } },
      { id: "visit-answer", label: "基于已有资料给一个保守回答", scores: { trust: 1, team: 0, growth: 1 } },
      { id: "visit-promise", label: "为了显得专业，承诺下周一定全部解决", scores: { trust: -2, team: -1, growth: -1 } }
    ]
  },
  {
    id: "day-10", day: 10, title: "第十天 · 会议里的不同意见", channel: "群聊", npc: "阿麦",
    brief: "团队都倾向一个方案，你发现它忽略了新用户的真实使用场景。", keyword: "职场新人 会议 分歧 提意见",
    fallbackReply: "提出反对不是制造对立：带上证据、承认不确定性，并给团队一个能验证的下一步。",
    actions: [
      { id: "meeting-evidence", label: "提出用户观察，建议用小测试验证A/B两案", scores: { trust: 2, team: 2, growth: 2 } },
      { id: "meeting-follow", label: "不反对，私下再和阿麦说担忧", scores: { trust: 0, team: 1, growth: 0 } },
      { id: "meeting-attack", label: "直接说方案不行，但不给依据", scores: { trust: -1, team: -1, growth: -1 } }
    ]
  },
  {
    id: "day-13", day: 13, title: "第十三天 · 紧急送件", channel: "林总", npc: "林总",
    brief: "客户签约件遗漏在公司。距离约定见面只剩60秒。", keyword: "职场 突发事件 时间管理 应急",
    fallbackReply: "紧急任务里，先确认目标物、路线和交接人；越忙越要减少无效动作。", isMinigame: true,
    actions: [
      { id: "delivery-checklist", label: "检查文件与交接点，立刻出发", scores: { trust: 1, team: 1, growth: 1 } },
      { id: "delivery-rush", label: "拿起文件就冲，不做确认", scores: { trust: 0, team: 0, growth: 0 } },
      { id: "delivery-delay", label: "反复问细节，迟迟不出发", scores: { trust: -1, team: -1, growth: -1 } }
    ]
  },
  {
    id: "day-16", day: 16, title: "第十六天 · 功劳与协作", channel: "阿麦", npc: "阿麦",
    brief: "你和阿麦共同完成的方案被表扬，汇报时却只写了你的名字。", keyword: "职场 团队协作 功劳归属 沟通",
    fallbackReply: "贡献要被看见，也要被准确记录；及时、具体地补全署名，比尴尬地回避更能建立信任。",
    actions: [
      { id: "credit-correct", label: "马上补充阿麦的贡献，并当面感谢她", scores: { trust: 1, team: 2, growth: 2 } },
      { id: "credit-private", label: "私下解释是疏忽，之后再改", scores: { trust: 0, team: 1, growth: 1 } },
      { id: "credit-ignore", label: "装作没注意到，继续庆祝成果", scores: { trust: -1, team: -2, growth: -1 } }
    ]
  },
  {
    id: "day-20", day: 20, title: "第二十天 · 结项答辩", channel: "林总", npc: "林总",
    brief: "实习最后一天。用一次复盘说明：做了什么、学到了什么、下一步想承担什么。", keyword: "实习 结项答辩 复盘 职业成长",
    fallbackReply: "好的复盘既不夸大，也不把成长说成空话：讲清行动、证据、反思与下一个可承担的责任。",
    actions: [
      { id: "final-reflect", label: "用数据复盘成果，感谢协作，并提出下阶段目标", scores: { trust: 2, team: 2, growth: 2 } },
      { id: "final-effort", label: "重点说自己很努力、加班很多", scores: { trust: 0, team: 0, growth: 1 } },
      { id: "final-blame", label: "把不顺利归因于任务和同事", scores: { trust: -2, team: -2, growth: -2 } }
    ]
  }
];

export function getStoryEvent(id: string): StoryEvent | undefined {
  return storyEvents.find((event) => event.id === id);
}
