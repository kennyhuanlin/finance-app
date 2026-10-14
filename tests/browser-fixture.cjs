// CI/local only. All rows and credentials are synthetic; external network is denied.
const originalFetch = global.fetch;
const rules=Array.from({length:14},(_,i)=>({id:`fixture-legacy-${i+1}`,name:i===0?'歷史固定支出':`合成歷史規則${i+1}`,type:'支出',category:'測試支出',amount:125+i,frequency:'monthly',startDate:'',nextRunDate:'2026-01-31',lastRunDate:'2025-12-31',enabled:i%2===0,remainingCount:i===0?'4':''}));
const data={recurring_rules:rules,transactions:[],categories:[{id:'fixture-expense',name:'測試支出',type:'expense',emoji:'🧪'},{id:'fixture-income',name:'測試收入',type:'income',emoji:'🧪'}]};
global.fetch=async(input,init)=>{
 const url=String(input);
 if(url==='http://127.0.0.1:45999/fixture') {
  const body=JSON.parse(init.body);const rows=data[body.sheet];
  if(!rows) throw new Error('Unsupported fixture sheet');
  if(body.action==='read') return Response.json(rows);
  if(body.name==='模擬失敗') return Response.json({error:'測試服務拒絕儲存'}, {status:400});
  if(body.action==='create') {const row={...body}; delete row.token;rows.push(row);return Response.json({ok:true,id:body.id});}
  if(body.action==='update') {const row=rows.find(row=>row.id===body.id);if(!row) throw new Error('Missing fixture row');if(body.id.startsWith('fixture-legacy-') && Object.hasOwn(body,'startDate')) throw new Error('Legacy update must not backfill startDate');const patch={...body};delete patch.token;Object.assign(row,patch);return Response.json({ok:true,id:body.id});}
  if(body.action==='delete') {const i=rows.findIndex(row=>row.id===body.id);if(i<0)throw new Error('Missing fixture row');rows.splice(i,1);return Response.json({ok:true,id:body.id});}
  throw new Error('Unsupported fixture request');
 }
 if(url.startsWith('http://') || url.startsWith('https://')) {
  const hostname=new URL(url).hostname;
  if(!['127.0.0.1','localhost'].includes(hostname)) throw new Error('External network prohibited in browser fixture');
 }
 return originalFetch(input,init);
};
