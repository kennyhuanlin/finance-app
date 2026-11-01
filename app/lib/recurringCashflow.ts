import { addPeriod, isDateOnly } from "./recurringDates";

export type CashflowRule = {
  name: string;
  amount: number;
  frequency: string;
  nextRunDate: string;
  startDate?: string;
  endDate?: string;
  remainingCount?: string;
};

export type CashflowMonth = {
  month: string;
  total: number;
  items: { name: string; amount: number; frequency: string }[];
};

/** Average monthly burden of one rule (the 月化金額 shown per rule). */
export function monthlyEquivalent(rule: Pick<CashflowRule, "amount" | "frequency">) {
  switch (rule.frequency) {
    case "daily":
      return (rule.amount * 365) / 12;
    case "weekly":
      return (rule.amount * 52) / 12;
    case "quarterly":
      return rule.amount / 3;
    case "yearly":
      return rule.amount / 12;
    default:
      return rule.amount;
  }
}

/** Quarterly and yearly rules are paid in lumps; their monthly share should be set aside. */
export function isPeriodicRule(rule: Pick<CashflowRule, "frequency">) {
  return rule.frequency === "quarterly" || rule.frequency === "yearly";
}

/**
 * Split the monthly-equivalent total into what is actually charged every month
 * and what should be reserved each month for quarterly/yearly payments.
 */
export function splitMonthlyBudget(rules: CashflowRule[]) {
  let everyMonth = 0;
  let reserve = 0;
  for (const rule of rules) {
    if (isPeriodicRule(rule)) reserve += monthlyEquivalent(rule);
    else everyMonth += monthlyEquivalent(rule);
  }
  return { everyMonth, reserve, total: everyMonth + reserve };
}

function addMonths(month: string, count: number) {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Project scheduled charges for `months` calendar months starting with the month of `today`.
 * Mirrors the daily scheduler: charges start at nextRunDate, stop after endDate and
 * after remainingCount postings. Past-due dates are not backfilled.
 */
export function projectRecurringCashflow(
  rules: CashflowRule[],
  today: string,
  months = 12,
): CashflowMonth[] {
  if (!isDateOnly(today) || months < 1) return [];
  const firstMonth = today.slice(0, 7);
  const result: CashflowMonth[] = Array.from({ length: months }, (_, index) => ({
    month: addMonths(firstMonth, index),
    total: 0,
    items: [],
  }));
  const endExclusive = `${addMonths(firstMonth, months)}-01`;

  for (const rule of rules) {
    if (!Number.isFinite(rule.amount) || rule.amount <= 0) continue;
    let date = rule.nextRunDate;
    if (!isDateOnly(date) || date < today) continue;
    const anchor = rule.startDate && isDateOnly(rule.startDate) ? rule.startDate : date;
    const endDate = rule.endDate && isDateOnly(rule.endDate) ? rule.endDate : "";
    const limitText = String(rule.remainingCount ?? "").trim();
    let remaining = limitText === "" ? Infinity : Number(limitText);
    if (!Number.isFinite(remaining) && remaining !== Infinity) continue;

    while (date && date < endExclusive && remaining > 0) {
      if (endDate && date > endDate) break;
      const bucket = result.find((entry) => entry.month === date.slice(0, 7));
      if (bucket) {
        const existing = bucket.items.find((item) => item.name === rule.name);
        if (existing) existing.amount += rule.amount;
        else bucket.items.push({ name: rule.name, amount: rule.amount, frequency: rule.frequency });
        bucket.total += rule.amount;
      }
      remaining -= 1;
      date = addPeriod(date, rule.frequency, anchor);
    }
  }

  return result;
}
