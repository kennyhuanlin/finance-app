"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  calculatePositions,
  calculateTradeTotal,
  type CashAccount,
  type CashLedger,
  type Currency,
  type DividendRecord,
  type FxRecord,
  formatExchangeRate,
  formatInvestmentMoney,
  getExchangeRateDisplay,
  getSymbolName,
  type InvestmentTrade,
  type InvestmentPosition,
  localDateKey,
  type Market,
  normalizeSymbol,
  type TradeSide,
} from "../lib/investments";
import {
  createDividendRecord,
  createCashAccount,
  createCashLedger,
  createFxRecord,
  createInvestmentTrade,
  deleteDividendRecord,
  deleteFxRecord,
  deleteInvestmentTrade,
  deleteCashAccount,
  getInvestmentBundle,
  InvestmentSyncError,
  SheetRequestError,
  syncInvestments,
  updateCashAccount,
  updateDividendRecord,
  updateFxRecord,
  updateInvestmentTrade,
} from "../lib/googleSheets";

type Tab = "overview" | "trades" | "positions" | "cash" | "fx" | "dividends";
type Editor = "trade" | "fx" | "dividend" | "account" | "adjustment" | null;
type InvestmentResource =
  | "investment_trades"
  | "investment_positions"
  | "fx_records"
  | "dividend_records"
  | "cash_accounts"
  | "cash_ledger";
type ResourceErrorInfo = {
  resource: InvestmentResource;
  status: number;
  message: string;
};
const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "總覽" },
  { id: "trades", label: "買賣紀錄" },
  { id: "positions", label: "庫存" },
  { id: "cash", label: "現金" },
  { id: "fx", label: "換匯" },
  { id: "dividends", label: "股息" },
];

type TradeForm = Omit<InvestmentTrade, "quantity" | "price" | "fee" | "tax" | "exchangeRate" | "totalAmount"> & {
  quantity: string; price: string; fee: string; tax: string; exchangeRate: string;
};
type FxForm = Omit<FxRecord, "fromAmount" | "toAmount" | "exchangeRate" | "fee"> & {
  fromAmount: string; toAmount: string; exchangeRate: string; fee: string;
};
type DividendForm = Omit<DividendRecord, "grossAmount" | "amount" | "tax" | "fee" | "netAmount" | "exchangeRate" | "amountTwd"> & {
  grossAmount: string; amount: string; tax: string; fee: string;
  netAmount: string; exchangeRate: string; amountTwd: string;
};
type AccountForm = {
  id: string; name: string; currency: Currency; balance: string;
  originalBalance: number; note: string; createdAt?: string;
};
type AdjustmentForm = {
  date: string; accountId: string; amount: string; note: string;
};

const nowIso = () => new Date().toISOString();
const emptyTrade = (): TradeForm => ({
  id: "", date: localDateKey(), market: "TW", symbol: "", ticker: "", name: "", side: "buy",
  type: "trade", quantity: "", unit: "lot", price: "", fee: "0", tax: "0", currency: "TWD",
  exchangeRate: "1", note: "", createdAt: "", updatedAt: "",
});
const emptyFx = (): FxForm => ({
  id: "", date: localDateKey(), fromCurrency: "TWD", toCurrency: "USD",
  fromAmount: "", toAmount: "", exchangeRate: "", fee: "0", note: "",
  createdAt: "", updatedAt: "",
});
const emptyDividend = (): DividendForm => ({
  id: "", date: localDateKey(), market: "TW", broker: "", account: "",
  symbol: "", ticker: "", name: "", grossAmount: "", amount: "", tax: "0",
  fee: "0", netAmount: "", currency: "TWD", exchangeRate: "1",
  amountTwd: "", note: "", createdAt: "", updatedAt: "",
});
const emptyAccount = (): AccountForm => ({
  id: "", name: "", currency: "TWD", balance: "0", originalBalance: 0,
  note: "",
});
const emptyAdjustment = (): AdjustmentForm => ({
  date: localDateKey(), accountId: "", amount: "", note: "",
});

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function normalizeTrade(row: Record<string, unknown>): InvestmentTrade {
  const market = row.market === "US" ? "US" : "TW";
  const symbol = normalizeSymbol(String(row.symbol || row.ticker || ""), market);
  return {
    id: String(row.id ?? ""), date: String(row.tradeDate || row.date || ""),
    tradeDate: String(row.tradeDate || row.date || ""), market, symbol,
    ticker: symbol, name: String(row.name ?? ""), type: String(row.type ?? ""),
    side: row.side === "sell" ? "sell" : "buy", quantity: number(row.quantity),
    unit: String(row.unit ?? ""), price: number(row.price), fee: number(row.fee), tax: number(row.tax),
    currency: row.currency === "USD" ? "USD" : "TWD", exchangeRate: number(row.exchangeRate),
    totalAmount: number(row.totalAmount), note: String(row.note ?? ""),
    createdAt: String(row.createdAt ?? ""), updatedAt: String(row.updatedAt ?? ""),
  };
}
function normalizeFx(row: Record<string, unknown>): FxRecord {
  return {
    id: String(row.id ?? ""), date: String(row.date ?? ""),
    fromCurrency: row.fromCurrency === "USD" ? "USD" : "TWD",
    toCurrency: row.toCurrency === "TWD" ? "TWD" : "USD",
    fromAmount: number(row.fromAmount), toAmount: number(row.toAmount),
    exchangeRate: number(row.exchangeRate), fee: number(row.fee), note: String(row.note ?? ""),
    createdAt: String(row.createdAt ?? ""), updatedAt: String(row.updatedAt ?? ""),
  };
}
function normalizeDividend(row: Record<string, unknown>): DividendRecord {
  const grossAmount = number(row.grossAmount || row.amount);
  const tax = number(row.tax);
  const fee = number(row.fee);
  const netAmount = number(row.netAmount) || Math.max(0, grossAmount - tax - fee);
  const symbol = String(row.symbol || row.ticker || "");
  return {
    id: String(row.id ?? ""), date: String(row.payDate || row.date || ""),
    payDate: String(row.payDate || row.date || ""),
    market: row.market === "US" ? "US" : "TW",
    broker: String(row.broker ?? ""), account: String(row.account ?? ""), symbol,
    ticker: symbol, name: String(row.name ?? ""), grossAmount, amount: grossAmount,
    tax, fee, netAmount, currency: row.currency === "USD" ? "USD" : "TWD",
    exchangeRate: number(row.exchangeRate), amountTwd: number(row.amountTwd),
    note: String(row.note ?? ""), createdAt: String(row.createdAt ?? ""), updatedAt: String(row.updatedAt ?? ""),
  };
}
function normalizePosition(row: Record<string, unknown>): InvestmentPosition {
  return {
    market: row.market === "US" ? "US" : "TW", ticker: String(row.ticker ?? ""),
    name: String(row.name ?? ""), quantity: number(row.quantity),
    averageCost: number(row.averageCost), totalCost: number(row.totalCost),
    currency: row.currency === "USD" ? "USD" : "TWD",
    updatedAt: String(row.updatedAt ?? ""),
  };
}
function normalizeAccount(row: Record<string, unknown>): CashAccount {
  return {
    id: String(row.id ?? ""), name: String(row.name ?? ""),
    currency: row.currency === "USD" ? "USD" : "TWD",
    balance: number(row.balance), note: String(row.note ?? ""),
    createdAt: String(row.createdAt ?? ""),
    updatedAt: String(row.updatedAt ?? ""),
  };
}
function normalizeLedger(row: Record<string, unknown>): CashLedger {
  return {
    id: String(row.id ?? ""), date: String(row.date ?? ""),
    accountId: String(row.accountId ?? ""), accountName: String(row.accountName ?? ""),
    currency: row.currency === "USD" ? "USD" : "TWD",
    type: String(row.type ?? "adjustment") as CashLedger["type"],
    amount: number(row.amount), relatedType: String(row.relatedType ?? ""),
    relatedId: String(row.relatedId ?? ""), note: String(row.note ?? ""),
    createdAt: String(row.createdAt ?? ""),
  };
}

