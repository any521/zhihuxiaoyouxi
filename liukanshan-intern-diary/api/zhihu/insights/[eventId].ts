import { curatedInsights, getStoryEvent } from "../../_lib/events";
import { json, methodIs } from "../../_lib/http";
import type { ApiRequest, ApiResponse } from "../../_lib/types";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (!methodIs(req, "GET")) return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const rawId = req.query?.eventId;
  const eventId = Array.isArray(rawId) ? rawId[0] : rawId;
  const event = eventId ? getStoryEvent(eventId) : undefined;
	if (!event || !eventId) return json(res, 404, { error: "EVENT_NOT_FOUND" });
  // Only human-verified cached items are returned. An empty array is intentional and safe.
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.status(200).json({ eventId, keyword: event.keyword, insights: curatedInsights[eventId] ?? [] });
}
