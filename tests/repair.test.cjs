/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS test loader deliberately compiles TS route modules. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');
const crypto = require('node:crypto');
const originalLoad = Module._load;
Module._load = function(id, ...args) { if(id === 'server-only') return {}; return originalLoad.call(this,id,...args); };
require.extensions['.ts'] = function(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, filename);
};
// Every external request is a fixture or a hard failure. No real credentials/data.
global.fetch = async () => { throw new Error('Unmocked network access prohibited'); };
const { addPeriod, validateRecurringRule } = require('../app/lib/recurringDates.ts');
const { requireFinanceAccess } = require('../app/lib/apiAccess.ts');
const client = require('../app/lib/googleSheets.ts');
const password = 'fixture-only-012345678901234567890123456789';
process.env.FINANCE_APP_USERNAME = 'fixture-owner';
process.env.FINANCE_APP_PASSWORD = password;
const authorization = `Basic ${Buffer.from(`fixture-owner:${password}`).toString('base64')}`;
function request(path='/api/google/recurring', method='GET', body, headers={}) {
  return new Request(`https://fixture.invalid${path}`, { method, headers: {authorization, ...(method==='GET' ? {} : {'content-type':'application/json', origin:'https://fixture.invalid'}), ...headers}, ...(body===undefined ? {} : {body:JSON.stringify(body)}) });
}
const validRule={id:'fixture-rule', name:'Synthetic expense', category:'Fixture category', type:'支出', amount:125,frequency:'monthly',startDate:'2026-01-31',nextRunDate:'2026-02-28',remainingCount:'',enabled:true};
for(const [date,frequency,anchor,expected] of [
 ['2026-01-31','monthly',undefined,'2026-02-28'],['2026-02-28','monthly','2026-01-31','2026-03-31'],
 ['2024-02-29','yearly',undefined,'2025-02-28'],['2026-01-31','quarterly',undefined,'2026-04-30'],
 ['2026-12-31','quarterly',undefined,'2027-03-31'],['2026-12-31','daily',undefined,'2027-01-01'],
 ['2026-12-28','weekly',undefined,'2027-01-04'],['2026-02-30','monthly',undefined,''],['2026-01-01','bogus',undefined,''],
]) test(`date ${date} ${frequency}`,()=>assert.equal(addPeriod(date,frequency,anchor),expected));
test('valid full recurring and partial pause payloads',()=>{assert.equal(validateRecurringRule(validRule),'');assert.equal(validateRecurringRule({enabled:false},true),'');});
test('legacy edits allow only missing start dates; new rules and malformed dates remain rejected',()=>{
 for(const startDate of ['',undefined,null]) {
  assert.ok(validateRecurringRule({...validRule,startDate}));
  assert.equal(validateRecurringRule({...validRule,startDate},false,true),'');
 }
 assert.ok(validateRecurringRule({...validRule,startDate:'2026-02-30'},false,true));
 assert.ok(validateRecurringRule({...validRule,startDate:'',nextRunDate:''},false,true));
});
for(const patch of [{name:' '},{category:''},{amount:0},{amount:NaN},{amount:Infinity},{remainingCount:'-1'},{remainingCount:'1.2'},{startDate:'2026-02-30'},{nextRunDate:''},{endDate:'2025-12-31'},{frequency:'bogus'}]) test(`invalid recurring ${JSON.stringify(patch)}`,()=>assert.ok(validateRecurringRule({...validRule,...patch})));
test('auth fail-closed, exact credential and CSRF checks',()=>{
 assert.equal(requireFinanceAccess(request()),null);
 assert.equal(requireFinanceAccess(request('', 'GET',undefined,{authorization:''})).status,401);
 assert.equal(requireFinanceAccess(request('', 'GET',undefined,{authorization:'Basic abc='})).status,401);
 assert.equal(requireFinanceAccess(request('', 'POST',{}, {origin:'https://attacker.invalid'})).status,403);
 assert.equal(requireFinanceAccess(request('', 'POST',{}, {origin:''})).status,403);
 assert.equal(requireFinanceAccess(request('', 'POST',{}, {'content-type':'text/plain'})).status,415);
 const saved=process.env.FINANCE_APP_PASSWORD; delete process.env.FINANCE_APP_PASSWORD;
 assert.equal(requireFinanceAccess(request()).status,503); process.env.FINANCE_APP_PASSWORD=saved;
});
test('all route handlers refuse unauthenticated requests before any network activity',async()=>{
 for(const [path,method,context] of [
 ['../app/api/google/[resource]/route.ts','GET',{params:Promise.resolve({resource:'recurring'})}],
 ['../app/api/google/[resource]/route.ts','POST',{params:Promise.resolve({resource:'recurring'})}],
 ['../app/api/google/[resource]/route.ts','PUT',{params:Promise.resolve({resource:'recurring'})}],
 ['../app/api/google/[resource]/route.ts','DELETE',{params:Promise.resolve({resource:'recurring'})}],
 ['../app/api/google/investments/route.ts','GET'],['../app/api/google/investments/prices/route.ts','GET'],
 ['../app/api/google/investments/prices/route.ts','POST'],['../app/api/google/investments/sync/route.ts','POST'],
 ['../app/api/sheets/route.ts','GET'],['../app/api/sheets/route.ts','POST']]) {
  const response=await require(path)[method](request('',method,method==='GET'?undefined:{},{authorization:''}),context);assert.equal(response.status,401,`${path} ${method}`);
 }
});
test('service-account recurring CRUD and investment GET have no read-side writes',async()=>{
 const server=require('../app/lib/googleSheetsServer.ts');
 process.env.GOOGLE_SHEET_ID='fixture-only';process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL='fixture@fixture.invalid';
 process.env.GOOGLE_PRIVATE_KEY=crypto.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}}).privateKey;
 const fixture = Object.fromEntries(Object.entries(server.sheetHeaders).map(([sheet,headers])=>[sheet,[Array.from(headers)]]));
 let calls=[];
 global.fetch=async(url,options={})=>{
  url=String(url);calls.push({url,method:options.method||'GET',body:options.body});
  if(url==='https://oauth2.googleapis.com/token') return Response.json({access_token:'fixture-token',expires_in:3600});
  assert.ok(url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/fixture-only'));
  if(url.includes('?fields=sheets.properties')) return Response.json({sheets:Object.keys(fixture).map((title,sheetId)=>({properties:{title,sheetId}}))});
  if(url.includes('/values:batchGet')) return Response.json({valueRanges:new URL(url).searchParams.getAll('ranges').map(range=>({values:fixture[range.split('!')[0]]}))});
  if(url.includes('/values:batchUpdate')) return Response.json({totalUpdatedCells:1});
  const range=decodeURIComponent(url.split('/values/')[1]?.split('?')[0]||''); const sheet=range.split('!')[0];
  if(options.method==='POST' && range.includes(':append')) {fixture[sheet].push(JSON.parse(options.body).values[0]);return Response.json({updates:{updatedRows:1}});}
  if(url.endsWith(':batchUpdate')) return Response.json({replies:[{}]});
  if(!options.method || options.method==='GET') return Response.json({values:range.endsWith('1:Z1')?[fixture[sheet][0]]:fixture[sheet]});
  throw new Error('Unexpected mocked write '+url);
 };
 const route=require('../app/api/google/[resource]/route.ts'); const ctx={params:Promise.resolve({resource:'recurring'})};
 assert.equal((await route.POST(request('', 'POST',validRule),ctx)).status,201);
 assert.equal(fixture.recurring_rules.length,2);
 assert.equal((await route.POST(request('', 'POST',{...validRule,amount:0}),ctx)).status,400);
 assert.equal(fixture.recurring_rules.length,2);
 calls=[];
 assert.equal((await route.GET(request(),ctx)).status,200);
 assert.equal((await require('../app/api/google/investments/route.ts').GET(request())).status,200);
 assert.equal((await require('../app/api/google/investments/prices/route.ts').GET(request())).status,200);
 assert.ok(calls.every(call=>call.method==='GET'),JSON.stringify(calls));
 assert.equal((await route.PUT(request('', 'PUT',{id:'fixture-rule',enabled:false}),ctx)).status,200);
 const startColumn=fixture.recurring_rules[0].indexOf('startDate');
 for(const existingStart of ['', '2026-01-31']) {
  fixture.recurring_rules[1][startColumn]=existingStart;
  calls=[];
  assert.equal((await route.PUT(request('', 'PUT',{...validRule,startDate:'',name:'Synthetic legacy edit'}),ctx)).status,200);
  const writes=calls.filter(call=>call.url.includes('/values:batchUpdate')).flatMap(call=>JSON.parse(call.body).data);
  assert.ok(writes.length>0);
  assert.ok(writes.every(write=>write.range!==`recurring_rules!${String.fromCharCode(65+startColumn)}2`),'blank updates must not write startDate');
 }
 calls=[];
 assert.equal((await route.POST(request('', 'POST',{...validRule,startDate:''}),ctx)).status,400);
 assert.equal(calls.length,0);
 assert.equal((await route.PUT(request('', 'PUT',{...validRule,startDate:'2026-02-30'}),ctx)).status,400);
 assert.equal(calls.length,0);
 assert.equal((await route.DELETE(request('', 'DELETE',{id:'fixture-rule'}),ctx)).status,200);
 global.fetch=async()=>{throw new Error('Unmocked network access prohibited');};
});
test('client preserves backend errors and rejects malformed success',async()=>{
 global.fetch=async()=>Response.json({error:'Synthetic validation failure'},{status:400});
 await assert.rejects(client.createRecurringRule(validRule),/Synthetic validation failure/);
 global.fetch=async()=>new Response('<html>bad gateway</html>',{status:200});
 await assert.rejects(client.createRecurringRule(validRule)); await assert.rejects(client.getRecurringRules());
 global.fetch=async()=>Response.json({ok:true,id:'fixture-rule'},{status:201});
 assert.equal((await client.createRecurringRule(validRule)).id,'fixture-rule');
});
function scriptFixture(patch={}) {
 const ruleHeaders=['id','name','type','category','amount','frequency','startDate','nextRunDate','lastRunDate','remainingCount','enabled','endDate'];
 const txHeaders=['id','date','type','category','amount','note','sourceType','recurringId'];
 const record={...validRule,startDate:'2026-01-31',nextRunDate:'2026-01-31',remainingCount:'2',...patch};
 const rows={recurring_rules:[ruleHeaders,ruleHeaders.map(h=>record[h]??'')],transactions:[txHeaders]};let writes=0,released=0;
 const sheet=name=>({getDataRange:()=>({getValues:()=>rows[name].map(row=>[...row])}),appendRow:row=>{writes++;rows[name].push(row);},getRange:(row,col,_height,width=1)=>({
 getValues:()=>[rows[name][row-1].slice(col-1,col-1+width)],getFormulas:()=>[Array(width).fill("")],
 setValues:values=>{writes++;rows[name][row-1].splice(col-1,width,...values[0]);},
 setValue:value=>{writes++;rows[name][row-1][col-1]=value;}})});
 const context=vm.createContext({Date,Set,Number,String,Object,Math,Error,SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:sheet})},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released++})}});
 vm.runInContext(fs.readFileSync('apps-script/recurringTransactions.js','utf8'),context);
 return {context,rows,writes:()=>writes,released:()=>released,rule:()=>Object.fromEntries(ruleHeaders.map((h,i)=>[h,rows.recurring_rules[1][i]]))};
}
test('scheduler duplicate suppression, anchored month end and remaining periods',()=>{
 const f=scriptFixture();f.context.recurringTransactions();assert.equal(f.rows.transactions.length,2);assert.equal(f.rule().nextRunDate,'2026-02-28');assert.equal(f.rule().remainingCount,'1');
 f.rows.recurring_rules[1][7]='2026-01-31';f.context.recurringTransactions();assert.equal(f.rows.transactions.length,2);assert.equal(f.rule().remainingCount,'1');assert.equal(f.released(),2);
});
test('scheduler quarterly and exhaustion',()=>{const f=scriptFixture({frequency:'quarterly',remainingCount:'1'});f.context.recurringTransactions();assert.equal(f.rule().nextRunDate,'2026-04-30');assert.equal(f.rule().enabled,false);});
for(const frequency of ['monthly','quarterly']) test(`scheduler repeated ${frequency} preserves anchored month ends`,()=>{
 const f=scriptFixture({frequency,remainingCount:''});
 const expected=frequency==='monthly'?['2026-02-28','2026-03-31','2026-04-30']:['2026-04-30','2026-07-31','2026-10-31'];
 for(const next of expected){f.context.recurringTransactions();assert.equal(f.rule().nextRunDate,next);}
 assert.equal(f.rows.transactions.length,4);
});
for(const [frequency,expected] of [['monthly','2026-02-28'],['quarterly','2026-04-30']]) test(`legacy scheduler ${frequency} uses next date without backfilling start`,()=>{
 const f=scriptFixture({startDate:'',frequency});f.context.recurringTransactions();
 assert.equal(f.rule().startDate,'');assert.equal(f.rule().nextRunDate,expected);assert.equal(f.rows.transactions.length,2);
});
for(const patch of [{enabled:false},{remainingCount:'0'},{remainingCount:'broken'},{amount:0},{nextRunDate:'2026-02-30'}]) test(`scheduler skips invalid/inactive ${JSON.stringify(patch)}`,()=>{const f=scriptFixture(patch);f.context.recurringTransactions();assert.equal(f.rows.transactions.length,1);assert.equal(f.writes(),0)});
test('scheduler concurrent run fails before sheet access',()=>{const f=scriptFixture();f.context.LockService.getScriptLock=()=>({tryLock:()=>false});assert.throws(()=>f.context.recurringTransactions(),/already in progress/);assert.equal(f.writes(),0)});
test('scheduler recovers after append succeeds and state update fails',()=>{
 const f=scriptFixture();const spreadsheet=f.context.SpreadsheetApp.getActiveSpreadsheet();const get=spreadsheet.getSheetByName;let fail=true;
 f.context.SpreadsheetApp.getActiveSpreadsheet=()=>({getSheetByName:name=>{const sheet=get(name);const range=sheet.getRange;sheet.getRange=(...args)=>{const value=range(...args);const set=value.setValues;value.setValues=rows=>{if(fail){fail=false;throw new Error('Synthetic interrupted state update')}set(rows)};return value};return sheet}});
 assert.throws(()=>f.context.recurringTransactions(),/interrupted/);assert.equal(f.rows.transactions.length,2);
 f.context.recurringTransactions();assert.equal(f.rows.transactions.length,2);assert.equal(f.rule().remainingCount,'1');assert.equal(f.rule().nextRunDate,'2026-02-28');
});
test('scheduler row state update preserves existing formulas',()=>{
 const f=scriptFixture();const spreadsheet=f.context.SpreadsheetApp.getActiveSpreadsheet();const get=spreadsheet.getSheetByName;
 f.context.SpreadsheetApp.getActiveSpreadsheet=()=>({getSheetByName:name=>{const sheet=get(name);const range=sheet.getRange;sheet.getRange=(...args)=>{const value=range(...args);value.getFormulas=()=>{const formulas=Array(args[3]).fill('');formulas[3]='="Fixture category"';return [formulas]};return value};return sheet}});
 f.context.recurringTransactions();assert.equal(f.rule().category,'="Fixture category"');
});
test('explicit public origin accepts internal route URLs without allowing another origin',()=>{
 process.env.FINANCE_APP_ORIGIN='https://fixture.invalid';
 const req=new Request('https://internal.invalid/api/google/recurring',{method:'POST',headers:{authorization,origin:'https://fixture.invalid','content-type':'application/json'},body:'{}'});
 assert.equal(requireFinanceAccess(req),null);
 assert.equal(requireFinanceAccess(request('', 'POST', {}, {origin:'https://attacker.invalid'})).status,403);
 delete process.env.FINANCE_APP_ORIGIN;
});
