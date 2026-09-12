/**
 * 美术与渲染底层：原生双朝向。
 *
 * 关键事实：瓦片是正方形 32×32，而两种画幅都能被 32 整除，
 * 所以同一套素材、同一条像素完美规则在 PC 横屏与手机竖屏上都成立——
 * 不需要旋转画布，也不需要接受非整数缩放。
 *
 *   横版 512×288 = 16×9 瓦片（PC / 手机横屏）
 *   竖版 288×512 = 9×16 瓦片（手机竖屏）
 */
export type Orientation = 'landscape' | 'portrait';

export interface Viewport {
  orientation: Orientation;
  width: number;
  height: number;
  /** 瓦片视野，便于关卡与布局生成器使用 */
  cols: number;
  rows: number;
}

export const TILE = 32;

export function resolveViewport(): Viewport {
  const landscape =
    typeof window === 'undefined' ? true : window.innerWidth >= window.innerHeight;
  return landscape
    ? { orientation: 'landscape', width: 512, height: 288, cols: 16, rows: 9 }
    : { orientation: 'portrait', width: 288, height: 512, cols: 9, rows: 16 };
}

/** 启动时确定一次；朝向变化由上层重新加载页面处理 */
export const VIEWPORT = resolveViewport();
export const VIEW_W = VIEWPORT.width;
export const VIEW_H = VIEWPORT.height;
