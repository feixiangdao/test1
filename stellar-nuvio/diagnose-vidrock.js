const p=require('./vidrock-candidate.js');
async function probe(label,rows){
  console.log(label,'rows',rows.length,rows.map(x=>({name:x.name,quality:x.quality,host:x.url&&new URL(x.url).host})));
  for(const row of rows.slice(0,3)){
    try{
      const r=await fetch(row.url,{headers:row.headers||{},redirect:'manual'});
      const text=await r.text();
      console.log(label,'media',r.status,r.headers.get('content-type'),new URL(row.url).host,'prefix',text.slice(0,160).replace(/\s+/g,' '));
    }catch(e){console.log(label,'media error',e&&e.message||String(e));}
  }
}
(async()=>{
  await probe('VidRock movie',await p.getStreams('550','movie'));
  await probe('VidRock tv',await p.getStreams('1399','tv',1,1));
})().catch(e=>{console.error(e);process.exitCode=0});
