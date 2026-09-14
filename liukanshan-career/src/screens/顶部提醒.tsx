/**
 * 顶部"**新消息来自哪里**"的提醒。
 *
 * ⚠️ 用户报的问题：「移动端如果有新消息要在顶部弹出消息给出提示，
 *    要不然看不清哪里来的消息」。
 *
 * 根因：**手机上聊天界面打开时会话列表是隐藏的**
 * （`screens.css` 里 `.wechat.show-chat .wc-list { display: none }`）——
 * 玩家只看得到一个会话，别处来了消息只会悄悄躺在那个会话里，
 * 页面上唯一的变化是一个**看不见的小红点**。在地图/小游戏上就更彻底：什么都没有。
 *
 * 所以这一条：**玩家没在看那个会话**（或根本不在微信屏）时，
 * 顶部弹一条"谁发的 + 说了什么"，**点一下直接跳过去**，4.5 秒自己收起来（和手机通知一样）。
 *
 * ⚠️ 它是 `position: fixed` 挂在**所有屏幕之上**（在 `Root` 里渲染），
 *    因为最需要它的场景恰恰是"玩家根本不在微信屏上"的时候。
 */
import { useEffect, type ReactElement } from 'react';
import { useStory } from '../state/story';
import { 播放 } from '../story/audio';

/** 停留多久（毫秒）——和手机推送横幅差不多，看得到、不赖着 */
const 停留 = 4500;

export function 顶部提醒(): ReactElement | null {
  const 提示 = useStory((s) => s.新消息提示);
  const 清提示 = useStory((s) => s.清提示);

  useEffect(() => {
    if (!提示) return;
    const t = window.setTimeout(() => 清提示(), 停留);
    return () => window.clearTimeout(t);
    // ⚠️ 依赖整条提示（每次来消息都是新对象）：同一个人连发两条也要重新计时
  }, [提示, 清提示]);

  if (!提示) return null;

  return (
    <button
      type="button"
      className="top-tip"
      onClick={() => {
        播放('按钮');
        // 跳过去：**先切屏再切会话**（在地图/小游戏上时得先回微信）
        useStory.setState({ 屏幕: 'avg', 搜索开: false });
        useStory.getState().查看(提示.会话id);
        清提示();
      }}
      title="点开这条消息"
    >
      <span className="top-tip-app">微信</span>
      <span className="top-tip-body">
        <b className="top-tip-who">{提示.名字}</b>
        <span className="top-tip-text">{提示.预览}</span>
      </span>
      <span className="top-tip-go">点开 ▸</span>
    </button>
  );
}
