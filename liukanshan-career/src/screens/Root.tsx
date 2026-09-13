/**
 * 根组件：按剧情状态分流屏幕。
 *
 * 现在只做「开场动画」和「AVG 剧情」两块 —— 办公室关卡后接。
 * 关卡那套（Phaser + 边栏 HUD）原样留在 src/ui/ 下，接的时候挂到 level 分支即可。
 */
import type { ReactElement } from 'react';
import { useStory } from '../state/story';
import { Opening } from './Opening';
import { Avg } from './Avg';

export function Root(): ReactElement {
  const 屏幕 = useStory((s) => s.屏幕);
  if (屏幕 === 'opening') return <Opening />;
  return <Avg />;
}
