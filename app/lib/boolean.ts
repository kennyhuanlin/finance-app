const TRUE_VALUES = new Set(["true", "1", "是", "啟用", "active"]);
const FALSE_VALUES = new Set(["false", "0", "否", "停用", "暫停", "paused"]);

export function normalizeBoolean(value: unknown, defaultValue: boolean) {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value ?? "").trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }
  return defaultValue;
}
