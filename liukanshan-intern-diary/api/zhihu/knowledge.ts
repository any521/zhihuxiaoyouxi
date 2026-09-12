import { isRecord, json, methodIs } from "../_lib/http";
import type { ApiRequest, ApiResponse } from "../_lib/types";

const KNOWLEDGE_LIST_URL = "https://api.zhihu.com/km-indep-home/hackathon/v2/knowledge/list";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!methodIs(req, "GET")) return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  try {
    const upstream = await fetch(KNOWLEDGE_LIST_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(7_000)
    });
    if (!upstream.ok) return knowledgeResponse(res, [], "UPSTREAM_HTTP_" + upstream.status);
    const payload: unknown = await upstream.json();
    if (!Array.isArray(payload)) return knowledgeResponse(res, [], "UPSTREAM_SHAPE_INVALID");
    const items = payload.slice(0, 6).flatMap((item) => {
      if (!isRecord(item)) return [];
      const workId = typeof item.work_id === "string" ? item.work_id : "";
      if (!/^[A-Za-z0-9_-]+$/.test(workId)) return [];
      const title = typeof item.title === "string" ? item.title : "知乎知识";
      const description = typeof item.description === "string" ? item.description.slice(0, 110) : "";
      const labels = Array.isArray(item.labels) ? item.labels.filter((label): label is string => typeof label === "string").slice(0, 3) : [];
      return [{ workId, title, description, labels }];
    });
    knowledgeResponse(res, items, null);
  } catch {
    knowledgeResponse(res, [], "UPSTREAM_UNAVAILABLE");
  }
}

function knowledgeResponse(res: ApiResponse, items: unknown[], reason: string | null): void {
  // Short shared cache reduces hits to the hackathon-only endpoint.
  res.setHeader("Cache-Control", "public, max-age=900, s-maxage=900");
  res.status(200).json({ items, source: "zhihu-hackathon-knowledge", unavailableReason: reason });
}
