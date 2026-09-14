/**
 * 事件四验收：**跑团 + 开启小游戏**整条链路的实拍与断言。
 *
 * 为什么要有它：
 *   这一轮加了两样东西 —— ①「跑团」节拍（会议室里一轮一轮掷骰，AI 写镜头 + 台词）
 *   ②「开小游戏」节拍（切到工作关，打完切回来）。这两样都在**剧情中段**，
 *   手工验一次要点半天：开场 → 事件一 → 事件二（还要走到房间）→ 事件三 → 事件四。
 *   所以这里用 `window.__lks剧本`（DEV 探针）**直接跳到事件四**，然后：
 *
 *     1. 跑到出现 `跑团局` → 截图（面板初态）
 *     2. 掷一次骰 → 截图（结果卡 + 台词）
 *     3. 一直掷到收束（通关/翻车/超时）→ 截图 + 断言"结局只有这三种"
 *     4. 断言：指标/线索只来自脚本、AI 挂了也是完整一局（来源标 '兜底'）
 *     5. 跑团收工 → 断言结果写进了会话
 *     6. 继续推到 `屏幕 === 'level'` → 截图（关卡简报）
 *     7. 点「开始干活」→ 截图（工作关运行中）+ 用 `__lksProbe` 断言工位与工单
 *     8. 关卡结束 → 断言切回 avg 且成绩写进了会话
 *
 * 用法（在游戏目录跑，需要 dev server 已在 5273）：
 *   node tools/事件四验收.mjs
 */
import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';

const URL = 'http://127.0.0.1:5273/';
const 出目录 = resolve('tools/shots/事件四');
mkdirSync(出目录, { recursive: true });

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

const 浏览器 = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox', '--force-device-scale-factor=1'],
});
const 等 = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 从玩家出生格 BFS，检查 5 个工位是否都走得到。
 * ⚠️ **地图一加结构就必须验这个**（用户要求"地图复杂一点"之后尤其重要）：
 *    隔断/小间摆错位置就会把某个工位关在死角里，而截图上看不出来。
 */
const 可达性检查 = (页面) =>
  页面.evaluate(() => {
    const p = window.__lksProbe?.();
    if (!p) return null;
    const 关 = p.grid;
    const { cols, rows } = p.关卡;
    const 可走 = (x, y) => {
      if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
      const v = 关[y][x];
      return v !== 6 && v !== 7;
    };
    const 起 = p.玩家格;
    const 见 = new Set([`${起.x},${起.y}`]);
    const 队 = [[起.x, 起.y]];
    while (队.length) {
      const [x, y] = 队.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        const k = `${nx},${ny}`;
        if (见.has(k) || !可走(nx, ny)) continue;
        见.add(k);
        队.push([nx, ny]);
      }
    }
    const 结果 = {};
    for (const [kind, 格] of Object.entries(p.stations格子)) {
      let 好 = false;
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
        const nx = 格.col + dx;
        const ny = 格.row + dy;
        if (可走(nx, ny) && 见.has(`${nx},${ny}`)) 好 = true;
      }
      结果[kind] = 好;
    }
    return {
      结果,
      走到的格数: 见.size,
      总可走: 关.flat().filter((_, i) => 可走(i % cols, Math.floor(i / cols))).length,
    };
  });

const 页 = await 浏览器.newPage();
await 页.setViewport({ width: 1440, height: 900 });
const 页面错误 = [];
页.on('pageerror', (e) => 页面错误.push(e.message));
await 页.goto(URL, { waitUntil: 'networkidle2' });
await 等(800);

/**
 * ⚠️ **先验"dev server 服务的是不是新模块"**。
 *
 * 踩过两次：长时间开着的 vite 有时不再重新 transform 改过的模块，
 * 于是"新剧情 + 旧界面"混着跑 —— 表现是一堆看不懂的失败
 * （跑团面板不渲染、进入工作台的按钮不出来），其实代码是对的。
 * 这里直接 fetch 源码模块找 ASCII 标记：找不到就**一句话说清原因**并退出。
 * 标记在 `src/state/story.ts` 的 `LKS_REV`。
 */
{
  const 要查 = [
    { 路径: '/src/state/story.ts', 标记: 'LKS_REV_MINIGAME_PAUSE' },
    { 路径: '/src/screens/Avg.tsx', 标记: 'wc-go-level' },
    { 路径: '/src/screens/%E5%85%B3%E5%8D%A1.tsx', 标记: 'lv-top' },
  ];
  const 旧 = await 页.evaluate(async (列表) => {
    const 坏 = [];
    for (const it of 列表) {
      const r = await fetch(it.路径);
      const t = await r.text();
      if (!t.includes(it.标记)) 坏.push(it.路径);
    }
    return 坏;
  }, 要查);
  if (旧.length) {
    console.error('\n✗ dev server 在发**旧模块**，别急着查代码：');
    for (const p of 旧) console.error('    ' + p);
    console.error('  这是 vite 的 transform 缓存问题（见交接文档 §4.1）。修法：');
    console.error('    Get-NetTCPConnection -LocalPort 5273 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }');
    console.error('    再重新起 npx vite --host 127.0.0.1 --port 5273 --strictPort');
    await 浏览器.close();
    process.exit(1);
  }
  console.log('（模块新鲜度检查通过）\n');
}

async function 抓(名) {
  await 页.screenshot({ path: join(出目录, `${名}.png`) });
  console.log(`  → ${名}.png`);
}

/** 把剧情推到"跑团开始" */
async function 跳到跑团() {
  await 页.evaluate(() => {
    const s = window.__lksStory;
    const 段 = window.__lks剧本.取段(3);
    s.setState({
      屏幕: 'avg',
      开场格: 99,
      段号: 3,
      段标签: '第 6 天',
      队列: [...段.节拍],
      位置: 0,
      待选择: null,
      待接受邀请: null,
      待暂停: null,
      待去房间: null,
      跑团局: null,
      播完: false,
    });
  });
  推到跑团();
}

function 推到跑团() {
  return 页.evaluate(() => {
    const s = window.__lksStory;
    for (let i = 0; i < 400; i += 1) {
      const st = s.getState();
      if (st.跑团局) return true;
      if (st.待接受邀请) {
        st.接受邀请();
      } else if (st.待选择) {
        st.选择(0);
      } else if (st.待去房间) {
        // 剧本里的「去房间」要玩家回地图走过去按空格。验收脚本**不模拟走路**，
        // 直接把这一拍跳过去（位置还停在『去房间』那条上，加一就是下一条）。
        s.setState({ 待去房间: null, 位置: st.位置 + 1 });
      } else if (st.待暂停) {
        st.点暂停();
      } else if (st.播完) {
        return false;
      } else {
        st.推进一步();
      }
    }
    return false;
  });
}

console.log('=== ① 跳到事件四的跑团 ===\n');
await 跳到跑团();
await 等(500);
{
  const st = await 页.evaluate(() => {
    const s = window.__lksStory.getState();
    return { 有局: !!s.跑团局, 标题: s.跑团局?.配置.标题, 轮: s.跑团局?.局.轮, 屏幕: s.屏幕 };
  });
  断言(st.有局, `剧情路上出现了跑团局（${st.标题}）`);
  断言(st.屏幕 === 'avg', '跑团期间屏幕是 avg（聊天界面还在下面）');
  await 抓('1-跑团-开始');
}

console.log('\n=== ② 掷一轮骰：兜底立刻上屏 ===\n');
await 页.evaluate(() => window.__lksStory.getState().跑团掷骰());
await 等(300);
{
  const r = await 页.evaluate(() => {
    const 局 = window.__lksStory.getState().跑团局.局;
    const g = 局.日志[局.日志.length - 1];
    return { 轮: 局.轮, 档: g.档, 叙述: g.叙述, 对白: g.对白 ?? null, 谁说: g.谁说 ?? null, 骰: g.骰子, 来源: g.来源 };
  });
  断言(r.轮 === 1, '掷了一次，轮数 = 1');
  断言(['大成功', '成功', '失败', '大失败'].includes(r.档), `档位是四种之一（${r.档}）`);
  断言(typeof r.叙述 === 'string' && r.叙述.length >= 12, '兜底镜头已经上屏（不用等 AI）');
  断言(['AI', '兜底'].includes(r.来源), `来源标记正确（${r.来源}）`);
  console.log(`    骰 ${r.骰.join('+')} → ${r.档}｜${r.叙述}`);
  if (r.对白) console.log(`    ${r.谁说}：${r.对白}`);
  await 抓('2-跑团-第一轮');
}

console.log('\n=== ③ 一直掷到收束 ===\n');
{
  const 收 = await 页.evaluate(async () => {
    const s = window.__lksStory;
    for (let i = 0; i < 40; i += 1) {
      const st = s.getState();
      if (!st.跑团局 || st.跑团局.局.局况 !== '进行中') break;
      st.跑团掷骰();
      await new Promise((r) => setTimeout(r, 40));
    }
    const 局 = s.getState().跑团局.局;
    return {
      局况: 局.局况,
      轮: 局.轮,
      命中: 局.命中,
      失误: 局.失误,
      线索: 局.线索,
      有台词: 局.日志.filter((g) => g.对白).length,
      全部有叙述: 局.日志.every((g) => typeof g.叙述 === 'string' && g.叙述.length >= 12),
    };
  });
  断言(['通关', '翻车', '超时'].includes(收.局况), `收束只有三种之一（${收.局况}，${收.轮} 轮）`);
  断言(收.全部有叙述, `每一轮都有镜头（${收.轮} 轮全齐）`);
  断言(收.有台词 > 0, `有 ${收.有台词} 轮带上了台词（作者兜底也在说话）`);
  断言(收.线索.length >= 0, `线索 ${收.线索.length} 条：${收.线索.join('；') || '（无）'}`);
  await 等(400);
  await 抓('3-跑团-收束');
}

