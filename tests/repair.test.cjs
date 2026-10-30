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
const { normalizeFinanceCurrency, formatFinanceMoney, sumAmountsByCurrency } = require('../app/lib/transactions.ts');
const { parseUsdTwdQuote, convertUsdToTwd } = require('../app/lib/investments.ts');
const { requireFinanceAccess } = require('../app/lib/apiAccess.ts');
const client = require('../app/lib/googleSheets.ts');
const password = 'fixture-only-012345678901234567890123456789';
process.env.FINANCE_APP_USERNAME = 'fixture-owner';
process.env.FINANCE_APP_PASSWORD = password;
const authorization = `Basic ${Buffer.from(`fixture-owner:${password}`).toString('base64')}`;
function request(path='/api/google/recurring', method='GET', body, headers={}) {
  return new Request(`https://fixture.invalid${path}`, { method, headers: {authorization, ...(method==='GET' ? {} : {'content-type':'application/json', origin:'https://fixture.invalid'}), ...headers}, ...(body===undefined ? {} : {body:JSON.stringify(body)}) });
}
test('CBC USD/TWD reference quote converts USD without changing original currency',()=>{
 const quote=parseUsdTwdQuote({base:'USD',quote:'TWD',date:'2026-10-29',rate:32.125});
 assert.deepEqual(quote,{date:'2026-10-29',rate:32.125});
 assert.equal(convertUsdToTwd(1000,quote.rate),32125);
 assert.equal(convertUsdToTwd(0,quote.rate),0);
 assert.equal(convertUsdToTwd(-100,quote.rate),-3212.5);
});
test('invalid or missing quote never invents a 1:1 TWD value',()=>{
 for(const payload of [null,[],{}, {base:'TWD',quote:'USD',date:'2026-10-29',rate:32},
  {base:'USD',quote:'TWD',date:'2026-10-29',rate:'32.1'},
  {base:'USD',quote:'TWD',date:'2026-10-29',rate:0},
  {base:'USD',quote:'TWD',date:'2026-10-29',rate:Infinity},
  {base:'USD',quote:'TWD',date:'2026-02-30',rate:32}]) {
   assert.equal(parseUsdTwdQuote(payload),null);
 }
 assert.equal(convertUsdToTwd(100,null),null);
 assert.equal(convertUsdToTwd(100,0),null);
 assert.equal(convertUsdToTwd(Number.NaN,32),null);
 assert.equal(convertUsdToTwd(null,32),null);
});

