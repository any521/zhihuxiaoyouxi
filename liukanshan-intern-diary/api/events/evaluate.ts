import { getStoryEvent } from "../_lib/events";
import { getBody, json, methodIs } from "../_lib/http";
import type { ApiRequest, ApiResponse, EventCriterion, ScoreDelta } from "../_lib/types";

type HistoryItem = { sender: string; text: string };

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!methodIs(req, "POST")) return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const body = getBody(req);
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const event = getStoryEvent(eventId);
  if (!event || event.mode !== "ai" || !event.criteria) return json(res, 400, { error: "INVALID_EVALUATION_REQUEST" });
  const history: HistoryItem[] = Array.isArray(body.history) ? body.history.slice(-20).flatMap((item): HistoryItem[] => {
    if (!item || typeof item !== "object") return [];
    const value = item as { sender?: unknown; text?: unknown };
    if (typeof value.sender !== "string" || typeof value.text !== "string") return [];
    return [{ sender: value.sender.slice(0, 20), text: value.text.replace(/\s+/g, " ").trim().slice(0, 180) }];
  }) : [];
  if (history.filter((item) => item.sender === "刘看山").length < 2) return json(res, 400, { error: "NOT_ENOUGH_PLAYER_TURNS" });
  const local = localEvaluation(event.criteria, history);
  const judged = await modelEvaluation(event.title, event.brief, event.criteria, history);
  const metCriteria = judged?.metCriteria?.filter((id) => event.criteria?.some((criterion) => criterion.id === id)) ?? local.metCriteria;
  const uniqueMet = [...new Set(metCriteria)];
  const missingCriteria = event.criteria.filter((item) => !uniqueMet.includes(item.id)).map((item) => item.id);
  const status = uniqueMet.length >= 3 ? "excellent" : uniqueMet.length >= 2 ? "completed" : "incomplete";
  const scoreDelta: ScoreDelta = status === "excellent" ? { trust: 2, team: 2, growth: 2 } : status === "completed" ? { trust: 1, team: 1, growth: 1 } : { trust: 0, team: 0, growth: 0 };
  const feedback = judged?.feedback || (status === "excellent" ? "处理得很完整，目标、边界和下一步都说清楚了。" : status === "completed" ? "任务已经完成，关键行动基本明确。" : "目前还不足以完成任务，请继续补充缺少的关键信息。");
  json(res, 200, { status, feedback: feedback.slice(0, 180), metCriteria: uniqueMet, missingCriteria, scoreDelta, mode: judged ? "model" : "fallback" });
}

function localEvaluation(criteria: EventCriterion[], history: HistoryItem[]): { metCriteria: string[] } {
  const playerText = history.filter((item) => item.sender === "刘看山").map((item) => item.text.toLowerCase()).join(" ");
  return { metCriteria: criteria.filter((item) => item.keywords.some((keyword) => playerText.includes(keyword.toLowerCase()))).map((item) => item.id) };
}

async function modelEvaluation(title: string, brief: string, criteria: EventCriterion[], history: HistoryItem[]): Promise<{ metCriteria: string[]; feedback: string } | undefined> {
  const apiKey = process.env.LLM_API_KEY;
  const endpoint = process.env.LLM_BASE_URL;
  if (!apiKey || !endpoint) return undefined;
  const system = [
    "你是互动职场游戏的任务裁判，只根据玩家明确说过的内容判断，不推测未发生的行动。",
    `事件：${title}。场景：${brief}`,
    `标准：\n${criteria.map((item) => `${item.id}: ${item.label}`).join("\n")}`,
    "返回JSON：{\"metCriteria\":[\"标准ID\"],\"feedback\":\"对玩家的简短职场反馈\"}。不得返回分数，不得添加不存在的标准。"
  ].join("\n");
  try {
    const response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.LLM_MODEL || "configured-model", temperature: 0.1, max_tokens: 260, response_format: { type: "json_object" }, messages: [{ role: "system", content: system }, { role: "user", content: history.map((item) => `${item.sender}：${item.text}`).join("\n") }] }),
      signal: AbortSignal.timeout(9_000)
    });
    if (!response.ok) return undefined;
    const payload: unknown = await response.json();
    const raw = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content;
    if (typeof raw !== "string") return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    const value = parsed as { metCriteria?: unknown; feedback?: unknown };
    if (!Array.isArray(value.metCriteria) || typeof value.feedback !== "string") return undefined;
    return { metCriteria: value.metCriteria.filter((item): item is string => typeof item === "string"), feedback: value.feedback };
  } catch {
    return undefined;
  }
}
