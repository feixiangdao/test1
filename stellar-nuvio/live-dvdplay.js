const p=require('./providers/dvdplay.js');

async function one(type,id,s,e,label){
  const rows=await p.getStreams(id,type,s,e);
  console.log('ROWS',label,rows.length,rows.slice(0,12).map(x=>({name:x.name,quality:x.quality,host:(()=>{try{return new URL(x.url).host}catch(_){return''}})()})));
  let good=0;
  for(const x of rows.slice(0,6)){
    try{
      const r=await fetch(x.url,{headers:{...(x.headers||{}),Range:'bytes=0-4095','User-Agent':'Mozilla/5.0'},redirect:'manual',signal:AbortSignal.timeout(15000)});
      const b=Buffer.from(await r.arrayBuffer()),ct=r.headers.get('content-type')||'';
      const ok=(r.ok||r.status===206)&&(/video\//i.test(ct)||/application\/octet-stream/i.test(ct)||b.length>=4096);
      if(ok)good++;
      console.log('MEDIA',label,x.quality,r.status,ct,new URL(x.url).host,'OK='+ok,'bytes='+b.length);
    }catch(err){console.log('MEDIA ERR',label,err.message)}
  }
  console.log('GOOD',label,good);
}
(async()=>{
  await one('movie','550',null,null,'Fight Club');
  await one('movie','27205',null,null,'Inception');
  await one('tv','93405',1,1,'Squid Game S1E1');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
