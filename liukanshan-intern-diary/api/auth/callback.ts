import { getBody, json, methodIs, readCookie, redirect } from "../_lib/http";
import type { ApiRequest, ApiResponse } from "../_lib/types";

const TOKEN_URL = "https://openapi.zhihu.com/access_token";

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (!methodIs(req, "GET")) return json(res, 405, { error: "METHOD_NOT_ALLOWED" });
  const authorizationCode = queryValue(req, "authorization_code") || queryValue(req, "code");
  const state = queryValue(req, "state");
  const expectedState = readCookie(req, "zhihu_oauth_state");
  const appId = process.env.ZHIHU_OAUTH_APP_ID;
  const appKey = process.env.ZHIHU_OAUTH_APP_KEY;
  const redirectUri = process.env.ZHIHU_OAUTH_REDIRECT_URI;
  res.setHeader("Set-Cookie", "zhihu_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  if (!authorizationCode || !state || !expectedState || state !== expectedState || !appId || !appKey || !redirectUri) {
    return json(res, 400, { error: "OAUTH_CALLBACK_INVALID" });
  }
  try {
    const tokenResponse = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        app_id: appId,
        app_key: appKey,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        code: authorizationCode
      }),
      signal: AbortSignal.timeout(10_000)
    });
    const payload: unknown = await tokenResponse.json().catch(() => ({}));
    // Intentionally do not put OAuth credentials in a cookie, URL, client response, log, or file.
    if (!tokenResponse.ok || !hasAccessToken(payload)) return json(res, 502, { error: "OAUTH_TOKEN_EXCHANGE_FAILED" });
    res.setHeader("Set-Cookie", [
      "zhihu_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      "zhihu_authorized=1; Path=/; Secure; SameSite=Lax; Max-Age=300"
    ]);
    redirect(res, "/?zhihu=authorized");
  } catch {
    return json(res, 502, { error: "OAUTH_TOKEN_EXCHANGE_FAILED" });
  }
}

function queryValue(req: ApiRequest, key: string): string | undefined {
  const raw = req.query?.[key];
  return Array.isArray(raw) ? raw[0] : raw;
}

function hasAccessToken(value: unknown): value is { access_token: string } {
  return typeof value === "object" && value !== null && "access_token" in value && typeof (value as { access_token?: unknown }).access_token === "string";
}
