const m=require('./providers/mapple.js');

async function probe(type,id,s,e){
  const rows=await m.getStreams(id,type,s,e);
  console.log('Mapple',type,'rows',rows.length,rows.slice(0,8).map(x=>({name:x.name,quality:x.quality,url:new URL(x.url).host})));
  if(!rows.length) throw new Error('Mapple '+type+' returned no streams');
  const r=await fetch(rows[0].url,{headers:rows[0].headers||{}});
  const body=await r.text();
  console.log('Mapple',type,'media',r.status,r.headers.get('content-type'),body.slice(0,180).replace(/\s+/g,' '));
  if(!r.ok||body.indexOf('#EXTM3U')!==0) throw new Error('Mapple '+type+' media probe failed');
}
(async()=>{await probe('movie','550');await probe('tv','1399',1,1);})().catch(e=>{console.error(e);process.exit(1)});