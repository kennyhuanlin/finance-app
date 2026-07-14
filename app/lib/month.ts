const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function toMonthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}

function parseMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);

  return new Date(year, monthNumber - 1, 1);
}

export function getCurrentMonth() {
  return toMonthKey(new Date());
}

export function normalizeMonth(month?: string | null) {
  if (!month || !MONTH_PATTERN.test(month)) {
    return getCurrentMonth();
  }

  return month;
}

export function getPreviousMonth(month: string) {
  const normalizedMonth = normalizeMonth(month);
  const date = parseMonth(normalizedMonth);

  return toMonthKey(new Date(date.getFullYear(), date.getMonth() - 1, 1));
}

export function getNextMonth(month: string) {
  const normalizedMonth = normalizeMonth(month);
  const date = parseMonth(normalizedMonth);

  return toMonthKey(new Date(date.getFullYear(), date.getMonth() + 1, 1));
}

export function formatMonthLabel(month: string) {
  const date = parseMonth(normalizeMonth(month));

  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
}

export function getMonthDateRange(month: string) {
  const date = parseMonth(normalizeMonth(month));

  return {
    start: new Date(date.getFullYear(), date.getMonth(), 1),
    end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
  };
}

export function isFutureMonth(month: string) {
  return normalizeMonth(month) > getCurrentMonth();
}
