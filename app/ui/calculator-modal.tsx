"use client";

import { useEffect, useState } from "react";

type CalculatorModalProps = {
  initialValue: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
};

const keypad = [
  "7", "8", "9",
  "4", "5", "6",
  "1", "2", "3",
  "0", ".", "⌫",
] as const;

const operators = [
  { label: "+", value: "+" },
  { label: "−", value: "-" },
  { label: "×", value: "*" },
  { label: "÷", value: "/" },
] as const;

function evaluateExpression(expression: string) {
  if (!expression || /[+\-*/.]$/.test(expression)) {
    throw new Error("算式尚未完成");
  }

  const tokens = expression.match(/(?:\d+(?:\.\d*)?|\.\d+)|[+\-*/]/g);
  if (!tokens || tokens.join("") !== expression) {
    throw new Error("算式格式不正確");
  }

  const values: number[] = [];
  const additions: string[] = [];
  let current = Number(tokens[0]);

  for (let index = 1; index < tokens.length; index += 2) {
    const operator = tokens[index];
    const next = Number(tokens[index + 1]);

    if (!Number.isFinite(next)) {
      throw new Error("算式格式不正確");
    }
    if (operator === "*") {
      current *= next;
    } else if (operator === "/") {
      if (next === 0) throw new Error("不能除以零");
      current /= next;
    } else {
      values.push(current);
      additions.push(operator);
      current = next;
    }
  }

  values.push(current);
  const result = values.slice(1).reduce(
    (total, value, index) =>
      additions[index] === "+" ? total + value : total - value,
    values[0],
  );

  if (!Number.isFinite(result)) {
    throw new Error("無法計算此算式");
  }
  return Math.round((result + Number.EPSILON) * 100) / 100;
}

function displayExpression(expression: string) {
  return expression.replaceAll("*", "×").replaceAll("/", "÷");
}

export default function CalculatorModal({
  initialValue,
  onClose,
  onConfirm,
}: CalculatorModalProps) {
  const [expression, setExpression] = useState(initialValue || "");
  const [error, setError] = useState("");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function enterDigit(key: (typeof keypad)[number]) {
    setError("");
    if (key === "⌫") {
      setExpression((current) => current.slice(0, -1));
      return;
    }

    setExpression((current) => {
      const segment = current.split(/[+\-*/]/).at(-1) ?? "";
      if (key === "." && segment.includes(".")) return current;
      if (key === ".") return `${current}${segment ? "." : "0."}`;
      if (segment === "0") return `${current.slice(0, -1)}${key}`;
      return `${current}${key}`;
    });
  }

  function enterOperator(operator: string) {
    setError("");
    setExpression((current) => {
      if (!current) return operator === "-" ? "-" : current;
      if (/[+\-*/]$/.test(current)) {
        return `${current.slice(0, -1)}${operator}`;
      }
      if (current.endsWith(".")) return current;
      return `${current}${operator}`;
    });
  }

  function confirm() {
    try {
      const result = evaluateExpression(expression);
      onConfirm(String(result));
    } catch (calculationError) {
      setError(
        calculationError instanceof Error
          ? calculationError.message
          : "無法計算此算式",
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end bg-slate-950/40 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="金額計算機"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="w-full rounded-t-[32px] bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl sm:max-w-md sm:rounded-[32px] sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-950">計算金額</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl text-slate-500"
            aria-label="關閉計算機"
          >
            ×
          </button>
        </div>

        <div className="mb-3 min-h-24 rounded-[24px] bg-slate-950 px-4 py-3 text-right text-white">
          <p className="break-all text-3xl font-semibold">
            {displayExpression(expression) || "0"}
          </p>
          <p className="mt-2 min-h-5 text-sm font-medium text-rose-300">
            {error}
          </p>
        </div>

        <div className="grid grid-cols-[1fr_4.5rem] gap-3">
          <div className="grid grid-cols-3 gap-2">
            {keypad.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => enterDigit(key)}
                className="h-14 rounded-[20px] bg-slate-100 text-2xl font-semibold text-slate-950 transition active:scale-95 active:bg-slate-200"
              >
                {key}
              </button>
            ))}
          </div>
          <div className="grid grid-rows-4 gap-2">
            {operators.map((operator) => (
              <button
                key={operator.value}
                type="button"
                onClick={() => enterOperator(operator.value)}
                className="rounded-[20px] bg-amber-100 text-2xl font-semibold text-amber-700 transition active:scale-95 active:bg-amber-200"
              >
                {operator.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setExpression("");
              setError("");
            }}
            className="h-14 rounded-full bg-slate-100 text-base font-semibold text-slate-700"
          >
            清除 C
          </button>
          <button
            type="button"
            onClick={confirm}
            className="h-14 rounded-full bg-slate-950 text-base font-semibold text-white shadow-lg shadow-slate-300"
          >
            確認 OK
          </button>
        </div>
      </section>
    </div>
  );
}
