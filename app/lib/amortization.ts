import { parseTransactionDate } from "./transactions";

export type ExpenseView = "amortized" | "actual";

export type AmortizableRule = { id: string; frequency: string };

type AmortizableTransaction = {
  id: string;
  date: string;
  type: string;
  amount: number;
  note?: string;
  category?: string;
  recurringId?: string | null;
  createdAt?: string;
};

export type AmortizedFields = {
  /** Set on virtual monthly shares: the id of the real payment they came from. */
  amortizedFrom?: string;
};

const PERIOD_MONTHS: Record<string, { months: number; label: string }> = {
  yearly: { months: 12, label: "年付月化" },
  quarterly: { months: 3, label: "季付月化" },
};

function isExpenseType(type: string) {
  const value = type.trim();
  return value === "支出" || value === "expense" || value === "outcome";
}

function monthStart(year: number, monthIndex: number) {
  const date = new Date(year, monthIndex, 1);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}-01`;
}

/**
 * Spread each yearly/quarterly recurring payment evenly over the months it covers,
 * starting the month after the payment (a 2026-10-27 yearly payment becomes
 * 12 shares dated 2026-11-01 … 2027-10-01). Shares keep the original category,
 * currency and source fields; the last share absorbs rounding so the total is exact.
 * Shares dated after `through` (YYYY-MM-DD, normally today) are left out, so a
 * period total never includes months that have not started yet.
 * Everything else is returned unchanged.
 */
export function amortizePeriodicTransactions<T extends AmortizableTransaction>(
  transactions: readonly T[],
  rules: readonly AmortizableRule[],
  through?: string,
): (T & AmortizedFields)[] {
  const periodByRule = new Map(
    rules
      .filter((rule) => PERIOD_MONTHS[rule.frequency])
      .map((rule) => [rule.id, PERIOD_MONTHS[rule.frequency]]),
  );
  const result: (T & AmortizedFields)[] = [];

  for (const transaction of transactions) {
    const period = transaction.recurringId ? periodByRule.get(transaction.recurringId) : undefined;
    const paidOn = parseTransactionDate(transaction.date);
    if (
      !period ||
      !paidOn ||
      !isExpenseType(transaction.type) ||
      !Number.isFinite(transaction.amount) ||
      transaction.amount <= 0
    ) {
      result.push(transaction);
      continue;
    }

    const share = Math.round((transaction.amount / period.months) * 100) / 100;
    const baseName = String(transaction.note || transaction.category || "").trim();
    let allocated = 0;
    for (let index = 1; index <= period.months; index += 1) {
      const amount =
        index === period.months
          ? Math.round((transaction.amount - allocated) * 100) / 100
          : share;
      allocated += amount;
      const date = monthStart(paidOn.getFullYear(), paidOn.getMonth() + index);
      if (through && date > through) break;
      result.push({
        ...transaction,
        id: `${transaction.id}::amortized::${index}`,
        date,
        createdAt: date,
        amount,
        note: `${baseName}（${period.label} ${index}/${period.months}）`,
        amortizedFrom: transaction.id,
      });
    }
  }

  return result;
}
