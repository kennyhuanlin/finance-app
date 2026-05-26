"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCategories } from "../categories-context";
import { formatCategoryLabel } from "../lib/categories";
import {
  deleteTransaction as deleteSheetTransaction,
  getTransactions,
  updateTransaction,
} from "../lib/googleSheets";

type Transaction = {
  id: string;
  date: string;
  type: string;
  category: string;
  categoryId?: string;
  amount: number;
  note: string;
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

const typeOptions = ["支出", "收入"];
const natureOptions = ["日常支出", "固定支出", "家庭支出", "一次性支出", "收入"];
const necessityOptions = ["必要", "重要", "可調整", "可取消"];
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

function formatDate(date: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(date));
}

function isIncomeTransaction(transaction: Transaction) {
  return transaction.type === "收入" || transaction.type === "income";
}

function isExpenseTransaction(transaction: Transaction) {
  return transaction.type === "支出" || transaction.type === "expense";
}

function normalizeTransaction(
  transaction: Record<string, unknown>,
  index: number,
): Transaction {
  const type = String(transaction.type ?? "");
  const sourceType = String(transaction.sourceType ?? "manual");
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
          ? "重要"
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

export default function TransactionsPage() {
  const { categories } = useCategories();
  const expenseCategories = categories.filter((item) => item.type === "expense");
  const incomeCategories = categories.filter((item) => item.type === "income");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [editingTransaction, setEditingTransaction] =
    useState<TransactionForm | null>(null);
  const [amountKeyboardOpen, setAmountKeyboardOpen] = useState(false);

  async function fetchTransactions() {
    const sheetTransactions = await getTransactions<Record<string, unknown>>();

    setTransactions(
      sortTransactionsByDate(
        sheetTransactions.map((transaction, index) =>
          normalizeTransaction(transaction, index),
        ),
      ),
    );
  }

  useEffect(() => {
    fetchTransactions().catch(() => {
      setTransactions([]);
    });
  }, []);

  const incomeTotal = useMemo(
    () =>
      transactions
        .filter(isIncomeTransaction)
        .reduce((sum, item) => sum + item.amount, 0),
    [transactions],
  );
  const expenseTotal = useMemo(
    () =>
      transactions
        .filter(isExpenseTransaction)
        .reduce((sum, item) => sum + item.amount, 0),
    [transactions],
  );

  const categoryOptions =
    editingTransaction?.type === "收入"
      ? incomeCategories
      : expenseCategories;

  function openEditForm(transaction: Transaction) {
    if (transaction.sourceType === "recurring") {
      return;
    }

    setEditingTransaction({
      ...transaction,
      amount: String(transaction.amount),
    });
    setAmountKeyboardOpen(true);
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
          nature: nextType === "收入" ? "收入" : "日常支出",
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

  function handleCalculatorTap(key: string) {
    setEditingTransaction((current) => {
      if (!current) {
        return current;
      }

      if (key === ".") {
        return {
          ...current,
          amount: current.amount.includes(".")
            ? current.amount
            : `${current.amount || "0"}.`,
        };
      }

      const [, decimalPart] = current.amount.split(".");

      if (decimalPart && decimalPart.length >= 2) {
        return current;
      }

      return {
        ...current,
        amount: current.amount === "0" ? key : `${current.amount}${key}`,
      };
    });
  }

  function deleteAmountDigit() {
    setEditingTransaction((current) =>
      current ? { ...current, amount: current.amount.slice(0, -1) } : current,
    );
  }

  function clearAmount() {
    setEditingTransaction((current) =>
      current ? { ...current, amount: "" } : current,
    );
  }

  async function saveTransaction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !editingTransaction ||
      !editingTransaction.note.trim() ||
      Number(editingTransaction.amount) <= 0
    ) {
      return;
    }

    const nextTransaction: Transaction = {
      ...editingTransaction,
      note: editingTransaction.note.trim(),
      amount: Number(editingTransaction.amount),
    };

    await updateTransaction(nextTransaction.id, {
      id: nextTransaction.id,
      createdAt: nextTransaction.createdAt ?? "",
      date: nextTransaction.date,
      type: nextTransaction.type,
      expenseType: nextTransaction.expenseType ?? "",
      nature: nextTransaction.nature,
      necessity: nextTransaction.necessity,
      category: nextTransaction.category,
      categoryId: nextTransaction.categoryId ?? "",
      amount: Number(nextTransaction.amount),
      note: nextTransaction.note,
      sourceType: nextTransaction.sourceType,
      recurringId: nextTransaction.recurringId ?? "",
    });
    await fetchTransactions();
    setEditingTransaction(null);
    setAmountKeyboardOpen(false);
  }

  async function deleteTransaction(transaction: Transaction) {
    const message =
      transaction.sourceType === "recurring"
        ? `確定要刪除「${transaction.note}」嗎？這只會刪除此筆交易，不會刪除固定支出規則。`
        : `確定要刪除「${transaction.note}」嗎？`;
    const confirmed = window.confirm(message);

    if (!confirmed) {
      return;
    }

    await deleteSheetTransaction(transaction.id);
    await fetchTransactions();
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
            <p className="text-sm font-medium text-slate-500">所有紀錄</p>
            <h1 className="text-2xl font-semibold tracking-normal">交易列表</h1>
          </div>
          <div className="h-11 w-11" />
        </header>

        <section className="grid grid-cols-2 gap-3">
          <article className="rounded-[28px] border border-white/75 bg-white/80 p-4 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
            <p className="text-sm font-medium text-slate-500">收入</p>
            <p className="mt-2 text-xl font-semibold text-emerald-600">
              {formatMoney(incomeTotal)}
            </p>
          </article>
          <article className="rounded-[28px] border border-white/75 bg-white/80 p-4 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
            <p className="text-sm font-medium text-slate-500">支出</p>
            <p className="mt-2 text-xl font-semibold text-rose-600">
              {formatMoney(expenseTotal)}
            </p>
          </article>
        </section>

        <section className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">完整明細</p>
              <h2 className="mt-1 text-xl font-semibold tracking-normal">
                {transactions.length} 筆交易
              </h2>
            </div>
            <Link
              href="/add"
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-slate-300/80 transition hover:bg-slate-800"
            >
              新增
            </Link>
          </div>

          <div className="mt-5 divide-y divide-slate-100">
            {transactions.map((item) => {
              const isIncome = isIncomeTransaction(item);
              const isRecurring = item.sourceType === "recurring";
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
                            {item.note}
                          </p>
                          {isRecurring ? (
                            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
                              🔁 固定支出
                            </span>
                          ) : null}
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
                    {isRecurring ? (
                      <Link
                        href="/recurring"
                        className="rounded-full bg-violet-50 px-3 py-1.5 text-sm font-medium text-violet-700 transition active:scale-[0.98]"
                      >
                        管理規則
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openEditForm(item)}
                        className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm shadow-slate-200 transition active:scale-[0.98]"
                      >
                        編輯
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteTransaction(item)}
                      className="rounded-full bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 transition active:scale-[0.98]"
                    >
                      刪除
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      {editingTransaction ? (
        <div className="fixed inset-0 z-30 flex items-end bg-slate-950/30 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center">
          <form
            onSubmit={saveTransaction}
            className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-[32px] border border-white/80 bg-white p-5 shadow-2xl shadow-slate-950/20"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">交易紀錄</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-normal">
                  編輯交易
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingTransaction(null);
                  setAmountKeyboardOpen(false);
                }}
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
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">
                    支出性質
                  </span>
                  <select
                    value={editingTransaction.nature}
                    onChange={(event) =>
                      updateEditingTransaction("nature", event.target.value)
                    }
                    className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  >
                    {natureOptions.map((item, index) => (
                      <option key={`${item}-${index}`} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

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
              </div>

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

              <div className="grid gap-2">
                <span className="text-sm font-medium text-slate-500">金額</span>
                <button
                  type="button"
                  onClick={() => setAmountKeyboardOpen(true)}
                  className="flex min-h-20 items-center justify-between rounded-[24px] bg-slate-50 px-4 text-left transition active:scale-[0.99]"
                >
                  <span className="text-xl font-semibold text-slate-400">
                    NT$
                  </span>
                  <span className="min-w-0 flex-1 truncate text-right text-4xl font-semibold tracking-normal text-slate-950">
                    {formatAmountDisplay(editingTransaction.amount)}
                  </span>
                </button>
              </div>

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
                onClick={() => {
                  setEditingTransaction(null);
                  setAmountKeyboardOpen(false);
                }}
                className="h-13 rounded-full bg-slate-100 text-base font-semibold text-slate-600"
              >
                取消
              </button>
              <button
                type="submit"
                className="h-13 rounded-full bg-slate-950 text-base font-semibold text-white shadow-lg shadow-slate-300/80"
              >
                儲存
              </button>
            </div>

            {amountKeyboardOpen ? (
              <div className="sticky bottom-0 -mx-5 -mb-5 mt-5 border-t border-slate-100 bg-white/95 px-5 pb-5 pt-3 backdrop-blur-xl">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-500">
                    輸入金額
                  </p>
                  <button
                    type="button"
                    onClick={() => setAmountKeyboardOpen(false)}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600"
                  >
                    確認
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {calculatorKeys.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleCalculatorTap(key)}
                      className="flex h-13 items-center justify-center rounded-[22px] bg-slate-50 text-2xl font-semibold text-slate-950 shadow-sm shadow-slate-200 transition active:scale-[0.98] active:bg-slate-100"
                    >
                      {key}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={clearAmount}
                    className="flex h-13 items-center justify-center rounded-[22px] bg-slate-100 text-base font-semibold text-slate-700 shadow-sm shadow-slate-200 transition active:scale-[0.98] active:bg-slate-200"
                  >
                    清空
                  </button>
                  <button
                    type="button"
                    onClick={deleteAmountDigit}
                    className="flex h-13 items-center justify-center rounded-[22px] bg-slate-100 text-2xl font-semibold text-slate-700 shadow-sm shadow-slate-200 transition active:scale-[0.98] active:bg-slate-200"
                    aria-label="刪除金額"
                  >
                    ⌫
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountKeyboardOpen(false)}
                    className="flex h-13 items-center justify-center rounded-[22px] bg-slate-950 text-base font-semibold text-white shadow-lg shadow-slate-300/80 transition active:scale-[0.98]"
                  >
                    確認
                  </button>
                </div>
              </div>
            ) : null}
          </form>
        </div>
      ) : null}
    </main>
  );
}
