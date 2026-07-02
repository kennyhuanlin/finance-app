"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCategories } from "../categories-context";
import { formatCategoryLabel } from "../lib/categories";
import {
  createRecurringRule,
  deleteRecurringRule,
  getRecurringRules,
  updateRecurringRule,
} from "../lib/googleSheets";

type RecurringRule = {
  id: string;
  name: string;
  type: string;
  nature: string;
  necessity: string;
  categoryId?: string;
  category: string;
  amount: number;
  frequency: string;
  expenseType: string;
  note: string;
  lastRunDate: string;
  endDate: string;
  remainingCount: string;
  startDate: string;
  nextRunDate: string;
  status: "active" | "paused";
  enabled: boolean;
  manualNextRunDate: boolean;
};

type RuleForm = Omit<RecurringRule, "id" | "amount"> & {
  id?: string;
  amount: string;
};

const typeOptions = ["支出", "收入"];
const natureOptions = ["固定扣款", "分期付款", "家庭支出", "訂閱服務"];
const necessityOptions = ["必要", "重要", "可調整", "可取消"];
const frequencyOptions = ["daily", "weekly", "monthly", "quarterly", "yearly"];
const calculatorKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"];

const emptyForm: RuleForm = {
  name: "",
  type: "支出",
  nature: "固定扣款",
  necessity: "必要",
  category: "住房",
  amount: "",
  frequency: "monthly",
  expenseType: "固定",
  note: "",
  lastRunDate: "",
  endDate: "",
  remainingCount: "",
  startDate: "2026-05-26",
  nextRunDate: "2026-06-01",
  status: "active",
  enabled: true,
  manualNextRunDate: false,
};

function isExpenseRule(rule: { type: string }) {
  return rule.type === "支出" || rule.type === "expense";
}

