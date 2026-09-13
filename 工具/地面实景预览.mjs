/**
 * 地面实景预览（零依赖）
 *
 * 把 6 张瓦片按办公区的布局铺成一张 512×288 的实景图，
 * 再叠上主角与几件道具，用来判断"地板会不会抢角色"。
 *
 * 用法：node 工具/地面实景预览.mjs
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG, 写入PNG } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 瓦片目录 = join(根, '美术/素材库/成品/瓦片v2');
const 读 = (p) => (existsSync(p) ? 读取PNG(p) : null);

const 瓦片 = {
  地毯: 读(join(瓦片目录, '瓦片_地面_办公地毯.png')),
  地砖: 读(join(瓦片目录, '瓦片_地面_走廊地砖.png')),
  木地板: 读(join(瓦片目录, '瓦片_地面_木地板.png')),
  白墙: 读(join(瓦片目录, '瓦片_墙面_办公白墙.png')),
  玻璃: 读(join(瓦片目录, '瓦片_墙面_玻璃隔断.png')),
  桌面: 读(join(瓦片目录, '瓦片_台面_木质桌面.png')),
};

const W = 512;
const H = 288;
const T = 32;
const 画布 = new Uint8Array(W * H * 3);

/** 在整张瓦片图里按像素坐标取色（自动平铺） */
function 铺(图, 左, 上, 宽, 高) {
  for (let y = 0; y < 高; y += 1) {
    for (let x = 0; x < 宽; x += 1) {
      const px = 左 + x;
      const py = 上 + y;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const sx = x % T;
      const sy = y % T;
      const si = (sy * T + sx) * 3;
      const di = (py * W + px) * 3;
      画布[di] = 图.rgb[si];
      画布[di + 1] = 图.rgb[si + 1];
      画布[di + 2] = 图.rgb[si + 2];
    }
  }
}

/** 把一张带透明的精灵叠上去 */
function 叠(图, 左, 上) {
  if (!图 || !图.alpha) return;
  for (let y = 0; y < 图.height; y += 1) {
    for (let x = 0; x < 图.width; x += 1) {
      if (图.alpha[y * 图.width + x] < 128) continue;
      const px = 左 + x;
      const py = 上 + y;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const si = (y * 图.width + x) * 3;
      const di = (py * W + px) * 3;
      画布[di] = 图.rgb[si];
      画布[di + 1] = 图.rgb[si + 1];
      画布[di + 2] = 图.rgb[si + 2];
    }
  }
}

// ── 铺地面 ──
// 顶部：白墙（办公室的墙）
铺(瓦片.白墙, 0, 0, W, T * 2);
// 走廊（横向一条）：地砖
铺(瓦片.地砖, 0, T * 2, W, T * 2);
// 左下：工位区地毯
铺(瓦片.地毯, 0, T * 4, W, H - T * 4);
// 右下：会议区木地板
铺(瓦片.木地板, W / 2 + T, T * 4, W / 2 - T, H - T * 4);
// 中间：一道竖向玻璃隔断（把工位区和会议区分开）
铺(瓦片.玻璃, W / 2 - T, T * 4, T, H - T * 4);
// 会议区里放一张桌面材质的长桌
铺(瓦片.桌面, W / 2 + T * 2, H - T * 3, T * 5, T * 2);

// ── 叠角色与道具 ──
const 角色目录 = join(根, '美术/素材库/成品/角色');
const 主角 = 读(join(角色目录, '刘看山_三视图/正面.png'));
const 侧面 = 读(join(角色目录, '刘看山_三视图/侧面.png'));
const 学长 = 读(join(角色目录, '学长_三视图/正面.png'));
const 林总 = 读(join(角色目录, '林总_三视图/正面.png'));
const 周岚 = 读(join(角色目录, '周岚_三视图/正面.png'));

// 角色站在走廊与工位区上（脚底贴地）
叠(主角, 180, 66);    // 走廊上
叠(侧面, 220, 66);
叠(学长, 260, 70);
// 地毯区（工位区）站两个人
叠(林总, 60, 190);
叠(周岚, 130, 194);

const 道具目录 = join(根, '美术/素材库/成品/道具');
for (const [子目录, 名, x, y] of [
  ['办公设备', '资料架', 20, 8],
  ['办公设备', '打印机', 150, 8],
  ['办公设备', '投递箱', 420, 20],
  ['展位', '折叠展位桌', 330, 200],
  ['小物', '绿萝', 470, 150],
  ['小物', '纸箱', 30, 240],
]) {
  const p = join(道具目录, 子目录, `${名}.png`);
  const 图 = 读(p);
  if (图) 叠(图, x, y);
}

const 输出 = join(根, '美术/素材库/成品/_瓦片平铺测试/地面实景预览.png');
写入PNG(输出, { width: W, height: H, rgb: 画布 });

// 放大 2 倍便于看
const S = 2;
const 放大 = new Uint8Array(W * S * H * S * 3);
for (let y = 0; y < H * S; y += 1) {
  for (let x = 0; x < W * S; x += 1) {
    const si = (Math.floor(y / S) * W + Math.floor(x / S)) * 3;
    const di = (y * W * S + x) * 3;
    放大[di] = 画布[si];
    放大[di + 1] = 画布[si + 1];
    放大[di + 2] = 画布[si + 2];
  }
}
写入PNG(join(根, '美术/素材库/成品/_瓦片平铺测试/地面实景预览_2x.png'), {
  width: W * S,
  height: H * S,
  rgb: 放大,
});

console.log('实景预览：512×288（游戏内部分辨率）');
console.log(`输出：${输出}`);
console.log(`放大：${join(根, '美术/素材库/成品/_瓦片平铺测试/地面实景预览_2x.png')}`);
