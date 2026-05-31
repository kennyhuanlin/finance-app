const SHEETS_API_URL = "/api/sheets";

type SheetName = "transactions" | "recurring_rules" | "categories";

export const recurringRuleColumns = [
  "id",
  "name",
  "type",
  "expenseType",
  "necessity",
  "category",
  "amount",
  "frequency",
  "nextRunDate",
  "enabled",
  "note",
  "lastRunDate",
  "endDate",
  "remainingCount",
] as const;

export type RecurringRuleColumn = (typeof recurringRuleColumns)[number];

export type RecurringRuleSheetRow = Partial<
  Record<RecurringRuleColumn, string | number | boolean>
> &
  Record<string, unknown>;

async function requestSheet<T>(sheet: SheetName): Promise<T[]> {
  const response = await fetch(`${SHEETS_API_URL}?sheet=${sheet}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${sheet}`);
  }

  const data = await response.json();

  return Array.isArray(data) ? data : data.data ?? [];
}

async function createSheetRow<T extends Record<string, unknown>>(
  sheet: SheetName,
  data: T,
) {
  return mutateSheetRow(sheet, {
    action: "create",
    ...data,
  });
}

async function mutateSheetRow<T extends Record<string, unknown>>(
  sheet: SheetName,
  data: T,
) {
  const response = await fetch(SHEETS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sheet,
      ...data,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to mutate ${sheet} row`);
  }

  return response.json();
}

export function getTransactions<T = Record<string, unknown>>() {
  return requestSheet<T>("transactions");
}

export function createTransaction<T extends Record<string, unknown>>(data: T) {
  return createSheetRow("transactions", data);
}

export async function updateTransaction<T extends Record<string, unknown>>(
  id: string,
  data: T,
) {
  return mutateSheetRow("transactions", {
    action: "update",
    id,
    ...data,
  });
}

export async function deleteTransaction(id: string) {
  return mutateSheetRow("transactions", {
    action: "delete",
    id,
  });
}

export function getRecurringRules<T = Record<string, unknown>>() {
  return requestSheet<T>("recurring_rules");
}

export function createRecurringRule<T extends Record<string, unknown>>(data: T) {
  return createSheetRow("recurring_rules", data);
}

export async function updateRecurringRule<T extends Record<string, unknown>>(
  id: string,
  data: T,
) {
  return mutateSheetRow("recurring_rules", {
    action: "update",
    id,
    ...data,
  });
}

export async function deleteRecurringRule(id: string) {
  return mutateSheetRow("recurring_rules", {
    action: "delete",
    id,
  });
}

export function getCategories<T = Record<string, unknown>>() {
  return requestSheet<T>("categories");
}

export function createCategory<T extends Record<string, unknown>>(data: T) {
  return createSheetRow("categories", data);
}

export async function updateCategory<T extends Record<string, unknown>>(
  id: string,
  data: T,
) {
  return mutateSheetRow("categories", {
    action: "update",
    id,
    ...data,
  });
}

export async function deleteCategory(id: string) {
  return mutateSheetRow("categories", {
    action: "delete",
    id,
  });
}
