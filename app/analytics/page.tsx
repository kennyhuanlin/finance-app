"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dedupeCategories } from "../lib/categories";
import { getCategories, getTransactions } from "../lib/googleSheets";

const periods = ["本月", "上月", "本季", "今年", "累積餘額"] as const;
type Period = (typeof periods)[number];
type Transaction = {
  id: string;
  date: string;
  type: string;
  category: string;
  categoryId?: string;
  amount: number;
  note: string;
  sourceType?: string;
  recurringId?: string | null;
  expenseType?: string | null;
  necessity?: string;
  createdAt?: string;
};

type Category = {
  id: string;
  name: string;
  emoji: string;
  type: string;
  color: string;
};

const necessaryCategories = new Set([
  "住房",
  "保險",
  "貸款",
  "水電瓦斯",
  "通訊",
  "醫療保健",
]);

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDateRange(period: Period) {
  if (period === "累積餘額") {
    return null;
  }

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  if (period === "本月") {
    return {
      start: toDateKey(new Date(year, month, 1)),
      end: toDateKey(new Date(year, month + 1, 0)),
    };
  }

  if (period === "上月") {
    return {
      start: toDateKey(new Date(year, month - 1, 1)),
      end: toDateKey(new Date(year, month, 0)),
    };
  }

  if (period === "本季") {
    const quarterStartMonth = Math.floor(month / 3) * 3;

    return {
      start: toDateKey(new Date(year, quarterStartMonth, 1)),
      end: toDateKey(new Date(year, quarterStartMonth + 3, 0)),
    };
  }

  return {
    start: toDateKey(new Date(year, 0, 1)),
    end: toDateKey(new Date(year, 11, 31)),
  };
}

function filterTransactionsByPeriod(
  sourceTransactions: Transaction[],
  period: Period,
) {
  const range = getDateRange(period);

  if (!range) {
    return sourceTransactions;
  }

  return sourceTransactions.filter(
    (transaction) =>
      transaction.date >= range.start && transaction.date <= range.end,
  );
}

function isIncome(transaction: Transaction) {
  return transaction.type === "收入" || transaction.type === "income";
}

function isExpense(transaction: Transaction) {
  return transaction.type === "支出" || transaction.type === "expense";
}

function isRecurringIncome(transaction: Transaction) {
  return isIncome(transaction) && transaction.sourceType === "recurring";
}

function isRecurringExpense(transaction: Transaction) {
  return isExpense(transaction) && transaction.sourceType === "recurring";
}

function isFixedExpense(transaction: Transaction) {
  return (
    isExpense(transaction) &&
    (transaction.expenseType === "固定" ||
      transaction.expenseType === "fixed" ||
      transaction.sourceType === "recurring")
  );
}

function isNecessaryExpense(
  transaction: Transaction,
  sourceCategories: Category[],
) {
  if (!isExpense(transaction)) {
    return false;
  }

  if (transaction.necessity) {
    return transaction.necessity === "必要";
  }

  const category = getCategory(transaction, sourceCategories);

  return necessaryCategories.has(category?.name ?? transaction.category);
}

function getCategory(transaction: Transaction, sourceCategories: Category[]) {
  return sourceCategories.find(
    (category) =>
      category.id === transaction.categoryId ||
      category.name === transaction.category,
  );
}

function calculateSummary(
  sourceTransactions: Transaction[],
  sourceCategories: Category[],
) {
  const income = sourceTransactions
    .filter(isIncome)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expense = sourceTransactions
    .filter(isExpense)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const fixedExpense = sourceTransactions
    .filter(isFixedExpense)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const necessaryExpense = sourceTransactions
    .filter((transaction) =>
      isNecessaryExpense(transaction, sourceCategories),
    )
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    income,
    expense,
    balance: income - expense,
    fixedExpense,
    variableExpense: expense - fixedExpense,
    necessaryExpense,
    nonNecessaryExpense: expense - necessaryExpense,
    savingsRate: income > 0 ? ((income - expense) / income) * 100 : 0,
  };
}

function calculateFixedCashFlow(sourceTransactions: Transaction[]) {
  const fixedIncome = sourceTransactions
    .filter(isRecurringIncome)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const fixedExpense = sourceTransactions
    .filter(isRecurringExpense)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  return {
    fixedIncome,
    fixedExpense,
    fixedNet: fixedIncome - fixedExpense,
  };
}

