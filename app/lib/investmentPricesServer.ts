import "server-only";

import {
  readWorksheetCachedWithRetry,
  replaceWorksheetRows,
} from "./googleSheetsServer";
import { normalizeSymbol, type Currency, type Market } from "./investments";

export type InvestmentPrice = {
  symbol: string;
  market: Market;
  name: string;
  price: number;
  currency: Currency;
  price_date: string;
  source: "yahoo";
  updatedAt: string;
};

type PositionRow = Record<string, unknown>;

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        currency?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
      };
    }>;
    error?: { description?: string } | null;
  };
};

export function toYahooSymbol(symbol: string, market: Market) {
  const normalized = normalizeSymbol(symbol, market);
  return market === "TW" ? `${normalized}.TW` : normalized;
}

function marketOf(row: PositionRow): Market {
  return row.market === "US" ? "US" : "TW";
}

function originalSymbol(row: PositionRow) {
  return normalizeSymbol(
    String(row.symbol || row.ticker || ""),
    marketOf(row),
  );
}

function taipeiDate(timestampSeconds?: number) {
  const date = timestampSeconds
    ? new Date(timestampSeconds * 1000)
    : new Date();
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function taipeiIsoNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}+08:00`;
}

async function fetchYahooPrice(row: PositionRow): Promise<InvestmentPrice> {
  const market = marketOf(row);
  const symbol = originalSymbol(row);
  const yahooSymbol = toYahooSymbol(symbol, market);
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=5d`,
    {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 finance-app/1.0" },
    },
  );
  if (!response.ok) {
    throw new Error(`Yahoo Finance HTTP ${response.status}`);
  }
  const body = (await response.json()) as YahooChartResponse;
  const meta = body.chart?.result?.[0]?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(
      body.chart?.error?.description || "Yahoo Finance 沒有回傳有效價格",
    );
  }
  return {
    symbol,
    market,
    name: String(row.name ?? ""),
    price,
    currency: meta?.currency === "USD" ? "USD" : "TWD",
    price_date: taipeiDate(meta?.regularMarketTime),
    source: "yahoo",
    updatedAt: taipeiIsoNow(),
  };
}

export async function updateInvestmentPrices() {
  const [positions, currentPrices] = await Promise.all([
    readWorksheetCachedWithRetry("investment_positions"),
    readWorksheetCachedWithRetry("investment_prices"),
  ]);
  const heldPositions = positions.filter(
    (row) => Number(row.quantity ?? 0) > 0 && originalSymbol(row),
  );
  const results = await Promise.allSettled(heldPositions.map(fetchYahooPrice));
  const successful = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const failedSymbols = results.flatMap((result, index) =>
    result.status === "rejected"
      ? [originalSymbol(heldPositions[index])]
      : [],
  );
  const successfulSymbols = new Set(
    successful.map((price) => `${price.market}:${price.symbol}`),
  );
  const heldSymbols = new Set(
    heldPositions.map((row) => `${marketOf(row)}:${originalSymbol(row)}`),
  );
  const retained: InvestmentPrice[] = currentPrices.flatMap((row) => {
    const market = marketOf(row);
    const symbol = originalSymbol(row);
    const key = `${market}:${symbol}`;
    if (!heldSymbols.has(key) || successfulSymbols.has(key)) return [];
    return [{
      symbol,
      market,
      name: String(row.name ?? ""),
      price: Number(row.price ?? 0),
      currency: row.currency === "USD" ? "USD" : "TWD",
      price_date: String(row.price_date ?? ""),
      source: "yahoo",
      updatedAt: String(row.updatedAt ?? ""),
    }];
  });
  const prices = [...successful, ...retained].sort((a, b) =>
    `${a.market}:${a.symbol}`.localeCompare(`${b.market}:${b.symbol}`),
  );
  const write = await replaceWorksheetRows("investment_prices", prices);
  return {
    prices,
    updatedCount: successful.length,
    failedSymbols,
    changed: write.changed,
  };
}
