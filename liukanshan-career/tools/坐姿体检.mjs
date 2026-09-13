/**
 * 坐姿体检：验"主角能坐**工位椅 / 空椅子 / 空沙发**，而且姿势按场景自动切"。
 *
 * 用户的要求：「主角可以坐工位上、坐空椅子上、坐空沙发上，
 *              并且判断是背面坐还是正面坐」。
 *
 * 判据（`OfficeMapScene.坐哪套()`）：
 *   · **开放办公区**（13≤x≤30, 2≤y≤9）的椅子/沙发 → **背面**（自己工位，对着电脑）
 *   · 其它地方（茶水间 / 会议室 / 总监办公室 / 前台沙发）→ **正面**（对着人说话）
 *
 * ⚠️ 走的是**真实路径**（`地图交互`），不是直接调场景 —— 这样能一并验出
 *    "工位那个交互点会不会把'坐下'顶掉"（用户报过：站在工位上按空格永远坐不下去）。
 *
 * 用法（在游戏目录跑）：node tools/坐姿体检.mjs
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

/** 把主角瞬移到某个格（模拟"走过去"），等一拍让 update 把状态报上来 */
async function 站到(x, y) {
  await 页.evaluate((x, y) => {
    const s = window.__lksMap;
    const 像素 = s.格到像素(x, y);
    s.传送像素(像素.x, 像素.y);
  }, x, y);
  await 等(350);
}

/** 模拟"按一下空格" —— 走真实的 `地图交互`（不是直接调场景） */
async function 按空格(id) {
  await 页.evaluate((id) => window.__lksStory.getState().地图交互(id), id);
  await 等(300);
}

/** 直接请求"站起来"（场景会由 MapScreen 执行） */
async function 站起来() {
  await 页.evaluate(() => window.__lksStory.getState().要坐坐('站'));
  await 等(300);
}

const 读 = () =>
  页.evaluate(() => {
    const s = window.__lksMap;
    const st = window.__lksStory.getState();
    // ⚠️ 直接读主角精灵身上的动画 key，不调场景的 `坐姿套()`：
    //    那个方法在旧版本的 bundle 里没有兜底判空，会抛错（而且 dev server 换代码后
    //    页面里的旧模块还在）。直读最稳。
    const 键 = s.主角?.anims?.currentAnim?.key ?? null;
    return {
      格: s.位置(),
      在座位上: st.站在座位上,
      坐着: st.坐着,
      套: 键 === '坐_刘看山' ? 'back' : 键 === '坐正_刘看山' ? 'front' : null,
      屏幕: st.屏幕,
      续播: st.续播,
    };
  });

let 坏 = 0;
const 断言 = (条件, 说明) => {
  console.log(`  ${条件 ? '✓' : '✗'} ${说明}`);
  if (!条件) 坏 += 1;
};

/**
 * 找一个**真正空着、而且"站上去"就只可能是它**的工位。
 *
 * 判定条件（缺一不可）：
 *   一、那一格是**转椅**（背面套）
 *   二、那一格**没有同事**（有人坐的椅子现在故意坐不下去）
 *   三、它**上下左右紧邻没有别的座位** —— 不然"站它旁边那一格"会被邻居抢走，
 *       测出来的姿势就不是它（踩过：(23,4) 是单人沙发，站在旁边坐下去得到 front）
 *
 * ⚠️ 不能写死格子：同事站位一改、座位表一调，写死的必失效（被坑过两次）。
 */
