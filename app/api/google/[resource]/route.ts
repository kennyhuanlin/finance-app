import { NextRequest, NextResponse } from "next/server";
import {
  appendWorksheetRow,
  deleteWorksheetRow,
  ensureWorksheetExists,
  hasServiceAccountConfig,
  readWorksheet,
  type SupportedSheet,
  updateWorksheetRow,
} from "../../../lib/googleSheetsServer";
import {
  refreshCashAccounts,
  refreshInvestmentPositions,
} from "../../../lib/investmentSyncServer";

const resourceSheets = {
  transactions: "transactions",
  categories: "categories",
  recurring: "recurring",
  "investment-trades": "investment_trades",
  "fx-records": "fx_records",
  "dividend-records": "dividend_records",
  "investment-positions": "investment_positions",
  "cash-accounts": "cash_accounts",
  "cash-ledger": "cash_ledger",
} as const satisfies Record<string, SupportedSheet>;

type Resource = keyof typeof resourceSheets;
type Context = { params: Promise<{ resource: string }> };
const legacyFallbackSheets = new Set<SupportedSheet>([
  "transactions",
  "categories",
  "recurring",
]);

function getSheet(resource: string) {
  if (!(resource in resourceSheets)) {
    throw new ApiError(`Unsupported Google Sheets resource: ${resource}`, 404);
  }
  return resourceSheets[resource as Resource];
}

class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function requestBody(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  delete body.sheet;
  delete body.action;
  return body;
}

function requireId(body: Record<string, unknown>) {
  const id = String(body.id ?? "").trim();
  if (!id) {
    throw new ApiError("Missing record id", 400);
  }
  return id;
}

function appsScriptUrl() {
  const url = process.env.GOOGLE_SCRIPT_URL;
  if (!url) {
    throw new ApiError(
      "Service Account credentials are missing and GOOGLE_SCRIPT_URL fallback is not configured",
      500,
    );
  }
  return url;
}

async function appsScriptFallback(
  method: "GET" | "POST" | "PUT" | "DELETE",
  sheet: SupportedSheet,
  body?: Record<string, unknown>,
) {
  const url = appsScriptUrl();
  const response =
    method === "GET"
      ? await fetch(`${url}?sheet=${encodeURIComponent(sheet)}`, {
          cache: "no-store",
        })
      : await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sheet,
            action:
              method === "POST"
                ? "create"
                : method === "PUT"
                  ? "update"
                  : "delete",
            ...body,
          }),
          cache: "no-store",
        });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
}

function shouldUseAppsScriptFallback(sheet: SupportedSheet) {
  return !hasServiceAccountConfig() && legacyFallbackSheets.has(sheet);
}

function errorResponse(error: unknown) {
  const status = error instanceof ApiError ? error.status : 500;
  return NextResponse.json(
    { error: error instanceof Error ? error.message : "Google Sheets request failed" },
    { status },
  );
}

export async function GET(_request: NextRequest, context: Context) {
  try {
    const { resource } = await context.params;
    const sheet = getSheet(resource);
    if (shouldUseAppsScriptFallback(sheet)) {
      return appsScriptFallback("GET", sheet);
    }
    await ensureWorksheetExists(sheet);
    return NextResponse.json(await readWorksheet(sheet));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, context: Context) {
  try {
    const { resource } = await context.params;
    const sheet = getSheet(resource);
    const body = await requestBody(request);
    if (shouldUseAppsScriptFallback(sheet)) {
      return appsScriptFallback("POST", sheet, body);
    }
    await ensureWorksheetExists(sheet);
    if (sheet === "investment_positions") {
      const positions = await refreshInvestmentPositions();
      return NextResponse.json({ ok: true, positions });
    }

    await appendWorksheetRow(sheet, body);
    if (sheet === "cash_accounts" && Number(body.balance ?? 0) !== 0) {
      await appendWorksheetRow("cash_ledger", {
        id: `ledger-adjustment-${Date.now()}`,
        date: body.date,
        accountId: body.id,
        accountName: body.name,
        currency: body.currency,
        type: "adjustment",
        amount: Number(body.balance),
        relatedType: "adjustment",
        relatedId: body.id,
        note: "帳戶初始餘額",
        createdAt: new Date().toISOString(),
      });
    }
    const sync = await syncDerivedSheets(sheet);
    return NextResponse.json({ ok: true, id: body.id, sync }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    const { resource } = await context.params;
    const sheet = getSheet(resource);
    const body = await requestBody(request);
    const id = requireId(body);
    if (shouldUseAppsScriptFallback(sheet)) {
      return appsScriptFallback("PUT", sheet, body);
    }
    await ensureWorksheetExists(sheet);
    const result = await updateWorksheetRow(sheet, id, body);
    const sync = await syncDerivedSheets(sheet);
    return NextResponse.json({ ...result, sync });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  try {
    const { resource } = await context.params;
    const sheet = getSheet(resource);
    const body = await requestBody(request);
    const id = requireId(body);
    if (shouldUseAppsScriptFallback(sheet)) {
      return appsScriptFallback("DELETE", sheet, body);
    }
    await ensureWorksheetExists(sheet);
    const result = await deleteWorksheetRow(sheet, id);
    const sync = await syncDerivedSheets(sheet);
    return NextResponse.json({ ...result, sync });
  } catch (error) {
    return errorResponse(error);
  }
}

async function syncDerivedSheets(sheet: SupportedSheet) {
  const result: Record<string, unknown> = {};
  if (sheet === "investment_trades") {
    result.positions = await refreshInvestmentPositions();
  }
  if (
    sheet === "investment_trades" ||
    sheet === "fx_records" ||
    sheet === "dividend_records" ||
    sheet === "cash_accounts" ||
    sheet === "cash_ledger"
  ) {
    result.cash = await refreshCashAccounts();
  }
  return result;
}
