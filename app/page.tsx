"use client";

import { useState } from "react";
import Link from "next/link";
import { useCategories } from "./categories-context";
import { recurringRules, transactions } from "./data";

const periods = ["本月", "上月", "本季", "今年", "累積餘額"] as const;

const periodTitles: Record<(typeof periods)[number], string> = {
  本月: "2026年5月",
  上月: "2026年4月",
  本季: "2026年第2季",
  今年: "2026全年",
  累積餘額: "累積餘額",
};

const kpis = [
  {
    label: "收入",
    cumulativeLabel: "累積收入",
    key: "income",
    accent: "from-sky-300 to-blue-500",
    tone: "bg-sky-50 text-sky-700",
    icon: "↗",
  },
  {
    label: "支出",
    cumulativeLabel: "累積支出",
    key: "expense",
    accent: "from-rose-300 to-pink-500",
    tone: "bg-rose-50 text-rose-700",
    icon: "↘",
  },
  {
    label: "結餘",
    cumulativeLabel: "目前餘額",
    key: "balance",
    accent: "from-emerald-300 to-teal-500",
    tone: "bg-emerald-50 text-emerald-700",
    icon: "✓",
  },
  {
    label: "固定支出",
    cumulativeLabel: "固定支出",
    key: "fixedExpense",
    accent: "from-violet-300 to-indigo-500",
    tone: "bg-violet-50 text-violet-700",
    icon: "⟳",
  },
] as const;

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

type Period = (typeof periods)[number];
type Transaction = (typeof transactions)[number];

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

function isIncomeTransaction(transaction: Transaction) {
  return transaction.type === "收入" || transaction.type === "income";
}

function isExpenseTransaction(transaction: Transaction) {
  return transaction.type === "支出" || transaction.type === "expense";
}

function isFixedExpenseTransaction(transaction: Transaction) {
  return (
    isExpenseTransaction(transaction) &&
    (transaction.expenseType === "固定" || transaction.expenseType === "fixed")
  );
}

function calculateSummary(sourceTransactions: Transaction[]) {
  const income = sourceTransactions
    .filter(isIncomeTransaction)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const expense = sourceTransactions
    .filter(isExpenseTransaction)
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const fixedExpense = sourceTransactions
    .filter(isFixedExpenseTransaction)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return {
    income,
    expense,
    balance: income - expense,
    fixedExpense,
  };
}

function WalletIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 12h4" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 19V9m7 10V5m7 14v-7"
      />
    </svg>
  );
}

function CategoriesIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5.5 5.5h5v5h-5v-5ZM13.5 5.5h5v5h-5v-5ZM5.5 13.5h5v5h-5v-5ZM13.5 13.5h5v5h-5v-5Z"
      />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 8h16M6 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
      />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 2.5 20.5 6 17 9.5M3.5 11V9a3 3 0 0 1 3-3h14M7 21.5 3.5 18 7 14.5M20.5 13v2a3 3 0 0 1-3 3h-14"
      />
    </svg>
  );
}

