'use strict';
const BASE='https://api.m-zone.org';
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

function cookieFrom(res){
  const sc=res.headers.get('set-cookie')||'';
  return sc.split(',').map(x=>x.split(';')[0].trim()).filter(Boolean).join('; ');
}
async function main(){
  const chRes=await fetch(BASE+'/api/player/v2/challenge',{
    headers:{'User-Agent':UA,'Accept':'application/json','Origin':'https://noctratv.com','Referer':'https://noctratv.com/'}
  });
  const ch=await chRes.json().catch(()=>({}));
  const cookie=cookieFrom(chRes);
  console.log('CHALLENGE status='+chRes.status+' keys='+Object.keys(ch).join(',')+' cookie='+(cookie?1:0)+' turnstile='+(ch.turnstileSiteKey?1:0));
  if(!chRes.ok||!ch.challengeId||!ch.nonce||!ch.issuedAt)return;

  const payload={
    challengeId:ch.challengeId,
    nonce:ch.nonce,
    publicKey:null,
    signature:'',
    fingerprint:{
      webdriver:false,
      languages:['en-US','en'],
      plugins:5,
      hardwareConcurrency:8,
      deviceMemory:8,
      maxTouchPoints:0,
      platform:'Windows',
      brands:[{brand:'Chromium',version:'137'},{brand:'Google Chrome',version:'137'}],
      mobile:false,
      timezone:'America/Los_Angeles',
      screen:{width:1920,height:1080,colorDepth:24,pixelRatio:1},
      visibilityState:'visible'
    },
    embedded:false,
    embedOrigin:'',
    sandboxed:false,
    turnstileToken:'',
    supportsEncryptedTransport:false,
    supportsEncryptedCapabilities:false,
    transportPublicKey:null,
    playerVersion:'mplayer-web-v2',
    playbackSessionVersion:2,
    capabilities:['hls','dash','codec-avc']
  };
  const sRes=await fetch(BASE+'/api/player/v2/session',{
    method:'POST',
    headers:{
      'User-Agent':UA,'Content-Type':'application/json','Accept':'application/json',
      'Origin':'https://noctratv.com','Referer':'https://noctratv.com/',
      ...(cookie?{'Cookie':cookie}:{})
    },
    body:JSON.stringify(payload)
  });
  const sj=await sRes.json().catch(()=>({}));
  console.log('SESSION status='+sRes.status+' success='+sj.success+' keys='+Object.keys(sj).join(',')+' mode='+(sj.mode||'')+' challengeRequired='+(sj.challengeRequired?1:0)+' error='+(sj.error||''));
  if(!sRes.ok||!sj.token)return;

  for(const source of ['site-streamvault-zoisite','site-streamvault-silver','site-streamvault-iron','site-streamvault-sunstone']){
    const body={
      codecCapabilities:{},
      type:'movie',
      tmdbId:'238',
      imdbId:'tt0068646',
      title:'The Godfather',
      releaseYear:1972
    };
    const r=await fetch(BASE+'/mplayer/'+source+'/resolve',{
      method:'POST',
      headers:{
        'User-Agent':UA,'Content-Type':'application/json','Accept':'application/json',
        'X-MZone-Playback-Lease':sj.token,
        'Origin':'https://noctratv.com','Referer':'https://noctratv.com/',
        ...(cookie?{'Cookie':cookie}:{})
      },
      body:JSON.stringify(body)
    });
    const t=await r.text();
    let j={};try{j=JSON.parse(t)}catch{}
    const result=j.result||{};
    const u=result.url||result.playlist||result.file||'';
    console.log('RESOLVE '+source+' status='+r.status+' success='+j.success+' server='+(j.server||result.server||'')+' type='+(result.type||result.format||'')+' url='+(u?new URL(u).hostname:'')+' err='+(j.error||''));
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