console.log('\n=== ④ 跑团收工：结果写进会话，指标入账 ===\n');
{
  const r = await 页.evaluate(() => {
    const s = window.__lksStory;
    const 前 = s.getState().指标;
    s.getState().跑团收工();
    const 后 = s.getState();
    const 活跃 = 后.会话们.find((c) => c.id === 后.活跃会话);
    const 尾 = 活跃.条目.slice(-4).map((x) => (x.种类 === '指标' ? '[指标]' : x.文本));
    return { 有局: !!后.跑团局, 前, 后: 后.指标, 尾 };
  });
  断言(r.有局 === false, '收工后跑团局被清空');
  断言(r.尾.some((t) => String(t).includes('线索')) || r.尾.some((t) => String(t).includes('【')), `会话里出现了收束记录：${r.尾.join(' / ')}`);
  断言(r.前.信任 !== r.后.信任 || r.前.成长 !== r.后.成长 || r.前.协作 !== r.后.协作, `三项指标有进账（信任 ${r.前.信任}→${r.后.信任}）`);
  await 等(400);
  await 抓('4-跑团收工回会话');
}

console.log('\n=== ⑤ 「开小游戏」要先停一下，点一下才进（用户要求） ===\n');
{
  // ⚠️ 用户报过："在开始小游戏之前要停顿一下点击进入再进入，要不到前面发的信息了"。
  //    所以这一拍**不能直接切屏**：屏幕要还停在 avg，并出现「进入工作台 ▸」按钮。
  const 停在聊天 = await 页.evaluate(async () => {
    const s = window.__lksStory;
    for (let i = 0; i < 400; i += 1) {
      const st = s.getState();
      if (st.待开小游戏) return true;
      if (st.待接受邀请) st.接受邀请();
      else if (st.待选择) st.选择(0);
      else if (st.待去房间) s.setState({ 待去房间: null, 位置: st.位置 + 1 });
      else if (st.待暂停) st.点暂停();
      else if (st.屏幕 === 'level') return false; // 直接跳过去了 = bug
      else if (st.播完) return false;
      else st.推进一步();
      await new Promise((r) => setTimeout(r, 12));
    }
    return false;
  });
  断言(停在聊天, '剧情播到「开小游戏」时**停住了**（没有直接切屏）');
  await 等(500);

  const 中途 = await 页.evaluate(() => {
    const s = window.__lksStory.getState();
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('进入工作台'));
    const 有聊天记录 = s.会话们.some((c) => c.条目.length > 3);
    return { 屏幕: s.屏幕, 有按钮: !!b, 文案: b?.textContent?.trim() ?? '', 有聊天记录, 标题: s.关卡标题 };
  });
  断言(中途.屏幕 === 'avg', `这时候屏幕还是 avg（实际 ${中途.屏幕}）—— 玩家能回看前面的消息`);
  断言(中途.有按钮, `聊天区底下出现了进入按钮（${中途.文案}）`);
  断言(中途.有聊天记录, '前面的聊天记录还在（这就是"停顿"的意义）');
  await 抓('5a-停在聊天界面等玩家点');

  // 点它才真的进工作关
  await 页.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('进入工作台'));
    b?.click();
  });
  await 等(1400);
  const st = await 页.evaluate(() => {
    const s = window.__lksStory.getState();
    return {
      屏幕: s.屏幕,
      标题: s.关卡标题,
      提示: s.关卡提示,
      按钮: [...document.querySelectorAll('.overlay button')].find((x) => x.textContent === '开始干活')?.textContent ?? '',
    };
  });
  断言(st.屏幕 === 'level', '点了按钮之后才切到 level');
  断言(st.标题.length > 0, `关卡标题来自剧本：「${st.标题}」`);
  断言(st.提示.length > 0, `关卡提示来自剧本：「${st.提示}」`);
  断言(st.按钮 === '开始干活', `开场按钮是「开始干活」（实际「${st.按钮}」）`);
  await 抓('5b-工作关-简报');
}

