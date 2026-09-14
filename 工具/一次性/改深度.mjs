
import { readFileSync, writeFileSync } from 'node:fs';
const p = 'src/game/map/level.ts';
let 文 = readFileSync(p, 'utf8');
const 前 = (文.match(/深度加: 40/g) ?? []).length;
// 墙的遮挡层 = (行+1)*32+1；站在下一排的人 = (行+1)*32+32
// → 挂墙道具要落在 (…+2 … +31) 之间：既压住墙，又**在人物后面**
文 = 文.split('深度加: 40').join('深度加: 2');
// 注释里那句"给它 深度加: 40，翻到墙前面"也要跟着改（不然文档和代码对不上）
文 = 文.replace(
  '所以给它 \`深度加: 40\`，翻到墙前面 —— 视觉上就是**贴在墙面上**。',
  '所以给它 \`深度加: 2\`（**不能更大**：更大就会压住站在它下面那排的人物），\n//       视觉上就是**贴在墙面上**。',
);
writeFileSync(p, 文, 'utf8');
console.log('改了 ' + 前 + ' 处 深度加: 40 → 2');
