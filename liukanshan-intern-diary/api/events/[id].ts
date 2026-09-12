import { getStoryEvent } from "../_lib/events";
import { json, methodIs } from "../_lib/http";
import type { ApiRequest, ApiResponse } from "../_lib/types";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (!methodIs(req, "GET")) return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const rawId = req.query?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const event = id ? getStoryEvent(id) : undefined;
  if (!event) return json(res, 404, { error: "EVENT_NOT_FOUND" });
  json(res, 200, { event });
}
