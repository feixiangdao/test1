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

  // Titles observed on Noctra's own current watch pages.
  const noctraMovie=await run('Noctra page · 12 Angry Men', [389,'movie']);
  const noctraTv=await run('Noctra page · 100 Girlfriends S01E01', [223564,'tv',1,1]);

  if(movie===0 && tv===0) throw new Error('NoctraTV live probe returned zero verified streams for both baseline movie and TV');
  if(noctraMovie===0 && noctraTv===0) throw new Error('NoctraTV live probe returned zero verified streams for both Noctra-page samples');
  console.log('NoctraTV live probe OK: baselineMovie='+movie+' baselineTv='+tv+' noctraMovie='+noctraMovie+' noctraTv='+noctraTv);
})().catch(e=>{console.error(e&&e.stack?e.stack:e);process.exitCode=1});
