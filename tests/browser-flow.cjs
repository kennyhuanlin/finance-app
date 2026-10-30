/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI-only Node browser runner. */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
async function main() {
 const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','45817'], {
  env:{...process.env,FINANCE_APP_USERNAME:'fixture-owner',FINANCE_APP_ORIGIN:'http://127.0.0.1:45817',FINANCE_APP_PASSWORD:'fixture-only-012345678901234567890123456789',GOOGLE_SCRIPT_API_TOKEN:'fixture-only-012345678901234567890123456789',GOOGLE_SCRIPT_URL:'http://127.0.0.1:45999/fixture',GOOGLE_SERVICE_ACCOUNT_EMAIL:'',GOOGLE_PRIVATE_KEY:'',GOOGLE_SHEET_ID:'',NODE_OPTIONS:'--require ./tests/browser-fixture.cjs'},stdio:['ignore','pipe','pipe']});
 let log='';server.stdout.on('data',data=>log+=data);server.stderr.on('data',data=>log+=data);
 let browser, page;
 try {
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Dev server did not become ready: '+log)),60000);server.on('exit',()=>{clearTimeout(timeout);reject(new Error(log))});server.stdout.on('data',()=>{if(log.includes('Ready in')){clearTimeout(timeout);resolve();}})});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({httpCredentials:{username:'fixture-owner',password:'fixture-only-012345678901234567890123456789'}, viewport:{width:390,height:844}});
  page=await context.newPage();
  page.on("response",async response=>{if(response.url().includes("/api/")) console.log("FIXTURE_RESPONSE",response.status(),await response.text().catch(()=>""));});
  let releaseCategories, categoryRequested;
  const categoryGate=new Promise(resolve=>releaseCategories=resolve);
  const sawCategories=new Promise(resolve=>categoryRequested=resolve);
  await page.route('**/api/google/categories',async route=>{categoryRequested();await categoryGate;await route.continue();});
  await page.goto('http://127.0.0.1:45817/recurring');
  await sawCategories;
  await page.getByText('歷史固定支出',{exact:true}).waitFor();
  await page.getByRole('button',{name:'查看詳情',exact:true}).first().click();
  await page.getByRole('button',{name:'編輯',exact:true}).first().click();
  const legacyForm=page.getByRole('dialog',{name:'固定收支表單'});
  await page.getByRole('status').filter({hasText:'分類載入中'}).waitFor();
  assert.equal(await legacyForm.count(),0,'editing must wait for actual category response');
  releaseCategories();
  await legacyForm.waitFor();
  await page.unroute('**/api/google/categories');
  assert.equal(await legacyForm.getByRole('button',{name:'儲存',exact:true}).isEnabled(),true);
  assert.equal(await legacyForm.getByLabel('開始日期',{exact:true}).inputValue(),'');
  await legacyForm.getByLabel('名稱',{exact:true}).fill('歷史固定支出已編輯');
  await legacyForm.getByRole('combobox',{name:/週期/}).selectOption('quarterly');
  assert.equal(await legacyForm.getByLabel('下次執行日',{exact:true}).inputValue(),'2026-01-31');
  await legacyForm.getByRole('button',{name:'儲存',exact:true}).click();await legacyForm.waitFor({state:'hidden'});
  await page.getByText('歷史固定支出已編輯',{exact:true}).waitFor();
  const authorization='Basic '+Buffer.from('fixture-owner:fixture-only-012345678901234567890123456789').toString('base64');
  const readRules=async()=>{const r=await context.request.get('http://127.0.0.1:45817/api/google/recurring',{headers:{authorization}});assert.equal(r.status(),200);const body=await r.json();return Array.isArray(body)?body:body.data;};
  const edited=(await readRules()).find(row=>row.id==='fixture-legacy-1');
  assert.equal(edited.startDate,'');assert.equal(edited.nextRunDate,'2026-01-31');assert.equal(edited.lastRunDate,'2025-12-31');assert.equal(edited.remainingCount,'4');assert.equal(edited.enabled,true);
  // All 14 legacy shapes accept edits without touching their schedule state.
  const mutationHeaders={authorization,origin:'http://127.0.0.1:45817','content-type':'application/json'};
  const before=await readRules();assert.equal(before.filter(row=>row.id.startsWith('fixture-legacy-')).length,14);
  for(const row of before){const r=await context.request.put('http://127.0.0.1:45817/api/google/recurring',{headers:mutationHeaders,data:{id:row.id,name:row.name,category:'測試支出',amount:222,note:'合成修改',remainingCount:row.remainingCount,startDate:''}});assert.equal(r.status(),200);}
  const after=await readRules();
  for(const row of before){const actual=after.find(r=>r.id===row.id);for(const key of ['startDate','nextRunDate','lastRunDate','remainingCount','enabled'])assert.equal(actual[key],row[key],key);assert.equal(actual.amount,222);assert.equal(actual.note,'合成修改');}
  const newMissing=await context.request.post('http://127.0.0.1:45817/api/google/recurring',{headers:mutationHeaders,data:{...before[0],id:'fixture-invalid-new',startDate:''}});assert.equal(newMissing.status(),400);
  await page.getByRole('button',{name:'新增固定支出',exact:true}).first().click();
  const form=page.getByRole('dialog',{name:'固定收支表單'});
  await form.waitFor();
  assert.equal(await form.getByRole('combobox',{name:/分類/}).inputValue(),'測試支出');
  await form.getByRole('button',{name:'儲存',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'請輸入名稱'}).waitFor();
  await form.getByLabel('名稱',{exact:true}).fill('模擬失敗');
  await form.getByRole('button',{name:'1',exact:true}).click();
  await form.getByRole('button',{name:'儲存',exact:true}).click();
  await form.getByRole('alert').filter({hasText:'測試服務拒絕儲存'}).waitFor();
  assert.equal(await form.getByLabel('名稱',{exact:true}).inputValue(),'模擬失敗');
  await form.getByLabel('名稱',{exact:true}).fill('隔離固定支出');
  await form.getByLabel('開始日期',{exact:true}).fill('2026-01-31');
  assert.equal(await form.getByLabel('下次執行日',{exact:true}).inputValue(),'2026-02-28');
  await form.getByRole('combobox',{name:/週期/}).selectOption('quarterly');
  assert.equal(await form.getByLabel('下次執行日',{exact:true}).inputValue(),'2026-04-30');
  await form.getByRole('button',{name:'儲存',exact:true}).click();
  await form.waitFor({state:'hidden'});
  await page.getByText('隔離固定支出',{exact:true}).waitFor();
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/recurring-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'新增固定支出',exact:true}).first().click();await form.waitFor();
  await form.getByRole('combobox',{name:/類型/}).selectOption('收入');
  assert.equal(await form.getByRole('combobox',{name:/分類/}).inputValue(),'測試收入');
  await form.getByLabel('名稱',{exact:true}).fill('隔離固定收入');await form.getByRole('button',{name:'2',exact:true}).click();
  await form.getByRole('button',{name:'儲存',exact:true}).click();await form.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'固定收入',exact:true}).click();await page.getByText('隔離固定收入',{exact:true}).waitFor();
  await page.getByRole('button',{name:'隔離固定收入暫停',exact:true}).click();
  await page.getByRole('button',{name:'隔離固定收入啟用',exact:true}).waitFor();
  const paused=(await readRules()).find(row=>row.name==='隔離固定收入');assert.equal(paused.enabled,false);
  await context.request.put('http://127.0.0.1:45817/api/google/recurring',{headers:mutationHeaders,data:{id:paused.id,nextRunDate:'2026-01-31'}});
  await page.getByRole('button',{name:'隔離固定收入啟用',exact:true}).click();
  await page.getByRole('button',{name:'隔離固定收入暫停',exact:true}).waitFor();
  const resumed=(await readRules()).find(row=>row.id===paused.id);
  const today=new Date().toISOString().slice(0,10);
  assert.ok(resumed.nextRunDate>today);assert.equal(resumed.lastRunDate,paused.lastRunDate);assert.equal(resumed.remainingCount,paused.remainingCount);
  await page.getByRole('button',{name:'查看詳情',exact:true}).first().click();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'刪除',exact:true}).first().click();
  await page.getByText('隔離固定收入',{exact:true}).waitFor({state:'hidden'});
  assert.ok(!(await readRules()).some(row=>row.name==='隔離固定收入'));
  // Exercise real HTTP handlers for ordinary transaction CRUD using synthetic storage.
  const txUrl='http://127.0.0.1:45817/api/google/transactions';
  assert.equal((await context.request.post(txUrl,{headers:mutationHeaders,data:{id:'fixture-tx',date:'2026-01-31',type:'支出',category:'測試支出',amount:3}})).status(),200);
  assert.equal((await context.request.put(txUrl,{headers:mutationHeaders,data:{id:'fixture-tx',note:'合成編輯'}})).status(),200);
  assert.equal((await context.request.delete(txUrl,{headers:mutationHeaders,data:{id:'fixture-tx'}})).status(),200);
  await page.goto('http://127.0.0.1:45817/transactions');
  await page.getByRole('button',{name:'新增',exact:true}).click();
  const txForm=page.getByRole('dialog',{name:'交易表單'});await txForm.waitFor();
  await txForm.getByRole('combobox',{name:'分類',exact:true}).selectOption('測試支出');
  await txForm.getByLabel('開啟金額計算機',{exact:true}).click();
  const calculator=page.getByRole('dialog',{name:'金額計算機'});await calculator.waitFor();
  await calculator.getByRole('button',{name:'3',exact:true}).click();await calculator.getByRole('button',{name:'確認 OK',exact:true}).click();
  await txForm.getByLabel('備註',{exact:true}).fill('一般交易失敗測試');
  await page.route('**/api/google/transactions',route=>route.request().method()==='POST'&&route.request().postDataJSON().note==='一般交易失敗測試'?route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'合成一般交易失敗'})}):route.continue());
  await txForm.getByRole('button',{name:'儲存',exact:true}).click();await txForm.getByRole('alert').filter({hasText:'合成一般交易失敗'}).waitFor();
  assert.equal(await txForm.getByLabel('備註',{exact:true}).inputValue(),'一般交易失敗測試');
  await txForm.getByLabel('備註',{exact:true}).fill('手機合成交易');await txForm.getByRole('button',{name:'儲存',exact:true}).click();await txForm.waitFor({state:'hidden'});
  await page.getByText('手機合成交易',{exact:true}).waitFor();await page.getByRole('button',{name:'編輯',exact:true}).first().click();await txForm.waitFor();
  await txForm.getByLabel('備註',{exact:true}).fill('手機合成交易已修改');await page.screenshot({path:'test-results/transactions-mobile.png',fullPage:true});await txForm.getByRole('button',{name:'儲存',exact:true}).click();await txForm.waitFor({state:'hidden'});
  await page.getByText('手機合成交易已修改',{exact:true}).waitFor();page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'刪除',exact:true}).first().click();
  await page.getByText('手機合成交易已修改',{exact:true}).waitFor({state:'hidden'});await page.unroute('**/api/google/transactions');
  const remainingTx=await context.request.get(txUrl,{headers:{authorization}});assert.equal((await remainingTx.json()).length,0);
  const recovery=await browser.newContext({httpCredentials:{username:'fixture-owner',password:'fixture-only-012345678901234567890123456789'},viewport:{width:390,height:844}});
  const retryPage=await recovery.newPage();let failCategories=true;
  await retryPage.route('**/api/google/categories',route=>failCategories?route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'合成分類服務失敗'})}):route.continue());
  await retryPage.goto('http://127.0.0.1:45817/recurring');
  await retryPage.getByRole('alert').filter({hasText:'分類載入失敗'}).waitFor();
  await retryPage.getByRole('button',{name:'新增固定支出',exact:true}).first().click();
  assert.equal(await retryPage.getByRole('dialog',{name:'固定收支表單'}).count(),0);
  failCategories=false;
  await retryPage.getByRole('button',{name:'重新載入分類',exact:true}).click();
  await retryPage.waitForFunction(()=>Array.from(document.querySelectorAll('[role="alert"]')).every(node=>!node.textContent.includes('合成分類服務失敗')));
  await retryPage.getByRole('button',{name:'新增固定支出',exact:true}).first().click();
  const retryForm=retryPage.getByRole('dialog',{name:'固定收支表單'});await retryForm.waitFor();
  assert.equal(await retryForm.getByRole('combobox',{name:/分類/}).inputValue(),'測試支出');
  await recovery.close();
  // Self-contained synthetic USD/TWD valuation (never reaches real Sheets).
  await page.route('https://api.frankfurter.dev/v2/providers/cbc/rate/usd/twd',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({base:'USD',quote:'TWD',date:'2026-10-29',rate:31.5}),
  }));
  await page.route('**/api/google/investments',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({data:{
      investment_trades:[],
      investment_positions:[{market:'US',ticker:'TEST',name:'Synthetic US holding',quantity:2,averageCost:100,totalCost:200,currency:'USD'}],
      fx_records:[],dividend_records:[],
      cash_accounts:[{id:'synthetic-usd',name:'Synthetic USD account',currency:'USD',balance:50}],
      cash_ledger:[],
    },errors:{}}),
  }));
  await page.route('**/api/google/investments/prices',route=>route.fulfill({
    status:200,contentType:'application/json',body:JSON.stringify({data:[
      {market:'US',symbol:'TEST',name:'Synthetic US holding',price:150,currency:'USD',price_date:'2026-10-29',updatedAt:'2026-10-29T00:00:00Z'},
    ]}),
  }));
  await page.goto('http://127.0.0.1:45817/investments');
  await page.getByText('美股投資',{exact:true}).waitFor();
  await page.getByText('1 USD = 31.5000 TWD',{exact:false}).waitFor();
  await page.getByText('約 NT$6,300',{exact:true}).first().waitFor();
  await page.getByText('約 NT$9,450',{exact:true}).first().waitFor();
  await page.getByText('約 NT$1,575',{exact:true}).first().waitFor();
  const anonymous=await browser.newContext();
  const publicRead=await anonymous.request.get('http://127.0.0.1:45817/api/google/recurring');
  assert.equal(publicRead.status(),200);
  const blocked=await anonymous.request.post('http://127.0.0.1:45817/api/google/recurring',{headers:{origin:'https://attacker.invalid','content-type':'application/json'},data:{id:'fixture-no-write'}});
  assert.equal(blocked.status(),403);
  await anonymous.close();
  console.log('Browser PASS: response-gated category race, 14 synthetic legacy edits preserve schedule state, category error/retry, recurring delete, transaction HTTP and mobile UI CRUD, visible server failure, pause/resume without catch-up; legacy edit without start-date backfill, frequency change preserves next date, delayed categories, visible validation, server error preserves input, expense/income create, quarter/month end, anonymous API readable; cross-origin mutation denied. Synthetic investment USD/TWD reference labels confirmed.');
 } catch(error) {
  if(page){fs.mkdirSync("test-results",{recursive:true});await page.screenshot({path:"test-results/browser-failure.png",fullPage:true}).catch(()=>{});}
  if(page) console.error("FIXTURE_DOM",await page.locator("body").innerText());
  console.error("FIXTURE_SERVER_LOG",log);throw error;
 } finally {if(browser)await browser.close();server.kill('SIGTERM');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
