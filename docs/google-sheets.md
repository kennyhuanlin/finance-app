# Google Sheets 欄位對應

## Service Account 連線（正式模式）

前端只會呼叫 `/api/google/*`。Google OAuth JWT 簽章、access token 與
Sheets API 存取都在 Next.js server 執行，private key 不會進入瀏覽器 bundle。

在本機 `.env.local` 與 Vercel Project Settings → Environment Variables 設定：

```dotenv
GOOGLE_SHEET_ID=試算表網址中 /d/ 與 /edit 之間的 ID
GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@xxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

`GOOGLE_PRIVATE_KEY` 可在 Vercel 以包含字面 `\n` 的單行字串儲存；
server helper 會轉回真正換行。不要使用 `NEXT_PUBLIC_` 前綴。

打開目標 Google Sheet，按「共用」→ 加入
`GOOGLE_SERVICE_ACCOUNT_EMAIL` 的完整 email → 權限選「編輯者」。
同時須在 Service Account 所屬 Google Cloud project 啟用 Google Sheets API。

只有缺少 `GOOGLE_SERVICE_ACCOUNT_EMAIL` 或 `GOOGLE_PRIVATE_KEY` 時，server
才會使用 `GOOGLE_SCRIPT_URL` 作為舊 Apps Script Web App fallback。
Service Account 模式仍必須設定 `GOOGLE_SHEET_ID`。

API 路徑：

- `/api/google/transactions`
- `/api/google/categories`
- `/api/google/recurring`
- `/api/google/investment-trades`
- `/api/google/fx-records`
- `/api/google/dividend-records`
- `/api/google/investment-positions`
- `/api/google/cash-accounts`
- `/api/google/cash-ledger`

每條路徑均支援 GET、POST、PUT、DELETE。POST 建立資料；PUT 與 DELETE
的 JSON body 必須包含 `id`。

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

## 投資工作表

將 `apps-script/sheetsApi.js` 加入目前 Apps Script 專案，執行一次
`setupInvestmentSheets()`，會建立下列工作表及凍結標題列。重新部署 Web App
後，前端沿用 `GOOGLE_SCRIPT_URL` 即可存取。

### investment_trades

`id`, `date`, `market`, `ticker`, `name`, `side`, `quantity`, `price`,
`fee`, `tax`, `currency`, `exchangeRate`, `totalAmount`, `note`,
`createdAt`, `updatedAt`

- `market`: `TW` / `US`
- `side`: `buy` / `sell`
- `currency`: `TWD` / `USD`
- `totalAmount`: 買入為成交額加費稅，賣出為成交額扣費稅

### investment_positions

`market`, `ticker`, `name`, `quantity`, `averageCost`, `currency`,
`totalCost`, `updatedAt`

每次 `investment_trades` 建立、更新或刪除後，server 會依移動平均法重建
這張快照。投資頁優先讀取快照；快照無資料時才由 trades 即時計算。

### fx_records

`id`, `date`, `fromCurrency`, `toCurrency`, `fromAmount`, `toAmount`,
`exchangeRate`, `fee`, `note`, `createdAt`, `updatedAt`

### dividend_records

`id`, `date`, `market`, `ticker`, `name`, `amount`, `tax`, `currency`,
`exchangeRate`, `amountTwd`, `note`, `createdAt`, `updatedAt`

### cash_accounts

`id`, `name`, `currency`, `balance`, `note`, `updatedAt`

### cash_ledger

`id`, `date`, `accountId`, `accountName`, `currency`, `type`, `amount`,
`relatedType`, `relatedId`, `note`, `createdAt`

交易、換匯與股息異動後，server 會用來源 id 重建系統流水並更新帳戶餘額。
`relatedType=adjustment` 的人工調整會保留。若有多個相同幣別帳戶，第一版會
使用工作表中第一個相同幣別帳戶。

投資頁會透過既有 `/api/sheets` 代理，對 `investment_trades`、
`fx_records`、`dividend_records` 執行 GET、CREATE、UPDATE、DELETE。
既有 `transactions`、`categories`、`recurring_rules` 的名稱與行為不變。

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
