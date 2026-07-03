"use client";

import { useEffect, useMemo, useState } from "react";
import BottomNav from "../ui/bottom-nav";
import {
  calculatePositions,
  calculateTradeTotal,
  type CashAccount,
  type CashLedger,
  type Currency,
  type DividendRecord,
  type FxRecord,
  formatInvestmentMoney,
  type InvestmentTrade,
  type InvestmentPosition,
  localDateKey,
  type Market,
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
  getDividendRecords,
  getCashAccounts,
  getCashLedger,
  getFxRecords,
  getInvestmentTrades,
  getInvestmentPositions,
  updateDividendRecord,
  updateFxRecord,
  updateInvestmentTrade,
} from "../lib/googleSheets";

type Tab = "overview" | "trades" | "positions" | "cash" | "fx" | "dividends";
type Editor = "trade" | "fx" | "dividend" | "account" | "adjustment" | null;
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
type DividendForm = Omit<DividendRecord, "amount" | "tax" | "exchangeRate" | "amountTwd"> & {
  amount: string; tax: string; exchangeRate: string; amountTwd: string;
};
type AccountForm = {
  name: string; currency: Currency; balance: string; note: string;
};
type AdjustmentForm = {
  date: string; accountId: string; amount: string; note: string;
};

const nowIso = () => new Date().toISOString();
const emptyTrade = (): TradeForm => ({
  id: "", date: localDateKey(), market: "TW", ticker: "", name: "", side: "buy",
  quantity: "", price: "", fee: "0", tax: "0", currency: "TWD",
  exchangeRate: "1", note: "", createdAt: "", updatedAt: "",
});
const emptyFx = (): FxForm => ({
  id: "", date: localDateKey(), fromCurrency: "TWD", toCurrency: "USD",
  fromAmount: "", toAmount: "", exchangeRate: "", fee: "0", note: "",
  createdAt: "", updatedAt: "",
});
const emptyDividend = (): DividendForm => ({
  id: "", date: localDateKey(), market: "TW", ticker: "", name: "", amount: "",
  tax: "0", currency: "TWD", exchangeRate: "1", amountTwd: "", note: "",
  createdAt: "", updatedAt: "",
});
const emptyAccount = (): AccountForm => ({
  name: "", currency: "TWD", balance: "0", note: "",
});
const emptyAdjustment = (): AdjustmentForm => ({
  date: localDateKey(), accountId: "", amount: "", note: "",
});

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function normalizeTrade(row: Record<string, unknown>): InvestmentTrade {
  return {
    id: String(row.id ?? ""), date: String(row.date ?? ""), market: row.market === "US" ? "US" : "TW",
    ticker: String(row.ticker ?? ""), name: String(row.name ?? ""), side: row.side === "sell" ? "sell" : "buy",
    quantity: number(row.quantity), price: number(row.price), fee: number(row.fee), tax: number(row.tax),
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
  return {
    id: String(row.id ?? ""), date: String(row.date ?? ""), market: row.market === "US" ? "US" : "TW",
    ticker: String(row.ticker ?? ""), name: String(row.name ?? ""), amount: number(row.amount),
    tax: number(row.tax), currency: row.currency === "USD" ? "USD" : "TWD",
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
  const [fxForm, setFxForm] = useState(emptyFx);
  const [dividendForm, setDividendForm] = useState(emptyDividend);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [adjustmentForm, setAdjustmentForm] = useState(emptyAdjustment);
  const [message, setMessage] = useState("正在讀取投資資料…");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [tradeRows, positionRows, fxRows, dividendRows, accountRows, ledgerRows] = await Promise.all([
      getInvestmentTrades<Record<string, unknown>>(),
      getInvestmentPositions<Record<string, unknown>>(),
      getFxRecords<Record<string, unknown>>(),
      getDividendRecords<Record<string, unknown>>(),
      getCashAccounts<Record<string, unknown>>(),
      getCashLedger<Record<string, unknown>>(),
    ]);
    setTrades(tradeRows.map(normalizeTrade));
    setPositionSnapshots(positionRows.map(normalizePosition));
    setFxRecords(fxRows.map(normalizeFx));
    setDividends(dividendRows.map(normalizeDividend));
    setCashAccounts(accountRows.map(normalizeAccount));
    setCashLedger(ledgerRows.map(normalizeLedger));
  }
  useEffect(() => {
    const request = Promise.resolve().then(load);
    request
      .then(() => setMessage(""))
      .catch(() =>
        setMessage("投資資料讀取失敗，請確認工作表與 Apps Script 部署"),
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
    .map((item) => item.exchangeRate || (
      item.fromCurrency === "USD"
        ? item.toAmount / Math.max(item.fromAmount, 1)
        : item.fromAmount / Math.max(item.toAmount, 1)
    ))
    .find((rate) => rate > 0) ?? 1;
  const investmentCostTwd = twCost + usCost * latestUsdTwdRate;
  const estimatedAssets = twdCash + usdCash * latestUsdTwdRate + investmentCostTwd;

  function openTrade(item?: InvestmentTrade) {
    setTradeForm(item ? { ...item, quantity: String(item.quantity), price: String(item.price), fee: String(item.fee), tax: String(item.tax), exchangeRate: String(item.exchangeRate) } : emptyTrade());
    setEditor("trade");
  }
  function openFx(item?: FxRecord) {
    setFxForm(item ? { ...item, fromAmount: String(item.fromAmount), toAmount: String(item.toAmount), exchangeRate: String(item.exchangeRate), fee: String(item.fee) } : emptyFx());
    setEditor("fx");
  }
  function openDividend(item?: DividendRecord) {
    setDividendForm(item ? { ...item, amount: String(item.amount), tax: String(item.tax), exchangeRate: String(item.exchangeRate), amountTwd: String(item.amountTwd) } : emptyDividend());
    setEditor("dividend");
  }
  function openAccount(currency: Currency = "TWD") {
    setAccountForm({ ...emptyAccount(), currency });
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
    const payload: InvestmentTrade = {
      ...tradeForm, ticker: tradeForm.ticker.trim().toUpperCase(), name: tradeForm.name.trim(),
      quantity: number(tradeForm.quantity), price: number(tradeForm.price), fee: number(tradeForm.fee),
      tax: number(tradeForm.tax), exchangeRate: number(tradeForm.exchangeRate),
      totalAmount: calculateTradeTotal(tradeForm.side, number(tradeForm.quantity), number(tradeForm.price), number(tradeForm.fee), number(tradeForm.tax)),
      id: tradeForm.id || `trade-${Date.now()}`, createdAt: tradeForm.createdAt || stamp, updatedAt: stamp,
    };
    try {
      if (tradeForm.id) await updateInvestmentTrade(tradeForm.id, payload);
      else await createInvestmentTrade(payload);
      await load(); setEditor(null); setMessage("交易已儲存");
    } catch { setMessage("交易儲存失敗"); } finally { setSaving(false); }
  }
  async function saveFx(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); const stamp = nowIso();
    const payload: FxRecord = { ...fxForm, fromAmount: number(fxForm.fromAmount), toAmount: number(fxForm.toAmount), exchangeRate: number(fxForm.exchangeRate), fee: number(fxForm.fee), id: fxForm.id || `fx-${Date.now()}`, createdAt: fxForm.createdAt || stamp, updatedAt: stamp };
    try {
      if (fxForm.id) await updateFxRecord(fxForm.id, payload); else await createFxRecord(payload);
      await load(); setEditor(null); setMessage("換匯紀錄已儲存");
    } catch { setMessage("換匯紀錄儲存失敗"); } finally { setSaving(false); }
  }
  async function saveDividend(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); const stamp = nowIso();
    const payload: DividendRecord = { ...dividendForm, ticker: dividendForm.ticker.trim().toUpperCase(), name: dividendForm.name.trim(), amount: number(dividendForm.amount), tax: number(dividendForm.tax), exchangeRate: number(dividendForm.exchangeRate), amountTwd: number(dividendForm.amountTwd), id: dividendForm.id || `dividend-${Date.now()}`, createdAt: dividendForm.createdAt || stamp, updatedAt: stamp };
    try {
      if (dividendForm.id) await updateDividendRecord(dividendForm.id, payload); else await createDividendRecord(payload);
      await load(); setEditor(null); setMessage("股息已儲存");
    } catch { setMessage("股息儲存失敗"); } finally { setSaving(false); }
  }
  async function saveAccount(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); const stamp = nowIso();
    try {
      await createCashAccount({
        id: `cash-${Date.now()}`, name: accountForm.name.trim(),
        currency: accountForm.currency, balance: number(accountForm.balance),
        date: localDateKey(), note: accountForm.note.trim(), updatedAt: stamp,
      });
      await load(); setEditor(null); setMessage("現金帳戶已建立");
    } catch { setMessage("現金帳戶建立失敗"); } finally { setSaving(false); }
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
      await load(); setEditor(null); setMessage("現金餘額已調整");
    } catch { setMessage("現金餘額調整失敗"); } finally { setSaving(false); }
  }
  async function remove(kind: Exclude<Editor, null>, id: string) {
    if (!window.confirm("確定要刪除這筆紀錄嗎？")) return;
    try {
      if (kind === "trade") await deleteInvestmentTrade(id);
      if (kind === "fx") await deleteFxRecord(id);
      if (kind === "dividend") await deleteDividendRecord(id);
      await load(); setMessage("紀錄已刪除");
    } catch { setMessage("刪除失敗"); }
  }

  const card = "rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl";
  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-950">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 lg:px-8">
        <header>
          <p className="text-sm font-medium text-indigo-500">Investment journal</p>
          <h1 className="mt-1 text-3xl font-semibold">投資記帳</h1>
          <p className="mt-2 text-sm text-slate-500">台股、美股、換匯與股息集中管理</p>
        </header>
        {message ? <p className="rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-medium text-indigo-700">{message}</p> : null}
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
          <p className="col-span-2 px-1 text-xs text-slate-400 lg:col-span-3">美元換算匯率：{latestUsdTwdRate.toFixed(4)}；股票資產暫以持有成本估算。</p>
        </div> : null}

        {tab === "trades" ? <RecordSection title="買賣紀錄" action={() => openTrade()}>
          {trades.slice().sort((a,b) => b.date.localeCompare(a.date)).map((item) => <RecordRow key={item.id} title={`${item.ticker} ${item.name}`} meta={`${item.date} · ${item.market} · ${item.side === "buy" ? "買入" : "賣出"} ${item.quantity} 股`} amount={`${item.side === "buy" ? "-" : "+"}${formatInvestmentMoney(item.totalAmount, item.currency)}`} onEdit={() => openTrade(item)} onDelete={() => remove("trade", item.id)} />)}
        </RecordSection> : null}

        {tab === "positions" ? <section className={card}><h2 className="text-xl font-semibold">庫存持股</h2><div className="mt-3 divide-y divide-slate-100">
          {positions.length ? positions.map((item) => <div key={`${item.market}-${item.ticker}`} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto]"><div><p className="font-semibold">{item.ticker} <span className="font-normal text-slate-500">{item.name}</span></p><p className="mt-1 text-xs text-slate-400">{item.market} · {item.quantity} 股 · 均價 {formatInvestmentMoney(item.averageCost, item.currency)}</p></div><p className="font-semibold">{formatInvestmentMoney(item.totalCost, item.currency)}</p></div>) : <Empty />}
        </div></section> : null}

        {tab === "cash" ? <section className="grid gap-4">
          {(["TWD", "USD"] as const).filter((currency) => !cashAccounts.some((item) => item.currency === currency)).map((currency) => (
            <button key={currency} onClick={() => openAccount(currency)} className="rounded-2xl bg-amber-50 px-4 py-3 text-left text-sm font-medium text-amber-700">
              請先建立對應幣別現金帳戶（{currency}） →
            </button>
          ))}
          <div className={card}>
            <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">現金帳戶</h2><button onClick={() => openAccount()} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">＋ 帳戶</button></div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {cashAccounts.length ? cashAccounts.map((item) => <button key={item.id} onClick={() => openAdjustment(item)} className="rounded-2xl bg-slate-50 p-4 text-left"><p className="text-sm font-medium text-slate-500">{item.name}</p><p className="mt-2 text-xl font-semibold">{formatInvestmentMoney(item.balance, item.currency)}</p><p className="mt-2 text-xs text-indigo-500">調整餘額</p></button>) : <Empty />}
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

        {tab === "fx" ? <RecordSection title="換匯紀錄" action={() => openFx()}>
          {fxRecords.slice().sort((a,b) => b.date.localeCompare(a.date)).map((item) => <RecordRow key={item.id} title={`${item.fromCurrency} → ${item.toCurrency}`} meta={`${item.date} · 匯率 ${item.exchangeRate}`} amount={`${formatInvestmentMoney(item.fromAmount, item.fromCurrency)} → ${formatInvestmentMoney(item.toAmount, item.toCurrency)}`} onEdit={() => openFx(item)} onDelete={() => remove("fx", item.id)} />)}
        </RecordSection> : null}

        {tab === "dividends" ? <RecordSection title="股息紀錄" action={() => openDividend()}>
          {dividends.slice().sort((a,b) => b.date.localeCompare(a.date)).map((item) => <RecordRow key={item.id} title={`${item.ticker} ${item.name}`} meta={`${item.date} · 原幣 ${formatInvestmentMoney(item.amount, item.currency)} · 稅 ${formatInvestmentMoney(item.tax, item.currency)}`} amount={formatInvestmentMoney(item.amountTwd, "TWD")} onEdit={() => openDividend(item)} onDelete={() => remove("dividend", item.id)} />)}
        </RecordSection> : null}
      </section>
      <BottomNav active="investments" />

      {editor ? <div className="fixed inset-0 z-40 overflow-y-auto bg-slate-950/35 p-4 backdrop-blur-sm"><div className="mx-auto mt-8 max-w-xl rounded-[30px] bg-white p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-semibold">{editor === "trade" ? "交易紀錄" : editor === "fx" ? "換匯紀錄" : editor === "dividend" ? "股息紀錄" : editor === "account" ? "新增現金帳戶" : "調整現金餘額"}</h2><button onClick={() => setEditor(null)} className="rounded-full bg-slate-100 px-3 py-2">✕</button></div>
        {editor === "trade" ? <form onSubmit={saveTrade} className="grid grid-cols-2 gap-3">
          <Field label="日期"><input required type="date" value={tradeForm.date} onChange={(e) => setTradeForm({...tradeForm,date:e.target.value})}/></Field>
          <Field label="市場"><select value={tradeForm.market} onChange={(e) => { const market=e.target.value as Market; setTradeForm({...tradeForm,market,currency:market==="US"?"USD":"TWD",exchangeRate:market==="US"?tradeForm.exchangeRate||"":"1"}); }}><option value="TW">台股</option><option value="US">美股</option></select></Field>
          <Field label="股票代號"><input required value={tradeForm.ticker} onChange={(e) => setTradeForm({...tradeForm,ticker:e.target.value})}/></Field>
          <Field label="名稱"><input required value={tradeForm.name} onChange={(e) => setTradeForm({...tradeForm,name:e.target.value})}/></Field>
          <Field label="方向"><select value={tradeForm.side} onChange={(e) => setTradeForm({...tradeForm,side:e.target.value as TradeSide})}><option value="buy">買入</option><option value="sell">賣出</option></select></Field>
          <Field label="幣別"><select value={tradeForm.currency} onChange={(e) => setTradeForm({...tradeForm,currency:e.target.value as Currency})}><option value="TWD">TWD</option><option value="USD">USD</option></select></Field>
          {(["quantity","price","fee","tax","exchangeRate"] as const).map((key) => <Field key={key} label={{quantity:"股數",price:"成交價",fee:"手續費",tax:"交易稅",exchangeRate:"匯率"}[key]}><input required step="any" min="0" type="number" value={tradeForm[key]} onChange={(e) => setTradeForm({...tradeForm,[key]:e.target.value})}/></Field>)}
          <Field label="備註" wide><input value={tradeForm.note} onChange={(e) => setTradeForm({...tradeForm,note:e.target.value})}/></Field>
          <p className="col-span-2 rounded-2xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-700">總額：{formatInvestmentMoney(calculateTradeTotal(tradeForm.side,number(tradeForm.quantity),number(tradeForm.price),number(tradeForm.fee),number(tradeForm.tax)),tradeForm.currency)}</p>
          <Submit saving={saving}/>
        </form> : null}
        {editor === "fx" ? <form onSubmit={saveFx} className="grid grid-cols-2 gap-3">
          <Field label="日期"><input required type="date" value={fxForm.date} onChange={(e) => setFxForm({...fxForm,date:e.target.value})}/></Field>
          <Field label="流向"><select value={`${fxForm.fromCurrency}-${fxForm.toCurrency}`} onChange={(e) => {const [fromCurrency,toCurrency]=e.target.value.split("-") as [Currency,Currency];setFxForm({...fxForm,fromCurrency,toCurrency});}}><option value="TWD-USD">TWD → USD</option><option value="USD-TWD">USD → TWD</option></select></Field>
          {(["fromAmount","toAmount","exchangeRate","fee"] as const).map((key) => <Field key={key} label={{fromAmount:"換出金額",toAmount:"換入金額",exchangeRate:"匯率",fee:"手續費"}[key]}><input required type="number" step="any" min="0" value={fxForm[key]} onChange={(e) => setFxForm({...fxForm,[key]:e.target.value})}/></Field>)}
          <Field label="備註" wide><input value={fxForm.note} onChange={(e) => setFxForm({...fxForm,note:e.target.value})}/></Field><Submit saving={saving}/>
        </form> : null}
        {editor === "dividend" ? <form onSubmit={saveDividend} className="grid grid-cols-2 gap-3">
          <Field label="日期"><input required type="date" value={dividendForm.date} onChange={(e) => setDividendForm({...dividendForm,date:e.target.value})}/></Field>
          <Field label="市場"><select value={dividendForm.market} onChange={(e) => {const market=e.target.value as Market;setDividendForm({...dividendForm,market,currency:market==="US"?"USD":"TWD",exchangeRate:market==="US"?"":"1"});}}><option value="TW">台股</option><option value="US">美股</option></select></Field>
          <Field label="股票代號"><input required value={dividendForm.ticker} onChange={(e) => setDividendForm({...dividendForm,ticker:e.target.value})}/></Field>
          <Field label="名稱"><input required value={dividendForm.name} onChange={(e) => setDividendForm({...dividendForm,name:e.target.value})}/></Field>
          <Field label="幣別"><select value={dividendForm.currency} onChange={(e) => setDividendForm({...dividendForm,currency:e.target.value as Currency})}><option value="TWD">TWD</option><option value="USD">USD</option></select></Field>
          {(["amount","tax","exchangeRate","amountTwd"] as const).map((key) => <Field key={key} label={{amount:"原幣金額",tax:"稅額",exchangeRate:"匯率",amountTwd:"折合台幣"}[key]}><input required type="number" step="any" min="0" value={dividendForm[key]} onChange={(e) => {const next={...dividendForm,[key]:e.target.value};if(key==="amount"||key==="tax"||key==="exchangeRate")next.amountTwd=String(Math.max(0,number(next.amount)-number(next.tax))*number(next.exchangeRate));setDividendForm(next);}}/></Field>)}
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

function RecordSection({title,action,children}:{title:string;action:()=>void;children:React.ReactNode}) {
  return <section className="rounded-[28px] border border-white/80 bg-white/85 p-5 shadow-sm shadow-slate-200/80"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold">{title}</h2><button onClick={action} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white">＋ 新增</button></div><div className="mt-3 divide-y divide-slate-100">{children || <Empty />}</div></section>;
}
function RecordRow({title,meta,amount,onEdit,onDelete}:{title:string;meta:string;amount:string;onEdit:()=>void;onDelete:()=>void}) {
  return <div className="flex items-center gap-3 py-4"><button onClick={onEdit} className="min-w-0 flex-1 text-left"><p className="truncate font-semibold">{title}</p><p className="mt-1 truncate text-xs text-slate-400">{meta}</p></button><p className="shrink-0 text-sm font-semibold">{amount}</p><button onClick={onDelete} className="text-sm text-rose-500">刪除</button></div>;
}
function Empty(){return <p className="py-8 text-center text-sm text-slate-400">尚無資料</p>;}
function Field({label,wide,children}:{label:string;wide?:boolean;children:React.ReactNode}){return <label className={`grid gap-1.5 text-sm font-medium text-slate-500 ${wide?"col-span-2":""}`}><span>{label}</span><div className="[&>*]:h-11 [&>*]:w-full [&>*]:rounded-xl [&>*]:border-0 [&>*]:bg-slate-100 [&>*]:px-3 [&>*]:text-slate-950 [&>*]:outline-none">{children}</div></label>;}
function Submit({saving}:{saving:boolean}){return <button disabled={saving} className="col-span-2 mt-2 h-12 rounded-2xl bg-indigo-600 font-semibold text-white disabled:opacity-50">{saving?"儲存中…":"儲存"}</button>;}
function cashTypeLabel(type: CashLedger["type"]) {
  return {
    deposit: "存入", withdraw: "提領", fx_in: "換匯入帳", fx_out: "換匯扣款",
    trade_buy: "買入扣款", trade_sell: "賣出入帳", dividend: "股息",
    adjustment: "手動調整",
  }[type];
}
