"use client";

import type { ExpenseView } from "../lib/amortization";

const options: { value: ExpenseView; label: string }[] = [
  { value: "amortized", label: "月化" },
  { value: "actual", label: "實際付款" },
];

export function ExpenseViewToggle({
  view,
  onChange,
  note,
}: {
  view: ExpenseView;
  onChange: (view: ExpenseView) => void;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-xs font-medium text-slate-500">年付支出</span>
      <div role="group" aria-label="年付支出顯示方式" className="inline-flex rounded-full border border-white/70 bg-white/75 p-1 shadow-sm shadow-slate-200/80">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={view === option.value}
            onClick={() => onChange(option.value)}
            className={`min-h-8 rounded-full px-3 text-xs font-semibold transition ${
              view === option.value ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-white hover:text-slate-900"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {note ? <span className="text-xs text-slate-400">{note}</span> : null}
    </div>
  );
}
