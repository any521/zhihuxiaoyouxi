/**
 * 空格优先级体检：「我的工位」**既是椅子、又是主线入口**，空格到底该听谁的。
 *
 * 用户报的 bug：
 *   「按空格触发主线，但是按空格被坐座位抢先了，就导致触发不了剧情」。
 *
 * 根因是同一个座位判断写了两遍、条件还不一样：
 *   · `MapScreen` 的键盘分支原来只看 `站在座位上` → **不管坐没坐**都吃掉这一次按键；
 *   · `state/story.ts` 的 `地图交互` 是 `(站在座位上 || 近座) && !坐着` → 第二下本该开主线。
 * 键盘那道闸在 `地图交互` **之前**就 return 了，所以后者成了死代码，主线被锁死。
 *
 * 这个脚本用**真键盘**（不是直接调函数）走三遍，每遍**开一张新页面**：
 *   ① 「我的工位」：第一下坐下、**第二下开主线**（被卡死的就是这一步）
 *   ② 空沙发上：第一下坐下、第二下**站起来**（没别的事可做时空格还能下来）
 *   ③ 干净地板上：空格什么都不做，也不会误开主线
 *
 * ⚠️ **为什么每个场景开新页面**：踩过。同一张页面里连着换场景会串味 ——
 *    `MapScreen` 卸载时不清 `window.__lksMap`（那是已销毁的旧场景）、
 *    坐着的时候"瞬移"会被坐姿钉在原地、上一步的座位状态还会留着。
 *    结果测试报了一堆假失败，而产品其实是好的。**一个新页面 = 一个干净的世界。**
 *
 * 用法（在游戏目录跑，需要 dev server 已在 5273）：
 *   node tools/空格优先级体检.mjs
 */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const URL = 'http://127.0.0.1:5273/';
const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));
if (!EDGE) {
  console.error('找不到 Edge');
  process.exit(1);
}

let 坏 = 0;
const 断言 = (条件, 说明) => {
  console.log(`  ${条件 ? '✓' : '✗'} ${说明}`);
  if (!条件) 坏 += 1;
};
const 等 = (ms) => new Promise((r) => setTimeout(r, ms));

/** 各交互点的像素坐标（和 level.ts 一致：x*32+16 / y*32+32） */
const 格到像素 = (x, y) => ({ x: x * 32 + 16, y: y * 32 + 32 });

const 浏览器 = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox', '--force-device-scale-factor=1'],
});

/**
 * 开一张干净页面 + 一个干净的地图场景，把主角放到指定的一格上。
 * @returns {{页, 读, 按空格, 等到, 关}} 一组操作
 */
async function 一个新世界(段号, 格, 地图目标 = null) {
  const 页 = await 浏览器.newPage();
  await 页.setViewport({ width: 1440, height: 900 });
  const 页错 = [];
  页.on('pageerror', (e) => 页错.push(e.message));
  await 页.goto(URL, { waitUntil: 'networkidle2' });
  await 页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
  await 等(700);

  await 页.evaluate(
    ({ 段号, 地图目标 }) => {
      const s = window.__lksStory;
      s.getState().跳过开场();
      s.setState({
        屏幕: 'map',
        段号,
        地图目标,
        队列: [],
        位置: 0,
        待暂停: null,
        待选择: null,
        待去房间: null,
        续播: null,
        附近交互点: null,
        跑团局: null,
        播完: false,
        地图位置: null, // ⚠️ 留着"位置记忆"会把主角传送回上一步的格子
      });
    },
    { 段号, 地图目标 },
  );
  await 页.waitForFunction(() => !!window.__lksMap && !!window.__lksMap.scene?.isActive?.(), { timeout: 20000 });
  await 等(700);

  // 传送（新页面上没有坐姿残留，直接放过去就行）
  await 页.evaluate((pt) => window.__lksMap.传送像素(pt.x, pt.y), 格到像素(格[0], 格[1]));
  await 等(500);

  const 读 = () =>
    页.evaluate(() => {
      const s = window.__lksStory.getState();
      return {
        屏幕: s.屏幕,
        段号: s.段号,
        站着: s.站在座位上,
        坐着: s.坐着,
        附近点: s.附近交互点,
        队列首: s.队列[0]?.类型 ?? null,
        场景坐着: window.__lksMap?.在坐着?.() ?? null,
        格: window.__lksMap?.位置?.() ?? null,
      };
    });

  /** 轮询等条件成立；**超时不抛**，把现场打出来（抛掉会把"哪一步没落地"埋掉） */
  const 等到 = async (条件, 说明, 上限 = 5000) => {
    try {
      await 页.waitForFunction(条件, { timeout: 上限, polling: 60 });
      return true;
    } catch {
      console.log(`    ⚠️ 等超时：${说明}｜当时 ${JSON.stringify(await 读())}`);
      return false;
    }
  };

  const 按空格 = async () => {
    await 页.keyboard.press('Space');
    await 等(120);
  };

  return { 页, 读, 按空格, 等到, 页错, 关: () => 页.close() };
}

