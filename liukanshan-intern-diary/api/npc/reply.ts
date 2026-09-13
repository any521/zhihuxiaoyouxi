import { getStoryEvent } from "../_lib/events";
import { getBody, json, methodIs } from "../_lib/http";
import { generateNpcMessages } from "../_lib/npc";
import type { ApiRequest, ApiResponse } from "../_lib/types";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!methodIs(req, "POST")) return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const body = getBody(req);
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const role = typeof body.role === "string" ? body.role : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const history = Array.isArray(body.history)
    ? body.history.slice(-20).map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as { sender?: unknown; text?: unknown };
      return `${typeof record.sender === "string" ? record.sender : ""}：${typeof record.text === "string" ? record.text.slice(0, 180) : ""}`;
    }).filter(Boolean)
    : [];
  const event = getStoryEvent(eventId);
  if (!event || !event.participants.includes(role) || !message || message.length > 180) {
    return json(res, 400, { error: "INVALID_NPC_REQUEST" });
  }
  const round = typeof body.round === "number" && Number.isFinite(body.round)
    ? Math.max(0, Math.min(999, Math.trunc(body.round)))
    : 0;
  const messages = await generateNpcMessages(eventId, role, message, history, round);
  const playerTurns = history.filter((line) => line.startsWith("刘看山：")).length + 1;
  json(res, 200, { messages, canSubmit: playerTurns >= 2, mode: process.env.LLM_API_KEY && process.env.LLM_BASE_URL ? "model" : "fallback" });
}
