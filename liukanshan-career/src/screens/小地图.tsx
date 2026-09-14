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

/**
 * **静态层缓存**：地面 / 建筑 / 家具 / 交互点 / 同事头像 —— 这些**几乎不动**。
 *
 * ⚠️⚠️ 为什么要缓存：原来**每帧**都把 45×30 = **1350 个格子**重画一遍
 *    （外加 40+ 件家具、6 个头像）。手机上实测最差帧 **48.6ms**（≈20fps 的卡顿感），
 *    而其中 99% 的绘制内容是永远不变的。
 *    现在静态层画一次缓存起来，每帧只 drawImage 一次 + 画主角那一小块。
 *
 * ⚠️ 缓存键只需要格像素：`NPC表` 是静态的（`NPC排布[0]`），不随段号变。
 * ⚠️ 素材是异步加载的：`取图()` 返回 null 时说明还没加载好，
 *    这时把 `静态待重画` 立起来，下一帧再重画一次（加载完就会显示出来）。
 */
const 静态层 = new Map<number, HTMLCanvasElement>();
let 静态待重画 = true;

/** 静态层：只在尺寸变了、或还有图没加载好时重画 */
function 取静态层(格像素: number): HTMLCanvasElement {
  const W = 地图宽 * 格像素;
  const H = 地图高 * 格像素;
  let cv = 静态层.get(格像素);
  if (!cv || cv.width !== W || cv.height !== H || 静态待重画) {
    if (!cv) {
      cv = document.createElement('canvas');
      静态层.set(格像素, cv);
    }
    cv.width = W;
    cv.height = H;
    画静态层(cv, 格像素);
  }
  return cv;
}

/** 把"不动的那些"画进一张离屏 canvas（每帧不再重画） */
function 画静态层(cv: HTMLCanvasElement, 格像素: number): void {
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const W = 地图宽 * 格像素;
  const H = 地图高 * 格像素;
  静态待重画 = false;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);

  // ① 地面 + 建筑：直接画真实瓦片图的缩略版（墙/门/玻璃一眼能认出来）
  for (let y = 0; y < 地图高; y += 1) {
    for (let x = 0; x < 地图宽; x += 1) {
      const 号 = 网格[y][x];
      const 名 = 瓦片文件[号];
      const img = 名 ? 取图(名) : null;
      if (img) {
        ctx.drawImage(img, x * 格像素, y * 格像素, 格像素, 格像素);
      } else {
        // 图还没加载好，先用底色顶着，并**标记下一帧要重画**（加载完才会显示出来）
        静态待重画 = true;
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
    if (!img) {
      静态待重画 = true;
      continue;
    }
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
  // ⚠️ 下限原来是 8px：小地图缩到 3px/格之后，8px 的头会占掉将近 3 格，比例完全不对。
  //    按格像素本身缩放，只留一个很小的下限。
  const 头尺寸 = Math.max(4, Math.round(格像素 * 2));
  for (const n of NPC表) {
    const img = 取头像(n.名);
    const cx = n.x * 格像素 + 格像素 / 2 - 头尺寸 / 2;
    const cy = n.y * 格像素 + 格像素 / 2 - 头尺寸 / 2;
    if (img) {
      ctx.drawImage(img, cx, cy, 头尺寸, 头尺寸);
    } else {
      静态待重画 = true;
      ctx.fillStyle = '#e04f3f';
      ctx.fillRect(cx, cy, 头尺寸, 头尺寸);
    }
  }

}

/**
 * **每帧只做两件事**：把缓存好的静态层贴上去 + 画主角那一小块。
 *
 * ⚠️ 原来这个函数每帧重画整张地图（1350 格 + 家具 + 头像），手机上是实打实的卡顿源。
 *    现在静态层一次缓存、每帧只 1 次 drawImage。
 */
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
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(取静态层(格像素), 0, 0);

  // ④ 主角：刘看山的头像 + 一圈白边（一眼能找到自己）—— **只有这一小块每帧动**
  if (位置总线.就绪) {
    const img = 取头像('刘看山');
    const px = (位置总线.x / 32) * 格像素;
    const py = (位置总线.y / 32) * 格像素;
    const 头尺寸 = Math.max(4, Math.round(格像素 * 2));
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
  /**
   * 一格画多少像素。
   *
   * ⚠️ 2026-09 用户要求「移动端的小地图做小一点，PC 端不变」：
   *    原来**写死 6**（270×180），在 390px 宽的手机上占了 **69% 的屏幕宽**。
   * ⚠️ 必须是整数：小地图是像素画，非整数缩放会让格线糊掉。
   *    45 格 × 3px = 135px（手机约占 35%）；× 6px = 270px（PC 不变）。
   */
  const 格像素 = useRef(
    typeof window === 'undefined' ? 6 : window.innerWidth < 430 ? 3 : window.innerWidth < 760 ? 4 : 6,
  ).current;
  /** 放大版也按屏宽收：14px/格 = 630px 宽，在手机上会溢出屏幕 */
  const 放大格像素 = useRef(
    typeof window === 'undefined' ? 14 : Math.max(4, Math.min(14, Math.floor((window.innerWidth - 48) / 45))),
  ).current;
  /*
   * ⚠️ 这里原来有个 `setInterval(催, 400)` —— 作用是"素材异步加载完之后重画一次"。
   *    现在静态层自己会检查"有没有图还没加载好"（`静态待重画`）并补画，
   *    所以这个每 400ms 一次的 React 重渲染是纯浪费，删掉。
   */

  useEffect(() => {
    let 停 = 0;
    const 帧 = (): void => {
      const 小图 = 小.current;
      if (小图) 画地图(小图, 格像素);
      const 大图 = 大.current;
      if (大图 && 放大) 画地图(大图, 放大格像素);
      停 = window.requestAnimationFrame(帧);
    };
    停 = window.requestAnimationFrame(帧);
    return () => window.cancelAnimationFrame(停);
  }, [放大]);

  return (
    <>
      <button
        className="map-mini"
       
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
