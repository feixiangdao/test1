const p=require('./providers/dooflix.js');
(async()=>{
  const movie=await p.getStreams('550','movie');
  console.log('DooFlix movie rows',movie.length,movie.map(x=>({name:x.name,url:x.url})));
  if(!movie.length) throw new Error('No DooFlix movie streams');

  const tv=await p.getStreams('1399','tv',1,1);
  console.log('DooFlix TV rows',tv.length,tv.map(x=>({name:x.name,url:x.url})));
  if(!tv.length) throw new Error('No DooFlix TV streams');
})().catch(e=>{console.error(e);process.exit(1)});
