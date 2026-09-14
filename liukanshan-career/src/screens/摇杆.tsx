import { useRef, type ReactElement } from 'react';
import { 松摇杆, 设摇杆 } from '../game/touch';

/**
 * 是不是触屏设备。
 *
 * ⚠️ 小游戏和地图原来**都只读键盘**，手机上进来一步都走不动。
 *    摇杆/按键只在粗指针设备上显示（有键盘的机器上摆这些纯属挡画面）；
 *    也可以在 URL 上加 `?触屏=1` 手动打开，方便在电脑上核对布局。
 */
export function 是触屏(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.search.includes('触屏')) return true;
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

/**
 * **虚拟摇杆**（左下角）。
 *
 * ⚠️ 它只把方向写进 `虚拟输入`，**不自己实现移动** —— 两个场景每帧读那个模块，
 *    和键盘走同一条路（否则键盘 8 向、摇杆要斜走，两边逻辑会越走越远）。
 * ⚠️ 必须 `touch-action: none`（在 CSS 里），否则拖动会被浏览器当成滚动页面。
 */
export function 虚拟摇杆(): ReactElement {
  const 盘 = useRef<HTMLDivElement>(null);
  /**
   * ⚠️⚠️ 摇杆头**不走 React state**（原来每次 pointermove 都 `set钮(...)`）。
   *
   * 为什么必须改：拖动时 pointermove 每秒 60+ 次，每次都触发一次 React 重渲染 ——
   * 而重渲染的是**整个屏幕**（地图屏那棵树里有小地图 canvas、各种卡片、按钮）。
   * 实测推摇杆时最差帧 **48.6ms**（≈20fps 的卡顿感）。
   * 摇杆头的位置只是"一个视觉反馈"，直接改 DOM 样式就行，**一次渲染都不需要**。
   */
  const 钮 = useRef<HTMLElement>(null);
  /** 摇杆的**死区**（占半径的比例）：拇指搭着不动时不该让角色漂移 */
  const 死区 = 0.18;

  const 算 = (e: React.PointerEvent<HTMLDivElement>): void => {
    const el = 盘.current;
    if (!el) return;
    /**
     * ⚠️⚠️ **必须用 offsetX/offsetY（元素自身坐标系）**，不能用 clientX/clientY。
     *
     * 用户报的「移动摇杆错位了，向右滑动向下走」就是这个：
     *    横板模式下**整个关卡被 CSS 转了 90°**（iPhone 走的就是这条路），
     *    而 `getBoundingClientRect()` 给的是**轴对齐外框**（旋转后不再等于元素本身）✗
     *    → 算出来的 x/y 恰好差 90°，向右推被当成往下推 ✔
     * `offsetX/offsetY` 是**相对元素自身**的，**不受 transform 影响** ✔
     * （摇杆头设了 `pointer-events: none`，所以事件目标永远是底盘本身 ✔）
     */
    const 半径 = el.offsetWidth / 2;
    let dx = e.nativeEvent.offsetX - 半径;
    let dy = e.nativeEvent.offsetY - 半径;
    const 长 = Math.hypot(dx, dy);
    if (长 > 半径) {
      dx = (dx / 长) * 半径;
      dy = (dy / 长) * 半径;
    }
    if (钮.current) 钮.current.style.transform = `translate(${dx}px, ${dy}px)`;
    // 死区之内当没推（但摇杆头还是会跟手，看得见反馈）
    设摇杆(长 < 半径 * 死区 ? 0 : dx / 半径, 长 < 半径 * 死区 ? 0 : dy / 半径);
  };

  const 松 = (): void => {
    if (钮.current) 钮.current.style.transform = 'translate(0px, 0px)';
    松摇杆();
  };

  return (
    <div
      className="vt-stick"
      ref={盘}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        算(e);
      }}
      onPointerMove={(e) => {
        if (e.buttons || e.pointerType === 'touch') 算(e);
      }}
      onPointerUp={松}
      onPointerCancel={松}
      onPointerLeave={松}
    >
      <i className="vt-stick-knob" ref={钮} />
    </div>
  );
}
