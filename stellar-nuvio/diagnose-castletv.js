const crypto=require('crypto');
const BASE='https://api.hlowb.com';
const PKG='com.external.castle',CHANNEL='IndiaA',CLIENT='1',LANG='en-US';
const H={'User-Agent':'okhttp/4.9.3','Accept':'application/json','Accept-Language':'en-US,en;q=0.9','Connection':'Keep-Alive','Referer':BASE};

function deriveKey(sec){
  const kb=Buffer.from(sec,'base64'),suffix=Buffer.from('T!BgJB','utf8');
  const c=Buffer.concat([kb,suffix]);
  return c.length<16?Buffer.concat([c,Buffer.alloc(16-c.length)]):c.subarray(0,16);
}
function decrypt(text,sec){
  const key=deriveKey(sec);
  const d=crypto.createDecipheriv('aes-128-cbc',key,key);d.setAutoPadding(true);
  return Buffer.concat([d.update(Buffer.from(text,'base64')),d.final()]).toString('utf8');
}
function safeParse(text){return JSON.parse(text.replace(/([:{[,]\s*)(\d{16,})/g,'$1"$2"'))}
async function extract(r){
  const t=await r.text();let p=null;try{p=JSON.parse(t)}catch(_){}
  return p&&typeof p.data==='string'?p.data.trim():t.trim();
}
async function req(url,opt={}){
  const r=await fetch(url,{...opt,headers:{...H,...(opt.headers||{})}});
  console.log('HTTP',r.status,url.split('?')[0]);
  if(!r.ok){console.log((await r.text()).slice(0,500));throw new Error('HTTP '+r.status)}
  return r;
}
function unwrap(x){return x&&x.data&&typeof x.data==='object'&&!Array.isArray(x.data)?x.data:x}
(async()=>{
  console.log('=== CastleTV ===');
  try{
    const kr=await req(BASE+'/v0.1/system/getSecurityKey/1?channel='+CHANNEL+'&clientType='+CLIENT+'&lang='+LANG);
    const kj=await kr.json();
    console.log('key response',JSON.stringify(kj).slice(0,500));
    const sec=kj.data;if(!sec)throw new Error('no security key');

    const qs=new URLSearchParams({channel:CHANNEL,clientType:CLIENT,keyword:'Fight Club 1999',lang:LANG,mode:'1',packageName:PKG,page:'1',size:'30'});
    const sr=await req(BASE+'/film-api/v1.1.0/movie/searchByKeyword?'+qs);
    const cipher=await extract(sr);
    const sj=safeParse(decrypt(cipher,sec));
    console.log('search decrypted',JSON.stringify(sj).slice(0,2500));
    const rows=(unwrap(sj).rows)||[];
    const hit=rows.find(x=>String(x.title||x.name||'').toLowerCase().includes('fight club'))||rows[0];
    console.log('hit',hit&&{id:hit.id,redirectId:hit.redirectId,title:hit.title||hit.name});
    if(!hit)return;
    const id=String(hit.id||hit.redirectId||hit.redirectIdStr||'');

    const dr=await req(BASE+'/film-api/v1.9.9/movie?channel='+CHANNEL+'&clientType='+CLIENT+'&lang='+LANG+'&movieId='+encodeURIComponent(id)+'&packageName='+PKG);
    const dc=await extract(dr); const dj=safeParse(decrypt(dc,sec)); const dd=unwrap(dj);
    console.log('detail keys',Object.keys(dd||{}),'detail',JSON.stringify(dd).slice(0,4000));
    const eps=(dd&&dd.episodes)||[];
    const ep=eps[0];if(!ep){console.log('no episode');return}
    const episodeId=String(ep.id||'');
    const tracks=Array.isArray(ep.tracks)?ep.tracks:[];
    console.log('episode',episodeId,'tracks',tracks.map(t=>({languageId:t.languageId,languageName:t.languageName,existIndividualVideo:t.existIndividualVideo})));

    async function getVideo(resolution,languageId){
      const body={mode:'1',appMarket:'GuanWang',clientType:CLIENT,woolUser:'false',apkSignKey:'ED0955EB04E67A1D9F3305B95454FED485261475',androidVersion:'13',movieId:id,episodeId,isNewUser:'true',resolution:String(resolution),packageName:PKG};
      if(languageId!=null)body.languageId=String(languageId);
      const r=await req(BASE+'/film-api/v2.0.1/movie/getVideo2?clientType='+CLIENT+'&packageName='+PKG+'&channel='+CHANNEL+'&lang='+LANG,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      const c=await extract(r); const j=safeParse(decrypt(c,sec)); return unwrap(j);
    }

    for(const res of [3,2,1]){
      try{
        const data=await getVideo(res,tracks[0]&&tracks[0].languageId);
        console.log('video',res,JSON.stringify(data).slice(0,2600));
        const urls=[];
        if(data&&data.videoUrl)urls.push(data.videoUrl);
        if(data&&Array.isArray(data.videos))for(const v of data.videos){if(v&&v.url)urls.push(v.url)}
        for(const u of [...new Set(urls)].slice(0,3)){
          const mr=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36','Accept':'*/*',Range:'bytes=0-2047'},redirect:'manual'});
          console.log('media',res,new URL(u).host,mr.status,mr.headers.get('content-type'),mr.headers.get('content-length'),mr.headers.get('location'));
          await mr.arrayBuffer();
        }
      }catch(e){console.log('video',res,'error',e.message)}
    }
  }catch(e){console.log('CastleTV error',e.stack||e.message)}
})();