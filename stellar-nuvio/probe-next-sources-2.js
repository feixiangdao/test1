const crypto=require('crypto');
const UA='Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36';

async function media(label,url,headers={}){
  try{
    const r=await fetch(url,{headers:{...headers,Range:'bytes=0-4095'},redirect:'manual'});
    let prefix='';
    try{
      const b=Buffer.from(await r.arrayBuffer());
      prefix=b.subarray(0,180).toString('utf8').replace(/\s+/g,' ');
    }catch(_){}
    console.log(label,r.status,r.headers.get('content-type'),new URL(url).host,prefix);
    return r;
  }catch(e){console.log(label,'ERR',e&&e.message||String(e));return null;}
}

async function streamflix(){
  console.log('\n=== StreamFlix v2 ===');
  const API='https://api.streamflix.app';
  try{
    const [dr,cr]=await Promise.all([
      fetch(API+'/data.json',{headers:{'User-Agent':UA,Accept:'application/json'}}),
      fetch(API+'/config/config-streamflixapp.json',{headers:{'User-Agent':UA,Accept:'application/json'}})
    ]);
    const d=await dr.json(),c=await cr.json();
    const hit=(d.data||[]).find(x=>String(x.tmdb)==='550');
    console.log('config keys',Object.keys(c||{}));
    for(const k of ['premium','movies','download']){
      const arr=Array.isArray(c&&c[k])?c[k]:[];
      console.log(k,arr);
      for(const base of arr){
        if(!hit||!hit.movielink)continue;
        const url=String(base)+String(hit.movielink);
        await media('StreamFlix '+k,url,{'User-Agent':UA,Referer:API});
      }
    }
    if(hit)console.log('movie hit',hit.moviename,hit.movielink,hit.moviekey,hit.movieduration);
  }catch(e){console.log('StreamFlix v2 error',e&&e.stack||String(e));}
}