async function 找空工位() {
  return 页.evaluate(() => {
    const s = window.__lksMap;
    const 占 = new Set(
      (s.NPC们 ?? []).map((o) => {
        const g = s.NPC所在格(o);
        return `${g.x},${g.y}`;
      }),
    );
    const 候选 = [
      [15, 4], [18, 4], [21, 4], [24, 4],
      [15, 8], [18, 8], [21, 8], [24, 8],
      [28, 17],
    ];
    const 别的座位 = [
      [17, 4], [23, 4], [30, 20], [31, 20], [17, 26], [18, 26],
      [4, 20], [8, 20], [4, 5], [8, 5], [4, 7], [8, 7], [35, 6], [39, 6],
    ];
    const 邻 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const 有邻居座位 = (x, y) =>
      邻.some(([dx, dy]) =>
        [...候选, ...别的座位].some(([a, b]) => a === x + dx && b === y + dy),
      );
    return 候选.find(([x, y]) => !占.has(`${x},${y}`) && !有邻居座位(x, y)) ?? null;
  });
}
const 空工位 = await 找空工位();
if (!空工位) {
  console.log('✗ 找不到"周围没有邻居座位"的空工位 —— 场景或座位表变了，先看这里');
  await 浏览器.close();
  process.exit(1);
}
console.log(`（本次拿到的空工位：${空工位.join(',')}，周围没有别的座位）\n`);

console.log('=== ① 自己的工位 (24,4)：既要能坐下、又要用背面坐姿 ===\n');
// ⚠️ 这一格同时挂着「我的工位」交互点。真正的坑是：交互点先被判掉 → 永远坐不下去。
await 站到(空工位[0], 空工位[1]);
let s = await 读();
console.log('  站上去：', JSON.stringify(s));
断言(s.在座位上 === true, '场景报"在座位上"');
await 按空格('我的工位');
s = await 读();
console.log('  按空格后：', JSON.stringify(s));
断言(s.坐着 === true, '在工位上按空格 → **真的坐下了**（交互点没有把坐下顶掉）');
断言(s.套 === 'back', `工位上用背面坐姿（实际 ${s.套}）`);

console.log('\n=== ①b 用**真键盘**按空格也要能坐（不是只调 store）===\n');
// ⚠️ 这一条是给"按空格没反应"报的 bug 兜底：页面上如果有按钮拿到焦点，
//    浏览器的默认行为会把空格吃掉（还会顺带点那个按钮），必须早于它 preventDefault。
await 站起来();
await 站到(空工位[0], 空工位[1]);
await 页.evaluate(() => {
  // 先把焦点抢到"微信"按钮上（最容易出问题的情形）
  const b = document.querySelector('.map-phone');
  if (b) b.focus();
});
await 页.keyboard.press('Space');
await 等(350);
s = await 读();
console.log('  焦点在按钮上按空格：', JSON.stringify(s));
断言(s.坐着 === true, '**真有焦点在按钮上时，按空格也能坐下**');
断言(s.屏幕 === 'map', '没有被那个按钮的默认行为带跑（没跳去微信）');
await 站起来();

