/**
 * 知乎 LLM 适配层（跑团那层的"可插拔外皮"）。
 *
 * 接口：知乎开放平台的对话接口（OpenAI 风格）
 *   POST https://developer.zhihu.com/v1/chat/completions
 *   Header: Authorization: Bearer <Access Secret> + X-Request-Timestamp: <秒级时间戳>
 *   Body:   { model, messages, stream }
 *   模型档位：zhida-fast-1p5（快）/ zhida-thinking-1p5（深度）/ zhida-agent（智能检索）
 *
 * ⚠️⚠️ **浏览器里绝对不能放 Access Secret**（纯前端项目，密钥会被任何访客扒走）。
 *     所以这里**默认不直连**，而是打一个**你自己控制的代理**（同源的 /api/npc 之类）。
 *     想看真实的请求长什么样、想自己起代理时，把 直连调试 打开 —— **只在本机开发时用**。
 *
 * 设计原则（跟 跑团.ts 配套）：
 *   一、**超时短**：这是"边玩边生成"，不能让玩家等；超了就用作者兜底
 *   二、**失败就是没有**：返回 null，调用方用兜底叙述，绝不抛错、绝不阻塞
 *   三、**只回一小段**：让模型输出 JSON {"叙述":"...","对白":"..."}，再由 过闸 过闸
 *
 * ── 2026-09 增补 ──
 * 用户要求「跑团剧情增加知乎 AI **不偏离剧情的丰富有趣对话**」。
 * 所以这里从"要一句描写"升级成"要一个镜头 + 一句对白"（`要描写`）。
 * ⚠️ `要叙述` **保留原签名**（只回那一句描写）—— 它是老的调用点与自检脚本的接口，
 *    改成对象会让 tools/跑团自检.mjs 全线飘红；新代码请用 `要描写`。
 */

import { 造提示词, 过闸, type 判定档, type 回合, type 跑团配置, type 描写, type 提示上下文 } from './跑团';

/** 模型档位（知乎开放平台的三个） */
export type 模型档 = 'zhida-fast-1p5' | 'zhida-thinking-1p5' | 'zhida-agent';

export interface LLM配置 {
  /** 代理地址。默认同源 /api/npc；留空表示"这一局不用 AI" */
  代理: string;
  /** 模型档位 */
  模型: 模型档;
  /** 超时（毫秒）。超了就当没有 AI */
  超时: number;
  /**
   * 直连调试：把请求直接发给知乎（**需要在本机配 Access Secret**）。
   * ⚠️ 只在本机开发用，**绝不要**开在会部署出去的那份里。
   */
  直连调试?: string;
}

export const 默认LLM配置: LLM配置 = {
  /*
   * ⚠️⚠️ **别再改回根路径 `/api/npc`** ✗ —— 它不在 `/刘看山/` 下，
   *    nginx 的兜底 `location /` 会把它交给**主站（agrimind）的后端** ✔，
   *    那边要鉴权 → 控制台就是一串 **401 Unauthorized** ✔
   *    （用户看到的 `https://zjhxbb.xyz/api/npc 401` 就是这个 ✗）
   * 现在指向**我们自己的命名空间** ✔：将来接 AI（知乎直答）也在这个路径下接 ✔
   * ⚠️ 还没接 AI 时，这个地址返回 **204 空响应**（不是错误 ✗）→ 游戏自动用兜底台词 ✔
   */
  代理: '/刘看山/api/npc',
  模型: 'zhida-fast-1p5',
  超时: 900,
};

/**
 * 跑团用的配置：**超时放宽到 2.6 秒**。
 *
 * 为什么跑团可以等而关卡不能等：跑团是"读一段、点一下"的节奏，
 * 玩家本来就在看文字，多等一秒不难受；关卡里加工/交付是连着的动作，不能让画面卡住。
 * ⚠️ 也不是越长越好 —— 玩家点完骰子之后**兜底那句已经显示了**（见 贴AI话），
 *    所以就算这里超时，界面也是完整的，只是那一段少一层皮。
 */
export const 跑团LLM配置: LLM配置 = {
  // ⚠️ 同上：必须留在 /刘看山/ 这个命名空间里 ✗（根路径会被主站接走 → 401 ✔）
  代理: '/刘看山/api/npc',
  模型: 'zhida-thinking-1p5',
  超时: 2600,
};