async function netmirror(){
  console.log('\n=== NetMirror NewTV ===');
  const MAIN='https://net52.cc';
  const NEWUA='Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0 /OS.GatuNewTV v1.0';
  const domains=['https://mobiledetects.com','https://mobidetect.art','https://mobidetect.cc'];
  try{
    const vr=await fetch(MAIN+'/verify.php',{
      method:'POST',redirect:'manual',
      headers:{'User-Agent':UA,Origin:'https://net22.cc',Referer:'https://net22.cc/verify2','Content-Type':'application/x-www-form-urlencoded'},
      body:'g-recaptcha-response=11111111-2222-3333-4444-555555555555'
    });
    const sc=vr.headers.get('set-cookie')||'';
    console.log('verify',vr.status,'set-cookie',sc.slice(0,500));
    const m=sc.match(/t_hash_t=([^;]+)/);
    if(!m)throw new Error('t_hash_t missing');
    const cookie='t_hash_t='+m[1]+'; ott=nf; hd=on';

    const sr=await fetch(MAIN+'/mobile/search.php?s='+encodeURIComponent('Fight Club')+'&t=1700000001',{
      headers:{'User-Agent':UA,Cookie:cookie,Referer:MAIN+'/home'}
    });
    const st=await sr.text();
    console.log('search',sr.status,st.slice(0,1200).replace(/\s+/g,' '));
    let sj=null;try{sj=JSON.parse(st);}catch(_){}
    const first=sj&&Array.isArray(sj.searchResult)?sj.searchResult.find(x=>String(x.t||'').toLowerCase().includes('fight club'))||sj.searchResult[0]:null;
    console.log('first',first);
    if(!first||first.id==null)throw new Error('search id missing');

    let api='';
    for(const domain of domains){
      try{
        const r=await fetch(domain+'/checknewtv.php',{headers:{'User-Agent':NEWUA,'X-Requested-With':'NetmirrorNewTV v1.0'}});
        const t=await r.text();
        console.log('resolver',domain,r.status,t.slice(0,500).replace(/\s+/g,' '));
        let j=null;try{j=JSON.parse(t);}catch(_){}
        if(j&&j.token_hash){
          api=Buffer.from(j.token_hash,'base64').toString('utf8').replace(/\/$/,'');
          break;
        }
      }catch(e){console.log('resolver err',domain,e.message);}
    }
    console.log('api',api);
    if(!api)throw new Error('resolver failed');

    const pr=await fetch(api+'/newtv/player.php?id='+encodeURIComponent(String(first.id)),{
      headers:{
        'User-Agent':NEWUA,'X-Requested-With':'NetmirrorNewTV v1.0',
        Accept:'application/json, text/plain, */*','Cache-Control':'no-cache, no-store, must-revalidate',
        Pragma:'no-cache',Expires:'0',Ott:'nf',Usertoken:'',Cookie:cookie
      }
    });
    const pt=await pr.text();
    console.log('player',pr.status,pt.slice(0,1200).replace(/\s+/g,' '));
    let pj=null;try{pj=JSON.parse(pt);}catch(_){}
    if(pj&&pj.video_link){
      const h={Referer:pj.referer||MAIN,Cookie:'hd=on','User-Agent':NEWUA};
      const mr=await fetch(pj.video_link,{headers:h,redirect:'manual'});
      const mt=await mr.text();
      console.log('master',mr.status,mr.headers.get('content-type'),new URL(pj.video_link).host,mt.slice(0,1200).replace(/\s+/g,' '));
      const rel=(mt.match(/^(?!#)([^\r\n]+\.m3u8[^\r\n]*)/m)||[])[1];
      if(rel){
        let vu='';
        try{vu=new URL(rel,pj.video_link).href}catch(_){}
        if(vu)await media('NetMirror variant',vu,h);
      }
    }
  }catch(e){console.log('NetMirror NewTV error',e&&e.stack||String(e));}
}

async function zxc(){
  console.log('\n=== ZXCStreams v2 ===');
  const SALT='3435443433';
  const F={id:'rgrwsdsdfgwrwrwwr',fToken:'xfgdfgdsffgrwgrwyjhkjt',ts:'rdghhdghhfssft',token:'ZDDVHJFGHYRHG',title:'TUKTHFSSFGDGHJS',year:'53653TRFG647GF',season:'adkljfhdahfladhfjahfjlahfhfljkadfdf',episode:'546745ygy46ytfgty',imdbId:'564745ygtuy5yi75yuy'};
  const sha=s=>crypto.createHash('sha512').update(s).digest('hex');
  async function verify(base){
    const rt=Date.now(),xt=sha(rt+':'+SALT+':550').slice(0,64);
    const r=await fetch(base+'/backend/token',{
      method:'POST',
      headers:{'User-Agent':UA,Accept:'application/json','Content-Type':'application/json',Origin:base,Referer:base+'/player/movie/550'},
      body:JSON.stringify({[F.id]:'550',[F.fToken]:xt,[F.ts]:rt})
    });
    const t=await r.text();
    console.log('verify',base,r.status,t.slice(0,220).replace(/\s+/g,' '));
    if(!r.ok)return false;
    try{const j=JSON.parse(t);return !!(j&&j[F.token]);}catch(_){return false;}
  }
  let base='';
  for(const portal of ['https://zxcstream.xyz','https://zxcprime.xyz']){
    try{
      const r=await fetch(portal,{redirect:'follow',headers:{'User-Agent':UA}});
      const origin=new URL(r.url).origin;
      console.log('portal',portal,r.status,'->',origin);
      if(origin!==new URL(portal).origin && await verify(origin)){base=origin;break;}
    }catch(e){console.log('portal err',portal,e.message);}
  }
  if(!base){
    for(const sub of ['r1','r2','r3','r4','r5','r6','v4','cdn','api','stream']){
      const b='https://'+sub+'.zxcstream.xyz';
      try{if(await verify(b)){base=b;break;}}catch(e){console.log('verify err',b,e.message);}
    }
  }
  console.log('chosen base',base);
  if(!base)return;

  const meta={tmdbId:'550',type:'movie',title:'Fight Club',year:'1999',date:'1999-10-15',imdbId:'tt0137523'};
  const ref=base+'/player/movie/550';
  const rt=Date.now(),xt=sha(rt+':'+SALT+':550').slice(0,64);
  const tr=await fetch(base+'/backend/token',{
    method:'POST',
    headers:{'User-Agent':UA,Accept:'application/json','Content-Type':'application/json',Origin:base,Referer:ref},
    body:JSON.stringify({[F.id]:'550',[F.fToken]:xt,[F.ts]:rt})
  });
  const tj=await tr.json();
  for(const server of ['icarus','berkas','orion','athena']){
    try{
      const p={
        [F.id]:'550',b:'movie',[F.ts]:String(tj[F.ts]),[F.token]:tj[F.token],[F.fToken]:xt,
        [F.title]:meta.title,[F.year]:meta.year,date:meta.date,[F.imdbId]:meta.imdbId
      };
      const qs=new URLSearchParams(p).toString();
      const r=await fetch(base+'/backend_/servers/'+server+'?'+qs,{headers:{'User-Agent':UA,Accept:'application/json',Origin:base,Referer:ref}});
      const t=await r.text();
      console.log('server',server,r.status,t.slice(0,800).replace(/\s+/g,' '));
      let j=null;try{j=JSON.parse(t);}catch(_){}
      const first=j&&Array.isArray(j.links)?j.links.find(x=>x&&x.link):null;
      if(first){
        await media('ZXC '+server,first.link,{Referer:ref,Origin:base,'User-Agent':UA});
        break;
      }
    }catch(e){console.log('server err',server,e.message);}
  }
}

(async()=>{await streamflix();await netmirror();await zxc();})().catch(e=>{console.error(e);process.exitCode=1});
