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
  if(!rows.length){
    try{
      const metaUrl='https://api.themoviedb.org/3/'+(type==='tv'?'tv':'movie')+'/'+id+'?api_key=68e094699525b18a70bab2f86b1fa706&language=en-US';
      const md=await (await fetch(metaUrl)).json();
      const title=type==='tv'?md.name:md.title;
      const sr=await fetch('https://api.purstream.ad/api/v1/search-bar/search/'+encodeURIComponent(title),{headers:{Accept:'application/json,text/plain,*/*',Origin:'https://purstream.ad',Referer:'https://purstream.ad/','User-Agent':'Mozilla/5.0'}});
      console.log('[PurStream debug]',label,'searchStatus='+sr.status,'body='+(await sr.text()).slice(0,12000));
    }catch(e){console.log('[PurStream debug]',label,e.message)}
    throw new Error(label+' no streams');
  }
  for(const x of rows.slice(0,3))await media(label,x);
}
(async()=>{
  await one('Interstellar','157336','movie');
  await one('Breaking Bad S1E1','1396','tv',1,1);
  await one('Fight Club','550','movie');
  await one('GOT S1E1','1399','tv',1,1);
  console.log('PurStream lean live probe OK');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
