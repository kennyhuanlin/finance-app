# Google Sheets 欄位對應

## recurring_rules

`recurring_rules` 工作表欄位順序：

1. `id`
2. `name`
3. `type`
4. `expenseType`
5. `necessity`
6. `category`
7. `amount`
8. `frequency`
9. `nextRunDate`
10. `enabled`
11. `note`
12. `lastRunDate`
13. `endDate`
14. `remainingCount`

`endDate` 可空白。若有值，當 `nextRunDate > endDate` 時，Apps Script 會停用規則，不再產生交易。

`remainingCount` 可空白。若有值，每次規則成功處理一期後會扣 1；扣到 `0` 時會把 `enabled` 改成 `FALSE`。

前端仍可送出舊欄位如 `categoryId`、`nature`、`startDate`；新版 Apps Script 以 header 寫入，工作表沒有的欄位會被忽略，不會影響 create/update/delete。

## 分期付款範例

和泰車險：

- `amount`: `10598`
- `frequency`: `monthly`
- `remainingCount`: `6`
- `nextRunDate`: `2026-06-01`

每次 `recurringTransactions()` 成功處理一期：

- 新增一筆 `transactions`
- `remainingCount - 1`
- `nextRunDate + 1 month`
- `remainingCount = 0` 後自動 `enabled = FALSE`
