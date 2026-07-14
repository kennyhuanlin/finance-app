"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCategories } from "../../categories-context";
import {
  categories as fallbackCategories,
  transactions as fallbackTransactions,
} from "../../data";
import { dedupeCategories } from "../../lib/categories";
import { getCategories, getTransactions } from "../../lib/googleSheets";
import {
  formatTransactionDate,
  getTransactionDisplayName,
  isExpenseTransaction,
  isTransactionInDateRange,
  normalizeTransaction,
  type Transaction,
} from "../../lib/transactions";
import { getMonthDateRange, normalizeMonth } from "../../lib/month";
import { MonthSwitcher } from "../../ui/month-switcher";

type DashboardCategory = {
  id: string;
  name: string;
  emoji: string;
  type: string;
  color: string;
};

type LoadState = "loading" | "success" | "error";

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
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

function safeDecodeCategory(category: string) {
  try {
    return decodeURIComponent(category);
  } catch {
    return category;
  }
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

export default function CategoryDetailPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { categories: contextCategories } = useCategories();
  const { category: categoryParam } = use(params);
  const categoryName = safeDecodeCategory(categoryParam);
  const [selectedMonth, setSelectedMonth] = useState(normalizeMonth());
  const [sourceTransactions, setSourceTransactions] = useState<Transaction[]>(
    [],
  );
  const [sourceCategories, setSourceCategories] = useState<DashboardCategory[]>(
    [],
  );
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    Promise.allSettled([
      getTransactions<Record<string, unknown>>(),
      getCategories<Record<string, unknown>>(),
    ]).then(([transactionsResult, categoriesResult]) => {
      if (!isMounted) {
        return;
      }

      if (transactionsResult.status === "fulfilled") {
        setSourceTransactions(
          transactionsResult.value.map((transaction, index) =>
            normalizeTransaction(transaction, index),
          ),
        );
        setLoadState("success");
        setErrorMessage("");
      } else {
        setSourceTransactions(
          fallbackTransactions.map((transaction, index) =>
            normalizeTransaction(transaction, index),
          ),
        );
        setLoadState("error");
        setErrorMessage(
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
        setErrorMessage("分類資料讀取失敗");
      }
    });

    return () => {
      isMounted = false;
    };
  }, [contextCategories]);

  const activeCategory = sourceCategories.find(
    (category) => category.name === categoryName && category.type === "expense",
  );
  const monthRange = getMonthDateRange(selectedMonth);
  const monthExpenseTransactions = sourceTransactions.filter(
    (transaction) =>
      isExpenseTransaction(transaction) &&
      isTransactionInDateRange(transaction, monthRange),
  );
  const categoryTransactions = monthExpenseTransactions
    .filter(
      (transaction) =>
        transaction.category === categoryName ||
        (activeCategory !== undefined &&
          transaction.categoryId === activeCategory.id),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const totalExpense = categoryTransactions.reduce(
    (sum, transaction) => sum + Number(transaction.amount),
    0,
  );
  const monthTotalExpense = monthExpenseTransactions.reduce(
    (sum, transaction) => sum + Number(transaction.amount),
    0,
  );
  const averageExpense =
    categoryTransactions.length > 0
      ? totalExpense / categoryTransactions.length
      : 0;
  const categoryRatio =
    monthTotalExpense > 0 ? (totalExpense / monthTotalExpense) * 100 : 0;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f7fb] text-slate-950">
      <Suspense fallback={null}>
        <MonthParamSync onMonthChange={setSelectedMonth} />
      </Suspense>
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,#dbeafe_0,transparent_35%),radial-gradient(circle_at_100%_0%,#fce7f3_0,transparent_30%),linear-gradient(180deg,#fbfcff_0%,#eef2ff_100%)]" />

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:px-8 lg:pb-10">
        <header className="flex flex-col gap-5">
          <Link
            href="/"
            className="inline-flex w-fit items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm shadow-slate-200/80 transition hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-200"
          >
            <ArrowLeft size={16} strokeWidth={2.4} />
            返回首頁
          </Link>

          <div className="flex flex-col gap-4 rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl sm:flex-row sm:items-start sm:justify-between sm:p-6">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">分類明細</p>
              <div className="mt-2 flex min-w-0 items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-xl">
                  {activeCategory?.emoji ?? "📦"}
                </span>
                <h1 className="truncate text-3xl font-semibold tracking-normal text-slate-950">
                  {categoryName}
                </h1>
              </div>
            </div>
            <Suspense fallback={null}>
              <MonthSwitcher month={selectedMonth} />
            </Suspense>
          </div>
        </header>

        {loadState === "loading" ? (
          <p className="rounded-full bg-white/75 px-4 py-2 text-sm font-medium text-slate-500 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
            Loading...
          </p>
        ) : null}

        {errorMessage ? (
          <p className="rounded-full bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600 shadow-sm shadow-rose-100/80">
            {errorMessage}
          </p>
        ) : null}

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "當月總支出", value: formatMoney(totalExpense) },
            { label: "交易筆數", value: `${categoryTransactions.length} 筆` },
            { label: "平均每筆", value: formatMoney(averageExpense) },
            { label: "占當月支出", value: `${Math.round(categoryRatio)}%` },
          ].map((item) => (
            <article
              key={item.label}
              className="rounded-[28px] border border-white/75 bg-white/80 p-4 shadow-sm shadow-slate-200/80 backdrop-blur-xl sm:p-5"
            >
              <p className="text-sm font-medium text-slate-500">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-semibold tracking-normal text-slate-950 sm:text-2xl">
                {item.value}
              </p>
            </article>
          ))}
        </section>

        <section className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">交易明細</p>
              <h2 className="mt-1 text-xl font-semibold tracking-normal">
                {categoryTransactions.length} 筆支出
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-600">
              {formatMoney(totalExpense)}
            </span>
          </div>

          <div className="mt-5 divide-y divide-slate-100">
            {categoryTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-600">
                    -
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {getTransactionDisplayName(transaction)}
                    </p>
                    <p className="mt-1 truncate text-xs font-medium text-slate-400">
                      {formatTransactionDate(transaction.date)} ·{" "}
                      {transaction.category}
                      {transaction.account ? ` · ${transaction.account}` : ""}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold text-slate-950">
                  -{formatMoney(transaction.amount)}
                </p>
              </div>
            ))}
            {categoryTransactions.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 p-4 text-sm font-medium text-slate-500">
                這個月份沒有「{categoryName}」支出明細
              </p>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
