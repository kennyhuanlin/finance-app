// Local browser verification only: fake backend, synthetic rows, no production credentials.
const originalFetch = global.fetch;
const fixtureRules=[{id:'fixture-legacy',name:'歷史固定支出',type:'支出',category:'測試支出',amount:125,frequency:'monthly',nextRunDate:'2026-01-31',enabled:true,remainingCount:''}];
const categories=[{id:'fixture-expense',name:'測試支出',type:'expense',emoji:'🧪'},{id:'fixture-income',name:'測試收入',type:'income',emoji:'🧪'}];
global.fetch=async(input,init)=>{
 const url=String(input);
 if(url==='http://127.0.0.1:45999/fixture') {
  const body=JSON.parse(init.body);
  if(body.action==='read') {
   if(body.sheet==='categories') {await new Promise(resolve=>setTimeout(resolve,800));return Response.json(categories);}
   return Response.json(body.sheet==='recurring_rules'?fixtureRules:[]);
  }
  if(body.name==='模擬失敗') return Response.json({error:'測試服務拒絕儲存'}, {status:400});
  if(body.action==='create') {const row={...body}; delete row.token;fixtureRules.push(row);return Response.json({ok:true,id:body.id});}
  if(body.action==='update') {const row=fixtureRules.find(row=>row.id===body.id);if(body.id==='fixture-legacy' && Object.hasOwn(body,'startDate')) throw new Error('Legacy update must not backfill startDate');Object.assign(row,body);return Response.json({ok:true,id:body.id});}
  if(body.action==='delete') {const i=fixtureRules.findIndex(row=>row.id===body.id);fixtureRules.splice(i,1);return Response.json({ok:true,id:body.id});}
  throw new Error('Unsupported fixture request');
 }
 if(url.startsWith('http://') || url.startsWith('https://')) {
  const hostname=new URL(url).hostname;
  if(!['127.0.0.1','localhost'].includes(hostname)) throw new Error('External network prohibited in browser fixture');
 }
 return originalFetch(input,init);
};
