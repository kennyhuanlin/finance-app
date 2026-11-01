/* eslint-disable @typescript-eslint/no-require-imports -- isolated Node regression fixture */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { addPeriod, nextRunDateForActivation } = require('../app/lib/recurringDates.ts');

function createFixture() {
 const headers = {
  recurring_rules: ['id','name','type','category','amount','frequency','startDate','nextRunDate','lastRunDate','remainingCount','enabled','endDate','currency'],
  transactions: ['id','date','type','category','amount','note','sourceType','recurringId','currency'],
 };
 const rule = {
  id:'recurring-supabase-usd-20261030',name:'Supabase',type:'支出',category:'AI工具訂閱',
  amount:26.25,currency:'USD',frequency:'monthly',startDate:'2026-11-25',
  nextRunDate:'2026-11-25',lastRunDate:'',remainingCount:'',enabled:true,
 };
 const rows = {
  recurring_rules:[headers.recurring_rules,headers.recurring_rules.map(key=>rule[key]??'')],
  transactions:[headers.transactions],
 };
 let writes=0;
 const sheet = name => ({
  getDataRange:()=>({getValues:()=>rows[name].map(row=>[...row])}),
  appendRow:values=>{rows[name].push(values);writes++;},
  getRange:(row,col,_height,width=1)=>({
   getValues:()=>[rows[name][row-1].slice(col-1,col-1+width)],
   getFormulas:()=>[Array(width).fill('')],
   setValues:values=>{rows[name][row-1].splice(col-1,width,...values[0]);writes++;},
  }),
 });
 const ctx=vm.createContext({
  Date,Set,Number,String,Object,Math,Error,
  SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:sheet})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
 });
 vm.runInContext(fs.readFileSync('apps-script/recurringTransactions.js','utf8'),ctx);
 const setDate = day => {
  const instant=Date.parse(day+'T12:00:00Z');
  ctx.Date=class extends Date {
   constructor(...args){super(...(args.length?args:[instant]));}
   static now(){return instant;}
  };
 };
 const transactions=()=>rows.transactions.slice(1).map(row=>Object.fromEntries(headers.transactions.map((key,i)=>[key,row[i]])));
 const ruleValue=key=>rows.recurring_rules[1][headers.recurring_rules.indexOf(key)];
 return {ctx,rows,setDate,transactions,ruleValue,writes:()=>writes};
}

test('USD activation keeps 2026-11-25; 11/25 monthly advances to 12/25',()=>{
 const rule={currency:'USD',startDate:'2026-11-25',nextRunDate:'2026-11-25',frequency:'monthly'};
 assert.equal(nextRunDateForActivation(rule,'2026-11-01'),'2026-11-25');
 assert.equal(addPeriod('2026-11-25','monthly','2026-11-25'),'2026-12-25');
 assert.equal(nextRunDateForActivation(rule,'2026-11-26'),null);
});

test('isolated Supabase USD 26.25 posts once per month with original currency and duplicate suppression',()=>{
 const f=createFixture();f.setDate('2026-11-24');f.ctx.recurringTransactions();
 assert.equal(f.transactions().length,0);
 f.setDate('2026-11-25');f.ctx.recurringTransactions();
 assert.equal(f.transactions().length,1);
 assert.equal(f.transactions()[0].date,'2026-11-25');
 assert.equal(f.transactions()[0].amount,26.25);
 assert.equal(f.transactions()[0].currency,'USD');
 assert.equal(f.ruleValue('nextRunDate'),'2026-12-25');
 f.ctx.recurringTransactions();assert.equal(f.transactions().length,1);
 // Simulated interruption after append: retry must not duplicate the payment.
 const h=f.rows.recurring_rules[0],row=f.rows.recurring_rules[1];
 row[h.indexOf('nextRunDate')]='2026-11-25';
 row[h.indexOf('lastRunDate')]='';
 f.ctx.recurringTransactions();
 assert.equal(f.transactions().length,1);
 assert.equal(f.ruleValue('nextRunDate'),'2026-12-25');
 f.setDate('2026-12-25');f.ctx.recurringTransactions();
 assert.equal(f.transactions().length,2);
 assert.deepEqual(f.transactions().map(t=>t.date),['2026-11-25','2026-12-25']);
 assert.ok(f.transactions().every(t=>t.currency==='USD'&&t.amount===26.25));
 assert.equal(f.ruleValue('nextRunDate'),'2027-01-25');
});

test('USD fixture without currency column refuses to post',()=>{
 const f=createFixture();
 f.rows.transactions[0].pop();
 f.setDate('2026-11-25');
 assert.throws(()=>f.ctx.recurringTransactions(),/missing currency column/);
 assert.equal(f.transactions().length,0);
 assert.equal(f.writes(),0);
});
