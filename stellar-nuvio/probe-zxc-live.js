const CryptoJS=require('crypto-js');
const BASE='https://player.zxcprime.xyz';
const UA='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36';
const F={
 id:'a7f39c821d604e5b9c71f36e1547b',
 fToken:'e83c4b719a52d3136052479c1635a',
 ts:'61d9a5274c8e3b29afd6384c291e6',
 token:'c492f7a183d6502b1e7436c538a716d',
 title:'5e28c9147a306d1e829f3674b392a1',
 year:'b731e6c94f08269d725f8341c306e',
 season:'d8427b59ce30684a2f957c3613e85b',
 episode:'91c6e4a728503d1f785c92346b713d',
 imdbId:'f35a8c19d674b3265e871c4933a725f',
 path:'6b491e7253ad84d392e7561a9384c',
 mediaType:'c285f91ab306d28147a35632e816b',
 date:'e164932c50216a39e5814b3027',
 latestDate:'e16932c543416ad739e5814b3027'
};
const KEY='7f4c9e2a81d63b05c4f7a9e8126d3b50e1a8c7f23d9465ab0c6e9f1d4a7b832c';
const SERVERS=['resshin','valstrax','berkas','atlas','alatreon','daedalus'];
function headers(extra){return Object.assign({
 'User-Agent':UA,
 Accept:'application/json,text/plain,*/*',
 Origin:BASE,
 Referer:BASE+'/'
},extra||{})}
function dec(s){try{return CryptoJS.AES.decrypt(String(s||''),KEY).toString(CryptoJS.enc.Utf8)}catch(e){return ''}}
async function getSource(meta,server){
  const body={
    [F.id]:String(meta.id),
    [F.mediaType]:meta.type,
    [F.path]:server
  };
  if(meta.type==='tv'){body[F.season]=String(meta.season);body[F.episode]=String(meta.episode)}
  let r=await fetch(BASE+'/backend_/tigasmukha',{
    method:'POST',headers:headers({'Content-Type':'application/json'}),
    body:JSON.stringify(body),signal:AbortSignal.timeout(15000)
  });
  const tt=await r.text();
  console.log('TOKEN',meta.type,server,r.status,tt.slice(0,400));
  if(!r.ok)return [];
  let tok;try{tok=JSON.parse(tt)}catch(e){return[]}
  const q=new URLSearchParams({
    [F.id]:String(meta.id),
    [F.path]:server,
    [F.mediaType]:meta.type,
    [F.ts]:String(tok.ts),
    [F.token]:String(tok.token),
    [F.title]:meta.title,
    [F.year]:String(meta.year||''),
    [F.date]:meta.date||''
  });
  if(meta.type==='tv'){
    q.set(F.season,String(meta.season));
    q.set(F.episode,String(meta.episode));
    if(meta.latestDate)q.set(F.latestDate,meta.latestDate);
  }
  if(meta.imdb)q.set(F.imdbId,meta.imdb);
  r=await fetch(BASE+'/backend_/sources/'+encodeURIComponent(server)+'?'+q.toString(),{
    headers:headers(),signal:AbortSignal.timeout(25000)
  });
  const st=await r.text();
  console.log('SOURCE',meta.type,server,r.status,r.headers.get('content-type'),'len',st.length,'prefix',st.slice(0,500));
  if(!r.ok)return[];
  let data;try{data=JSON.parse(st)}catch(e){return[]}
  const links=Array.isArray(data.links)?data.links:[];
  const out=[];
  for(const x of links){
    const url=dec(x&&x.link);
    console.log('DECRYPT',meta.type,server,{
      type:x&&x.type,resolution:x&&x.resolution,source:x&&x.source,size:x&&x.size,
      encryptedPrefix:String(x&&x.link||'').slice(0,32),
      url:url?url.slice(0,220):''
    });
    if(/^https?:\/\//i.test(url))out.push({server,url,raw:x});
  }
  return out;
}
async function media(meta,row){
  try{
    const ref=BASE+'/player/'+meta.type+'/'+meta.id+(meta.type==='tv'?'/'+meta.season+'/'+meta.episode:'');
    const r=await fetch(row.url,{headers:{'User-Agent':UA,Referer:ref,Origin:BASE,Range:'bytes=0-4095'},redirect:'manual',signal:AbortSignal.timeout(20000)});
    const b=Buffer.from(await r.arrayBuffer());
    console.log('MEDIA',meta.type,row.server,r.status,r.headers.get('content-type'),new URL(row.url).host,'bytes',b.length,'prefix',b.subarray(0,160).toString('utf8').replace(/\s+/g,' '));
  }catch(e){console.log('MEDIA',meta.type,row.server,'ERR',e.message)}
}
async function one(meta){
  console.log('\n===',meta.type,meta.title,'===');
  for(const server of SERVERS){
    try{
      const rows=await getSource(meta,server);
      console.log('ROWS',meta.type,server,rows.length);
      for(const x of rows.slice(0,4))await media(meta,x);
    }catch(e){console.log('SERVER ERR',meta.type,server,e.stack||e.message)}
  }
}
(async()=>{
 await one({id:550,type:'movie',title:'Fight Club',year:'1999',date:'1999-10-15',imdb:'tt0137523'});
 await one({id:1399,type:'tv',title:'Game of Thrones',year:'2011',date:'2011-04-17',imdb:'tt0944947',season:1,episode:1});
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
