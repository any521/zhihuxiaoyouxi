import { useEffect, useRef, type ReactElement } from 'react';
import Phaser from 'phaser';
import { VIEWPORT, VIEW_H, VIEW_W, gameConfig } from '../game/config';
import { usePixelFit } from './usePixelFit';
import { CompactBars, CompactFoot, StatusRail, StoryRail, Toasts, TopBar } from './Hud';
import { StartOverlay } from './StartOverlay';
import { ResultPanel } from './ResultPanel';
import { PauseMenu } from './PauseMenu';
import { useGameStore } from '../state/store';

/** 工位名牌：Phaser 只负责算坐标，文字用 HTML 画，避免 9px 中文糊掉 */
function StationLabels({ scale }: { scale: number }): ReactElement {
  const labels = useGameStore((s) => s.stationLabels);
  return (
    <>
      {labels.map((l) => (
        <span
          key={l.kind}
          className={`station-label${l.工序 ? ' machine' : ''}`}
          style={{ left: l.x * scale, top: l.y * scale }}
        >
          {l.label}
        </span>
      ))}
    </>
  );
}

export function App(): ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const layout = usePixelFit();
  const { scale, width, height } = layout;

  useEffect(() => {
    if (gameRef.current || !hostRef.current) return;
    gameRef.current = new Phaser.Game(gameConfig);
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__lksGame = gameRef.current;
    }
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__lksLayout = layout;
    }
  }, [layout]);

  /**
   * 朝向变化 = 换了一套内部分辨率（横 512×288 / 竖 288×512），关卡布局也随之切换。
   * 原型阶段直接重载最省事，正式版改为运行时换画幅 + 重建关卡。
   */
  useEffect(() => {
    const onOrientation = (): void => {
      const expected = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
      if (expected !== VIEWPORT.orientation) window.location.reload();
    };
    window.addEventListener('orientationchange', onOrientation);
    window.addEventListener('resize', onOrientation);
    return () => {
      window.removeEventListener('orientationchange', onOrientation);
      window.removeEventListener('resize', onOrientation);
    };
  }, []);

  /**
   * 全局布局：顶部订单条 + 左右边栏 + 中间画布。
   * 边栏**叠在画布两侧的黑边上**（不参与算缩放），所以画布能拿到最大整数倍；
   * 黑边不够宽（手机）就收成上下窄栏 + 画布下方一条剧情栏。
   */
  const 窄屏 = !layout.wide;
  const 栏宽 = Math.max(150, Math.min(244, layout.offsetX - 22));

  return (
    <div className={`stage${窄屏 ? ' narrow' : ''}`}>
      {窄屏 ? <CompactBars /> : <TopBar />}
      <div className="stage-main">
        {!窄屏 && (
          <div className="rail-holder" style={{ width: layout.offsetX }}>
            <StoryRail width={栏宽} />
          </div>
        )}
        <div className="frame" style={{ width, height }}>
          <div id="game-root" ref={hostRef} />
          <StationLabels scale={scale} />
          <StartOverlay />
          <PauseMenu />
          <ResultPanel />
        </div>
        {!窄屏 && (
          <div className="rail-holder" style={{ width: layout.offsetX }}>
            <StatusRail width={栏宽} />
          </div>
        )}
      </div>
      {窄屏 && <CompactFoot />}
      <Toasts layout={layout} />
      <div className="debug-tag">
        {VIEWPORT.orientation === 'portrait' ? '竖版' : '横版'} {VIEW_W}×{VIEW_H} → {width}×{height} · ×
        {scale} · nearest · roundPixels
      </div>
    </div>
  );
}
