/**
 * 新素材进度查看（零依赖）
 *
 * 只关心本次要补的批次（9~14），按文件夹列出：
 *   ✅ 已放进来（并核对尺寸）
 *   ⬜ 还没放
 *   ⚠️ 文件名接近但不完全一致（最常见的问题：全角/半角、下划线、多打了空格）
 *
 * 用法：node 工具/看新素材进度.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { 读取PNG } from './图像库.mjs';

const 根 = resolve(process.cwd());
const 素材库 = join(根, '美术/素材库');
const 清单路径 = join(素材库, '素材清单.csv');

const 批次名 = {
  9: '瓦片v2（重做）',
  10: '手机界面',
  11: '角色动画',
  12: '办公家具',
  13: '小游戏道具',
  14: '转场与结局',
};

const 行 = readFileSync(清单路径, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const 表头 = 行[0].split(',');
const 列 = Object.fromEntries(表头.map((h, i) => [h.trim(), i]));

const 目标 = [];
for (const 行内容 of 行.slice(1)) {
  const 格 = 行内容.split(',');
  const 批次 = Number(格[列.批次]);
  if (批次 < 9) continue;
  目标.push({
    批次,
    编号: 格[列.编号],
    名称: 格[列.名称],
    目录: 格[列.目录],
    文件名: 格[列.文件名],
    生成尺寸: 格[列.生成尺寸],
    状态: 格[列.状态],
  });
}

/** 把生成尺寸解析成 {w,h} */
function 解析尺寸(文本) {
  const m = /^(\d+)x(\d+)$/.exec((文本 ?? '').trim());
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
}

const 按批次 = new Map();
for (const 项 of 目标) {
  if (!按批次.has(项.批次)) 按批次.set(项.批次, []);
  按批次.get(项.批次).push(项);
}

let 总到位 = 0;
let 总条数 = 0;
const 需要改名 = [];

console.log('=== 新素材进度 ===\n');

for (const 批次 of [...按批次.keys()].sort((a, b) => a - b)) {
  const 列表 = 按批次.get(批次);
  // "程序生成"的条目不在 原图/ 里，而在 成品/瓦片v2/
  const 程序生成 = 列表.every((项) => (项.状态 ?? '').includes('程序生成'));
  const 目录 = 程序生成
    ? join(素材库, '成品/瓦片v2')
    : join(素材库, 列表[0].目录);
  const 已存在 = existsSync(目录) ? readdirSync(目录).filter((f) => f.toLowerCase().endsWith('.png')) : [];

  const 到位 = [];
  const 缺失 = [];
  for (const 项 of 列表) {
    const 全路径 = join(目录, 项.文件名);
    if (existsSync(全路径)) {
      到位.push(项);
      总到位 += 1;
    } else {
      缺失.push(项);
      // 找找有没有"很接近"的文件名（多半是命名不一致）
      const 近似 = 已存在.filter((f) => {
        if (f === 项.文件名) return false;
        const a = f.replace(/[_\s．.。-]/g, '');
        const b = 项.文件名.replace(/[_\s．.。-]/g, '');
        return a.includes(b.slice(0, 6)) || b.includes(a.slice(0, 6));
      });
      if (近似.length) 需要改名.push({ 目录: 列表[0].目录, 期望: 项.文件名, 实际: 近似[0] });
    }
    总条数 += 1;
  }

  const 百分比 = Math.round((到位.length / 列表.length) * 100);
  const 条 = '█'.repeat(Math.round(百分比 / 10)).padEnd(10, '░');
  console.log(`批次 ${批次} · ${批次名[批次] ?? ''}   ${条} ${到位.length}/${列表.length}`);

  if (到位.length) {
    console.log('  ✅ 已放进来：');
    for (const 项 of 到位) {
      const 期望 = 解析尺寸(项.生成尺寸);
      let 尺寸备注 = '';
      try {
        const img = 读取PNG(join(目录, 项.文件名));
        if (期望 && (img.width !== 期望.w || img.height !== 期望.h)) {
          const 比例差 = Math.abs(img.width / img.height - 期望.w / 期望.h) / (期望.w / 期望.h);
          if (比例差 > 0.02) {
            尺寸备注 = `  ⚠️ 实际 ${img.width}×${img.height}，期望 ${项.生成尺寸}`;
          } else {
            尺寸备注 = `  （实际 ${img.width}×${img.height}，比例相符，可用）`;
          }
        }
      } catch {
        尺寸备注 = '  ⚠️ 读不出来，文件可能损坏';
      }
      console.log(`     ${项.编号}  ${项.文件名}${尺寸备注}`);
    }
  }

  if (缺失.length) {
    console.log('  ⬜ 还没放：');
    for (const 项 of 缺失) {
      console.log(`     ${项.编号}  ${项.文件名}   （要 ${项.生成尺寸}）`);
    }
  }
  console.log('');
}

if (需要改名.length) {
  console.log('=== ⚠️ 文件名不一致，需要改名 ===');
  for (const 项 of 需要改名) {
    console.log(`  ${项.目录}/`);
    console.log(`     现在叫：${项.实际}`);
    console.log(`     应该叫：${项.期望}`);
  }
  console.log('');
}

const 总百分比 = 总条数 ? Math.round((总到位 / 总条数) * 100) : 0;
console.log(`新素材总计：${总到位}/${总条数}（${总百分比}%）`);

// 顺手提示旧的 05-瓦片 已被替代
const 旧瓦片 = join(素材库, '原图/05-瓦片');
if (existsSync(旧瓦片)) {
  console.log('\n提示：旧的 原图/05-瓦片 会在 W01~W06 全部到位后被替换，暂时保留作为兜底。');
}
