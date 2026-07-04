import { NextRequest, NextResponse } from "next/server";
import {
  appendWorksheetRow,
  deleteWorksheetRow,
  ensureWorksheetExists,
  ensureWorksheetRowIds,
  GoogleSheetsApiError,
  hasServiceAccountConfig,
  readWorksheetCachedWithRetry,
  type SupportedSheet,
  updateWorksheetRow,
} from "../../../lib/googleSheetsServer";
import {
  refreshCashAccounts,
  refreshInvestmentPositions,
} from "../../../lib/investmentSyncServer";

const RESOURCE_CONFIG = {
  transactions: { resource: "transactions", sheetName: "transactions" },
  categories: { resource: "categories", sheetName: "categories" },
  recurring: { resource: "recurring", sheetName: "recurring_rules" },
  "investment-trades": {
    resource: "investment-trades",
    sheetName: "investment_trades",
  },
  "investment-positions": {
    resource: "investment-positions",
    sheetName: "investment_positions",
  },
  "fx-records": { resource: "fx-records", sheetName: "fx_records" },
  "dividend-records": {
    resource: "dividend-records",
    sheetName: "dividend_records",
  },
  "cash-accounts": { resource: "cash-accounts", sheetName: "cash_accounts" },
  "cash-ledger": { resource: "cash-ledger", sheetName: "cash_ledger" },
} as const satisfies Record<
  string,
  { resource: string; sheetName: SupportedSheet }
>;

type Resource = keyof typeof RESOURCE_CONFIG;
type Context = { params: Promise<{ resource: string }> };

function getSheet(resource: string) {
  if (!(resource in RESOURCE_CONFIG)) {
    throw new ApiError(`Unsupported Google Sheets resource: ${resource}`, 404);
  }
  return RESOURCE_CONFIG[resource as Resource].sheetName;
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

function shouldUseAppsScriptFallback() {
  return !hasServiceAccountConfig();
}

async function readSheetWithRetry(sheet: SupportedSheet) {
  await ensureWorksheetExists(sheet);
  if (sheet === "investment_trades") {
    await ensureWorksheetRowIds(sheet, "trade");
  }
  return readWorksheetCachedWithRetry(sheet);
}

function errorResponse(
  error: unknown,
  resource: string,
  sheetName: string,
  id = "",
) {
  const range = sheetName ? `${sheetName}!A:Z` : "";
  const errorMessage =
    error instanceof Error ? error.message : "Google Sheets request failed";
  const responseData =
    error instanceof GoogleSheetsApiError ? error.responseData : undefined;
  const status =
    error instanceof ApiError
      ? error.status
      : error instanceof GoogleSheetsApiError
        ? error.status
        : errorMessage.includes("was not found")
          ? 404
        : 500;

  console.error("Google Sheets API route failed", {
    resource,
    sheetName,
    id,
    range,
    message: errorMessage,
    responseData,
  });

  return NextResponse.json(
    { error: errorMessage, resource, sheetName, id, status, range },
    { status },
  );
}

export async function GET(_request: NextRequest, context: Context) {
  const { resource } = await context.params;
  let sheetName = "";
  try {
    const sheet = getSheet(resource);
    sheetName = sheet;
    if (shouldUseAppsScriptFallback()) {
      return appsScriptFallback("GET", sheet);
    }
    return NextResponse.json(await readSheetWithRetry(sheet));
  } catch (error) {
    return errorResponse(error, resource, sheetName);
  }
}

export async function POST(request: NextRequest, context: Context) {
  const { resource } = await context.params;
  let sheetName = "";
  try {
    const sheet = getSheet(resource);
    sheetName = sheet;
    const body = await requestBody(request);
    if (shouldUseAppsScriptFallback()) {
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
    return errorResponse(error, resource, sheetName);
  }
}

export async function PUT(request: NextRequest, context: Context) {
  const { resource } = await context.params;
  let sheetName = "";
  let recordId = "";
  try {
    const sheet = getSheet(resource);
    sheetName = sheet;
    const body = await requestBody(request);
    const id = requireId(body);
    recordId = id;
    if (shouldUseAppsScriptFallback()) {
      return appsScriptFallback("PUT", sheet, body);
    }
    await ensureWorksheetExists(sheet);
    const result = await updateWorksheetRow(sheet, id, body);
    const sync = await syncDerivedSheets(sheet);
    return NextResponse.json({ ...result, sync });
  } catch (error) {
    return errorResponse(error, resource, sheetName, recordId);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const { resource } = await context.params;
  let sheetName = "";
  let recordId = "";
  try {
    const sheet = getSheet(resource);
    sheetName = sheet;
    const body = await requestBody(request);
    const id = requireId(body);
    recordId = id;
    if (shouldUseAppsScriptFallback()) {
      return appsScriptFallback("DELETE", sheet, body);
    }
    await ensureWorksheetExists(sheet);
    const result = await deleteWorksheetRow(sheet, id);
    const sync = await syncDerivedSheets(sheet);
    return NextResponse.json({ ...result, sync });
  } catch (error) {
    return errorResponse(error, resource, sheetName, recordId);
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
