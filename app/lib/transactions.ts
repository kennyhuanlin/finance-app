export type TransactionDisplayFields = {
  note?: unknown;
  memo?: unknown;
  category?: unknown;
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
