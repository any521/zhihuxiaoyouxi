import Phaser from 'phaser';
import { OfficeScene } from './scenes/OfficeScene';

/**
 * 关卡（工作关）的 Phaser 配置。
 *
 * ⚠️ 2026-09 改版：从"写死 512×288 / 288×512 的一份配置"改成**按窗口算出来的内部分辨率**
 *    （用户要求「小游戏改为**全屏**」）。内宽/内高由 `screens/关卡.tsx` 算好传进来 ——
 *    那边保证"内部格数 × 整数倍 ≤ 可用区域"，所以依然是**整数倍 + 最近邻**的像素完美。
 *
 * ⚠️ 关卡数据（网格/工位）在**建游戏之前**就要定下来，所以走
 *    `greybox/level.ts` 的 `设定关卡格数()`，不是 `scene.start(key, data)`。
 */
export function 造关卡游戏配置(
  内宽: number,
  内高: number,
  parent: string,
): Phaser.Types.Core.GameConfig {
  return {
    type: Phaser.WEBGL,
    parent,
    width: 内宽,
    height: 内高,
    backgroundColor: '#262a33',
    pixelArt: true,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: 内宽,
      height: 内高,
    },
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    scene: [OfficeScene],
  };
}

export { TILE, VIEW_H, VIEW_W, VIEWPORT } from './viewport';
