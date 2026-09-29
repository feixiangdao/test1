const p=require('./providers/purstream.js');

async function media(label,row){
  const r=await fetch(row.url,{
    headers:{...(row.headers||{}),Range:'bytes=0-4095'},
    redirect:'manual',
    signal:AbortSignal.timeout(12000)
  });
  const t=await r.text();
  const ok=(r.ok||r.status===206)&&/^#EXTM3U/m.test(t);
  console.log('[PurStream live]',label,row.quality,r.status,r.headers.get('content-type'),new URL(row.url).host,'EXTM3U='+ok);
  if(!ok)throw new Error(label+' invalid HLS');
}
async function one(label,id,type,s,e){
  const rows=await p.getStreams(id,type,s,e);
  console.log('[PurStream live]',label,'rows='+rows.length);
  if(!rows.length)throw new Error(label+' no streams');
  for(const x of rows.slice(0,3))await media(label,x);
}
(async()=>{
  await one('Interstellar','157336','movie');
  await one('Breaking Bad S1E1','1396','tv',1,1);
  await one('Fight Club','550','movie');
  await one('GOT S1E1','1399','tv',1,1);
  console.log('PurStream lean live probe OK');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
