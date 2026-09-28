const crypto=require('crypto');

const UA='Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36';

async function probeMedia(label,url,headers={}){
  try{
    const r=await fetch(url,{headers:{...headers,Range:'bytes=0-2047'},redirect:'manual'});
    let prefix='';
    try{
      const ab=await r.arrayBuffer();
      prefix=Buffer.from(ab).subarray(0,160).toString('utf8').replace(/\s+/g,' ');
    }catch(_){}
    console.log(label,'MEDIA',r.status,r.headers.get('content-type'),new URL(url).host,prefix);
    return r.status>=200&&r.status<400;
  }catch(e){
    console.log(label,'MEDIA error',e&&e.message||String(e));
    return false;
  }
}

async function streamflix(){
  console.log('\n=== StreamFlix ===');
  try{
    const API='https://api.streamflix.app';
    const FB='https://chilflix-410be-default-rtdb.asia-southeast1.firebasedatabase.app';
    const [dr,cr]=await Promise.all([
      fetch(API+'/data.json',{headers:{'User-Agent':UA,Accept:'application/json'}}),
      fetch(API+'/config/config-streamflixapp.json',{headers:{'User-Agent':UA,Accept:'application/json'}})
    ]);
    console.log('data/config',dr.status,cr.status);
    const d=await dr.json(), c=await cr.json();
    const items=(d&&d.data)||[];
    console.log('items',items.length,'downloads',Array.isArray(c&&c.download)?c.download.length:null);

    for(const [tmdb,type,season,episode] of [['550','movie',null,null],['1399','tv',1,1]]){
      const hit=items.find(x=>String(x.tmdb)===tmdb);
      console.log(type,'hit',!!hit,hit&&{name:hit.moviename,key:hit.moviekey,movielink:hit.movielink});
      if(!hit)continue;
      let link='';
      if(type==='movie'){
        link=hit.movielink||'';
      }else{
        const er=await fetch(FB+'/Data/'+encodeURIComponent(hit.moviekey)+'/seasons/'+season+'/episodes.json',{headers:{'User-Agent':UA}});
        console.log('episodes',er.status);
        const ej=await er.json();
        const vals=ej&&typeof ej==='object'?Object.values(ej):[];
        const ep=vals[episode-1]||vals.find(x=>Number(x&&x.episode)===episode);
        link=ep&&ep.link||'';
        console.log('tv episode link',link);
      }
      const base=Array.isArray(c&&c.download)?c.download.find(Boolean):'';
      if(base&&link){
        const url=base+link;
        console.log(type,'url',url);
        await probeMedia('StreamFlix '+type,url,{'User-Agent':UA});
      }
    }
  }catch(e){console.log('StreamFlix error',e&&e.stack||String(e));}
}

async function hdghar(){
  console.log('\n=== HDGharTV ===');
  const API='https://hdghartv.cc/api';
  const headers={'User-Agent':UA,Accept:'application/json, */*',Referer:'https://hdghartv.cc/'};
  try{
    for(const [title,type,season,episode] of [['Fight Club','movie',null,null],['Game of Thrones','series',1,1]]){
      const sr=await fetch(API+'/search?q='+encodeURIComponent(title),{headers});
      const st=await sr.text();
      console.log(type,'search',sr.status,st.slice(0,300).replace(/\s+/g,' '));
      let sj=null;try{sj=JSON.parse(st);}catch(_){}
      const list=type==='movie'?(sj&&sj.movies||[]):(sj&&sj.series||[]);
      const hit=list.find(x=>String(x.title||'').toLowerCase()===title.toLowerCase())||list[0];
      console.log(type,'hit',hit&&{id:hit._id,title:hit.title});
      if(!hit)continue;
      const path=type==='movie'?'/movies/public/':'/series/public/';
      const rr=await fetch(API+path+encodeURIComponent(hit._id),{headers});
      const rt=await rr.text();
      console.log(type,'detail',rr.status,rt.slice(0,350).replace(/\s+/g,' '));
      let j=null;try{j=JSON.parse(rt);}catch(_){}
      let links=[];
      if(type==='movie') links=j&&j.streamingLinks||[];
      else{
        const s=(j&&j.seasons||[]).find(x=>Number(x.seasonNumber)===season);
        const ep=s&&Array.isArray(s.episodes)?s.episodes.find(x=>Number(x.episodeNumber)===episode):null;
        links=ep&&ep.streamingLinks||[];
      }
      const active=links.filter(x=>x&&x.isActive&&x.url);
      console.log(type,'active links',active.map(x=>({q:x.quality,url:x.url&&x.url.slice(0,180)})));
      if(active[0]) await probeMedia('HDGharTV '+type,active[0].url,headers);
    }
  }catch(e){console.log('HDGharTV error',e&&e.stack||String(e));}
}

