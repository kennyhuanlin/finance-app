import "server-only";

import {
  calculatePositions,
  normalizeDateOnly,
  type CashAccount,
  type CashLedger,
  type CashLedgerType,
  type Currency,
  type DividendRecord,
  type FxRecord,
  type InvestmentTrade,
} from "./investments";
import {
  readWorksheet,
  replaceWorksheetRows,
} from "./googleSheetsServer";

function number(value: unknown) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

function currency(value: unknown): Currency {
  return value === "USD" ? "USD" : "TWD";
}

function trade(row: Record<string, unknown>): InvestmentTrade {
  return {
    id: String(row.id ?? ""),
    date: normalizeDateOnly(row.date),
    market: row.market === "US" ? "US" : "TW",
    ticker: String(row.ticker ?? ""),
    name: String(row.name ?? ""),
    side: row.side === "sell" ? "sell" : "buy",
    quantity: number(row.quantity),
    price: number(row.price),
    fee: number(row.fee),
    tax: number(row.tax),
    currency: currency(row.currency),
    exchangeRate: number(row.exchangeRate),
    totalAmount: number(row.totalAmount),
    note: String(row.note ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function account(row: Record<string, unknown>): CashAccount {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    currency: currency(row.currency),
    balance: number(row.balance),
    note: String(row.note ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function ledger(row: Record<string, unknown>): CashLedger {
  return {
    id: String(row.id ?? ""),
    date: normalizeDateOnly(row.date),
    accountId: String(row.accountId ?? ""),
    accountName: String(row.accountName ?? ""),
    currency: currency(row.currency),
    type: String(row.type ?? "adjustment") as CashLedgerType,
    amount: number(row.amount),
    relatedType: String(row.relatedType ?? ""),
    relatedId: String(row.relatedId ?? ""),
    note: String(row.note ?? ""),
    createdAt: String(row.createdAt ?? ""),
  };
}

const generatedRelatedTypes = new Set([
  "investment_trade",
  "fx_record",
  "dividend_record",
]);

export async function refreshInvestmentPositions() {
  const trades = (await readWorksheet("investment_trades")).map(trade);
  const positions = calculatePositions(trades).map((position) => ({
    ...position,
    updatedAt: new Date().toISOString(),
  }));
  await replaceWorksheetRows("investment_positions", positions);
  return positions;
}

export async function refreshCashAccounts() {
  const [accountRows, ledgerRows, tradeRows, fxRows, dividendRows] =
    await Promise.all([
      readWorksheet("cash_accounts"),
      readWorksheet("cash_ledger"),
      readWorksheet("investment_trades"),
      readWorksheet("fx_records"),
      readWorksheet("dividend_records"),
    ]);
  const accounts = accountRows.map(account);
  const manualLedger = ledgerRows
    .map(ledger)
    .filter((item) => !generatedRelatedTypes.has(item.relatedType));
  const generated: CashLedger[] = [];
  const missingCurrencies = new Set<Currency>();
  const findAccount = (target: Currency) => {
    const found = accounts.find((item) => item.currency === target);
    if (!found) missingCurrencies.add(target);
    return found;
  };
  const add = (
    target: CashAccount | undefined,
    data: Omit<CashLedger, "accountId" | "accountName" | "currency">,
  ) => {
    if (!target) return;
    generated.push({
      ...data,
      accountId: target.id,
      accountName: target.name,
      currency: target.currency,
    });
  };

  tradeRows.map(trade).forEach((item) => {
    const target = findAccount(item.currency);
    add(target, {
      id: `ledger-trade-${item.id}`,
      date: item.date,
      type: item.side === "buy" ? "trade_buy" : "trade_sell",
      amount: item.totalAmount,
      relatedType: "investment_trade",
      relatedId: item.id,
      note: `${item.ticker} ${item.name} ${item.side === "buy" ? "買入" : "賣出"}`,
      createdAt: item.createdAt,
    });
  });
  fxRows.forEach((row) => {
    const item: FxRecord = {
      id: String(row.id ?? ""),
      date: normalizeDateOnly(row.date),
      fromCurrency: currency(row.fromCurrency),
      toCurrency: currency(row.toCurrency),
      fromAmount: number(row.fromAmount),
      toAmount: number(row.toAmount),
      exchangeRate: number(row.exchangeRate),
      fee: number(row.fee),
      note: String(row.note ?? ""),
      createdAt: String(row.createdAt ?? ""),
      updatedAt: String(row.updatedAt ?? ""),
    };
    add(findAccount(item.fromCurrency), {
      id: `ledger-fx-out-${item.id}`,
      date: item.date,
      type: "fx_out",
      amount: item.fromAmount + item.fee,
      relatedType: "fx_record",
      relatedId: item.id,
      note: `${item.fromCurrency} → ${item.toCurrency}`,
      createdAt: item.createdAt,
    });
    add(findAccount(item.toCurrency), {
      id: `ledger-fx-in-${item.id}`,
      date: item.date,
      type: "fx_in",
      amount: item.toAmount,
      relatedType: "fx_record",
      relatedId: item.id,
      note: `${item.fromCurrency} → ${item.toCurrency}`,
      createdAt: item.createdAt,
    });
  });
  dividendRows.forEach((row) => {
    const item = {
      id: String(row.id ?? ""),
      date: normalizeDateOnly(row.date),
      ticker: String(row.ticker ?? ""),
      amount: number(row.amount),
      tax: number(row.tax),
      currency: currency(row.currency),
      createdAt: String(row.createdAt ?? ""),
    } satisfies Pick<
      DividendRecord,
      "id" | "date" | "ticker" | "amount" | "tax" | "currency" | "createdAt"
    >;
    add(findAccount(item.currency), {
      id: `ledger-dividend-${item.id}`,
      date: item.date,
      type: "dividend",
      amount: Math.max(0, item.amount - item.tax),
      relatedType: "dividend_record",
      relatedId: item.id,
      note: `${item.ticker} 股息`,
      createdAt: item.createdAt,
    });
  });

  const allLedger = [...manualLedger, ...generated].sort((a, b) =>
    `${a.date}|${a.createdAt}|${a.id}`.localeCompare(
      `${b.date}|${b.createdAt}|${b.id}`,
    ),
  );
  const positive = new Set<CashLedgerType>([
    "deposit", "fx_in", "trade_sell", "dividend",
  ]);
  const negative = new Set<CashLedgerType>([
    "withdraw", "fx_out", "trade_buy",
  ]);
  const now = new Date().toISOString();
  const nextAccounts = accounts.map((item) => ({
    ...item,
    balance: allLedger
      .filter((entry) => entry.accountId === item.id)
      .reduce((sum, entry) => {
        if (positive.has(entry.type)) return sum + entry.amount;
        if (negative.has(entry.type)) return sum - entry.amount;
        return sum + entry.amount;
      }, 0),
    updatedAt: now,
  }));

  await replaceWorksheetRows("cash_ledger", allLedger);
  await replaceWorksheetRows("cash_accounts", nextAccounts);
  return {
    accounts: nextAccounts,
    ledger: allLedger,
    missingCurrencies: [...missingCurrencies],
  };
}
