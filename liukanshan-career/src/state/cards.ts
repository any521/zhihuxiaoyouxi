/** 技能卡：第一章的卡池与开局赠送。这张表将来由章节 JSON 提供。 */

export type CardType = '提问' | '举证' | '共情' | '拒绝' | '复盘' | '幽默';
export type CardRarity = '普通' | '熟练' | '精通';

export interface SkillCard {
  id: string;
  name: string;
  type: CardType;
  rarity: CardRarity;
  /** 在抉择里插入这张卡会发生什么 */
  effect: string;
  /** 一句话风味文案 */
  flavor: string;
}

/** 开局赠送：一次就教会玩家「卡是干嘛的」 */
export const STARTER_CARD: SkillCard = {
  id: 'ask-first',
  name: '不懂就问',
  type: '提问',
  rarity: '普通',
  effect: '把一句模糊的任务追问成具体的目标、受众与交付形式，并让下一关的订单要求直接可见。',
  flavor: '猜中老板的心思很难，问清楚却只要三句话。',
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
  },
  {
    id: 'boundary-line',
    name: '先说我这边的时间',
    type: '拒绝',
    rarity: '熟练',
    effect: '在不损失团队评价的前提下拒绝一次临时加派，并附赠一条可行替代方案。',
    flavor: '帮助同事不是无限让渡时间。',
  },
  {
    id: 'sit-in-front',
    name: '坐在最前面',
    type: '复盘',
    rarity: '普通',
    effect: '复盘类抉择可额外指认一个具体错误动作，成长评价 +2。',
    flavor: '把「我学到了很多」换成「我下次会先确认这三件事」。',
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
