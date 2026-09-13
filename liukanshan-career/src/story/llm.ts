/**
 * 知乎 LLM 适配层（跑团那层的"可插拔外皮"）。
 *
 * 接口：知乎开放平台的对话接口（OpenAI 风格）
 *   POST https://developer.zhihu.com/v1/chat/completions
 *   Header: Authorization: Bearer <Access Secret> + X-Request-Timestamp: <秒级时间戳>
 *   Body:   { model, messages, stream }
 *   模型档位：`zhida-fast-1p5`（快）/ `zhida-thinking-1p5`（深度）/ `zhida-agent`（智能检索）
 *
 * ⚠️⚠️ **浏览器里绝对不能放 Access Secret**（纯前端项目，密钥会被任何访客扒走）。
 *     所以这里**默认不直连**，而是打一个**你自己控制的代理**（同源的 `/api/npc` 之类）。
 *     想看真实的请求长什么样、想自己起代理时，把 `直连调试` 打开 —— **只在本机开发时用**。
 *
 * 设计原则（跟 `跑团.ts` 配套）：
 *   一、**超时短**（默认 900ms）：这是"边玩边生成"，不能让玩家等
 *   二、**失败就是没有**：返回 null，调用方用兜底叙述，绝不抛错、绝不阻塞
 *   三、**只回一句话**：让模型输出 JSON `{"叙述":"..."}`，再由 `校验叙述` 过闸
 */

import { 造提示词, 校验叙述, type 判定档, type 回合, type 跑团配置 } from './跑团';

/** 模型档位（知乎开放平台的三个） */
export type 模型档 = 'zhida-fast-1p5' | 'zhida-thinking-1p5' | 'zhida-agent';

export interface LLM配置 {
  /** 代理地址。默认同源 `/api/npc`；留空表示"这一局不用 AI" */
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
  代理: '/api/npc',
  模型: 'zhida-fast-1p5',
  超时: 900,
};

/** 允许出现的人名（校验用；从人物档案来的话改这里一处就够） */
const 允许人名 = ['刘看山', '林总', '周岚', '阿麦', '韩策', '小鹿', '程女士', '学长'];

/** 从响应里抠出那一句叙述（兼容 chat.completions 的两种返回） */
function 取叙述(体: unknown): string | null {
  if (!体 || typeof 体 !== 'object') return null;
  const o = 体 as Record<string, unknown>;
  // 我们自己的代理：直接回 {叙述}
  if (typeof o.叙述 === 'string') return o.叙述;
  // 知乎/OpenAI 风格：choices[0].message.content
  const 选 = Array.isArray(o.choices) ? (o.choices[0] as Record<string, unknown> | undefined) : undefined;
  const 信 = 选?.message as Record<string, unknown> | undefined;
  let 文 = typeof 信?.content === 'string' ? 信.content : null;
  if (!文) return null;
  // 模型可能把 JSON 包在 ```json 里
  文 = 文.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    const j = JSON.parse(文) as Record<string, unknown>;
    if (typeof j.叙述 === 'string') return j.叙述;
  } catch {
    // 不是 JSON 就整段拿来校验（有些模型会直接说人话）
    return 文;
  }
  return null;
}

/**
 * 要一句 AI 叙述。
 *
 * 返回 null 表示"这次没有 AI"（超时 / 没配 / 校验不过 / 网络错），
 * 调用方**必须**用它自己的兜底叙述 —— 这个函数永远不会抛错。
 */
export async function 要叙述(
  配置: LLM配置,
  跑团: 跑团配置,
  回合: 回合,
  档: 判定档,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!配置.代理 && !配置.直连调试) return null;

  const 提示 = 造提示词(跑团, 回合, 档, 允许人名);
  const 体 = {
    model: 配置.模型,
    messages: [
      { role: 'system', content: 提示 },
      { role: 'user', content: `请输出这一轮 JSON：{"叙述":"..."}` },
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
    const 回 = 取叙述(await r.json());
    if (!回) return null;
    // ⚠️ 最后一道闸：过不了校验就用兜底，宁可平庸也不要跑偏
    return 校验叙述(回, 允许人名).过 ? 回 : null;
  } catch {
    return null; // 超时 / 断网 / 代理没起 —— 一律当"没有 AI"
  } finally {
    clearTimeout(表);
  }
}