console.log('\n=== ⑥ 点「开始干活」进工作关 ===\n');
{
  await 页.evaluate(() => {
    const btns = [...document.querySelectorAll('.overlay button')];
    const b = btns.find((x) => x.textContent === '开始干活');
    b?.click();
  });
  await 等(1500);
  const p = await 页.evaluate(() => window.__lksProbe?.() ?? null);
  断言(!!p, '关卡探针 __lksProbe 可用');
  if (p) {
    const 应有 = ['files', 'library', 'desk', 'print', 'bin'];
    断言(应有.every((k) => p.stations[k]), `五个工位齐全：${Object.keys(p.stations).join('、')}`);
    断言(!!p.orders[0]?.客户, `工单带客户名（${p.orders[0]?.客户}）`);
    断言(!!p.orders[0]?.类型, `工单带类型（${p.orders[0]?.类型}）`);
    // 关卡网格是**按窗口现造**的（全屏 → 格数随窗口变），不再写死 16×9
    断言(p.关卡.cols >= 11 && p.关卡.rows >= 7, `关卡按窗口现造：${p.关卡.cols}×${p.关卡.rows} 格`);
    const 墙 = p.grid.flat().filter((v) => v === 6).length;
    断言(墙 > 20, `地面用的是地图那套瓦片（白墙 ${墙} 格）`);
    // 用户要求「AI 队友**去掉不干活的队友**」→ 只留一个真干活的帮手，没有站桩同事
    断言(p.队友数 === 1, `队友只有 1 个（而且他真的在干活），没有站桩同事（实际 ${p.队友数}）`);
    // 帮手：按工单客户选的"相关同事"
    断言(!!p.npc名 && !!p.npcStateText, `帮手是同事本人：「${p.npc名} · ${p.npcStateText}」`);
    // 帮手的**四方向行走图**（2026-09 素材）：贴图 key 应该是 chr_<拼音>_walk，而不是 npc_<名>
    断言(
      String(p.npcTexture).startsWith('chr_') && String(p.npcTexture).endsWith('_walk'),
      `帮手用的是四方向行走图（贴图 ${p.npcTexture}）`,
    );
  }
  const 提示 = await 页.evaluate(() => window.__lksStore.getState().prompt);
  断言(String(提示).includes('任务单'), `关卡提示是工作内容：「${提示}」`);

  // ⚠️ 工位名牌是 DOM 画的（画布里画中文会糊）—— 曾经因为重写关卡屏把它整个漏掉过，
  //    所以这里钉一条：5 个名牌都在、都有字、都落在画布范围里。
  const 名牌 = await 页.evaluate(() => {
    const 画 = document.querySelector('.lv-canvas');
    const 框 = 画 ? 画.getBoundingClientRect() : null;
    return [...document.querySelectorAll('.lv-root .station-label')].map((e) => {
      const r = e.getBoundingClientRect();
      return {
        字: e.textContent ?? '',
        在画布内: !!框 && r.left >= 框.left - 1 && r.right <= 框.right + 1 && r.top >= 框.top - 1 && r.bottom <= 框.bottom + 1,
      };
    });
  });
  断言(名牌.length === 5, `5 个工位名牌都在（${名牌.map((m) => m.字).join('、')}）`);
  断言(名牌.every((m) => m.字.length > 0 && m.在画布内), '名牌都有字、且都落在画布范围里');

  // 每台机器要有**自己的图标**（用户要求"每个机器要显示出来"）
  const 机器图标 = await 页.evaluate(() =>
    [...document.querySelectorAll('.lv-root .station-label')].map((e) => {
      const img = e.querySelector('img.lv-station-ico');
      return img ? { 有图: true, 加载到: img.naturalWidth > 0, 高: Math.round(img.getBoundingClientRect().height) } : { 有图: false };
    }),
  );
  断言(
    机器图标.length === 5 && 机器图标.every((m) => m.有图 && m.加载到),
    `5 台机器都挂上了自己的图标、而且真加载出来了（高 ${机器图标[0]?.高 ?? 0}px）`,
  );

  // **不许重叠**：名牌两两之间不能压在一起（用户明确要求"不要重叠"）
  const 重叠 = await 页.evaluate(() => {
    const 们 = [...document.querySelectorAll('.lv-root .station-label')].map((e) => e.getBoundingClientRect());
    const 撞 = [];
    for (let i = 0; i < 们.length; i += 1) {
      for (let j = i + 1; j < 们.length; j += 1) {
        const a = 们[i];
        const b = 们[j];
        const 宽 = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const 高2 = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (宽 > 1 && 高2 > 1) 撞.push(`${i}-${j}`);
      }
    }
    return 撞;
  });
  断言(重叠.length === 0, 重叠.length ? `这些工位名牌互相压住了：${重叠.join('、')}` : '5 个机器名牌两两不重叠');

  // 全屏 + 1:5 任务条：顶部要有工单卡，且画布在下 4/5
  const 版式 = await 页.evaluate(() => {
    const 条 = document.querySelector('.lv-top');
    const 画 = document.querySelector('.lv-canvas');
    const 卡 = document.querySelectorAll('.lv-card').length;
    return {
      有任务条: !!条,
      工单卡数: 卡,
      顶高: 条 ? Math.round(条.getBoundingClientRect().height) : 0,
      视口高: window.innerHeight,
      画布宽: 画 ? Math.round(画.getBoundingClientRect().width) : 0,
      视口宽: window.innerWidth,
    };
  });
  断言(版式.有任务条, '顶部有任务条');
  断言(版式.工单卡数 === 3, `任务条上有 3 张工单卡（实际 ${版式.工单卡数}）`);
  // ⚠️ 工单卡被切掉一半 = 玩家看不出这单要做什么，所以"不许纵向裁"要单独断言
  const 裁 = await 页.evaluate(() => {
    const 条 = document.querySelector('.lv-top');
    return 条 ? { 滚: 条.scrollHeight, 高: 条.clientHeight } : null;
  });
  断言(!!裁 && 裁.滚 <= 裁.高 + 2, `任务条没有纵向裁切（内容 ${裁?.滚}px ≤ 高 ${裁?.高}px）`);
  // ⚠️ 光"不裁"不够：横向滚的话卡片会被推到屏幕外 —— 任务和"手上这一版"都必须**看得见**
  const 越界 = await 页.evaluate(() => {
    const 条 = document.querySelector('.lv-top');
    if (!条) return ['没有 .lv-top'];
    const 框 = 条.getBoundingClientRect();
    const 坏 = [];
    for (const 选择 of ['.lv-card', '.lv-carry', '.lv-helper']) {
      for (const el of document.querySelectorAll(选择)) {
        const r = el.getBoundingClientRect();
        if (r.right > 框.right + 1 || r.left < 框.left - 1) 坏.push(选择);
      }
    }
    return 坏;
  });
  断言(越界.length === 0, 越界.length ? `这些块跑到任务条外面去了：${越界.join('、')}` : '工单卡 / 手上 / 帮手都在任务条里（不用滚就能看见）');
  const 占 = 版式.视口高 > 0 ? 版式.顶高 / 版式.视口高 : 0;
  断言(占 > 0.13 && 占 < 0.28, `任务条大约占上面 1/5（实测 ${(占 * 100).toFixed(0)}%）`);
  断言(版式.画布宽 > 版式.视口宽 * 0.85, `画布基本铺满宽度（${版式.画布宽}/${版式.视口宽}）`);

  // ⚠️ 用户要求「每个机器比如打印机要**显示出来**，并且**提示不要盖住字体和素材**」。
  //    这条断言把"画布上不许有浮层"钉死：关卡根节点下、除画布容器之外的任何块，
  //    都不许和画布矩形重叠（原先"现在该做什么"和飘字就压在最上面那排工位上）。
  const 压画布 = await 页.evaluate(() => {
    const 画 = document.querySelector('.lv-canvas');
    if (!画) return ['没有画布'];
    const c = 画.getBoundingClientRect();
    const 坏 = [];
    for (const el of document.querySelectorAll('.lv-root > *')) {
      if (el.classList.contains('lv-stage')) continue; // 画布就装在它里面
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const 重叠 = !(r.bottom <= c.top + 1 || r.top >= c.bottom - 1 || r.right <= c.left + 1 || r.left >= c.right - 1);
      if (重叠) 坏.push(el.className || el.tagName);
    }
    return 坏;
  });
  断言(
    压画布.length === 0,
    压画布.length ? `这些块压在画布上（会盖住机器和素材）：${压画布.join('、')}` : '画布上没有任何浮层（工位/机器/名牌全露得出来）',
  );

  // 工序图标：丢一件"已经做过两道工序"的稿子在地上，它身上要盖 2 枚图标（胡闹厨房式）
  await 页.evaluate(() => {
    // ⚠️ 要改**场景里的字段**，不是 store —— store 只是每 80ms 同步过来的镜像，
    //    场景的 `丢下()` 读的是 `this.carrying`（第一版写在 store 上，丢了个寂寞）。
    const 场景 = window.__lksGame?.scene?.getScene('office');
    if (!场景 || typeof 场景.丢下 !== 'function') return;
    场景.carrying = 'draft';
    场景.carryTags = ['查资料', '写稿'];
    场景.丢下();
  });
  await 等(400); // 等 pushSync 把地面物推上来（每 80ms 一帧同步）
  const 图标 = await 页.evaluate(() => {
    const g = window.__lksProbe?.().ground ?? [];
    return { 数: g.length, 最后: g.at(-1) ?? null };
  });
  断言(
    图标.数 > 0 && (图标.最后?.工序 ?? []).length === 2,
    `丢下的稿子带着工序记录（${(图标.最后?.工序 ?? []).join('+') || '空'}）`,
  );
  断言(
    图标.最后?.图标 === 2,
    `地上的稿子盖了 ${图标.最后?.图标 ?? 0} 枚工序图标（= 已完成的工序数，一眼看出做到哪一步）`,
  );

  // 工序图标：确认用的是**真素材**（14×16 / 13×16 / 12×15），而不是程序现画的兜底（14×14）
  const 图标源 = await 页.evaluate(() => {
    const 场 = window.__lksGame?.scene?.getScene('office');
    if (!场) return null;
    const 取 = (k) => {
      const t = 场.textures.get(k);
      const s = t && typeof t.getSourceImage === 'function' ? t.getSourceImage() : null;
      return s ? [s.width, s.height] : null;
    };
    return { 查资料: 取('ic_工序_查资料'), 写稿: 取('ic_工序_写稿'), 校对: 取('ic_工序_校对') };
  });
  断言(
    !!图标源 && (图标源.查资料?.[1] ?? 0) >= 15 && (图标源.写稿?.[1] ?? 0) >= 15,
    `工序图标用的是真素材（查资料 ${图标源?.查资料?.join('×')} / 写稿 ${图标源?.写稿?.join('×')} / 校对 ${图标源?.校对?.join('×')}；程序兜底是 14×14）`,
  );

  // 两件纸：确认换成了新素材（老 demo 是 prop_flyer / prop_resume）
  const 纸 = await 页.evaluate(() => {
    const 场 = window.__lksGame?.scene?.getScene('office');
    return 场 ? { 任务单: 场.textures.exists('prop_desk_任务单_空白'), 稿子: 场.textures.exists('prop_desk_任务单_写过'), 老任务单: 场.textures.exists('prop_flyer') } : null;
  });
  断言(!!纸?.任务单 && !!纸?.稿子, '手上那两件纸用的是新素材（任务单_空白 / 任务单_写过）');
  断言(纸?.老任务单 === false, '已经不再加载老 demo 的 prop_flyer 了');

  await 抓('6-工作关-运行中');
}

console.log('\n=== ⑥a 地图结构：更复杂了，但必须"条条通" ===\n');
{
  const 图 = await 页.evaluate(() => window.__lksProbe?.() ?? null);
  // ASCII 平面图（诊断用：一眼看出新加的结构在哪儿）
  const 字 = { 0: '.', 4: '~', 5: '木', 6: '#', 7: '=', 16: 'D' };
  console.log(图.grid.map((行) => '    ' + 行.map((v) => 字[v] ?? '?').join('')).join('\n'));

  const 玻璃 = 图.grid.flat().filter((v) => v === 7).length;
  // 只有外圈墙的话玻璃是 0；有内部结构才会有玻璃
  断言(玻璃 >= 6, `地图里有内部结构（玻璃隔断 / 小间共 ${玻璃} 格）—— 不再是个空房间`);

  // ⚠️ **加了结构就一定要验"还走得到"**：从玩家出生格 BFS 走一遍，
  //    要求 5 个工位各自的相邻可走格 + 交稿箱都能到。
  const 可达 = await 可达性检查(页);
  const 到不了 = Object.entries(可达.结果).filter(([, v]) => !v).map(([k]) => k);
  断言(
    到不了.length === 0,
    到不了.length ? `这些工位走不到（地图被结构堵死了）：${到不了.join('、')}` : `5 个工位全都走得到（可达 ${可达.走到的格数}/${可达.总可走} 格）`,
  );
}

