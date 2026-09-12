import { getStoryEvent } from "./_lib/events";
import { getBody, json, methodIs } from "./_lib/http";
import type { ApiRequest, ApiResponse } from "./_lib/types";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (!methodIs(req, "POST")) return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const body = getBody(req);
  const eventId = typeof body.eventId === "string" ? body.eventId : "";
  const actionId = typeof body.actionId === "string" ? body.actionId : "";
  const event = getStoryEvent(eventId);
  const action = event?.actions.find((item) => item.id === actionId);
  if (!event || !action) return json(res, 400, { error: "INVALID_ACTION" });
  // The client owns its local save; this endpoint only validates the immutable route.
  json(res, 200, { eventId, actionId, scores: action.scores, isMinigame: Boolean(event.isMinigame) });
}