export default function Home() {
  const { categories } = useCategories();
  const [activePeriod, setActivePeriod] =
    useState<(typeof periods)[number]>("本月");

  const activePeriodTitle = periodTitles[activePeriod];
  const isCumulative = activePeriod === "累積餘額";
  const filteredTransactions = filterTransactionsByPeriod(
    transactions,
    activePeriod,
  );
  const activeSummary = calculateSummary(filteredTransactions);
  const recentTransactions = [...filteredTransactions].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  const expenseCategories = categories
    .filter((category) => category.type === "expense")
    .map((category) => ({
      ...category,
      amount: filteredTransactions
        .filter(
          (transaction) =>
            isExpenseTransaction(transaction) &&
            (transaction.categoryId === category.id ||
              transaction.category === category.name),
        )
        .reduce((sum, transaction) => sum + transaction.amount, 0),
    }))
    .filter((category) => category.amount > 0);

  const totalCategoryExpense = expenseCategories.reduce(
    (sum, item) => sum + item.amount,
    0,
  );

  const chartGradient = (() => {
    if (totalCategoryExpense === 0) {
      return "#e2e8f0 0% 100%";
    }

    let cursor = 0;

    return expenseCategories
      .map((item) => {
        const start = cursor;
        const end = cursor + (item.amount / totalCategoryExpense) * 100;
        cursor = end;

        return `${item.color} ${start}% ${end}%`;
      })
      .join(", ");
  })();

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f7fb] text-slate-950">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,#dbeafe_0,transparent_35%),radial-gradient(circle_at_100%_0%,#fce7f3_0,transparent_30%),linear-gradient(180deg,#fbfcff_0%,#eef2ff_100%)]" />

      <section className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:pb-10">
        <header className="flex flex-col gap-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">
                {activePeriodTitle}
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">
                財務總覽
              </h1>
            </div>
            <div className="grid h-11 w-11 place-items-center rounded-full bg-white/80 text-lg shadow-sm shadow-slate-200 backdrop-blur-xl">
              $
            </div>
          </div>

          <div className="grid grid-cols-5 rounded-full border border-white/70 bg-white/75 p-1 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
            {periods.map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setActivePeriod(period)}
                aria-pressed={activePeriod === period}
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
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((item) => (
            <article
              key={item.key}
              className="rounded-[28px] border border-white/75 bg-white/80 p-4 shadow-sm shadow-slate-200/80 backdrop-blur-xl sm:p-5"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span
                  className={`grid h-9 w-9 place-items-center rounded-2xl text-sm font-semibold ${item.tone}`}
                >
                  {item.icon}
                </span>
                <span
                  className={`h-2 w-10 rounded-full bg-gradient-to-r ${item.accent}`}
                />
              </div>
              <p className="text-sm font-medium text-slate-500">
                {isCumulative ? item.cumulativeLabel : item.label}
              </p>
              <p className="mt-2 text-xl font-semibold tracking-normal text-slate-950 sm:text-2xl">
                {formatMoney(activeSummary[item.key])}
              </p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">支出分類</p>
                <h2 className="mt-1 text-xl font-semibold tracking-normal">
                  {activePeriod}花費分布
                </h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
                {formatMoney(totalCategoryExpense)}
              </span>
            </div>

            <div className="mt-7 flex flex-col items-center gap-7 sm:flex-row">
              <div
                className="grid aspect-square w-48 shrink-0 place-items-center rounded-full sm:w-52"
                style={{ background: `conic-gradient(${chartGradient})` }}
              >
                <div className="grid h-28 w-28 place-items-center rounded-full bg-white shadow-inner shadow-slate-200 sm:h-32 sm:w-32">
                  <div className="text-center">
                    <p className="text-xs font-medium text-slate-400">總支出</p>
                    <p className="mt-1 text-lg font-semibold sm:text-xl">
                      {formatMoney(totalCategoryExpense)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid w-full gap-3">
                {expenseCategories.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-slate-100 text-base">
                        {item.emoji}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-700">
                          {item.name}
                        </p>
                        <div className="mt-1 h-1.5 w-24 rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width:
                                totalCategoryExpense > 0
                                  ? `${(item.amount / totalCategoryExpense) * 100}%`
                                  : "0%",
                              backgroundColor: item.color,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-slate-950">
                      {formatMoney(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">最近交易</p>
                <h2 className="mt-1 text-xl font-semibold tracking-normal">
                  帳戶活動
                </h2>
              </div>
              <Link
                href="/transactions"
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
              >
                查看全部
              </Link>
            </div>

            <div className="mt-5 divide-y divide-slate-100">
              {recentTransactions.map((item) => {
                const isIncome = isIncomeTransaction(item);

                return (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 py-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold ${
                          isIncome
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {isIncome ? "+" : "-"}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {item.note}
                        </p>
                        <p className="mt-1 truncate text-xs font-medium text-slate-400">
                          {formatDate(item.date)} · {item.category}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`shrink-0 text-sm font-semibold ${
                        isIncome ? "text-emerald-600" : "text-slate-950"
                      }`}
                    >
                      {isIncome ? "+" : "-"}
                      {formatMoney(item.amount)}
                    </p>
                  </div>
                );
              })}
            </div>
          </article>
        </section>

        <section className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">固定支出</p>
              <h2 className="mt-1 text-xl font-semibold tracking-normal">
                每月自動規則
              </h2>
            </div>
            <Link
              href="/recurring"
              className="rounded-full bg-violet-50 px-3 py-1 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
            >
              管理 {recurringRules.filter((item) => item.enabled).length} 項
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {recurringRules.map((rule, index) => (
              <article
                key={rule.name}
                className="flex items-center justify-between gap-4 rounded-[24px] bg-slate-50/80 p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {rule.name}
                    </p>
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        rule.enabled ? "bg-emerald-400" : "bg-slate-300"
                      }`}
                    />
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-400">
                    {rule.category} ·{" "}
                    {rule.frequency === "monthly" ? "每月" : rule.frequency} ·
                    下次 2026/06/{String(index + 1).padStart(2, "0")}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-slate-950">
                  {formatMoney(rule.amount)}
                </p>
              </article>
            ))}
          </div>
        </section>
      </section>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-white/80 bg-white/85 px-5 pb-[max(0.9rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_32px_rgba(15,23,42,0.08)] backdrop-blur-2xl sm:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {[
            { label: "首頁", href: "/", icon: WalletIcon, active: true },
            { label: "分類", href: "/categories", icon: CategoriesIcon, active: false },
            { label: "記帳", href: "/add", icon: CardIcon, active: false },
            { label: "固定支出", href: "/recurring", icon: RepeatIcon, active: false },
            { label: "分析", href: "#", icon: ChartIcon, active: false },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex flex-col items-center gap-1 text-xs font-medium ${
                  item.active ? "text-slate-950" : "text-slate-400"
                }`}
              >
                <span
                  className={`grid h-9 w-12 place-items-center rounded-full ${
                    item.active ? "bg-slate-950 text-white" : "bg-transparent"
                  }`}
                >
                  <Icon />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </main>
  );
}
