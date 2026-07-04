import "server-only";

import { createSign } from "node:crypto";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const sheetHeaders = {
  transactions: [
    "id", "date", "type", "category", "amount", "note", "createdAt",
    "updatedAt", "expenseType", "necessity", "categoryId", "sourceType",
    "recurringId",
  ],
  categories: [
    "id", "name", "type", "color", "icon", "sortOrder", "isActive",
    "createdAt", "updatedAt", "emoji",
  ],
  recurring_rules: [
    "id", "name", "type", "category", "amount", "frequency", "startDate",
    "endDate", "nextDate", "remainingCount", "isActive", "note", "createdAt",
    "updatedAt", "expenseType", "necessity", "nextRunDate", "enabled",
    "lastRunDate", "categoryId", "nature", "account",
  ],
  investment_trades: [
    "id", "tradeDate", "market", "broker", "account", "symbol", "name",
    "type", "side", "quantity", "unit", "price", "fee", "tax", "currency", "exchangeRate",
    "amount", "note", "createdAt", "updatedAt", "date", "ticker",
    "totalAmount",
  ],
  fx_records: [
    "id", "date", "fromCurrency", "toCurrency", "fromAmount", "toAmount",
    "exchangeRate", "fee", "note", "createdAt", "updatedAt",
  ],
  dividend_records: [
    "id", "date", "payDate", "market", "broker", "account", "symbol", "name", "currency",
    "grossAmount", "tax", "fee", "netAmount", "exchangeRate", "note",
    "createdAt", "updatedAt", "ticker", "amount", "amountTwd",
  ],
  investment_positions: [
    "id", "market", "broker", "account", "symbol", "name", "quantity",
    "averageCost", "currency", "totalCost", "updatedAt", "ticker",
  ],
  investment_prices: [
    "symbol", "market", "name", "price", "currency", "price_date",
    "source", "updatedAt",
  ],
  cash_accounts: [
    "id", "account", "currency", "balance", "note", "createdAt", "updatedAt",
    "name",
  ],
  cash_ledger: [
    "id", "date", "account", "currency", "type", "amount", "sourceType",
    "sourceId", "note", "createdAt", "updatedAt", "accountId", "accountName",
    "relatedType", "relatedId",
  ],
} as const;

export type SupportedSheet = keyof typeof sheetHeaders;

type GoogleErrorBody = {
  error?: { code?: number; message?: string };
};

export class GoogleSheetsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseData: unknown,
  ) {
    super(message);
    this.name = "GoogleSheetsApiError";
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;
const pendingSheetEnsures = new Map<SupportedSheet, Promise<SheetProperties>>();
const knownSheetProperties = new Map<SupportedSheet, SheetProperties>();
const worksheetCache = new Map<
  SupportedSheet,
  { rows: Record<string, unknown>[]; timestamp: number }
>();
const pendingWorksheetReads = new Map<
  SupportedSheet,
  Promise<Record<string, unknown>[]>
>();
const pendingBatchReads = new Map<
  string,
  Promise<Record<SupportedSheet, Record<string, unknown>[]>>
>();
const rowIdsEnsured = new Set<SupportedSheet>();
const WORKSHEET_CACHE_TTL = 30_000;

type SheetProperties = {
  sheetId?: number;
  title?: string;
};

export function hasServiceAccountConfig() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY,
  );
}

function getConfig() {
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEET_ID is not configured");
  }
  if (!clientEmail || !privateKey) {
    throw new Error("Google Service Account credentials are not configured");
  }

  return { spreadsheetId, clientEmail, privateKey };
}

function base64Url(value: string) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const { clientEmail, privateKey } = getConfig();
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: SHEETS_SCOPE,
      aud: TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const unsignedToken = `${header}.${claims}`;
  const signature = createSign("RSA-SHA256")
    .update(unsignedToken)
    .sign(privateKey, "base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedToken}.${signature}`,
    }),
    cache: "no-store",
  });
  const result = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };

  if (!response.ok || !result.access_token) {
    throw new Error(
      `Google authentication failed: ${result.error_description ?? response.statusText}`,
    );
  }

  cachedToken = {
    value: result.access_token,
    expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

async function googleRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const accessToken = await getAccessToken();
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as GoogleErrorBody;
    const message = body.error?.message ?? response.statusText;
    throw new GoogleSheetsApiError(
      `Google Sheets API ${response.status}: ${message}`,
      response.status,
      body,
    );
  }

  return (await response.json()) as T;
}

