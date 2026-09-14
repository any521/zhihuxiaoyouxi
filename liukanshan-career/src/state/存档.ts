/**
 * **进度存档**（浏览器 localStorage）。
 *
 * ⚠️ 用户要求：「将游戏进度缓存到浏览器缓存里，使其**不删缓存就能保存进度**」。
 *    用 `localStorage`（不是 `sessionStorage`）——关掉浏览器还在，只有"清空站点数据"才会没。
 *
 * ## 存什么 / 不存什么
 *
 * ✅ **存**（这才是"进度"）：
 *    · `段号` + `位置`（下一拍播到哪儿）
 *    · `会话们`（聊天记录 —— 这是这个游戏的主体）
 *    · `指标`（信任/协作/成长）、`卡牌`（技能卡）、在看哪个会话
 * ❌ **不存**：
 *    · `队列`（能从 `段号` 用剧本重新算出来 —— 存了反而容易和剧本对不上）
 *    · 各种"等玩家操作"的临时标记（待选择/待去房间/待开小游戏…）——
 *      它们本来就写在第 `位置` 那一拍上，**重播那一拍会自己重新设上**；
 *      存下来反而可能读到一个"半等待"的怪状态
 *    · 小游戏那一局的中间状态（一局几分钟，重进不用恢复）
 *
 * ⚠️ `存档版本`：剧本结构或字段变了就 +1，旧存档会被**整份丢弃** ——
 *    宁可让玩家重来一段，也不要读出一个对不上的进度（读半个状态的 bug 最难查）。
 */
import type { 指标 } from '../story/types';
import type { SkillCard } from './cards';
import type { 订单, 工序 } from './orders';
import type { CarryKind } from './store';

export const 存档键 = 'lks-save';
/** ⚠️ 剧本/字段结构一变就 +1 */
export const 存档版本 = 1;

export interface 存档数据 {
  版本: number;
  时间: number;
  段号: number;
  位置: number;
  会话们: unknown[];
  活跃会话: string;
  查看会话: string;
  指标: 指标;
  卡牌: SkillCard[];
  /**
   * **"等玩家操作"的状态**（选择 / 邀请 / 暂停 / 去房间 / 开小游戏 / 跑团）。
   *
   * ⚠️⚠️ 我第一版**故意没存**它们，理由是"它们写在第 N 拍上，重播那一拍会自己重新设上"。
   *    这个理由**是错的**：选选项那一拍的进度**已经前进了**，
   *    重进时待选择丢了、选择也不会再弹 —— **剧情就卡死在那儿**
   *    （用户报的"选选项时中途退出，再进入时卡剧情、选项消失"）。
   *    所以这一类状态**必须存**。
   * ⚠️ 类型写 unknown，恢复时在 store 里断言 —— 免得 存档.ts 和 story.ts 互相 import 成环。
   */
  待选择: unknown;
  /** 等玩家在聊天框里说一句话（文档第 7 条）—— 和待选择同一类，必须存 */
  待玩家发言: unknown;
  /** 这辈子坐过工位了吗（第一次坐下要放过场动画，只放一次） */
  坐过?: boolean;
  待接受邀请: unknown;
  待暂停: unknown;
  待去房间: unknown;
  待开小游戏: unknown;
  跑团局: unknown;
  /** 「去房间」时指引线指向哪个交互点 */
  地图目标: unknown;
}

/** 写存档。⚠️ 隐私模式/配额满会抛异常 —— **存不上不能把游戏搞崩** */
export function 写存档(数据: Omit<存档数据, '版本' | '时间'>): void {
  try {
    window.localStorage.setItem(
      存档键,
      JSON.stringify({ ...数据, 版本: 存档版本, 时间: Date.now() }),
    );
  } catch {
    /* 忽略：存不上就存不上 */
  }
}

/** 读存档。版本对不上 / 内容不像样 / 解析失败 → 一律当"没有存档" */
export function 读存档(): 存档数据 | null {
  try {
    const 文 = window.localStorage.getItem(存档键);
    if (!文) return null;
    const 数 = JSON.parse(文) as 存档数据;
    if (数?.版本 !== 存档版本) return null;
    if (typeof 数.段号 !== 'number' || typeof 数.位置 !== 'number') return null;
    if (!Array.isArray(数.会话们) || 数.会话们.length === 0) return null;
    if (!数.指标 || typeof 数.指标.信任 !== 'number') return null;
    return 数;
  } catch {
    return null;
  }
}

/** 清掉存档（设置里的"重来"） */
export function 清存档(): void {
  try {
    window.localStorage.removeItem(存档键);
  } catch {
    /* 忽略 */
  }
}

/** 有没有存档（给界面显示"继续上次进度"用） */
export function 有存档(): boolean {
  return 读存档() !== null;
}

/* ───────── 关卡存档（小游戏那一局） ───────── */

export const 关卡存档键 = 'lks-save-level';
/** ⚠️ 关卡字段结构一变就 +1（和剧情存档各管各的版本） */
export const 关卡存档版本 = 1;

/**
 * **小游戏那一局的存档**。
 *
 * ⚠️ 用户要求："可以"（把这一局也存上）—— 一局有几分钟，
 *    手机上切个后台刷个新就白打，体验很差。
 *
 * 存的是**"重开这一局要恢复什么"的最小集**：
 *   剩余时间 / 已交 / 交错 / 当前三张工单 / 手上那张 / 地上散落的 / 玩家位置 / 打印机里的那份。
 * ⚠️ **不存帮手的状态**（他的计划/进度/目标工位是一串内部状态，恢复成本高、收益低）：
 *    回来时他重新从"待命"开始 —— 这一局照样能打。
 */
export interface 关卡存档数据 {
  版本: number;
  时间: number;
  标题: string;
  提示: string;
  剩余秒: number;
  已交: number;
  交错: number;
  订单: 订单[];
  手上: CarryKind;
  手上工序: 工序[];
  地上: Array<{ 工序: 工序[]; kind: CarryKind; x: number; y: number }>;
  玩家: { x: number; y: number; 朝向: string };
  打印槽: { 已有: 工序[]; 目标: 工序; 剩余: number } | null;
}

export function 写关卡存档(数据: Omit<关卡存档数据, '版本' | '时间'>): void {
  try {
    window.localStorage.setItem(
      关卡存档键,
      JSON.stringify({ ...数据, 版本: 关卡存档版本, 时间: Date.now() }),
    );
  } catch {
    /* 存不上不能把游戏搞崩 */
  }
}

export function 读关卡存档(): 关卡存档数据 | null {
  try {
    const 文 = window.localStorage.getItem(关卡存档键);
    if (!文) return null;
    const 数 = JSON.parse(文) as 关卡存档数据;
    if (数?.版本 !== 关卡存档版本) return null;
    if (typeof 数.剩余秒 !== 'number' || !数.玩家) return null;
    return 数;
  } catch {
    return null;
  }
}

export function 清关卡存档(): void {
  try {
    window.localStorage.removeItem(关卡存档键);
  } catch {
    /* 忽略 */
  }
}

