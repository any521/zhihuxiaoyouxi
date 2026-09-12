import type { ApiRequest, ApiResponse } from "./types";

export function json(res: ApiResponse, statusCode: number, payload: unknown): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(statusCode).json(payload);
}

export function methodIs(req: ApiRequest, expected: string): boolean {
  return req.method?.toUpperCase() === expected;
}

export function getBody(req: ApiRequest): Record<string, unknown> {
  if (typeof req.body === "string") {
    try {
      const parsed: unknown = JSON.parse(req.body);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isRecord(req.body) ? req.body : {};
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readCookie(req: ApiRequest, name: string): string | undefined {
  const raw = req.headers.cookie;
  const cookieString = Array.isArray(raw) ? raw.join(";") : raw ?? "";
  const prefix = `${name}=`;
  for (const item of cookieString.split(";")) {
    const trimmed = item.trim();
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length));
  }
  return undefined;
}

export function redirect(res: ApiResponse, url: string): void {
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, url);
}
