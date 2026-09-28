const p=require('./cinevibe-candidate.js');
(async()=>{
  const rows=await p.getStreams('550','movie');
  console.log('CineVibe rows:',rows.length);
  console.log(rows.map(x=>({name:x.name,quality:x.quality,url:x.url&&new URL(x.url).host})));
  if(!rows.length)return;
  for(const row of rows.slice(0,3)){
    try{
      const r=await fetch(row.url,{headers:row.headers||{},redirect:'manual'});
      const text=await r.text();
      console.log('CineVibe media probe',r.status,r.headers.get('content-type'),new URL(row.url).host,'prefix',text.slice(0,180).replace(/\s+/g,' '));
    }catch(e){console.log('CineVibe media probe error',e&&e.message||String(e));}
  }
})().catch(e=>{console.error(e);process.exitCode=0});
