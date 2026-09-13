/**
 * 地图模式的 React 外壳。
 *
 * 分工：Phaser 只画像素（瓦片/道具/角色），**文字一律 DOM**。
 *
 * 【满屏又不糊的做法】
 * 直接拉伸画布会让像素发虚，所以反过来做：**按窗口算内部分辨率**，
 * 让"窗口尺寸 = 内部分辨率 × 整数倍"精确成立。
 *   1440×900  →  倍率 3  →  内部 480×300  →  3× = 1440×900 ✅ 满屏且整数倍
 *   1920×1080 →  倍率 4  →  内部 480×270  →  4× = 1920×1080 ✅
 * 这样既没有黑边，也不会出现非整数缩放的发虚。
 *
 * 【按键】
 *   方向键 / WASD  走动（Shift 跑）
 *   空格           交互
 *   Tab            掏出手机（微信）/ 再按回地图
 *   Esc            设置
 *
 * 【位置记忆】切到微信时把主角坐标记进 store，回来时传送回去 —— 不会回到出生点。
 */
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import Phaser from 'phaser';
import { OfficeMapScene } from '../game/map/OfficeMapScene';
import { 交互点表 } from '../game/map/level';
import { 人物卡, 设置弹层 } from './Panels';
import { 小地图 } from './小地图';
import { 取道具卡, 格子卡 } from '../story/道具卡';
import { 取人物卡 } from '../story/人物卡';
import type { 说话人 } from '../story/types';
import { useStory } from '../state/story';
import { 播放 } from '../story/audio';

/** 按窗口算"内部分辨率 × 整数倍" */
function 算尺寸(): { 倍: number; 内宽: number; 内高: number } {
  const W = Math.max(320, window.innerWidth);
  const H = Math.max(240, window.innerHeight);
  const 竖 = H > W;
  const 目标宽 = 竖 ? 288 : 480;
  const 目标高 = 竖 ? 480 : 288;
  // 取最接近的整数倍；竖屏至少 2 倍，否则内部像素太多、视野太广
  let 倍 = Math.round(Math.min(W / 目标宽, H / 目标高));
  if (竖) 倍 = Math.max(2, 倍);
  倍 = Math.max(1, 倍);
  return { 倍, 内宽: Math.ceil(W / 倍), 内高: Math.ceil(H / 倍) };
}

