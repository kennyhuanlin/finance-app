"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCategories } from "../categories-context";
import { formatCategoryLabel } from "../lib/categories";
import { getTransactionDisplayName } from "../lib/transactions";
import {
  createTransaction,
  deleteTransaction as deleteSheetTransaction,
  getTransactions,
  updateTransaction,
} from "../lib/googleSheets";
import CalculatorModal from "../ui/calculator-modal";

type Transaction = {
  id: string;
  date: string;
  type: string;
  category: string;
  categoryId?: string;
  amount: number;
  note: string;
  memo?: string;
  sourceType: string;
  recurringId: string | null;
  expenseType: string | null;
  nature: string;
  necessity: string;
  createdAt?: string;
};

type TransactionForm = Omit<Transaction, "amount"> & {
  amount: string;
};

const typeOptions = ["支出", "收入", "transfer"];
const necessityOptions = ["必要", "非必要"];
const TRANSACTIONS_PAGE_SIZE = 10;

type NormalizedPeriod = "thisMonth" | "lastMonth" | "quarter" | "year" | "all";

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(date));
}

function normalizeDate(value: string) {
  if (!value) {
    return "";
  }

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;

    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? "" : toDateKey(parsed);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDateRange(period: NormalizedPeriod) {
  if (period === "all") {
    return null;
  }

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  if (period === "thisMonth") {
    return {
      start: toDateKey(new Date(year, month, 1)),
      end: toDateKey(new Date(year, month + 1, 0)),
    };
  }

  if (period === "lastMonth") {
    return {
      start: toDateKey(new Date(year, month - 1, 1)),
      end: toDateKey(new Date(year, month, 0)),
    };
  }

  if (period === "quarter") {
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

function normalizePeriodFilter(value: string | null): NormalizedPeriod {
  if (
    value === "thisMonth" ||
    value === "lastMonth" ||
    value === "quarter" ||
    value === "year" ||
    value === "all"
  ) {
    return value;
  }

  return "all";
}

function formatPeriodFilterLabel(period: NormalizedPeriod) {
  const labels: Record<NormalizedPeriod, string> = {
    thisMonth: "本月",
    lastMonth: "上月",
    quarter: "本季",
    year: "今年",
    all: "累積餘額",
  };

  return labels[period];
}

function isIncomeTransaction(transaction: Transaction) {
  const type = transaction.type.trim();

  return type === "收入" || type === "income";
}

function isExpenseTransaction(transaction: Transaction) {
  const type = transaction.type.trim();

  return type === "支出" || type === "expense";
}

function isRecurringTransaction(transaction: Transaction) {
  return transaction.sourceType.trim() === "recurring";
}

function formatSourceTypeLabel(sourceType: string) {
  return sourceType.trim() === "recurring" ? "固定收支" : "手動";
}

function normalizeTransaction(
  transaction: Record<string, unknown>,
  index: number,
): Transaction {
  const type = String(transaction.type ?? "").trim();
  const sourceType = String(transaction.sourceType ?? "manual").trim();
  const expenseType =
    transaction.expenseType === undefined || transaction.expenseType === null
      ? null
      : String(transaction.expenseType);

  return {
    id: String(transaction.id ?? `sheet-tx-${index}`),
    date: String(transaction.date ?? ""),
    type,
    category: String(transaction.category ?? ""),
    categoryId:
      transaction.categoryId === undefined
        ? undefined
        : String(transaction.categoryId),
    amount: Number(transaction.amount ?? 0),
    note: String(transaction.note ?? ""),
    memo:
      transaction.memo === undefined ? undefined : String(transaction.memo),
    sourceType,
    recurringId:
      transaction.recurringId === undefined || transaction.recurringId === null
        ? null
        : String(transaction.recurringId),
    expenseType,
    nature:
      String(transaction.nature ?? "") ||
      (sourceType === "recurring"
        ? "固定支出"
        : type === "收入" || type === "income"
          ? "收入"
          : "日常支出"),
    necessity:
      String(transaction.necessity ?? "") ||
      (sourceType === "recurring"
        ? "必要"
        : type === "收入" || type === "income"
          ? ""
          : "必要"),
    createdAt:
      transaction.createdAt === undefined
        ? undefined
        : String(transaction.createdAt),
  };
}

function sortTransactionsByDate(sourceTransactions: Transaction[]) {
  return [...sourceTransactions].sort((a, b) =>
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

function TransactionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const periodParam = searchParams.get("period");
  const actionParam = searchParams.get("action");
  const newTransactionType = searchParams.get("new");
  const { categories } = useCategories();
  const expenseCategories = categories.filter((item) => item.type === "expense");
  const incomeCategories = categories.filter((item) => item.type === "income");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [editingTransaction, setEditingTransaction] =
    useState<TransactionForm | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [visibleCount, setVisibleCount] = useState(TRANSACTIONS_PAGE_SIZE);
  const [isSavingTransaction, setIsSavingTransaction] = useState(false);
  const [deletingTransactionId, setDeletingTransactionId] = useState<
    string | null
  >(null);

  async function loadTransactions() {
    const sheetTransactions = await getTransactions<Record<string, unknown>>();

    return sortTransactionsByDate(
      sheetTransactions.map((transaction, index) =>
        normalizeTransaction(transaction, index),
      ),
    );
  }

  async function fetchTransactions() {
    setTransactions(await loadTransactions());
  }

  useEffect(() => {
    let isMounted = true;

    loadTransactions()
      .then((sheetTransactions) => {
        if (isMounted) {
          setTransactions(sheetTransactions);
        }
      })
      .catch(() => {
        if (isMounted) {
          setTransactions([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (
      newTransactionType === "expense" ||
      newTransactionType === "income" ||
      newTransactionType === "transfer"
    ) {
      openNewForm(newTransactionType);
    } else if (actionParam === "add") {
      openNewForm("expense");
    }
  }, [actionParam, newTransactionType]);

  const categoryOptions =
    editingTransaction?.type === "收入"
      ? incomeCategories
      : expenseCategories;
  const periodFilter = normalizePeriodFilter(periodParam);
  const periodRange = getDateRange(periodFilter);
  const periodRangeStart = periodRange?.start ?? null;
  const periodRangeEnd = periodRange?.end ?? null;
  const periodFilteredTransactions = transactions.filter((transaction) => {
    if (!periodRangeStart || !periodRangeEnd) {
      return true;
    }

    const dateKey = normalizeDate(transaction.date);

    return dateKey >= periodRangeStart && dateKey <= periodRangeEnd;
  });
  const incomeTransactions = periodFilteredTransactions.filter(
    isIncomeTransaction,
  );
  const expenseTransactions = periodFilteredTransactions.filter(
    isExpenseTransaction,
  );
  const recurringTransactions = transactions.filter(isRecurringTransaction);
  const recurringIncomeTransactions = incomeTransactions.filter(
    isRecurringTransaction,
  );
  const recurringExpenseTransactions = expenseTransactions.filter(
    isRecurringTransaction,
  );
  const filteredTransactions =
    typeParam === "income"
      ? incomeTransactions
      : typeParam === "expense"
        ? expenseTransactions
        : periodFilteredTransactions;
  const incomeTotal = incomeTransactions.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const expenseTotal = expenseTransactions.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const pageTitle =
    typeParam === "income"
      ? "收入明細"
      : typeParam === "expense"
        ? "支出明細"
        : "全部交易";
  const periodLabel = formatPeriodFilterLabel(periodFilter);
  const summaryCards =
    typeParam === "income"
      ? [{ label: "收入", value: incomeTotal, tone: "text-emerald-600" }]
      : typeParam === "expense"
        ? [{ label: "支出", value: expenseTotal, tone: "text-rose-600" }]
        : [
            { label: "收入", value: incomeTotal, tone: "text-emerald-600" },
            { label: "支出", value: expenseTotal, tone: "text-rose-600" },
          ];
  const visibleTransactions = filteredTransactions.slice(0, visibleCount);
  const visibleTransactionsCount = visibleTransactions.length;
  const hasMoreTransactions =
    visibleTransactionsCount < filteredTransactions.length;

  console.log("transactions query filter", {
    periodParam,
    rangeStart: periodRangeStart,
    rangeEnd: periodRangeEnd,
    "transactions.length": transactions.length,
    "recurringTransactions.length": recurringTransactions.length,
    "periodFilteredTransactions.length": periodFilteredTransactions.length,
    "incomeTransactions.length": incomeTransactions.length,
    "expenseTransactions.length": expenseTransactions.length,
    "recurringIncomeTransactions.length": recurringIncomeTransactions.length,
    "recurringExpenseTransactions.length": recurringExpenseTransactions.length,
  });
  console.log(
    "transactions period date debug",
    transactions.map((transaction) => {
      const normalizedDate = normalizeDate(transaction.date);

      return {
        rawDate: transaction.date,
        normalizedDate,
        includedInPeriod: periodRangeStart && periodRangeEnd
          ? normalizedDate >= periodRangeStart && normalizedDate <= periodRangeEnd
          : true,
      };
    }),
  );

  function openEditForm(transaction: Transaction) {
    if (transaction.sourceType === "recurring") {
      setMessage("固定支出產生的交易請到固定收支管理頁調整");
      return;
    }

    setMessage("");
    setEditingTransaction({
      ...transaction,
      necessity: isExpenseTransaction(transaction)
        ? transaction.necessity || "必要"
        : "",
      amount: String(transaction.amount),
    });
  }

  function openNewForm(
    preset: "expense" | "income" | "transfer" = "expense",
  ) {
    const isIncome = preset === "income";
    const nextType = isIncome
      ? "收入"
      : preset === "transfer"
        ? "transfer"
        : "支出";
    const nextCategory = isIncome
      ? incomeCategories[0]
      : expenseCategories[0];
    setMessage("");
    setEditingTransaction({
      id: "",
      date: toDateKey(new Date()),
      type: nextType,
      category: nextCategory?.name ?? "",
      categoryId: nextCategory?.id,
      amount: "",
      note: "",
      sourceType: "manual",
      recurringId: null,
      expenseType: "",
      nature: "",
      necessity: preset === "expense" ? "必要" : "",
      createdAt: undefined,
    });
  }

  function closeTransactionForm() {
    setEditingTransaction(null);
    setCalculatorOpen(false);
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete("action");
    nextSearchParams.delete("new");
    const query = nextSearchParams.toString();
    router.replace(query ? `/transactions?${query}` : "/transactions");
  }

  function updateEditingTransaction<K extends keyof TransactionForm>(
    key: K,
    value: TransactionForm[K],
  ) {
    setEditingTransaction((current) => {
      if (!current) {
        return current;
      }

      if (key === "type") {
        const nextType = String(value);
        const nextCategory =
          nextType === "收入"
            ? incomeCategories[0]?.name ?? ""
            : expenseCategories[0]?.name ?? "";

        return {
          ...current,
          type: nextType,
          category: nextCategory,
          categoryId:
            nextType === "收入"
              ? incomeCategories.find((item) => item.name === nextCategory)?.id
              : expenseCategories.find((item) => item.name === nextCategory)
                  ?.id,
          nature: "",
          expenseType: "",
          necessity:
            nextType === "收入" || nextType === "transfer" ? "" : "必要",
        };
      }

      if (key === "category") {
        const nextCategory = String(value);

        return {
          ...current,
          category: nextCategory,
          categoryId: categories.find((item) => item.name === nextCategory)?.id,
        };
      }

      return { ...current, [key]: value };
    });
  }

  async function saveTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !editingTransaction ||
      Number(editingTransaction.amount) <= 0 ||
      isSavingTransaction
    ) {
      return;
    }

    const isExpense =
      editingTransaction.type === "支出" ||
      editingTransaction.type === "expense";
    const isCreating = editingTransaction.id === "";
    const nextTransaction: Transaction = {
      ...editingTransaction,
      id: editingTransaction.id || `tx-${Date.now()}`,
      createdAt: editingTransaction.createdAt || new Date().toISOString(),
      note: editingTransaction.note.trim() || editingTransaction.category,
      amount: Number(editingTransaction.amount),
      expenseType: "",
      nature: "",
      necessity: isExpense ? editingTransaction.necessity || "必要" : "",
    };

    setIsSavingTransaction(true);
    setMessage("");

    try {
      const sheetPayload = {
        id: nextTransaction.id,
        createdAt: nextTransaction.createdAt ?? "",
        date: nextTransaction.date,
        type: nextTransaction.type,
        expenseType: "",
        nature: "",
        necessity: nextTransaction.necessity,
        category: nextTransaction.category,
        categoryId: nextTransaction.categoryId ?? "",
        amount: Number(nextTransaction.amount),
        note: nextTransaction.note,
        sourceType: nextTransaction.sourceType,
        recurringId: nextTransaction.recurringId ?? "",
        updatedAt: new Date().toISOString(),
      };
      if (isCreating) {
        await createTransaction(sheetPayload);
      } else {
        await updateTransaction(nextTransaction.id, sheetPayload);
      }
      await fetchTransactions();
      closeTransactionForm();
      setMessage(isCreating ? "交易已新增" : "交易已儲存");
    } catch {
      setMessage("交易儲存失敗，請稍後再試");
    } finally {
      setIsSavingTransaction(false);
    }
  }

  async function deleteTransaction(transaction: Transaction) {
    if (deletingTransactionId) {
      return;
    }

    const message =
      transaction.sourceType === "recurring"
        ? `確定要刪除「${getTransactionDisplayName(transaction)}」嗎？這只會刪除此筆交易，不會刪除固定支出規則。`
        : `確定要刪除「${getTransactionDisplayName(transaction)}」嗎？`;
    const confirmed = window.confirm(message);

    if (!confirmed) {
      return;
    }

    setDeletingTransactionId(transaction.id);
    setMessage("");

    try {
      await deleteSheetTransaction(transaction.id);
      await fetchTransactions();
      setMessage("交易已刪除");
    } catch {
      setMessage("交易刪除失敗，請稍後再試");
    } finally {
      setDeletingTransactionId(null);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f7fb] text-slate-950">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,#dbeafe_0,transparent_34%),radial-gradient(circle_at_100%_0%,#fce7f3_0,transparent_28%),linear-gradient(180deg,#fbfcff_0%,#eef2ff_100%)]" />

      <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-10 pt-5 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="grid h-11 w-11 place-items-center rounded-full bg-white/80 text-slate-700 shadow-sm shadow-slate-200 backdrop-blur-xl transition hover:bg-white"
            aria-label="返回首頁"
          >
            <BackIcon />
          </Link>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">
              目前區間：{periodLabel}
            </p>
            <h1 className="text-2xl font-semibold tracking-normal">
              {pageTitle}
            </h1>
          </div>
          <div className="h-11 w-11" />
        </header>

        {message ? (
          <p
            className={`rounded-[22px] px-4 py-3 text-sm font-medium ${
              message.includes("失敗")
                ? "bg-rose-50 text-rose-600"
                : message.includes("已")
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-violet-50 text-violet-700"
            }`}
          >
            {message}
          </p>
        ) : null}

        <section className="grid grid-cols-2 gap-3">
          {summaryCards.map((card) => (
            <article
              key={card.label}
              className="rounded-[28px] border border-white/75 bg-white/80 p-4 shadow-sm shadow-slate-200/80 backdrop-blur-xl"
            >
              <p className="text-sm font-medium text-slate-500">
                {card.label}
              </p>
              <p className={`mt-2 text-xl font-semibold ${card.tone}`}>
                {formatMoney(card.value)}
              </p>
            </article>
          ))}
        </section>

        <section className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">完整明細</p>
              <h2 className="mt-1 text-xl font-semibold tracking-normal">
                共 {filteredTransactions.length} 筆交易
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                目前顯示：
                <span className="ml-1">
                  {visibleTransactionsCount} / {filteredTransactions.length}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => openNewForm("expense")}
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-slate-300/80 transition hover:bg-slate-800"
            >
              新增
            </button>
          </div>

          <div className="mt-5 divide-y divide-slate-100">
            {visibleTransactions.map((item) => {
              const isIncome = isIncomeTransaction(item);
              const isRecurring = item.sourceType === "recurring";
              const sourceTypeLabel = formatSourceTypeLabel(item.sourceType);
              const categoryName =
                categories.find((category) => category.id === item.categoryId)
                  ?.name ?? item.category;

              return (
                <article key={item.id} className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-semibold ${
                          isIncome
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-rose-50 text-rose-600"
                        }`}
                      >
                        {isIncome ? "+" : "-"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-slate-950">
                            {getTransactionDisplayName(item)}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              isRecurring
                                ? "bg-violet-50 text-violet-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {sourceTypeLabel}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-xs font-medium text-slate-400">
                          {formatDate(item.date)} · {categoryName} ·{" "}
                          {item.nature} · {item.necessity}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`shrink-0 text-sm font-semibold ${
                        isIncome ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      {isIncome ? "+" : "-"}
                      {formatMoney(item.amount)}
                    </p>
                  </div>

                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(item)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium transition active:scale-[0.98] ${
                        isRecurring
                          ? "bg-violet-50 text-violet-700"
                          : "bg-white text-slate-700 shadow-sm shadow-slate-200"
                      }`}
                    >
                      {isRecurring ? "管理規則" : "編輯"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteTransaction(item)}
                      disabled={deletingTransactionId !== null}
                      className="rounded-full bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 transition active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {deletingTransactionId === item.id ? "刪除中..." : "刪除"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {hasMoreTransactions ? (
            <button
              type="button"
              onClick={() =>
                setVisibleCount((current) =>
                  Math.min(
                    current + TRANSACTIONS_PAGE_SIZE,
                    filteredTransactions.length,
                  ),
                )
              }
              className="mt-5 h-12 w-full rounded-full bg-slate-100 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 active:scale-[0.99]"
            >
              載入更多
            </button>
          ) : null}
        </section>
      </section>

      {editingTransaction ? (
        <div className="fixed inset-0 z-[60] flex items-center overflow-y-auto bg-slate-950/30 p-3 backdrop-blur-sm">
          <form
            onSubmit={saveTransaction}
            className="mx-auto max-h-full w-full max-w-xl overflow-y-auto overscroll-contain rounded-[32px] border border-white/80 bg-white p-5 shadow-2xl shadow-slate-950/20 [-webkit-overflow-scrolling:touch]"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">交易紀錄</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-normal">
                  {editingTransaction.id ? "編輯交易" : "新增交易"}
                </h2>
              </div>
              <button
                type="button"
                onClick={closeTransactionForm}
                className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-lg font-semibold text-slate-500"
                aria-label="關閉"
              >
                ×
              </button>
            </div>

            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">日期</span>
                  <input
                    type="date"
                    value={editingTransaction.date}
                    onChange={(event) =>
                      updateEditingTransaction("date", event.target.value)
                    }
                    className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">類型</span>
                  <select
                    value={editingTransaction.type}
                    onChange={(event) =>
                      updateEditingTransaction("type", event.target.value)
                    }
                    className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  >
                    {typeOptions.map((item, index) => (
                      <option key={`${item}-${index}`} value={item}>
                        {item === "transfer" ? "轉帳" : item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {editingTransaction.type === "支出" ||
              editingTransaction.type === "expense" ? (
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">
                    必要性
                  </span>
                  <select
                    value={editingTransaction.necessity}
                    onChange={(event) =>
                      updateEditingTransaction("necessity", event.target.value)
                    }
                    className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  >
                    {necessityOptions.map((item, index) => (
                      <option key={`${item}-${index}`} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-500">分類</span>
                <select
                  value={editingTransaction.category}
                  onChange={(event) =>
                    updateEditingTransaction("category", event.target.value)
                  }
                  className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                >
                  {categoryOptions.map((item, index) => (
                    <option key={`${item.id}-${index}`} value={item.name}>
                      {formatCategoryLabel(item)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-500">金額</span>
                <div className="flex min-h-20 items-center rounded-[24px] bg-slate-50 px-4">
                  <span className="text-xl font-semibold text-slate-400">NT$</span>
                  <input
                    type="text"
                    inputMode="none"
                    readOnly
                    value={editingTransaction.amount}
                    onClick={() => setCalculatorOpen(true)}
                    placeholder="0"
                    aria-label="開啟金額計算機"
                    className="min-w-0 flex-1 cursor-pointer bg-transparent text-right text-4xl font-semibold tracking-normal text-slate-950 outline-none placeholder:text-slate-300"
                  />
                </div>
              </label>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-500">備註</span>
                <input
                  value={editingTransaction.note}
                  onChange={(event) =>
                    updateEditingTransaction("note", event.target.value)
                  }
                  className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  placeholder="例如：午餐、房租、補助"
                />
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={closeTransactionForm}
                disabled={isSavingTransaction}
                className="h-13 rounded-full bg-slate-100 text-base font-semibold text-slate-600 disabled:text-slate-400"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSavingTransaction}
                className="h-13 rounded-full bg-slate-950 text-base font-semibold text-white shadow-lg shadow-slate-300/80 disabled:bg-slate-300 disabled:shadow-none"
              >
                {isSavingTransaction ? "儲存中..." : "儲存"}
              </button>
            </div>

          </form>
          {calculatorOpen ? (
            <CalculatorModal
              initialValue={editingTransaction.amount}
              onClose={() => setCalculatorOpen(false)}
              onConfirm={(value) => {
                updateEditingTransaction("amount", value);
                setCalculatorOpen(false);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={null}>
      <TransactionsContent />
    </Suspense>
  );
}
