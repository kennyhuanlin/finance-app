import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// Single-owner access guard. Never infer identity from a caller-supplied email header.
export function requireFinanceAccess(request: Request): Response | null {
  const username = process.env.FINANCE_APP_USERNAME;
  const password = process.env.FINANCE_APP_PASSWORD;
  const deny = (error: string, status: number, challenge = false) => Response.json(
    { error }, { status, headers: {
      "Cache-Control": "no-store",
      ...(challenge ? { "WWW-Authenticate": 'Basic realm="Finance App", charset="UTF-8"' } : {}),
    } },
  );
  if (!username || !password || password.length < 32) return deny("存取保護尚未設定，請聯絡管理者", 503);
  const url = new URL(request.url);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") return deny("HTTPS required", 403);
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Basic [A-Za-z0-9+/]+={0,2}$/i.test(authorization) || authorization.length > 4096) return deny("請先登入 Finance App", 401, true);
  const supplied = Buffer.from(authorization.slice(6), "base64");
  const digest = (value: Buffer | string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(digest(supplied), digest(`${username}:${password}`))) return deny("登入資訊不正確", 401, true);
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const configuredOrigin = process.env.FINANCE_APP_ORIGIN;
    const expectedOrigin = configuredOrigin ? new URL(configuredOrigin).origin : url.origin;
    if (origin !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") return deny("請從 Finance App 網頁執行此操作", 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return deny("Expected application/json", 415);
  }
  return null;
}
