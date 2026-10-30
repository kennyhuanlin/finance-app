import "server-only";

// Intentional passwordless mode: anyone reaching this app can read and mutate data.
// These checks limit accidental browser cross-site writes, not direct API clients.
export function requireFinanceAccess(request: Request): Response | null {
  const deny = (error: string, status: number) =>
    Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
  const url = new URL(request.url);
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    return deny("HTTPS required", 403);
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const configuredOrigin = process.env.FINANCE_APP_ORIGIN;
    const expectedOrigin = configuredOrigin ? new URL(configuredOrigin).origin : url.origin;
    if (origin !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
      return deny("請從 Finance App 網頁執行此操作", 403);
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return deny("Expected application/json", 415);
    }
  }
  return null;
}
