/**
 * 小地图。
 *
 * 右上角一块缩略图，点一下放大成大图（再点收起）。
 * 用 canvas 按**瓦片网格**直接画色块 —— 比截图便宜得多，也比贴图稳。
 *
 * 性能：位置不走 React state，用 requestAnimationFrame 直接读 位置总线 再画，
 * 所以主角走动时不会触发整棵 React 树重渲染。
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { 地图宽, 地图高, 网格, 瓦片, 交互点表, NPC表 } from '../game/map/level';
import { 位置总线 } from '../game/map/位置总线';
import { 播放 } from '../story/audio';

/** 每种瓦片在小地图上用什么颜色 */
const 色表: Record<number, string> = {
  [瓦片.浅灰地毯]: '#a8a29a',
  [瓦片.深灰地毯]: '#6e7686',
  [瓦片.防滑砖]: '#c9c1b4',
  [瓦片.抛光砖]: '#454b57',
  [瓦片.走廊地砖]: '#d8d2c8',
  [瓦片.木地板]: '#b87b4a',
  [瓦片.白墙]: '#e8dcc0',
  [瓦片.玻璃]: '#8ec3ee',
  [瓦片.门横]: '#f0c896',
  [瓦片.门竖]: '#f0c896',
  [瓦片.桌面]: '#f0c896',
};

/** 把整张地图画到一块 canvas 上（一格 = px 像素） */
function 画地图(cv: HTMLCanvasElement, 格像素: number, 画玩家: boolean): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  cv.width = 地图宽 * 格像素;
  cv.height = 地图高 * 格像素;
  ctx.imageSmoothingEnabled = false;

  for (let y = 0; y < 地图高; y += 1) {
    for (let x = 0; x < 地图宽; x += 1) {
      ctx.fillStyle = 色表[网格[y][x]] ?? '#000';
      ctx.fillRect(x * 格像素, y * 格像素, 格像素, 格像素);
    }
  }

  // 交互点：小黄点
  ctx.fillStyle = '#ffcb6b';
  for (const p of 交互点表) {
    ctx.fillRect(p.x * 格像素, p.y * 格像素, 格像素, 格像素);
  }

  // 同事：小红点
  ctx.fillStyle = '#e04f3f';
  for (const n of NPC表) {
    ctx.fillRect(n.x * 格像素 + 格像素 * 0.25, n.y * 格像素, 格像素 * 0.5, 格像素 * 0.5);
  }

  // 玩家：绿点（带一圈白边，尺寸大一点，一眼能找到）
  if (画玩家 && 位置总线.就绪) {
    const px = (位置总线.x / 32) * 格像素;
    const py = (位置总线.y / 32) * 格像素;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, py, 格像素 * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a8f4f';
    ctx.beginPath();
    ctx.arc(px, py, 格像素 * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function 小地图(): ReactElement {
  const 小 = useRef<HTMLCanvasElement>(null);
  const 大 = useRef<HTMLCanvasElement>(null);
  const [放大, set放大] = useState(false);

  // 静态部分只画一次；玩家那一点每帧重画（很小一块，开销可以忽略）
  useEffect(() => {
    const 小图 = 小.current;
    if (小图) 画地图(小图, 3, false);
    const 大图 = 大.current;
    if (大图) 画地图(大图, 12, false);
  }, [放大]);

  useEffect(() => {
    let 停 = 0;
    const 帧 = (): void => {
      // 小地图：先清掉旧的玩家点再重画整张（小，3px/格，很快）
      const 小图 = 小.current;
      if (小图) {
        const ctx = 小图.getContext('2d');
        if (ctx && 位置总线.就绪) {
          画地图(小图, 3, true);
        }
      }
      const 大图 = 大.current;
      if (大图 && 放大) {
        const ctx = 大图.getContext('2d');
        if (ctx && 位置总线.就绪) 画地图(大图, 12, true);
      }
      停 = window.requestAnimationFrame(帧);
    };
    停 = window.requestAnimationFrame(帧);
    return () => window.cancelAnimationFrame(停);
  }, [放大]);

  return (
    <>
      <button
        className="map-mini"
        onMouseEnter={() => 播放('选项悬停')}
        onClick={() => {
          播放('按钮');
          set放大((v) => !v);
        }}
        title="小地图（点击放大）"
        aria-label="小地图，点击放大"
      >
        <canvas ref={小} />
      </button>

      {放大 ? (
        <div
          className="map-mini-full"
          onClick={() => {
            播放('按钮');
            set放大(false);
          }}
        >
          <div className="map-mini-full-box" onClick={(e) => e.stopPropagation()}>
            <header className="map-mini-full-head">
              <h2>楼层平面图</h2>
              <button
                className="map-mini-full-close"
                onMouseEnter={() => 播放('选项悬停')}
                onClick={() => {
                  播放('按钮');
                  set放大(false);
                }}
              >
                关闭
              </button>
            </header>
            <canvas ref={大} />
            <div className="map-mini-legend">
              <span><i style={{ background: '#4a8f4f' }} />你</span>
              <span><i style={{ background: '#e04f3f' }} />同事</span>
              <span><i style={{ background: '#ffcb6b' }} />可交互</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