async function netmirror(){
  console.log('\n=== NetMirror ===');
  const base='https://net27.cc';
  try{
    for(const [tmdb,type,season,episode] of [['550','movie',null,null],['1399','tv',1,1]]){
      const url=type==='movie'
        ? base+'/api/embed-tmdb/'+tmdb
        : base+'/api/embed-tmdb/'+tmdb+'?type=tv&se='+season+'&ep='+episode;
      const r=await fetch(url,{headers:{Accept:'application/json, text/plain, */*',Referer:base+'/','User-Agent':UA}});
      const t=await r.text();
      console.log(type,'api',r.status,t.slice(0,600).replace(/\s+/g,' '));
      let j=null;try{j=JSON.parse(t);}catch(_){}
      const streams=j&&Array.isArray(j.streams)?j.streams:[];
      const first=streams.find(x=>x&&x.url)||((j&&j.mp4)?{url:j.mp4}:null);
      console.log(type,'streams',streams.length,'first',first&&first.url&&first.url.slice(0,220));
      if(first)await probeMedia('NetMirror '+type,first.url,{Referer:'https://videodownloader.site/','User-Agent':UA});
    }
  }catch(e){console.log('NetMirror error',e&&e.stack||String(e));}
}

async function zxc(){
  console.log('\n=== ZXCStreams ===');
  const SALT='3435443433';
  const F={id:'rgrwsdsdfgwrwrwwr',fToken:'xfgdfgdsffgrwgrwyjhkjt',ts:'rdghhdghhfssft',token:'ZDDVHJFGHYRHG',title:'TUKTHFSSFGDGHJS',year:'53653TRFG647GF',season:'adkljfhdahfladhfjahfjlahfhfljkadfdf',episode:'546745ygy46ytfgty',imdbId:'564745ygtuy5yi75yuy'};
  const candidates=['https://r1.zxcstream.xyz','https://r2.zxcstream.xyz','https://r3.zxcstream.xyz','https://r4.zxcstream.xyz'];
  const sha=s=>crypto.createHash('sha512').update(s).digest('hex');
  let base='';
  try{
    for(const b of candidates){
      const rt=Date.now(), xt=sha(rt+':'+SALT+':550').slice(0,64);
      const r=await fetch(b+'/backend/token',{method:'POST',headers:{'User-Agent':UA,Accept:'application/json','Content-Type':'application/json',Origin:b,Referer:b+'/player/movie/550'},body:JSON.stringify({[F.id]:'550',[F.fToken]:xt,[F.ts]:rt})});
      const t=await r.text();
      console.log('verify',b,r.status,t.slice(0,300).replace(/\s+/g,' '));
      if(r.ok){
        try{const j=JSON.parse(t);if(j&&j[F.token]){base=b;break;}}catch(_){}
      }
    }
    if(!base){console.log('no live base');return;}
    console.log('base',base);

    for(const meta of [
      {tmdbId:'550',type:'movie',title:'Fight Club',year:'1999',date:'1999-10-15',imdbId:'tt0137523'},
      {tmdbId:'1399',type:'tv',title:'Game of Thrones',year:'2011',date:'2011-04-17',imdbId:'tt0944947',season:1,episode:1}
    ]){
      const ref=base+'/player/'+meta.type+'/'+meta.tmdbId+(meta.season?'/'+meta.season+'/'+meta.episode:'');
      const rt=Date.now(),xt=sha(rt+':'+SALT+':'+meta.tmdbId).slice(0,64);
      const tr=await fetch(base+'/backend/token',{method:'POST',headers:{'User-Agent':UA,Accept:'application/json','Content-Type':'application/json',Origin:base,Referer:ref},body:JSON.stringify({[F.id]:meta.tmdbId,[F.fToken]:xt,[F.ts]:rt})});
      const tj=await tr.json();
      console.log(meta.type,'token',tr.status,!!tj[F.token]);
      if(!tj[F.token])continue;
      for(const server of ['icarus','berkas','orion','athena']){
        const p={
          [F.id]:meta.tmdbId,b:meta.type,[F.ts]:String(tj[F.ts]),[F.token]:tj[F.token],[F.fToken]:xt,
          [F.title]:meta.title,[F.year]:meta.year,date:meta.date,[F.imdbId]:meta.imdbId
        };
        if(meta.season){p[F.season]=String(meta.season);p[F.episode]=String(meta.episode);}
        const qs=new URLSearchParams(p).toString();
        const r=await fetch(base+'/backend_/servers/'+server+'?'+qs,{headers:{'User-Agent':UA,Accept:'application/json',Origin:base,Referer:ref}});
        const t=await r.text();
        console.log(meta.type,server,r.status,t.slice(0,500).replace(/\s+/g,' '));
        let j=null;try{j=JSON.parse(t);}catch(_){}
        const first=j&&Array.isArray(j.links)?j.links.find(x=>x&&x.link):null;
        if(first){
          console.log(meta.type,server,'first',first.link.slice(0,220),first.type,first.resolution);
          await probeMedia('ZXC '+meta.type+' '+server,first.link,{Referer:ref,Origin:base,'User-Agent':UA});
          break;
        }
      }
    }
  }catch(e){console.log('ZXC error',e&&e.stack||String(e));}
}

(async()=>{
  await streamflix();
  await hdghar();
  await netmirror();
  await zxc();
})().catch(e=>{console.error(e);process.exitCode=1});