console.log('=== ① 「我的工位」= 椅子 + 事件二入口，空格该听谁的 ===\n');
{
  // 事件二的地图入口就是「我的工位」→ 把指引线指向它 = 主线已就位
  const w = await 一个新世界(1, [24, 4], '我的工位');
  const 前 = await w.读();
  console.log(`    到位后：站着=${前.站着} 坐着=${前.坐着} 附近点=${前.附近点} 格=${JSON.stringify(前.格)}`);
  断言(前.附近点 === '我的工位', `走到 (24,4) 认出了主线入口（附近点=${前.附近点}）`);
  断言(前.站着 === true, '场景认出"附近有座位"（不然坐不下去）');

  // 坐下之前，提示行说的应该是"坐下看看"（和第一下的行为一致）
  const 提示前 = await w.页.evaluate(() => document.querySelector('.map-prompt-act')?.textContent ?? '');
  断言(提示前.includes('坐下'), `没坐下时提示说"先坐下"（实际「${提示前}」）`);

  await w.按空格();
  await w.等到(() => window.__lksStory.getState().坐着 === true, '第一次空格没坐下');
  const 一 = await w.读();
  断言(一.坐着 === true && 一.屏幕 === 'map', `第一次空格：先坐下，还没开主线（坐着=${一.坐着}，屏幕=${一.屏幕}）`);

  // ⚠️ 坐下之后提示**必须跟着变**，不然玩家不知道"再按一次就能开始"
  //    （用户报的正是"触发不了剧情"—— 提示不改的话看起来就是空格失灵）
  await w.等到(
    () => (document.querySelector('.map-prompt-act')?.textContent ?? '').includes('开始这一段'),
    '坐下后提示没变成"开始这一段"',
  );
  const 提示后 = await w.页.evaluate(() => document.querySelector('.map-prompt-act')?.textContent ?? '');
  断言(提示后.includes('开始这一段'), `坐下后提示变成"开始这一段"（实际「${提示后}」）`);

  await w.按空格();
  const 开了 = await w.等到(() => window.__lksStory.getState().屏幕 === 'avg', '第二次空格没开主线');
  const 二 = await w.读();
  断言(
    开了 && 二.队列首 === '切会话',
    `**第二次空格：主线开播了**（屏幕=${二.屏幕}，队列首=${二.队列首}）—— 这就是用户报的那一步`,
  );
  断言(w.页错.length === 0, w.页错.length ? `页面错误：${w.页错[0]}` : '没有页面错误');
  await w.关();
}

console.log('\n=== ② 空沙发上：坐着按空格还要能站起来 ===\n');
{
  // 前台双人沙发 (17,26)：离「前台」交互点 (21,26) 有 4 格 = 128px，肯定够远，
  // 所以"第二次空格"不会跑去开支线（那是正确行为，但验不到"站起来"）。
  const w = await 一个新世界(1, [17, 26]);
  const 前 = await w.读();
  断言(前.站着 === true, `前台沙发认出了座位（格=${JSON.stringify(前.格)}）`);

  await w.按空格();
  await w.等到(() => window.__lksStory.getState().坐着 === true, '第一次空格没坐下');
  const 坐 = await w.读();
  断言(坐.坐着 === true, '空沙发：第一次空格坐下了');
  // 把"前提"也断言掉：这一格必须真的没有交互点，否则下面那条测的是别的东西
  断言(坐.附近点 === null, `空沙发上确实没有交互点（附近点=${坐.附近点 ?? '无'}）`);

  await w.按空格();
  await w.等到(() => window.__lksStory.getState().坐着 === false, '第二次空格没站起来');
  const 站 = await w.读();
  断言(站.坐着 === false, `空沙发：第二次空格站了起来（没别的事可做时空格能下来，坐着=${站.坐着}）`);
  断言(站.场景坐着 === false, '场景那边也确实起来了（两边对得上）');
  await w.关();
}

console.log('\n=== ③ 站在没有任何交互点的地板上 ===\n');
{
  // ⚠️ 别用 (6,18)：那是「茶水间」交互点（有支线片段），按空格会开支线 —— 那是**正确**行为。
  //    这里要的是一块**真正干净**的地板。(20,12) 是主走廊，没有交互点也没有座位。
  const w = await 一个新世界(1, [20, 12]);
  const 前 = await w.读();
  断言(
    前.附近点 === null && 前.站着 === false,
    `(20,12) 确实是一块干净地板（附近点=${前.附近点 ?? '无'}，站着=${前.站着}）`,
  );
  await w.按空格();
  await 等(300);
  const r = await w.读();
  断言(r.屏幕 === 'map' && r.坐着 === false, `干净地板上按空格什么都不发生（屏幕=${r.屏幕}，坐着=${r.坐着}）`);
  await w.关();
}

await 浏览器.close();
console.log(坏 ? `\n✗ ${坏} 项没过` : '\n✓ 空格优先级全部通过（坐下 → 再按开主线 / 空椅子能下来 / 干净地板不误触）');
process.exit(坏 ? 1 : 0);
