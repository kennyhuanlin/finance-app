/* eslint-disable @typescript-eslint/no-unused-vars */

const RECURRING_RULES_SHEET = "recurring_rules";
const TRANSACTIONS_SHEET = "transactions";

function recurringTransactions() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const rulesSheet = spreadsheet.getSheetByName(RECURRING_RULES_SHEET);
  const transactionsSheet = spreadsheet.getSheetByName(TRANSACTIONS_SHEET);

  if (!rulesSheet || !transactionsSheet) {
    throw new Error("Missing recurring_rules or transactions sheet");
  }

  const todayKey = toDateKey(new Date());
  const ruleTable = readTable(rulesSheet);
  const transactionTable = readTable(transactionsSheet);
  const existingRecurringTransactions = buildRecurringTransactionSet(
    transactionTable.rows,
  );

  ruleTable.rows.forEach((rule, index) => {
    const rowNumber = index + 2;

    if (!isEnabled(rule.enabled)) {
      return;
    }

    const nextRunDate = toDateKey(rule.nextRunDate);

    if (!nextRunDate || nextRunDate > todayKey) {
      return;
    }

    const endDate = toDateKey(rule.endDate);

    if (endDate && nextRunDate > endDate) {
      updateRow(rulesSheet, ruleTable.headers, rowNumber, {
        enabled: false,
      });
      return;
    }

    const duplicateKey = `${String(rule.id)}|${nextRunDate}`;
    const alreadyCreated = existingRecurringTransactions.has(duplicateKey);
    const wasAlreadyHandled = toDateKey(rule.lastRunDate) === nextRunDate;
    let transactionCreated = false;

    if (!alreadyCreated) {
      appendTransaction(transactionsSheet, transactionTable.headers, rule, nextRunDate);
      existingRecurringTransactions.add(duplicateKey);
      transactionCreated = true;
    }

    if (!transactionCreated && wasAlreadyHandled) {
      return;
    }

    const nextRemainingCount = getNextRemainingCount(rule.remainingCount);
    const nextEnabled = nextRemainingCount === 0 ? false : true;

    updateRow(rulesSheet, ruleTable.headers, rowNumber, {
      lastRunDate: nextRunDate,
      nextRunDate: addPeriod(nextRunDate, String(rule.frequency || "monthly")),
      remainingCount:
        nextRemainingCount === null ? "" : String(nextRemainingCount),
      enabled: nextEnabled,
    });
  });
}

function readTable(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map((header) => String(header).trim());
  const rows = values.slice(1).map((row) =>
    headers.reduce((record, header, index) => {
      record[header] = row[index];
      return record;
    }, {}),
  );

  return { headers, rows };
}

function appendTransaction(sheet, headers, rule, dateKey) {
  const now = new Date().toISOString();
  const row = toRow(headers, {
    id: `tx-${Date.now()}-${String(rule.id)}`,
    createdAt: now,
    date: dateKey,
    type: rule.type,
    expenseType: rule.expenseType,
    necessity: rule.necessity,
    category: rule.category,
    categoryId: rule.categoryId || "",
    amount: Number(rule.amount || 0),
    note: rule.note || rule.name,
    sourceType: "recurring",
    recurringId: rule.id,
  });

  sheet.appendRow(row);
}

function updateRow(sheet, headers, rowNumber, patch) {
  headers.forEach((header, index) => {
    if (Object.prototype.hasOwnProperty.call(patch, header)) {
      sheet.getRange(rowNumber, index + 1).setValue(patch[header]);
    }
  });
}

function toRow(headers, record) {
  return headers.map((header) =>
    Object.prototype.hasOwnProperty.call(record, header) ? record[header] : "",
  );
}

function buildRecurringTransactionSet(rows) {
  return new Set(
    rows
      .filter((transaction) => transaction.recurringId && transaction.date)
      .map(
        (transaction) =>
          `${String(transaction.recurringId)}|${toDateKey(transaction.date)}`,
      ),
  );
}

function getNextRemainingCount(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const count = Number(value);

  if (!Number.isFinite(count)) {
    return null;
  }

  return Math.max(0, count - 1);
}

function isEnabled(value) {
  return value === true || String(value).toLowerCase() === "true";
}

function toDateKey(value) {
  if (!value) {
    return "";
  }

  if (value instanceof Date) {
    return formatDateKey(value);
  }

  const dateOnlyMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    return dateOnlyMatch[0];
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return formatDateKey(date);
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addPeriod(dateKey, frequency) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (frequency === "daily") {
    date.setDate(date.getDate() + 1);
  } else if (frequency === "weekly") {
    date.setDate(date.getDate() + 7);
  } else if (frequency === "yearly") {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    date.setMonth(date.getMonth() + 1);
  }

  return formatDateKey(date);
}
