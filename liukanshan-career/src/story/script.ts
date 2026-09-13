/**
 * 剧本总表。
 *
 * 顺序播：当前这一段的「暂停」节拍播完后，玩家点「继续实习生活……」
 * 就切到下一段。加新事件只要往这个数组里追加。
 */
import type { 剧本段 } from './types';
import { 事件一 } from './opening';
import { 事件二, 事件三 } from './events2';

export const 剧本: 剧本段[] = [事件一, 事件二, 事件三];

/** 每一段在会话列表里的日期标签（显示用） */
export const 段日期 = ['入职第 1 天', '第 3 天', '第二周'];

export function 取段(序号: number): 剧本段 | null {
  return 剧本[序号] ?? null;
}
