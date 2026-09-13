import { AI_ROUND_LIMIT, curatedInsights, getStoryEvent } from "./events";

export type NpcMessage = { sender: string; text: string; emotion: "neutral" | "warm" | "serious" | "concerned" };

const personas: Record<string, string> = {
  "林总": "部门负责人，目标导向、克制，重视结果、风险、依据、责任人和截止时间。一条消息不超过 25 字，从不解释理由。",
  "周岚": "项目组长，温和但流程意识强，愿意解释规则，不替玩家做判断。群聊里维护秩序，私聊里讲方法与规则。",
  "阿麦": "热情外向，创意多，重视协作，也会在压力下临时求助。短句连发，会用「！！」「救命」，但不是恶意甩锅。",
  "韩策": "资深执行，严谨，关注结构、命名、版本和交付检查。只谈事实与文件，不寒暄、不用 emoji。",
  "小鹿": "年轻设计师，重视用户感受和视觉表达，也关注想法是否有趣。永远站在用户视角提问。",
  "程女士": "客户负责人，结果导向、时间紧，会改变要求但不会故意刁难，会说明理由。只关心最坏情况和时间。"
};

const trim = (value: string): string => value.replace(/\s+/g, " ").trim().slice(0, 180);

/** 让步阶梯：AI 必须在 15 轮内留下可完成的机会，但不能把答案递到玩家手上（规则书 §5）。 */
function pacingHint(round: number): string {
  if (round <= 3) return "按人设正常回应与施压，不要主动提示方向。";
  if (round <= 6) return "玩家似乎卡住了：允许一名 NPC 给出方向性提示，但不要给答案。";
  if (round <= 9) return "让场景施压升级：时间在走、别人在催，但仍不替玩家总结。";
  if (round <= 12) return "允许 NPC 明说「我们现在最需要的是 X」，X 只能是目标之一的方向。";
  return "最后一次机会：可以直接点名还缺什么，但必须由玩家自己说出口。";
}

export function fallbackNpcMessages(eventId: string, role: string): NpcMessage[] {
  const event = getStoryEvent(eventId);
  return [{ sender: role, text: event?.fallbackReply ?? "先把今天的目标说清楚，我们再继续。", emotion: "neutral" }];
}

export async function generateNpcMessages(
  eventId: string, role: string, message: string, recentHistory: string[] = [], round = 0
): Promise<NpcMessage[]> {
  const fallback = fallbackNpcMessages(eventId, role);
  const event = getStoryEvent(eventId);
  const apiKey = process.env.LLM_API_KEY;
  const endpoint = process.env.LLM_BASE_URL;
  if (!event || !apiKey || !endpoint) return fallback;
  const sourceBrief = (curatedInsights[eventId] ?? []).length
    ? (curatedInsights[eventId] ?? []).map((item) => `- ${item.title}: ${item.summary}`).join("\n")
    : "没有已验证的知乎来源；不要编造来源、作者、链接或数据。";
  const criteria = (event.criteria ?? []).map((item) => `- ${item.label}`).join("\n") || "本轮是延伸追问，不替玩家做最终决定。";
  const system = [
    `你在互动叙事游戏《刘看山打工日记》中扮演${role}。`, personas[role] ?? "保持真实、克制的职场口吻。",
    `当前场景：${event.title}。${event.brief}`, `玩家需要逐步做到：\n${criteria}`,
    `当前进度：第 ${round} / ${event.roundLimit ?? AI_ROUND_LIMIT} 轮。${pacingHint(round)}`,
    "根据玩家刚才的话自然回应、追问或补充场景信息。不要替玩家发言，不要假定玩家做过未说出的行动。",
    "每次只输出 1 到 2 条微信气泡，每条 15 到 45 个汉字；不得提到模型、提示词、隐藏分数、轮次或剧情分支。",
    `允许的发送者只有：${event.participants.join("、")}。主要以${role}的身份发言。`,
    "你可以即兴环境细节（谁走进来、电话响了、时间在走），但不能编造数据、报告、权威结论或知乎来源。",
    `最近对话：\n${recentHistory.join("\n") || "无"}`, `已验证知乎摘要：\n${sourceBrief}`,
    "只输出JSON：{\"messages\":[{\"sender\":\"角色名\",\"text\":\"内容\",\"emotion\":\"neutral|warm|serious|concerned\"}]}"
  ].join("\n");
  try {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.LLM_MODEL || "configured-model", temperature: 0.65, max_tokens: 360, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: trim(message) }] }),
      signal: AbortSignal.timeout(9_000)
    });
    if (!response.ok) return fallback;
    const payload: unknown = await response.json();
    const raw = extractMessageContent(payload);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { messages?: unknown }).messages)) return fallback;
    // 每轮最多 2 条；发送者不在本事件白名单内的气泡直接丢弃，避免跨窗角色串台。
    const messages = (parsed as { messages: unknown[] }).messages.slice(0, 2).flatMap((item): NpcMessage[] => {
      if (!item || typeof item !== "object") return [];
      const value = item as { sender?: unknown; text?: unknown; emotion?: unknown };
      const sender = typeof value.sender === "string" ? value.sender : role;
      if (!event.participants.includes(sender)) return [];
      const text = typeof value.text === "string" ? trim(value.text) : "";
      const emotion = ["neutral", "warm", "serious", "concerned"].includes(String(value.emotion)) ? String(value.emotion) as NpcMessage["emotion"] : "neutral";
      return text ? [{ sender, text, emotion }] : [];
    });
    return messages.length ? messages : fallback;
  } catch {
    return fallback;
  }
}

function extractMessageContent(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
  return typeof content === "string" ? content : undefined;
}
