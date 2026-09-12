import { useEffect, useState } from 'react';
import { VIEW_H, VIEW_W } from '../game/config';

export interface PixelLayout {
  scale: number;
  width: number;
  height: number;
  /** 画布相对视口左上角的偏移，用于把 HUD 对齐到画布边缘 */
  offsetX: number;
  offsetY: number;
  /** 宽屏（PC）时黑边够宽，HUD 放到画布外；窄屏（手机）压成紧凑浮层 */
  hudOutside: boolean;
  /** 是否使用"左右边栏"布局（窄屏时收成上下窄栏） */
  wide: boolean;
}

/** 左右边栏需要的最小黑边宽度——够宽才把它们放到画布外 */
const RAIL_MIN = 150;

/**
 * 像素完美的关键一步：只允许整数倍放大。
 * 逻辑分辨率固定 512×288（竖版 288×512），CSS 尺寸取整数倍，配合 image-rendering: pixelated，
 * 像素才不会被插值糊掉或被拉出摩尔纹。
 *
 * 边栏不参与"扣宽再算倍数"——那样会把倍数从 ×2 压到 ×1。
 * 正确做法是：画布按整屏算最大整数倍，边栏**叠在剩下的黑边上**，黑边不够宽才收成上下窄栏。
 */
export function usePixelFit(): PixelLayout {
  const [layout, setLayout] = useState<PixelLayout>({
    scale: 2,
    width: VIEW_W * 2,
    height: VIEW_H * 2,
    offsetX: 0,
    offsetY: 0,
    hudOutside: false,
    wide: false,
  });

  useEffect(() => {
    const compute = (): void => {
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const 顶栏高 = 62;
      const 可用W = Math.max(200, viewportW - 24);
      const 可用H = Math.max(160, viewportH - 顶栏高 - 44);
      const raw = Math.min(可用W / VIEW_W, 可用H / VIEW_H);
      // 大屏取整数倍；小屏（手机竖屏）退化为等比缩放，保证能玩
      const scale = raw >= 1 ? Math.floor(raw) : Number(raw.toFixed(3));
      const width = Math.round(VIEW_W * scale);
      const height = Math.round(VIEW_H * scale);
      const offsetX = Math.round((viewportW - width) / 2);
      const offsetY = Math.round((viewportH - 顶栏高 - height) / 2);

      setLayout({
        scale,
        width,
        height,
        offsetX,
        offsetY,
        hudOutside: offsetX >= RAIL_MIN,
        wide: offsetX >= RAIL_MIN,
      });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
    };
  }, []);

  return layout;
}
