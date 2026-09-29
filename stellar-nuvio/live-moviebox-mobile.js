const m=require('./providers/moviebox.js');
(async()=>{
  const rows=await m.getStreams('550','movie');
  console.log('MovieBox v4 live rows:',rows.length);
  console.log(rows.map(x=>({name:x.name,host:(()=>{try{return new URL(x.url).host}catch(_){return''}})(),headers:Object.keys(x.headers||{})})));
  if(!rows.length) throw new Error('MovieBox v4 returned no signed streams');
  const row=rows[0];
  if(!/\.mpd(?:$|\?)/i.test(row.url)) throw new Error('MovieBox did not return MPD');
  if(!row.headers||!row.headers.Cookie) throw new Error('MovieBox signed Cookie missing');
  const r=await fetch(row.url,{headers:row.headers,redirect:'manual'});
  const body=await r.text();
  console.log('MovieBox signed MPD probe:',r.status,r.headers.get('content-type'),'len',body.length,body.slice(0,120).replace(/\s+/g,' '));
  if(![200,206].includes(r.status)) throw new Error('MovieBox signed manifest probe failed: '+r.status);
  if(body.indexOf('<MPD')<0) throw new Error('MovieBox MPD body missing');
})().catch(e=>{console.error(e);process.exit(1)});
