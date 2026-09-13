/**
 * 玩家位置总线。
 *
 * 为什么要单独一个模块而不是塞进 zustand：
 *   场景**每帧**都在动，如果每帧 set 一次 store，React 会跟着重渲染整棵树。
 *   这里用一个普通的可变对象，小地图组件自己用 requestAnimationFrame 去读、去画，
 *   全程不触发任何 React 更新。
 */

export const 位置总线 = {
  x: 0,
  y: 0,
  /** 场景是否已经建好（没好之前小地图不画点） */
  就绪: false,
};

/** 场景每帧调用 */
export function 报位置(x: number, y: number): void {
  位置总线.x = x;
  位置总线.y = y;
  位置总线.就绪 = true;
}