/** 允许出现的人名（校验用；从人物档案来的话改这里一处就够） */
const 允许人名 = ['刘看山', '林总', '周岚', '阿麦', '韩策', '小鹿', '程女士', '学长'];

/** 把一轮里"在场的人"并进允许名单（跑团用；不传就用全局那份） */
export function 这一轮的人名(在场?: string[]): string[] {
  if (!在场 || !在场.length) return 允许人名;
  const 集 = new Set(允许人名);
  for (const 名 of 在场) 集.add(名);
  return [...集];
}

/** 从响应里抠出 {`叙述`, `对白`}（兼容 chat.completions 的两种返回） */
function 取描写(体: unknown): { 叙述: unknown; 对白: unknown } | null {
  if (!体 || typeof 体 !== 'object') return null;
  const o = 体 as Record<string, unknown>;
  // 我们自己的代理：直接回 {叙述, 对白}
  if (typeof o.叙述 === 'string') return { 叙述: o.叙述, 对白: o.对白 };
  // 知乎/OpenAI 风格：choices[0].message.content
  const 选 = Array.isArray(o.choices) ? (o.choices[0] as Record<string, unknown> | undefined) : undefined;
  const 信 = 选?.message as Record<string, unknown> | undefined;
  let 文 = typeof 信?.content === 'string' ? 信.content : null;
  if (!文) return null;
  // 模型可能把 JSON 包在 ```json 里
  文 = 文.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const j = JSON.parse(文) as Record<string, unknown>;
    return { 叙述: j.叙述, 对白: j.对白 };
  } catch {
    // 不是 JSON 就整段拿来校验（有些模型会直接说人话）
    return { 叙述: 文, 对白: undefined };
  }
}

/**
 * 要一"轮"的说法：一个镜头 + 一句对白。
 *
 * 返回 null 表示"这次没有 AI"（超时 / 没配 / 校验不过 / 网络错），
 * 调用方**必须**用它自己的兜底叙述 —— 这个函数永远不会抛错。
 *
 * @param 上下文 剧情进度（第几轮、线索、上一句），交给提示词让 AI 贴着剧情写
 */
export async function 要描写(
  配置: LLM配置,
  跑团: 跑团配置,
  回合: 回合,
  档: 判定档,
  上下文: 提示上下文 = {},
  fetchImpl: typeof fetch = fetch,
): Promise<描写 | null> {
  if (!配置.代理 && !配置.直连调试) return null;

  const 人名表 = 这一轮的人名(回合.在场);
  const 提示 = 造提示词(跑团, 回合, 档, 人名表, 上下文);
  const 体 = {
    model: 配置.模型,
    messages: [
      { role: 'system', content: 提示 },
      { role: 'user', content: '请输出这一轮 JSON：{"叙述":"...","对白":"..."}' },
    ],
    stream: false,
  };

  const 控 = new AbortController();
  const 表 = setTimeout(() => 控.abort(), 配置.超时);
  try {
    const 头: Record<string, string> = { 'Content-Type': 'application/json' };
    let 地址 = 配置.代理;
    if (配置.直连调试) {
      地址 = 'https://developer.zhihu.com/v1/chat/completions';
      头.Authorization = `Bearer ${配置.直连调试}`;
      头['X-Request-Timestamp'] = String(Math.floor(Date.now() / 1000));
    }
    const r = await fetchImpl(地址, {
      method: 'POST',
      headers: 头,
      body: JSON.stringify(体),
      signal: 控.signal,
    });
    if (!r.ok) return null;
    const 回 = 取描写(await r.json());
    // ⚠️ 最后一道闸：过不了校验就用兜底，宁可平庸也不要跑偏
    return 过闸(回, 回合.在场, 人名表);
  } catch {
    return null; // 超时 / 断网 / 代理没起 —— 一律当"没有 AI"
  } finally {
    clearTimeout(表);
  }
}

/**
 * 老的接口：只要那一句镜头描写。
 * **签名和返回值都不动**（tools/跑团自检.mjs 按字符串在断言）。
 */
export async function 要叙述(
  配置: LLM配置,
  跑团: 跑团配置,
  回合: 回合,
  档: 判定档,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const 回 = await 要描写(配置, 跑团, 回合, 档, {}, fetchImpl);
  return 回 ? 回.叙述 : null;
}

export { 允许人名 };
