/**
 * 微信开关体检：复现"进行主线时打开微信被强制关闭"这个 bug。
 *
 * 做法：进地图 → 打开主线（走到入口按空格）→ 播几步 → 按 Tab 掏手机 →
 *      观察 ①屏幕有没有真的切到 avg ②会不会自己跳回 map ③主线进度有没有乱。
 *
 * 用法（在游戏目录跑）：node tools/微信开关体检.mjs
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

const 状态 = () =>
  页.evaluate(() => {
    const s = window.__lksStory.getState();
    return {
      屏幕: s.屏幕,
      段号: s.段号,
      位置: s.位置,
      队列长: s.队列.length,
      查看: s.查看会话,
      活跃: s.活跃会话,
      待选择: !!s.待选择,
      待邀请: !!s.待接受邀请,
      待暂停: s.待暂停,
      待去房间: s.待去房间,
      续播: s.续播,
      目标: s.地图目标,
      有地图: !!document.querySelector('.map-canvas canvas'),
      有微信: !!document.querySelector('.wc-row') || !!document.querySelector('.wc-log'),
    };
  });

console.log('=== ① 站在地图上，主线正播着（后台在推进）===\n');
await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'map', 段号: 1 }));
await 页.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
await 等(900);
// 制造"主线正在播"的状态：先开一段，再把屏幕切回地图（模拟玩家边走边播）
await 页.evaluate(() => window.__lksStory.getState().地图交互('我的工位'));
await 等(300);
for (let i = 0; i < 5; i += 1) {
  await 页.evaluate(() => window.__lksStory.getState().推进一步());
  await 等(50);
}
await 页.evaluate(() => window.__lksStory.getState().回地图());
await 等(400);
const 播中 = await 状态();
console.log('  地图上，剧情停在位置', 播中.位置, '/', 播中.队列长, '屏幕=', 播中.屏幕);
if (播中.屏幕 !== 'map') {
  console.log('  ⚠️ 没回到地图，后面的断言不可信');
}

console.log('\n=== ② 按 Tab 掏手机（这是用户报 bug 的那一步）===\n');
await 页.keyboard.press('Tab');
await 等(500);
const 掏了 = await 状态();
console.log('  按 Tab 后：', JSON.stringify(掏了));
const 切过去了 = 掏了.屏幕 === 'avg';

console.log('\n=== ③ 让剧情自己播到「去房间」，看它会不会**自己**把屏幕切走 ===\n');
// 剧情正播着，等它播到 去房间 那一条（自动推进应该在那一拍停住）
let 等到 = null;
for (let i = 0; i < 40; i += 1) {
  await 等(250);
  const s = await 状态();
  if (s.屏幕 !== 'avg') {
    等到 = { ...s, 出问题: '屏幕被自己切走了' };
    break;
  }
  if (s.待去房间) {
    等到 = { ...s, 出问题: null };
    break;
  }
  // 推一把，别真等十几秒
  await 页.evaluate(() => window.__lksStory.getState().推进一步());
}
if (!等到) {
  console.log('  ⚠️ 10 秒内没播到「去房间」，这一项跳过');
} else if (等到.出问题) {
  console.log(`  ⚠️ 剧情播到一半自己切屏了：`, JSON.stringify(等到));
} else {
  console.log('  ✓ 播到「去房间」就停住了，屏幕还在微信里（待去房间 =', 等到.待去房间.去哪, '）');
}

console.log('\n=== ④ 点「去 XX ▸」按钮才切地图 ===\n');
const 按钮前 = await 状态();
if (按钮前.待去房间) {
  // 用 DOM 点那个按钮（模拟玩家真点）
  const 点到了 = await 页.evaluate(() => {
    const 钮 = [...document.querySelectorAll('.wc-btn')].find((b) => b.textContent?.includes('去 '));
    if (!钮) return false;
    钮.click();
    return true;
  });
  await 等(400);
  const 后 = await 状态();
  console.log(`  按钮点到了=${点到了} → 屏幕=${后.屏幕} 目标=${后.目标} 续播=${JSON.stringify(后.续播)}`);
  const 对 = 点到了 && 后.屏幕 === 'map' && 后.续播;
  console.log(对 ? '  ✓ 点了才切地图，并且记下了"回来接着播"' : '  ✗ 按钮流程不对');
} else {
  console.log('  （没到那一步，跳过）');
}

console.log('\n=== ⑤ 回到微信看主线消息（"不发消息了"那个 bug）===\n');
await 页.evaluate(() => window.__lksStory.getState().掏手机());
await 等(400);
const 微信 = await 页.evaluate(() => {
  const s = window.__lksStory.getState();
  const 看 = s.会话们.find((c) => c.id === s.查看会话);
  return {
    查看会话: s.查看会话,
    活跃会话: s.活跃会话,
    看的这条有几条消息: 看?.条目.length ?? -1,
    DOM里的消息数: document.querySelectorAll('.wc-msg, .wc-sys, .wc-time, .wc-zhihu, .wc-invite').length,
    条目: 看?.条目.map((x) => x.种类 + ':' + String(x.文本 ?? '').slice(0, 14)) ?? [],
  };
});
console.log('  ', JSON.stringify({ ...微信, 条目: undefined }, null, 1).replace(/\n\s+/g, ' '));
console.log('   内容：', 微信.条目.slice(0, 6).join(' / '));
const 有消息 = 微信.看的这条有几条消息 > 0 && 微信.DOM里的消息数 > 0;
console.log(
  有消息
    ? '  ✓ 打开微信看到的是**正在发消息的那个会话**，消息有渲染出来'
    : '  ✗ 打开微信看到的是空会话（玩家会以为"剧情不发消息了"）',
);

console.log('\n=== ⑥ 未读红点只算"真消息"，时间和系统提示不算 ===\n');
let 坏 = 0;
const 断言 = (条件, 说明) => {
  console.log(`  ${条件 ? '✓' : '✗'} ${说明}`);
  if (!条件) 坏 += 1;
};
// 造一段干净的场景：切到新会话 → 时间 → 系统 → 两条真消息，逐条看未读
const 红点 = await 页.evaluate(async () => {
  const st = window.__lksStory;
  const 会话 = 'reddot';
  const 读未读 = () => st.getState().会话们.find((c) => c.id === 会话)?.未读 ?? -1;
  const 追踪 = [];
  st.setState({
    屏幕: 'avg',
    会话们: [
      ...st.getState().会话们,
      { id: 会话, 名字: '红点测试', 类型: '私聊', 对方: '小鹿', 未读: 0, 条目: [] },
    ],
    活跃会话: 会话,
    查看会话: 'group', // ⚠️ 故意在看别的会话，这样才会累计未读
    队列: [
      { 类型: '时间', 文本: 'day-03 · 下午 16:11', 间隔: 5000 },
      { 类型: '系统', 文本: '你已添加 小鹿，现在可以开始聊天了', 间隔: 5000 },
      { 类型: '消息', 谁: '小鹿', 文本: '在吗', 间隔: 5000 },
      { 类型: '消息', 谁: '小鹿', 文本: '在的', 间隔: 5000 },
    ],
    位置: 0,
    待暂停: null,
    播完: false,
    待去房间: null,
    待选择: null,
    待接受邀请: null,
  });
  追踪.push({ 步: '起始', 未读: 读未读() });
  for (let i = 0; i < 4; i += 1) {
    st.getState().推进一步();
    await new Promise((r) => setTimeout(r, 30));
    const 条目 = st.getState().会话们.find((c) => c.id === 会话)?.条目 ?? [];
    追踪.push({ 步: i + 1, 未读: 读未读(), 最后一条: 条目[条目.length - 1]?.种类 ?? null });
  }
  return 追踪;
});
for (const t of 红点) console.log(`   ${t.步}：未读=${t.未读}${t.最后一条 ? `  最后一条=${t.最后一条}` : ''}`);
断言(红点[0].未读 === 0, '起始未读 0');
断言(红点[1].未读 === 0 && 红点[1].最后一条 === '时间', '**时间**分隔符不加未读');
断言(红点[2].未读 === 0 && 红点[2].最后一条 === '系统', '**系统**提示不加未读');
断言(红点[3].未读 === 1 && 红点[3].最后一条 === '消息', '第一条真消息 → 未读 1');
断言(红点[4].未读 === 2, '第二条真消息 → 未读 2');

console.log(
  `\n${切过去了 && 有消息 && !坏 ? '✓ 全部通过：Tab 能开微信、剧情播到「去房间」会停住等玩家点、消息看得到、红点只数真消息' : `✗ 有问题（${坏} 项），看上面`}`,
);
await 浏览器.close();
process.exit(坏 ? 1 : 0);
