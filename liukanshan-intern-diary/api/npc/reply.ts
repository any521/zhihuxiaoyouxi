import { getStoryEvent } from "../_lib/events";
import { getBody, json, methodIs } from "../_lib/http";
import { generateNpcReply } from "../_lib/npc";
import type { ApiRequest, ApiResponse } from "../_lib/types";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!methodIs(req, "POST")) return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const body = getBody(req);
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const role = typeof body.role === "string" ? body.role : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const history = Array.isArray(body.history)
    ? body.history.slice(-6).map((item) => {
      if (!item || typeof item !== "object") return "";
      const record = item as { sender?: unknown; text?: unknown };
      return `${typeof record.sender === "string" ? record.sender : ""}：${typeof record.text === "string" ? record.text.slice(0, 180) : ""}`;
    }).filter(Boolean)
    : [];
  const event = getStoryEvent(eventId);
  if (!event || (role !== "林总" && role !== "阿麦") || !message || message.length > 180) {
    return json(res, 400, { error: "INVALID_NPC_REQUEST" });
  }
  const reply = await generateNpcReply(eventId, role, message, history);
  json(res, 200, { reply, mode: process.env.LLM_API_KEY && process.env.LLM_BASE_URL ? "model" : "fallback" });
}
