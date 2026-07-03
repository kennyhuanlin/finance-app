"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCategories } from "../categories-context";
import { formatCategoryLabel } from "../lib/categories";
import { createTransaction, getTransactions } from "../lib/googleSheets";

type EntryType = "收入" | "支出";

type Entry = {
  id: string;
  createdAt?: string;
  date: string;
  type: EntryType;
  category: string;
  amount: number;
  note: string;
};

const calculatorKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatAmountDisplay(value: string) {
  if (!value) {
    return "0";
  }

  const [integerPart, decimalPart] = value.split(".");
  const formattedInteger = new Intl.NumberFormat("zh-TW").format(
    Number(integerPart || "0"),
  );

  return decimalPart === undefined
    ? formattedInteger
    : `${formattedInteger}.${decimalPart}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeEntry(transaction: Record<string, unknown>, index: number): Entry {
  return {
    id: String(transaction.id ?? `sheet-tx-${index}`),
    createdAt:
      transaction.createdAt === undefined
        ? undefined
        : String(transaction.createdAt),
    date: String(transaction.date ?? ""),
    type:
      transaction.type === "收入" || transaction.type === "income"
        ? "收入"
        : "支出",
    category: String(transaction.category ?? ""),
    amount: Number(transaction.amount ?? 0),
    note: String(transaction.note ?? ""),
  };
}

function sortEntriesByCreatedAt(entries: Entry[]) {
  return [...entries].sort((a, b) =>
    (b.createdAt || b.date).localeCompare(a.createdAt || a.date),
  );
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

export default function AddRecordPage() {
  const router = useRouter();
  const { categories } = useCategories();
  const expenseCategories = categories.filter((item) => item.type === "expense");
  const incomeCategories = categories.filter((item) => item.type === "income");
  const [entryType, setEntryType] = useState<EntryType>("支出");
  const [date, setDate] = useState(today);
  const [category, setCategory] = useState("");
  const [necessity, setNecessity] = useState<"必要" | "非必要">("必要");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);

  async function loadRecentEntries() {
    const sheetTransactions = await getTransactions<Record<string, unknown>>();

    return sortEntriesByCreatedAt(
      sheetTransactions.map((transaction, index) =>
        normalizeEntry(transaction, index),
      ),
    ).slice(0, 5);
  }

  async function fetchRecentEntries() {
    setEntries(await loadRecentEntries());
  }

  useEffect(() => {
    let isMounted = true;

    loadRecentEntries()
      .then((recentEntries) => {
        if (isMounted) {
          setEntries(recentEntries);
        }
      })
      .catch(() => {
        if (isMounted) {
          setEntries([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const categoryOptions = useMemo(
    () => (entryType === "收入" ? incomeCategories : expenseCategories),
    [entryType, expenseCategories, incomeCategories],
  );

  const selectedCategory = categoryOptions.some((item) => item.name === category)
    ? category
    : categoryOptions[0]?.name ?? "";
  const recentEntries = entries.slice(0, 5);
  const canSubmit = Number(amount) > 0 && selectedCategory.trim().length > 0;

  function handleTypeChange(type: EntryType) {
    setEntryType(type);
    setCategory(
      type === "收入"
        ? incomeCategories[0]?.name ?? ""
        : expenseCategories[0]?.name ?? "",
    );
    if (type === "支出") {
      setNecessity("必要");
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit || isSubmitting) {
      return;
    }

    const isExpense = entryType === "支出";
    const nextEntry = {
      id: `tx-${Date.now()}`,
      createdAt: new Date().toISOString(),
      date,
      type: entryType,
      expenseType: "",
      necessity: isExpense ? necessity : "",
      category: selectedCategory,
      amount: Number(amount),
      note: note.trim() || selectedCategory,
      sourceType: "manual",
      recurringId: "",
    };

    setIsSubmitting(true);
    setStatusMessage("");

    try {
      await createTransaction(nextEntry);
      await fetchRecentEntries();
      setAmount("");
      setNote("");
      setStatusMessage("新增成功");
      router.push("/");
    } catch {
      setStatusMessage("新增失敗，請稍後再試");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCalculatorTap(key: string) {
    setAmount((current) => {
      if (key === ".") {
        return current.includes(".") ? current : `${current || "0"}.`;
      }

      const [, decimalPart] = current.split(".");

      if (decimalPart && decimalPart.length >= 2) {
        return current;
      }

      if (current === "0") {
        return key;
      }

      return `${current}${key}`;
    });
  }

  function handleDeleteAmount() {
    setAmount((current) => current.slice(0, -1));
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f7fb] text-slate-950">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,#dbeafe_0,transparent_34%),radial-gradient(circle_at_100%_0%,#fce7f3_0,transparent_28%),linear-gradient(180deg,#fbfcff_0%,#eef2ff_100%)]" />

      <section className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-5 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="grid h-11 w-11 place-items-center rounded-full bg-white/80 text-slate-700 shadow-sm shadow-slate-200 backdrop-blur-xl transition hover:bg-white"
            aria-label="返回總覽"
          >
            <BackIcon />
          </Link>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">新增一筆</p>
            <h1 className="text-2xl font-semibold tracking-normal">記帳</h1>
          </div>
          <div className="h-11 w-11" />
        </header>

        <form id="add-record-form" onSubmit={handleSubmit} className="grid gap-4">
          {statusMessage ? (
            <p
              className={`rounded-[22px] px-4 py-3 text-sm font-medium ${
                statusMessage === "新增成功"
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-rose-50 text-rose-600"
              }`}
            >
              {statusMessage}
            </p>
          ) : null}

          <section className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
            <div className="grid grid-cols-2 rounded-full bg-slate-100 p-1">
              {(["支出", "收入"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  className={`h-11 rounded-full text-sm font-semibold transition ${
                    entryType === type
                      ? type === "收入"
                        ? "bg-emerald-500 text-white shadow-lg shadow-emerald-100"
                        : "bg-slate-950 text-white shadow-lg shadow-slate-200"
                      : "text-slate-500"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            <label className="mt-6 block">
              <span className="text-sm font-medium text-slate-500">金額</span>
              <div className="mt-2 flex items-center rounded-[24px] bg-slate-50 px-4 py-4">
                <span className="mr-2 text-2xl font-semibold text-slate-400">
                  NT$
                </span>
                <div className="min-w-0 flex-1 overflow-hidden text-right text-5xl font-semibold tracking-normal text-slate-950">
                  {formatAmountDisplay(amount)}
                </div>
              </div>
            </label>
          </section>

          <section className="grid gap-3 rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-500">日期</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-13 rounded-[22px] border border-transparent bg-slate-50 px-4 text-base font-medium text-slate-950 outline-none transition focus:border-slate-200 focus:bg-white"
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-500">分類</span>
              <select
                value={selectedCategory}
                onChange={(event) => setCategory(event.target.value)}
                className="h-13 rounded-[22px] border border-transparent bg-slate-50 px-4 text-base font-medium text-slate-950 outline-none transition focus:border-slate-200 focus:bg-white"
              >
                {categoryOptions.map((item, index) => (
                  <option key={`${item.id}-${index}`} value={item.name}>
                    {formatCategoryLabel(item)}
                  </option>
                ))}
              </select>
            </label>

            {entryType === "支出" ? (
              <div className="grid gap-2">
                <span className="text-sm font-medium text-slate-500">
                  必要性
                </span>
                <div className="grid grid-cols-2 rounded-full bg-slate-100 p-1">
                  {(["必要", "非必要"] as const).map((item, index) => (
                    <button
                      key={`${item}-${index}`}
                      type="button"
                      onClick={() => setNecessity(item)}
                      className={`h-11 rounded-full text-sm font-semibold transition ${
                        necessity === item
                          ? "bg-slate-950 text-white shadow-lg shadow-slate-200"
                          : "text-slate-500"
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <label className="grid gap-2">
              <span className="text-sm font-medium text-slate-500">備註</span>
              <input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：午餐、房租、保母補助"
                className="h-13 rounded-[22px] border border-transparent bg-slate-50 px-4 text-base font-medium text-slate-950 outline-none transition placeholder:text-slate-300 focus:border-slate-200 focus:bg-white"
              />
            </label>
          </section>
        </form>

        <section className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="mt-1 text-xl font-semibold tracking-normal">
                最近新增
              </h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-600">
              {entries.length} 筆
            </span>
          </div>

          <div className="mt-4 divide-y divide-slate-100">
            {recentEntries.map((item, index) => {
              const isIncome = item.type === "收入";

              return (
                <div
                  key={`${item.date}-${item.note}-${index}`}
                  className="flex items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {item.note}
                    </p>
                    <p className="mt-1 truncate text-xs font-medium text-slate-400">
                      {item.date} · {item.category}
                    </p>
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
        </section>
      </section>

      <div className="relative border-t border-white/80 bg-white/90 px-4 pt-3 pb-[calc(8rem+env(safe-area-inset-bottom))] shadow-[0_-12px_32px_rgba(15,23,42,0.08)]">
        <div className="mx-auto grid max-w-xl gap-3">
          <div className="grid grid-cols-3 gap-2">
            {calculatorKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleCalculatorTap(key)}
                className="flex h-13 items-center justify-center rounded-[22px] bg-white text-2xl font-semibold text-slate-950 shadow-sm shadow-slate-200 transition active:scale-[0.98] active:bg-slate-100"
              >
                {key}
              </button>
            ))}
            <button
              type="button"
              onClick={handleDeleteAmount}
              className="flex h-13 items-center justify-center rounded-[22px] bg-slate-100 text-2xl font-semibold text-slate-700 shadow-sm shadow-slate-200 transition active:scale-[0.98] active:bg-slate-200"
              aria-label="刪除金額"
            >
              ⌫
            </button>
          </div>
          <button
            type="submit"
            form="add-record-form"
            disabled={!canSubmit || isSubmitting}
            className="flex h-14 w-full items-center justify-center rounded-full bg-slate-950 text-base font-semibold text-white shadow-lg shadow-slate-300/80 transition active:scale-[0.99] disabled:bg-slate-300 disabled:shadow-none"
          >
            {isSubmitting ? "儲存中..." : "新增紀錄"}
          </button>
          <div className="h-24" aria-hidden="true" />
        </div>
      </div>
    </main>
  );
}
