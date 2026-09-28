const crypto=require('crypto');

const UA='Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/141 Safari/537.36';

async function streamflix(){
  console.log('\n=== StreamFlix ===');
  try{
    const [dr,cr]=await Promise.all([
      fetch('https://api.streamflix.app/data.json',{headers:{'User-Agent':UA,Accept:'application/json'}}),
      fetch('https://api.streamflix.app/config/config-streamflixapp.json',{headers:{'User-Agent':UA,Accept:'application/json'}})
    ]);
    const dt=await dr.text(), ct=await cr.text();
    console.log('data',dr.status,dr.headers.get('content-type'),'len',dt.length);
    console.log('config',cr.status,cr.headers.get('content-type'),'len',ct.length,ct.slice(0,500));
    let dj=null,cj=null;try{dj=JSON.parse(dt)}catch(_){}try{cj=JSON.parse(ct)}catch(_){}
    const items=(dj&&dj.data)||[];
    console.log('items',Array.isArray(items)?items.length:null,'downloadBases',cj&&cj.download);
    const hit=Array.isArray(items)?items.find(x=>String(x.tmdb)==='550'):null;
    console.log('fightClub hit',hit&&{tmdb:hit.tmdb,moviename:hit.moviename,movielink:hit.movielink,moviekey:hit.moviekey});
    if(hit&&hit.movielink&&cj&&Array.isArray(cj.download)){
      for(const base of cj.download.slice(0,3)){
        const url=String(base)+String(hit.movielink);
        try{
          const r=await fetch(url,{headers:{'User-Agent':UA,Range:'bytes=0-2047'},redirect:'manual'});
          console.log('media',new URL(url).host,r.status,r.headers.get('content-type'),r.headers.get('content-length'),r.headers.get('location'));
          await r.arrayBuffer();
        }catch(e){console.log('media error',e.message)}
      }
    }
    const got=Array.isArray(items)?items.find(x=>String(x.tmdb)==='1399'):null;
    console.log('got hit',got&&{name:got.moviename,key:got.moviekey});
    if(got&&got.moviekey){
      const er=await fetch('https://chilflix-410be-default-rtdb.asia-southeast1.firebasedatabase.app/Data/'+encodeURIComponent(got.moviekey)+'/seasons/1/episodes.json',{headers:{'User-Agent':UA}});
      const et=await er.text();
      console.log('got episodes',er.status,'len',et.length,et.slice(0,600));
    }
  }catch(e){console.log('StreamFlix error',e.stack||e.message)}
}

const PORTALS=['https://zxcstream.xyz','https://zxcprime.xyz'];
const SALT='3435443433';
const F={id:'rgrwsdsdfgwrwrwwr',fToken:'xfgdfgdsffgrwgrwyjhkjt',ts:'rdghhdghhfssft',token:'ZDDVHJFGHYRHG',title:'TUKTHFSSFGDGHJS',year:'53653TRFG647GF',season:'adkljfhdahfladhfjahfjlahfhfljkadfdf',episode:'546745ygy46ytfgty',imdbId:'564745ygtuy5yi75yuy'};
function sha512(s){return crypto.createHash('sha512').update(s).digest('hex')}
async function verify(base,id='550'){
 const rt=Date.now(),xt=sha512(rt+':'+SALT+':'+id).slice(0,64);
 const r=await fetch(base+'/backend/token',{method:'POST',headers:{'User-Agent':UA,Origin:base,Referer:base+'/player/movie/'+id,'Content-Type':'application/json'},body:JSON.stringify({[F.id]:id,[F.fToken]:xt,[F.ts]:rt})});
 const t=await r.text(); console.log('verify',base,r.status,t.slice(0,350));
 if(!r.ok)return null;let j=null;try{j=JSON.parse(t)}catch(_){}return j&&j[F.token]?{base,j,xt,rt}:null;
}
async function zxc(){
 console.log('\n=== ZXCStreams ===');
 let base=null;
 for(const portal of PORTALS){
  try{
   const r=await fetch(portal,{headers:{'User-Agent':UA},redirect:'follow'});
   console.log('portal',portal,'status',r.status,'final',r.url);
   const b=new URL(r.url).origin;
   if(b!==new URL(portal).origin){const v=await verify(b);if(v){base=b;break;}}
  }catch(e){console.log('portal error',portal,e.message)}
 }
 if(!base){
  for(const sub of ['r1','r2','r3','r4','r5','r6','v4','cdn','api','stream']){
   try{const v=await verify('https://'+sub+'.zxcstream.xyz');if(v){base=v.base;break;}}catch(_){}
  }
 }
 console.log('chosen base',base);
 if(!base)return;
 const id='550',rt=Date.now(),xt=sha512(rt+':'+SALT+':'+id).slice(0,64);
 const referer=base+'/player/movie/'+id;
 const tr=await fetch(base+'/backend/token',{method:'POST',headers:{'User-Agent':UA,Origin:base,Referer:referer,'Content-Type':'application/json'},body:JSON.stringify({[F.id]:id,[F.fToken]:xt,[F.ts]:rt})});
 const tj=await tr.json();
 const params={
  [F.id]:id,b:'movie',[F.ts]:String(tj[F.ts]),[F.token]:tj[F.token],[F.fToken]:xt,
  [F.title]:'Fight Club',[F.year]:'1999',date:'1999-10-15',[F.imdbId]:'tt0137523'
 };
 for(const server of ['icarus','berkas','orion','athena']){
   const url=base+'/backend_/servers/'+server+'?'+new URLSearchParams(params).toString();
   try{
    const r=await fetch(url,{headers:{'User-Agent':UA,Origin:base,Referer:referer}});
    const t=await r.text();
    console.log(server,r.status,t.slice(0,900));
    let j=null;try{j=JSON.parse(t)}catch(_){}
    if(j&&Array.isArray(j.links)&&j.links[0]&&j.links[0].link){
      const u=j.links[0].link;
      const mr=await fetch(u,{headers:{'User-Agent':UA,Origin:base,Referer:referer,Range:'bytes=0-2047'},redirect:'manual'});
      console.log('media',server,new URL(u).host,mr.status,mr.headers.get('content-type'),mr.headers.get('content-length'));
      await mr.arrayBuffer();
    }
   }catch(e){console.log(server,'error',e.message)}
 }
}

(async()=>{await streamflix();await zxc();})().catch(e=>{console.error(e);process.exit(1)});
