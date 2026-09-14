/**
 * 知乎卡烘焙：把**真实检索结果**写进 liukanshan-career/src/story/zhihu.ts。
 *
 * 为什么是"烘焙"而不是运行时调 API（原设计就定好了，见 zhihu.ts 的注释）：
 *   一、玩家不消耗额度、不用配密钥
 *   二、断网也能玩 —— 老项目铁律：外部服务故障时主线仍可推进
 *   三、内容可审核，不会突然冒出意外内容
 *
 * ── 用法（仓库根目录）──
 *   node 工具/查知乎卡.mjs          # 只查不写，打印候选
 *   node 工具/查知乎卡.mjs --写     # 写进 zhihu.ts
 *
 * ── ⚠️⚠️ 四条实测得来的规矩（每条都踩过） ──
 *  一、**必须走知乎 CLI**，别直接打 HTTP：CLI 已处理好鉴权，而且**默认返回完整 JSON**
 *      （字段精确：VoteUpCount / CommentCount / RankingScore …）。
 *      ⚠️ CLI 直接跑会报 AUTH_REQUIRED —— 密钥是**通过环境变量**给的，
 *         先从密钥文件读进 ZHIHU_ACCESS_SECRET 再跑（下面就是这么做的）。
 *  二、**搜索结果每次调用都不一样**：同一个查询词，两次调用给的赞数和条目可以完全不同。
 *      所以本工具**查完立刻落盘**，不搞"先看看再决定"的两步走 ✔
 *  三、**这个接口没有「观看量」**：全 JSON 里只有 VoteUpCount（点赞）和 CommentCount（评论），
 *      没有任何 view / visit / read 字段 —— 只能按**点赞数**（或平台 RankingScore）排序。
 *      **别在需求里承诺"挑观看量高的"**，做不到。
 *  四、**两个主题很容易查到同一篇**（高赞回答就那几篇）→ 必须**按链接去重**；
 *      而且**只准变好、不准变差**（新的赞数没旧的高就别动）—— 否则跑一次就把好卡换坏。
 *
 * ⚠️ 铁律：**不编造知乎来源**。作者、标题、摘要、链接、点赞数**逐字来自检索结果**。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const 仓库根 = process.cwd().replace(/\\/g, '/') + '/';
const CLI = 'C:\\Users\\15418\\AppData\\Local\\ZhihuCLI\\current\\zhihu-cli.exe';
const 密钥文件 = 'C:\\Users\\15418\\.dsh\\zhihu-access-secret';
const 卡库文件 = 仓库根 + 'liukanshan-career/src/story/zhihu.ts';
const 要写 = process.argv.includes('--写');

/** 主题 → 检索词。主题就是剧本里 取知乎卡('主题') 用的那个字符串。 */
const 要查 = {
  '职场新人 · 自我介绍 第一印象': '新人入职自我介绍 第一印象',
  '职场新人 · 入职第一天该做什么': '入职第一天 应该做什么 新人 准备',
  '模糊任务 · 怎么问清需求': '领导任务模糊 怎么追问 需求不明确',
  '向上沟通 · 确认目标与交付形式': '向上沟通 确认目标 交付形式 职场',
  '职场边界感 · 闲聊与截图': '职场边界感 同事闲聊 分寸',
  '同事关系 · 怎么参与吐槽不越界': '同事吐槽 要不要参与 职场',
  '需求澄清 · 怎么把模糊任务问具体': '需求不明确 怎么问清楚 提问技巧',
  '向上沟通 · 带着方案提问而不是带着问题': '向领导汇报 带着方案 不要只提问题',
};

function 查(词) {
  const 出 = execFileSync(CLI, ['search', 'zhihu', '--query', 词, '--count', '10'], {
    encoding: 'utf8',
    env: { ...process.env, ZHIHU_ACCESS_SECRET: readFileSync(密钥文件, 'utf8').trim() },
    maxBuffer: 32 * 1024 * 1024,
  });
  const o = JSON.parse(出);
  if (o.ok === false) throw new Error('CLI：' + JSON.stringify(o.error));
  return o.Data?.Items ?? [];
}

