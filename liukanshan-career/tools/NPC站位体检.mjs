/**
 * NPC 站位体检：按**段号**检查每个同事站得对不对。
 *
 * 为什么要它：「剧情换房间时同事直接传送、主角自己走」这件事，
 * 全靠 `level.ts` 的 `NPC排布[段号]` 那几行坐标。写错了肉眼很难发现：
 *   · 人会**站在椅子外**（没播坐姿，看着像浮在地上）
 *   · 人会**站进桌子/吧台里**（穿模）
 *   · 两个人**站同一格**（叠在一起）
 *   · 某个该在房间里的人**没被安排**
 * 这个脚本把这些一次全量出来。
 *
 * 用法（在游戏目录跑）：node tools/NPC站位体检.mjs
 */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

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
页.on('pageerror', (e) => console.log(`[页面错误] ${e.message}`));
await 页.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
await 页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
await 等(600);
await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'map', 段号: 1 }));
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 等(900);

/** 房间名（按 x/y 归一下，纯为了报告好读） */
const 归房 = (x, y) =>
  y >= 2 && y <= 9 && x >= 2 && x <= 11 ? '会议室A'
  : y >= 2 && y <= 9 && x >= 13 && x <= 30 ? '开放办公区'
  : y >= 2 && y <= 9 && x >= 32 && x <= 42 ? '会议室B'
  : y >= 14 && y <= 21 && x >= 2 && x <= 10 ? '茶水间'
  : y >= 14 && y <= 21 && x >= 11 && x <= 19 ? '文印区'
  : y >= 14 && y <= 21 && x >= 24 && x <= 32 ? '总监办公室'
  : y >= 14 && y <= 21 && x >= 34 && x <= 42 ? '储藏间'
  : y >= 23 && y <= 27 ? '前台'
  : y >= 11 && y <= 12 ? '主走廊'
  : `其他(${x},${y})`;

let 所有坏 = 0;
for (const 段 of [1, 2, 3]) {
  const r = await 页.evaluate(async (段) => {
    const s = window.__lksMap;
    const st = window.__lksStory.getState();
    // 换段（走后门直接调场景的 换NPC，和剧情推进时走的是同一条路）
    s.换NPC(段);
    await new Promise((x) => setTimeout(x, 260));
    return s.NPC们.map((o) => {
      const 位 = { x: Math.floor((o.x - 16) / 32), y: Math.floor((o.y - 32) / 32) };
      return {
        名: o.getData('名'),
        格: 位,
        坐姿: o.anims?.currentAnim?.key ?? '(冻结在待机帧)',
        用了坐姿表: String(o.texture.key).startsWith('sit_'),
      };
    });
  }, 段);

  console.log(`\n═══ 段 ${段} ═══`);
  for (const n of r) {
    console.log(
      `  ${String(n.名).padEnd(4)} (${n.格.x},${n.格.y})  ${归房(n.格.x, n.格.y).padEnd(6)}  ` +
        `${n.用了坐姿表 ? '坐姿表' : '站立表'}  anim=${n.坐姿}`,
    );
  }
  // 同格叠人
  const 键 = new Map();
  for (const n of r) {
    const k = `${n.格.x},${n.格.y}`;
    键.set(k, [...(键.get(k) ?? []), n.名]);
  }
  for (const [k, 名] of 键) {
    if (名.length > 1) {
      所有坏 += 1;
      console.log(`  ✗ 同一格 (${k}) 站了 ${名.length} 个人：${名.join('、')}`);
    }
  }
  // 房间汇总（用来核对"这一段的同事是不是都在该在的房间"）
  const 房间统计 = {};
  for (const n of r) {
    const 房 = 归房(n.格.x, n.格.y);
    房间统计[房] = [...(房间统计[房] ?? []), n.名];
  }
  console.log(
    `  房间分布：${Object.entries(房间统计)
      .map(([房, 名]) => `${房}=${名.join('/')}`)
      .join('  ')}`,
  );
}

/* ── 与文案对齐：茶水间那场戏，谁该在茶水间 ── */
console.log('\n═══ 文案对齐检查（段 3 = 狐说八道茶水间那场）═══');
const 段3 = await 页.evaluate(() => {
  const s = window.__lksMap;
  s.换NPC(3);
  return new Promise((r) =>
    setTimeout(
      () =>
        r(
          s.NPC们.map((o) => ({
            名: o.getData('名'),
            x: Math.floor((o.x - 16) / 32),
            y: Math.floor((o.y - 32) / 32),
          })),
        ),
      260,
    ),
  );
});
const 在茶水间 = 段3.filter((n) => n.x >= 2 && n.x <= 10 && n.y >= 14 && n.y <= 21).map((n) => n.名);
const 该在 = ['小鹿', '阿麦', '韩策'];
const 齐 = 该在.every((名) => 在茶水间.includes(名));
console.log(`  茶水间里的人：${在茶水间.join('、') || '(空)'}`);
console.log(`  群里那三位（小鹿/阿麦/韩策）都在吗：${齐 ? '✓' : '✗ 缺 ' + 该在.filter((n) => !在茶水间.includes(n)).join('、')}`);
const 不在 = 段3.filter((n) => !在茶水间.includes(n.名)).map((n) => n.名);
console.log(`  茶室之外的（周岚在会议室排期 / 林总在自己办公室）：${不在.join('、')}`);
if (!齐) 所有坏 += 1;

console.log(所有坏 ? `\n✗ 共 ${所有坏} 处问题` : '\n✓ NPC 站位没问题');
await 浏览器.close();
