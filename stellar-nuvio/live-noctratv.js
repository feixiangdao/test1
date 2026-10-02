const p=require('./providers/noctratv.js');

function host(u){try{return new URL(u).host}catch(_){return 'invalid'}}
async function run(label,args){
  const rows=await p.getStreams(...args);
  console.log(label+': streams='+rows.length);
  rows.slice(0,8).forEach((x,i)=>console.log('  '+(i+1)+'. '+x.name+' host='+host(x.url)));
  return rows.length;
}
(async()=>{
  const movie=await run('Fight Club', [550,'movie']);
  const tv=await run('Game of Thrones S01E01', [1399,'tv',1,1]);
  if(movie===0 && tv===0) throw new Error('NoctraTV live probe returned zero verified streams for both movie and TV');
  console.log('NoctraTV live probe OK: movie='+movie+' tv='+tv);
})().catch(e=>{console.error(e&&e.stack?e.stack:e);process.exitCode=1});