export function MapScreen(): ReactElement {
  const 挂载 = useRef<HTMLDivElement>(null);
  const 场景 = useRef<OfficeMapScene | null>(null);
  const 游戏 = useRef<Phaser.Game | null>(null);
  const [尺寸, set尺寸] = useState(算尺寸);
  const [就绪, set就绪] = useState(false);
  /** 附近的门（靠近时底部提示改成开门/关门） */
  const [附近门, set附近门] = useState<{ x: number; y: number; 开: boolean } | null>(null);
  const 附近门ref = useRef<{ x: number; y: number; 开: boolean } | null>(null);

  const 附近 = useStory((s) => s.附近交互点);
  const 附近物 = useStory((s) => s.附近物);
  const 设附近物 = useStory((s) => s.设附近物);
  const 附近人 = useStory((s) => s.附近人);
  const 设附近人 = useStory((s) => s.设附近人);
  const 目标id = useStory((s) => s.地图目标);
  const 设附近 = useStory((s) => s.设附近);
  const 地图交互 = useStory((s) => s.地图交互);
  const 掏手机 = useStory((s) => s.掏手机);
  const 段标签 = useStory((s) => s.段标签);
  const 段号 = useStory((s) => s.段号);
  const 看人物 = useStory((s) => s.看人物);
  const 开关设置 = useStory((s) => s.开关设置);

  /* ── 窗口尺寸变了就重算（保持整数倍满屏）── */
  useEffect(() => {
    const 算 = (): void => set尺寸(算尺寸());
    window.addEventListener('resize', 算);
    window.addEventListener('orientationchange', 算);
    return () => {
      window.removeEventListener('resize', 算);
      window.removeEventListener('orientationchange', 算);
    };
  }, []);

  /* ── 启动 Phaser（只启动一次，用首次算出的尺寸）── */
  useEffect(() => {
    if (!挂载.current || 游戏.current) return;
    const 初 = 算尺寸();

    const g = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: 挂载.current,
      width: 初.内宽,
      height: 初.内高,
      backgroundColor: '#262a33',
      pixelArt: true,
      roundPixels: true,
      scale: {
        mode: Phaser.Scale.NONE,
        autoCenter: Phaser.Scale.NO_CENTER,
        width: 初.内宽,
        height: 初.内高,
      },
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
      scene: [OfficeMapScene],
    });
    游戏.current = g;

    // 不用 Phaser 的 ready 事件（时序不稳），轮询等场景建好
    let 次 = 0;
    const 试探 = window.setInterval(() => {
      次 += 1;
      const s = g.scene.getScene('办公室地图') as OfficeMapScene | null;
      if (s && s.scene.isActive()) {
        window.clearInterval(试探);
        场景.current = s;
        s.设回调({
          附近变了: (点) => 设附近(点 ? 点.id : null),
          交互: (点) => {
            播放('按钮');
            地图交互(点.id);
          },
          点人物: (名) => {
            播放('选项悬停');
            看人物(名 as never);
          },
          // 靠近门 → 底部提示改成「空格 开门/关门」
          附近门变了: (门) => {
            附近门ref.current = 门;
            set附近门(门);
          },
          // 靠近家具/门 → 弹「这东西是干嘛的」卡片
          附近道具变了: (物) => {
            设附近物(物);
          },
          // 靠近同事 → 弹人物卡（他是谁 / 现在有没有戏）
          附近人变了: (名) => {
            设附近人(名);
          },
        });
        // 回到记忆中的位置（切去微信再回来不会重置到出生点）
        const 记 = useStory.getState().地图位置;
        if (记) s.传送像素(记.x, 记.y);
        set就绪(true);
        if (import.meta.env.DEV) {
          (window as unknown as Record<string, unknown>).__lksMap = s;
        }
      } else if (次 > 120) {
        window.clearInterval(试探);
      }
    }, 50);

    return () => {
      window.clearInterval(试探);
      // 卸载前记下主角位置，回来还在原地
      const s = 场景.current;
      if (s) useStory.getState().记地图位置(s.精确位置());
      g.destroy(true);
      游戏.current = null;
      场景.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 尺寸变了：重设内部分辨率 ── */
  useEffect(() => {
    const g = 游戏.current;
    if (!g) return;
    g.scale.resize(尺寸.内宽, 尺寸.内高);
  }, [尺寸]);

  /* ── 目标变了：指引线改指向 ── */
  useEffect(() => {
    if (!就绪) return;
    场景.current?.设目标(目标id);
  }, [目标id, 就绪]);

  /* ── 剧情推进了：换一批同事站位 ── */
  useEffect(() => {
    if (!就绪) return;
    场景.current?.换NPC(段号);
  }, [段号, 就绪]);

  /* ── 键盘：Tab 掏手机 / Esc 设置 / 空格 交互 ── */
  const 按键 = useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === 'Tab') {
        e.preventDefault();
        播放('按钮');
        const s = 场景.current;
        if (s) useStory.getState().记地图位置(s.精确位置());
        掏手机();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        播放('按钮');
        开关设置();
        return;
      }
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        // 门优先：站在门口时空格是开关门，不是交互
        // ⚠️ 这里读 ref 而不是 state —— keydown 的闭包是旧的，读 state 会拿到过期的值
        const 门 = 附近门ref.current;
        const s = 场景.current;
        if (门 && s) {
          播放(门.开 ? '按钮' : '选择确认', 0.5);
          s.开关门(门.x, 门.y);
          return;
        }
        const id = useStory.getState().附近交互点;
        if (id) {
          播放('按钮');
          地图交互(id);
        }
      }
    },
    [掏手机, 开关设置, 地图交互],
  );

  useEffect(() => {
    window.addEventListener('keydown', 按键);
    return () => window.removeEventListener('keydown', 按键);
  }, [按键]);

  const 附近点 = 附近 ? 交互点表.find((p) => p.id === 附近) : null;
  const 是主线 = 目标id !== null && 附近点?.id === 目标id;

  /** 旁边那件东西的说明卡（道具用图名查，门/玻璃用格子卡查） */
  const 卡片 = 附近物
    ? 附近物.种类 === '道具'
      ? 取道具卡(附近物.键)
      : (格子卡[附近物.键] ?? null)
    : null;
  /** 旁边那位同事的人物卡 */
  const 人卡 = 附近人 ? 取人物卡(附近人 as 说话人) : null;

  /** 记位置再切去微信 */
  const 去微信 = (): void => {
    播放('按钮');
    const s = 场景.current;
    if (s) useStory.getState().记地图位置(s.精确位置());
    掏手机();
  };

  return (
    <div className="map-wrap">
      {/* Phaser 画布：内部尺寸 = 内宽×内高，CSS 放大整数倍，正好铺满窗口 */}
      <div
        className="map-canvas"
        ref={挂载}
        style={
          {
            '--map-w': `${尺寸.内宽 * 尺寸.倍}px`,
            '--map-h': `${尺寸.内高 * 尺寸.倍}px`,
          } as React.CSSProperties
        }
      />

      {/* 右上：小地图（点击放大） */}
      <小地图 />

      {/* 左上：天数（小徽章） */}
      <div className="map-day">{段标签}</div>

      {/* 左边：旁边那件东西是干嘛的（道具卡，一靠近就显示） */}
      {卡片 ? (
        <div className="map-prop">
          <div className="map-prop-head">{卡片.名}</div>
          <div className="map-prop-use">{卡片.用途}</div>
          {卡片.补充 ? <div className="map-prop-more">{卡片.补充}</div> : null}
        </div>
      ) : null}

      {/* 右边：旁边是哪位同事（人物卡）。和道具卡**各占一角** ——
          工位上本来就有桌面小件，写成"二选一"的话人物卡永远弹不出来（实测踩过）。 */}
      {人卡 ? (
        <div className="map-prop who">
          <div className="map-prop-head">
            {人卡.谁}
            <span className="map-prop-post">{人卡.职位}</span>
          </div>
          <div className="map-prop-use">
            {人卡.关系} · {人卡.印象}
          </div>
          <div className="map-prop-more">{人卡.口风}</div>
        </div>
      ) : null}

      {/* 左下：操作说明 */}
      <div className="map-keys">
        <b>方向键</b> 走动 · <b>Shift</b> 跑 · <b>空格</b> 交互 · <b>Tab</b> 微信 · <b>Esc</b> 设置
      </div>

      {/* 底部中间：门优先（站在门口时空格是开关门） */}
      {附近门 ? (
        <div className="map-prompt door">
          <b>{附近门.开 ? '开着' : '关着'}</b>
          <span className="map-prompt-key">空格</span>
          <span className="map-prompt-act">{附近门.开 ? '把门关上' : '把门推开'}</span>
        </div>
      ) : 附近点 ? (
        <div className={`map-prompt${是主线 ? ' main' : ''}`}>
          <b>{附近点.名}</b>
          <span className="map-prompt-key">空格</span>
          <span className="map-prompt-act">{附近点.提示}</span>
          {是主线 ? <span className="map-prompt-star">主线</span> : null}
        </div>
      ) : null}

      {/* 右下：掏手机 */}
      <button className="map-phone" onMouseEnter={() => 播放('选项悬停')} onClick={去微信} title="掏出手机（Tab）">
        <span className="map-phone-dot" />
        微信
        <span className="map-phone-key">Tab</span>
      </button>

      {/* 右下角：设置 */}
      <button
        className="map-gear"
        onMouseEnter={() => 播放('选项悬停')}
        onClick={() => {
          播放('按钮');
          开关设置();
        }}
        title="设置（Esc）"
        aria-label="设置"
      >
        ⚙
      </button>

      {/* 点地图上的同事弹出来的人物卡 */}
      <人物卡 />
      {/* Esc 打开的设置 */}
      <设置弹层 />
    </div>
  );
}
