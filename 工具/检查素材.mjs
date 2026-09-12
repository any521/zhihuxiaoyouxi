/**
 * 素材入库校验（零依赖，直接 node 跑）
 *
 * 作用：
 *   1. 按 美术/素材库/素材清单.csv 检查每个该有的文件在不在
 *   2. 读出每张图的真实像素尺寸，核对比例与分辨率是否符合要求
 *   3. 列出"没有在清单里"的多余文件（多半是命名写错）
 *
 * 用法：在项目根目录执行  node 工具/检查素材.mjs
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, extname } from 'node:path';

const ROOT = resolve(process.cwd(), '美术/素材库');
const MANIFEST = join(ROOT, '素材清单.csv');

const 列 = {
  批次: '批次',
  编号: '编号',
  名称: '名称',
  目录: '目录',
  文件名: '文件名',
  比例: '比例',
  生成尺寸: '生成尺寸',
};

/** 只读文件头，拿到 PNG / JPEG / WebP 的像素尺寸 */
function readImageSize(buffer) {
  // PNG
  if (buffer.length > 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), format: 'png' };
  }
  // JPEG
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5), format: 'jpeg' };
      }
      offset += 2 + length;
    }
    return { width: null, height: null, format: 'jpeg' };
  }
  // WebP
  if (buffer.length > 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
      const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
      return { width, height, format: 'webp' };
    }
    if (chunk === 'VP8 ') {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return { width, height, format: 'webp' };
    }
    return { width: null, height: null, format: 'webp' };
  }
  return { width: null, height: null, format: 'unknown' };
}

function parseSize(text) {
  const [w, h] = String(text).toLowerCase().split('x').map((value) => Number(value));
  if (!w || !h) return null;
  return { w, h };
}

function ratioOf(size) {
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(size.width, size.height);
  return `${size.width / g}:${size.height / g}`;
}

function readManifest() {
  const lines = readFileSync(MANIFEST, 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    header.forEach((key, index) => {
      row[key] = (cells[index] ?? '').trim();
    });
    return row;
  });
}

function listImages(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listImages(full, found);
    } else if (['.png', '.jpg', '.jpeg', '.webp'].includes(extname(entry).toLowerCase())) {
      found.push(full);
    }
  }
  return found;
}

const rows = readManifest();
const missing = [];
const ok = [];
const problems = [];
const warnings = [];
const expectedPaths = new Set();

for (const row of rows) {
  const id = row[列.编号];
  const filename = row[列.文件名];
  const full = join(ROOT, row[列.目录], filename);
  expectedPaths.add(resolve(full).toLowerCase());

  if (!existsSync(full)) {
    missing.push(row);
    continue;
  }

  const size = readImageSize(readFileSync(full).subarray(0, 4096));
  if (!size.width) {
    problems.push(`${id} ${filename}：文件在，但读不出像素尺寸（可能是异常格式）`);
    continue;
  }

  const actualRatio = ratioOf(size);
  const expectedSize = parseSize(row[列.生成尺寸]);

  // 比例容差 1.5%：生图工具常输出 1920×1088 这类近似 16:9 的尺寸，8 像素偏差不该判废
  const expectedRatioValue = expectedSize ? expectedSize.w / expectedSize.h : null;
  const actualRatioValue = size.width / size.height;
  const deviation = expectedRatioValue
    ? Math.abs(actualRatioValue - expectedRatioValue) / expectedRatioValue
    : 0;

  if (deviation > 0.015) {
    problems.push(
      `${id} ${filename}：比例不符，期望 ${row[列.比例]}（${row[列.生成尺寸]}），实际 ${size.width}×${size.height} = ${actualRatio}，偏差 ${(deviation * 100).toFixed(1)}%`,
    );
    continue;
  }
  if (deviation > 0.002) {
    warnings.push(
      `${id} ${filename}：比例 ${actualRatio} 与标准 ${row[列.比例]} 差 ${(deviation * 100).toFixed(2)}%（${size.width}×${size.height}，可接受，不阻塞）`,
    );
  }

  if (expectedSize && (size.width !== expectedSize.w || size.height !== expectedSize.h)) {
    const smaller = size.width * size.height < expectedSize.w * expectedSize.h;
    if (smaller) {
      warnings.push(`${id} ${filename}：尺寸 ${size.width}×${size.height} 低于标准 ${row[列.生成尺寸]}，像素细节会不够（建议重出）`);
    }
  }

  ok.push(`${id} ${filename} → ${size.width}×${size.height} ${size.format} ✅`);
}

const unexpected = listImages(ROOT)
  .filter((file) => !expectedPaths.has(resolve(file).toLowerCase()))
  .map((file) => file.replace(ROOT, '美术/素材库').replace(/\\/g, '/'));

/* 重复内容检测：两个不同文件名却是同一张图（多半是存错了名字） */
const hashGroups = new Map();
for (const row of rows) {
  const full = join(ROOT, row[列.目录], row[列.文件名]);
  if (!existsSync(full)) continue;
  const hash = createHash('sha256').update(readFileSync(full)).digest('hex').slice(0, 16);
  const group = hashGroups.get(hash) ?? [];
  group.push(`${row[列.编号]} ${row[列.文件名]}`);
  hashGroups.set(hash, group);
}
const duplicates = [...hashGroups.entries()].filter(([, group]) => group.length > 1);

console.log('=== 素材入库校验 ===');
console.log(
  `清单条目：${rows.length} · 已就位：${ok.length} · 缺失：${missing.length} · 比例错误：${problems.length} · 尺寸提醒：${warnings.length}`,
);
console.log('');

if (ok.length > 0) {
  console.log('--- 已就位 ---');
  ok.forEach((line) => console.log('  ' + line));
  console.log('');
}

if (problems.length > 0) {
  console.log('--- 比例错误（必须重出） ---');
  problems.forEach((line) => console.log('  ❌ ' + line));
  console.log('');
}

if (warnings.length > 0) {
  console.log('--- 尺寸提醒 ---');
  warnings.forEach((line) => console.log('  ⚠️  ' + line));
  console.log('');
}

if (missing.length > 0) {
  console.log('--- 还没生成（按批次分组） ---');
  const byBatch = new Map();
  for (const row of missing) {
    const batch = row[列.批次];
    if (!byBatch.has(batch)) byBatch.set(batch, []);
    byBatch.get(batch).push(row);
  }
  for (const [batch, items] of [...byBatch.entries()].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  批次 ${batch}：`);
    for (const row of items) {
      console.log(
        `    ${row[列.编号].padEnd(5)} ${row[列.比例].padEnd(5)} ${row[列.生成尺寸].padEnd(10)} → ${row[列.目录]}/${row[列.文件名]}`,
      );
    }
  }
  console.log('');
}

if (unexpected.length > 0) {
  console.log('--- 清单外的文件（检查命名是否写错） ---');
  unexpected.forEach((file) => console.log('  ⚠️  ' + file));
  console.log('');
}

if (duplicates.length > 0) {
  console.log('--- 重复内容（两个文件名是同一张图，多半存错了名字） ---');
  for (const [hash, group] of duplicates) {
    console.log(`  ⚠️  sha256:${hash} —— ${group.join('　＝　')}`);
  }
  console.log('');
}

const done = ok.length;
const percent = ((done / rows.length) * 100).toFixed(0);
console.log(`进度：${done}/${rows.length}（${percent}%）`);
if (done === 0) {
  console.log('提示：把生成好的图放进 美术/素材库/原图/<批次目录>/，文件名用素材清单里的那一个。');
}
