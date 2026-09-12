/**
 * 图像库（零依赖）—— 所有图像工具的公共底座
 *
 * 提供：PNG 读写、几何操作（裁剪/缩放/拼图）、品红抠图、32 色调色板量化。
 * 之前 4 个工具里各抄了一份 PNG 解码，现在统一到这里。
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { dirname } from 'node:path';

/* ───────────── PNG 解码 ───────────── */
export function 读取PNG(路径) {
  const buffer = readFileSync(路径);
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error(`不是 PNG：${路径}`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let interlace = 0;
  const idat = [];
  let palette = null;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') {
      palette = [];
      for (let i = 0; i < data.length; i += 3) palette.push([data[i], data[i + 1], data[i + 2]]);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (interlace !== 0) throw new Error('不支持交错式 PNG');
  if (bitDepth !== 8) throw new Error(`暂只支持 8 位色深，实际 ${bitDepth}`);

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`不支持的颜色类型 ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }

  const rgb = new Uint8Array(width * height * 3);
  const alpha = new Uint8Array(width * height).fill(255);
  for (let i = 0; i < width * height; i += 1) {
    if (colorType === 3 && palette) {
      const [r, g, b] = palette[out[i]] ?? [0, 0, 0];
      rgb[i * 3] = r;
      rgb[i * 3 + 1] = g;
      rgb[i * 3 + 2] = b;
    } else if (colorType === 0 || colorType === 4) {
      const v = out[i * channels];
      rgb[i * 3] = v;
      rgb[i * 3 + 1] = v;
      rgb[i * 3 + 2] = v;
      if (colorType === 4) alpha[i] = out[i * channels + 1];
    } else {
      rgb[i * 3] = out[i * channels];
      rgb[i * 3 + 1] = out[i * channels + 1];
      rgb[i * 3 + 2] = out[i * channels + 2];
      if (colorType === 6) alpha[i] = out[i * channels + 3];
    }
  }
  return { width, height, rgb, alpha };
}

/* ───────────── PNG 编码 ───────────── */
const crc表 = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crc表[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function 块(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function 写入PNG(路径, img) {
  const { width, height, rgb } = img;
  const 用透明 = Boolean(img.alpha);
  const channels = 用透明 ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const si = (y * width + x) * 3;
      const di = y * (stride + 1) + 1 + x * channels;
      raw[di] = rgb[si];
      raw[di + 1] = rgb[si + 1];
      raw[di + 2] = rgb[si + 2];
      if (用透明) raw[di + 3] = img.alpha[y * width + x];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 用透明 ? 6 : 2;
  mkdirSync(dirname(路径), { recursive: true });
  writeFileSync(
    路径,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      块('IHDR', ihdr),
      块('IDAT', deflateSync(raw, { level: 9 })),
      块('IEND', Buffer.alloc(0)),
    ]),
  );
}

/* ───────────── 32 色调色板 ───────────── */
export const 调色板 = [
  0x6b4423, 0x8f5a33, 0xb87b4a, 0xd9a066, 0xf0c896,
  0x2f5d3a, 0x4a8f4f, 0x7cc26b, 0xa8d98a,
  0x1b3a6b, 0x2c5fa8, 0x4a8fd4, 0x8ec3ee,
  0xffffff, 0xf4f0ea, 0xd8d2c8, 0xa8a29a,
  0xffdcb8, 0xf0c09a, 0xd99e77,
  0x14161c, 0x262a33, 0x454b57, 0x6e7686, 0xa4acbb,
  0xffb020, 0xff7a45, 0xe04f3f, 0x9b6bff,
  0xf7efdd, 0xe8dcc0, 0x241a12,
].map((k) => [(k >> 16) & 0xff, (k >> 8) & 0xff, k & 0xff]);

export function 最近调色板色(r, g, b) {
  let best = 调色板[0];
  let bestD = Infinity;
  for (const c of 调色板) {
    const dr = c[0] - r;
    const dg = c[1] - g;
    const db = c[2] - b;
    const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function 量化(img) {
  const { width, height, rgb } = img;
  const out = new Uint8Array(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    const a = img.alpha ? img.alpha[i] : 255;
    if (a === 0) continue;
    const [r, g, b] = 最近调色板色(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    out[i * 3] = r;
    out[i * 3 + 1] = g;
    out[i * 3 + 2] = b;
  }
  return { ...img, rgb: out };
}

/* ───────────── 几何 ───────────── */
export const 是品红 = (r, g, b) => r > 170 && b > 170 && g < 120;
export const 是背景 = (img, i) => {
  const a = img.alpha ? img.alpha[i] : 255;
  if (a === 0) return true;
  return 是品红(img.rgb[i * 3], img.rgb[i * 3 + 1], img.rgb[i * 3 + 2]);
};

export function 裁剪(img, x0, y0, w, h) {
  const out = new Uint8Array(w * h * 3);
  const alpha = img.alpha ? new Uint8Array(w * h) : null;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const sx = x0 + x;
      const sy = y0 + y;
      const si = (sy * img.width + sx) * 3;
      const di = (y * w + x) * 3;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) {
        out[di] = 255;
        out[di + 1] = 0;
        out[di + 2] = 255;
        if (alpha) alpha[y * w + x] = 0;
        continue;
      }
      out[di] = img.rgb[si];
      out[di + 1] = img.rgb[si + 1];
      out[di + 2] = img.rgb[si + 2];
      if (alpha) alpha[y * w + x] = img.alpha[si / 3];
    }
  }
  return { width: w, height: h, rgb: out, alpha };
}

/** 自动裁掉四周背景，返回内容边界盒（找不到内容返回 null） */
export function 内容边界(img, 范围) {
  const x0 = 范围?.x0 ?? 0;
  const y0 = 范围?.y0 ?? 0;
  const x1 = 范围?.x1 ?? img.width - 1;
  const y1 = 范围?.y1 ?? img.height - 1;
  let minX = x1;
  let maxX = x0;
  let minY = y1;
  let maxY = y0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const i = y * img.width + x;
      if (!是背景(img, i)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { minX, maxX, minY, maxY, 宽: maxX - minX + 1, 高: maxY - minY + 1 };
}

/** 缩放到指定尺寸（面积平均），可选是否保留 alpha */
export function 缩放到(src, dstW, dstH) {
  const out = new Uint8Array(dstW * dstH * 3);
  const alpha = src.alpha ? new Uint8Array(dstW * dstH) : null;
  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const sx0 = (x * src.width) / dstW;
      const sx1 = ((x + 1) * src.width) / dstW;
      const sy0 = (y * src.height) / dstH;
      const sy1 = ((y + 1) * src.height) / dstH;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let w = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy += 1) {
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx += 1) {
          if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
          const wx = Math.min(sx1, sx + 1) - Math.max(sx0, sx);
          const wy = Math.min(sy1, sy + 1) - Math.max(sy0, sy);
          const ww = Math.max(0, wx) * Math.max(0, wy);
          if (ww <= 0) continue;
          const si = (sy * src.width + sx) * 3;
          const sa = src.alpha ? src.alpha[sy * src.width + sx] / 255 : 1;
          r += src.rgb[si] * ww * sa;
          g += src.rgb[si + 1] * ww * sa;
          b += src.rgb[si + 2] * ww * sa;
          a += sa * ww;
          w += ww;
        }
      }
      const di = (y * dstW + x) * 3;
      if (a > 0) {
        out[di] = Math.round(r / a);
        out[di + 1] = Math.round(g / a);
        out[di + 2] = Math.round(b / a);
      }
      if (alpha) alpha[y * dstW + x] = w > 0 ? Math.round((a / w) * 255) : 0;
    }
  }
  return { width: dstW, height: dstH, rgb: out, alpha };
}

/** 缩放到指定尺寸（整数倍降采样 + 块众数取样）——像素块最规整，适合精灵 */
export function 缩放到_块众数(src, dstW, dstH) {
  const out = new Uint8Array(dstW * dstH * 3);
  const alpha = src.alpha ? new Uint8Array(dstW * dstH) : null;
  const fx = src.width / dstW;
  const fy = src.height / dstH;
  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const sx0 = Math.floor(x * fx);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * fx));
      const sy0 = Math.floor(y * fy);
      const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * fy));
      const counts = new Map();
      let aSum = 0;
      let aCount = 0;
      for (let sy = sy0; sy < sy1 && sy < src.height; sy += 1) {
        for (let sx = sx0; sx < sx1 && sx < src.width; sx += 1) {
          const si = sy * src.width + sx;
          const sa = src.alpha ? src.alpha[si] : 255;
          aSum += sa;
          aCount += 1;
          if (sa < 128) continue;
          const key = (src.rgb[si * 3] << 16) | (src.rgb[si * 3 + 1] << 8) | src.rgb[si * 3 + 2];
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      let bestKey = 0;
      let bestCount = -1;
      for (const [key, count] of counts) {
        if (count > bestCount) {
          bestCount = count;
          bestKey = key;
        }
      }
      const di = (y * dstW + x) * 3;
      out[di] = (bestKey >> 16) & 0xff;
      out[di + 1] = (bestKey >> 8) & 0xff;
      out[di + 2] = bestKey & 0xff;
      if (alpha) alpha[y * dstW + x] = aCount > 0 ? Math.round(aSum / aCount) : 0;
    }
  }
  return { width: dstW, height: dstH, rgb: out, alpha };
}

/** 品红转透明（就地生成 alpha 通道） */
export function 抠品红(img) {
  const alpha = new Uint8Array(img.width * img.height);
  const rgb = new Uint8Array(img.rgb);
  for (let i = 0; i < img.width * img.height; i += 1) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    if (img.alpha && img.alpha[i] < 128) {
      alpha[i] = 0;
      continue;
    }
    if (是品红(r, g, b)) {
      alpha[i] = 0;
    } else {
      alpha[i] = 255;
    }
  }
  return { ...img, rgb, alpha };
}

/** 直接当背景的整图（不抠图、不加 alpha） */
export function 不透明(img) {
  return { width: img.width, height: img.height, rgb: img.rgb };
}

/**
 * 加 1 像素外描边（降采样后必做）
 *
 * 为什么需要：AI 原图在 1024 画布上的描边约 2px，缩到 32×48 时缩放倍数约 15，
 * 2px 描边被平均成 0.13px —— 直接糊掉，角色只剩一圈发暖的模糊边，
 * 放到花哨的场景上就分不清了。所以缩完要重新描一圈。
 */
export function 加描边(img, 颜色 = [0x24, 0x1a, 0x12]) {
  const { width, height, rgb } = img;
  const alpha = img.alpha ? img.alpha : new Uint8Array(width * height).fill(255);
  const 新alpha = new Uint8Array(alpha);
  const 新rgb = new Uint8Array(rgb);
  const 不透明 = (x, y) => x >= 0 && y >= 0 && x < width && y < height && alpha[y * width + x] >= 128;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (不透明(x, y)) continue;
      if (!(不透明(x - 1, y) || 不透明(x + 1, y) || 不透明(x, y - 1) || 不透明(x, y + 1))) continue;
      const i = y * width + x;
      新alpha[i] = 255;
      新rgb[i * 3] = 颜色[0];
      新rgb[i * 3 + 1] = 颜色[1];
      新rgb[i * 3 + 2] = 颜色[2];
    }
  }
  return { width, height, rgb: 新rgb, alpha: 新alpha };
}
/**
 * 去品红毛边（抠图后必做）
 *
 * 问题：物体与品红背景之间的抗锯齿过渡像素，既不是纯品红（抠不掉），
 * 也不是物体色——量化后会被映射成橙红色，形成一圈难看的描边。
 *
 * 两个处理：
 *   1. alpha 低于阈值的像素一律判为背景（把这些"半背景"像素清掉）
 *   2. 颜色仍然偏品红的像素也清掉（双保险）
 */
export function 去毛边(img, 阈值 = 224) {
  const { width, height, rgb } = img;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const 原alpha = img.alpha ? img.alpha[i] : 255;
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const 偏品红 = r > 140 && b > 140 && g < Math.max(r, b) * 0.62;
    alpha[i] = 原alpha >= 阈值 && !偏品红 ? 255 : 0;
  }
  return { ...img, rgb: new Uint8Array(rgb), alpha };
}

/** 把若干小图横向/网格拼成一张预览图 */
export function 拼图(小图们, 列数, 间距 = 8, 底色 = [232, 232, 236]) {
  const 行数 = Math.ceil(小图们.length / 列数);
  const 格宽 = Math.max(...小图们.map((t) => t.width));
  const 格高 = Math.max(...小图们.map((t) => t.height));
  const W = 间距 + 列数 * (格宽 + 间距);
  const H = 间距 + 行数 * (格高 + 间距);
  const rgb = new Uint8Array(W * H * 3);
  for (let i = 0; i < W * H; i += 1) {
    rgb[i * 3] = 底色[0];
    rgb[i * 3 + 1] = 底色[1];
    rgb[i * 3 + 2] = 底色[2];
  }
  const alpha = new Uint8Array(W * H).fill(255);
  小图们.forEach((t, idx) => {
    const cx = 间距 + (idx % 列数) * (格宽 + 间距);
    const cy = 间距 + Math.floor(idx / 列数) * (格高 + 间距);
    for (let y = 0; y < t.height; y += 1) {
      for (let x = 0; x < t.width; x += 1) {
        const si = (y * t.width + x) * 3;
        const sa = t.alpha ? t.alpha[y * t.width + x] : 255;
        if (sa < 128) continue;
        const di = ((cy + y) * W + cx + x) * 3;
        rgb[di] = t.rgb[si];
        rgb[di + 1] = t.rgb[si + 1];
        rgb[di + 2] = t.rgb[si + 2];
      }
    }
  });
  return { width: W, height: H, rgb, alpha };
}