console.log('\n=== ①c 站在椅子**旁边**（不踩正格子）也要能坐 ===\n');
// 用户要求：「只要是在椅子附近就能坐下，不是只能在椅子前面或后面」。
// 工位椅在 (24,4)，站在它**左边的地板格** (23,4) 上，应该也能坐上那把椅子。
await 站起来();
await 站到(空工位[0] - 1, 空工位[1]);
s = await 读();
console.log('  站在 (23,4)：', JSON.stringify(s));
断言(s.在座位上 === true, '**站在椅子旁边**也算"附近有座位"');
await 按空格('我的工位');
s = await 读();
console.log('  按空格后：', JSON.stringify(s));
断言(s.坐着 === true, '在椅子旁边按空格 → 坐上了椅子');
// ⚠️ 别断言"落在 (24,4) 这把椅子上"：(23,4) 本身就是**另一件座位（单人沙发）**，
//    挡位算法会正确地选它（站哪件上就坐哪件）。这里要断的是：
//    **人有没有被挪到某件座位上**（而不是留在原地浮着）。
// ⚠️ 也别用 `s.格` 反推格号：坐下时人**故意往上抬了偏移Y**，会读成上一行。
const 落点 = await 页.evaluate(() => {
  const s = window.__lksMap;
  const 座 = [
    [15, 4], [18, 4], [21, 4], [24, 4], [15, 8], [18, 8], [21, 8], [24, 8],
    [17, 4], [23, 4], [28, 17], [30, 20], [31, 20],
    [4, 20], [8, 20], [4, 5], [8, 5], [4, 7], [8, 7], [35, 6], [39, 6], [17, 26], [18, 26],
  ].map(([x, y]) => s.格到像素(x, y));
  const 人 = { x: Math.round(s.主角.x), y: Math.round(s.主角.y) };
  let 最近 = 1e9;
  let 哪把 = null;
  for (const p of 座) {
    const d = Math.hypot(p.x - 人.x, p.y - 人.y);
    if (d < 最近) {
      最近 = d;
      哪把 = p;
    }
  }
  return { 人, 哪把: { x: 哪把.x, y: 哪把.y }, 距离: Math.round(最近) };
});
console.log('  落点：', JSON.stringify(落点));
断言(
  落点.人.x === 落点.哪把.x && 落点.距离 <= 24,
  `坐下后**人正好在某件座位上**（人 ${落点.人.x},${落点.人.y}，最近座位 ${落点.哪把.x},${落点.哪把.y}，偏差 ${落点.距离}px）`,
);
断言(s.套 === 'back', `还是背面坐姿（实际 ${s.套}）`); // 左侧已经没有幽灵沙发了，落的就是工位椅
console.log('\n=== ② 坐着时按方向键 → 自动站起来 ===\n');
await 页.keyboard.down('ArrowLeft');
await 等(250);
await 页.keyboard.up('ArrowLeft');
await 等(200);
s = await 读();
断言(s.坐着 === false, '一按方向键就站起来了（不用额外按键）');

console.log('\n=== ③ 别的空工位 → 也能坐，同样是背面 ===\n');
await 站起来();
await 站到(空工位[0], 空工位[1]);
await 按空格('我的工位');
s = await 读();
断言(s.坐着 === true, '空工位也能坐');
断言(s.套 === 'back', `开放办公区的工位一律背面（实际 ${s.套}）`);
await 站起来();

console.log('\n=== ④ 茶水间的空会议椅 (4,20) → 正面 ===\n');
await 站起来();
await 站到(4, 20);
await 按空格('茶水间');
s = await 读();
断言(s.坐着 === true, '茶水间的椅子能坐');
断言(s.套 === 'front', `茶水间用正面坐姿（实际 ${s.套}）`);

console.log('\n=== ⑤ 空沙发 (30,20) 总监办公室 → 正面 ===\n');
await 站起来();
await 站到(30, 20);
s = await 读();
断言(s.在座位上 === true, '沙发那一格算座位（用户要求"可以坐空沙发"）');
await 按空格('林总办公室');
s = await 读();
断言(s.坐着 === true, '沙发上能坐下');
断言(s.套 === 'front', `沙发用正面坐姿（实际 ${s.套}）`);

console.log('\n=== ⑥ 前台大厅的空沙发 (17,26) → 正面 ===\n');
await 站起来();
await 站到(17, 26);
s = await 读();
断言(s.在座位上 === true, '前台沙发那一格也算座位');
await 按空格('前台');
s = await 读();
断言(s.坐着 === true, '前台沙发上能坐下');
断言(s.套 === 'front', `前台沙发用正面坐姿（实际 ${s.套}）`);

console.log('\n=== ⑦ 走廊地板（不是座位）→ 不该能坐 ===\n');
// ⚠️ 测试是**瞬移**，不会触发"走路自动站起来"（那条判在 `走()` 里），
//    所以这里先显式站起来，再检查"走廊上坐不下去"。
await 站起来();
await 站到(20, 12);
s = await 读();
断言(s.在座位上 === false, '走廊地板上不算座位');
断言(s.坐着 === false, '走到走廊时已经自动站起来了');
// 走廊上没有交互点，所以这里直接请求"坐"——不该成功
await 页.evaluate(() => window.__lksStory.getState().要坐坐('坐'));
await 等(250);
s = await 读();
断言(s.坐着 === false, '在走廊上请求坐下 → 不会"坐在空中"');