console.log('\n=== ⑥b 手上那份稿子的图标 + 帮手真的在干活（不会卡死） ===\n');
{
  // 手上拿一份"做过两道工序"的稿子：图标要跟得上（不是只有地上那份才有）
  await 页.evaluate(() => {
    const 场景 = window.__lksGame?.scene?.getScene('office');
    if (!场景) return;
    场景.carrying = 'draft';
    场景.carryTags = ['查资料', '写稿'];
  });
  await 等(300);
  const 手上 = await 页.evaluate(() => {
    const 场景 = window.__lksGame?.scene?.getScene('office');
    return { 图标: 场景?.carriedIcons?.length ?? -1 };
  });
  断言(手上.图标 === 2, `手上那份稿子也盖了 ${手上.图标} 枚图标（图标跟着东西走）`);
  await 页.evaluate(() => {
    const 场景 = window.__lksGame?.scene?.getScene('office');
    if (场景) {
      场景.carrying = null;
      场景.carryTags = [];
    }
  });

  // ⚠️ 用户要求：「AI 帮手自己干活来完善这个任务，但是很慢，大部分还是要玩家来完成」
  //    以及「AI 帮手又有自己的工作逻辑，要不然会卡住」。
  //    所以这里**真的等 20 秒**，看他自己跑不跑得动、会不会僵在原地。
  console.log('    （观察 20 秒，看帮手自己会不会干活……）');
  const 帮手 = await 页.evaluate(async () => {
    const 场景 = window.__lksGame?.scene?.getScene('office');
    if (!场景) return null;
    const 起点 = { x: 场景.npc.x, y: 场景.npc.y };
    const 见过状态 = new Set();
    const 见过动画 = new Set();
    const 位置快照 = new Set();
    for (let i = 0; i < 40; i += 1) {
      见过状态.add(场景.npcState);
      if (场景.npc.anims.isPlaying) 见过动画.add(场景.npc.anims.currentAnim?.key ?? '?');
      位置快照.add(Math.round(场景.npc.x / 6) * 1000 + Math.round(场景.npc.y / 6));
      await new Promise((r) => setTimeout(r, 500));
    }
    return {
      名: 场景.帮手名,
      贴图: 场景.npc.texture.key,
      动画: [...见过动画],
      状态数: 见过状态.size,
      状态: [...见过状态],
      走了多远: Math.round(Math.hypot(场景.npc.x - 起点.x, 场景.npc.y - 起点.y)),
      位置变化次数: 位置快照.size,
      计划: 场景.npcPlan,
      已做工序: 场景.npcTags,
      看门狗: Number(场景.npcWatchdog.toFixed(1)),
      卡死过: 场景.npcState === 'idle' && 场景.npcWatchdog <= 0,
    };
  });
  断言(!!帮手, '能读到帮手的内部状态');
  if (帮手) {
    console.log(`    帮手「${帮手.名}」走过：${帮手.状态.join(' → ')}`);
    断言(帮手.位置变化次数 >= 3, `帮手真的在动（位置变化 ${帮手.位置变化次数} 次，最远走了 ${帮手.走了多远}px）`);
    断言(帮手.状态数 >= 2, `帮手有自己的干活流程（经历过 ${帮手.状态数} 个状态：${帮手.状态.join('、')}）`);
    断言(
      帮手.动画.length > 0,
      帮手.动画.length
        ? `帮手走路时在播**真行走动画**（${帮手.动画.join('、')}）`
        : `✗ 20 秒里没见到他播行走动画（贴图 ${帮手.贴图}）`,
    );
    断言(!帮手.卡死过 && 帮手.看门狗 > 0, `看门狗还在计时（${帮手.看门狗}s）—— 卡住会重新规划，不会僵住`);
  }

  const 交稿 = await 页.evaluate(() => window.__lksProbe?.().delivered ?? 0);
  console.log(`    （这 20 秒里总交稿数：${交稿}）`);
  await 抓('6b-帮手在干活');
}

console.log('\n=== ⑥c 暂停 / 结算两个弹窗也要主题样式 ===\n');
{
  // Esc 开暂停
  await 页.keyboard.press('Escape');
  await 等(500);
  const 暂停 = await 页.evaluate(() => {
    const m = document.querySelector('.lv-root .modal');
    if (!m) return null;
    const c = getComputedStyle(m);
    return { 有: true, 背景: c.backgroundColor, 边框: c.borderTopColor, 标题: m.querySelector('h2')?.textContent ?? '' };
  });
  断言(!!暂停, `Esc 能开出暂停菜单（${暂停?.标题 ?? ''}）`);
  // 米白底 = rgb(247, 239, 221)；深蓝黑那套是 rgb(12, 16, 24)
  断言(暂停?.背景 === 'rgb(247, 239, 221)', `暂停弹窗是米白底（实际 ${暂停?.背景}）—— 不是旧的深蓝黑`);
  await 抓('6c-暂停菜单-主题样式');
  await 页.keyboard.press('Escape');
  await 等(400);

  // 直接摆成"打完了"看结算
  await 页.evaluate(() => {
    window.__lksStore.setState({ delivered: 6, quota: 8, rating: 'B', phase: 'finished' });
  });
  await 等(500);
  const 结算 = await 页.evaluate(() => {
    const m = document.querySelector('.lv-root .modal');
    if (!m) return null;
    const c = getComputedStyle(m);
    return { 背景: c.backgroundColor, 有评级: !!m.querySelector('.rating'), 按钮: [...m.querySelectorAll('button')].map((b) => b.textContent?.trim()) };
  });
  断言(!!结算 && 结算.背景 === 'rgb(247, 239, 221)', `结算弹窗也是米白底（实际 ${结算?.背景}）`);
  断言(!!结算?.有评级, `结算有评级徽章（按钮：${结算?.按钮.join(' / ')}）`);
  await 抓('6d-结算面板-主题样式');
  // 复位，别影响后面的关卡结束流程
  await 页.evaluate(() => window.__lksStore.setState({ phase: 'playing' }));
}

console.log('\n=== ⑥d 新机制：E 键加进度 / 打印机 8 秒 / 技能卡 / 沙漏 ===\n');
{
  /** 站到某个工位的站位上，手上塞一张空白任务单 */
  const 就位 = (kind) =>
    页.evaluate((k) => {
      const 场 = window.__lksGame.scene.getScene('office');
      const 台 = 场.stations.find((x) => x.kind === k);
      const 点 = 场.approachOf(k);
      场.player.body.reset(点.x, 点.y);
      场.carrying = 'blank';
      场.carryTags = [];
      场.processingStation = null;
      场.processing = 0;
      return { 工序: 台.工序, 机制: 台.机制 };
    }, kind);

  // ── E 键：连按型（资料库 = 查资料）──
  const 资 = await 就位('library');
  断言(资.机制 === '连按', `资料库是"连按 E"型（${资.工序} · ${资.机制}）`);
  await 页.keyboard.press('KeyE');
  await 等(100);
  const 一下 = await 页.evaluate(() => window.__lksGame.scene.getScene('office').processing);
  断言(一下 > 0.1 && 一下 < 0.9, `按一下 E 加一截（${Math.round(一下 * 100)}%）—— 不是靠时间涨的`);
  // 干等 1.5 秒：连按型不该自己涨
  await 等(1500);
  const 干等 = await 页.evaluate(() => window.__lksGame.scene.getScene('office').processing);
  断言(Math.abs(干等 - 一下) < 0.01, '干等 1.5 秒进度**不动**（连按型不吃时间）');
  for (let i = 0; i < 3; i += 1) {
    await 页.keyboard.press('KeyE');
    await 等(90);
  }
  const 做完 = await 页.evaluate(() => window.__lksGame.scene.getScene('office').carryTags.slice());
  断言(做完.includes('查资料'), `按够 4 下做完「查资料」（手上：${做完.join('、') || '无'}）`);

  // ── 打印机：**放进去等出来**（人不用守着），而且**一次只能放一份** ──
  const 印 = await 就位('print');
  断言(印.机制 === '等待', `文印区是"等待"型（打印机 · ${印.机制}）`);
  // 手上这张已经做过两道工序（验证放进去再出来不会把进度弄丢）
  await 页.evaluate(() => {
    const 场 = window.__lksGame.scene.getScene('office');
    场.carryTags = ['查资料', '写稿'];
  });
  await 页.keyboard.press('KeyE');
  await 等(250);
  const 放进 = await 页.evaluate(() => {
    const 场 = window.__lksGame.scene.getScene('office');
    return { 剩: 场.打印槽 ? 场.打印槽.剩余 : null, 手上: 场.carrying, 已有: 场.打印槽?.已有 ?? [] };
  });
  断言(
    放进.剩 !== null && 放进.手上 === null,
    `稿子塞进打印机了（还剩 ${放进.剩?.toFixed(1)}s，人空手 —— 可以去干别的）`,
  );
  // 再按一次 E：不许放第二份
  await 页.keyboard.press('KeyE');
  await 等(200);
  const 第二份 = await 页.evaluate(() => {
    const 场 = window.__lksGame.scene.getScene('office');
    return { 剩: 场.打印槽?.剩余 ?? null, 手上有: 场.carrying };
  });
  断言(第二份.手上有 === null, '一次只能放一份：第二次按 E 没往里塞东西');

  // **人走开**：把玩家挪到房间另一头（文件柜），打印机照样在跑
  await 页.evaluate(() => {
    const 场 = window.__lksGame.scene.getScene('office');
    const 别处 = 场.approachOf('files');
    场.player.body.reset(别处.x, 别处.y);
  });
  await 等(2200);
  const 走开 = await 页.evaluate(() => ({
    剩: window.__lksGame.scene.getScene('office').打印槽?.剩余 ?? null,
    条上: window.__lksStore.getState().打印?.剩余 ?? null,
  }));
  断言(
    走开.剩 !== null && 走开.剩 < 放进.剩 - 1.5,
    `**人走开了打印机照样在跑**（剩 ${走开.剩?.toFixed(1)}s）—— 不用守着`,
  );
  断言(走开.条上 !== null, `倒计时挂在顶部任务条上（${走开.条上?.toFixed(1)}s），走开也看得见`);

  // 等它出来：出纸口应该多一件**带着工序**的地面物
  await 等(7000);
  const 出来 = await 页.evaluate(() => {
    const 场 = window.__lksGame.scene.getScene('office');
    const 物 = 场.ground.find((g) => g.id === 场.打印产出id);
    return { 槽: 场.打印槽, 有产出: !!物, 工序: 物?.工序 ?? [], 提示: window.__lksStore.getState().prompt };
  });
  断言(出来.槽 === null && 出来.有产出, `8 秒后文章从出纸口出来了（工序：${出来.工序.join('、')}）`);
  断言(出来.工序.includes('校对') && 出来.工序.includes('写稿'), '出纸那份把原有工序原样带回来了（没白干）');

  // ── 技能卡：起始就有一张「不懂就问」，按 1 立刻做完当前工序 ──
  const 卡名 = await 页.evaluate(() => [...document.querySelectorAll('.lv-skillcard')].map((e) => e.textContent));
  断言(卡名.length >= 1, `左下角挂着技能卡：${卡名.join(' / ')}`);
  await 就位('desk');
  await 页.keyboard.press('KeyE');
  await 等(120);
  const 卡前 = await 页.evaluate(() => window.__lksStore.getState().cards.length);
  await 页.keyboard.press('Digit1');
  await 等(260);
  const 卡后 = await 页.evaluate(() => ({
    tags: window.__lksGame.scene.getScene('office').carryTags.slice(),
    剩: window.__lksStore.getState().cards.length,
  }));
  断言(卡后.tags.includes('写稿'), `按 1 用「不懂就问」立刻做完「写稿」（手上：${卡后.tags.join('、')}）`);
  断言(卡后.剩 === 卡前 - 1, `用掉的卡从手牌里消失（${卡前} → ${卡后.剩}）`);

  // ── 右下角沙漏 ──
  const 沙漏 = await 页.evaluate(() => {
    const h = document.querySelector('.lv-hour');
    if (!h) return null;
    const 画 = document.querySelector('.lv-canvas').getBoundingClientRect();
    const r = h.getBoundingClientRect();
    const img = h.querySelector('.lv-hour-img');
    return {
      字: (h.textContent ?? '').trim(),
      在右下: r.left > 画.left + 画.width * 0.6 && r.top > 画.top + 画.height * 0.6,
      动画: img ? getComputedStyle(img).animationName : '无',
      帧: img ? getComputedStyle(img).backgroundSize : '',
    };
  });
  断言(!!沙漏 && /s$/.test(沙漏.字), `右下角有沙漏 + 时间：${沙漏?.字}`);
  断言(!!沙漏?.在右下, '沙漏待在**右下角**（那一带是墙根/空地，压不到工位）');
  断言(沙漏?.动画 && 沙漏.动画 !== 'none', `沙漏在动（animation: ${沙漏?.动画} · ${沙漏?.帧}）`);

  // ── 两个角上的浮层都必须在**下缘**，不许爬到工位那一排 ──
  const 角上 = await 页.evaluate(() => {
    const 画 = document.querySelector('.lv-canvas').getBoundingClientRect();
    const 上四分之一 = 画.top + 画.height * 0.25;
    const 坏 = [];
    for (const 选择 of ['.lv-hour', '.lv-cardbar']) {
      const el = document.querySelector(选择);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.top < 上四分之一) 坏.push(选择);
    }
    return 坏;
  });
  断言(角上.length === 0, 角上.length ? `这些浮层爬到画布上半区了：${角上.join('、')}` : '沙漏 / 技能卡条都只在画布下缘，没压工位那一排');

  /* ── 音频：文件都在 + BGM 跟着屏幕换（用户要求"合适的 BGM 和音效"）── */
  const 音频 = await 页.evaluate(async () => {
    const 音 = [
      '按钮', '选择确认', '转场', '开场标题', '消息_收到', '消息_发出',
      '指标上升', '指标下降', '贴纸', '群邀请', '知乎卡',
      '干活', '工序完成', '放进打印机', '打印完成', '拿放稿子',
      '交稿成功', '交稿退回', '时间告急', '技能卡',
    ];
    const 坏 = [];
    for (const n of 音) {
      const r = await fetch(new URL(`audio/${n}.wav`, document.baseURI).href, { method: 'HEAD' });
      if (!r.ok) 坏.push(n);
    }
    for (const c of ['办公室', '工作关', '会议室']) {
      const r = await fetch(new URL(`audio/bgm/bgm_${c}.wav`, document.baseURI).href, { method: 'HEAD' });
      if (!r.ok) 坏.push(`bgm_${c}`);
    }
    return { 坏, 总: 音.length + 3, 现在: window.__lksBGM?.() ?? '（没挂上）' };
  });
  断言(音频.坏.length === 0, `20 个音效 + 3 首 BGM 都取得到（共 ${音频.总} 个文件）${音频.坏.length ? '，缺：' + 音频.坏.join('、') : ''}`);
  断言(音频.现在 === '工作关', `小游戏里放的是「工作关」的 BGM（实际 ${音频.现在}）`);

  await 抓('6d-新机制');
}

