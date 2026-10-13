/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CI-only Node browser runner. */
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const fs = require('node:fs');
async function main() {
 const server = spawn(process.execPath, ['node_modules/next/dist/bin/next','dev','--webpack','--hostname','127.0.0.1','--port','45817'], {
  env:{...process.env,FINANCE_APP_USERNAME:'fixture-owner',FINANCE_APP_PASSWORD:'fixture-only-012345678901234567890123456789',GOOGLE_SCRIPT_API_TOKEN:'fixture-only-012345678901234567890123456789',GOOGLE_SCRIPT_URL:'http://127.0.0.1:45999/fixture',GOOGLE_SERVICE_ACCOUNT_EMAIL:'',GOOGLE_PRIVATE_KEY:'',GOOGLE_SHEET_ID:'',NODE_OPTIONS:'--require ./tests/browser-fixture.cjs'},stdio:['ignore','pipe','pipe']});
 let log='';server.stdout.on('data',data=>log+=data);server.stderr.on('data',data=>log+=data);
 let browser;
 try {
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('Dev server did not become ready: '+log)),60000);server.on('exit',()=>{clearTimeout(timeout);reject(new Error(log))});server.stdout.on('data',()=>{if(log.includes('Ready in')){clearTimeout(timeout);resolve();}})});
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({httpCredentials:{username:'fixture-owner',password:'fixture-only-012345678901234567890123456789'}, viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.goto('http://127.0.0.1:45817/recurring');
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
  const anonymous=await browser.newContext();const denied=await anonymous.request.get('http://127.0.0.1:45817/api/google/recurring');assert.equal(denied.status(),401);await anonymous.close();
  console.log('Browser PASS: delayed categories, visible validation, server error preserves input, expense/income create, quarter/month end, anonymous API denied.');
 } finally {if(browser)await browser.close();server.kill('SIGTERM');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
