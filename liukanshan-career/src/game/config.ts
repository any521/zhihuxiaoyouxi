import Phaser from 'phaser';
import { OfficeScene } from './scenes/OfficeScene';
import { VIEW_H, VIEW_W } from './viewport';

export { TILE, VIEW_H, VIEW_W, VIEWPORT } from './viewport';

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  parent: 'game-root',
  width: VIEW_W,
  height: VIEW_H,
  backgroundColor: '#2f3644',
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: VIEW_W,
    height: VIEW_H,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scene: [OfficeScene],
};
