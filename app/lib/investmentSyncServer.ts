import "server-only";

import {
  calculatePositions,
  normalizeDateOnly,
  type CashAccount,
  type CashLedger,
  type CashLedgerType,
  type Currency,
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

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== "" && value !== null && value !== undefined);
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
    name: String(firstValue(row.account, row.name) ?? ""),
    currency: currency(row.currency),
    balance: number(row.balance),
    note: String(row.note ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}

function ledger(row: Record<string, unknown>): CashLedger {
  const sourceType = String(row.sourceType ?? "");
  const relatedType =
    String(row.relatedType ?? "") ||
    (sourceType === "dividend"
      ? "dividend_record"
      : sourceType === "trade"
        ? "investment_trade"
        : sourceType === "fx"
          ? "fx_record"
          : sourceType);
  return {
    id: String(row.id ?? ""),
    date: normalizeDateOnly(row.date),
    accountId: String(row.accountId ?? ""),
    accountName: String(firstValue(row.account, row.accountName) ?? ""),
    currency: currency(row.currency),
    type: String(row.type ?? "adjustment") as CashLedgerType,
    amount: number(row.amount),
    relatedType,
    relatedId: String(firstValue(row.sourceId, row.relatedId) ?? ""),
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
  const dividends = dividendRows.map((row) => {
    const grossAmount = number(firstValue(row.grossAmount, row.amount));
    const tax = number(row.tax);
    const fee = number(row.fee);
    return {
      id: String(row.id ?? ""),
      date: normalizeDateOnly(row.date),
      account: String(row.account ?? "").trim(),
      symbol: String(firstValue(row.symbol, row.ticker) ?? ""),
      name: String(row.name ?? ""),
      currency: currency(row.currency),
      netAmount:
        number(row.netAmount) || Math.max(0, grossAmount - tax - fee),
      createdAt: String(row.createdAt ?? ""),
    };
  });
  dividends.forEach((item) => {
    const accountName = item.account || `${item.currency} 現金帳戶`;
    if (
      !accounts.some(
        (candidate) =>
          candidate.currency === item.currency && candidate.name === accountName,
      )
    ) {
      const safeName =
        accountName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, "-") || "cash";
      accounts.push({
        id: `cash-${item.currency}-${safeName}`,
        name: accountName,
        currency: item.currency,
        balance: 0,
        note: "股息自動建立",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });
  const manualLedger = ledgerRows
    .map(ledger)
    .filter((item) => !generatedRelatedTypes.has(item.relatedType));
  const generated: CashLedger[] = [];
  const missingCurrencies = new Set<Currency>();
  const findAccount = (target: Currency, preferredName = "") => {
    const found =
      accounts.find(
        (item) =>
          item.currency === target &&
          preferredName !== "" &&
          item.name === preferredName,
      ) ?? accounts.find((item) => item.currency === target);
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
      account: target.name,
      currency: target.currency,
      sourceType:
        data.relatedType === "dividend_record"
          ? "dividend"
          : data.relatedType === "investment_trade"
            ? "trade"
            : data.relatedType === "fx_record"
              ? "fx"
              : data.relatedType,
      sourceId: data.relatedId,
      updatedAt: new Date().toISOString(),
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
  dividends.forEach((item) => {
    add(findAccount(item.currency, item.account), {
      id: `ledger-dividend-${item.id}`,
      date: item.date,
      type: "dividend",
      amount: item.netAmount,
      relatedType: "dividend_record",
      relatedId: item.id,
      note: `股息：${item.symbol} ${item.name}`.trim(),
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
    account: item.name,
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
