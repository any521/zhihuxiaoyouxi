/**
 * 跑团逻辑自检（零依赖 · 不需要浏览器 · 不需要 dev server）
 *
 * 为什么单测能跑而不用浏览器：`跑团.ts` 是**纯函数**（掷骰可以注入、判定不用网络），
 * `llm.ts` 的 `要叙述` 也接受一个假的 `fetch` —— 所以"AI 挂了会怎样"能在这里百分百复现，
 * 不用去点页面碰运气。
 *
 * 用法（在游戏目录跑）：node tools/跑团自检.mjs
 */

/* ── 怎么把 TS 当 JS 读（踩过一遍，记下来）──
   一、**项目里没有 esbuild**：vite 8 用的是 rolldown，`node_modules/esbuild` 不存在。
   二、**typescript 7 也没有编译 API**：它是原生编译器，`ts.transpileModule` / `ts.ScriptTarget`
      全是 undefined（7.0 起把 JS 实现换掉了，只留 version）。所以别想着调 tsc 的 API。
   三、✅ **Node 22.18+ 能直接跑 .ts**（原生类型剥离，连 `import type` 都支持，实测通过）：
      所以这里 `import('../src/story/跑团.ts')` 就行。
   ⚠️ 唯一要手工处理的：`llm.ts` 里写的是 `from './跑团'`（不带扩展名，给 vite 用的），
      Node 的 ESM 要求带扩展名 —— 所以复制一份到临时目录、把这条 import 补成 `./跑团.ts`
      再加载。**不改源文件**（改了会动到游戏代码）。 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const 临 = mkdtempSync(join(tmpdir(), 'paotuan-'));
const 源 = resolve('src/story');
const 跑团 = await import(pathToFileURL(join(源, '跑团.ts')).href);
const llm源 = readFileSync(join(源, 'llm.ts'), 'utf8').replace(
  /from '\.\/跑团'/g,
  `from '${pathToFileURL(join(源, '跑团.ts')).href}'`,
);
const llm文件 = join(临, 'llm.ts');
writeFileSync(llm文件, llm源, 'utf8');
const llm = await import(pathToFileURL(llm文件).href);

let 坏 = 0;
const 断言 = (条件, 说明) => {
  console.log(`  ${条件 ? '✓' : '✗'} ${说明}`);
  if (!条件) 坏 += 1;
};

/** 固定骰子：按顺序吐点数
 *  ⚠️ 别写成 `[1,1]` 只给一颗：函数是**每次调用吐一颗**，判定里要连着调两次，
 *     只给一颗的话第二次又从头取 —— 大失败那轮会拿成 [1,1] 之外的组合（自检里踩过）。 */
const 定骰 = (序列) => {
  let i = 0;
  return () => 序列[i++ % 序列.length];
};

console.log('=== ① 判定只看骰子和难度（不掺任何 AI 的话）===\n');
const 表 = [
  { 骰: [6, 6], 修正: 0, 难度: 99, 期望: '大成功' },
  { 骰: [1, 1], 修正: 3, 难度: 2, 期望: '大失败' },
  { 骰: [4, 5], 修正: 0, 难度: 9, 期望: '成功' },
  { 骰: [4, 4], 修正: 0, 难度: 9, 期望: '失败' },
  { 骰: [3, 3], 修正: 2, 难度: 9, 期望: '失败' },
];
for (const t of 表) {
  const r = 跑团.判定(t.骰, t.修正, t.难度);
  断言(r.档 === t.期望, `骰 ${t.骰.join('+')} 修正 ${t.修正} vs 难度 ${t.难度} → ${r.档}（期望 ${t.期望}）`);
}

console.log('\n=== ② 修正值随指标增长但封顶 +3 ===\n');
断言(跑团.修正值({ 信任: 0, 协作: 0, 成长: 0 }) === 0, '全 0 → +0');
断言(跑团.修正值({ 信任: 9, 协作: 0, 成长: 0 }) === 1, '总 9 → +1');
断言(跑团.修正值({ 信任: 27, 协作: 0, 成长: 0 }) === 3, '总 27 → +3');
断言(跑团.修正值({ 信任: 99, 协作: 99, 成长: 99 }) === 3, '爆表也只 +3（封顶）');

console.log('\n=== ③ 打一轮：指标只来自脚本，AI 改不了 ===\n');
const 配置 = 跑团.示例跑团;
let 局 = 跑团.开局();
const 一 = 跑团.打一轮(局, 配置, null, 定骰([6, 6]));
断言(一.结果.档 === '大成功', '两颗 6 = 大成功');
断言(一.结果.来源 === '兜底' && 一.结果.叙述 === 配置.回合[0].后果.大成功.叙述, '没给 AI 话时用兜底叙述');
断言(一.结果.指标.成长 === 2, '大成功的成长 +2 来自脚本');
断言(一.新局.线索.length === 1, '大成功带出 1 条线索');
const 二 = 跑团.打一轮(一.新局, 配置, 'AI 瞎写的一句话也改不了分数。', 定骰([1, 1]));
const 这轮 = 跑团.取回合(配置, 一.新局.轮); // ⚠️ 别把数字写死在测试里，从脚本里取
断言(二.结果.档 === '大失败', '两颗 1 = 大失败');
断言(二.结果.来源 === 'AI', '给了 AI 话就标成 AI 来源');
const 该有 = 这轮.后果.大失败;
断言(
  二.结果.指标.成长 === (该有.成长 ?? 0) && 二.结果.指标.信任 === (该有.信任 ?? 0),
  `大失败的指标**仍然来自脚本**（脚本写的是 信任 ${该有.信任 ?? 0} / 成长 ${该有.成长 ?? 0}，` +
    `结果拿到 信任 ${二.结果.指标.信任} / 成长 ${二.结果.指标.成长}）`,
);

