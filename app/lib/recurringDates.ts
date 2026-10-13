export function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Clamp month ends, preserving the original rule's day after a short month.
export function addPeriod(value: string, frequency: string, anchor = value) {
  if (!isDateOnly(value)) return "";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (frequency === "daily" || frequency === "weekly") {
    date.setUTCDate(day + (frequency === "daily" ? 1 : 7));
  } else {
    const months = { monthly: 1, quarterly: 3, yearly: 12 }[frequency];
    if (!months) return "";
    const anchorDay = isDateOnly(anchor) ? Number(anchor.slice(-2)) : day;
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(anchorDay, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

export function validateRecurringRule(rule: Record<string, unknown>, partial = false) {
  const has = (key: string) => !partial || Object.prototype.hasOwnProperty.call(rule, key);
  if (has("name") && !String(rule.name ?? "").trim()) return "請輸入名稱";
  if (has("category") && !String(rule.category ?? "").trim()) return "請選擇分類";
  if (has("amount") && (!Number.isFinite(Number(rule.amount)) || Number(rule.amount) <= 0)) return "請輸入大於 0 的有效金額";
  if (has("remainingCount") && String(rule.remainingCount ?? "").trim() && (!Number.isSafeInteger(Number(rule.remainingCount)) || Number(rule.remainingCount) < 0)) return "剩餘期數須為 0 或正整數，留空代表不限期數";
  if (has("frequency") && !["daily", "weekly", "monthly", "quarterly", "yearly"].includes(String(rule.frequency))) return "請選擇有效週期";
  if (has("type") && !["支出", "收入", "expense", "income"].includes(String(rule.type))) return "請選擇收入或支出";
  for (const key of ["startDate", "nextRunDate"]) {
    if (has(key) && !isDateOnly(String(rule[key] ?? ""))) return key === "startDate" ? "請設定有效的開始日期" : "請設定有效的下次執行日";
  }
  if (rule.endDate && !isDateOnly(String(rule.endDate))) return "請設定有效的結束日期";
  if (rule.endDate && rule.startDate && String(rule.endDate) < String(rule.startDate)) return "結束日期不可早於開始日期";
  if (rule.nextRunDate && rule.startDate && String(rule.nextRunDate) < String(rule.startDate)) return "下次執行日不可早於開始日期";
  return "";
}
