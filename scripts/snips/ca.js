function getCAReports(){ return CA_CACHE; }
function getCAReport(from,to){
  const r=getCAReports();
  const k=`${from}_${to}`;
  return r[k]||{from,to,achievements:'',concerns:'',actionItems:[],compliance:[],inflows:[],outflows:[],priorities:[],updatedAt:'',updatedBy:''};
}
function saveCAReport(rpt){
  const key=`${rpt.from}_${rpt.to}`;
  const rec={...rpt,updatedAt:new Date().toISOString(),updatedBy:currentUser?.name||'CA'};
  CA_CACHE[key]=rec;
  API.put('/api/ca-reports/'+encodeURIComponent(key), rec)
     .catch(e=>API.toast('Could not save report: '+e.message));
}
