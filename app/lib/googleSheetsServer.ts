import "server-only";

import { createSign } from "node:crypto";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const sheetHeaders = {
  investment_trades: [
    "id", "date", "market", "ticker", "name", "side", "quantity", "price",
    "fee", "tax", "currency", "exchangeRate", "totalAmount", "note",
    "createdAt", "updatedAt",
  ],
  fx_records: [
    "id", "date", "fromCurrency", "toCurrency", "fromAmount", "toAmount",
    "exchangeRate", "fee", "note", "createdAt", "updatedAt",
  ],
  dividend_records: [
    "id", "date", "market", "ticker", "name", "amount", "tax", "currency",
    "exchangeRate", "amountTwd", "note", "createdAt", "updatedAt",
  ],
  investment_positions: [
    "market", "ticker", "name", "quantity", "averageCost", "currency",
    "totalCost", "updatedAt",
  ],
  cash_accounts: [
    "id", "name", "currency", "balance", "note", "updatedAt",
  ],
  cash_ledger: [
    "id", "date", "accountId", "accountName", "currency", "type", "amount",
    "relatedType", "relatedId", "note", "createdAt",
  ],
} as const;

export type SupportedSheet =
  | "transactions"
  | "categories"
  | "recurring_rules"
  | keyof typeof sheetHeaders;

type GoogleErrorBody = {
  error?: { code?: number; message?: string };
};

let cachedToken: { value: string; expiresAt: number } | null = null;

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
    throw new Error(`Google Sheets API ${response.status}: ${message}`);
  }

  return (await response.json()) as T;
}

function quotedSheetName(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

async function getSheetMetadata(sheet: SupportedSheet) {
  const { spreadsheetId } = getConfig();
  const metadata = await googleRequest<{
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  }>(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties`,
  );
  return metadata.sheets?.find(
    (item) => item.properties?.title === sheet,
  )?.properties;
}

async function ensureSheet(sheet: SupportedSheet) {
  let properties = await getSheetMetadata(sheet);
  if (properties) {
    return properties;
  }

  const headers = sheetHeaders[sheet as keyof typeof sheetHeaders];
  if (!headers) {
    throw new Error(
      `Worksheet "${sheet}" does not exist. Create it and add its header row.`,
    );
  }

  const { spreadsheetId } = getConfig();
  await googleRequest(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: sheet, frozenRowCount: 1 } } }],
    }),
  });
  properties = await getSheetMetadata(sheet);
  if (!properties) {
    throw new Error(`Failed to create worksheet "${sheet}"`);
  }

  await writeValues(sheet, "A1", [Array.from(headers)]);
  return properties;
}

async function getValues(sheet: SupportedSheet) {
  await ensureSheet(sheet);
  const { spreadsheetId } = getConfig();
  const range = encodeURIComponent(quotedSheetName(sheet));
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
  const range = encodeURIComponent(`${quotedSheetName(sheet)}!${startCell}`);
  return googleRequest(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}?valueInputOption=USER_ENTERED`,
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
  const range = encodeURIComponent(`${quotedSheetName(sheet)}!A:ZZ`);
  return googleRequest(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({
        values: [headers.map((header) => normalizeCell(record[header]))],
      }),
    },
  );
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
  return { ok: true, id };
}

export async function deleteWorksheetRow(sheet: SupportedSheet, id: string) {
  const values = await getValues(sheet);
  const { rows } = mapRows(values);
  const index = rows.findIndex((row) => String(row.id) === id);
  if (index < 0) {
    throw new Error(`Record "${id}" was not found in "${sheet}"`);
  }

  const properties = await ensureSheet(sheet);
  if (properties.sheetId === undefined) {
    throw new Error(`Worksheet "${sheet}" has no sheetId`);
  }
  const { spreadsheetId } = getConfig();
  await googleRequest(
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
  return { ok: true, id };
}

export async function replaceWorksheetRows(
  sheet: SupportedSheet,
  records: Record<string, unknown>[],
) {
  await ensureSheet(sheet);
  const headers = Array.from(
    sheetHeaders[sheet as keyof typeof sheetHeaders] ?? [],
  );
  if (headers.length === 0) {
    throw new Error(`No managed headers are configured for "${sheet}"`);
  }

  const { spreadsheetId } = getConfig();
  const range = encodeURIComponent(`${quotedSheetName(sheet)}!A:ZZ`);
  await googleRequest(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/${range}:clear`,
    { method: "POST", body: "{}" },
  );
  await writeValues(sheet, "A1", [
    headers,
    ...records.map((record) =>
      headers.map((header) => normalizeCell(record[header])),
    ),
  ]);
  return { ok: true, count: records.length };
}
