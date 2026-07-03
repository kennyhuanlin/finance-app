/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Google Apps Script Web App API.
 *
 * Deploy this file together with recurringTransactions.js. Existing sheets keep
 * their current schema; writes are always matched by header name.
 */
const API_SHEETS = [
  "transactions",
  "recurring_rules",
  "categories",
  "investment_trades",
  "fx_records",
  "dividend_records",
  "investment_positions",
  "cash_accounts",
  "cash_ledger",
];

const INVESTMENT_SHEETS = {
  investment_trades: [
    "id", "date", "market", "ticker", "name", "side", "quantity", "price",
    "fee", "tax", "currency", "exchangeRate", "totalAmount", "note",
    "createdAt", "updatedAt",
  ],
  investment_positions: [
    "market", "ticker", "name", "quantity", "averageCost", "currency",
    "totalCost", "updatedAt",
  ],
  fx_records: [
    "id", "date", "fromCurrency", "toCurrency", "fromAmount", "toAmount",
    "exchangeRate", "fee", "note", "createdAt", "updatedAt",
  ],
  dividend_records: [
    "id", "date", "market", "ticker", "name", "amount", "tax", "currency",
    "exchangeRate", "amountTwd", "note", "createdAt", "updatedAt",
  ],
  cash_accounts: [
    "id", "name", "currency", "balance", "note", "updatedAt",
  ],
  cash_ledger: [
    "id", "date", "accountId", "accountName", "currency", "type", "amount",
    "relatedType", "relatedId", "note", "createdAt",
  ],
};

function setupInvestmentSheets() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  Object.keys(INVESTMENT_SHEETS).forEach((name) => {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(INVESTMENT_SHEETS[name]);
      sheet.setFrozenRows(1);
    }
  });
}

function doGet(event) {
  try {
    const name = String(event.parameter.sheet || "");
    const sheet = getApiSheet(name);
    const table = readTable(sheet);
    return jsonOutput(table.rows);
  } catch (error) {
    return jsonOutput({ error: error.message });
  }
}

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    const sheet = getApiSheet(String(payload.sheet || ""));
    const action = String(payload.action || "create");
    const table = readTable(sheet);

    if (action === "create") {
      sheet.appendRow(toRow(table.headers, payload));
      return jsonOutput({ ok: true, id: payload.id });
    }

    const index = table.rows.findIndex(
      (row) => String(row.id) === String(payload.id),
    );
    if (index < 0) {
      throw new Error("Record not found");
    }

    if (action === "update") {
      updateRow(sheet, table.headers, index + 2, payload);
      return jsonOutput({ ok: true, id: payload.id });
    }
    if (action === "delete") {
      sheet.deleteRow(index + 2);
      return jsonOutput({ ok: true, id: payload.id });
    }

    throw new Error("Unsupported action");
  } catch (error) {
    return jsonOutput({ error: error.message });
  }
}

function getApiSheet(name) {
  if (API_SHEETS.indexOf(name) < 0) {
    throw new Error("Unsupported sheet");
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new Error(`Missing sheet: ${name}`);
  }
  return sheet;
}

function jsonOutput(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
