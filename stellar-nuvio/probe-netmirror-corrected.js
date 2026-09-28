const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36';
const NEWUA='Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0';
const MAIN='https://net52.cc';

async function getCookie(){
  const r=await fetch(MAIN+'/verify.php',{
    method:'POST',redirect:'manual',
    headers:{'User-Agent':UA,Origin:'https://net22.cc',Referer:'https://net22.cc/verify2','Content-Type':'application/x-www-form-urlencoded'},
    body:'g-recaptcha-response=11111111-2222-3333-4444-555555555555'
  });
  const sc=r.headers.get('set-cookie')||'';
  const m=sc.match(/t_hash_t=([^;]+)/);
  console.log('verify',r.status,!!m);
  if(!m)throw new Error('cookie missing');
  return 't_hash_t='+m[1]+'; ott=nf; hd=on';
}

async function jfetch(url,headers){
  const r=await fetch(url,{headers});
  const t=await r.text();
  console.log('HTTP',r.status,url,t.slice(0,1200).replace(/\s+/g,' '));
  if(!r.ok)throw new Error('HTTP '+r.status);
  return JSON.parse(t);
}

async function resolveApi(){
  for(const d of ['https://mobiledetects.com','https://mobidetect.art','https://mobidetect.cc']){
    try{
      const j=await jfetch(d+'/checknewtv.php',{'User-Agent':NEWUA,'X-Requested-With':'NetmirrorNewTV v1.0'});
      if(j&&j.token_hash)return Buffer.from(j.token_hash,'base64').toString('utf8').replace(/\/$/,'');
    }catch(e){console.log('resolver fail',d,e.message);}
  }
  throw new Error('no api');
}

async function probe(url,headers){
  const r=await fetch(url,{headers:{...headers,Range:'bytes=0-4095'},redirect:'manual'});
  const t=await r.text();
  console.log('MEDIA',r.status,r.headers.get('content-type'),new URL(url).host,t.slice(0,1000).replace(/\s+/g,' '));
  return {r,t};
}

(async()=>{
  console.log('=== NetMirror corrected ===');
  const cookie=await getCookie();
  const catHeaders={'User-Agent':UA,Cookie:cookie,Referer:MAIN+'/home'};
  const search=await jfetch(MAIN+'/mobile/search.php?s='+encodeURIComponent('Fight Club')+'&t=1700000010',catHeaders);
  const hit=(search.searchResult||[]).find(x=>String(x.t||'').toLowerCase()==='fight club')||(search.searchResult||[])[0];
  if(!hit)throw new Error('search miss');
  console.log('hit',hit);

  const post=await jfetch(MAIN+'/mobile/post.php?id='+encodeURIComponent(String(hit.id))+'&t=1700000011',catHeaders);
  console.log('post keys',Object.keys(post||{}),'main_id',post.main_id,'type',post.type,'episodes',Array.isArray(post.episodes)?post.episodes.length:null);

  let playerId='';
  if(post.main_id!=null)playerId=String(post.main_id);
  else if(post.episodes&&post.episodes[0]&&post.episodes[0].id!=null)playerId=String(post.episodes[0].id);
  else playerId=String(hit.id);
  console.log('playerId',playerId);

  const api=await resolveApi();
  console.log('api',api);
  const ph={
    'User-Agent':NEWUA,'X-Requested-With':'NetmirrorNewTV v1.0',
    Accept:'application/json, text/plain, */*','Cache-Control':'no-cache, no-store, must-revalidate',
    Pragma:'no-cache',Expires:'0',Ott:'nf',Usertoken:'',Cookie:cookie
  };
  const p=await jfetch(api+'/newtv/player.php?id='+encodeURIComponent(playerId),ph);
  console.log('player json',p);
  if(!p.video_link)throw new Error('no video_link');

  const playHeaders={Referer:p.referer||MAIN,Cookie:'hd=on','User-Agent':NEWUA};
  const master=await probe(p.video_link,playHeaders);
  if(master.t.indexOf('#EXT-X-STREAM-INF')<0)throw new Error('master has no video variants');

  const lines=master.t.split(/\r?\n/).filter(Boolean);
  let variant='';
  for(let i=0;i<lines.length;i++){
    if(lines[i].indexOf('#EXT-X-STREAM-INF')===0 && lines[i+1] && lines[i+1][0]!=='#'){variant=new URL(lines[i+1],p.video_link).href;break;}
  }
  console.log('variant',variant);
  if(variant)await probe(variant,playHeaders);
})().catch(e=>{console.error(e);process.exit(1)});
