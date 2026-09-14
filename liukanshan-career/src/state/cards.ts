/** 技能卡：第一章的卡池与开局赠送。这张表将来由章节 JSON 提供。 */

export type CardType = '提问' | '举证' | '共情' | '拒绝' | '复盘' | '幽默';
export type CardRarity = '普通' | '熟练' | '精通';

/** 技能卡在**工作关**里的效果（用户要求"把技能卡这个设定和功能重新拿过来，使其合理并且有趣"）*/
export type 关卡效果 = '立刻完工' | '加时间' | '帮手加速' | '解锁交稿箱';

export interface 关卡用法 {
  效果: 关卡效果;
  /** 数值（现在只有"加时间"用得到，单位秒）*/
  数值?: number;
  /** 卡面上那一行短说明 */
  短: string;
}

export interface SkillCard {
  id: string;
  name: string;
  type: CardType;
  rarity: CardRarity;
  /** 在抉择里插入这张卡会发生什么 */
  effect: string;
  /** 一句话风味文案 */
  flavor: string;
  /**
   * **在这一关里按 1/2/3 用掉**会怎样。
   *
   * ⚠️ 卡不是凭空冒出来的道具，每一张都对应剧情里**已经学过的一课**：
   *    · 不懂就问 ← 事件二「把模糊任务问成具体目标」
   *    · 带着笔记去汇报 ← 事件三「让话有据可依」
   *    · 先说我这边的时间 ← 事件三「同事关系与边界感」
   *    · 坐在最前面 ← 事件四复盘
   *    所以在小游戏里用卡，等于"把学过的东西用出来"，不是外挂。
   */
  关卡?: 关卡用法;
}

/** 开局赠送：一次就教会玩家「卡是干嘛的」 */
export const STARTER_CARD: SkillCard = {
  id: 'ask-first',
  name: '不懂就问',
  type: '提问',
  rarity: '普通',
  effect: '把一句模糊的任务追问成具体的目标、受众与交付形式，并让下一关的订单要求直接可见。',
  flavor: '猜中老板的心思很难，问清楚却只要三句话。',
  关卡: { 效果: '立刻完工', 短: '当前这台机器立刻做完' },
};

/** 掉落池：按关卡评级发放，只有首次评级生效（防刷） */
export const DROP_POOL: SkillCard[] = [
  {
    id: 'note-in-hand',
    name: '带着笔记去汇报',
    type: '举证',
    rarity: '普通',
    effect: '让一个「陈述」类选项带上现场证据，专业评价翻倍。',
    flavor: '「我记得」和「我记下来了」之间，隔着一整个可信度。',
    关卡: { 效果: '加时间', 数值: 15, 短: '+15 秒' },
  },
  {
    id: 'boundary-line',
    name: '先说我这边的时间',
    type: '拒绝',
    rarity: '熟练',
    effect: '在不损失团队评价的前提下拒绝一次临时加派，并附赠一条可行替代方案。',
    flavor: '帮助同事不是无限让渡时间。',
    关卡: { 效果: '解锁交稿箱', 短: '交稿箱不再被暂停' },
  },
  {
    id: 'sit-in-front',
    name: '坐在最前面',
    type: '复盘',
    rarity: '普通',
    effect: '复盘类抉择可额外指认一个具体错误动作，成长评价 +2。',
    flavor: '把「我学到了很多」换成「我下次会先确认这三件事」。',
    关卡: { 效果: '帮手加速', 短: '20 秒内他做得飞快' },
  },
];

export interface DropResult {
  card: SkillCard;
  upgraded: boolean;
}

/** 评级 → 掉落。S 额外给一张，且提示升级。 */
export function rollDrop(rating: 'S' | 'A' | 'B' | 'C', delivered: number): DropResult | null {
  if (rating === 'C') return null;
  const index = rating === 'S' ? 1 : rating === 'A' ? 0 : 2;
  const card = DROP_POOL[index % DROP_POOL.length];
  return { card, upgraded: rating === 'S' && delivered >= 8 };
}

export const RATING_RULE = '目标 8 份：≥8 份 S · 7 份 A · 6 份 B · 其余 C';

/* ───────── 工作关里的发卡节奏 ───────── */

/** 手上最多攒几张（再多就挡住画面了） */
export const 最多持卡 = 3;
/** 每交几版稿子发一张（发卡要让玩家真的用得上，不能打完才给） */
export const 每几版发一张 = 2;

/**
 * 发下一张卡。**先发还没拿到的**，都拿过了就按交稿数循环。
 * ⚠️ 起始的 `STARTER_CARD` 不在池子里（它一进关就在手上），所以这里从 DROP_POOL 取。
 */
export function 下一张卡(已有: SkillCard[], 已交: number): SkillCard {
  const 没有的 = DROP_POOL.filter((c) => !已有.some((h) => h.id === c.id));
  if (没有的.length) return 没有的[0];
  return DROP_POOL[已交 % DROP_POOL.length];
}
