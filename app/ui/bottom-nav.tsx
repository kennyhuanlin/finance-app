"use client";

import {
  ChartNoAxesColumnIncreasing,
  House,
  Plus,
  Receipt,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useCategories } from "../categories-context";

const items = [
  { id: "home", label: "首頁", href: "/", icon: House },
  {
    id: "add",
    label: "記帳",
    href: "/transactions",
    icon: Receipt,
  },
  {
    id: "investments",
    label: "投資",
    href: "/investments",
    icon: ChartNoAxesColumnIncreasing,
  },
  { id: "settings", label: "設定", href: "/settings", icon: Settings },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { categoriesReady, ensureCategories } = useCategories();
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [categoryMessage, setCategoryMessage] = useState("");
  const [isOpeningForm, setIsOpeningForm] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const active =
    pathname === "/"
      ? "home"
      : pathname.startsWith("/transactions") || pathname.startsWith("/add")
        ? "add"
        : pathname.startsWith("/investments")
          ? "investments"
          : "settings";

  function clearPressTimer() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function startLongPress() {
    clearPressTimer();
    longPressTriggered.current = false;
    pressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setQuickMenuOpen(true);
    }, 500);
  }

  async function openTransactionForm(type: "expense" | "income" | "transfer") {
    clearPressTimer();
    setQuickMenuOpen(false);
    setCategoryMessage("");
    if (type !== "transfer" && !categoriesReady) {
      setIsOpeningForm(true);
      try {
        await ensureCategories(2000);
      } catch {
        setCategoryMessage("分類資料載入失敗，請稍後再試。");
        return;
      } finally {
        setIsOpeningForm(false);
      }
    }
    router.push(`/transactions?new=${type}`);
  }

  function handlePlusClick() {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    void openTransactionForm("expense");
  }

  return (
    <>
      {quickMenuOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-950/20 backdrop-blur-[2px]"
          onClick={() => setQuickMenuOpen(false)}
        >
          <div
            className="absolute bottom-[calc(94px+env(safe-area-inset-bottom))] left-1/2 grid w-44 -translate-x-1/2 gap-1 rounded-[24px] border border-white/80 bg-white p-2 shadow-2xl shadow-slate-950/20"
            onClick={(event) => event.stopPropagation()}
          >
            {[
              { label: "新增支出", type: "expense" },
              { label: "新增收入", type: "income" },
              { label: "新增轉帳", type: "transfer" },
            ].map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() =>
                  void openTransactionForm(
                    item.type as "expense" | "income" | "transfer",
                  )
                }
                className="h-11 rounded-2xl px-4 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 active:bg-slate-200"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setQuickMenuOpen(false)}
              className="h-10 rounded-2xl text-sm font-medium text-slate-400 hover:bg-slate-50"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      <nav className="fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-0 right-0 z-50 border-t border-slate-200/80 bg-white shadow-[0_-10px_30px_rgba(15,23,42,0.07)]">
        {categoryMessage ? (
          <p className="absolute bottom-full left-1/2 mb-3 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600 shadow-lg">
            {categoryMessage}
          </p>
        ) : null}
        <div className="mx-auto grid h-[82px] max-w-xl grid-cols-5">
          {items.slice(0, 2).map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;

          return (
            <Link
              key={item.id}
              href={item.href}
              className={`group flex flex-col items-center justify-center gap-1 text-sm font-medium transition-colors ${
                isActive
                  ? "text-[#0B132B]"
                  : "text-[#94A3B8] hover:text-slate-700"
              }`}
            >
              <span
                className={`grid h-14 w-14 place-items-center rounded-full transition-colors ${
                  isActive
                    ? "bg-[#0B132B] text-white"
                    : "bg-transparent text-[#94A3B8] group-hover:text-slate-700"
                }`}
                aria-hidden="true"
              >
                <Icon size={24} strokeWidth={2.5} />
              </span>
              {item.label}
            </Link>
          );
        })}
          <button
            type="button"
            onPointerDown={startLongPress}
            onPointerUp={clearPressTimer}
            onPointerCancel={clearPressTimer}
            onPointerLeave={clearPressTimer}
            onClick={handlePlusClick}
            onContextMenu={(event) => event.preventDefault()}
            disabled={isOpeningForm}
            className="group flex flex-col items-center justify-center gap-1 text-sm font-medium text-[#0B132B]"
            aria-label="新增記帳；長按開啟快速選單"
            aria-expanded={quickMenuOpen}
          >
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#0B132B] text-white shadow-lg shadow-slate-300 transition active:scale-95">
              <Plus size={28} strokeWidth={2.5} />
            </span>
            {isOpeningForm ? "載入中" : "新增"}
          </button>
          {items.slice(2).map((item) => {
            const Icon = item.icon;
            const isActive = active === item.id;

            return (
              <Link
                key={item.id}
                href={item.href}
                className={`group flex flex-col items-center justify-center gap-1 text-sm font-medium transition-colors ${
                  isActive
                    ? "text-[#0B132B]"
                    : "text-[#94A3B8] hover:text-slate-700"
                }`}
              >
                <span
                  className={`grid h-14 w-14 place-items-center rounded-full transition-colors ${
                    isActive
                      ? "bg-[#0B132B] text-white"
                      : "bg-transparent text-[#94A3B8] group-hover:text-slate-700"
                  }`}
                  aria-hidden="true"
                >
                  <Icon size={24} strokeWidth={2.5} />
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