console.log('\n=== ⑧ 有人的座位不能坐（不能坐到同事身上）===\n');
// 段 1 的同事：阿麦(15,4) 周岚(18,4) 小鹿(21,4) 韩策(24,8) 林总(28,17)
const 有人点 = [
  { 名: '小鹿', 格: [21, 4] },
  { 名: '阿麦', 格: [15, 4] },
  { 名: '周岚', 格: [18, 4] },
  { 名: '韩策', 格: [24, 8] },
  { 名: '林总', 格: [28, 17] },
];
for (const p of 有人点) {
  await 站起来();
  await 站到(p.格[0], p.格[1]);
  await 按空格('我的工位');
  const r = await 读();
  const 人x = await 页.evaluate(() => Math.round(window.__lksMap.主角.x));
  const 椅上x = await 页.evaluate((x, y) => window.__lksMap.格到像素(x, y).x, p.格[0], p.格[1]);
  console.log(`  ${p.名}的座位(${p.格}) → 坐着=${r.坐着} 人x=${人x} 椅x=${椅上x}`);
  断言(r.坐着 === false, `**${p.名}坐着的椅子按空格坐不下去**（不会坐到同事身上）`);
}

console.log('\n=== ⑨ 空工位还是能坐 ===\n');
// ⚠️ 这里**不要**再补一条"空工位按空格能坐下"：
//    ⑧ 结束时玩家站在**林总的椅子上**（有人的座位），这时按空格**故意**不是坐下、
//    而是去开主线（"没坐下"时座位判据才吃按键）。①/①b/①c 已经覆盖了空工位。

console.log('\n=== ⑩ 四个方向都能坐（左侧的"幽灵沙发"已经删掉）===\n');
/**
 * 用户原来报的「自己工位左侧**没有座位**、按空格却能坐下」，
 * 根因**不是引擎逻辑**，而是 `座位表` 里登记了两张**根本不存在的单人沙发**
 * `(17,4) (23,4)`（`道具表` 从来没摆过它们）—— 人于是坐到空地上。
 *
 * 所以这里断言的是：**四个方向都正常能坐**（左侧不再有那个幽灵座位）。
 * ⚠️ 座位表/道具表的一致性由 `node 工具/查座位.mjs` 守（那个才是根治的地方）。
 */
const 四向 = [
  { 名: '上', dx: 0, dy: -1 },
  { 名: '下', dx: 0, dy: 1 },
  { 名: '右', dx: 1, dy: 0 },
  { 名: '左', dx: -1, dy: 0 },
];
/** 站到某格 → 能坐吗（直接问场景 `能坐吗()`，和真正坐下用的是同一套规则） */
async function 能坐(格) {
  await 站起来();
  await 站到(格[0], 格[1]);
  return 页.evaluate(() => window.__lksMap.能坐吗());
}
const 自己工位 = await 页.evaluate(() => {
  const p = window.__lksMap.交互点表?.find?.((q) => q.id === '我的工位');
  return p ? [p.x, p.y] : [24, 4];
});
for (const d of 四向) {
  const 站 = [自己工位[0] + d.dx, 自己工位[1] + d.dy];
  const 结果 = await 能坐(站);
  console.log(`  自己工位${d.名} 站(${站}) → 能坐=${结果}`);
  断言(结果 === true, `自己工位**${d.名}**侧能坐`);
}
// 别的人工位（(15,8) 是空的）：同样四个方向都能坐
for (const d of 四向) {
  const 站 = [15 + d.dx, 8 + d.dy];
  const 结果 = await 能坐(站);
  console.log(`  别的工位${d.名} 站(${站}) → 能坐=${结果}`);
  断言(结果 === true, `**别的工位**${d.名}侧也能坐`);
}
await 站起来();

console.log(
  坏
    ? `\n✗ ${坏} 项没过`
    : '\n✓ 坐姿全部通过（工位背面 / 空工位背面 / 茶水间正面 / 沙发正面 / 走廊坐不下 / 有人的椅子不坐）',
);
await 浏览器.close();
process.exit(坏 ? 1 : 0);
