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

async function firstVariant(url,headers){
  const r=await fetch(url,{headers:headers,redirect:'manual'});
  const t=await r.text();
  console.log('MASTER',r.status,r.headers.get('content-type'),new URL(url).host,t.slice(0,900).replace(/\s+/g,' '));
  const lines=t.split(/\r?\n/).filter(Boolean);
  for(let i=0;i<lines.length;i++){
    if(lines[i].indexOf('#EXT-X-STREAM-INF')===0 && lines[i+1] && lines[i+1][0]!=='#'){
      const v=new URL(lines[i+1],url).href;
      await probe(v,headers);
      return true;
    }
  }
  return t.indexOf('#EXTM3U')>=0;
}

function platformConfig(key){
  if(key==='pv') return {ott:'pv',prefix:'/mobile/pv'};
  if(key==='hs') return {ott:'hs',prefix:'/mobile/hs'};
  return {ott:'nf',prefix:'/mobile'};
}

async function findContent(title,mediaType,season,episode,tHash){
  for(const key of ['nf','pv','hs']){
    const cfg=platformConfig(key);
    const cookie='t_hash_t='+tHash+'; ott='+cfg.ott+'; hd=on';
    const now=Math.floor(Date.now()/1000);
    try{
      const s=await jfetch(MAIN+cfg.prefix+'/search.php?s='+encodeURIComponent(title)+'&t='+now,cookie);
      const results=Array.isArray(s.searchResult)?s.searchResult:[];
      const norm=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,'');
      const hit=results.find(x=>norm(x.t||x.title)===norm(title))||results[0];
      console.log('platform',key,'search count',results.length,'hit',hit);
      if(!hit||hit.id==null) continue;
      const post=await jfetch(MAIN+cfg.prefix+'/post.php?id='+encodeURIComponent(hit.id)+'&t='+(now+1),cookie);
      let targetId=String(hit.id);

      if(mediaType==='tv'){
        const wantedS=Number(season), wantedE=Number(episode);
        let ep=(post.episodes||[]).find(x=>{
          if(!x)return false;
          const en=Number(String(x.ep||x.epNum||'').replace(/\D/g,''));
          const sn=Number(String(x.s||x.sNum||'').replace(/\D/g,'')) || 1;
          return en===wantedE && sn===wantedS;
        });
        if(!ep){
          const seasons=Array.isArray(post.season)?post.season:[];
          const se=seasons.find((x,i)=>Number(String(x.s||'').replace(/\D/g,''))===wantedS)||seasons[wantedS-1];
          if(se&&se.id){
            for(let page=1;page<=10&&!ep;page++){
              const ed=await jfetch(MAIN+cfg.prefix+'/episodes.php?s='+encodeURIComponent(se.id)+'&series='+encodeURIComponent(hit.id)+'&t='+(now+1+page)+'&page='+page,cookie);
              const eps=Array.isArray(ed.episodes)?ed.episodes:[];
              ep=eps.find(x=>{
                if(!x)return false;
                const en=Number(String(x.ep||x.epNum||'').replace(/\D/g,''));
                return en===wantedE;
              });
              if(!ed.nextPageShow) break;
            }
          }
        }
        console.log('platform',key,'tv post type',post.type,'episode',ep);
        if(!ep||ep.id==null) continue;
        targetId=String(ep.id);
      }else{
        if(post.type==='t'||(post.episodes||[]).some(Boolean)) continue;
      }

      const pl=await jfetch(
        MAIN+cfg.prefix+'/playlist.php?id='+encodeURIComponent(targetId)+'&t='+encodeURIComponent(title)+'&tm='+(now+20),
        cookie,
        {'X-Requested-With':'app.netmirror.netmirrornew',Accept:'*/*','Sec-Fetch-Dest':'empty','Sec-Fetch-Mode':'cors','Sec-Fetch-Site':'same-origin'}
      );
      const entries=Array.isArray(pl)?pl:(pl.playlist||pl.data||[]);
      const sources=[];
      for(const e of entries||[])for(const src of (e&&e.sources)||[])if(src&&src.file)sources.push(src);
      console.log('platform',key,'target',targetId,'sources',sources.map(x=>({label:x.label,file:String(x.file).slice(0,180)})));
      if(!sources.length) continue;

      const headers={Accept:'*/*','Accept-Language':'en-IN,en-US;q=0.9,en;q=0.8',Referer:MAIN+'/mobile/home?app=1','User-Agent':PLAY_UA,'X-Requested-With':'app.netmirror.netmirrornew',Cookie:'hd=on'};
      const src=sources.find(x=>/1080|full hd/i.test(String(x.label)))||sources[0];
      const u=/^https?:\/\//i.test(src.file)?src.file:(src.file.startsWith('//')?'https:'+src.file:MAIN+(src.file.startsWith('/')?'':'/')+src.file);
      const ok=await firstVariant(u,headers);
      if(ok) return {platform:key,targetId,sources};
    }catch(e){
      console.log('platform',key,'error',e&&e.message||String(e));
    }
  }
  return null;
}

(async()=>{
  console.log('=== NetMirror full current flow ===');
  const r=await fetch(MAIN+'/verify.php',{
    method:'POST',redirect:'manual',
    headers:{'User-Agent':UA,Origin:'https://net22.cc',Referer:'https://net22.cc/verify2','Content-Type':'application/x-www-form-urlencoded'},
    body:'g-recaptcha-response=11111111-2222-3333-4444-555555555555'
  });
  const sc=r.headers.get('set-cookie')||'';
  const m=sc.match(/t_hash_t=([^;]+)/);
  console.log('verify',r.status,'cookie',!!m);
  if(!m)throw new Error('cookie missing');
  const th=m[1];

  const movie=await findContent('Fight Club','movie',null,null,th);
  console.log('MOVIE RESULT',movie&&{platform:movie.platform,targetId:movie.targetId,count:movie.sources.length});
  if(!movie)throw new Error('movie failed');

  const tv=await findContent('Game of Thrones','tv',1,1,th);
  console.log('TV RESULT',tv&&{platform:tv.platform,targetId:tv.targetId,count:tv.sources.length});
  if(!tv)throw new Error('tv failed');
})().catch(e=>{console.error(e);process.exit(1)});
