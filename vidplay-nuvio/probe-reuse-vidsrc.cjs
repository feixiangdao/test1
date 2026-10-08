const yesmovies=require('../yesmovies-nuvio/providers/yesmovies.js');
const original=globalThis.fetch;let api=[];
globalThis.fetch=async(u,opt)=>{
 const url=String(u);let host='';try{host=new URL(url).hostname}catch(_){}
 const res=await original(u,opt);
 if(/vidsrcme|cloudorchestranova/i.test(host)){api.push({host,path:new URL(url).pathname,status:res.status});}
 return res;
};
(async()=>{
 for(const test of [{name:'Life (2017)',id:395992,type:'movie'},{name:'Abbott Elementary S1E1',id:125935,type:'tv',s:1,e:1}]){
  const start=Date.now();api=[];
  try{const rows=await yesmovies.getStreams(test.id,test.type,test.s,test.e);
  const s2=rows.filter(x=>/· S2\b/.test(x.name||''));
  console.log('REUSE_TEST',JSON.stringify({test:test.name,total:rows.length,s2Count:s2.length,s2:s2.slice(0,10).map(x=>({name:x.name,quality:x.quality,type:x.type,host:new URL(x.url).hostname})),apiRequests:api,timeMs:Date.now()-start}));
  }catch(e){console.log('REUSE_ERROR',JSON.stringify({test:test.name,error:e.message,apiRequests:api}))}
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});