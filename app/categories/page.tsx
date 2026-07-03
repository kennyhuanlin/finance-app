"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  type Category,
  type CategoryType,
  useCategories,
} from "../categories-context";
import { transactions } from "../data";

type CategoryForm = Omit<Category, "id"> & {
  id?: string;
};

const emptyForm: CategoryForm = {
  name: "",
  emoji: "💸",
  type: "expense",
  color: "#5b8def",
};

const colorOptions = [
  "#5b8def",
  "#48c7a2",
  "#f6b85a",
  "#a78bfa",
  "#f4728f",
  "#34d399",
  "#fb7185",
  "#64748b",
];

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

export default function CategoriesPage() {
  const {
    categories,
    addCategory,
    updateCategory,
    deleteCategory,
    refreshCategories,
    isLoadingCategories,
  } = useCategories();
  const [editingCategory, setEditingCategory] = useState<CategoryForm | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("error");
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<CategoryType>("expense");
  const expenseCategories = categories.filter(
    (category) => category.type === "expense",
  );
  const incomeCategories = categories.filter(
    (category) => category.type === "income",
  );
  const visibleCategories =
    activeTab === "expense" ? expenseCategories : incomeCategories;

  useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  function openCreateForm() {
    setMessage("");
    setMessageTone("error");
    setEditingCategory(emptyForm);
  }

  function openEditForm(category: Category) {
    setMessage("");
    setMessageTone("error");
    setEditingCategory(category);
  }

  async function saveCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingCategory || !editingCategory.name.trim() || isSavingCategory) {
      return;
    }

    const nextCategory = {
      ...editingCategory,
      name: editingCategory.name.trim(),
    };

    setIsSavingCategory(true);
    setMessage("");

    try {
      if (editingCategory.id) {
        await updateCategory(nextCategory as Category);
      } else {
        await addCategory(nextCategory);
      }

      setMessageTone("success");
      setMessage("分類已儲存");
      setEditingCategory(null);
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "分類儲存失敗");
    } finally {
      setIsSavingCategory(false);
    }
  }

  async function handleDelete(category: Category) {
    if (deletingCategoryId) {
      return;
    }

    const isUsed = transactions.some(
      (transaction) =>
        transaction.categoryId === category.id ||
        transaction.category === category.name,
    );

    if (isUsed) {
      setMessageTone("error");
      setMessage("已有交易使用此分類");
      return;
    }

    const confirmed = window.confirm(`確定要刪除「${category.name}」嗎？`);

    if (!confirmed) {
      return;
    }

    setDeletingCategoryId(category.id);
    setMessage("");

    try {
      await deleteCategory(category.id);
      setMessageTone("success");
      setMessage("分類已刪除");
    } catch {
      setMessageTone("error");
      setMessage("分類刪除失敗");
    } finally {
      setDeletingCategoryId(null);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f7fb] text-slate-950">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_0%_0%,#dbeafe_0,transparent_34%),radial-gradient(circle_at_100%_0%,#fce7f3_0,transparent_28%),linear-gradient(180deg,#fbfcff_0%,#eef2ff_100%)]" />

      <section className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="grid h-11 w-11 place-items-center rounded-full bg-white/80 text-slate-700 shadow-sm shadow-slate-200 backdrop-blur-xl transition hover:bg-white"
            aria-label="返回首頁"
          >
            <BackIcon />
          </Link>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-500">收支設定</p>
            <h1 className="text-2xl font-semibold tracking-normal">分類管理</h1>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="grid h-11 w-11 place-items-center rounded-full bg-slate-950 text-xl font-semibold text-white shadow-lg shadow-slate-300/80 transition active:scale-[0.98]"
            aria-label="新增分類"
          >
            +
          </button>
        </header>

        {message ? (
          <p
            className={`rounded-[22px] px-4 py-3 text-sm font-medium ${
              messageTone === "success"
                ? "bg-emerald-50 text-emerald-600"
                : "bg-rose-50 text-rose-600"
            }`}
          >
            {message}
          </p>
        ) : null}

        {isLoadingCategories ? (
          <p className="rounded-[22px] bg-slate-50 px-4 py-3 text-sm font-medium text-slate-400">
            正在讀取 Google Sheets 分類...
          </p>
        ) : null}

        <div className="grid grid-cols-2 rounded-full border border-white/70 bg-white/75 p-1 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
          {[
            { label: "支出", value: "expense" as CategoryType },
            { label: "收入", value: "income" as CategoryType },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={`h-11 rounded-full text-sm font-semibold transition ${
                activeTab === tab.value
                  ? "bg-slate-950 text-white shadow-lg shadow-slate-300/80"
                  : "text-slate-500 hover:bg-white hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">
                {activeTab === "expense" ? "支出分類" : "收入分類"}
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-normal">
                {visibleCategories.length} 個分類
              </h2>
            </div>
            <button
              type="button"
              onClick={openCreateForm}
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-slate-300/80 transition active:scale-[0.98]"
            >
              新增分類
            </button>
          </div>

          <div className="mt-5 grid gap-3">
            {visibleCategories.map((category) => (
              <article
                key={category.id}
                className="flex items-center justify-between gap-4 rounded-[26px] bg-slate-50/80 p-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white text-xl shadow-sm shadow-slate-200"
                  >
                    {category.emoji}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-slate-950">
                      {category.name}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-400">
                        {category.type === "income" ? "收入" : "支出"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditForm(category)}
                    className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm shadow-slate-200"
                  >
                    編輯
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(category)}
                    disabled={deletingCategoryId !== null}
                    className="rounded-full bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {deletingCategoryId === category.id ? "刪除中..." : "刪除"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>


      {editingCategory ? (
        <div className="fixed inset-0 z-30 flex items-end bg-slate-950/30 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center">
          <form
            onSubmit={saveCategory}
            className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-[32px] border border-white/80 bg-white px-5 pt-5 pb-[calc(8rem+env(safe-area-inset-bottom))] shadow-2xl shadow-slate-950/20"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">分類</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-normal">
                  {editingCategory.id ? "編輯分類" : "新增分類"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-lg font-semibold text-slate-500"
                aria-label="關閉"
              >
                ×
              </button>
            </div>

            <div className="grid gap-3">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-500">名稱</span>
                <input
                  value={editingCategory.name}
                  onChange={(event) =>
                    setEditingCategory((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                  className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  placeholder="例如：餐飲"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">Emoji</span>
                  <input
                    value={editingCategory.emoji}
                    onChange={(event) =>
                      setEditingCategory((current) =>
                        current
                          ? { ...current, emoji: event.target.value }
                          : current,
                      )
                    }
                    className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">類型</span>
                  <select
                    value={editingCategory.type}
                    onChange={(event) =>
                      setEditingCategory((current) =>
                        current
                          ? {
                              ...current,
                              type: event.target.value as CategoryType,
                            }
                          : current,
                      )
                    }
                    className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  >
                    <option value="expense">支出</option>
                    <option value="income">收入</option>
                  </select>
                </label>
              </div>

              <div>
                <p className="text-sm font-medium text-slate-500">顏色</p>
                <div className="mt-2 grid grid-cols-8 gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() =>
                        setEditingCategory((current) =>
                          current ? { ...current, color } : current,
                        )
                      }
                      className={`h-10 rounded-2xl border-2 ${
                        editingCategory.color === color
                          ? "border-slate-950"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={`選擇顏色 ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                disabled={isSavingCategory}
                className="h-13 rounded-full bg-slate-100 text-base font-semibold text-slate-600 disabled:text-slate-400"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSavingCategory}
                className="h-13 rounded-full bg-slate-950 text-base font-semibold text-white shadow-lg shadow-slate-300/80 disabled:bg-slate-300 disabled:shadow-none"
              >
                {isSavingCategory ? "儲存中..." : "儲存"}
              </button>
            </div>
            <div className="h-24" aria-hidden="true" />
          </form>
        </div>
      ) : null}
    </main>
  );
}
