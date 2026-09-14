/**
 * 根组件：按剧情状态分流屏幕。
 *
 * 四个屏幕：
 *   opening  开场动画
 *   avg      微信（信息）
 *   map      办公室地图（行动）
 *   level    小游戏（工作关：把活做出来）
 *
 * 双模式的分工是这一版的核心：微信负责"谁说了什么"，
 * 地图负责"你要去哪儿"。每段主线播完回地图，走到入口点再开下一段。
 * `level` 是 2026-09 新加的：剧本里用「开小游戏」节拍切过去，
 * 玩家把这一版稿子做出来之后，由 `关卡结束()` 切回微信接着播。
 */
import { useEffect, type ReactElement } from 'react';
import { useStory } from '../state/story';
import { 播BGM, 当前BGM } from '../story/audio';
import { Opening } from './Opening';
import { Avg } from './Avg';
import { MapScreen } from './MapScreen';
import { 关卡 } from './关卡';
import { StoryClock } from './StoryClock';
import { 顶部提醒 } from './顶部提醒';
import { 过场层 } from './过场';
import { 知乎登录门 } from '../ui/知乎登录门';

export function Root(): ReactElement {
  const 屏幕 = useStory((s) => s.屏幕);
  /** 跑团面板开着的时候算"在会议室里"（它是 AVG 上的一个弹层） */
  const 在跑团 = useStory((s) => s.跑团局 !== null);

  /**
   * **背景音乐跟着屏幕走**。
   *
   * ⚠️ 放在 Root 而不是各个屏里：屏幕是这里分流的，BGM 也该在这里统一决定 ——
   *    分散在各屏的话，"切屏时谁负责把上一首停掉"会变成一团乱账。
   * ⚠️ `播BGM` 内部判了"同一首不重播"，所以这里可以放心地跟着渲染调。
   */
  // 开发期把"现在在放哪首"挂到 window 上，体检脚本要问它
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__lksBGM = 当前BGM;
  }

  useEffect(() => {
    if (屏幕 === 'opening') 播BGM('办公室');
    else if (屏幕 === 'level') 播BGM('工作关');
    else if (屏幕 === 'map') 播BGM('办公室');
    else if (在跑团) 播BGM('会议室');
    else 播BGM('办公室');
  }, [屏幕, 在跑团]);
  // ⚠️ `StoryClock` 挂在**外层**：它负责"剧情自己往下播"，和玩家在看哪个会话无关。
  //    放进 Avg 里的话，切会话/切屏会把定时器重启，剧情就会卡（用户报过）。
  /**
   * ⚠️⚠️ 用户要求：「**先播前面的插图，再做知乎授权**」✗ ——
   *    所以 `opening` 屏**直接放行** ✔（开场动画照播 ✔），
   *    等它播完切到微信时，才由登录门接管 ✔
   *    ⚠️ 门在「接口不通 / 离线」时会放行 ✗（不能让外部服务把游戏锁死 ✔）
   */
  const 正文 = 屏幕 === 'opening' ? (
    <Opening />
  ) : 屏幕 === 'level' ? (
    /* 小游戏（工作关）：剧本的「开小游戏」节拍切进来，打完由 关卡结束() 切回 avg */
    <关卡 />
  ) : 屏幕 === 'map' ? (
    <MapScreen />
  ) : (
    <Avg />
  );
  return (
    <>
      <StoryClock />
      {屏幕 === 'opening' ? 正文 : <知乎登录门>{正文}</知乎登录门>}
      {/*
        ⚠️ 顶部的新消息提醒放在**最外层**：它最该出现的场景恰恰是
        "玩家不在微信屏上"（在地图/小游戏里），所以不能挂在 Avg 里面。
      */}
      <顶部提醒 />
      {/*
        ⚠️ 过场层放在**最后**（z-index 400 也最高）：它要盖住一切，
        包括顶部提醒和地图/微信/小游戏。文档第 0/1/3 条要的过场动画就是它。
      */}
      <过场层 />
    </>
  );
}