/** 库里已有的赞数（用来"只准变好"）*/
const 旧库 = {};
{
  const 文 = readFileSync(卡库文件, 'utf8');
  const 段 = 文.slice(文.indexOf('export const 知乎卡库'), 文.indexOf('/**', 文.indexOf('export const 知乎卡库')));
  for (const m of 段.matchAll(/主题: '([^']+)',[\s\S]*?赞同: (\d+),/g)) 旧库[m[1]] = Number(m[2]);
}
/** 已用过的链接（跨主题去重）*/
const 用过 = new Set();
const 选 = {};

for (const [主题, 词] of Object.entries(要查)) {
  try {
    const 旧 = 旧库[主题] ?? 0;
    const 排 = 查(词)
      .filter((x) => x.Url && !用过.has(x.Url))
      .sort((a, b) => (b.VoteUpCount ?? 0) - (a.VoteUpCount ?? 0));
    const 首 = 排.find((x) => (x.VoteUpCount ?? 0) >= 旧);
    if (!首) {
      console.log('  = ' + 主题 + '：没查到更好的（旧 ' + 旧 + ' 赞），保留原卡');
      continue;
    }
    用过.add(首.Url);
    选[主题] = {
      主题,
      标题: 首.Title,
      作者: 首.AuthorName,
      赞同: 首.VoteUpCount ?? 0,
      链接: 首.Url,
      // ⚠️ API 给的 ContentText 可能是很长一段，卡面放不下 —— 截到 300 字以内、
      //    并且**在最后一个句号处断**（别把话截半句）
      摘录: (() => {
        const t = String(首.ContentText ?? '').trim();
        if (t.length <= 300) return t;
        const 前 = t.slice(0, 300);
        const 位 = Math.max(前.lastIndexOf('。'), 前.lastIndexOf('\n'));
        return 位 > 120 ? 前.slice(0, 位 + 1) : 前;
      })(),
    };
    console.log('  ✓ ' + 主题 + '：' + (首.VoteUpCount ?? 0) + ' 赞（旧 ' + 旧 + '）· ' + 首.AuthorName + ' · ' + String(首.Title).slice(0, 34));
  } catch (e) {
    console.log('  ✗ ' + 主题 + '：' + String(e.message).slice(0, 140));
  }
}

if (!要写) {
  console.log('\n（没加 --写，只查不写。要落盘：node 工具/查知乎卡.mjs --写）');
} else {
  // 保留文件头注释 + 取卡函数，只换 知乎卡库 这一整段
  const 旧文 = readFileSync(卡库文件, 'utf8');
  const 头 = 旧文.slice(0, 旧文.indexOf('export const 知乎卡库'));
  const 尾 = 旧文.slice(旧文.indexOf('/**\n * 取一张知乎卡'));
  // 库里原有的、这次没重查到的，原样保留（别把好卡弄丢）
  const 保留 = {};
  {
    const 段 = 旧文.slice(旧文.indexOf('export const 知乎卡库'), 旧文.indexOf('/**\n * 取一张知乎卡'));
    for (const m of 段.matchAll(/  '([^']+)': \{([\s\S]*?)\n  \},/g)) {
      if (!选[m[1]]) 保留[m[1]] = m[0];
    }
  }
  const 块 = [
    ...Object.values(选).map((c) => {
      const 摘要 = JSON.stringify(c.摘录);
      return (
        '  ' + JSON.stringify(c.主题) + ': {\n' +
        '    主题: ' + JSON.stringify(c.主题) + ',\n' +
        '    已接入: true,\n' +
        '    标题: ' + JSON.stringify(c.标题) + ',\n' +
        '    作者: ' + JSON.stringify(c.作者) + ',\n' +
        '    赞同: ' + c.赞同 + ',\n' +
        '    链接: ' + JSON.stringify(c.链接) + ',\n' +
        '    摘录:\n      ' + 摘要 + ',\n' +
        '  },'
      );
    }),
    ...Object.values(保留),
  ].join('\n\n');
  writeFileSync(卡库文件, 头 + 'export const 知乎卡库: Record<string, 知乎卡数据> = {\n' + 块 + '\n};\n\n' + 尾, 'utf8');
  console.log('\n✅ 写入 ' + Object.keys(选).length + ' 张新卡，保留 ' + Object.keys(保留).length + ' 张旧卡 → ' + 卡库文件);
}