async function googleWriteRequest<T>(
  url: string,
  init: RequestInit,
): Promise<T> {
  const delays = [2000, 5000, 10000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await googleRequest<T>(url, init);
    } catch (error) {
      const shouldRetry =
        error instanceof GoogleSheetsApiError &&
        error.status === 429 &&
        attempt < delays.length;
      if (!shouldRetry) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

async function getSheetMetadata(sheet: SupportedSheet) {
  const { spreadsheetId } = getConfig();
  const metadata = await googleRequest<{
    sheets?: Array<{ properties?: SheetProperties }>;
  }>(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`,
  );
  return metadata.sheets?.find(
    (item) => item.properties?.title === sheet,
  )?.properties;
}

async function createOrFindSheet(sheet: SupportedSheet) {
  let properties = await getSheetMetadata(sheet);
  if (properties) {
    await ensureHeaderRow(sheet);
    return properties;
  }

  const headers = sheetHeaders[sheet];
  const { spreadsheetId } = getConfig();
  try {
    await googleWriteRequest(
      `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [
            { addSheet: { properties: { title: sheet } } },
          ],
        }),
      },
    );
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("already exists")) {
      throw error;
    }
  }
  properties = await getSheetMetadata(sheet);
  if (!properties) {
    throw new Error(`Failed to create worksheet "${sheet}"`);
  }

  await writeValues(sheet, "A1", [Array.from(headers)]);
  return properties;
}

async function ensureHeaderRow(sheet: SupportedSheet) {
  const { spreadsheetId } = getConfig();
  const range = encodeURIComponent(`${sheet}!A1:Z1`);
  const result = await googleRequest<{ values?: unknown[][] }>(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}`,
  );
  const currentHeaders = (result.values?.[0] ?? []).map((value) =>
    String(value).trim(),
  );
  const hasHeaders = currentHeaders.some(
    (value) => String(value).trim() !== "",
  );
  if (!hasHeaders) {
    await writeValues(sheet, "A1", [Array.from(sheetHeaders[sheet])]);
    return;
  }
  const missingHeaders = sheetHeaders[sheet].filter(
    (header) => !currentHeaders.includes(header),
  );
  if (missingHeaders.length) {
    await writeValues(sheet, "A1", [
      [...currentHeaders, ...missingHeaders],
    ]);
  }
}

export async function ensureWorksheetExists(sheet: SupportedSheet) {
  const known = knownSheetProperties.get(sheet);
  if (known) return known;
  const existingRequest = pendingSheetEnsures.get(sheet);
  if (existingRequest) return existingRequest;

  const request = createOrFindSheet(sheet);
  pendingSheetEnsures.set(sheet, request);
  try {
    const properties = await request;
    knownSheetProperties.set(sheet, properties);
    return properties;
  } finally {
    pendingSheetEnsures.delete(sheet);
  }
}

async function getValues(sheet: SupportedSheet) {
  await ensureWorksheetExists(sheet);
  const { spreadsheetId } = getConfig();
  const range = encodeURIComponent(`${sheet}!A:Z`);
  const result = await googleRequest<{ values?: unknown[][] }>(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}`,
  );
  return result.values ?? [];
}

async function writeValues(
  sheet: SupportedSheet,
  startCell: string,
  values: unknown[][],
) {
  const { spreadsheetId } = getConfig();
  const row = startCell.match(/^A(\d+)$/)?.[1];
  if (!row) {
    throw new Error(`Invalid write start cell: ${startCell}`);
  }
  const startRow = Number(row);
  const endRow = startRow + Math.max(values.length, 1) - 1;
  const range = encodeURIComponent(`${sheet}!A${startRow}:Z${endRow}`);
  return googleWriteRequest(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      body: JSON.stringify({ values }),
    },
  );
}

function normalizeCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value;
}

function mapRows(values: unknown[][]) {
  const headers = (values[0] ?? []).map((header) => String(header).trim());
  const rows = values.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])),
  );
  return { headers, rows };
}

