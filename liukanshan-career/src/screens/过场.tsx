/**
 * **过场层**（文档第 0/1/3 条）。
 *
 * 用户要求：
 *   · 第一次坐上椅子 → 一段过场动画
 *   · **每次任务之间** → 一段过场动画
 *   · 「不要害怕，他又不吃人」之后 → 一段过场动画，然后再弹茶水间事件
 *
 * 为什么挂在 Root（全局）而不是 Avg 里面：
 *   "坐到工位上"这段过场是**在地图上**放的 —— 放完才切进微信。
 *   挂在微信屏里的话，地图上那一段根本看不见。
 *
 * ⚠️ 它是一个**纯过渡**：黑底 + 时间地点 + 一条走完就结束的进度条，
 *    玩家不用点任何东西（时长由剧本的 `秒` 决定，默认 2.6s）。
 * ⚠️ z-index 要最高（400）：它要盖住顶部提醒（300）和一切弹层。
 */
import type { ReactElement } from 'react';
import { useStory } from '../state/story';

export function 过场层(): ReactElement | null {
  const 过场 = useStory((s) => s.过场);
  if (!过场) return null;
  const 秒 = 过场.秒 > 0 ? 过场.秒 : 2.6;
  return (
    <div className="gc-layer" role="presentation">
      <div className="gc-box">
        {过场.插图 ? <img className="gc-pic" src={过场.插图} alt="" draggable={false} /> : null}
        {/*
          **过场用的沙漏**（用户要求：「动画用沙漏动画，在 美术/素材库/原图/14-转场结局 里，
          上下反转跳动不是左右滑动」）。
          ⚠️ 和小游戏右下角那枚是**同一张精灵表 + 同一套跳动**（帧走 steps，容器做上下翻转跳动），
             这样"过场"和"关卡里"的沙漏是同一个东西，不会两套观感。
        */}
        <span className="gc-glass-box">
          <i
            className="gc-glass"
            style={{
              /**
               * ⚠️⚠️ **必须用绝对 URL**，不能在 CSS 里写相对路径。
               *    实测踩过：CSS 里写 `url('./assets/avg/hourglass.png')`，
               *    打包后 CSS 在 `/刘看山/assets/` 下 → 浏览器去要
               *    `/刘看山/assets/assets/avg/hourglass.png` → **404**，
               *    **线上过场就没有沙漏**（dev 下 Vite 会重写这个路径，所以本地看不出来）✗
               */
              backgroundImage: `url("${new URL('assets/avg/hourglass_v.png', document.baseURI).href}")`,
            }}
          />
        </span>
        <div className="gc-title">{过场.标题}</div>
        {过场.副标题 ? <div className="gc-sub">{过场.副标题}</div> : null}
        <div className="gc-bar">
          {/* 进度条走完就是过场结束 —— 让玩家知道"这不是卡住了" */}
          <i style={{ animationDuration: 秒 + 's' }} />
        </div>
      </div>
    </div>
  );
}
