const p=require('./providers/vaplayer.js');
(async()=>{
  const movie=await p.getStreams('550','movie');
  console.log('VAPlayer live movie rows:',movie.length,movie.map(x=>({name:x.name,url:new URL(x.url).host})));
  if(!movie.length) throw new Error('VAPlayer movie returned no streams');

  const tv=await p.getStreams('1399','tv',1,1);
  console.log('VAPlayer live TV rows:',tv.length,tv.map(x=>({name:x.name,url:new URL(x.url).host})));
  if(!tv.length) throw new Error('VAPlayer TV returned no streams');

  for(const row of [movie[0],tv[0]]){
    const r=await fetch(row.url,{headers:row.headers||{},redirect:'manual'});
    const text=await r.text();
    console.log('VAPlayer HLS probe:',r.status,r.headers.get('content-type'),new URL(row.url).host,row.quality,text.slice(0,80).replace(/\s+/g,' '));
    if(r.status!==200||text.indexOf('#EXTM3U')<0) throw new Error('VAPlayer HLS probe failed');
  }
})().catch(e=>{console.error(e);process.exit(1)});