export async function readWorksheet(sheet: SupportedSheet) {
  const table = mapRows(await getValues(sheet));
  if (table.headers.length === 0) {
    throw new Error(`Worksheet "${sheet}" has no header row`);
  }
  return table.rows;
}

export function invalidateWorksheetCache(...sheets: SupportedSheet[]) {
  sheets.forEach((sheet) => {
    worksheetCache.delete(sheet);
    pendingWorksheetReads.delete(sheet);
  });
}

export async function readWorksheetCached(sheet: SupportedSheet) {
  const cached = worksheetCache.get(sheet);
  if (cached && Date.now() - cached.timestamp < WORKSHEET_CACHE_TTL) {
    return cached.rows;
  }

  const pending = pendingWorksheetReads.get(sheet);
  if (pending) return pending;

  const request = readWorksheet(sheet)
    .then((rows) => {
      worksheetCache.set(sheet, { rows, timestamp: Date.now() });
      return rows;
    })
    .finally(() => pendingWorksheetReads.delete(sheet));
  pendingWorksheetReads.set(sheet, request);
  return request;
}

export async function readWorksheetCachedWithRetry(sheet: SupportedSheet) {
  const delays = [1000, 3000, 6000];
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await readWorksheetCached(sheet);
    } catch (error) {
      const retry =
        error instanceof GoogleSheetsApiError &&
        [429, 500, 503].includes(error.status) &&
        attempt < delays.length;
      if (!retry) throw error;
      const jitter = Math.floor(Math.random() * 300);
      await new Promise((resolve) =>
        setTimeout(resolve, delays[attempt] + jitter),
      );
    }
  }
}

export async function readWorksheetsCachedWithRetry(
  sheets: SupportedSheet[],
) {
  const result = {} as Record<
    SupportedSheet,
    Record<string, unknown>[]
  >;
  const missing = sheets.filter((sheet) => {
    const cached = worksheetCache.get(sheet);
    if (cached && Date.now() - cached.timestamp < WORKSHEET_CACHE_TTL) {
      result[sheet] = cached.rows;
      return false;
    }
    return true;
  });
  if (!missing.length) return result;

  const batchKey = [...missing].sort().join(",");
  const existing = pendingBatchReads.get(batchKey);
  const batchRequest =
    existing ??
    (async () => {
      await Promise.all(missing.map(ensureWorksheetExists));
      const { spreadsheetId } = getConfig();
      const params = new URLSearchParams();
      missing.forEach((sheet) => params.append("ranges", `${sheet}!A:Z`));
      const delays = [1000, 3000, 6000];

      for (let attempt = 0; ; attempt += 1) {
        try {
          const response = await googleRequest<{
            valueRanges?: Array<{ values?: unknown[][] }>;
          }>(
            `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params.toString()}`,
          );
          const rows = {} as Record<
            SupportedSheet,
            Record<string, unknown>[]
          >;
          missing.forEach((sheet, index) => {
            const table = mapRows(response.valueRanges?.[index]?.values ?? []);
            rows[sheet] = table.rows;
            worksheetCache.set(sheet, {
              rows: table.rows,
              timestamp: Date.now(),
            });
          });
          return rows;
        } catch (error) {
          const retry =
            error instanceof GoogleSheetsApiError &&
            [429, 500, 503].includes(error.status) &&
            attempt < delays.length;
          if (!retry) throw error;
          const jitter = Math.floor(Math.random() * 300);
          await new Promise((resolve) =>
            setTimeout(resolve, delays[attempt] + jitter),
          );
        }
      }
    })().finally(() => pendingBatchReads.delete(batchKey));

  if (!existing) pendingBatchReads.set(batchKey, batchRequest);
  const fetched = await batchRequest;
  missing.forEach((sheet) => {
    result[sheet] = fetched[sheet] ?? [];
  });
  return result;
}

