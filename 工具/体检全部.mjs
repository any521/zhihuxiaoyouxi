/**
 * 一键体检：把这一轮会踩的所有检查**一次跑完**，并打印结论。
 *
 * 为什么要有它（真实教训）：
 *   1. **工作目录**：`工具/查压墙.mjs` 必须在**仓库根**跑（它 `resolve('liukanshan-career/...')`），
 *      而 `liukanshan-career/tools/*.mjs` 要在**游戏目录**跑（它 `resolve('src/...')`）。
 *      我两次因为跑错目录，把"路径找不到"当成"脚本坏了"。
 *   2. **检查项会漏**：`查压墙.mjs` 只查"道具 vs 墙"，"道具 vs 道具"是另一个脚本；
 *      AVG 的三条规则又是另外两个脚本。不做成一条命令，总会漏跑。
 *
 * ⚠️ 前提：dev server 已在 5273 跑着（带浏览器的检查项要连它）。
 *
 * 用法（在**仓库根**跑）：
 *   node 工具/体检全部.mjs
 *   node 工具/体检全部.mjs --快      # 跳过最慢的"每件道具周围 3×3 格全扫"
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const 根 = resolve(import.meta.dirname, '..');
const 游戏 = resolve(根, 'liukanshan-career');
const 快 = process.argv.includes('--快');

/** [名字, 脚本路径, 工作目录, 额外参数] */
const 全部 = [
  ['类型检查', 'npx', 游戏, ['tsc', '--noEmit'], true],
  ['跑团逻辑（纯函数自检）', 'tools/跑团自检.mjs', 游戏, []],
  ['道具 vs 墙 / 挡门', '工具/查压墙.mjs', 根, []],
  ['道具 vs 道具 重叠', 'tools/查重叠.mjs', 游戏, []],
  ['墙面元素贴在哪（不能压玻璃/门）', 'tools/墙面元素体检.mjs', 游戏, []],
  ['运行时网格（墙/门/走廊）', 'tools/读运行时网格.mjs', 游戏, ['13', '22']],
  ['左右镜像', 'tools/镜像体检.mjs', 游戏, ['18']],
  ['AVG 三条规则', 'tools/AVG体检.mjs', 游戏, []],
  ['「去房间」换场景', 'tools/去房间体检.mjs', 游戏, []],
  ['NPC 站位（按段号）', 'tools/NPC站位体检.mjs', 游戏, []],
  ['道具卡 / 人物卡', 'tools/道具卡体检.mjs', 游戏, 快 ? ['--快'] : []],
];

let 失败 = 0;
for (const [名, 脚本, cwd, 参数, 是npx] of 全部) {
  const 命令 = 是npx ? 脚本 : 'node';
  const 实参 = 是npx ? 参数 : [脚本, ...参数];
  console.log(`\n${'─'.repeat(60)}\n▶ ${名}\n${'─'.repeat(60)}`);
  const r = spawnSync(命令, 实参, {
    cwd,
    stdio: ['ignore', 'inherit', 'pipe'],
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });
  if (r.status === 0) {
    console.log(`✅ ${名} 通过`);
  } else {
    失败 += 1;
    console.log(`⚠️ ${名} 退出码 ${r.status}（上面有输出，可能是"检查出问题"，也可能是脚本自己报错）`);
    if (r.stderr) console.log(r.stderr.split('\n').slice(-6).join('\n'));
  }
}

console.log(`\n${'═'.repeat(60)}`);
console.log(
  失败
    ? `共 ${失败} 项非 0 退出 —— 看上面的具体输出（注意：有些脚本"查出问题"也是非 0，不一定是你写坏了）`
    : '全部通过 ✅',
);
