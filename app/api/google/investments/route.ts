import { NextResponse } from "next/server";
import {
  ensureWorksheetRowIds,
  GoogleSheetsApiError,
  readWorksheetsCachedWithRetry,
  type SupportedSheet,
} from "../../../lib/googleSheetsServer";

const INVESTMENT_SHEETS = [
  "investment_trades",
  "investment_positions",
  "fx_records",
  "dividend_records",
  "cash_accounts",
  "cash_ledger",
] as const satisfies readonly SupportedSheet[];

export async function GET() {
  try {
    await ensureWorksheetRowIds("investment_trades", "trade");
    const data = await readWorksheetsCachedWithRetry([...INVESTMENT_SHEETS]);
    return NextResponse.json({ data, errors: {} });
  } catch (error) {
    const status = error instanceof GoogleSheetsApiError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : "Investment data read failed";
    const errors = Object.fromEntries(
      INVESTMENT_SHEETS.map((resource) => [
        resource,
        { resource, status, message },
      ]),
    );
    console.error("Combined investment sheets read failed", {
      resources: INVESTMENT_SHEETS,
      status,
      message,
      responseData:
        error instanceof GoogleSheetsApiError ? error.responseData : undefined,
    });
    return NextResponse.json({
      data: Object.fromEntries(
        INVESTMENT_SHEETS.map((resource) => [resource, []]),
      ),
      errors,
    });
  }
}
