
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const 根 = 'liukanshan-career/src';
const 模式 = [
  " onMouseEnter={() => 播放('选项悬停')}",
  "onMouseEnter={() => 播放('选项悬停')}",
  "onMouseEnter: () => 播放('选项悬停'),",
  "onFocus: () => 播放('选项悬停'),",
  "播放('选项悬停');",
  "\r\n\r\n",
];
function 走(目录) {
  let 改 = 0;
  for (const f of readdirSync(目录)) {
    const p = join(目录, f);
    if (statSync(p).isDirectory()) { 改 += 走(p); continue; }
    if (!/\.tsx?$/.test(f)) continue;
    let 文 = readFileSync(p, 'utf8');
    const 原 = 文;
    for (const m of 模式) 文 = 文.split(m).join(m.startsWith('播放') ? '' : m === '\r\n\r\n' ? '\r\n' : '');
    if (文 !== 原) {
      writeFileSync(p, 文, 'utf8');
      const n = (原.split('选项悬停').length - 1) - (文.split('选项悬停').length - 1);
      改 += n;
      console.log('  ' + p.replace(/.*[\\/]/, '') + ' 清掉 ' + n + ' 处');
    }
  }
  return 改;
}
console.log('共清掉 ' + 走(根) + ' 处');
