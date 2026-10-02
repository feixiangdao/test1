const p=require('./providers/noctratv.js');

function host(u){try{return new URL(u).host}catch(_){return 'invalid'}}
async function run(label,args){
  const rows=await p.getStreams(...args);
  console.log(label+': streams='+rows.length);
  rows.slice(0,8).forEach((x,i)=>console.log('  '+(i+1)+'. '+x.name+' host='+host(x.url)));
}
(async()=>{
  await run('Fight Club', [550,'movie']);
  await run('Game of Thrones S01E01', [1399,'tv',1,1]);
})().catch(e=>{console.error(e&&e.stack?e.stack:e);process.exitCode=1});
