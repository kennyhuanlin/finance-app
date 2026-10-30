/* eslint-disable @typescript-eslint/no-unused-vars */

const RECURRING_RULES_SHEET = "recurring_rules";
const TRANSACTIONS_SHEET = "transactions";

function recurringTransactions() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error("Recurring transaction run already in progress");
  try { runRecurringTransactions(); } finally { lock.releaseLock(); }
}

function runRecurringTransactions() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const rulesSheet = spreadsheet.getSheetByName(RECURRING_RULES_SHEET);
  const transactionsSheet = spreadsheet.getSheetByName(TRANSACTIONS_SHEET);

  if (!rulesSheet || !transactionsSheet) {
    throw new Error("Missing recurring_rules or transactions sheet");
  }

  const todayKey = toDateKey(new Date());
  const ruleTable = readTable(rulesSheet);
  const transactionTable = readTable(transactionsSheet);
  for (const key of ["id", "date", "sourceType", "recurringId"]) {
    if (!transactionTable.headers.includes(key)) throw new Error("Missing transaction header: " + key);
  }
  for (const key of ["id", "nextRunDate", "lastRunDate", "enabled", "remainingCount"]) {
    if (!ruleTable.headers.includes(key)) throw new Error("Missing recurring header: " + key);
  }
  const existingRecurringTransactions = buildRecurringTransactionSet(
    transactionTable.rows,
  );

  ruleTable.rows.forEach((rule, index) => {
    const rowNumber = index + 2;
    if (!String(rule.id || "").trim() || !Number.isFinite(Number(rule.amount)) || Number(rule.amount) <= 0) return;
    if (!["daily", "weekly", "monthly", "quarterly", "yearly"].includes(String(rule.frequency))) return;
    const currency = String(rule.currency || "TWD").trim().toUpperCase();
    if (!["USD", "TWD"].includes(currency)) return;
    // Never append an unlabelled USD transaction.
    if (currency === "USD" && !transactionTable.headers.includes("currency")) {
      throw new Error("USD recurring transaction blocked: missing currency column");
    }
    const count = getRemainingCount(rule.remainingCount);
    if (count !== null && (!Number.isSafeInteger(count) || count < 0)) return;

    if (!isEnabled(rule.enabled === undefined || rule.enabled === "" ? rule.isActive : rule.enabled)) {
      return;
    }

    if (getRemainingCount(rule.remainingCount) === 0) {
      return;
    }

    const nextRunDate = toDateKey(rule.nextRunDate || rule.nextDate);

    if (!nextRunDate || nextRunDate > todayKey) {
      return;
    }

    const endDate = toDateKey(rule.endDate);

    if (endDate && endDate < todayKey) {
      updateRow(rulesSheet, ruleTable.headers, rowNumber, { enabled: false });
      return;
    }

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
      nextRunDate: addPeriod(nextRunDate, String(rule.frequency || "monthly"), toDateKey(rule.startDate) || nextRunDate),
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
    currency: String(rule.currency || "TWD").trim().toUpperCase(),
    note: rule.note || rule.name,
    sourceType: "recurring",
    recurringId: rule.id,
  });

  sheet.appendRow(row);
}

function updateRow(sheet, headers, rowNumber, patch) {
  // One row write avoids a half-updated lastRunDate/count after an interrupted run.
  const range = sheet.getRange(rowNumber, 1, 1, headers.length);
  const values = range.getValues()[0];
  const formulas = range.getFormulas()[0];
  const next = headers.map((header, index) =>
    Object.prototype.hasOwnProperty.call(patch, header) ? patch[header] : formulas[index] || values[index]);
  range.setValues([next]);
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

function getRemainingCount(value) {
  if (value === "" || value === null || value === undefined) return null;
  const count = Number(value);
  return count;
}

function isEnabled(value) {
  if (value === true) return true;
  if (value === false) return false;
  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "1", "是", "啟用", "active"].indexOf(normalized) >= 0) return true;
  if (["false", "0", "否", "停用", "暫停", "paused"].indexOf(normalized) >= 0) return false;
  return true;
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
    const [year, month, day] = dateOnlyMatch[0].split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? dateOnlyMatch[0] : "";
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

function addPeriod(dateKey, frequency, anchor) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (frequency === "daily" || frequency === "weekly") {
    date.setDate(day + (frequency === "daily" ? 1 : 7));
  } else {
    const months = { monthly: 1, quarterly: 3, yearly: 12 }[frequency];
    if (!months) throw new Error("Unsupported recurring frequency");
    const anchorDay = Number(String(anchor || dateKey).slice(-2));
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(anchorDay, lastDay));
  }
  return formatDateKey(date);
}
