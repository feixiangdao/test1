const MAIN='https://net52.cc';
const UA='Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Safari/537.36 /OS.Gatu v3.0';
const PLAY_UA='Mozilla/5.0 (Linux; Android 13; Pixel 5 Build/TQ3A.230901.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/149.0.7827.91 Safari/537.36 /OS.Gatu v3.0';

async function probe(url,headers={}){
  const r=await fetch(url,{headers:{...headers,Range:'bytes=0-4095'},redirect:'manual'});
  let prefix='';
  try{prefix=Buffer.from(await r.arrayBuffer()).subarray(0,220).toString('utf8').replace(/\s+/g,' ')}catch(_){}
  console.log('MEDIA',r.status,r.headers.get('content-type'),new URL(url).host,prefix);
  return r;
}

async function getCookie(){
  const r=await fetch(MAIN+'/verify.php',{
    method:'POST',redirect:'manual',
    headers:{
      'User-Agent':UA,
      Origin:'https://net22.cc',
      Referer:'https://net22.cc/verify2',
      'Content-Type':'application/x-www-form-urlencoded'
    },
    body:'g-recaptcha-response=11111111-2222-3333-4444-555555555555'
  });
  const sc=r.headers.get('set-cookie')||'';
  const m=sc.match(/t_hash_t=([^;]+)/);
  console.log('verify',r.status,'cookie',!!m);
  if(!m)throw new Error('t_hash_t missing');
  return 't_hash_t='+m[1]+'; ott=nf; hd=on';
}

async function jfetch(url,cookie,extra={}){
  const headers={
    Accept:'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language':'en-IN,en-US;q=0.9,en;q=0.8',
    'User-Agent':UA,
    'X-Requested-With':'XMLHttpRequest',
    Cookie:cookie,
    Referer:MAIN+'/mobile/home?app=1',
    ...extra
  };
  const r=await fetch(url,{headers});
  const t=await r.text();
  console.log('HTTP',r.status,url,t.slice(0,1800).replace(/\s+/g,' '));
  if(!r.ok)throw new Error('HTTP '+r.status);
  return JSON.parse(t);
}

(async()=>{
  console.log('=== NetMirror mobile playlist current ===');
  const cookie=await getCookie();
  const now=Math.floor(Date.now()/1000);
  const s=await jfetch(MAIN+'/mobile/search.php?s='+encodeURIComponent('Fight Club')+'&t='+now,cookie);
  const hit=(s.searchResult||[]).find(x=>String(x.t||'').toLowerCase()==='fight club')||(s.searchResult||[])[0];
  if(!hit)throw new Error('search miss');
  console.log('hit',hit);

  const post=await jfetch(MAIN+'/mobile/post.php?id='+encodeURIComponent(hit.id)+'&t='+(now+1),cookie);
  console.log('post type',post.type,'episodes',JSON.stringify(post.episodes).slice(0,1000),'main_id',post.main_id);

  if(post.type==='t'||(post.episodes||[]).some(Boolean))throw new Error('movie resolved as series');
  const id=String(hit.id);

  const playlist=await jfetch(
    MAIN+'/mobile/playlist.php?id='+encodeURIComponent(id)+'&t='+encodeURIComponent('Fight Club')+'&tm='+(now+2),
    cookie,
    {
      'X-Requested-With':'app.netmirror.netmirrornew',
      Accept:'*/*',
      'Sec-Fetch-Dest':'empty',
      'Sec-Fetch-Mode':'cors',
      'Sec-Fetch-Site':'same-origin'
    }
  );
  console.log('playlist keys',Array.isArray(playlist)?'array':Object.keys(playlist||{}));
  console.log('playlist',JSON.stringify(playlist).slice(0,5000));

  const entries=Array.isArray(playlist)?playlist:(playlist.playlist||playlist.data||[]);
  const sources=[];
  for(const e of entries||[])for(const src of (e&&e.sources)||[])if(src&&src.file)sources.push(src);
  console.log('sources',sources.map(x=>({label:x.label,type:x.type,file:String(x.file).slice(0,240)})));
  if(!sources.length)throw new Error('no sources');

  for(const src of sources.slice(0,5)){
    const u=/^https?:\/\//i.test(src.file)?src.file:(src.file.startsWith('//')?'https:'+src.file:MAIN+(src.file.startsWith('/')?'':'/')+src.file);
    await probe(u,{
      Accept:'*/*',
      'Accept-Language':'en-IN,en-US;q=0.9,en;q=0.8',
      Referer:MAIN+'/mobile/home?app=1',
      'User-Agent':PLAY_UA,
      'X-Requested-With':'app.netmirror.netmirrornew',
      Cookie:'hd=on'
    });
  }
})().catch(e=>{console.error(e);process.exit(1)});
