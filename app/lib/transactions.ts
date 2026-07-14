export type TransactionDisplayFields = {
  note?: unknown;
  memo?: unknown;
  category?: unknown;
};

export type Transaction = {
  id: string;
  date: string;
  transactionDate?: string;
  type: string;
  category: string;
  categoryId?: string;
  amount: number;
  note: string;
  memo?: string;
  account?: string;
  sourceType?: string;
  recurringId?: string | null;
  expenseType?: string | null;
  createdAt?: string;
};

export function getTransactionDisplayName(
  transaction: TransactionDisplayFields,
) {
  const displayName = [
    transaction.note,
    transaction.memo,
    transaction.category,
  ]
    .map((value) => String(value ?? "").trim())
    .find(Boolean);

  return displayName ?? "未分類";
}

export function parseTransactionDate(value: string) {
  if (!value) {
    return null;
  }

  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;

    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function formatTransactionDate(date: string) {
  const parsed = parseTransactionDate(date);

  if (!parsed) {
    return date;
  }

  return new Intl.DateTimeFormat("zh-TW", {
    month: "long",
    day: "numeric",
  }).format(parsed);
}

export function isIncomeTransaction(transaction: Pick<Transaction, "type">) {
  const type = transaction.type.trim();

  return type === "收入" || type === "income";
}

export function isExpenseTransaction(transaction: Pick<Transaction, "type">) {
  const type = transaction.type.trim();

  return type === "支出" || type === "expense" || type === "outcome";
}

export function isRecurringExpenseTransaction(
  transaction: Pick<Transaction, "sourceType" | "type">,
) {
  return (
    isExpenseTransaction(transaction) && transaction.sourceType === "recurring"
  );
}

export function normalizeTransaction(
  transaction: Record<string, unknown>,
  index: number,
): Transaction {
  const date = String(transaction.date ?? transaction.transactionDate ?? "");

  return {
    id: String(transaction.id ?? `sheet-tx-${index}`),
    date,
    transactionDate:
      transaction.transactionDate === undefined
        ? undefined
        : String(transaction.transactionDate),
    type: String(transaction.type ?? "").trim(),
    category: String(transaction.category ?? ""),
    categoryId:
      transaction.categoryId === undefined
        ? undefined
        : String(transaction.categoryId),
    amount: Number(transaction.amount ?? 0),
    note: String(transaction.note ?? ""),
    memo:
      transaction.memo === undefined ? undefined : String(transaction.memo),
    account:
      transaction.account === undefined
        ? undefined
        : String(transaction.account),
    sourceType:
      transaction.sourceType === undefined
        ? undefined
        : String(transaction.sourceType),
    recurringId:
      transaction.recurringId === undefined || transaction.recurringId === null
        ? null
        : String(transaction.recurringId),
    expenseType:
      transaction.expenseType === undefined || transaction.expenseType === null
        ? null
        : String(transaction.expenseType),
    createdAt:
      transaction.createdAt === undefined
        ? undefined
        : String(transaction.createdAt),
  };
}

export function isTransactionInDateRange(
  transaction: Pick<Transaction, "date">,
  range: { start: Date; end: Date },
) {
  const date = parseTransactionDate(transaction.date);

  return date !== null && date >= range.start && date < range.end;
}
