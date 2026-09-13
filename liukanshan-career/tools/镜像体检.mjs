/**
 * 南区镜像体检：把运行时网格按"连续同类区段"切出来，逐段打印 x 范围，
 * 再把左右两半**对称比一遍**。
 *
 * 为什么要专门做：字符画里一格一个字符，肉眼数 x 很容易错一格（我数错过）。
 * 直接输出"x12..20 防滑砖"这种段落，一眼就能看出左右是否镜像。
 *
 * 用法：node tools/镜像体检.mjs [行号]      # 默认行18
 */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const 行 = Number(process.argv[2] ?? 18);
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
const 等 = (ms) => new Promise((r) => setTimeout(r, ms));
const 浏览器 = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox'],
});
const 页 = await 浏览器.newPage();
await 页.setViewport({ width: 1440, height: 900 });
await 页.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await 页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
await 等(600);
await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'map', 段号: 1 }));
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 等(900);

const 瓦片名 = {
  0: '浅灰地毯', 1: '深灰地毯', 2: '防滑砖', 3: '抛光砖', 4: '走廊地砖', 5: '木地板',
  6: '白墙', 7: '玻璃', 8: '门横左', 9: '门横右', 10: '门竖上', 11: '门竖下',
  12: '门横左关', 13: '门横右关', 14: '门竖上关', 15: '门竖下关', 16: '桌面',
};

/** 镜像轴（格号，可以是小数）：整张地图的镜像轴在 (地图宽-1)/2 = 22 格心 */
const 轴 = Number(process.argv[3] ?? 22);
const 镜像 = (x) => Math.round(2 * 轴) - x;

const r = await 页.evaluate(
  ({ 行 }) => {
    const s = window.__lksMap;
    const 图层 = s.图层;
    const 宽 = 图层.layer.width;
    const 列 = [];
    for (let x = 0; x < 宽; x += 1) {
      const t = 图层.getTileAt(x, 行);
      列.push(t ? t.index : -1);
    }
    return { 宽, 列 };
  },
  { 行 },
);

/** 切成"连续同号"的区段 */
const 段 = [];
for (let x = 0; x < r.宽; x += 1) {
  const 号 = r.列[x];
  const 末 = 段[段.length - 1];
  if (末 && 末.号 === 号) 末.止 = x;
  else 段.push({ 号, 起: x, 止: x });
}

console.log(`行 ${行}（世界 y ${行 * 32}..${行 * 32 + 31}）的区段：\n`);
for (const d of 段) {
  const 名 = 瓦片名[d.号] ?? `?(${d.号})`;
  console.log(`  x${String(d.起).padStart(2)}..${String(d.止).padStart(2)}  ${名}`);
}

/* ── 区段级镜像比对（比逐格比对好读，也更切题：房间 vs 房间） ── */
console.log(`\n区段镜像比对（轴 = 第 ${轴} 格心，x ↔ ${Math.round(2 * 轴)} - x）：`);
let 坏 = 0;
const 已比 = new Set();
for (const a of 段) {
  const 镜起 = 镜像(a.止);
  const 镜止 = 镜像(a.起);
  const b = 段.find((d) => d.起 === 镜起 && d.止 === 镜止);
  const 名a = 瓦片名[a.号] ?? a.号;
  const 名b = b ? (瓦片名[b.号] ?? b.号) : '（找不到镜像段）';
  const 同 = !!b && a.号 === b.号;
  if (a.起 < 镜起) {
    // 只报左边那一半，避免同一对报两次
    if (!同) 坏 += 1;
    console.log(
      `  [${String(a.起).padStart(2)}..${String(a.止).padStart(2)}] ${String(名a).padEnd(5)}` +
        `  ↔  [${String(镜起).padStart(2)}..${String(镜止).padStart(2)}] ${String(名b).padEnd(5)} ${同 ? '✓' : '✗（材质不同）'}`,
    );
  } else if (a.起 === 镜起 && !已比.has(a.起)) {
    已比.add(a.起);
    console.log(`  [${String(a.起).padStart(2)}..${String(a.止).padStart(2)}] ${String(名a).padEnd(5)}  ← 压在镜面上`);
  }
}
console.log(
  坏
    ? `\n⚠️ ${坏} 对区段的**材质**不同（防滑砖 vs 深灰地毯 = 两个房间本该不一样，不算结构错）\n` +
        `   结构（墙的位置、走廊宽度、门的位置）是否镜像，看上面的 ✓/✗ 与"压在镜面上"那行。`
    : '\n✓ 这一行结构完全镜像',
);
await 浏览器.close();
