const m=require('./providers/movix.js');
async function probe(type,id,s,e){
  const rows=await m.getStreams(id,type,s,e);
  console.log('Movix',type,'rows',rows.length,rows.map(x=>x.name));
  if(!rows.length)throw new Error('no '+type+' HLS');
  const r=await fetch(rows[0].url,{headers:rows[0].headers||{}});
  const body=await r.text();
  console.log('Movix',type,'media',r.status,r.headers.get('content-type'),body.slice(0,160).replace(/\s+/g,' '));
  if(!r.ok||body.indexOf('#EXTM3U')!==0)throw new Error('invalid '+type+' HLS');
}
(async()=>{await probe('movie','550');await probe('tv','1399',1,1);})().catch(e=>{console.error(e);process.exit(1)});