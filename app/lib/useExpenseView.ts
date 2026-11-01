import { useCallback, useSyncExternalStore } from "react";
import type { ExpenseView } from "./amortization";

const STORAGE_KEY = "finance-expense-view";
const CHANGE_EVENT = "finance-expense-view-change";

function readView(): ExpenseView {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "actual" ? "actual" : "amortized";
  } catch {
    return "amortized";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Shared "月化 / 實際付款" preference for expense statistics; defaults to 月化. */
export function useExpenseView(): [ExpenseView, (view: ExpenseView) => void] {
  const view = useSyncExternalStore(subscribe, readView, () => "amortized" as const);
  const setView = useCallback((next: ExpenseView) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the choice simply is not remembered.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [view, setView];
}
