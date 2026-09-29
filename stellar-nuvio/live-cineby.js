const c=require('./providers/cineby.js');
(async()=>{
  const movie=await c.getStreams('550','movie');
  console.log('Cineby local-style movie rows:',movie.length,movie.slice(0,8).map(x=>({name:x.name,host:(()=>{try{return new URL(x.url).host}catch(_){return''}})()})));
  const tv=await c.getStreams('1399','tv',1,1);
  console.log('Cineby local-style TV rows:',tv.length,tv.slice(0,8).map(x=>({name:x.name,host:(()=>{try{return new URL(x.url).host}catch(_){return''}})()})));
  // GitHub datacenter may be blocked by the final CDN; zero rows is allowed here.
})().catch(e=>{console.error(e);process.exit(1)});
