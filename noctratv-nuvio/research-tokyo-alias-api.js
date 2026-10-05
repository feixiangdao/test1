'use strict';
const IDS=[
  'zstream-tokyo-barcelona-sub',
  'zstream-tokyo-barcelona-dub',
  'zstream-tokyo-seville-sub',
  'zstream-tokyo-kyoto-sub',
  'zstream-tokyo-kyoto-hsub',
  'zstream-tokyo-kyoto-dub'
];
const BASES=['https://noctratv.com','https://api.m-zone.org'];
const BODY={
  type:'tv',
  tmdbId:'209867',
  imdbId:'',
  title:"Frieren: Beyond Journey's End",
  releaseYear:2023,
  season:'1',
  episode:'1'
};
async function one(base,id){
  const url=base+'/mplayer/'+id+'/resolve';
  const ac=new AbortController();
  const t=setTimeout(()=>ac.abort(),15000);
  try{
    const r=await fetch(url,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Accept':'application/json,text/plain,*/*',
        'Origin':'https://noctratv.com',
        'Referer':'https://noctratv.com/'
      },
      body:JSON.stringify(BODY),
      signal:ac.signal
    });
    const text=await r.text();
    console.log('\n### '+id+' @ '+base+' status='+r.status);
    console.log('headers x-token='+(r.headers.get('x-token')||'')+' lease='+(r.headers.get('x-mzone-playback-lease')||''));
    console.log(text.slice(0,12000));
  }catch(e){
    console.log('\n### '+id+' @ '+base+' ERROR '+(e&&e.message?e.message:e));
  }finally{clearTimeout(t)}
}
(async()=>{
  for(const base of BASES){
    for(const id of IDS)await one(base,id);
  }
})().catch(e=>{console.error(e);process.exitCode=1});