export default function InvestmentsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [trades, setTrades] = useState<InvestmentTrade[]>([]);
  const [positionSnapshots, setPositionSnapshots] = useState<InvestmentPosition[]>([]);
  const [fxRecords, setFxRecords] = useState<FxRecord[]>([]);
  const [dividends, setDividends] = useState<DividendRecord[]>([]);
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [cashLedger, setCashLedger] = useState<CashLedger[]>([]);
  const [editor, setEditor] = useState<Editor>(null);
  const [tradeForm, setTradeForm] = useState(emptyTrade);
  const [editingTradeId, setEditingTradeId] = useState<string | null>(null);
  const [fxForm, setFxForm] = useState(emptyFx);
  const [dividendForm, setDividendForm] = useState(emptyDividend);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [adjustmentForm, setAdjustmentForm] = useState(emptyAdjustment);
  const [message, setMessage] = useState("正在讀取投資資料…");
  const [saving, setSaving] = useState(false);
  const [fxRateManual, setFxRateManual] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [fxRateDisplay, setFxRateDisplay] = useState("");
  const [resourceErrors, setResourceErrors] = useState<
    Partial<Record<InvestmentResource, ResourceErrorInfo>>
  >({});
  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  async function load(force = false) {
    if (isLoadingRef.current || (hasLoadedRef.current && !force)) return;
    isLoadingRef.current = true;
    try {
      const bundle = await getInvestmentBundle(force);
      setTrades(bundle.data.investment_trades.map(normalizeTrade));
      setPositionSnapshots(
        bundle.data.investment_positions.map(normalizePosition),
      );
      setFxRecords(bundle.data.fx_records.map(normalizeFx));
      setDividends(bundle.data.dividend_records.map(normalizeDividend));
      setCashAccounts(bundle.data.cash_accounts.map(normalizeAccount));
      setCashLedger(bundle.data.cash_ledger.map(normalizeLedger));
      setResourceErrors(bundle.errors);
      hasLoadedRef.current = true;
    } finally {
      isLoadingRef.current = false;
    }
  }
  useEffect(() => {
    if (hasLoadedRef.current || isLoadingRef.current) return;
    const request = Promise.resolve().then(() => load());
    request
      .then(() => setMessage(""))
      .catch((error) =>
        setMessage(error instanceof Error ? error.message : "投資資料讀取失敗"),
      );
  }, []);

  const calculatedPositions = useMemo(() => calculatePositions(trades), [trades]);
  const positions = positionSnapshots.length ? positionSnapshots : calculatedPositions;
  const twCost = positions.filter((p) => p.market === "TW").reduce((sum, p) => sum + p.totalCost, 0);
  const usCost = positions.filter((p) => p.market === "US").reduce((sum, p) => sum + p.totalCost, 0);
  const dividendTwd = dividends.reduce((sum, item) => sum + item.amountTwd, 0);
  const twdCash = cashAccounts.filter((item) => item.currency === "TWD").reduce((sum, item) => sum + item.balance, 0);
  const usdCash = cashAccounts.filter((item) => item.currency === "USD").reduce((sum, item) => sum + item.balance, 0);
  const latestUsdTwdRate = fxRecords
    .slice()
    .sort((a, b) => `${b.date}|${b.updatedAt}`.localeCompare(`${a.date}|${a.updatedAt}`))
    .map((item) =>
      getExchangeRateDisplay(
        item.fromCurrency,
        item.toCurrency,
        item.exchangeRate ||
          item.toAmount / Math.max(item.fromAmount, 1),
      ),
    )
    .find((rate) => rate > 0) ?? 1;
  const investmentCostTwd = twCost + usCost * latestUsdTwdRate;
  const estimatedAssets = twdCash + usdCash * latestUsdTwdRate + investmentCostTwd;

  function openTrade(item?: InvestmentTrade) {
    setTradeForm(item ? { ...item, quantity: String(item.quantity), price: String(item.price), fee: String(item.fee), tax: String(item.tax), exchangeRate: String(item.exchangeRate) } : emptyTrade());
    setEditingTradeId(item?.id || null);
    setEditor("trade");
  }
  function openFx(item?: FxRecord) {
    setFxForm(item ? { ...item, fromAmount: String(item.fromAmount), toAmount: String(item.toAmount), exchangeRate: String(item.exchangeRate), fee: String(item.fee) } : emptyFx());
    setFxRateDisplay(
      item
        ? getExchangeRateDisplay(
            item.fromCurrency,
            item.toCurrency,
            item.exchangeRate,
          ).toFixed(4)
        : "",
    );
    setFxRateManual(false);
    setEditor("fx");
  }
  function openDividend(item?: DividendRecord) {
    setDividendForm(item ? {
      ...item,
      grossAmount: String(item.grossAmount), amount: String(item.amount),
      tax: String(item.tax), fee: String(item.fee), netAmount: String(item.netAmount),
      exchangeRate: String(item.exchangeRate), amountTwd: String(item.amountTwd),
    } : emptyDividend());
    setEditor("dividend");
  }
  function updateTradeSymbol(value: string) {
    const symbol = value.toUpperCase();
    const normalizedSymbol = normalizeSymbol(symbol, tradeForm.market);
    setTradeForm((current) => ({
      ...current,
      symbol,
      ticker: symbol,
      name: current.name || getSymbolName(normalizedSymbol, current.market),
    }));
  }
  function finalizeTradeSymbol() {
    setTradeForm((current) => {
      const symbol = normalizeSymbol(
        current.symbol || current.ticker,
        current.market,
      );
      return {
        ...current,
        symbol,
        ticker: symbol,
        name: current.name || getSymbolName(symbol, current.market),
      };
    });
  }
  function updateDividendSymbol(value: string) {
    const symbol = value.toUpperCase();
    const normalizedSymbol = normalizeSymbol(symbol, dividendForm.market);
    setDividendForm((current) => ({
      ...current,
      symbol,
      ticker: symbol,
      name: current.name || getSymbolName(normalizedSymbol, current.market),
    }));
  }
  function finalizeDividendSymbol() {
    setDividendForm((current) => {
      const symbol = normalizeSymbol(current.symbol, current.market);
      return {
        ...current,
        symbol,
        ticker: symbol,
        name: current.name || getSymbolName(symbol, current.market),
      };
    });
  }
  function updateFxAmount(
    key: "fromAmount" | "toAmount",
    value: string,
  ) {
    const next = { ...fxForm, [key]: value };
    if (
      !fxRateManual &&
      next.fromAmount !== "" &&
      next.toAmount !== "" &&
      number(next.fromAmount) > 0
    ) {
      next.exchangeRate = (
        number(next.toAmount) / number(next.fromAmount)
      ).toFixed(8);
      setFxRateDisplay(
        getExchangeRateDisplay(
          next.fromCurrency,
          next.toCurrency,
          number(next.exchangeRate),
        ).toFixed(4),
      );
    } else if (
      !fxRateManual &&
      (next.fromAmount === "" || next.toAmount === "")
    ) {
      next.exchangeRate = "";
      setFxRateDisplay("");
    }
    setFxForm(next);
  }
  function updateFxDisplayRate(value: string) {
    setFxRateManual(true);
    setFxRateDisplay(value);
    const displayRate = number(value);
    const storedRate =
      fxForm.fromCurrency === "TWD" && fxForm.toCurrency === "USD"
        ? displayRate > 0
          ? 1 / displayRate
          : 0
        : displayRate;
    setFxForm({
      ...fxForm,
      exchangeRate: value === "" ? "" : storedRate.toFixed(8),
    });
  }
  function updateFxDirection(fromCurrency: Currency, toCurrency: Currency) {
    let storedRate = number(fxForm.exchangeRate);
    if (
      !fxRateManual &&
      number(fxForm.fromAmount) > 0 &&
      fxForm.toAmount !== ""
    ) {
      storedRate =
        number(fxForm.toAmount) / number(fxForm.fromAmount);
    } else if (fxRateManual && number(fxRateDisplay) > 0) {
      storedRate =
        fromCurrency === "TWD" && toCurrency === "USD"
          ? 1 / number(fxRateDisplay)
          : number(fxRateDisplay);
    }
    setFxForm({
      ...fxForm,
      fromCurrency,
      toCurrency,
      exchangeRate: storedRate > 0 ? storedRate.toFixed(8) : "",
    });
    setFxRateDisplay(
      storedRate > 0
        ? getExchangeRateDisplay(
            fromCurrency,
            toCurrency,
            storedRate,
          ).toFixed(4)
        : "",
    );
  }
  function openAccount(currency: Currency = "TWD", item?: CashAccount) {
    setAccountForm(
      item
        ? {
            id: item.id,
            name: item.name,
            currency: item.currency,
            balance: String(item.balance),
            originalBalance: item.balance,
            note: item.note,
            createdAt: item.createdAt,
          }
        : { ...emptyAccount(), currency },
    );
    setEditor("account");
  }
  function openAdjustment(account?: CashAccount) {
    setAdjustmentForm({
      ...emptyAdjustment(),
      accountId: account?.id ?? cashAccounts[0]?.id ?? "",
    });
    setEditor("adjustment");
  }

  async function saveTrade(event: React.FormEvent) {
    event.preventDefault(); setSaving(true);
    const stamp = nowIso();
    const tradeId = editingTradeId || `trade-${Date.now()}`;
    const payload: InvestmentTrade = {
      ...tradeForm,
      tradeDate: tradeForm.date,
      symbol: normalizeSymbol(
        tradeForm.symbol || tradeForm.ticker,
        tradeForm.market,
      ),
      ticker: normalizeSymbol(
        tradeForm.symbol || tradeForm.ticker,
        tradeForm.market,
      ),
      name: tradeForm.name.trim(),
      quantity: number(tradeForm.quantity), price: number(tradeForm.price), fee: number(tradeForm.fee),
      tax: number(tradeForm.tax), exchangeRate: number(tradeForm.exchangeRate),
      totalAmount: calculateTradeTotal(tradeForm.market, tradeForm.side, number(tradeForm.quantity), number(tradeForm.price), number(tradeForm.fee), number(tradeForm.tax)),
      id: tradeId, createdAt: tradeForm.createdAt || stamp, updatedAt: stamp,
    };
    try {
      if (editingTradeId) await updateInvestmentTrade(editingTradeId, payload);
      else await createInvestmentTrade(payload);
      await load(true);
      setEditingTradeId(null);
      setEditor(null);
      setMessage(editingTradeId ? "交易已更新" : "交易已新增");
    } catch (error) {
      const status = error instanceof SheetRequestError ? error.status : 0;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown request error";
      console.error("Investment trade save failed", {
        resource: "investment_trades",
        id: tradeId,
        status,
        message: errorMessage,
        error,
      });
      setMessage(
        `investment_trades · status ${status || "unknown"} · ${errorMessage}`,
      );
    } finally { setSaving(false); }
  }
  async function saveFx(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); const stamp = nowIso();
    const payload: FxRecord = { ...fxForm, fromAmount: number(fxForm.fromAmount), toAmount: number(fxForm.toAmount), exchangeRate: number(fxForm.exchangeRate), fee: number(fxForm.fee), id: fxForm.id || `fx-${Date.now()}`, createdAt: fxForm.createdAt || stamp, updatedAt: stamp };
    try {
      if (fxForm.id) await updateFxRecord(fxForm.id, payload); else await createFxRecord(payload);
      await load(true); setEditor(null); setMessage("換匯紀錄已儲存");
    } catch { setMessage("換匯紀錄儲存失敗"); } finally { setSaving(false); }
  }
  async function saveDividend(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); const stamp = nowIso();
    const symbol = normalizeSymbol(
      dividendForm.symbol || dividendForm.ticker,
      dividendForm.market,
    );
    const grossAmount = number(dividendForm.grossAmount || dividendForm.amount);
    const tax = number(dividendForm.tax);
    const fee = number(dividendForm.fee);
    const netAmount = Math.max(0, number(dividendForm.netAmount) || grossAmount - tax - fee);
    const payload: DividendRecord = {
      ...dividendForm, symbol, ticker: symbol, name: dividendForm.name.trim(),
      payDate: dividendForm.date,
      grossAmount, amount: grossAmount, tax, fee, netAmount,
      exchangeRate: number(dividendForm.exchangeRate),
      amountTwd: number(dividendForm.amountTwd),
      id: dividendForm.id || `dividend-${Date.now()}`,
      createdAt: dividendForm.createdAt || stamp, updatedAt: stamp,
    };
    try {
      if (dividendForm.id) await updateDividendRecord(dividendForm.id, payload); else await createDividendRecord(payload);
      await load(true); setEditor(null); setMessage("股息已儲存");
    } catch { setMessage("股息儲存失敗"); } finally { setSaving(false); }
  }
  async function saveAccount(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); const stamp = nowIso();
    try {
      const desiredBalance = number(accountForm.balance);
      if (accountForm.id) {
        await updateCashAccount(accountForm.id, {
          id: accountForm.id,
          account: accountForm.name.trim(),
          name: accountForm.name.trim(),
          currency: accountForm.currency,
          balance: accountForm.originalBalance,
          note: accountForm.note.trim(),
          createdAt: accountForm.createdAt ?? "",
          updatedAt: stamp,
        });
        const difference = desiredBalance - accountForm.originalBalance;
        if (difference !== 0) {
          await createCashLedger({
            id: `ledger-adjustment-${Date.now()}`,
            date: localDateKey(),
            accountId: accountForm.id,
            accountName: accountForm.name.trim(),
            account: accountForm.name.trim(),
            currency: accountForm.currency,
            type: "adjustment",
            amount: difference,
            relatedType: "adjustment",
            sourceType: "adjustment",
            relatedId: accountForm.id,
            sourceId: accountForm.id,
            note: "編輯帳戶餘額",
            createdAt: stamp,
            updatedAt: stamp,
          });
        }
      } else {
        await createCashAccount({
          id: `cash-${Date.now()}`, account: accountForm.name.trim(),
          name: accountForm.name.trim(), currency: accountForm.currency,
          balance: desiredBalance, date: localDateKey(),
          note: accountForm.note.trim(), createdAt: stamp, updatedAt: stamp,
        });
      }
      await load(true); setEditor(null);
      setMessage(accountForm.id ? "現金帳戶已更新" : "現金帳戶已建立");
    } catch { setMessage("現金帳戶儲存失敗"); } finally { setSaving(false); }
  }
  async function saveAdjustment(event: React.FormEvent) {
    event.preventDefault();
    const account = cashAccounts.find((item) => item.id === adjustmentForm.accountId);
    if (!account) {
      setMessage("請先建立對應幣別現金帳戶");
      return;
    }
    setSaving(true); const stamp = nowIso();
    try {
      await createCashLedger({
        id: `ledger-adjustment-${Date.now()}`, date: adjustmentForm.date,
        accountId: account.id, accountName: account.name,
        currency: account.currency, type: "adjustment",
        amount: number(adjustmentForm.amount), relatedType: "adjustment",
        relatedId: account.id, note: adjustmentForm.note.trim() || "手動調整",
        createdAt: stamp,
      });
      await load(true); setEditor(null); setMessage("現金餘額已調整");
    } catch { setMessage("現金餘額調整失敗"); } finally { setSaving(false); }
  }
  async function remove(kind: Exclude<Editor, null>, id: string) {
    if (!window.confirm("確定要刪除這筆紀錄嗎？")) return;
    try {
      if (kind === "trade") await deleteInvestmentTrade(id);
      if (kind === "fx") await deleteFxRecord(id);
      if (kind === "dividend") await deleteDividendRecord(id);
      if (kind === "account") await deleteCashAccount(id);
      await load(true); setMessage("紀錄已刪除");
    } catch { setMessage("刪除失敗"); }
  }

  async function handleSyncInvestments() {
    if (isSyncing) return;
    setIsSyncing(true);
    setMessage("同步中...");
    try {
      await syncInvestments();
      await load(true);
      setMessage("庫存已重新同步");
    } catch (error) {
      const resource =
        error instanceof InvestmentSyncError ? error.resource : "investments";
      const status =
        error instanceof InvestmentSyncError ? error.status : 0;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown sync error";
      console.error("Investment sync failed", {
        resource,
        status,
        message: errorMessage,
        error,
      });
      setMessage(
        `同步失敗 · ${resource} · status ${status || "unknown"} · ${errorMessage}`,
      );
    } finally {
      setIsSyncing(false);
    }
  }

  const card = "rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl";
  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-indigo-500">Investment journal</p>
            <h1 className="mt-1 text-3xl font-semibold">投資記帳</h1>
            <p className="mt-2 text-sm text-slate-500">台股、美股、換匯與股息集中管理</p>
          </div>
          <button
            type="button"
            onClick={handleSyncInvestments}
            disabled={isSyncing}
            className="rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-100 disabled:bg-slate-300 disabled:shadow-none"
          >
            {isSyncing ? "同步中..." : "重新同步庫存"}
          </button>
        </header>
        {message ? <p className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">{message}</p> : null}
        {tab === "overview" && Object.keys(resourceErrors).length ? (
          <div className="grid gap-2">
            {Object.values(resourceErrors).map((error) =>
              error ? <ResourceError key={error.resource} error={error} /> : null,
            )}
          </div>
        ) : null}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${tab === item.id ? "bg-slate-950 text-white" : "bg-white text-slate-500"}`}>{item.label}</button>)}
        </div>

        {tab === "overview" ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {[
            ["台幣現金", formatInvestmentMoney(twdCash, "TWD")],
            ["美元現金", formatInvestmentMoney(usdCash, "USD")],
            ["台股成本", formatInvestmentMoney(twCost, "TWD")],
            ["美股成本", formatInvestmentMoney(usCost, "USD")],
            ["投資總成本", formatInvestmentMoney(investmentCostTwd, "TWD")],
            ["累計股息", formatInvestmentMoney(dividendTwd, "TWD")],
            ["投資帳戶總資產估算", formatInvestmentMoney(estimatedAssets, "TWD")],
          ].map(([label, value]) => <article key={label} className={card}><p className="text-xs font-medium text-slate-500">{label}</p><p className="mt-3 text-xl font-semibold">{value}</p></article>)}
          <p className="col-span-2 px-1 text-xs text-slate-400 lg:col-span-3">美元換算匯率：1 USD = {latestUsdTwdRate.toFixed(4)} TWD；股票資產暫以持有成本估算。</p>
        </div> : null}

        {tab === "trades" ? <RecordSection title="買賣紀錄" action={() => openTrade()} error={resourceErrors.investment_trades}>
          {trades.slice().sort((a,b) => b.date.localeCompare(a.date)).map((item) => <RecordRow key={item.id} title={`${item.symbol} ${item.name}`} meta={`${item.date} · ${item.market} · ${item.side === "buy" ? "買入" : "賣出"} ${item.quantity} ${item.market === "TW" ? "張" : "股"}`} amount={`${item.side === "buy" ? "-" : "+"}${formatInvestmentMoney(item.totalAmount, item.currency)}`} onEdit={() => openTrade(item)} onDelete={() => remove("trade", item.id)} />)}
        </RecordSection> : null}

        {tab === "positions" ? <section className={card}><h2 className="text-xl font-semibold">庫存持股</h2><ResourceError error={resourceErrors.investment_positions}/><div className="mt-3 divide-y divide-slate-100">
          {positions.length ? positions.map((item) => <div key={`${item.market}-${item.ticker}`} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]"><div><p className="font-semibold">{item.ticker} <span className="font-normal text-slate-500">{item.name}</span></p><p className="mt-1 text-xs text-slate-400">{item.market} · {item.quantity} 股 · 均價 {formatInvestmentMoney(item.averageCost, item.currency)}</p></div><p className="font-semibold">{formatInvestmentMoney(item.totalCost, item.currency)}</p></div>) : <Empty />}
        </div></section> : null}

        {tab === "cash" ? <section className="grid gap-4">
          <ResourceError error={resourceErrors.cash_accounts}/>
          <ResourceError error={resourceErrors.cash_ledger}/>
          {(["TWD", "USD"] as const).filter((currency) => !cashAccounts.some((item) => item.currency === currency)).map((currency) => (
            <button key={currency} onClick={() => openAccount(currency)} className="rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm font-medium text-amber-700">
              請先建立對應幣別現金帳戶（{currency}） →
            </button>
          ))}
          <div className={card}>
            <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">現金帳戶</h2><button onClick={() => openAccount()} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">＋ 帳戶</button></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {cashAccounts.length ? cashAccounts.map((item) => <article key={item.id} className="rounded-2xl bg-slate-50 p-4"><button onClick={() => openAdjustment(item)} className="w-full text-left"><p className="text-sm font-medium text-slate-500">{item.name}</p><p className="mt-2 text-xl font-semibold">{formatInvestmentMoney(item.balance, item.currency)}</p><p className="mt-2 text-xs text-indigo-500">調整餘額</p></button><div className="mt-3 flex justify-end gap-2 border-t border-slate-200/70 pt-3"><button type="button" onClick={() => openAccount(item.currency,item)} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm"><Pencil size={14} strokeWidth={2.2}/> 編輯</button><button type="button" onClick={() => remove("account",item.id)} className="flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600"><Trash2 size={14} strokeWidth={2.2}/> 刪除</button></div></article>) : <Empty />}
            </div>
          </div>
          <div className={card}>
            <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">現金流水</h2><button onClick={() => openAdjustment()} disabled={!cashAccounts.length} className="rounded-full bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-600 disabled:opacity-40">手動調整</button></div>
            <div className="mt-3 divide-y divide-slate-100">
              {cashLedger.length ? cashLedger.slice().sort((a,b) => `${b.date}|${b.createdAt}`.localeCompare(`${a.date}|${a.createdAt}`)).map((item) => {
                const isOut = ["withdraw","fx_out","trade_buy"].includes(item.type);
                return <div key={item.id} className="flex items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="truncate font-semibold">{item.accountName || item.currency}</p><p className="mt-1 truncate text-xs text-slate-400">{item.date} · {cashTypeLabel(item.type)} · {item.note}</p></div><p className={`shrink-0 text-sm font-semibold ${isOut ? "text-rose-600" : "text-emerald-600"}`}>{isOut ? "-" : item.amount >= 0 ? "+" : ""}{formatInvestmentMoney(item.amount, item.currency)}</p></div>;
              }) : <Empty />}
            </div>
          </div>
        </section> : null}

        {tab === "fx" ? <RecordSection title="換匯紀錄" action={() => openFx()} error={resourceErrors.fx_records}>
          {fxRecords.slice().sort((a,b) => b.date.localeCompare(a.date)).map((item) => <RecordRow key={item.id} title={`${item.fromCurrency} → ${item.toCurrency}`} meta={`${item.date} · ${formatExchangeRate(item.fromCurrency,item.toCurrency,item.exchangeRate)}`} amount={`${formatInvestmentMoney(item.fromAmount, item.fromCurrency)} → ${formatInvestmentMoney(item.toAmount, item.toCurrency)}`} onEdit={() => openFx(item)} onDelete={() => remove("fx", item.id)} />)}
        </RecordSection> : null}

        {tab === "dividends" ? <RecordSection title="股息紀錄" action={() => openDividend()} error={resourceErrors.dividend_records}>
          {dividends.slice().sort((a,b) => b.date.localeCompare(a.date)).map((item) => <RecordRow key={item.id} title={`${item.ticker} ${item.name}`} meta={`${item.date} · 原幣 ${formatInvestmentMoney(item.amount, item.currency)} · 稅 ${formatInvestmentMoney(item.tax, item.currency)}`} amount={formatInvestmentMoney(item.amountTwd, "TWD")} onEdit={() => openDividend(item)} onDelete={() => remove("dividend", item.id)} />)}
        </RecordSection> : null}
      </section>

      {editor ? <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/35 p-4 backdrop-blur-sm"><div className="mx-auto mt-8 max-h-[calc(100dvh-1.5rem)] max-w-xl overflow-y-auto rounded-[30px] bg-white px-5 pt-5 pb-[calc(8rem+env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">{editor === "trade" ? "交易紀錄" : editor === "fx" ? "換匯紀錄" : editor === "dividend" ? "股息紀錄" : editor === "account" ? accountForm.id ? "編輯現金帳戶" : "新增現金帳戶" : "調整現金餘額"}</h2><button onClick={() => setEditor(null)} className="rounded-full bg-slate-100 px-3 py-2">✕</button></div>
        {editor === "trade" ? <form onSubmit={saveTrade} className="grid grid-cols-2 gap-3">
          <Field label="日期"><input required type="date" value={tradeForm.date} onChange={(e) => setTradeForm({...tradeForm,date:e.target.value})}/></Field>
          <Field label="市場"><select value={tradeForm.market} onChange={(e) => { const market=e.target.value as Market; const symbol=normalizeSymbol(tradeForm.symbol||tradeForm.ticker,market); setTradeForm({...tradeForm,market,symbol,ticker:symbol,name:tradeForm.name||getSymbolName(symbol,market),unit:market==="TW"?"lot":"share",currency:market==="US"?"USD":"TWD",exchangeRate:market==="US"?tradeForm.exchangeRate||"":"1"}); }}><option value="TW">台股</option><option value="US">美股</option></select></Field>
          <Field label="股票代號"><input required type="text" inputMode={tradeForm.market === "TW" ? "numeric" : "text"} value={tradeForm.symbol} onBlur={finalizeTradeSymbol} onChange={(e) => updateTradeSymbol(e.target.value)}/></Field>
          <Field label="名稱"><input required value={tradeForm.name} onChange={(e) => setTradeForm({...tradeForm,name:e.target.value})}/></Field>
          <Field label="方向"><select value={tradeForm.side} onChange={(e) => setTradeForm({...tradeForm,side:e.target.value as TradeSide})}><option value="buy">買入</option><option value="sell">賣出</option></select></Field>
          <Field label="幣別"><select value={tradeForm.currency} onChange={(e) => setTradeForm({...tradeForm,currency:e.target.value as Currency})}><option value="TWD">TWD</option><option value="USD">USD</option></select></Field>
          {(["quantity","price","fee","tax","exchangeRate"] as const).map((key) => <Field key={key} label={{quantity:tradeForm.market === "TW" ? "張數" : "股數",price:"成交價",fee:"手續費",tax:"交易稅",exchangeRate:"匯率"}[key]}><input required step="any" min="0" type="number" value={tradeForm[key]} onChange={(e) => setTradeForm({...tradeForm,[key]:e.target.value})}/></Field>)}
          <Field label="備註" wide><input value={tradeForm.note} onChange={(e) => setTradeForm({...tradeForm,note:e.target.value})}/></Field>
          <p className="col-span-2 rounded-2xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-700">總額：{formatInvestmentMoney(calculateTradeTotal(tradeForm.market,tradeForm.side,number(tradeForm.quantity),number(tradeForm.price),number(tradeForm.fee),number(tradeForm.tax)),tradeForm.currency)}</p>
          <Submit saving={saving}/>
        </form> : null}
        {editor === "fx" ? <form onSubmit={saveFx} className="grid grid-cols-2 gap-3">
          <Field label="日期"><input required type="date" value={fxForm.date} onChange={(e) => setFxForm({...fxForm,date:e.target.value})}/></Field>
          <Field label="流向"><select value={`${fxForm.fromCurrency}-${fxForm.toCurrency}`} onChange={(e) => {const [fromCurrency,toCurrency]=e.target.value.split("-") as [Currency,Currency];updateFxDirection(fromCurrency,toCurrency);}}><option value="TWD-USD">TWD → USD</option><option value="USD-TWD">USD → TWD</option></select></Field>
          {(["fromAmount","toAmount","exchangeRate","fee"] as const).map((key) => <Field key={key} label={{fromAmount:"換出金額",toAmount:"換入金額",exchangeRate:"匯率（1 USD = TWD）",fee:"手續費"}[key]}><input required type="number" step="any" min="0" value={key === "exchangeRate" ? fxRateDisplay : fxForm[key]} onChange={(e) => {
            if (key === "fromAmount" || key === "toAmount") {
              updateFxAmount(key, e.target.value);
            } else if (key === "exchangeRate") {
              updateFxDisplayRate(e.target.value);
            } else {
              setFxForm({...fxForm,[key]:e.target.value});
            }
          }}/></Field>)}
          <Field label="備註" wide><input value={fxForm.note} onChange={(e) => setFxForm({...fxForm,note:e.target.value})}/></Field><Submit saving={saving}/>
        </form> : null}
        {editor === "dividend" ? <form onSubmit={saveDividend} className="grid grid-cols-2 gap-3">
          <Field label="日期"><input required type="date" value={dividendForm.date} onChange={(e) => setDividendForm({...dividendForm,date:e.target.value})}/></Field>
          <Field label="市場"><select value={dividendForm.market} onChange={(e) => {const market=e.target.value as Market;setDividendForm({...dividendForm,market,currency:market==="US"?"USD":"TWD",exchangeRate:market==="US"?"":"1"});}}><option value="TW">台股</option><option value="US">美股</option></select></Field>
          <Field label="股票代號"><input required type="text" inputMode={dividendForm.market === "TW" ? "numeric" : "text"} value={dividendForm.symbol} onBlur={finalizeDividendSymbol} onChange={(e) => updateDividendSymbol(e.target.value)}/></Field>
          <Field label="名稱"><input required value={dividendForm.name} onChange={(e) => setDividendForm({...dividendForm,name:e.target.value})}/></Field>
          <Field label="現金帳戶" wide><input required placeholder="例如：美股證券戶" value={dividendForm.account} onChange={(e) => setDividendForm({...dividendForm,account:e.target.value})}/></Field>
          <Field label="幣別"><select value={dividendForm.currency} onChange={(e) => setDividendForm({...dividendForm,currency:e.target.value as Currency})}><option value="TWD">TWD</option><option value="USD">USD</option></select></Field>
          {(["grossAmount","tax","fee","netAmount","exchangeRate","amountTwd"] as const).map((key) => <Field key={key} label={{grossAmount:"股息總額",tax:"稅額",fee:"費用",netAmount:"實收金額",exchangeRate:"匯率",amountTwd:"折合台幣"}[key]}><input required type="number" step="any" min="0" value={dividendForm[key]} onChange={(e) => {
            const next = {...dividendForm,[key]:e.target.value};
            if (key === "grossAmount" || key === "tax" || key === "fee") {
              next.netAmount = String(Math.max(0, number(next.grossAmount) - number(next.tax) - number(next.fee)));
            }
            if (key !== "amountTwd") {
              next.amountTwd = String(number(next.netAmount) * number(next.exchangeRate));
            }
            next.amount = next.grossAmount;
            setDividendForm(next);
          }}/></Field>)}
          <Field label="備註" wide><input value={dividendForm.note} onChange={(e) => setDividendForm({...dividendForm,note:e.target.value})}/></Field><Submit saving={saving}/>
        </form> : null}
        {editor === "account" ? <form onSubmit={saveAccount} className="grid grid-cols-2 gap-3">
          <Field label="帳戶名稱" wide><input required placeholder={accountForm.currency === "TWD" ? "例如：台幣交割戶" : "例如：美股證券戶"} value={accountForm.name} onChange={(e) => setAccountForm({...accountForm,name:e.target.value})}/></Field>
          <Field label="幣別"><select value={accountForm.currency} onChange={(e) => setAccountForm({...accountForm,currency:e.target.value as Currency})}><option value="TWD">TWD</option><option value="USD">USD</option></select></Field>
          <Field label="初始餘額"><input required type="number" step="any" value={accountForm.balance} onChange={(e) => setAccountForm({...accountForm,balance:e.target.value})}/></Field>
          <Field label="備註" wide><input value={accountForm.note} onChange={(e) => setAccountForm({...accountForm,note:e.target.value})}/></Field>
          <Submit saving={saving}/>
        </form> : null}
        {editor === "adjustment" ? <form onSubmit={saveAdjustment} className="grid grid-cols-2 gap-3">
          <Field label="日期"><input required type="date" value={adjustmentForm.date} onChange={(e) => setAdjustmentForm({...adjustmentForm,date:e.target.value})}/></Field>
          <Field label="帳戶"><select required value={adjustmentForm.accountId} onChange={(e) => setAdjustmentForm({...adjustmentForm,accountId:e.target.value})}><option value="">請選擇</option>{cashAccounts.map((item) => <option key={item.id} value={item.id}>{item.name}（{item.currency}）</option>)}</select></Field>
          <Field label="調整金額" wide><input required type="number" step="any" value={adjustmentForm.amount} placeholder="增加填正數，減少填負數" onChange={(e) => setAdjustmentForm({...adjustmentForm,amount:e.target.value})}/></Field>
          <Field label="備註" wide><input value={adjustmentForm.note} onChange={(e) => setAdjustmentForm({...adjustmentForm,note:e.target.value})}/></Field>
          <Submit saving={saving}/>
        </form> : null}
      </div></div> : null}
    </main>
  );
}

function RecordSection({title,action,error,children}:{title:string;action:()=>void;error?:ResourceErrorInfo;children:React.ReactNode}) {
  return <section className="rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-sm shadow-slate-200/80"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{title}</h2><button onClick={action} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">＋ 新增</button></div><ResourceError error={error}/><div className="mt-3 divide-y divide-slate-100">{children || <Empty />}</div></section>;
}
function RecordRow({title,meta,amount,onEdit,onDelete}:{title:string;meta:string;amount:string;onEdit:()=>void;onDelete:()=>void}) {
  return <div className="flex flex-wrap items-center gap-3 py-4"><div className="min-w-0 flex-1 basis-40"><p className="truncate font-semibold">{title}</p><p className="mt-1 truncate text-xs text-slate-400">{meta}</p></div><p className="shrink-0 text-sm font-semibold">{amount}</p><div className="flex w-full justify-end gap-1 sm:w-auto"><button type="button" onClick={onEdit} className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600"><Pencil size={14} strokeWidth={2.2}/> 編輯</button><button type="button" onClick={onDelete} className="flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600"><Trash2 size={14} strokeWidth={2.2}/> 刪除</button></div></div>;
}
function Empty(){return <p className="py-8 text-center text-sm text-slate-400">尚無資料</p>;}
function ResourceError({error}:{error?:ResourceErrorInfo}) {
  if (!error) return null;
  return <p className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error.resource} 讀取失敗 · status {error.status || "unknown"} · {error.message}</p>;
}
function Field({label,wide,children}:{label:string;wide?:boolean;children:React.ReactNode}){return <label className={`grid gap-1.5 text-sm font-medium text-slate-500 ${wide?"col-span-2":""}`}><span>{label}</span><div className="[&>*]:h-11 [&>*]:w-full [&>*]:rounded-xl [&>*]:border-0 [&>*]:bg-slate-100 [&>*]:px-3 [&>*]:text-slate-950 [&>*]:outline-none">{children}</div></label>;}
function Submit({saving}:{saving:boolean}){return <><button disabled={saving} className="col-span-2 mt-2 h-12 rounded-2xl bg-indigo-600 font-semibold text-white disabled:opacity-50">{saving?"儲存中…":"儲存"}</button><div className="col-span-2 h-24" aria-hidden="true"/></>;}
function cashTypeLabel(type: CashLedger["type"]) {
  return {
    deposit: "存入", withdraw: "提領", fx_in: "換匯入帳", fx_out: "換匯扣款",
    trade_buy: "買入扣款", trade_sell: "賣出入帳", dividend: "股息",
    adjustment: "手動調整",
  }[type];
}
