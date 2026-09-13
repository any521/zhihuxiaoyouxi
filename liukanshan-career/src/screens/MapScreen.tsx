/**
 * 地图模式的 React 外壳。
 *
 * 分工：Phaser 只画像素（瓦片/道具/角色），**文字一律 DOM** ——
 * 中文字号小的时候 Phaser 里会糊，这是全局约定。
 *
 * 双向通信：
 *   React → Phaser  设回调（附近变了 / 交互了）、设目标（指引线指向哪）
 *   Phaser → React  附近变了 → 写进 store → 这里渲染提示条
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import Phaser from 'phaser';
import { OfficeMapScene } from '../game/map/OfficeMapScene';
import { 交互点表 } from '../game/map/level';
import { 人物卡 } from './Panels';
import { useStory } from '../state/story';
import { 播放 } from '../story/audio';
import { VIEW_H, VIEW_W } from '../game/viewport';

export function MapScreen(): ReactElement {
  const 挂载 = useRef<HTMLDivElement>(null);
  const 场景 = useRef<OfficeMapScene | null>(null);
  const 游戏 = useRef<Phaser.Game | null>(null);
  const [就绪, set就绪] = useState(false);

  const 附近 = useStory((s) => s.附近交互点);
  const 目标id = useStory((s) => s.地图目标);
  const 设附近 = useStory((s) => s.设附近);
  const 地图交互 = useStory((s) => s.地图交互);
  const 掏手机 = useStory((s) => s.掏手机);
  const 看人物 = useStory((s) => s.看人物);
  const 段标签 = useStory((s) => s.段标签);
  const 段号 = useStory((s) => s.段号);

  /* ── 启动 Phaser（只启动一次）── */
  useEffect(() => {
    if (!挂载.current || 游戏.current) return;

    const g = new Phaser.Game({
      type: Phaser.WEBGL,
      parent: 挂载.current,
      width: VIEW_W,
      height: VIEW_H,
      backgroundColor: '#262a33',
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
      scene: [OfficeMapScene],
    });
    游戏.current = g;

    // ⚠️ 不用 Phaser 的 ready 事件（时序不稳），改成轮询等场景建好
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
          // 点地图上的同事 → 弹人物卡
          点人物: (名) => {
            播放('选项悬停');
            看人物(名 as never);
          },
        });
        set就绪(true);
        // DEV：暴露场景，方便自动化测试（把主角挪到某处验证交互）
        if (import.meta.env.DEV) {
          (window as unknown as Record<string, unknown>).__lksMap = s;
        }
      } else if (次 > 80) {
        window.clearInterval(试探);
      }
    }, 60);

    return () => {
      window.clearInterval(试探);
      g.destroy(true);
      游戏.current = null;
      场景.current = null;
    };
    // 只跑一次；回调内部通过 store 的稳定引用取最新状态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 目标变了：告诉场景，指引线改指向 ── */
  useEffect(() => {
    if (!就绪) return;
    场景.current?.设目标(目标id);
  }, [目标id, 就绪]);

  /* ── 剧情推进了：换一批同事站位 ── */
  useEffect(() => {
    if (!就绪) return;
    场景.current?.换NPC(段号);
  }, [段号, 就绪]);

  /* ── 键盘：空格交互、Esc 掏手机 ──
     两个键都在 React 层判，不在 Phaser 里判：
     Phaser 的键盘监听依赖画布焦点，实测不可靠，而这里已经有 附近交互点 这个状态。 */
  useEffect(() => {
    const 键 = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        播放('按钮');
        掏手机();
        return;
      }
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        const id = useStory.getState().附近交互点;
        if (id) {
          播放('按钮');
          地图交互(id);
        }
      }
    };
    window.addEventListener('keydown', 键);
    return () => window.removeEventListener('keydown', 键);
  }, [掏手机, 地图交互]);

  /* ── 整数倍缩放：非整数倍会让像素糊掉 ── */
  const 外层 = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const 算 = (): void => {
      const el = 外层.current;
      if (!el) return;
      const 竖 = window.innerHeight > window.innerWidth;
      const 内宽 = 竖 ? 288 : 512;
      const 内高 = 竖 ? 512 : 288;
      const 倍 = Math.max(1, Math.floor(Math.min(window.innerWidth / 内宽, window.innerHeight / 内高)));
      el.style.setProperty('--map-scale', String(倍));
    };
    算();
    window.addEventListener('resize', 算);
    window.addEventListener('orientationchange', 算);
    return () => {
      window.removeEventListener('resize', 算);
      window.removeEventListener('orientationchange', 算);
    };
  }, []);

  const 附近点 = 附近 ? 交互点表.find((p) => p.id === 附近) : null;
  const 是主线 = 目标id !== null && 附近点?.id === 目标id;

  return (
    <div className="map-wrap" ref={外层}>
      {/* Phaser 画布容器：内部固定 512×288，整数放大由 CSS 控制 */}
      <div className="map-canvas" ref={挂载} />

      {/* 左上：当前进度 + 操作说明 */}
      <div className="map-hud">
        <span className="map-day">{段标签}</span>
        <span className="map-tip">方向键或 WASD 走动 · Shift 跑 · 空格交互 · Esc 掏手机</span>
      </div>

      {/* 底部中间：靠近交互点时出现 */}
      {附近点 ? (
        <div className={`map-prompt${是主线 ? ' main' : ''}`}>
          <b>{附近点.名}</b>
          <span className="map-prompt-key">空格</span>
          <span className="map-prompt-act">{附近点.提示}</span>
          {是主线 ? <span className="map-prompt-star">主线</span> : null}
        </div>
      ) : null}

      {/* 右上：掏手机看消息 */}
      <button
        className="map-phone"
        onMouseEnter={() => 播放('选项悬停')}
        onClick={() => {
          播放('按钮');
          掏手机();
        }}
        title="掏出手机（Esc）"
      >
        <span className="map-phone-dot" />
        微信
        <span className="map-phone-key">Esc</span>
      </button>

      {/* 点地图上的同事弹出来的人物卡 */}
      <人物卡 />
    </div>
  );
}
