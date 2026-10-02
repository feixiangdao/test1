const manifest=require('./manifest.json');

function host(u){try{return new URL(u).host}catch(_){return 'invalid'}}
function timeout(p,ms,label){
  return Promise.race([
    p,
    new Promise(resolve=>setTimeout(()=>{console.log(label+': timeout');resolve([])},ms))
  ]);
}
async function probe(scraper,args,label){
  const p=require('./'+scraper.filename);
  const rows=await timeout(Promise.resolve(p.getStreams(...args)),35000,label);
  console.log(label+': streams='+(rows||[]).length);
  (rows||[]).slice(0,4).forEach((x,i)=>console.log('  '+(i+1)+'. '+x.name+' host='+host(x.url)));
  return (rows||[]).length;
}
(async()=>{
  const movie=[238,'movie']; // The Godfather, actual noctratv.com title page sample
  const tv=[1399,'tv',1,1];
  const rows=await Promise.all(manifest.scrapers.map(async s=>{
    let movieCount=0,tvCount=0;
    try{movieCount=await probe(s,movie,s.name+' movie')}catch(e){console.log(s.name+' movie error: '+e.message)}
    if((s.supportedTypes||[]).includes('tv')){
      try{tvCount=await probe(s,tv,s.name+' tv')}catch(e){console.log(s.name+' tv error: '+e.message)}
    }
    return {id:s.id,movie:movieCount,tv:tvCount};
  }));
  console.log('NoctraTV source probe summary');
  rows.forEach(x=>console.log(x.id+': movie='+x.movie+' tv='+x.tv));
  if(!rows.some(x=>x.movie>0||x.tv>0)) throw new Error('all NoctraTV provider probes returned zero streams');
})().catch(e=>{console.error(e&&e.stack?e.stack:e);process.exitCode=1});
