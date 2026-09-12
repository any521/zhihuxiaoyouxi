import { randomBytes } from "node:crypto";
import { json, methodIs, redirect } from "../_lib/http";
import type { ApiRequest, ApiResponse } from "../_lib/types";

const AUTHORIZE_URL = "https://openapi.zhihu.com/authorize";

export default function handler(req: ApiRequest, res: ApiResponse): void {
  if (!methodIs(req, "GET")) return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const appId = process.env.ZHIHU_OAUTH_APP_ID;
  const redirectUri = process.env.ZHIHU_OAUTH_REDIRECT_URI;
  if (!appId || !redirectUri) return json(res, 503, { error: "OAUTH_NOT_CONFIGURED" });

  const state = randomBytes(24).toString("base64url");
  res.setHeader("Set-Cookie", `zhihu_oauth_state=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  const destination = new URL(AUTHORIZE_URL);
  destination.searchParams.set("redirect_uri", redirectUri);
  destination.searchParams.set("app_id", appId);
  destination.searchParams.set("response_type", "code");
  destination.searchParams.set("state", state);
  redirect(res, destination.toString());
}
