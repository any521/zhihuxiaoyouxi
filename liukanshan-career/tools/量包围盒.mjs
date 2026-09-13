/**
 * 量一张地图道具 PNG 的**内容包围盒**（跳过透明像素）。
 *
 * ⚠️ 为什么不能用眼睛估：这些图都是 44×48 的固定画布，物体在画布里偏上还是偏下
 *    光看缩略图根本看不出来（透明度看不出）。摆位对不对全靠这几个数字。
 *
 * 用法：node tools/量包围盒.mjs prop_ws_办公桌 prop_ws_转椅 ...
 *      node tools/量包围盒.mjs --全部
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

/* ── 最小 PNG 解码（只支持我们自己的 8 位 RGBA / 调色板带 tRNS，够用）── */
import { inflateSync } from 'node:zlib';

function 解码PNG(buf) {
  let p = 8;
  const 块 = {};
  let 宽 = 0;
  let 高 = 0;
  let 位深 = 0;
  let 色型 = 0;
  const 数据 = [];
  while (p < buf.length) {
    const 长 = buf.readUInt32BE(p);
    const 型 = buf.toString('ascii', p + 4, p + 8);
    const 体 = buf.subarray(p + 8, p + 8 + 长);
    if (型 === 'IHDR') {
      宽 = 体.readUInt32BE(0);
      高 = 体.readUInt32BE(4);
      位深 = 体[8];
      色型 = 体[9];
    } else if (型 === 'IDAT') {
      数据.push(体);
    } else if (型 === 'PLTE') {
      块.PLTE = 体;
    } else if (型 === 'tRNS') {
      块.tRNS = 体;
    }
    p += 12 + 长;
  }
  if (位深 !== 8) throw new Error(`只支持 8 位，实际 ${位深}`);
  const 原 = inflateSync(Buffer.concat(数据));
  const 通道 = 色型 === 6 ? 4 : 色型 === 2 ? 3 : 色型 === 3 ? 1 : 0;
  if (!通道) throw new Error(`不支持的色型 ${色型}`);

  // 反滤波
  const 行 = 宽 * 通道;
  const out = Buffer.alloc(行 * 高);
  let q = 0;
  for (let y = 0; y < 高; y += 1) {
    const 滤波 = 原[q];
    q += 1;
    for (let i = 0; i < 行; i += 1) {
      const 新 = 原[q + i];
      const a = i >= 通道 ? out[y * 行 + i - 通道] : 0;
      const b = y > 0 ? out[(y - 1) * 行 + i] : 0;
      const c = i >= 通道 && y > 0 ? out[(y - 1) * 行 + i - 通道] : 0;
      let 值 = 新;
      if (滤波 === 1) 值 += a;
      else if (滤波 === 2) 值 += b;
      else if (滤波 === 3) 值 += (a + b) >> 1;
      else if (滤波 === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        值 += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      值 &= 255;
      out[y * 行 + i] = 值;
    }
    q += 行;
  }

  // 取 alpha
  const alpha = new Uint8Array(宽 * 高);
  if (色型 === 6) {
    for (let i = 0; i < 宽 * 高; i += 1) alpha[i] = out[i * 4 + 3];
  } else if (色型 === 2) {
    alpha.fill(255);
  } else {
    const t = 块.tRNS;
    const n = 块.PLTE.length / 3;
    for (let i = 0; i < 宽 * 高; i += 1) {
      const idx = out[i];
      alpha[i] = t && idx < t.length && t[idx] === 0 ? 0 : 255;
      if (!t && idx >= n) alpha[i] = 255;
    }
  }
  return { 宽, 高, alpha };
}

/** 内容包围盒 + 重心。框 = [x1,y1,x2,y2] 用来只量精灵表里的某一帧 */
function 量(alpha, 宽, 高, 框) {
  const [bx1, by1, bx2, by2] = 框 ?? [0, 0, 宽 - 1, 高 - 1];
  let x1 = 宽;
  let y1 = 高;
  let x2 = -1;
  let y2 = -1;
  let 数 = 0;
  let 和x = 0;
  let 和y = 0;
  for (let y = by1; y <= by2; y += 1) {
    for (let x = bx1; x <= bx2; x += 1) {
      if (alpha[y * 宽 + x] < 128) continue;
      数 += 1;
      和x += x;
      和y += y;
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
    }
  }
  if (!数) return null;
  return {
    包围盒: [x1, y1, x2, y2],
    相对: [x1 - bx1, y1 - by1, x2 - bx1, y2 - by1],
    内容: `${x2 - x1 + 1}×${y2 - y1 + 1}`,
    内容中心: [+((x1 + x2) / 2).toFixed(1), +((y1 + y2) / 2).toFixed(1)],
    重心: [+(和x / 数).toFixed(1), +(和y / 数).toFixed(1)],
    画布: [宽, 高],
    画布中心: [+ (宽 / 2 - 0.5).toFixed(1), +(高 / 2 - 0.5).toFixed(1)],
    底部留白: 高 - 1 - y2,
    顶部留白: y1,
    像素数: 数,
  };
}

function 打印(短, r) {
  if (!r) {
    console.log(短.padEnd(24) + '（全透明）');
    return;
  }
  console.log(
    短.padEnd(24) +
      `${String(r.画布[0]).padStart(3)}×${String(r.画布[1]).padEnd(4)}` +
      r.内容.padEnd(9) +
      `[${r.包围盒.join(',')}]`.padEnd(22) +
      `(${r.内容中心[0]},${r.内容中心[1]})`.padEnd(12) +
      `(${r.重心[0]},${r.重心[1]})`.padEnd(12) +
      String(r.顶部留白).padStart(4) +
      String(r.底部留白).padStart(6),
  );
}

const 目录 = resolve('public/assets/map');
const 参数 = process.argv.slice(2);
const 拆帧 = 参数.includes('--帧');
const 名单 = 参数.includes('--全部')
  ? readdirSync(目录).filter((f) => f.endsWith('.png') && !f.startsWith('tile_'))
  : 参数.filter((a) => !a.startsWith('--')).map((a) => (a.endsWith('.png') ? a : `${a}.png`));

console.log('名称'.padEnd(26) + '画布    内容      包围盒(x1,y1,x2,y2)  内容中心   重心        上留白 下留白');
console.log('-'.repeat(110));
for (const 名 of 名单) {
  const buf = readFileSync(resolve(目录, 名));
  const { 宽, 高, alpha } = 解码PNG(buf);
  const 短 = basename(名, '.png');
  const 要拆帧 = 拆帧 && /^(sit_|chr_|npc_)/.test(短);
  const 帧数 = 要拆帧 ? Math.round(宽 / 高) : 1;
  const 帧宽 = 宽 / 帧数;
  for (let f = 0; f < 帧数; f += 1) {
    const r = 量(alpha, 宽, 高, 要拆帧 ? [f * 帧宽, 0, (f + 1) * 帧宽 - 1, 高 - 1] : undefined);
    if (!r) {
      console.log(`${短} 帧${f}`.padEnd(24) + '（全透明）');
      continue;
    }
    if (要拆帧) {
      // 拆帧时把坐标换算回"帧内坐标"，再和 帧宽×帧高 比
      const 局 = 量(alpha, 宽, 高, [f * 帧宽, 0, (f + 1) * 帧宽 - 1, 高 - 1]);
      局.画布 = [帧宽, 高];
      局.画布中心 = [+(帧宽 / 2 - 0.5).toFixed(1), +(高 / 2 - 0.5).toFixed(1)];
      局.内容中心 = [+((局.包围盒[0] + 局.包围盒[2]) / 2 - f * 帧宽).toFixed(1), 局.内容中心[1]];
      局.重心 = [+(局.重心[0] - f * 帧宽).toFixed(1), 局.重心[1]];
      局.包围盒 = 局.相对;
      打印(`  ${短} 帧${f}`, 局);
    } else {
      打印(短, r);
    }
  }
}
