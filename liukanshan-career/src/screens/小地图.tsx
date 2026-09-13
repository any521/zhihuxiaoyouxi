/**
 * 小地图。
 *
 * 右上角一块缩略图，点一下放大（再点收起）。
 *
 * 画法：**直接用真实的素材图**，不是色块 ——
 *   · 建筑：把瓦片图（墙/门/玻璃/地毯…）按缩放画成缩略版，所以墙和门一眼能认出来
 *   · 人物：用各角色自己的**头像**（`头像(谁)`），不是圆点
 *   · 可交互点：小黄点
 *
 * 性能：主角位置不走 React state，用 requestAnimationFrame 直接读 位置总线 再画，
 * 走起来不会触发整棵 React 树重渲染。
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { 地图宽, 地图高, 网格, 瓦片, 交互点表, NPC表, 道具表 } from '../game/map/level';
import { 位置总线 } from '../game/map/位置总线';
import { 头像 } from '../story/assets';
import { 播放 } from '../story/audio';

/** 瓦片编号 → 游戏里的瓦片文件名 */
const 瓦片文件: Record<number, string> = {
  [瓦片.浅灰地毯]: 'tile_carpet_grey',
  [瓦片.深灰地毯]: 'tile_carpet_dark',
  [瓦片.防滑砖]: 'tile_antislip',
  [瓦片.抛光砖]: 'tile_polished',
  [瓦片.走廊地砖]: 'tile_tile',
  [瓦片.木地板]: 'tile_wood',
  [瓦片.白墙]: 'tile_wall',
  [瓦片.玻璃]: 'tile_glass',
  [瓦片.门横左]: 'tile_door_h_l',
  [瓦片.门横右]: 'tile_door_h_r',
  [瓦片.门竖上]: 'tile_door_v_u',
  [瓦片.门竖下]: 'tile_door_v_d',
  [瓦片.门横左关]: 'tile_door_h_l_c',
  [瓦片.门横右关]: 'tile_door_h_r_c',
  [瓦片.门竖上关]: 'tile_door_v_u_c',
  [瓦片.门竖下关]: 'tile_door_v_d_c',
  [瓦片.桌面]: 'tile_desk',
};

const 图缓存 = new Map<string, HTMLImageElement>();

function 取图(名: string): HTMLImageElement | null {
  const 有 = 图缓存.get(名);
  if (有) return 有.complete && 有.naturalWidth > 0 ? 有 : null;
  const img = new Image();
  img.src = new URL(`assets/map/${名}.png`, document.baseURI).href;
  图缓存.set(名, img);
  return null;
}

function 取头像(谁: string): HTMLImageElement | null {
  const 键 = `face:${谁}`;
  const 有 = 图缓存.get(键);
  if (有) return 有.complete && 有.naturalWidth > 0 ? 有 : null;
  const url = 头像(谁 as never);
  if (!url) return null;
  const img = new Image();
  img.src = url;
  图缓存.set(键, img);
  return null;
}

/** 把小地图画到 canvas 上 */
function 画地图(cv: HTMLCanvasElement, 格像素: number): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const W = 地图宽 * 格像素;
  const H = 地图高 * 格像素;
  if (cv.width !== W || cv.height !== H) {
    cv.width = W;
    cv.height = H;
  }
  ctx.imageSmoothingEnabled = false;

  // ① 地面 + 建筑：直接画真实瓦片图的缩略版（墙/门/玻璃一眼能认出来）
  for (let y = 0; y < 地图高; y += 1) {
    for (let x = 0; x < 地图宽; x += 1) {
      const 号 = 网格[y][x];
      const 名 = 瓦片文件[号];
      const img = 名 ? 取图(名) : null;
      if (img) {
        ctx.drawImage(img, x * 格像素, y * 格像素, 格像素, 格像素);
      } else {
        // 图还没加载好，先用底色顶着
        ctx.fillStyle = '#a8a29a';
        ctx.fillRect(x * 格像素, y * 格像素, 格像素, 格像素);
      }
    }
  }

  // ①b 家具道具：也用各自的素材图缩略画（桌子/打印机/沙发…）
  //     原点约定和游戏里一致：贴底居中
  const 道具高 = (48 / 32) * 格像素;
  for (const p of 道具表) {
    const img = 取图(p.图);
    if (!img) continue;
    const w = (img.naturalWidth / 32) * 格像素;
    const cx = (p.x + 0.5) * 格像素;
    const cy = (p.y + 1) * 格像素;
    ctx.drawImage(img, cx - w / 2, cy - 道具高, w, 道具高);
  }

  // ② 可交互点：小黄点
  ctx.fillStyle = '#ffcb6b';
  const d = Math.max(2, 格像素 * 0.4);
  for (const p of 交互点表) {
    ctx.fillRect(p.x * 格像素 + 格像素 / 2 - d / 2, p.y * 格像素 + 格像素 / 2 - d / 2, d, d);
  }

  // ③ 同事：用各自的头像
  const 头尺寸 = Math.max(8, 格像素 * 2);
  for (const n of NPC表) {
    const img = 取头像(n.名);
    const cx = n.x * 格像素 + 格像素 / 2 - 头尺寸 / 2;
    const cy = n.y * 格像素 + 格像素 / 2 - 头尺寸 / 2;
    if (img) {
      ctx.drawImage(img, cx, cy, 头尺寸, 头尺寸);
    } else {
      ctx.fillStyle = '#e04f3f';
      ctx.fillRect(cx, cy, 头尺寸, 头尺寸);
    }
  }

  // ④ 主角：刘看山的头像 + 一圈白边（一眼能找到自己）
  if (位置总线.就绪) {
    const img = 取头像('刘看山');
    const px = (位置总线.x / 32) * 格像素;
    const py = (位置总线.y / 32) * 格像素;
    const 自己尺寸 = 头尺寸 * 1.15;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, 格像素 * 0.3);
    ctx.strokeRect(px - 自己尺寸 / 2, py - 自己尺寸 / 2, 自己尺寸, 自己尺寸);
    if (img) {
      ctx.drawImage(img, px - 自己尺寸 / 2, py - 自己尺寸 / 2, 自己尺寸, 自己尺寸);
    } else {
      ctx.fillStyle = '#4a8f4f';
      ctx.fillRect(px - 自己尺寸 / 2, py - 自己尺寸 / 2, 自己尺寸, 自己尺寸);
    }
  }
}

export function 小地图(): ReactElement {
  const 小 = useRef<HTMLCanvasElement>(null);
  const 大 = useRef<HTMLCanvasElement>(null);
  const [放大, set放大] = useState(false);
  /** 素材加载完了就重画一次（不然第一帧都是底色）*/
  const [, 催] = useState(0);

  // 素材是异步的，加载完踢一脚重画
  useEffect(() => {
    const t = window.setInterval(() => 催((v) => v + 1), 400);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    let 停 = 0;
    const 帧 = (): void => {
      const 小图 = 小.current;
      if (小图) 画地图(小图, 6);
      const 大图 = 大.current;
      if (大图 && 放大) 画地图(大图, 14);
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
              <span>
                <i style={{ background: '#ffffff', outline: '2px solid #4a8f4f' }} />你
              </span>
              <span>同事＝各自头像</span>
              <span>
                <i style={{ background: '#ffcb6b' }} />可交互
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
