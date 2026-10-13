import { NextRequest, NextResponse } from "next/server";
import { requireFinanceAccess } from "../../lib/apiAccess";
import * as canonical from "../google/[resource]/route";
const resources: Record<string, string> = {
  transactions: "transactions", categories: "categories", recurring_rules: "recurring",
  investment_trades: "investment-trades", investment_positions: "investment-positions",
  fx_records: "fx-records", dividend_records: "dividend-records", cash_accounts: "cash-accounts", cash_ledger: "cash-ledger",
};
export async function GET(request: NextRequest) {
  const denied = requireFinanceAccess(request); if (denied) return denied;
  const sheet = request.nextUrl.searchParams.get("sheet") ?? "";
  if (!Object.hasOwn(resources, sheet)) return NextResponse.json({ error: "Unsupported sheet" }, { status: 400 });
  return canonical.GET(request, { params: Promise.resolve({ resource: resources[sheet] }) });
}
export async function POST(request: NextRequest) {
  const denied = requireFinanceAccess(request); if (denied) return denied;
  let body; try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!body || !Object.hasOwn(resources, String(body.sheet))) return NextResponse.json({ error: "Unsupported sheet" }, { status: 400 });
  const action = body.action ?? "create";
  const method = action === "create" ? "POST" : action === "update" ? "PUT" : action === "delete" ? "DELETE" : "";
  if (!method) return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  const forwarded = new NextRequest(request.url, { method, headers: request.headers, body: JSON.stringify(body) });
  return canonical[method](forwarded, { params: Promise.resolve({ resource: resources[body.sheet] }) });
}
