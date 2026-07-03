import { NextResponse } from "next/server";
import {
  GoogleSheetsApiError,
  invalidateWorksheetCache,
  readWorksheetCachedWithRetry,
} from "../../../../lib/googleSheetsServer";
import { updateInvestmentPrices } from "../../../../lib/investmentPricesServer";

let priceUpdateRunning = false;

function errorResponse(error: unknown) {
  const status = error instanceof GoogleSheetsApiError ? error.status : 500;
  const message =
    error instanceof Error ? error.message : "Investment price request failed";
  return NextResponse.json(
    { error: message, resource: "investment_prices", status },
    { status },
  );
}

export async function GET() {
  try {
    const data = await readWorksheetCachedWithRetry("investment_prices");
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() {
  if (priceUpdateRunning) {
    return NextResponse.json(
      {
        error: "price update already running",
        resource: "investment_prices",
        status: 409,
      },
      { status: 409 },
    );
  }

  priceUpdateRunning = true;
  try {
    invalidateWorksheetCache("investment_positions", "investment_prices");
    const result = await updateInvestmentPrices();
    invalidateWorksheetCache("investment_prices");
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  } finally {
    priceUpdateRunning = false;
  }
}
