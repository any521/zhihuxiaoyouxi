/**
 * 根组件：按剧情状态分流屏幕。
 *
 * 三个屏幕：
 *   opening  开场动画
 *   avg      微信（信息）
 *   map      办公室地图（行动）
 *
 * 双模式的分工是这一版的核心：微信负责"谁说了什么"，
 * 地图负责"你要去哪儿"。每段主线播完回地图，走到入口点再开下一段。
 */
import type { ReactElement } from 'react';
import { useStory } from '../state/story';
import { Opening } from './Opening';
import { Avg } from './Avg';
import { MapScreen } from './MapScreen';

export function Root(): ReactElement {
  const 屏幕 = useStory((s) => s.屏幕);
  if (屏幕 === 'opening') return <Opening />;
  if (屏幕 === 'map') return <MapScreen />;
  return <Avg />;
}