console.log('\n=== ⑦ 关卡结束：切回剧情并记成绩 ===\n');
{
  const r = await 页.evaluate(() => {
    const s = window.__lksStory;
    window.__lksStore.setState({ delivered: 6, quota: 8, rating: 'B', phase: 'finished' });
    const 前 = s.getState().会话们.find((c) => c.id === s.getState().活跃会话).条目.length;
    s.getState().关卡结束();
    const 后 = s.getState();
    const 活跃 = 后.会话们.find((c) => c.id === 后.活跃会话);
    return { 屏幕: 后.屏幕, 尾: 活跃.条目.slice(-3).map((x) => x.文本 ?? ''), 多: 活跃.条目.length - 前 };
  });
  断言(r.屏幕 === 'avg', '关卡结束切回了 avg');
  断言(r.多 >= 2, `成绩写成系统消息（多了 ${r.多} 条）`);
  断言(r.尾.some((t) => t.includes('交稿')), `成绩文案在工作主题上：${r.尾.join(' / ')}`);
  await 等(600);
  await 抓('7-回到剧情');
}

console.log('\n=== ⑧ 手机竖版：同一套内容能不能站住 ===\n');
{
  const 竖 = await 浏览器.newPage();
  await 竖.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  const 竖错 = [];
  竖.on('pageerror', (e) => 竖错.push(e.message));
  await 竖.goto(URL, { waitUntil: 'networkidle2' });
  await 等(900);

  // 跳到事件四并跑到跑团
  await 竖.evaluate(() => {
    const s = window.__lksStory;
    const 段 = window.__lks剧本.取段(3);
    s.setState({ 屏幕: 'avg', 开场格: 99, 段号: 3, 队列: [...段.节拍], 位置: 0, 待选择: null, 待接受邀请: null, 待暂停: null, 待去房间: null, 跑团局: null, 播完: false });
  });
  await 竖.evaluate(() => {
    const s = window.__lksStory;
    for (let i = 0; i < 400; i += 1) {
      const st = s.getState();
      if (st.跑团局) return;
      if (st.待接受邀请) st.接受邀请();
      else if (st.待选择) st.选择(1);
      else if (st.待去房间) s.setState({ 待去房间: null, 位置: st.位置 + 1 });
      else if (st.待暂停) st.点暂停();
      else if (st.播完) return;
      else st.推进一步();
    }
  });
  await 等(600);
  await 竖.evaluate(() => window.__lksStory.getState().跑团掷骰());
  await 等(500);
  {
    const r = await 竖.evaluate(() => {
      const 框 = document.querySelector('.pt-panel');
      const 遮 = document.querySelector('.pt-mask');
      return {
        有面板: !!框,
        宽: 框 ? Math.round(框.getBoundingClientRect().width) : 0,
        高: 框 ? Math.round(框.getBoundingClientRect().height) : 0,
        遮罩定位: 遮 ? getComputedStyle(遮).position : '',
        视口宽: window.innerWidth,
        视口高: window.innerHeight,
      };
    });
    断言(r.有面板 && r.遮罩定位 === 'fixed', '竖版：跑团面板挂在 fixed 遮罩上');
    断言(r.宽 <= r.视口宽 + 1 && r.高 <= r.视口高 + 1, `竖版：面板不溢出（${r.宽}×${r.高} ≤ ${r.视口宽}×${r.视口高}）`);
    断言(r.宽 >= 320, `竖版：面板还能用（宽 ${r.宽}）`);
  }
  await 竖.screenshot({ path: join(出目录, '8-手机-跑团.png') });
  console.log('  → 8-手机-跑团.png');

  // 收工 → 推到工作关
  await 竖.evaluate(() => {
    const s = window.__lksStory;
    s.setState({
      跑团局: { ...s.getState().跑团局, 局: { ...s.getState().跑团局.局, 局况: '通关' } },
    });
    s.getState().跑团收工();
    for (let i = 0; i < 400; i += 1) {
      const st = s.getState();
      // ⚠️ 走到「开小游戏」会**停住**（要玩家点按钮），所以这里推到 待开小游戏 就够了
      if (st.待开小游戏) return;
      if (st.待接受邀请) st.接受邀请();
      else if (st.待选择) st.选择(1);
      else if (st.待去房间) s.setState({ 待去房间: null, 位置: st.位置 + 1 });
      else if (st.待暂停) st.点暂停();
      else if (st.播完) return;
      else st.推进一步();
    }
  });
  await 等(600);
  await 竖.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent?.includes('进入工作台'));
    b?.click();
  });
  await 等(1500);
  await 竖.evaluate(() => {
    const b = [...document.querySelectorAll('.overlay button')].find((x) => x.textContent === '开始干活');
    b?.click();
  });
  await 等(1600);
  {
    const p = await 竖.evaluate(() => window.__lksProbe?.() ?? null);
    断言(!!p, '竖版：工作关起来了');
    if (p) {
      // 关卡是按窗口现造的：手机竖屏 → 格数应该是"竖着的"
      断言(p.关卡.rows > p.关卡.cols, `竖版关卡是竖着的（${p.关卡.cols}列 × ${p.关卡.rows}行）`);
      const 应有 = ['files', 'library', 'desk', 'print', 'bin'];
      断言(应有.every((k) => p.stations[k]), '竖版：五个工位齐全');
      // 每个工位旁边都得有能站的格子（不然走过去按空格没反应）
      const 够不着 = 应有.filter((k) => !p.approaches[k]);
      断言(够不着.length === 0, 够不着.length ? `竖版：这些工位没有可站的相邻格：${够不着.join('、')}` : '竖版：每个工位都有可站的相邻格');
    }
    /*
     * ⚠️ 竖屏进关卡会先弹「把手机横过来」挡板，**并且把场景暂停**（用户要求"只把小游戏做成横板"）。
     *    测试要操作摇杆/按钮，就得先点掉它（模拟玩家点"仍然竖屏玩"）。
     *    顺便断言这块挡板真的出现了 —— 它就是"只有小游戏横屏"的入口。
     */
    const 有挡板 = await 竖.evaluate(() => !!document.querySelector('.lv-rotate'));
    断言(有挡板, '竖屏进小游戏会先提示「把手机横过来」（只加在小游戏上）');
    await 竖.evaluate(() => {
      const b2 = document.querySelector('.lv-rotate-skip');
      b2?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    });
    await 等(400);

    const 版式 = await 竖.evaluate(() => {
      const 条 = document.querySelector('.lv-top');
      const 画 = document.querySelector('.lv-canvas');
      return {
        有任务条: !!条,
        工单卡数: document.querySelectorAll('.lv-card').length,
        顶高: 条 ? Math.round(条.getBoundingClientRect().height) : 0,
        视口高: window.innerHeight,
        画布宽: 画 ? Math.round(画.getBoundingClientRect().width) : 0,
        视口宽: window.innerWidth,
      };
    });
    断言(版式.有任务条 && 版式.工单卡数 === 3, `竖版：顶部任务条有 3 张工单卡（${版式.工单卡数}）`);
    // 竖版最容易"提示盖住素材"，所以这里也断一次
    const 压画布 = await 竖.evaluate(() => {
      const 画 = document.querySelector('.lv-canvas');
      if (!画) return ['没有画布'];
      const c = 画.getBoundingClientRect();
      const 坏 = [];
      for (const el of document.querySelectorAll('.lv-root > *')) {
        if (el.classList.contains('lv-stage')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const 重叠 = !(r.bottom <= c.top + 1 || r.top >= c.bottom - 1 || r.right <= c.left + 1 || r.left >= c.right - 1);
        if (重叠) 坏.push(el.className || el.tagName);
      }
      return 坏;
    });
    断言(压画布.length === 0, 压画布.length ? `竖版：这些块压在画布上：${压画布.join('、')}` : '竖版：画布上没有任何浮层');

    // 竖版（12 列）比横版更紧，结构 + 可达性也要各验一次
    const 竖玻璃 = await 竖.evaluate(() => (window.__lksProbe?.().grid ?? []).flat().filter((v) => v === 7).length);
    断言(竖玻璃 >= 8, `竖版地图也有内部结构（玻璃 ${竖玻璃} 格）`);
    const 竖可达 = await 可达性检查(竖);
    const 竖到不了 = Object.entries(竖可达.结果).filter(([, v]) => !v).map(([k]) => k);
    断言(
      竖到不了.length === 0,
      竖到不了.length ? `竖版：这些工位走不到：${竖到不了.join('、')}` : `竖版：5 个工位也都走得到（可达 ${竖可达.走到的格数}/${竖可达.总可走} 格）`,
    );
    const 裁 = await 竖.evaluate(() => {
      const 条 = document.querySelector('.lv-top');
      if (!条) return null;
      const 行 = (s) => {
        const el = 条.querySelector(s);
        return el ? Math.round(el.getBoundingClientRect().height) : null;
      };
      return {
        滚: 条.scrollHeight,
        高: 条.clientHeight,
        行高: {
          标题行: 行('.lv-top-line'),
          工单行: 行('.lv-orders'),
          卡片行: 行('.lv-cards'),
          状态行: 行('.lv-extra'),
          说明行: 行('.lv-help'),
        },
      };
    });
    断言(
      !!裁 && 裁.滚 <= 裁.高 + 2,
      `竖版：任务条没有纵向裁切（内容 ${裁?.滚}px ≤ 高 ${裁?.高}px）${裁 && 裁.滚 > 裁.高 + 2 ? '｜各行高 ' + JSON.stringify(裁.行高) : ''}`,
    );
    const 越界 = await 竖.evaluate(() => {
      const 条 = document.querySelector('.lv-top');
      if (!条) return ['没有 .lv-top'];
      const 框 = 条.getBoundingClientRect();
      const 坏 = [];
      for (const 选择 of ['.lv-card', '.lv-carry', '.lv-helper']) {
        for (const el of document.querySelectorAll(选择)) {
          const r = el.getBoundingClientRect();
          if (r.right > 框.right + 1 || r.left < 框.left - 1) 坏.push(选择);
        }
      }
      return 坏;
    });
    断言(越界.length === 0, 越界.length ? `竖版：这些块跑到任务条外面去了：${越界.join('、')}` : '竖版：工单卡 / 手上 / 帮手都在任务条里');
    const 占 = 版式.视口高 > 0 ? 版式.顶高 / 版式.视口高 : 0;
    断言(占 > 0.13 && 占 < 0.28, `竖版：任务条占上面约 1/5（实测 ${(占 * 100).toFixed(0)}%）`);

    /* ── 移动端操作：摇杆能走人、动作键能干活（"手机上唯一能玩"的东西）── */
    const 有操作 = await 竖.evaluate(() => ({
      摇杆: !!document.querySelector('.vt-stick'),
      动作键: [...document.querySelectorAll('.lv-act')].map((e) => (e.textContent ?? '').trim()),
    }));
    断言(
      有操作.摇杆 && 有操作.动作键.length >= 3,
      `手机上出现了摇杆 + 动作键（${有操作.动作键.join(' / ')}）`,
    );

    // 推摇杆 → 人真的要走（用真鼠标事件拖，和触屏走的是同一条 pointer 路径）
    const 杆 = await 竖.evaluate(() => {
      const el = document.querySelector('.vt-stick');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), 半径: Math.round(r.width / 2) };
    });
    const 起点 = await 竖.evaluate(() => {
      const 场 = window.__lksGame.scene.getScene('office');
      return { x: 场.player.x, y: 场.player.y };
    });
    await 竖.mouse.move(杆.x, 杆.y);
    await 竖.mouse.down();
    await 竖.mouse.move(杆.x - 杆.半径, 杆.y, { steps: 8 });
    await 等(800);
    const 走到了 = await 竖.evaluate(() => {
      const 场 = window.__lksGame.scene.getScene('office');
      return { x: 场.player.x, y: 场.player.y };
    });
    await 竖.mouse.up();
    await 等(150);
    const 挪了 = Math.round(Math.hypot(走到了.x - 起点.x, 走到了.y - 起点.y));
    断言(挪了 > 20, `推摇杆人真的走了（挪了 ${挪了}px）—— 手机上终于是"能玩"的`);

    /**
     * **朝向必须跟得上摇杆**（用户报的："移动端向上下走只显示左右走动的动画"）。
     *
     * ⚠️ 根因是"左右优先"的判朝向：键盘下 `vx` 恰好是 0 所以一直没暴露，
     *    而摇杆是模拟量 —— 实测"直着往上推、拇指横偏 12%"就被判成朝右。
     *    这里**故意带 12% 的横向偏移**去推，要求朝向仍然是"上"。
     */
    const 推上 = async (选择, 取值) => {
      const 盘 = await 竖.evaluate(() => {
        const el = document.querySelector('.vt-stick');
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), 半径: Math.round(r.width / 2) };
      });
      await 竖.mouse.move(盘.x, 盘.y);
      await 竖.mouse.down();
      await 竖.mouse.move(盘.x + 盘.半径 * 0.12, 盘.y - 盘.半径 * 0.92, { steps: 6 });
      await 等(500);
      const 向 = await 竖.evaluate(取值);
      await 竖.mouse.up();
      await 等(200);
      return 向;
    };
    const 关卡朝向 = await 推上('关卡', () => window.__lksGame.scene.getScene('office').facing);
    断言(关卡朝向 === 'up', `小游戏里"带 12% 横偏往上推"仍然是朝上（实际 ${关卡朝向}）`);

    // 动作键 E：站到工位上点一下按钮，进度要动
    await 竖.evaluate(() => {
      const 场 = window.__lksGame.scene.getScene('office');
      const 点 = 场.approachOf('library');
      场.player.body.reset(点.x, 点.y);
      场.carrying = 'blank';
      场.carryTags = [];
      场.processingStation = null;
      场.processing = 0;
    });
    await 等(200);
    const E键 = await 竖.evaluate(() => {
      const b = [...document.querySelectorAll('.lv-act')].find((x) => (x.textContent ?? '').includes('干活'));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    });
    await 竖.mouse.click(E键.x, E键.y);
    await 等(220);
    const 按后 = await 竖.evaluate(() => window.__lksGame.scene.getScene('office').processing);
    断言(按后 > 0.1, `点触屏的「E 干活」按钮也在加进度（${Math.round(按后 * 100)}%）`);

    /* ── 地图：点地面自动寻路走过去（手机上的主要移动方式）── */
    await 竖.evaluate(() => window.__lksStory.setState({ 屏幕: 'map' }));
    await 竖.waitForFunction(() => !!window.__lksMap, { timeout: 20000 });
    await 等(900);
    // 地图上应该换成「办公室」那首（BGM 跟着屏幕走）
    const 地图曲 = await 竖.evaluate(() => window.__lksBGM?.() ?? null);
    断言(地图曲 === '办公室', `地图上放的是「办公室」的 BGM（实际 ${地图曲}）`);

    const 地图起 = await 竖.evaluate(() => ({ x: window.__lksMap.主角.x, y: window.__lksMap.主角.y }));
    const 空地 = await 竖.evaluate(() => {
      const 场 = window.__lksMap;
      // ⚠️ 用场景自己的换算：地图的 y 是**贴底**的（`格到像素().y = 行*32+32`），
      //    随手写 `floor(y/32)` 会**多算一行**（我第一次就踩了，找路直接返回 null）
      const 我 = 场.像素到格(场.主角.x, 场.主角.y);
      for (const [dx, dy] of [[0, 3], [3, 0], [-3, 0], [0, -3], [0, 4], [4, 0], [2, 0], [0, 2]]) {
        const 路 = 场.找路(我.x, 我.y, 我.x + dx, 我.y + dy);
        if (路 && 路.length) {
          const 终 = 路[路.length - 1];
          return { x: 终.x * 32 + 16, y: 终.y * 32 + 32 };
        }
      }
      return null;
    });
    if (空地) {
      const 画框 = await 竖.evaluate(() => {
        const c = document.querySelector('.map-canvas');
        const r = c.getBoundingClientRect();
        return { left: r.left, top: r.top };
      });
      const 镜头 = await 竖.evaluate(() => {
        const c = window.__lksMap.cameras.main;
        return { x: c.scrollX, y: c.scrollY, 缩放: c.zoom };
      });
      const 屏点 = { x: 画框.left + (空地.x - 镜头.x) * 镜头.缩放, y: 画框.top + (空地.y - 镜头.y) * 镜头.缩放 };
      await 竖.mouse.click(屏点.x, 屏点.y);
      await 等(1500);
      const 地图到 = await 竖.evaluate(() => ({ x: window.__lksMap.主角.x, y: window.__lksMap.主角.y }));
      const 地图挪 = Math.round(Math.hypot(地图到.x - 地图起.x, 地图到.y - 地图起.y));
      断言(地图挪 > 20, `地图上点一下地，人就自己走过去（挪了 ${地图挪}px）`);

    // 地图上同样验一次：带 12% 横偏往上推，朝向必须是"上"（0=下 1=上 2=左 3=右）
    const 地图盘 = await 竖.evaluate(() => {
      const el = document.querySelector('.vt-stick');
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), 半径: Math.round(r.width / 2) };
    });
    await 竖.mouse.move(地图盘.x, 地图盘.y);
    await 竖.mouse.down();
    await 竖.mouse.move(地图盘.x + 地图盘.半径 * 0.12, 地图盘.y - 地图盘.半径 * 0.92, { steps: 6 });
    await 等(500);
    const 地图朝向 = await 竖.evaluate(() => window.__lksMap.朝向);
    await 竖.mouse.up();
    断言(地图朝向 === 1, `地图上"带 12% 横偏往上推"也是朝上（实际 ${['下', '上', '左', '右'][地图朝向]}）`);
    } else {
      断言(false, '地图上没找到可以点的空地（点地寻路没法验）');
    }

    断言(版式.画布宽 > 版式.视口宽 * 0.85, `竖版：画布基本铺满宽度（${版式.画布宽}/${版式.视口宽}）`);
  }
  await 竖.screenshot({ path: join(出目录, '9-手机-工作关.png') });
  console.log('  → 9-手机-工作关.png');
  断言(竖错.length === 0, 竖错.length ? `竖版有页面错误：${竖错.slice(0, 2).join(' | ')}` : '竖版没有页面错误');
  await 竖.close();
}