function isIncomeRule(rule: { type: string }) {
  return rule.type === "收入" || rule.type === "income";
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatFrequency(value: string) {
  const labels: Record<string, string> = {
    daily: "每日",
    weekly: "每週",
    monthly: "每月",
    quarterly: "每季",
    yearly: "每年",
  };

  return labels[value] ?? value;
}

function formatFrequencyUnit(value: string) {
  const labels: Record<string, string> = {
    daily: "日",
    weekly: "週",
    monthly: "月",
    quarterly: "季",
    yearly: "年",
  };

  return labels[value] ?? value;
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

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeRemainingCount(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const count = Number(value);

  return Number.isFinite(count) ? String(count) : "";
}

function isValidRemainingCount(value: string) {
  if (value.trim().length === 0) {
    return true;
  }

  const count = Number(value);

  return Number.isInteger(count) && count >= 0;
}

function hasExpiredEndDate(rule: { endDate: string }) {
  return Boolean(rule.endDate) && rule.endDate < todayString();
}

function hasNoRemainingCount(rule: { remainingCount: string }) {
  return (
    rule.remainingCount.trim().length > 0 && Number(rule.remainingCount) === 0
  );
}

function isActiveRule(rule: RecurringRule) {
  return (
    rule.status === "active" &&
    !hasExpiredEndDate(rule) &&
    !hasNoRemainingCount(rule)
  );
}

function getMonthlyAmount(rule: RecurringRule) {
  if (rule.frequency === "daily") {
    return (rule.amount * 365) / 12;
  }

  if (rule.frequency === "weekly") {
    return (rule.amount * 52) / 12;
  }

  if (rule.frequency === "quarterly") {
    return rule.amount / 3;
  }

  if (rule.frequency === "yearly") {
    return rule.amount / 12;
  }

  return rule.amount;
}

function addPeriod(date: string, frequency: string) {
  if (!date) {
    return "";
  }

  const [year, month, day] = date.split("-").map(Number);
  const nextDate = new Date(year, month - 1, day);

  if (frequency === "daily") {
    nextDate.setDate(nextDate.getDate() + 1);
  } else if (frequency === "weekly") {
    nextDate.setDate(nextDate.getDate() + 7);
  } else if (frequency === "quarterly") {
    nextDate.setMonth(nextDate.getMonth() + 3);
  } else if (frequency === "yearly") {
    nextDate.setFullYear(nextDate.getFullYear() + 1);
  } else {
    nextDate.setMonth(nextDate.getMonth() + 1);
  }

  const nextYear = nextDate.getFullYear();
  const nextMonth = String(nextDate.getMonth() + 1).padStart(2, "0");
  const nextDay = String(nextDate.getDate()).padStart(2, "0");

  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function formatDate(date: string) {
  if (!date) {
    return "未設定";
  }

  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}

function normalizeRecurringRule(
  rule: Record<string, unknown>,
  index: number,
): RecurringRule {
  const frequency = String(rule.frequency ?? "monthly");
  const startDate = String(rule.startDate ?? todayString());
  const enabled =
    rule.enabled === true ||
    String(rule.enabled ?? "true").toLowerCase() === "true";

  return {
    id: String(rule.id ?? `recurring-${index}`),
    name: String(rule.name ?? ""),
    type: String(rule.type ?? "支出"),
    nature: String(rule.nature ?? "固定扣款"),
    necessity: String(rule.necessity ?? "必要"),
    categoryId:
      rule.categoryId === undefined ? undefined : String(rule.categoryId),
    category: String(rule.category ?? ""),
    amount: Number(rule.amount ?? 0),
    frequency,
    expenseType: String(rule.expenseType ?? "固定"),
    note: String(rule.note ?? ""),
    lastRunDate: String(rule.lastRunDate ?? ""),
    endDate: String(rule.endDate ?? ""),
    remainingCount: normalizeRemainingCount(rule.remainingCount),
    startDate,
    nextRunDate: String(rule.nextRunDate ?? addPeriod(startDate, frequency)),
    status: enabled ? "active" : "paused",
    enabled,
    manualNextRunDate: false,
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

export default function RecurringPage() {
  const { categories } = useCategories();
  const expenseCategories = categories.filter((item) => item.type === "expense");
  const incomeCategories = categories.filter((item) => item.type === "income");
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [activeTab, setActiveTab] = useState<"expense" | "income">("expense");
  const [editingRule, setEditingRule] = useState<RuleForm | null>(null);
  const [amountKeyboardOpen, setAmountKeyboardOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getRecurringRules<Record<string, unknown>>()
      .then((sheetRules) => {
        if (!isMounted) {
          return;
        }

        setRules(
          sheetRules.map((rule, index) => normalizeRecurringRule(rule, index)),
        );
      })
      .catch(() => {
        if (isMounted) {
          setStatusMessage("固定支出資料讀取失敗");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleRules = rules.filter((rule) =>
    activeTab === "expense" ? isExpenseRule(rule) : isIncomeRule(rule),
  );
  const visibleCategoryOptions =
    editingRule?.type === "收入" || editingRule?.type === "income"
      ? incomeCategories
      : expenseCategories;
  const monthlyExpenseTotal = useMemo(
    () =>
      rules
        .filter((rule) => isExpenseRule(rule) && isActiveRule(rule))
        .reduce((sum, rule) => sum + getMonthlyAmount(rule), 0),
    [rules],
  );
  const monthlyIncomeTotal = useMemo(
    () =>
      rules
        .filter((rule) => isIncomeRule(rule) && isActiveRule(rule))
        .reduce((sum, rule) => sum + getMonthlyAmount(rule), 0),
    [rules],
  );
  const monthlyNetFlow = monthlyIncomeTotal - monthlyExpenseTotal;

  function toggleRule(id: string) {
    setRules((current) =>
      current.map((rule) => {
        if (rule.id !== id) {
          return rule;
        }

        if (rule.status === "active") {
          return { ...rule, enabled: false, status: "paused" };
        }

        return {
          ...rule,
          enabled: true,
          status: "active",
          nextRunDate: rule.manualNextRunDate
            ? rule.nextRunDate
            : addPeriod(todayString(), rule.frequency),
        };
      }),
    );
  }

  function openCreateForm() {
    const startDate = todayString();
    const type = activeTab === "income" ? "收入" : "支出";
    const categoryOptions =
      activeTab === "income" ? incomeCategories : expenseCategories;

    setEditingRule({
      ...emptyForm,
      type,
      nature: type === "收入" ? "" : "固定扣款",
      necessity: type === "收入" ? "" : "必要",
      expenseType: type === "收入" ? "" : "固定",
      category: categoryOptions[0]?.name ?? "",
      startDate,
      nextRunDate: addPeriod(startDate, emptyForm.frequency),
      manualNextRunDate: false,
    });
    setAmountKeyboardOpen(true);
  }

  function openEditForm(rule: RecurringRule) {
    setEditingRule({
      ...rule,
      amount: String(rule.amount),
      manualNextRunDate: false,
    });
    setAmountKeyboardOpen(true);
  }

  function updateEditingRule<K extends keyof RuleForm>(
    key: K,
    value: RuleForm[K],
  ) {
    setEditingRule((current) => {
      if (!current) {
        return current;
      }

      const next = { ...current, [key]: value };

      if (key === "type") {
        const nextType = String(value);
        const categoryOptions =
          nextType === "收入" || nextType === "income"
            ? incomeCategories
            : expenseCategories;

        next.category = categoryOptions[0]?.name ?? "";
        next.categoryId = categoryOptions[0]?.id;
        next.nature = nextType === "收入" || nextType === "income" ? "" : "固定扣款";
        next.necessity = nextType === "收入" || nextType === "income" ? "" : "必要";
        next.expenseType = nextType === "收入" || nextType === "income" ? "" : "固定";
      }

      if (key === "category") {
        const nextCategory = String(value);
        next.categoryId = categories.find(
          (category) => category.name === nextCategory,
        )?.id;
      }

      if (
        (key === "startDate" || key === "frequency") &&
        !current.manualNextRunDate
      ) {
        next.nextRunDate = addPeriod(
          key === "startDate" ? String(value) : current.startDate,
          key === "frequency" ? String(value) : current.frequency,
        );
      }

      if (key === "nextRunDate") {
        next.manualNextRunDate = true;
      }

      return next;
    });
  }

  function handleCalculatorTap(key: string) {
    setEditingRule((current) => {
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
    setEditingRule((current) =>
      current ? { ...current, amount: current.amount.slice(0, -1) } : current,
    );
  }

  function clearAmount() {
    setEditingRule((current) => (current ? { ...current, amount: "" } : current));
  }

  function toggleEditingEnabled() {
    setEditingRule((current) => {
      if (!current) {
        return current;
      }

      if (current.enabled) {
        return { ...current, enabled: false, status: "paused" };
      }

      return {
        ...current,
        enabled: true,
        status: "active",
        nextRunDate: current.manualNextRunDate
          ? current.nextRunDate
          : addPeriod(todayString(), current.frequency),
      };
    });
  }

  async function saveRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !editingRule ||
      !editingRule.name.trim() ||
      !editingRule.category.trim() ||
      Number(editingRule.amount) <= 0 ||
      !isValidRemainingCount(editingRule.remainingCount) ||
      isSaving
    ) {
      return;
    }

    const id = editingRule.id ?? `recurring-${Date.now()}`;
    const isIncome = isIncomeRule(editingRule);
    const nextRule: RecurringRule = {
      id,
      name: editingRule.name.trim(),
      type: editingRule.type,
      nature: isIncome ? "" : editingRule.nature,
      necessity: isIncome ? "" : editingRule.necessity,
      category: editingRule.category,
      categoryId:
        categories.find((category) => category.name === editingRule.category)
          ?.id ?? editingRule.categoryId,
      amount: Number(editingRule.amount),
      frequency: editingRule.frequency,
      expenseType: isIncome ? "" : "固定",
      note: editingRule.note,
      lastRunDate: editingRule.lastRunDate,
      endDate: editingRule.endDate,
      remainingCount: editingRule.remainingCount.trim(),
      startDate: editingRule.startDate,
      nextRunDate: editingRule.nextRunDate,
      status: editingRule.enabled ? "active" : "paused",
      enabled: editingRule.enabled,
      manualNextRunDate: editingRule.manualNextRunDate,
    };

    setIsSaving(true);
    setStatusMessage("");

    try {
      if (!editingRule.id) {
        await createRecurringRule({
          id: nextRule.id,
          name: nextRule.name,
          type: nextRule.type,
          expenseType: nextRule.expenseType,
          necessity: nextRule.necessity,
          nature: nextRule.nature,
          category: nextRule.category,
          categoryId: nextRule.categoryId ?? "",
          amount: nextRule.amount,
          frequency: nextRule.frequency,
          startDate: nextRule.startDate,
          nextRunDate: nextRule.nextRunDate,
          enabled: nextRule.enabled,
          note: nextRule.note,
          lastRunDate: nextRule.lastRunDate,
          endDate: nextRule.endDate,
          remainingCount: nextRule.remainingCount,
        });
      } else {
        await updateRecurringRule(nextRule.id, {
          id: nextRule.id,
          name: nextRule.name,
          type: nextRule.type,
          expenseType: nextRule.expenseType,
          necessity: nextRule.necessity,
          nature: nextRule.nature,
          category: nextRule.category,
          categoryId: nextRule.categoryId ?? "",
          amount: nextRule.amount,
          frequency: nextRule.frequency,
          startDate: nextRule.startDate,
          nextRunDate: nextRule.nextRunDate,
          enabled: nextRule.enabled,
          note: nextRule.note,
          lastRunDate: nextRule.lastRunDate,
          endDate: nextRule.endDate,
          remainingCount: nextRule.remainingCount,
        });
      }

      setRules((current) =>
        editingRule.id
          ? current.map((rule) => (rule.id === editingRule.id ? nextRule : rule))
          : [nextRule, ...current],
      );
      setEditingRule(null);
      setAmountKeyboardOpen(false);
    } catch {
      setStatusMessage("固定支出儲存失敗");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteRule(rule: RecurringRule) {
    if (deletingRuleId) {
      return;
    }

    const confirmed = window.confirm(`確定要刪除「${rule.name}」嗎？`);

    if (!confirmed) {
      return;
    }

    setDeletingRuleId(rule.id);
    setStatusMessage("");

    try {
      await deleteRecurringRule(rule.id);
      setRules((current) => current.filter((item) => item.id !== rule.id));
    } catch {
      setStatusMessage("固定支出刪除失敗");
    } finally {
      setDeletingRuleId(null);
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
            <p className="text-sm font-medium text-slate-500">自動扣款</p>
            <h1 className="text-2xl font-semibold tracking-normal">
              {activeTab === "expense" ? "固定支出" : "固定收入"}
            </h1>
          </div>
          <button
            type="button"
            onClick={openCreateForm}
            className="grid h-11 w-11 place-items-center rounded-full bg-slate-950 text-xl font-semibold text-white shadow-lg shadow-slate-300/80 transition active:scale-[0.98]"
            aria-label="新增固定支出"
          >
            +
          </button>
        </header>

        {statusMessage ? (
          <p className="rounded-[22px] bg-rose-50 px-4 py-3 text-sm font-medium text-rose-600">
            {statusMessage}
          </p>
        ) : null}

        <div className="grid grid-cols-2 rounded-full border border-white/70 bg-white/75 p-1 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
          {[
            { label: "固定支出", value: "expense" as const },
            { label: "固定收入", value: "income" as const },
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

        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-[28px] border border-white/75 bg-white/80 p-4 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
            <p className="text-sm font-medium text-slate-500">每月固定支出</p>
            <p className="mt-2 text-xl font-semibold text-rose-600">
              {formatMoney(monthlyExpenseTotal)}
            </p>
          </article>
          <article className="rounded-[28px] border border-white/75 bg-white/80 p-4 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
            <p className="text-sm font-medium text-slate-500">每月固定收入</p>
            <p className="mt-2 text-xl font-semibold text-emerald-600">
              {formatMoney(monthlyIncomeTotal)}
            </p>
          </article>
          <article className="rounded-[28px] border border-white/75 bg-white/80 p-4 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
            <p className="text-sm font-medium text-slate-500">
              每月固定淨現金流
            </p>
            <p
              className={`mt-2 text-xl font-semibold ${
                monthlyNetFlow >= 0 ? "text-emerald-600" : "text-rose-600"
              }`}
            >
              {formatMoney(monthlyNetFlow)}
            </p>
          </article>
        </section>

        <section className="rounded-[32px] border border-white/75 bg-white/80 p-5 shadow-sm shadow-slate-200/80 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">
                {activeTab === "expense" ? "固定支出清單" : "固定收入清單"}
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-normal">
                {isLoading ? "讀取中" : `${visibleRules.length} 筆規則`}
              </h2>
            </div>
            <button
              type="button"
              onClick={openCreateForm}
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-slate-300/80 transition active:scale-[0.98]"
            >
              新增{activeTab === "expense" ? "固定支出" : "固定收入"}
            </button>
          </div>

          <div className="mt-5 grid gap-3">
            {isLoading ? (
              <p className="rounded-[24px] bg-slate-50/80 p-4 text-sm font-medium text-slate-400">
                正在讀取 Google Sheets...
              </p>
            ) : null}

            {!isLoading && visibleRules.length === 0 ? (
              <p className="rounded-[24px] bg-slate-50/80 p-4 text-sm font-medium text-slate-400">
                尚未建立{activeTab === "expense" ? "固定支出" : "固定收入"}
              </p>
            ) : null}

            {visibleRules.map((rule) => {
              const categoryName =
                categories.find((category) => category.id === rule.categoryId)
                  ?.name ?? rule.category;
              const ruleIsIncome = isIncomeRule(rule);

              return (
              <article
                key={rule.id}
                className="rounded-[26px] bg-slate-50/80 p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-base font-semibold text-slate-950">
                        {rule.name}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          rule.status === "active"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-200 text-slate-500"
                        }`}
                      >
                        {rule.status === "active" ? "啟用" : "已暫停"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-400">
                      {ruleIsIncome
                        ? categoryName
                        : `${categoryName} · ${rule.nature} · ${rule.necessity}`}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-400">
                      開始 {formatDate(rule.startDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-base font-semibold ${
                        ruleIsIncome ? "text-emerald-600" : "text-rose-600"
                      }`}
                    >
                      原始金額 {formatMoney(rule.amount)} /{" "}
                      {formatFrequencyUnit(rule.frequency)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-400">
                      {formatFrequency(rule.frequency)}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      月化金額 {formatMoney(getMonthlyAmount(rule))}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium text-slate-400">
                        下次執行日
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {formatDate(rule.nextRunDate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400">
                        結束日期
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {formatDate(rule.endDate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-400">
                        剩餘期數
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-700">
                        {rule.remainingCount || "未設定"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(rule)}
                      className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm shadow-slate-200 transition active:scale-[0.98]"
                    >
                      編輯
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRule(rule)}
                      disabled={deletingRuleId !== null}
                      className="rounded-full bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-600 transition active:scale-[0.98] disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      {deletingRuleId === rule.id ? "刪除中..." : "刪除"}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleRule(rule.id)}
                      className={`relative h-8 w-14 rounded-full p-1 transition ${
                        rule.status === "active" ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                      aria-pressed={rule.status === "active"}
                      aria-label={`${rule.name}${rule.status === "active" ? "暫停" : "啟用"}`}
                    >
                      <span
                        className={`block h-6 w-6 rounded-full bg-white shadow-sm transition ${
                          rule.status === "active" ? "translate-x-6" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </article>
              );
            })}
          </div>
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
          <Link
            href="/categories"
            className="flex flex-col items-center gap-1 text-slate-400"
          >
            <span className="grid h-9 w-12 place-items-center rounded-full">
              <CategoriesIcon />
            </span>
            分類
          </Link>
          <Link
            href="/add"
            className="flex flex-col items-center gap-1 text-slate-400"
          >
            <span className="grid h-9 w-12 place-items-center rounded-full">
              <CardIcon />
            </span>
            記帳
          </Link>
          <Link
            href="/recurring"
            className="flex flex-col items-center gap-1 text-slate-950"
          >
            <span className="grid h-9 w-12 place-items-center rounded-full bg-slate-950 text-white">
              <RepeatIcon />
            </span>
            固定支出
          </Link>
          <Link href="/analytics" className="flex flex-col items-center gap-1 text-slate-400">
            <span className="grid h-9 w-12 place-items-center rounded-full">
              <ChartIcon />
            </span>
            分析
          </Link>
        </div>
      </nav>

      {editingRule ? (
        <div className="fixed inset-0 z-30 flex items-end bg-slate-950/30 px-3 pb-3 backdrop-blur-sm sm:items-center sm:justify-center">
          <form
            onSubmit={saveRule}
            className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-[32px] border border-white/80 bg-white p-5 shadow-2xl shadow-slate-950/20"
          >
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  {isIncomeRule(editingRule) ? "固定收入規則" : "固定支出規則"}
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-normal">
                  {editingRule.id
                    ? `編輯${isIncomeRule(editingRule) ? "固定收入" : "固定支出"}`
                    : `新增${isIncomeRule(editingRule) ? "固定收入" : "固定支出"}`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingRule(null);
                  setAmountKeyboardOpen(false);
                }}
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
                  value={editingRule.name}
                  onChange={(event) =>
                    updateEditingRule("name", event.target.value)
                  }
                  className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  placeholder="例如：房租"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">類型</span>
                  <select
                    value={editingRule.type}
                    onChange={(event) =>
                      updateEditingRule("type", event.target.value)
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

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">分類</span>
                  <select
                    value={editingRule.category}
                    onChange={(event) =>
                      updateEditingRule("category", event.target.value)
                    }
                    className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  >
                    {visibleCategoryOptions.map(
                      (item, index) => (
                        <option key={`${item.id}-${index}`} value={item.name}>
                          {formatCategoryLabel(item)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              </div>

              {isExpenseRule(editingRule) ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-slate-500">
                      支出性質
                    </span>
                    <select
                      value={editingRule.nature}
                      onChange={(event) =>
                        updateEditingRule("nature", event.target.value)
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
                      value={editingRule.necessity}
                      onChange={(event) =>
                        updateEditingRule("necessity", event.target.value)
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
              ) : null}

              <div className="grid gap-3">
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
                      {formatAmountDisplay(editingRule.amount)}
                    </span>
                  </button>
                </div>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">週期</span>
                  <select
                    value={editingRule.frequency}
                    onChange={(event) =>
                      updateEditingRule("frequency", event.target.value)
                    }
                    className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  >
                    {frequencyOptions.map((item, index) => (
                      <option key={`${item}-${index}`} value={item}>
                        {formatFrequency(item)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">
                    開始日期
                  </span>
                  <input
                    type="date"
                    value={editingRule.startDate}
                    onChange={(event) =>
                      updateEditingRule("startDate", event.target.value)
                    }
                    className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">
                    下次執行日
                  </span>
                  <input
                    type="date"
                    value={editingRule.nextRunDate}
                    onChange={(event) =>
                      updateEditingRule("nextRunDate", event.target.value)
                    }
                    className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">
                    結束日期
                  </span>
                  <input
                    type="date"
                    value={editingRule.endDate}
                    onChange={(event) =>
                      updateEditingRule("endDate", event.target.value)
                    }
                    className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-slate-500">
                    剩餘期數
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={editingRule.remainingCount}
                    onChange={(event) =>
                      updateEditingRule("remainingCount", event.target.value)
                    }
                    className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                    placeholder="例如：6"
                  />
                </label>
              </div>

              <p className="rounded-[18px] bg-blue-50 px-4 py-3 text-xs font-medium leading-5 text-blue-700">
                下次執行日會依開始日期與週期自動建議；手動修改後，系統會保留你的設定。重新啟用後，將從新的下次執行日開始計算，不會補記停用期間。
              </p>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-slate-500">備註</span>
                <input
                  value={editingRule.note}
                  onChange={(event) =>
                    updateEditingRule("note", event.target.value)
                  }
                  className="h-12 rounded-[20px] bg-slate-50 px-4 text-base font-medium outline-none focus:bg-white focus:ring-2 focus:ring-slate-200"
                  placeholder="例如：每月固定扣款"
                />
              </label>

              <div className="flex items-center justify-between rounded-[22px] bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    啟用狀態
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-400">
                    停用只會暫停規則，不會產生交易或回溯補記
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleEditingEnabled}
                  className={`relative h-8 w-14 rounded-full p-1 transition ${
                    editingRule.enabled ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                  aria-pressed={editingRule.enabled}
                >
                  <span
                    className={`block h-6 w-6 rounded-full bg-white shadow-sm transition ${
                      editingRule.enabled ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingRule(null);
                  setAmountKeyboardOpen(false);
                }}
                disabled={isSaving}
                className="h-13 rounded-full bg-slate-100 text-base font-semibold text-slate-600 disabled:text-slate-400"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="h-13 rounded-full bg-slate-950 text-base font-semibold text-white shadow-lg shadow-slate-300/80 disabled:bg-slate-300 disabled:shadow-none"
              >
                {isSaving ? "儲存中..." : "儲存"}
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