export async function ensureWorksheetRowIds(
  sheet: SupportedSheet,
  prefix: string,
) {
  if (rowIdsEnsured.has(sheet)) return 0;
  const values = await getValues(sheet);
  const { headers, rows } = mapRows(values);
  const idColumn = headers.indexOf("id");
  if (idColumn < 0) {
    throw new Error(`Worksheet "${sheet}" is missing the "id" header`);
  }

  let updated = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (String(rows[index].id ?? "").trim()) continue;
    const id = `${prefix}-legacy-row-${index + 2}`;
    const next: Record<string, unknown> = { ...rows[index], id };
    await writeValues(sheet, `A${index + 2}`, [
      headers.map((header) => normalizeCell(next[header])),
    ]);
    updated += 1;
  }
  rowIdsEnsured.add(sheet);
  if (updated) invalidateWorksheetCache(sheet);
  return updated;
}

export async function appendWorksheetRow(
  sheet: SupportedSheet,
  record: Record<string, unknown>,
) {
  const values = await getValues(sheet);
  const { headers } = mapRows(values);
  if (headers.length === 0) {
    throw new Error(`Worksheet "${sheet}" has no header row`);
  }

  const { spreadsheetId } = getConfig();
  const range = encodeURIComponent(`${sheet}!A:Z`);
  const result = await googleWriteRequest(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({
        values: [headers.map((header) => normalizeCell(record[header]))],
      }),
    },
  );
  invalidateWorksheetCache(sheet);
  return result;
}

export async function updateWorksheetRow(
  sheet: SupportedSheet,
  id: string,
  patch: Record<string, unknown>,
) {
  const values = await getValues(sheet);
  const { headers, rows } = mapRows(values);
  const index = rows.findIndex((row) => String(row.id) === id);
  if (index < 0) {
    throw new Error(`Record "${id}" was not found in "${sheet}"`);
  }

  const next: Record<string, unknown> = { ...rows[index], ...patch, id };
  await writeValues(
    sheet,
    `A${index + 2}`,
    [headers.map((header) => normalizeCell(next[header]))],
  );
  invalidateWorksheetCache(sheet);
  return { ok: true, id };
}

export async function deleteWorksheetRow(sheet: SupportedSheet, id: string) {
  const values = await getValues(sheet);
  const { rows } = mapRows(values);
  const index = rows.findIndex((row) => String(row.id) === id);
  if (index < 0) {
    throw new Error(`Record "${id}" was not found in "${sheet}"`);
  }

  const properties = await ensureWorksheetExists(sheet);
  if (properties.sheetId === undefined) {
    throw new Error(`Worksheet "${sheet}" has no sheetId`);
  }
  const { spreadsheetId } = getConfig();
  await googleWriteRequest(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: {
              sheetId: properties.sheetId,
              dimension: "ROWS",
              startIndex: index + 1,
              endIndex: index + 2,
            },
          },
        }],
      }),
    },
  );
  invalidateWorksheetCache(sheet);
  return { ok: true, id };
}

export async function replaceWorksheetRows(
  sheet: SupportedSheet,
  records: Record<string, unknown>[],
) {
  await ensureWorksheetExists(sheet);
  const headers = Array.from(
    sheetHeaders[sheet as keyof typeof sheetHeaders] ?? [],
  );
  if (headers.length === 0) {
    throw new Error(`No managed headers are configured for "${sheet}"`);
  }

  const currentValues = await getValues(sheet);
  const currentRows = mapRows(currentValues).rows;
  const ignoredComparisonHeaders = new Set(
    ["investment_positions", "investment_prices", "cash_accounts", "cash_ledger"].includes(sheet)
      ? ["updatedAt"]
      : [],
  );
  const comparisonHeaders = headers.filter(
    (header) => !ignoredComparisonHeaders.has(header),
  );
  const canonicalRows = (rows: Record<string, unknown>[]) =>
    rows.map((row) =>
      comparisonHeaders.map((header) => normalizeCell(row[header])),
    );
  if (
    JSON.stringify(canonicalRows(currentRows)) ===
    JSON.stringify(canonicalRows(records))
  ) {
    return { ok: true, count: records.length, changed: false };
  }

  const { spreadsheetId } = getConfig();
  const range = encodeURIComponent(`${sheet}!A:Z`);
  await googleWriteRequest(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}:clear`,
    { method: "POST", body: "{}" },
  );
  await writeValues(sheet, "A1", [
    headers,
    ...records.map((record) =>
      headers.map((header) => normalizeCell(record[header])),
    ),
  ]);
  invalidateWorksheetCache(sheet);
  return { ok: true, count: records.length, changed: true };
}
