/**
 * 拍坐姿：把主角放到椅子上坐下，放大拍下来，方便肉眼调"抬高多少 / 前后遮挡"。
 *
 * 用法（在游戏目录跑）：
 *   node tools/拍坐姿.mjs                 # 默认拍茶水间（正面）+ 工位（背面）
 *   node tools/拍坐姿.mjs 4 20            # 指定格：茶水间会议椅
 *   node tools/拍坐姿.mjs 24 4 3          # 指定格 + 缩放倍数
 *
 * 输出：tools/shots/坐/<格>-<前后>.png
 */
import { existsSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
const 等 = (ms) => new Promise((r) => setTimeout(r, ms));
const 出目录 = 'tools/shots/坐';
mkdirSync(出目录, { recursive: true });

const 倍 = Number(process.argv[4] ?? 3);
/** 没给格就拍这几个（覆盖三种家具） */
const 点们 =
  process.argv[2] && process.argv[3]
    ? [[Number(process.argv[2]), Number(process.argv[3])]]
    : [
        [24, 4], // 开放办公区转椅 → 背面
        [4, 20], // 茶水间会议椅 → 正面
        [30, 20], // 总监办公室双人沙发 → 正面
      ];

const 浏览器 = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox'],
});
const 页 = await 浏览器.newPage();
await 页.setCacheEnabled(false);
await 页.setViewport({ width: 1440, height: 900 });
await 页.goto(`http://127.0.0.1:5273/?f=${Date.now()}`, { waitUntil: 'networkidle2' });
await 页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
await 等(700);
await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'map', 段号: 1 }));
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 等(900);

for (const [x, y] of 点们) {
  // 先站起来（上一次可能还坐着）
  await 页.evaluate(() => window.__lksStory.getState().要坐坐('站'));
  await 等(200);
  await 页.evaluate(
    ({ x, y }) => {
      const s = window.__lksMap;
      const px = s.格到像素(x, y);
      s.传送像素(px.x, px.y);
      s.cameras.main.stopFollow();
      s.cameras.main.setZoom(3);
      s.cameras.main.centerOn(px.x, px.y - 16);
    },
    { x, y },
  );
  await 等(400);
  await 页.screenshot({ path: `${出目录}/${x}-${y}-站着.png` });
  await 页.evaluate(() => window.__lksStory.getState().要坐坐('坐'));
  await 等(600);
  const 信息 = await 页.evaluate(() => {
    const s = window.__lksMap;
    const 键 = s.主角?.anims?.currentAnim?.key ?? null;
    // 同格的椅子/沙发的深度也要读出来，才能判断"人是在家具前面还是后面"
    const 家具 = s.children.list
      .filter((o) => {
        const k = o.texture?.key ?? '';
        return (k.includes('椅') || k.includes('沙发')) && Math.abs(o.x - s.主角.x) < 40;
      })
      .map((o) => `${o.texture.key}@y${Math.round(o.y)}/d${Math.round(o.depth)}`);
    return { 键, y: Math.round(s.主角.y), 深度: Math.round(s.主角.depth * 10) / 10, 家具 };
  });
  await 页.screenshot({ path: `${出目录}/${x}-${y}-坐.png` });
  console.log(
    `(${x},${y}) 坐姿=${信息.键}  人y=${信息.y} 人深度=${信息.深度}` +
      `  ${信息.深度 > 0 ? `同格家具=[${信息.家具.join('  ')}]` : ''}`,
  );
}
console.log(`\n图：${出目录}/`);
await 浏览器.close();