function groupByCategory(
  sourceTransactions: Transaction[],
  sourceCategories: Category[],
  predicate: (transaction: Transaction) => boolean,
) {
  return sourceCategories
    .map((category) => ({
      ...category,
      amount: sourceTransactions
        .filter(
          (transaction) =>
            predicate(transaction) &&
            (transaction.categoryId === category.id ||
              transaction.category === category.name),
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function calculateSourceTypeExpense(
  sourceTransactions: Transaction[],
  sourceType: string,
) {
  return sourceTransactions
    .filter(
      (transaction) =>
        isExpense(transaction) && transaction.sourceType === sourceType,
    )
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
}

function makeDonutGradient(items: { color: string; amount: number }[]) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  if (total === 0) {
    return "#e2e8f0 0% 100%";
  }

  let cursor = 0;

  return items
    .map((item) => {
      const start = cursor;
      const end = cursor + (item.amount / total) * 100;
      cursor = end;

      return `${item.color} ${start}% ${end}%`;
    })
    .join(", ");
}

function groupMonthly(sourceTransactions: Transaction[]) {
  const groups = new Map<
    string,
    { label: string; income: number; expense: number; balance: number }
  >();

  sourceTransactions.forEach((transaction) => {
    const label = transaction.date.slice(0, 7);
    const current = groups.get(label) ?? {
      label,
      income: 0,
      expense: 0,
      balance: 0,
    };

    if (isIncome(transaction)) {
      current.income += transaction.amount;
    }

    if (isExpense(transaction)) {
      current.expense += transaction.amount;
    }

    current.balance = current.income - current.expense;
    groups.set(label, current);
  });

  return Array.from(groups.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

function normalizeTransaction(
  transaction: Record<string, unknown>,
  index: number,
): Transaction {
  return {
    id: String(transaction.id ?? `sheet-tx-${index}`),
    date: String(transaction.date ?? ""),
    type: String(transaction.type ?? ""),
    category: String(transaction.category ?? ""),
    categoryId:
      transaction.categoryId === undefined
        ? undefined
        : String(transaction.categoryId),
    amount: Number(transaction.amount ?? 0),
    note: String(transaction.note ?? ""),
    sourceType:
      transaction.sourceType === undefined
        ? undefined
        : String(transaction.sourceType),
    recurringId:
      transaction.recurringId === undefined || transaction.recurringId === null
        ? null
        : String(transaction.recurringId),
    expenseType:
      transaction.expenseType === undefined || transaction.expenseType === null
        ? null
        : String(transaction.expenseType),
    necessity:
      transaction.necessity === undefined
        ? undefined
        : String(transaction.necessity),
    createdAt:
      transaction.createdAt === undefined
        ? undefined
        : String(transaction.createdAt),
  };
}

function normalizeCategory(
  category: Record<string, unknown>,
  index: number,
): Category {
  return {
    id: String(category.id ?? `sheet-category-${index}`),
    name: String(category.name ?? ""),
    emoji: String(category.emoji ?? "📦"),
    type: String(category.type ?? "expense"),
    color: String(category.color ?? "#64748b"),
  };
}

function BackIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 5 8 12l7 7" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 12h4" />
    </svg>
  );
}

function CategoriesIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.5 5.5h5v5h-5v-5ZM13.5 5.5h5v5h-5v-5ZM5.5 13.5h5v5h-5v-5ZM13.5 13.5h5v5h-5v-5Z" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h16M6 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 2.5 20.5 6 17 9.5M3.5 11V9a3 3 0 0 1 3-3h14M7 21.5 3.5 18 7 14.5M20.5 13v2a3 3 0 0 1-3 3h-14" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 19V9m7 10V5m7 14v-7" />
    </svg>
  );
}

function DonutCard({
  title,
  items,
}: {
  title: string;
  items: { name: string; color: string; amount: number }[];
}) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <article className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-normal">{title}</h2>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
          {formatMoney(total)}
        </span>
      </div>
      <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row">
        <div
          className="grid aspect-square w-40 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${makeDonutGradient(items)})` }}
        >
          <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center shadow-inner shadow-slate-200">
            <p className="text-sm font-semibold text-slate-950">
              {formatMoney(total)}
            </p>
          </div>
        </div>
        <div className="grid w-full gap-3">
          {items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="truncate text-sm font-medium text-slate-600">
                  {item.name}
                </span>
              </div>
              <span className="text-sm font-semibold text-slate-950">
                {formatMoney(item.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function RatioCard({
  title,
  items,
}: {
  title: string;
  items: { name: string; color: string; amount: number }[];
}) {
  const total = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <article className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
      <h2 className="text-lg font-semibold tracking-normal">{title}</h2>
      <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
        <div
          className="flex h-full"
          style={{
            background: `linear-gradient(to right, ${items
              .map((item) => item.color)
              .join(", ")})`,
          }}
        />
      </div>
      <div className="mt-4 grid gap-3">
        {items.map((item, index) => (
          <div key={`${item.name}-${index}`} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-sm font-medium text-slate-600">{item.name}</span>
            </div>
            <span className="text-sm font-semibold text-slate-950">
              {formatMoney(item.amount)} · {formatPercent(total > 0 ? (item.amount / total) * 100 : 0)}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function TrendCard({
  title,
  data,
  field,
  color,
}: {
  title: string;
  data: { label: string; income: number; expense: number; balance: number }[];
  field: "income" | "expense" | "balance";
  color: string;
}) {
  const max = Math.max(...data.map((item) => Math.abs(item[field])), 1);

  return (
    <article className="rounded-[28px] border border-white/75 bg-white/80 p-4 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
      <h3 className="text-sm font-semibold text-slate-500">{title}</h3>
      <div className="mt-4 flex h-28 items-end gap-2">
        {data.map((item) => (
          <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
            <div
              className="w-full rounded-t-xl"
              style={{
                height: `${Math.max((Math.abs(item[field]) / max) * 100, 6)}%`,
                backgroundColor: color,
              }}
            />
            <span className="text-[10px] font-medium text-slate-400">
              {item.label.slice(5)}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function RankingCard({
  title,
  items,
}: {
  title: string;
  items: { name: string; color: string; amount: number }[];
}) {
  return (
    <article className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
      <h2 className="text-lg font-semibold tracking-normal">{title}</h2>
      <div className="mt-4 grid gap-3">
        {items.slice(0, 5).map((item, index) => (
          <div key={`${item.name}-${index}`} className="flex items-center justify-between gap-3 rounded-[22px] bg-slate-50/80 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-sm font-semibold text-slate-400">
                {index + 1}
              </span>
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="truncate text-sm font-semibold text-slate-700">
                {item.name}
              </span>
            </div>
            <span className="shrink-0 text-sm font-semibold text-slate-950">
              {formatMoney(item.amount)}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function AnalyticsPage() {
  const [activePeriod, setActivePeriod] = useState<Period>("本月");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getTransactions<Record<string, unknown>>(),
      getCategories<Record<string, unknown>>(),
    ])
      .then(([sheetTransactions, sheetCategories]) => {
        if (!isMounted) {
          return;
        }

        setTransactions(
          sheetTransactions.map((transaction, index) =>
            normalizeTransaction(transaction, index),
          ),
        );
        setCategories(
          dedupeCategories(
            sheetCategories.map((category, index) =>
              normalizeCategory(category, index),
            ),
          ),
        );
      })
      .catch(() => {
        if (isMounted) {
          setTransactions([]);
          setCategories([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredTransactions = filterTransactionsByPeriod(
    transactions,
    activePeriod,
  );
  const summary = calculateSummary(filteredTransactions, categories);
  const fixedCashFlow = calculateFixedCashFlow(filteredTransactions);
  const expenseCategories = groupByCategory(
    filteredTransactions,
    categories.filter((category) => category.type === "expense"),
    isExpense,
  );
  const incomeCategories = groupByCategory(
    filteredTransactions,
    categories.filter((category) => category.type === "income"),
    isIncome,
  );
  const fixedVsManual = [
    {
      name: "固定支出",
      color: "#8b5cf6",
      amount: calculateSourceTypeExpense(filteredTransactions, "recurring"),
    },
    {
      name: "手動支出",
      color: "#f97316",
      amount: calculateSourceTypeExpense(filteredTransactions, "manual"),
    },
  ];
  const necessaryVsOptional = [
    { name: "必要支出", color: "#0ea5e9", amount: summary.necessaryExpense },
    { name: "非必要支出", color: "#f43f5e", amount: summary.nonNecessaryExpense },
  ];
  const monthlyTrend = groupMonthly(filteredTransactions);
  const nonNecessaryRanking = groupByCategory(
    filteredTransactions,
    categories.filter((category) => category.type === "expense"),
    (transaction) =>
      isExpense(transaction) && transaction.necessity === "非必要",
  );
  const kpis = [
    { label: "收入", value: formatMoney(summary.income), tone: "text-emerald-600" },
    { label: "支出", value: formatMoney(summary.expense), tone: "text-rose-600" },
    { label: "固定支出", value: formatMoney(summary.fixedExpense), tone: "text-rose-600" },
    { label: "非固定支出", value: formatMoney(summary.variableExpense), tone: "text-orange-600" },
    { label: "必要支出", value: formatMoney(summary.necessaryExpense), tone: "text-orange-600" },
    { label: "非必要支出", value: formatMoney(summary.nonNecessaryExpense), tone: "text-rose-600" },
    { label: "結餘", value: formatMoney(summary.balance), tone: "text-emerald-600" },
    { label: "儲蓄率", value: formatPercent(summary.savingsRate), tone: "text-emerald-600" },
  ];

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f7fb] text-slate-950">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,#dbeafe_0,transparent_34%),radial-gradient(circle_at_100%_0%,#fce7f3_0,transparent_28%),linear-gradient(180deg,#fbfcff_0%,#eef2ff_100%)]" />

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="grid h-11 w-11 place-items-center rounded-full bg-white/80 text-slate-700 shadow-sm shadow-slate-200 backdrop-blur-xl transition hover:bg-white"
            aria-label="返回首頁"
          >
            <BackIcon />
          </Link>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">洞察</p>
            <h1 className="text-2xl font-semibold tracking-normal">分析</h1>
          </div>
          <div className="h-11 w-11" />
        </header>

        <div className="grid grid-cols-5 rounded-full border border-white/70 bg-white/75 p-1 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
          {periods.map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setActivePeriod(period)}
              className={`h-10 rounded-full px-1 text-xs font-medium transition sm:px-4 sm:text-sm ${
                activePeriod === period
                  ? "bg-slate-950 text-white shadow-lg shadow-slate-300/80"
                  : "text-slate-500 hover:bg-white hover:text-slate-900"
              }`}
            >
              {period}
            </button>
          ))}
        </div>

        <section className="grid grid-cols-2 gap-3">
          {kpis.map((item) => (
            <article
              key={item.label}
              className="rounded-[28px] border border-white/75 bg-white/80 p-4 shadow-sm shadow-slate-200/80 backdrop-blur-xl"
            >
              <p className="text-sm font-medium text-slate-500">{item.label}</p>
              <p className={`mt-2 text-xl font-semibold ${item.tone}`}>
                {item.value}
              </p>
            </article>
          ))}
        </section>

        <section className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">
                固定現金流分析
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-normal">
                {activePeriod}固定收支
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <article className="rounded-[24px] bg-emerald-50/80 p-4">
              <p className="text-sm font-medium text-emerald-700">固定收入</p>
              <p className="mt-2 text-xl font-semibold tracking-normal text-emerald-600">
                {formatMoney(fixedCashFlow.fixedIncome)}
              </p>
            </article>
            <article className="rounded-[24px] bg-rose-50/80 p-4">
              <p className="text-sm font-medium text-rose-700">固定支出</p>
              <p className="mt-2 text-xl font-semibold tracking-normal text-rose-600">
                {formatMoney(fixedCashFlow.fixedExpense)}
              </p>
            </article>
            <article className="rounded-[24px] bg-slate-50/80 p-4">
              <p className="text-sm font-medium text-slate-500">固定淨流</p>
              <p
                className={`mt-2 text-xl font-semibold tracking-normal ${
                  fixedCashFlow.fixedNet >= 0
                    ? "text-emerald-600"
                    : "text-rose-600"
                }`}
              >
                {formatMoney(fixedCashFlow.fixedNet)}
              </p>
            </article>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <DonutCard title="支出分類" items={expenseCategories} />
          <DonutCard title="收入分類" items={incomeCategories} />
          <RatioCard title="固定支出 / 手動支出" items={fixedVsManual} />
          <RatioCard title="必要 vs 非必要" items={necessaryVsOptional} />
        </section>

        <section className="grid gap-3 lg:grid-cols-3">
          <TrendCard title="月收入趨勢" data={monthlyTrend} field="income" color="#10b981" />
          <TrendCard title="月支出趨勢" data={monthlyTrend} field="expense" color="#f43f5e" />
          <TrendCard title="月結餘趨勢" data={monthlyTrend} field="balance" color="#0f172a" />
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <RankingCard title="支出分類排行" items={expenseCategories} />
          <RankingCard title="收入分類排行" items={incomeCategories} />
          <RankingCard title="非必要支出排行" items={nonNecessaryRanking} />
        </section>
      </section>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/80 bg-white/85 px-5 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 text-xs font-medium">
          <Link href="/" className="flex flex-col items-center gap-1 text-slate-400">
            <span className="grid h-9 w-12 place-items-center rounded-full">
              <WalletIcon />
            </span>
            首頁
          </Link>
          <Link href="/categories" className="flex flex-col items-center gap-1 text-slate-400">
            <span className="grid h-9 w-12 place-items-center rounded-full">
              <CategoriesIcon />
            </span>
            分類
          </Link>
          <Link href="/add" className="flex flex-col items-center gap-1 text-slate-400">
            <span className="grid h-9 w-12 place-items-center rounded-full">
              <CardIcon />
            </span>
            記帳
          </Link>
          <Link href="/recurring" className="flex flex-col items-center gap-1 text-slate-400">
            <span className="grid h-9 w-12 place-items-center rounded-full">
              <RepeatIcon />
            </span>
            固定支出
          </Link>
          <Link href="/analytics" className="flex flex-col items-center gap-1 text-slate-950">
            <span className="grid h-9 w-12 place-items-center rounded-full bg-slate-950 text-white">
              <ChartIcon />
            </span>
            分析
          </Link>
        </div>
      </nav>
    </main>
  );
}
