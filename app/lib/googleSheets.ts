type SheetName =
  | "transactions"
  | "recurring_rules"
  | "categories"
  | "investment_trades"
  | "investment_positions"
  | "fx_records"
  | "dividend_records"
  | "cash_accounts"
  | "cash_ledger";

const sheetApiRoutes: Record<SheetName, string> = {
  transactions: "/api/google/transactions",
  categories: "/api/google/categories",
  recurring_rules: "/api/google/recurring",
  investment_trades: "/api/google/investment-trades",
  investment_positions: "/api/google/investment-positions",
  fx_records: "/api/google/fx-records",
  dividend_records: "/api/google/dividend-records",
  cash_accounts: "/api/google/cash-accounts",
  cash_ledger: "/api/google/cash-ledger",
};

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

export class SheetRequestError extends Error {
  constructor(
    readonly resource: SheetName,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SheetRequestError";
  }
}

async function requestSheet<T>(sheet: SheetName): Promise<T[]> {
  const response = await fetch(sheetApiRoutes[sheet], {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new SheetRequestError(
      sheet,
      response.status,
      body?.error ?? `Failed to fetch ${sheet}`,
    );
  }

  const data = (await response.json().catch(() => [])) as
    | T[]
    | { data?: T[] }
    | null;

  return Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
      ? data.data
      : [];
}

async function createSheetRow<T extends Record<string, unknown>>(
  sheet: SheetName,
  data: T,
) {
  return mutateSheetRow(sheet, "POST", data);
}

async function mutateSheetRow<T extends Record<string, unknown>>(
  sheet: SheetName,
  method: "POST" | "PUT" | "DELETE",
  data: T,
) {
  const response = await fetch(sheetApiRoutes[sheet], {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
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
  return mutateSheetRow("transactions", "PUT", {
    id,
    ...data,
  });
}

export async function deleteTransaction(id: string) {
  return mutateSheetRow("transactions", "DELETE", { id });
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
  return mutateSheetRow("recurring_rules", "PUT", {
    id,
    ...data,
  });
}

export async function deleteRecurringRule(id: string) {
  return mutateSheetRow("recurring_rules", "DELETE", { id });
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
  return mutateSheetRow("categories", "PUT", {
    id,
    ...data,
  });
}

export async function deleteCategory(id: string) {
  return mutateSheetRow("categories", "DELETE", { id });
}

function createCrudHelpers(sheet: SheetName) {
  return {
    get: <T = Record<string, unknown>>() => requestSheet<T>(sheet),
    create: <T extends Record<string, unknown>>(data: T) =>
      createSheetRow(sheet, data),
    update: <T extends Record<string, unknown>>(id: string, data: T) =>
      mutateSheetRow(sheet, "PUT", { id, ...data }),
    delete: (id: string) =>
      mutateSheetRow(sheet, "DELETE", { id }),
  };
}

const investmentTrades = createCrudHelpers("investment_trades");
export const getInvestmentTrades = investmentTrades.get;
export const createInvestmentTrade = investmentTrades.create;
export const updateInvestmentTrade = investmentTrades.update;
export const deleteInvestmentTrade = investmentTrades.delete;

const fxRecords = createCrudHelpers("fx_records");
export const getFxRecords = fxRecords.get;
export const createFxRecord = fxRecords.create;
export const updateFxRecord = fxRecords.update;
export const deleteFxRecord = fxRecords.delete;

const dividendRecords = createCrudHelpers("dividend_records");
export const getDividendRecords = dividendRecords.get;
export const createDividendRecord = dividendRecords.create;
export const updateDividendRecord = dividendRecords.update;
export const deleteDividendRecord = dividendRecords.delete;

export function getInvestmentPositions<T = Record<string, unknown>>() {
  return requestSheet<T>("investment_positions");
}

export async function refreshInvestmentPositions() {
  const response = await fetch(sheetApiRoutes.investment_positions, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error("Failed to refresh investment positions");
  return response.json();
}

const cashAccounts = createCrudHelpers("cash_accounts");
export const getCashAccounts = cashAccounts.get;
export const createCashAccount = cashAccounts.create;
export const updateCashAccount = cashAccounts.update;
export const deleteCashAccount = cashAccounts.delete;

const cashLedger = createCrudHelpers("cash_ledger");
export const getCashLedger = cashLedger.get;
export const createCashLedger = cashLedger.create;
