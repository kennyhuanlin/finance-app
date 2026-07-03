import { NextResponse } from "next/server";
import {
  GoogleSheetsApiError,
  invalidateWorksheetCache,
} from "../../../../lib/googleSheetsServer";
import {
  refreshCashAccounts,
  refreshInvestmentPositions,
} from "../../../../lib/investmentSyncServer";

export async function POST() {
  const resources = [
    "investment_trades",
    "investment_positions",
    "fx_records",
    "dividend_records",
    "cash_accounts",
    "cash_ledger",
  ] as const;

  try {
    invalidateWorksheetCache(...resources);
    const positions = await refreshInvestmentPositions();
    const cash = await refreshCashAccounts();
    invalidateWorksheetCache("investment_positions", "cash_accounts", "cash_ledger");

    return NextResponse.json({
      ok: true,
      message: "庫存已重新同步",
      positions: positions.length,
      cashAccounts: cash.accounts.length,
      cashLedger: cash.ledger.length,
    });
  } catch (error) {
    const status = error instanceof GoogleSheetsApiError ? error.status : 500;
    const message =
      error instanceof Error ? error.message : "Investment sync failed";
    console.error("Investment sync failed", {
      resource: "investments",
      status,
      message,
      responseData:
        error instanceof GoogleSheetsApiError ? error.responseData : undefined,
    });
    return NextResponse.json(
      { error: message, resource: "investments", status },
      { status },
    );
  }
}
