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
const INVESTMENT_BUNDLE_CACHE_KEY = "finance-investment-bundle-v1";
const INVESTMENT_BUNDLE_TTL = 45_000;

export type InvestmentBundleResource =
  | "investment_trades"
  | "investment_positions"
  | "fx_records"
  | "dividend_records"
  | "cash_accounts"
  | "cash_ledger";

export type InvestmentBundle = {
  data: Record<InvestmentBundleResource, Record<string, unknown>[]>;
  errors: Partial<
    Record<
      InvestmentBundleResource,
      { resource: InvestmentBundleResource; status: number; message: string }
    >
  >;
};

let investmentBundleCache:
  | { value: InvestmentBundle; timestamp: number }
  | undefined;
let pendingInvestmentBundle: Promise<InvestmentBundle> | undefined;

export const recurringRuleColumns = [
  "id",
  "name",
  "type",
  "expenseType",
  "necessity",
  "category",
  "amount",
  "frequency",
  "startDate",
  "nextDate",
  "nextRunDate",
  "isActive",
  "enabled",
  "note",
  "account",
  "createdAt",
  "updatedAt",
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
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      resource?: string;
      id?: string;
    } | null;
    throw new SheetRequestError(
      sheet,
      response.status,
      body?.error ?? `Failed to mutate ${sheet} row`,
    );
  }

  if (
    sheet === "investment_trades" ||
    sheet === "investment_positions" ||
    sheet === "fx_records" ||
    sheet === "dividend_records" ||
    sheet === "cash_accounts" ||
    sheet === "cash_ledger"
  ) {
    clearInvestmentBundleCache();
  }
  return response.json();
}

export function clearInvestmentBundleCache() {
  investmentBundleCache = undefined;
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(INVESTMENT_BUNDLE_CACHE_KEY);
  }
}

export async function getInvestmentBundle(force = false) {
  if (!force) {
    if (
      investmentBundleCache &&
      Date.now() - investmentBundleCache.timestamp < INVESTMENT_BUNDLE_TTL
    ) {
      return investmentBundleCache.value;
    }
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(INVESTMENT_BUNDLE_CACHE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as {
            value: InvestmentBundle;
            timestamp: number;
          };
          if (Date.now() - parsed.timestamp < INVESTMENT_BUNDLE_TTL) {
            investmentBundleCache = parsed;
            return parsed.value;
          }
        } catch {
          sessionStorage.removeItem(INVESTMENT_BUNDLE_CACHE_KEY);
        }
      }
    }
    if (pendingInvestmentBundle) return pendingInvestmentBundle;
  }

  const request = fetch("/api/google/investments", {
    method: "GET",
    cache: "no-store",
  })
    .then(async (response) => {
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to fetch investment data");
      }
      return (await response.json()) as InvestmentBundle;
    })
    .then((value) => {
      const cached = { value, timestamp: Date.now() };
      investmentBundleCache = cached;
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(
            INVESTMENT_BUNDLE_CACHE_KEY,
            JSON.stringify(cached),
          );
        } catch {
          // Memory cache remains available when browser storage is unavailable.
        }
      }
      return value;
    })
    .finally(() => {
      pendingInvestmentBundle = undefined;
    });
  pendingInvestmentBundle = request;
  return request;
}

export class InvestmentSyncError extends Error {
  constructor(
    readonly resource: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "InvestmentSyncError";
  }
}

export async function syncInvestments() {
  const response = await fetch("/api/google/investments/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    resource?: string;
    status?: number;
    message?: string;
  } | null;
  if (!response.ok) {
    throw new InvestmentSyncError(
      body?.resource ?? "investments",
      body?.status ?? response.status,
      body?.error ?? "Investment sync failed",
    );
  }
  clearInvestmentBundleCache();
  return body;
}

export async function getInvestmentPrices<T = Record<string, unknown>>() {
  const response = await fetch("/api/google/investments/prices", {
    method: "GET",
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as {
    data?: T[];
    error?: string;
  } | null;
  if (!response.ok) {
    throw new InvestmentSyncError(
      "investment_prices",
      response.status,
      body?.error ?? "Investment prices read failed",
    );
  }
  return body?.data ?? [];
}

export async function updateInvestmentPrices() {
  const response = await fetch("/api/google/investments/prices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    resource?: string;
    status?: number;
    updatedCount?: number;
    failedSymbols?: string[];
    data?: Record<string, unknown>[];
    prices?: Record<string, unknown>[];
  } | null;
  if (!response.ok) {
    throw new InvestmentSyncError(
      body?.resource ?? "investment_prices",
      body?.status ?? response.status,
      body?.error ?? "Investment price update failed",
    );
  }
  return {
    updatedCount: body?.updatedCount ?? 0,
    failedSymbols: body?.failedSymbols ?? [],
    prices: body?.prices ?? [],
  };
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