const validRule={id:'fixture-rule', name:'Synthetic expense', category:'Fixture category', type:'支出', amount:125,frequency:'monthly',startDate:'2026-01-31',nextRunDate:'2026-02-28',remainingCount:'',enabled:true};
test('USD/TWD sums do not mix and legacy rows default to TWD',()=>{
 assert.equal(normalizeFinanceCurrency(undefined),'TWD');
 assert.equal(normalizeFinanceCurrency('USD'),'USD');
 assert.equal(normalizeFinanceCurrency('EUR'),'TWD');
 assert.ok(formatFinanceMoney(26.25,'USD').includes('26.25'));
 const rows=[{amount:200},{amount:26.25,currency:'USD'},{amount:30,currency:'TWD'}];
 assert.equal(sumAmountsByCurrency(rows,'TWD'),230);
 assert.equal(sumAmountsByCurrency(rows,'USD'),26.25);
 const headers=require('../app/lib/googleSheetsServer.ts').sheetHeaders;
 assert.ok(headers.transactions.includes('currency'));
 assert.ok(headers.recurring_rules.includes('currency'));
});
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
test('passwordless reads and same-origin mutation guards',()=>{
 const savedUser=process.env.FINANCE_APP_USERNAME;
 const savedPass=process.env.FINANCE_APP_PASSWORD;
 delete process.env.FINANCE_APP_USERNAME;
 delete process.env.FINANCE_APP_PASSWORD;
 try {
  assert.equal(requireFinanceAccess(request('', 'GET',undefined,{authorization:''})),null);
  assert.equal(requireFinanceAccess(request('', 'GET',undefined,{authorization:'Basic invalid'})),null);
  assert.equal(requireFinanceAccess(request('', 'POST',{}, {authorization:''})),null);
  assert.equal(requireFinanceAccess(request('', 'POST',{}, {origin:'https://attacker.invalid'})).status,403);
  assert.equal(requireFinanceAccess(request('', 'POST',{}, {origin:''})).status,403);
  assert.equal(requireFinanceAccess(request('', 'POST',{}, {'content-type':'text/plain'})).status,415);
 } finally {
  if(savedUser===undefined) delete process.env.FINANCE_APP_USERNAME;
  else process.env.FINANCE_APP_USERNAME=savedUser;
  if(savedPass===undefined) delete process.env.FINANCE_APP_PASSWORD;
  else process.env.FINANCE_APP_PASSWORD=savedPass;
 }
});
test('mutation APIs reject cross-origin requests before data access',async()=>{
 for(const [path,method,context] of [
  ['../app/api/google/[resource]/route.ts','POST',{params:Promise.resolve({resource:'recurring'})}],
  ['../app/api/google/[resource]/route.ts','PUT',{params:Promise.resolve({resource:'recurring'})}],
  ['../app/api/google/[resource]/route.ts','DELETE',{params:Promise.resolve({resource:'recurring'})}],
  ['../app/api/google/investments/prices/route.ts','POST'],
  ['../app/api/google/investments/sync/route.ts','POST'],
  ['../app/api/sheets/route.ts','POST']]) {
  const response=await require(path)[method](request('',method,{}, {authorization:'',origin:'https://attacker.invalid'}),context);
  assert.equal(response.status,403,`${path} ${method}`);
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
 assert.equal((await route.POST(request('', 'POST',{...validRule,id:'usd-active',amount:26.25,currency:'USD',enabled:true}),ctx)).status,409);
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
 const ruleHeaders=['id','name','type','category','amount','frequency','startDate','nextRunDate','lastRunDate','remainingCount','enabled','endDate','currency'];
 const txHeaders=['id','date','type','category','amount','note','sourceType','recurringId','currency'];
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
test('scheduled USD carries currency, disabled USD has no writes',()=>{
 const active=scriptFixture({currency:'USD',amount:26.25});
 active.context.recurringTransactions();
 assert.equal(active.rows.transactions.length,2);
 const keys=active.rows.transactions[0],row=active.rows.transactions[1];
 assert.equal(row[keys.indexOf('currency')],'USD');
 assert.equal(row[keys.indexOf('amount')],26.25);
 const paused=scriptFixture({currency:'USD',amount:26.25,enabled:false});
 paused.context.recurringTransactions();
 assert.equal(paused.rows.transactions.length,1);
 assert.equal(paused.writes(),0);
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

for(const day of [29,30,31]) for(const frequency of ['monthly','quarterly']) test(`Apps Script / Next parity: ${day} ${frequency}`,()=>{
 const f=scriptFixture();const anchor=`2024-01-${day}`;let current=anchor;
 for(let i=0;i<12;i++){const next=addPeriod(current,frequency,anchor);assert.equal(f.context.addPeriod(current,frequency,anchor),next);current=next;}
});
test('leap-year quarterly anchor and yearly recovery',()=>{
 const f=scriptFixture();let current='2024-02-29';
 for(let i=0;i<4;i++){current=addPeriod(current,'yearly','2024-02-29');assert.equal(f.context.addPeriod(i===0?'2024-02-29':`${2024+i}-02-28`,'yearly','2024-02-29'),current);}
 assert.equal(current,'2028-02-29');
});
test('14 synthetic legacy shapes preserve schedule while editing ordinary fields and count',()=>{
 for(let i=0;i<14;i++) {
  const original={...validRule,id:`synthetic-${i}`,startDate:'',enabled:i%2===0,remainingCount:i%3===0?'4':'',lastRunDate:'2025-12-31'};
  const edited={...original,name:`Edited ${i}`,category:'Fixture other',amount:222,note:'Synthetic note'};
  assert.equal(validateRecurringRule(edited,false,true),'');
  for(const key of ['startDate','nextRunDate','lastRunDate','remainingCount','enabled'])assert.equal(edited[key],original[key]);
  assert.equal(validateRecurringRule({...edited,remainingCount:'3'},false,true),'');
 }
});
test('worksheet replacement uses one padded write and no clear; failed write keeps previous snapshot',async()=>{
 const server=require('../app/lib/googleSheetsServer.ts');let calls=[];
 const headers=Array.from(server.sheetHeaders.investment_positions);
 const record={id:'position-fixture',market:'TW',symbol:'FIX',quantity:1};
 const old=[headers,headers.map(h=>h==='id'?'old-1':h==='quantity'?2:''),headers.map(h=>h==='id'?'old-2':'')];
 const snapshot=JSON.stringify(old);let rejectWrite=true;
 server.invalidateWorksheetCache('investment_positions');
 global.fetch=async(url,options={})=>{
  url=String(url);calls.push({url,...options});
  if(url==='https://oauth2.googleapis.com/token') return Response.json({access_token:'fixture-token',expires_in:3600});
  if(url.includes('?fields=sheets.properties'))return Response.json({sheets:[{properties:{title:'investment_positions',sheetId:1}}]});
  if(!options.method||options.method==='GET')return Response.json({values:old});
  if(options.method==='PUT'){if(rejectWrite)return Response.json({error:{message:'synthetic denied'}},{status:403});return Response.json({updatedRows:3});}
  throw new Error('Unexpected mutation: '+url);
 };
 await assert.rejects(server.replaceWorksheetRows('investment_positions',[record]));
 assert.equal(JSON.stringify(old),snapshot);assert.ok(calls.every(c=>!c.url.includes(':clear')));
 rejectWrite=false;calls=[];await server.replaceWorksheetRows('investment_positions',[record]);
 const writes=calls.filter(c=>c.method==='PUT');assert.equal(writes.length,1);
 const values=JSON.parse(writes[0].body).values;assert.equal(values.length,3);assert.ok(values[2].every(v=>v===''));
 global.fetch=async()=>{throw new Error('Unmocked network access prohibited');};
});

test('investment sync refuses missing/duplicate source IDs and missing currency accounts before writes',async()=>{
 const server=require('../app/lib/googleSheetsServer.ts');const sync=require('../app/lib/investmentSyncServer.ts');
 const sheets=['investment_trades','cash_accounts','cash_ledger','fx_records','dividend_records'];
 let fixture,calls=[];
 const configure=()=>{fixture=Object.fromEntries(sheets.map(name=>[name,[Array.from(server.sheetHeaders[name])]]));server.invalidateWorksheetCache(...sheets);calls=[];};
 global.fetch=async(url,options={})=>{url=String(url);calls.push({url,method:options.method||'GET'});if(url.includes('oauth2.googleapis.com'))return Response.json({access_token:'fixture-token',expires_in:3600});assert.equal(options.method||'GET','GET','unsafe sync must not write');const sheet=decodeURIComponent(url.split('/values/')[1].split('?')[0]).split('!')[0];return Response.json({values:fixture[sheet]});};
 configure();const tx={id:'',date:'2026-01-01',market:'TW',symbol:'FIX',side:'buy',quantity:1,price:10,currency:'TWD'};fixture.investment_trades.push(fixture.investment_trades[0].map(h=>tx[h]??''));
 await assert.rejects(sync.refreshInvestmentPositions(),/missing or duplicate IDs/);await assert.rejects(sync.refreshCashAccounts(),/missing or duplicate IDs/);
 configure();tx.id='fixture-trade';const row=fixture.investment_trades[0].map(h=>tx[h]??'');fixture.investment_trades.push(row,row);await assert.rejects(sync.refreshInvestmentPositions(),/missing or duplicate IDs/);
 configure();fixture.investment_trades.push(fixture.investment_trades[0].map(h=>tx[h]??''));await assert.rejects(sync.refreshCashAccounts(),/Cash accounts missing/);
 assert.ok(calls.every(call=>call.method==='GET'));global.fetch=async()=>{throw new Error('Unmocked network access prohibited');};
});

test('Apps Script token API read is side-effect free and shares scheduler lock',()=>{
 const f=scriptFixture();let validToken='fixture-token-012345678901234567890';let locks=0;
 f.context.PropertiesService={getScriptProperties:()=>({getProperty:()=>validToken})};
 f.context.ContentService={MimeType:{JSON:'JSON'},createTextOutput:text=>({setMimeType:()=>text})};
 f.context.LockService={getScriptLock:()=>({tryLock:()=>{locks++;return true;},releaseLock:()=>{}})};
 const get=f.context.SpreadsheetApp.getActiveSpreadsheet().getSheetByName;
 f.context.SpreadsheetApp.getActiveSpreadsheet=()=>({getSheetByName:name=>get(name)});
 vm.runInContext(fs.readFileSync('apps-script/sheetsApi.js','utf8'),f.context);
 const post=body=>JSON.parse(f.context.doPost({postData:{contents:JSON.stringify(body)}}));
 assert.match(post({sheet:'recurring_rules',action:'read',token:'wrong'}).error,/Unauthorized/);assert.equal(f.writes(),0);
 const rows=post({sheet:'recurring_rules',action:'read',token:validToken});assert.equal(rows.length,1);assert.equal(locks,0);assert.equal(f.writes(),0);
 assert.ok(JSON.parse(f.context.doGet()).error);
 assert.equal(post({sheet:'recurring_rules',action:'update',token:validToken,id:'fixture-rule',enabled:false}).ok,true);assert.equal(locks,1);
 f.context.recurringTransactions();assert.equal(locks,2);assert.equal(f.rows.transactions.length,1);
});
