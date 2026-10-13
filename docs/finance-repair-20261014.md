# Finance App 修復候選｜2026-10-14

原專案 `kennyhuanlin/finance-app`、原 Vercel `finance-app`（`prj_d0BThAlEaM6Ao8FlUFAliW0ViqI2`）與原 Finance App DB 延續使用。基準 main：`e3d4280b00279965baa8062da41fb8c1f439187b`。候選分支：`fix/recurring-and-confirmed-defects-20261014`；審查入口：[Draft PR #1](https://github.com/kennyhuanlin/finance-app/pull/1)。

## 已完成工程修復

| 缺陷 | 候選行為 |
| --- | --- |
| 固定收支驗證無提示退出 | 名稱、金額、分类、日期與期數顯示具體錯誤，保留輸入 |
| 分類載入競態 | 新增表單先等待分類；以收入／支出對應分類 ID |
| API 錯誤被表單遮住 | 在表單內顯示錯誤與狀態，拒絕無效 JSON／假成功回應 |
| 一般交易無提示退出／列表更新誤報 | 有限正數與有效分類檢查；成功寫入後刷新失敗不再當成儲存失敗 |
| 每季變每月／31 日跳月 | 季度增加三個月；短月夾到月底，後续維持開始日錨點 |
| GET 補欄／建表／補 ID | 所有單表、投資合併與價格讀取不再做這些写入 |
| API 缺少存取檢查 | 頁面與每個 API handler 都做單一管理者 Basic 認證；同來源 JSON 寫入檢查 |
| Apps Script 公開入口／並行排程 | Token 保護候選；排程與 Web API 共用 Script Lock；整列狀態更新保留公式 |
| 舊 Next.js 依賴 | Next.js／eslint-config-next 固定 16.3.6；435 個鎖檔套件項目與 CI 候選結構回讀一致 |

## 隔離驗證與限制

`npm test` 的 36 項測試全部使用合成資料、臨時 RSA 私鑰與攔截的網路請求，未使用正式憑證或 Finance App DB。覆蓋固定收支新增／修改／刪除、驗證錯誤、所有 API 未登入拒絕、GET 無試算表寫入、季度／月底／閏年、防重複、期數、排程中斷後恢復與原公式保留。

TypeScript 與本地 lint 通過（0 errors、21 個既有 warnings）。本地 webpack build 通過，但使用原 16.2.6 node_modules 與字型測試替身；修補版 16.3.6、固定鎖檔 `npm ci`、390×844 手機瀏覽器完整流程及雲端 webpack build 的最終結果以 PR Checks 為準。CI 不讀取正式憑證，不部署，僅在 PR 執行。

## 正式發布前須精確批准

1. 在原 Vercel 專案設定 `FINANCE_APP_USERNAME`、至少 32 字元高熵 `FINANCE_APP_PASSWORD` 及明確的 `FINANCE_APP_ORIGIN`（預定公開來源）。不要把憑證提交到 Git 或 PR。反向代理的內部網址可能與公開來源不同，來源設定不可省略。
2. 如要發布 Apps Script 候選，先取得目前原生來源／設定／Trigger 的備份及回滾證據，再批准精確來源 SHA。設定 Script Property `FINANCE_API_TOKEN` 與同值 Vercel `GOOGLE_SCRIPT_API_TOKEN`；舊公開 GET 入口將拒絕請求，受保護的讀取改走 POST read。
3. 取得精確 Head 的完整 CI 成功證據，再分別批准 PR 合併、正式環境設定及 Production／Apps Script 發布。

缺少應用程式存取設定時候選拒絕存取（503）；沒有為了測試而關閉正式保護。未修改正式財務資料、正式安全設定、main 或 Production；未發布 Apps Script，未建立新 Vercel 專案或資料庫。Git 分支寫入可能觸發原 Vercel Git 整合的 Preview build，這不表示正式修復已上線。

正式發布回滾包必須指定既有部署 ID、原生 Apps Script 備份與環境設定前像。本分支及 Draft PR 本身可撤回；不擅自改寫財務歷史或回填既有交易。
