const UA='Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36';

async function probeMedia(label,url,headers){
  try{
    const r=await fetch(url,{headers:{...(headers||{}),Range:'bytes=0-2047'},redirect:'manual'});
    const ct=r.headers.get('content-type');
    const text=await r.text();
    console.log(label,'probe',r.status,ct,'host',new URL(url).host,'prefix',text.slice(0,220).replace(/\s+/g,' '));
    return {status:r.status,ct,text};
  }catch(e){
    console.log(label,'probe error',e&&e.message||String(e));
    return null;
  }
}

async function prime(imdb,type,season,episode){
  console.log('\n=== PrimeSrc',type,imdb,season||'',episode||'','===');
  const base='https://primesrc.me';
  const headers={Referer:base+'/', 'User-Agent':UA, Accept:'*/*'};
  const u=type==='tv'
    ? base+'/api/v1/s?imdb='+encodeURIComponent(imdb)+'&season='+season+'&episode='+episode+'&type=tv'
    : base+'/api/v1/s?imdb='+encodeURIComponent(imdb)+'&type=movie';
  try{
    const r=await fetch(u,{headers});
    const t=await r.text();
    console.log('serverList',r.status,r.headers.get('content-type'),'len',t.length,'body',t.slice(0,500).replace(/\s+/g,' '));
    if(!r.ok)return;
    const j=JSON.parse(t);
    const servers=Array.isArray(j&&j.servers)?j.servers:[];
    console.log('servers',servers.length,servers.slice(0,10).map(x=>({name:x.name,quality:x.quality,key:!!x.key})));
    for(const srv of servers.slice(0,4)){
      if(!srv||!srv.key)continue;
      const lr=await fetch(base+'/api/v1/l?key='+encodeURIComponent(srv.key),{headers});
      const lt=await lr.text();
      console.log('link',srv.name,lr.status,lt.slice(0,400).replace(/\s+/g,' '));
      if(!lr.ok)continue;
      let lj=null;try{lj=JSON.parse(lt);}catch(_){}
      const link=lj&&lj.link;
      if(/^https?:\/\//i.test(link)) await probeMedia('PrimeSrc '+(srv.name||''),link,headers);
    }
  }catch(e){console.log('PrimeSrc error',e&&e.stack?e.stack:String(e));}
}

async function vap(imdb,type,season,episode){
  console.log('\n=== VAPlayer',type,imdb,season||'',episode||'','===');
  const base='https://streamdata.vaplayer.ru';
  const ref='https://nextgencloudfabric.com/';
  const u=type==='tv'
    ? base+'/api.php?imdb='+encodeURIComponent(imdb)+'&type=tv&season='+season+'&episode='+episode
    : base+'/api.php?imdb='+encodeURIComponent(imdb)+'&type=movie';
  const headers={Referer:ref,'User-Agent':UA,Accept:'*/*'};
  try{
    const r=await fetch(u,{headers});
    const t=await r.text();
    console.log('api',r.status,r.headers.get('content-type'),'len',t.length,'body',t.slice(0,800).replace(/\s+/g,' '));
    if(!r.ok)return;
    const j=JSON.parse(t);
    const urls=(j&&j.data&&Array.isArray(j.data.stream_urls))?j.data.stream_urls:[];
    console.log('streams',urls.length,'subs',Array.isArray(j&&j.default_subs)?j.default_subs.length:0);
    for(const link of urls.slice(0,3)){
      if(/^https?:\/\//i.test(link)) await probeMedia('VAPlayer',link,headers);
    }
  }catch(e){console.log('VAPlayer error',e&&e.stack?e.stack:String(e));}
}

(async()=>{
  await prime('tt0137523','movie');
  await prime('tt0944947','tv',1,1);
  await vap('tt0137523','movie');
  await vap('tt0944947','tv',1,1);
})().catch(e=>{console.error(e);process.exitCode=0});
