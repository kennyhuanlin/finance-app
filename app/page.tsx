"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCategories } from "./categories-context";
import {
  categories as fallbackCategories,
  transactions,
} from "./data";
import { dedupeCategories } from "./lib/categories";
import { getCategories, getTransactions } from "./lib/googleSheets";
import {
  formatTransactionDate,
  getTransactionDisplayName,
  isExpenseTransaction,
  isIncomeTransaction,
  isRecurringExpenseTransaction,
  isTransactionInDateRange,
  normalizeTransaction,
  parseTransactionDate,
  type Transaction,
} from "./lib/transactions";
import { getMonthDateRange, normalizeMonth } from "./lib/month";
import { MonthSwitcher } from "./ui/month-switcher";

const periods = ["本月", "上月", "本季", "今年", "累積餘額"] as const;

const kpis = [
  {
    label: "收入",
    cumulativeLabel: "累積收入",
    key: "income",
    accent: "from-emerald-200 to-teal-500",
    tone: "bg-emerald-50 text-emerald-600",
    icon: "income",
  },
  {
    label: "支出",
    cumulativeLabel: "累積支出",
    key: "expense",
    accent: "from-orange-200 to-rose-500",
    tone: "bg-orange-50 text-orange-600",
    icon: "expense",
  },
  {
    label: "結餘",
    cumulativeLabel: "目前餘額",
    key: "balance",
    accent: "from-emerald-300 to-teal-500",
    tone: "bg-teal-50 text-teal-600",
    icon: "balance",
  },
  {
    label: "固定支出",
    cumulativeLabel: "固定支出",
    key: "fixedExpense",
    accent: "from-violet-300 to-indigo-500",
    tone: "bg-violet-50 text-violet-600",
    icon: "recurring",
  },
] as const;

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

type Period = (typeof periods)[number];
type DashboardCategory = {
  id: string;
  name: string;
  emoji: string;
  type: string;
  color: string;
};

type LoadState = "loading" | "success" | "error";

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

function formatPeriodTitle(period: Period) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  if (period === "本月") {
    return `${year}年${month + 1}月`;
  }

  if (period === "上月") {
    const previousMonth = new Date(year, month - 1, 1);

    return `${previousMonth.getFullYear()}年${previousMonth.getMonth() + 1}月`;
  }

  if (period === "本季") {
    return `${year}年第${Math.floor(month / 3) + 1}季`;
  }

  if (period === "今年") {
    return `${year}全年`;
  }

  return "累積餘額";
}

function filterTransactionsByPeriod(
  sourceTransactions: Transaction[],
  period: Period,
) {
  const range = getDateRange(period);

  if (!range) {
    return sourceTransactions;
  }

  return sourceTransactions.filter((transaction) => {
    const date = parseTransactionDate(transaction.date);

    return (
      date !== null &&
      toDateKey(date) >= range.start &&
      toDateKey(date) <= range.end
    );
  });
}

function calculateSummary(sourceTransactions: Transaction[]) {
  const income = sourceTransactions
    .filter(isIncomeTransaction)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const expense = sourceTransactions
    .filter(isExpenseTransaction)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const fixedExpense = sourceTransactions
    .filter(isRecurringExpenseTransaction)
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  return {
    income,
    expense,
    balance: income - expense,
    fixedExpense,
  };
}

function periodToQueryValue(period: Period) {
  if (period === "本月") {
    return "thisMonth";
  }

  if (period === "上月") {
    return "lastMonth";
  }

  if (period === "本季") {
    return "quarter";
  }

  if (period === "今年") {
    return "year";
  }

  return "all";
}

function normalizeCategory(
  category: Record<string, unknown>,
  index: number,
): DashboardCategory {
  return {
    id: String(category.id ?? `sheet-category-${index}`),
    name: String(category.name ?? ""),
    emoji: String(category.emoji ?? "📦"),
    type: String(category.type ?? "expense"),
    color: String(category.color ?? "#64748b"),
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

function KpiIcon({ type }: { type: (typeof kpis)[number]["icon"] }) {
  if (type === "income") {
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
          d="M5 17.5 15.5 7M9 7h6.5v6.5"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 19.5h15"
          opacity="0.45"
        />
      </svg>
    );
  }

  if (type === "expense") {
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
          d="M5 6.5 15.5 17M9 17h6.5v-6.5"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 4.5h15"
          opacity="0.45"
        />
      </svg>
    );
  }

  if (type === "balance") {
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
          d="M5 12.5 9.5 17 19 7"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.5 20h15"
          opacity="0.45"
        />
      </svg>
    );
  }

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
        d="M17 4.5 20 7.5 17 10.5M4 11V9.5a2 2 0 0 1 2-2h14"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7 19.5 4 16.5 7 13.5M20 13v1.5a2 2 0 0 1-2 2H4"
      />
    </svg>
  );
}

function MonthParamSync({
  onMonthChange,
}: {
  onMonthChange: (month: string) => void;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    onMonthChange(normalizeMonth(searchParams.get("month")));
  }, [onMonthChange, searchParams]);

  return null;
}