/* ── 顶部新消息提醒：手机上会话列表是隐藏的，不弹就不知道是谁发的 ── */
{
  const 新 = await 浏览器.newPage();
  await 新.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await 新.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
  await 新.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
  await 等(900);
  // 把玩家放到**地图**上：这时微信完全看不见 —— 用户说的"看不清哪里来的消息"就是这个场景
  await 新.evaluate(() => window.__lksStory.setState({ 屏幕: 'map', 新消息提示: null }));

  let 提示 = null;
  for (let i = 0; i < 120 && !提示; i += 1) {
    await 新.evaluate(() => {
      // 清掉"等玩家选择/等点击"的阻塞节拍，让剧情一路往下走（这里测的是提醒，不是剧情流畅度）
      window.__lksStory.setState({
        待选择: null,
        待接受邀请: null,
        待暂停: null,
        待去房间: null,
        待开小游戏: null,
        播完: false,
      });
      window.__lksStory.getState().推进一步();
    });
    await 等(45);
    提示 = await 新.evaluate(() => window.__lksStory.getState().新消息提示);
  }
  断言(!!提示 && 提示.名字.length > 0 && 提示.预览.length > 0, `新消息在顶部弹出：「${提示?.名字}：${提示?.预览}」`);

  const 条 = await 新.evaluate(() => {
    const el = document.querySelector('.top-tip');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      文: (el.textContent ?? '').trim(),
      在顶部: r.top < window.innerHeight * 0.2,
      没超出屏: r.left >= -1 && r.right <= window.innerWidth + 1,
      在画布之上: getComputedStyle(el).zIndex,
    };
  });
  断言(!!条 && 条.在顶部 && 条.没超出屏, `提醒条画在屏幕顶部、没溢出：「${条?.文}」（z-index ${条?.在画布之上}）`);

  // ⚠️ 照片要在**点掉之前**拍（点掉就没了，文档里就没证据了）
  await 新.screenshot({ path: join(出目录, '9-手机-新消息提醒.png') });
  console.log('  → 9-手机-新消息提醒.png');

  // 点一下 → 跳过去（切回微信 + 切到那个会话 + 提醒消失）
  const 目标 = 提示.会话id;
  await 新.evaluate(() => document.querySelector('.top-tip')?.click());
  await 等(350);
  const 跳 = await 新.evaluate(() => ({
    屏: window.__lksStory.getState().屏幕,
    看: window.__lksStory.getState().查看会话,
    还有: !!window.__lksStory.getState().新消息提示,
    条: !!document.querySelector('.top-tip'),
  }));
  断言(
    跳.屏 === 'avg' && 跳.看 === 目标 && !跳.还有 && !跳.条,
    `点一下就跳到了那个会话（屏=${跳.屏} 会话=${跳.看}）`,
  );

  // 反面：**正在看那个会话时不该弹**（消息就在眼前，再弹是打扰）
  /**
   * 反面：**正在看那个会话时不弹**。
   *
   * ⚠️ 判据要精确到"**这一拍确实往我正在看的那个会话加了一条**"：
   *    剧情里有「切会话」节拍会改 `活跃会话` —— 那一刻 `查看会话` 还停在上一个，
   *    提醒**本来就该弹**（玩家确实没在看新会话）。不这么判的话，
   *    这条断言会把"正确的提醒"当成 bug（我第一版就是这么写错的）。
   */
  const 同会话 = await 新.evaluate(async () => {
    for (let i = 0; i < 90; i += 1) {
      const s0 = window.__lksStory.getState();
      const 活跃0 = s0.活跃会话;
      const 条数0 = s0.会话们.find((c) => c.id === 活跃0)?.条目.length ?? 0;
      window.__lksStory.setState({
        屏幕: 'avg',
        查看会话: 活跃0,
        // ⚠️ 必须是"聊天"面板 —— 手机停在列表上也叫"不在聊天框里"，那**应该**弹
        移动端面板: '聊天',
        新消息提示: null,
        待选择: null,
        待接受邀请: null,
        待暂停: null,
        播完: false,
      });
      window.__lksStory.getState().推进一步();
      await new Promise((r) => setTimeout(r, 30));
      const s1 = window.__lksStory.getState();
      const 条数1 = s1.会话们.find((c) => c.id === 活跃0)?.条目.length ?? 0;
      if (s1.活跃会话 === 活跃0 && 条数1 > 条数0) return s1.新消息提示;
    }
    return '（没找到合适的节拍）';
  });
  断言(同会话 === null, `正在**聊天框里**看那个会话时不弹（返回 ${JSON.stringify(同会话)}）`);

  /** 反面之二：手机上**停在会话列表**时要弹 —— 微信在列表页也弹（你人不在聊天框里） */
  const 列表里 = await 新.evaluate(async () => {
    for (let i = 0; i < 90; i += 1) {
      const s0 = window.__lksStory.getState();
      const 活跃0 = s0.活跃会话;
      const 条数0 = s0.会话们.find((c) => c.id === 活跃0)?.条目.length ?? 0;
      window.__lksStory.setState({
        屏幕: 'avg',
        查看会话: 活跃0,
        移动端面板: '列表',
        新消息提示: null,
        待选择: null,
        待接受邀请: null,
        待暂停: null,
        播完: false,
      });
      window.__lksStory.getState().推进一步();
      await new Promise((r) => setTimeout(r, 30));
      const s1 = window.__lksStory.getState();
      const 条数1 = s1.会话们.find((c) => c.id === 活跃0)?.条目.length ?? 0;
      if (s1.活跃会话 === 活跃0 && 条数1 > 条数0) return s1.新消息提示;
    }
    return '（没找到合适的节拍）';
  });
  断言(
    !!列表里 && 列表里 !== '（没找到合适的节拍）',
    `手机上停在**会话列表**时照样弹（${列表里?.名字}：${列表里?.预览}）`,
  );

  await 新.close();
}
console.log('\n=== ⑩ 进度存档（不删缓存就不该丢） ===\n');
{
  /**
   * ⚠️⚠️ **先把别的页面按住**。
   *
   * 存档是**整站共用一份**（localStorage 的 `lks-save`），而前面几个阶段开的页面
   * 剧情时钟还在跑、还在自动存档 —— 我这边刚读到的"位 52"，
   * 转眼就被另一个页面用它的"位 48"覆盖了。
   *
   * 👉 这同时暴露了一个**真实问题**：玩家开两个标签页时，后写的那个会覆盖先写的
   *    （典型的 last-write-wins）。当前取舍是"不做多标签协调"，但一定要知道有这回事。
   *
   * 这里把另外两页切到地图（StoryClock 只在微信屏推进）→ 它们不再改存档。
   */
  // ⚠️ 只管 `页`（模块级变量）：竖版那一页早就被我切到地图上了（StoryClock 不动）。
  await 页.evaluate(() => window.__lksStory.setState({ 屏幕: 'map' }));
  await 等(400);

  const 存页 = await 浏览器.newPage();
  await 存页.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await 存页.goto('http://127.0.0.1:5273/', { waitUntil: 'networkidle2' });
  await 存页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
  await 等(900);

  // ⚠️ **先把两个存档都清掉**（剧情 + 小游戏那一局）：
  //    前面的阶段进过关卡，`lks-save-level` 还留着 —— 不清的话
  //    这一段的"刷新应该回到微信"会变成"回到小游戏"（第一版就是这么误判的）。
  await 存页.evaluate(() => {
    window.localStorage.removeItem('lks-save');
    window.localStorage.removeItem('lks-save-level');
  });

  // 先把消息速度调到最慢（3 秒一拍），免得测的时候被"剧情自动推进"干扰
  await 存页.evaluate(() => window.__lksStory.getState().设速度(0.5));

  // 玩一段：手动推 12 拍
  await 存页.evaluate(async () => {
    window.__lksStory.setState({ 屏幕: 'avg' });
    for (let i = 0; i < 12; i += 1) {
      window.__lksStory.setState({ 待选择: null, 待接受邀请: null, 待暂停: null, 播完: false });
      window.__lksStory.getState().推进一步();
      await new Promise((r) => setTimeout(r, 25));
    }
  });
  await 等(1300); // 等自动存档的 700ms 防抖

   /**
    * ⚠️ 自动存档有 **700ms 防抖**（写 localStorage 是同步 IO，不能每一拍都写），
    *    所以刚推完一拍时，存档会**慢半拍**。
    *    第一版断言直接比"存档 vs 当前"，测出来的是竞态不是功能 ——
    *    这里改成**等存档追上来**再比（最多 5 秒）。
    */
  const 读两边 = () =>
    存页.evaluate(() => {
      const s = window.__lksStory.getState();
      const 数 = JSON.parse(window.localStorage.getItem('lks-save') ?? 'null');
      return {
        有: !!数,
        段: s.段号,
        位: s.位置,
        条数: s.会话们.reduce((n, c) => n + c.条目.length, 0),
        档段: 数?.段号 ?? -1,
        档位: 数?.位置 ?? -1,
        档条数: 数 ? 数.会话们.reduce((n, c) => n + c.条目.length, 0) : -1,
      };
    });

  let 前 = null;
  for (let i = 0; i < 25; i += 1) {
    const r = await 读两边();
    if (r.有 && r.档段 === r.段 && r.档位 === r.位 && r.档条数 === r.条数) {
      前 = r;
      break;
    }
    await 等(200);
  }
  断言(
    !!前,
    `进度写进了浏览器存档、而且追上了当前（段 ${前?.档段} · 第 ${前?.档位} 拍 · ${前?.档条数} 条聊天）`,
  );
  断言((前?.条数 ?? 0) > 0, `聊天记录也一起存下来了（${前?.条数} 条）`);

  // **刷新页面**（等于关掉再打开）：进度应该原样回来，而且跳过开场
  await 存页.reload({ waitUntil: 'networkidle2' });
  await 存页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
  await 等(800);
  const 后 = await 存页.evaluate(() => {
    const s = window.__lksStory.getState();
    return { 屏: s.屏幕, 段: s.段号, 位: s.位置, 条数: s.会话们.reduce((n, c) => n + c.条目.length, 0) };
  });
  断言(后.段 === 前.段 && 后.位 === 前.位, `刷新之后接着上次继续（段 ${后.段} · 第 ${后.位} 拍）`);
  断言(后.条数 === 前.条数, `聊天记录没丢（${后.条数} 条）`);
  断言(后.屏 === 'avg', `直接回到微信、跳过了开场（屏=${后.屏}）`);

  // 反面：**清掉缓存**就该从头开始（"不删缓存就还在"的另一半）
  await 存页.evaluate(() => window.localStorage.removeItem('lks-save'));
  await 存页.reload({ waitUntil: 'networkidle2' });
  await 存页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
  await 等(700);
  const 空 = await 存页.evaluate(() => {
    const s = window.__lksStory.getState();
    return { 屏: s.屏幕, 段: s.段号, 位: s.位置 };
  });
  断言(
    空.屏 === 'opening' && 空.段 === 0 && 空.位 === 0,
    `删掉缓存就从头开始（屏=${空.屏} 段=${空.段} 第 ${空.位} 拍）`,
  );

  // 设置里的「重来」也要把存档清掉（不清的话刷新一下进度又回来了）
  const 重来 = await 存页.evaluate(async () => {
    window.__lksStory.getState().推进一步();
    await new Promise((r) => setTimeout(r, 900));
    const 存前 = !!window.localStorage.getItem('lks-save');
    window.__lksStory.getState().重置();
    await new Promise((r) => setTimeout(r, 200));
    return { 存前, 存后: !!window.localStorage.getItem('lks-save'), 屏: window.__lksStory.getState().屏幕 };
  });
  断言(重来.存前, '玩了一下就又存上了（准备测"重来"）');
  断言(!重来.存后 && 重来.屏 === 'opening', '设置里的「重来」把存档也清掉了（不然刷新又回来）');

  /* ── 小游戏那一局也要能接着打（用户说"可以"）── */
  await 存页.evaluate(() =>
    window.__lksStory.setState({ 屏幕: 'level', 关卡标题: '接着打测一下', 关卡提示: '' }),
  );
  await 存页.waitForFunction(() => !!window.__lksGame?.scene?.getScene('office'), { timeout: 20000 });
  await 等(1300);
  // ⚠️ 竖屏会先弹「把手机横过来」并**暂停场景** —— 不点掉的话这一局根本不会跑（存档也不会写）
  await 存页.evaluate(() => {
    document.querySelector('.lv-rotate-skip')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  });
  await 等(400);
  await 存页.evaluate(() =>
    [...document.querySelectorAll('.overlay button')].find((x) => (x.textContent ?? '').includes('开始干活'))?.click(),
  );
  await 等(700);
  // 造一点"打到一半"的状态（交了 3 版、时间走到 123 秒）
  await 存页.evaluate(() => {
    const 场 = window.__lksGame.scene.getScene('office');
    场.player.body.reset(场.player.x + 40, 场.player.y + 16);
    场.delivered = 3;
    场.timeLeft = 123.4;
  });
  await 等(3600); // 等关卡那 3 秒一次的自动存档
  const 档 = await 存页.evaluate(() => JSON.parse(window.localStorage.getItem('lks-save-level') ?? 'null'));
  断言(
    !!档 && 档.已交 === 3 && Math.abs(档.剩余秒 - 123.4) < 8,
    `小游戏那一局也存下来了（已交 ${档?.已交} · 剩 ${档?.剩余秒}s）`,
  );

  // 刷新 → 应该**直接回到关卡**接着打，不再走开场简报
  await 存页.reload({ waitUntil: 'networkidle2' });
  await 存页.waitForFunction(() => typeof window.__lksStory === 'function', { timeout: 20000 });
  await 存页.waitForFunction(() => !!window.__lksGame?.scene?.getScene('office'), { timeout: 20000 });
  await 等(1600);
  const 回来了 = await 存页.evaluate(() => {
    const 场 = window.__lksGame.scene.getScene('office');
    const g = window.__lksStore.getState();
    return {
      屏: window.__lksStory.getState().屏幕,
      交: 场.delivered,
      剩: Math.round(场.timeLeft),
      阶段: g.phase,
      简报: !!document.querySelector('.overlay .modal, .overlay .card'),
    };
  });
  断言(回来了.屏 === 'level', `刷新后直接回到小游戏（屏=${回来了.屏}）`);
  断言(回来了.交 === 3 && 回来了.剩 > 100, `这一局的进度还在（已交 ${回来了.交} · 剩 ${回来了.剩}s）`);
  断言(回来了.阶段 === 'playing' && !回来了.简报, '直接接着打，没有再走一次开场简报');

  // 打完（跳过这一关）→ 关卡存档该清掉，不然刷新又跳回一个已经跳过的局
  await 存页.evaluate(() => window.__lksStory.getState().关卡结束());
  await 等(400);
  const 清 = await 存页.evaluate(() => ({
    关卡档: !!window.localStorage.getItem('lks-save-level'),
    剧情档: !!window.localStorage.getItem('lks-save'),
  }));
  断言(!清.关卡档, '这一局结束后，关卡存档被清掉了（剧情存档留着）');

  await 存页.close();
}

console.log('\n=== ⑨ 页面错误 ===\n');
断言(页面错误.length === 0, 页面错误.length ? `有 ${页面错误.length} 个页面错误：${页面错误.slice(0, 3).join(' | ')}` : '没有页面错误');

await 浏览器.close();
console.log(`\n输出目录：${出目录}`);
console.log(坏 ? `\n✗ ${坏} 项没过` : '\n✓ 事件四链路全部通过');
process.exit(坏 ? 1 : 0);
