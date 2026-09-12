/**
 * 订单系统 —— 参考《胡闹厨房》：每张订单是"一家公司 + 这份简历需要做哪几道工序"。
 *
 * 关键规则（按需求确定）：
 *   · **不强制顺序**：玩家想先去哪个工位都行，只要交付时简历上的工序**覆盖**了订单要求就算过
 *   · **随机**：公司、要求都随机，难度随完成数递增（1 道 → 2 道 → 3 道）
 *   · 顶部订单条列出每张订单需要的工序，交对了自动打勾并补新单
 */

export type 工序 = '排版' | '打印' | '盖章';

export const 全部工序: 工序[] = ['排版', '打印', '盖章'];

export interface 工序信息 {
  标签: string;
  说明: string;
  色: string;
  图标: string;
}

export const 工序表: Record<工序, 工序信息> = {
  排版: { 标签: '排版', 说明: '把简历排成目标公司的版式', 色: '#4a8fd4', 图标: 'icon_ticket' },
  打印: { 标签: '打印', 说明: '打印出一份纸质件', 色: '#7cc26b', 图标: 'icon_check' },
  盖章: { 标签: '盖章', 说明: '盖上公司的推荐章', 色: '#e04f3f', 图标: 'icon_stamp' },
};

export interface 订单 {
  id: number;
  公司: string;
  行业: string;
  需要: 工序[];
  /** 交付后给多少分（工序越多越高） */
  分: number;
}

const 公司库: Array<[string, string]> = [
  ['云栖科技', '云计算'],
  ['长风数据', '数据服务'],
  ['鹿鸣文化', '内容平台'],
  ['星野智能', '人工智能'],
  ['青柑传媒', '新媒体'],
  ['远山出行', '交通出行'],
  ['知微教育', '在线教育'],
  ['木石设计', '品牌设计'],
  ['半坡健康', '医疗健康'],
  ['蓝湾金融', '金融科技'],
];

let 订单序号 = 0;

/** 按已完成单数决定难度：前 3 单 1 道工序，之后 2 道，完成 6 单后开始出现 3 道 */
function 按难度取工序(已完成: number): 工序[] {
  const 道数 = 已完成 < 3 ? 1 : 已完成 < 6 ? 2 : Math.random() < 0.35 ? 3 : 2;
  const 池 = [...全部工序];
  const 选: 工序[] = [];
  for (let i = 0; i < 道数 && 池.length > 0; i += 1) {
    const idx = Math.floor(Math.random() * 池.length);
    选.push(池.splice(idx, 1)[0]);
  }
  return 选;
}

export function 生成订单(已完成: number): 订单 {
  订单序号 += 1;
  const [公司, 行业] = 公司库[Math.floor(Math.random() * 公司库.length)];
  const 需要 = 按难度取工序(已完成);
  return { id: 订单序号, 公司, 行业, 需要, 分: 100 + 需要.length * 60 };
}

/** 交付判定：手上的工序集合覆盖订单要求即算完成（不要求同顺序、多做了也算过） */
export function 满足订单(手上: 工序[], 订单: 订单): boolean {
  return 订单.需要.every((g) => 手上.includes(g));
}

/** 三张同时挂出的订单里，找出第一张能被满足的 */
export function 匹配订单(手上: 工序[], 订单列表: 订单[]): 订单 | null {
  return 订单列表.find((o) => 满足订单(手上, o)) ?? null;
}

export function 缺少工序(手上: 工序[], 订单: 订单): 工序[] {
  return 订单.需要.filter((g) => !手上.includes(g));
}
