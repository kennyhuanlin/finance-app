# Finance App｜PR #1 發布準備｜2026-10-14

原專案 `kennyhuanlin/finance-app`、原分支 `fix/recurring-and-confirmed-defects-20261014`、[唯一 Draft PR #1](https://github.com/kennyhuanlin/finance-app/pull/1)。main 目前仍是 `e3d4280b00279965baa8062da41fb8c1f439187b`。沒有合併、Production 發布、正式環境設定變更、正式財務資料寫入或付費資源建立。

## 結論與證據界線

工程修復已有成功完整 CI。完整正式發布仍 **BLOCKED**：正式登入變數尚未設定；正式 DB 私有快照與原生還原演練尚缺；Apps Script 的版本 7 Trigger 切換方案仍須批准。不能用 Preview READY 或來源取證代替正式營運／回滾驗收。

成功工程檢查點：`1c3cac7891972cde5e0ebe5cd83656376f81f126`，[CI 38546842191](https://github.com/kennyhuanlin/finance-app/actions/runs/38546842191) 完整成功：52 項隔離測試、TypeScript、lint（0 errors／21 warnings）、390×844 手機流程及固定鎖檔安裝後的 Next.js 16.3.6 webpack build。後續增量擴大一般交易手機 CRUD 與暫停恢復覆蓋，最終批准必須使用這些增量上傳後的最新成功 Head／CI，不能沿用上述中間 SHA。

## 已修復與驗收範圍

| 項目 | 候選結果／驗證 |
| --- | --- |
| 分類載入競態 | 原 Head 的 `openEditForm` 直接開表單；分類網路回應稍晚抵達，儲存時被 `isLoadingCategories` 擋住。現在新增／編輯都等待分類實際回應；cache 與 network 路徑均同步更新資料、錯誤及 readiness；分類不可用時儲存停用，提供重新載入／管理分類。重試清除先前錯誤並保留表單輸入 |
| 測試時序 | 以可釋放的分類回應 barrier 重現，分類未回應時確認表單尚未開啟；沒有增加固定等待秒數。先前第二個增量 CI 的失敗是兩個 alert 的 strict locator，加上產品重試殘留訊息；兩者皆已修正 |
| 歷史規則 | 最新唯讀讀取 15 筆規則，其中 14 筆 startDate 空白。只用 14 筆合成資料驗證編輯，沒有對正式 14 筆執行寫入；名稱、分類、金額、備註、期數可改。空白 startDate 不回填／不清除既有日期，其他排程欄位保持原值；新增仍拒絕空白或無效日期 |
| 排程日期 | 月底 29／30／31、monthly／quarterly、閏年與年度回復，Apps Script 和 Next.js 候選計算一致。已有開始日錨點可在短月後回到原日；歷史空白 startDate 無法可靠推測早期原始錨點，以現有 nextRunDate 作後续錨點，這是資料限制 |
| 暫停／恢復 | 暫停不生成交易；列表與表單恢復規則時均從未來的新 nextRunDate 開始，保留 lastRunDate／remainingCount，不補記停用期間 |
| 固定收支手機流程 | 延遲分類、舊規則編輯、14 筆合成規則排程狀態保留、日期驗證、可見儲存錯誤與保留輸入、支出／收入新增、刪除、分類失敗與重試 |
| 一般交易 | 實際 HTTP handler 的新增／編輯／刪除已通過；最後增量另加入手機表單／金額計算機／失敗保留輸入／編輯／刪除，結果以最新完整 CI 為準 |
| 未授權存取 | 頁面 proxy 與全部財務 API handler 的 Basic 登入／同來源 JSON 寫入檢查；未登入先拒絕，未觸及後端；缺正式登入設定回傳 503 |
| GET 唯讀 | 單表、投資彙總、價格讀取移除補欄／建表／補 ID；service account GET 無 Sheets mutation；Apps Script POST read 經 Token 且無表格寫入 |
| 排程互斥／恢復 | Apps Script scheduler 與候選 Web API 共用 Script Lock；重複交易抑制；append 成功但規則更新中斷後，恢復狀態而不再 append；整列更新保留原公式 |
| 投資／換匯／現金同步 | 取消清空後再寫入，改為一次完整矩形寫入與尾端清除；寫入拒絕時不留下空表。來源 ID 缺失／重複、缺少幣別現金帳戶時在派生表替換前停止。純計算與拒絕路徑使用合成來源 |
| 依賴 | Next.js／eslint-config-next 固定 16.3.6，保留既有鎖檔；CI npm ci 後 build 成功，不使用正式憑證 |

## 仍保留的工程限制

1. Script Lock 只保護同一 Apps Script 的候選寫入，不保護 service account 的直接 Sheets 寫入。Next.js 的同步旗標只涵蓋單一實例，沒有分散式鎖。發布窗口須隔離 Writer；不能宣稱並行跨平台全域互斥已通過。
2. 派生表的替換已做到每張表單次寫入，但跨投資持倉、cash_ledger、cash_accounts 仍不是全庫交易。中途失敗必須重新核對來源後恢復同步；不得把來源交易新增失敗與「來源已成功、派生同步失敗」混為一談，更不能盲目重送。
3. 正式資料完整性、缺失 ID 的確切列、帳戶配置及所有外部 Writer 尚未全量核對。此輪沒有對正式投資／現金資料運行同步，也不提出 ID 回填／資料修正授權。
4. 本地 Playwright 套件不可用，瀏覽器證據由無正式憑證的 GitHub CI 產出。本地 TypeScript／lint 和 52 項隔離測試成功；build 與手機驗收使用雲端精確 Head。

## 正式服務唯讀取證

| 資源 | 已確認 | 尚缺／阻擋 |
| --- | --- | --- |
| Vercel | 原專案 `prj_d0BThAlEaM6Ao8FlUFAliW0ViqI2`、scope `kennyhuanlins-projects`；網頁已登入可讀。Production `dpl_8WdeyFVt9fpipBHV7ru8CUgbn9Vj`，main SHA `e3d4280…`，網域 `https://finance-app-pied-kappa.vercel.app` | 連接器 project/env 的 403 已保存；沒有可用 Vercel CLI。原生 rollback 權限／演練未做，不能只憑存在部署認定可安全回滾 |
| 環境變數 | 原生 All Environments 清單顯示 GOOGLE_SHEET_ID、GOOGLE_SERVICE_ACCOUNT_EMAIL、GOOGLE_PRIVATE_KEY、GOOGLE_SCRIPT_URL 均為 Production and Preview；未點開或讀取秘密值 | 未見 FINANCE_APP_USERNAME、FINANCE_APP_PASSWORD、FINANCE_APP_ORIGIN、GOOGLE_SCRIPT_API_TOKEN。先合併會讓新版本 fail-closed 503。Preview 沿用正式 Google 連線變數，因此不能對 Preview 做真實財務寫入測試 |
| 原 DB | `1ulGnO6P5632E3P8g_UrvunYNGdLerQQINtUm0_ZGFmk`，12 個工作表，locale zh_TW／Asia/Taipei。查得 revision 998、前版 997；之後若有寫入須重新取證 | 尚未建立私有資料／公式／格式快照；revision 歷史不是獨立備份；沒有正式／隔離原生還原演練。使用中的財務資料不得用舊快照整份覆蓋 |
| 原 Apps Script | `1_gC2cPL3JrZwIUMPmBN0k3NXwMWMgaOG0EHDt2L9QDMn8mlgSrX8K2ro`，登入 Owner nightmare790927@gmail.com。只有程式碼.gs；原生來源與版本 7 一致，Manifest 也一致 | 已取得來源文字與 Manifest 前像，但不是 API-byte／觸發 UID／Properties 完整備份；CLI getContent v7 因 script.googleapis.com DNS 不可達失敗。Properties 名稱核對未見 FINANCE_API_TOKEN，未讀取任何屬性秘密值 |
| Web App | 當前 active v7，deployment `AKfycbylOTis_vEGwRWCsEEQebkVXB4V0XGMG0WzSh7w3PURpZHEd4_O57-wrW5Yc7aO8fKf`，executeAs USER_DEPLOYING，access ANYONE_ANONYMOUS | 原程式沒有 Token 檢查或 Script Lock。候選 token-based POST read 只相容於候選 Script；發布前須配對設定，不能先切換需要 fallback 的用戶端 |
| Trigger | 唯一可見 recurringTransactions，Owner「我」，部署版本 7，daily 01:00–02:00，GMT+08，最後執行 2026-10-14 01:43:17，畫面錯誤率 0%。編輯對話框的部署選項 disabled；本輪取消而未儲存 | 尚未取得 UID；不能推定只改 HEAD／Web App 就會套用排程。須另外精確批准舊 Trigger 的版本切換方法；若需重建，必須先取得原 UID 與隔離還原方案，避免重複 Trigger |

來源 SHA256：`4ebbfaf4fc4891a39f6ed566ca18def1a623d7105796213f4b60ca6e8a47bd73`；Manifest SHA256：`729a4c61bc65411f221c76ce80d368e477374cd3670f8f95cad5e9fc990ec5f0`。來源取證包不含財務列、Vercel env 值或 Script Properties 值；文字取證不能宣稱完整原生備份／還原驗收。

## Owner 精確批准清單與正確順序

**目前只能準備批准，不能直接執行完整正式發布。**

| 順序 | 具體變更／必要批准 | 執行前條件 |
| --- | --- | --- |
| P0：發布前備份 | 原 DB 的私有快照（資料、公式、格式、工作表與 version 前像）；原 Script 全來源／Manifest、部署 v7、Trigger UID／完整配置與 properties 的 Owner 私密前像；隔離還原驗證 | 不擴大分享、不輸出秘密、不改正式財務列；凍結／隔離實際 Writer 窗口。此輪為唯讀取證，尚未創建快照 |
| P1：登入設定 | 只在原 Vercel Production 設定 FINANCE_APP_USERNAME、FINANCE_APP_PASSWORD（至少 32 字元高熵）及 FINANCE_APP_ORIGIN=`https://finance-app-pied-kappa.vercel.app` | Owner 在服務內安全輸入，不把密碼貼到聊天／PR；核對不存在前像與回復方式。現有 Production 不重部署、不先合併 |
| P2：Script Token 與候選準備 | 同一 Script `FINANCE_API_TOKEN`、原 Vercel Production `GOOGLE_SCRIPT_API_TOKEN` 配對設定；保留原 service account／sheet／GOOGLE_SCRIPT_URL。候選為 PR 精確 Head 的兩份 apps-script/*.js | Owner 安全輸入同值 Token；比對本輪原生前像。替換原程式碼.gs 與拆成兩檔不可留下重複 doGet／doPost／recurringTransactions；保留 Manifest、執行身分、存取範圍與時區 |
| P3：Script 與 Trigger 發布 | 批准原 Script ID、既有 Web App deployment ID、候選來源 blob／SHA256、新原生版本，以及唯一 daily Trigger 的精確切換 | 原生備份／隔離還原通過；原 v7 作精確回滾目標。未批准新頻率、額外 Trigger、手動執行正式 recurringTransactions 或回溯補記 |
| P4：合併與 Production | repo `kennyhuanlin/finance-app`、PR #1 的最新成功精確 Head、squash merge 至上述核對後的 main、原 Vercel Production 與原網域 | 再讀 main／PR Head，確認全成功 CI、登入／origin 已設定，備份與 rollback 目標有效。main 是 Production Git 來源，合併可能立即自動部署：合併與 Production 批准必須綁定；若採先 stage 再 promote，須另外批准正式 Git 自動發布控制，不得擅自停用 |
| P5：正式唯讀驗收 | Owner 登入成功、未登入頁面／API 拒絕、合法讀取无 Sheets 寫入、版本與網域一致 | 寫入測試繼續用合成資料。正式新增／刪除交易、重算持倉、ID 或 startDate 回填均不包含在此次批准 |
| P6：有條件回滾 | Vercel 原部署精確 ID＋已批准存取邊界；Script 回選 v7 並恢復對應 Trigger 配置／來源 | 舊版 Vercel／Script 缺新保護，不能盲目公開回滾。登入503／合法請求403／重複排程／來源不一致先停止驗收，記錄已發生寫入；程式回滾不撤銷財務交易，禁止全庫舊快照覆蓋 |

在 P0～P3 沒有證據前，不能批准 P4。若 Owner 想分階段先上線前端，必須明確接受舊 Apps Script 排程仍為 v7、舊公開入口保護尚未修復的邊界；不能把此局部批准稱為全系統發布完成。

[Apps Script getContent 原生備份介面](https://developers.google.com/apps-script/api/reference/rest/v1/projects/getContent)與[部署版本管理](https://developers.google.com/apps-script/api/how-tos/manage-deployments)是回滾方案依據；具體 Trigger 版本證據以本輪原生 UI 為準。