console.log('\n=== ④ 通关 / 翻车 / 超时三种收束 ===\n');
// 通关：连续两次成功（示例配置 通关命中 = 3，先手工把命中垫到 2）
const 垫 = { ...跑团.开局(), 命中: 2 };
const 通关 = 跑团.打一轮(垫, 配置, null, 定骰([5, 5, 4, 4]));
断言(通关.新局.局况 === '通关', `命中满了 → 通关（骰 ${通关.结果.骰子.join('+')}）`);
// 翻车：失误垫到 2 再大失败一次（大失败算失误）
const 险些 = { ...跑团.开局(), 失误: 2 };
const 翻车 = 跑团.打一轮(险些, 配置, null, 定骰([1, 1]));
断言(翻车.新局.局况 === '翻车', '失误满了 → 翻车');
// 超时：轮数垫到上限 - 1
const 快完 = { ...跑团.开局(), 轮: 配置.上限 - 1, 命中: 0 };
const 超时 = 跑团.打一轮(快完, 配置, null, 定骰([2, 2]));
断言(超时.新局.局况 === '超时', `${配置.上限} 轮打完还没攒够命中 → 超时`);

console.log('\n=== ⑤ AI 的这句话要过闸（校验不过就退兜底）===\n');
const 允许 = ['刘看山', '林总', '周岚', '阿麦', '韩策', '小鹿', '程女士', '学长'];
const 过 = [
  ['纸抽出来了，背面还有一行客户手写的批注。', true],
  ['你手上沾了一道墨，纸卡得更深了。', true],
  ['', false],
  ['太短', false],
  ['你成功了，老板信任 +2。', false],
  ['知乎上有一篇讲这个的文章，你可以看看。', false],
  ['前台小妹冲你笑了笑。', false],
  ['虽然失败了，但你却意外地成功了。', false],
  ['a'.repeat(30) + ' whatever', false],
];
for (const [文, 期望] of 过) {
  const r = 跑团.校验叙述(文, 允许);
  const 短 = 文.length > 20 ? 文.slice(0, 20) + '…' : 文;
  断言(r.过 === 期望, `「${短 || '(空)'}」 → ${r.过 ? '放行' : `挡下（${r.理由}）`}`);
}

console.log('\n=== ⑥ AI 挂掉 / 超时 / 返回垃圾 → 一律退兜底，不抛错 ===\n');
/**
 * 造一个假 fetch。
 * ⚠️ 它必须**尊重 abort signal**（真 fetch 会）——
 *    第一版没实现，超时那条永远"成功返回"，测了个寂寞（自检自己抓出来的）。
 */
const 假fetch = (回体, 延时 = 0, 状态 = 200) => async (_url, init) => {
  const r = { ok: 状态 === 200, status: 状态, json: async () => 回体 };
  if (!延时) return r;
  await new Promise((resolve, reject) => {
    const t = setTimeout(resolve, 延时);
    const sig = init?.signal;
    if (sig) {
      if (sig.aborted) {
        clearTimeout(t);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        return;
      }
      sig.addEventListener('abort', () => {
        clearTimeout(t);
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      });
    }
  });
  return r;
};
const 好体 = { choices: [{ message: { content: '{"叙述":"纸抽出来了，背面还有一行客户手写的批注。"}' } }] };
const LLM = { 代理: '/api/npc', 模型: 'zhida-fast-1p5', 超时: 120 };
const 回合0 = 配置.回合[0];

断言(
  (await llm.要叙述(LLM, 配置, 回合0, '大成功', 假fetch(好体))) ===
    '纸抽出来了，背面还有一行客户手写的批注。',
  '正常返回 → 取到那句话',
);
断言(
  (await llm.要叙述(LLM, 配置, 回合0, '大成功', 假fetch({ choices: [] }))) === null,
  '返回空 choices → null（退兜底）',
);
断言((await llm.要叙述(LLM, 配置, 回合0, '大成功', 假fetch({}, 0, 500))) === null, 'HTTP 500 → null');
const 超时直 = await llm.要叙述(LLM, 配置, 回合0, '大成功', 假fetch(好体, 400));
断言(超时直 === null, `超时（400ms > 120ms）→ null（实际拿到 ${JSON.stringify(超时直)}）`);
断言(
  (await llm.要叙述(LLM, 配置, 回合0, '大成功', async () => {
    throw new Error('断网');
  })) === null,
  'fetch 抛错 → null',
);
断言(
  (await llm.要叙述(
    LLM,
    配置,
    回合0,
    '大成功',
    假fetch({ choices: [{ message: { content: '老板信任 +2，你成功了。' } }] }),
  )) === null,
  '模型乱说分数 → 校验挡下 → null',
);
断言(
  (await llm.要叙述({ ...LLM, 代理: '', 直连调试: undefined }, 配置, 回合0, '大成功', 假fetch(好体))) === null,
  '没配代理（没开 AI）→ 直接 null，连请求都不发',
);

console.log('\n=== ⑦ 提示词里写死了那几条铁律 ===\n');
const 提示 = 跑团.造提示词(配置, 回合0, '大成功', 允许);
for (const 句 of ['只输出 JSON', '不要写出任何数字', '不要提"知乎"', '不要推进剧情', '不要新增任何人物']) {
  断言(提示.includes(句), `提示词里有「${句}」`);
}

console.log(坏 ? `\n✗ ${坏} 项没过` : '\n✓ 跑团逻辑全部通过（AI 只是外皮，引擎永远自己算）');
process.exit(坏 ? 1 : 0);
