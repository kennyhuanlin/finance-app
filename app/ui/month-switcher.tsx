"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  formatMonthLabel,
  getCurrentMonth,
  getNextMonth,
  getPreviousMonth,
  isFutureMonth,
  normalizeMonth,
} from "../lib/month";

type MonthSwitcherProps = {
  month: string;
};

export function MonthSwitcher({ month }: MonthSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const normalizedMonth = normalizeMonth(month);
  const currentMonth = getCurrentMonth();
  const previousMonth = getPreviousMonth(normalizedMonth);
  const nextMonth = getNextMonth(normalizedMonth);
  const canGoNext = !isFutureMonth(nextMonth);

  function navigate(nextValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", normalizeMonth(nextValue));

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-full border border-slate-200 bg-white/80 p-1 shadow-sm shadow-slate-200/70">
        <button
          type="button"
          onClick={() => navigate(previousMonth)}
          aria-label="上一個月"
          className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-200"
        >
          <ChevronLeft size={18} strokeWidth={2.4} />
        </button>
        <span className="min-w-28 px-3 text-center text-sm font-semibold text-slate-800">
          {formatMonthLabel(normalizedMonth)}
        </span>
        <button
          type="button"
          onClick={() => navigate(nextMonth)}
          disabled={!canGoNext}
          aria-label="下一個月"
          className="grid h-9 w-9 place-items-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
        >
          <ChevronRight size={18} strokeWidth={2.4} />
        </button>
      </div>
      {normalizedMonth !== currentMonth ? (
        <button
          type="button"
          onClick={() => navigate(currentMonth)}
          className="h-10 rounded-full bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm shadow-slate-300 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
        >
          回到本月
        </button>
      ) : null}
    </div>
  );
}