export default function Home() {
  const { categories: contextCategories } = useCategories();
  const [sourceTransactions, setSourceTransactions] = useState<Transaction[]>(
    [],
  );
  const [sourceCategories, setSourceCategories] = useState<DashboardCategory[]>(
    [],
  );
  const [transactionsLoadState, setTransactionsLoadState] =
    useState<LoadState>("loading");
  const [transactionsErrorMessage, setTransactionsErrorMessage] = useState("");
  const [activePeriod, setActivePeriod] =
    useState<(typeof periods)[number]>("本月");
  const [selectedMonth, setSelectedMonth] = useState(normalizeMonth());

  useEffect(() => {
    let isMounted = true;

    Promise.allSettled([
      getTransactions<Record<string, unknown>>(),
      getCategories<Record<string, unknown>>(),
    ])
      .then(([transactionsResult, categoriesResult]) => {
        if (!isMounted) {
          return;
        }

        if (transactionsResult.status === "fulfilled") {
          setSourceTransactions(
            transactionsResult.value.map((transaction, index) =>
              normalizeTransaction(transaction, index),
            ),
          );
          setTransactionsLoadState("success");
          setTransactionsErrorMessage("");
        } else {
          setSourceTransactions(transactions);
          setTransactionsLoadState("error");
          setTransactionsErrorMessage(
            transactionsResult.reason instanceof Error
              ? transactionsResult.reason.message
              : "交易資料讀取失敗",
          );
        }

        setSourceCategories(
          categoriesResult.status === "fulfilled"
            ? dedupeCategories(
                categoriesResult.value.map((category, index) =>
                  normalizeCategory(category, index),
                ),
              )
            : contextCategories.length > 0
              ? dedupeCategories(contextCategories)
              : dedupeCategories(fallbackCategories),
        );

        if (
          transactionsResult.status === "fulfilled" &&
          categoriesResult.status === "rejected"
        ) {
          setTransactionsErrorMessage("分類資料讀取失敗");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [contextCategories]);

  const activePeriodTitle = formatPeriodTitle(activePeriod);
  const isCumulative = activePeriod === "累積餘額";
  const filteredTransactions = filterTransactionsByPeriod(
    sourceTransactions,
    activePeriod,
  );
  const activeSummary = calculateSummary(filteredTransactions);
  const recentTransactions = [...filteredTransactions].sort((a, b) =>
    (b.createdAt || b.date).localeCompare(a.createdAt || a.date),
  ).slice(0, 5);
  const selectedMonthRange = getMonthDateRange(selectedMonth);
  const monthTransactions = sourceTransactions.filter((transaction) =>
    isTransactionInDateRange(transaction, selectedMonthRange),
  );

  const expenseCategories = sourceCategories
    .filter((category) => category.type === "expense")
    .map((category) => ({
      ...category,
      amount: monthTransactions
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
      <Suspense fallback={null}>
        <MonthParamSync onMonthChange={setSelectedMonth} />
      </Suspense>
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

        {transactionsLoadState === "loading" ? (
          <p className="rounded-full bg-white/75 px-4 py-2 text-sm font-medium text-slate-500 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
            Loading...
          </p>
        ) : null}

        {transactionsErrorMessage ? (
          <p className="rounded-full bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600 shadow-sm shadow-rose-100/80">
            {transactionsErrorMessage}
          </p>
        ) : null}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((item) => (
            <article
              key={item.key}
              className="h-full rounded-[28px] border border-white/75 bg-white/80 p-4 shadow-sm shadow-slate-200/80 backdrop-blur-xl transition sm:p-5"
            >
                <div className="mb-4 flex items-center justify-between gap-3">
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-2xl text-sm font-semibold ${item.tone}`}
                  >
                    <KpiIcon type={item.icon} />
                  </span>
                  {item.key === "income" || item.key === "expense" ? (
                    <Link
                      href={`/transactions?type=${item.key}&period=${periodToQueryValue(activePeriod)}`}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-200"
                    >
                      查看
                    </Link>
                  ) : (
                    <span
                      className={`h-2 w-10 rounded-full bg-gradient-to-r ${item.accent}`}
                    />
                  )}
                </div>
                <p className="text-sm font-medium text-slate-500">
                  {isCumulative ? item.cumulativeLabel : item.label}
                </p>
                <p className="mt-2 text-xl font-semibold tracking-normal text-slate-950 sm:text-2xl">
                  {transactionsLoadState === "loading"
                    ? "Loading..."
                    : formatMoney(activeSummary[item.key])}
                </p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">支出分類</p>
                <h2 className="mt-1 text-xl font-semibold tracking-normal">
                  本月花費分布
                </h2>
              </div>
              <Suspense fallback={null}>
                <MonthSwitcher month={selectedMonth} />
              </Suspense>
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
                {expenseCategories.map((item, index) => (
                  <Link
                    key={`${item.id || item.name}-${index}`}
                    href={`/categories/${encodeURIComponent(item.name)}?month=${selectedMonth}`}
                    className="flex items-center justify-between gap-3 rounded-2xl p-2 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-slate-100 text-base">
                        {item.emoji}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-700">
                          {item.name}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded-full bg-slate-100">
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
                          <span className="text-xs font-medium text-slate-400">
                            {totalCategoryExpense > 0
                              ? `${Math.round((item.amount / totalCategoryExpense) * 100)}%`
                              : "0%"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold text-slate-950">
                        {formatMoney(item.amount)}
                      </span>
                      <span className="text-lg font-semibold text-slate-300">
                        ›
                      </span>
                    </div>
                  </Link>
                ))}
                {expenseCategories.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-500">
                    這個月份還沒有支出分類資料
                  </p>
                ) : null}
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
                href={`/transactions?period=${periodToQueryValue(activePeriod)}`}
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
                          {getTransactionDisplayName(item)}
                        </p>
                        <p className="mt-1 truncate text-xs font-medium text-slate-400">
                          {formatTransactionDate(item.date)} · {item.category}
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

      </section>

    </main>
  );
}
