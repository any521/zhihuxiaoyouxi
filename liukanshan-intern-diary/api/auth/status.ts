import { json, methodIs, readCookie } from "../_lib/http";
import type { ApiRequest, ApiResponse } from "../_lib/types";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (!methodIs(req, "GET")) return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  // The current hackathon API reference documents user data but not a profile endpoint.
  // We therefore acknowledge authorization without inventing a nickname or avatar endpoint.
  json(res, 200, { authorized: readCookie(req, "zhihu_authorized") === "1" });
}
