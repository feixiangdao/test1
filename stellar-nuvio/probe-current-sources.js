const crypto=require('crypto');

const UA='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36';

async function probeZxc(){
  console.log('\n=== ZXC new frontend discovery ===');
  const base='https://player.zxcprime.xyz';
  const r=await fetch(base+'/',{headers:{'User-Agent':UA,Accept:'text/html,*/*'},redirect:'follow'});
  const html=await r.text();
  console.log('HOME',r.status,r.url,r.headers.get('content-type'),'len',html.length);
  const srcs=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]);
  console.log('SCRIPTS',srcs.length,srcs.slice(0,30));
  const js=[];
  for(const src of srcs.slice(0,40)){
    const u=new URL(src,base).href;
    try{
      const rr=await fetch(u,{headers:{'User-Agent':UA,Referer:base+'/'},signal:AbortSignal.timeout(15000)});
      const t=await rr.text();
      console.log('JS',rr.status,u,'len',t.length);
      if(rr.ok&&t.length)js.push({u,t});
    }catch(e){console.log('JS ERR',u,e.message)}
  }
  const needles=[
    'backend/token','backend_/servers','/backend','/api/','/api','token',
    'icarus','berkas','orion','athena','tmdb','imdb','zxcstream','zxcprime',
    'player/movie','player/tv','servers/'
  ];
  for(const {u,t} of js){
    let printed=false;
    for(const n of needles){
      let pos=0,count=0;
      while((pos=t.toLowerCase().indexOf(n.toLowerCase(),pos))>=0&&count<4){
        if(!printed){console.log('\nCHUNK',u);printed=true;}
        console.log('HIT',n,'@',pos, t.slice(Math.max(0,pos-260),Math.min(t.length,pos+520)).replace(/\s+/g,' '));
        pos+=n.length; count++;
      }
    }
  }
  const urls=new Set();
  for(const {t} of js){
    for(const m of t.matchAll(/https?:\\/\\/[^"'\\s)\\]}]+/g)) urls.add(m[0]);
  }
  console.log('\nABS URLS', [...urls].filter(x=>/zxc|api|stream|cdn|movie|video/i.test(x)).slice(0,100));
}

const O_BASE='https://api3.devcorp.me';
const O_KEY=Buffer.from('im72charPasswordofdInitVectorStm','utf8');
const O_IV=Buffer.from('im72charPassword','utf8');
const O_H={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36','Referer':'https://onetouchtv.xyz/'};

function dec(s){
  s=String(s||'').replace(/-_\./g,'/').replace(/@/g,'+').replace(/\s+/g,'');
  while(s.length%4)s+='=';
  const d=crypto.createDecipheriv('aes-256-cbc',O_KEY,O_IV);
  return JSON.parse(Buffer.concat([d.update(Buffer.from(s,'base64')),d.final()]).toString('utf8')).result;
}
async function enc(path){
  const r=await fetch(O_BASE+path,{headers:O_H,signal:AbortSignal.timeout(15000)});
  const t=await r.text();
  if(!r.ok)throw new Error('HTTP '+r.status+' '+t.slice(0,200));
  return dec(t);
}
function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'')}

async function testOneTouchTitle(title,expectedType){
  try{
    const rows=await enc('/vod/search?keyword='+encodeURIComponent(title));
    const arr=Array.isArray(rows)?rows:[];
    console.log('\nOT SEARCH',title,'count',arr.length,arr.slice(0,8).map(x=>({id:x.id,title:x.title,year:x.year,type:x.type})));
    const exact=arr.filter(x=>norm(x.title)===norm(title));
    const hit=exact.find(x=>expectedType==='movie'?String(x.type).toLowerCase()==='movie':String(x.type).toLowerCase()!=='movie')||exact[0]||arr[0];
    if(!hit){console.log('OT NO HIT',title);return;}
    console.log('OT CHOSEN',title,{id:hit.id,title:hit.title,year:hit.year,type:hit.type});
    const detail=await enc('/vod/'+encodeURIComponent(hit.id)+'/detail');
    const eps=detail&&Array.isArray(detail.episodes)?detail.episodes:[];
    console.log('OT DETAIL',title,'episodes',eps.length,'first',eps.slice(0,3));
    const ep=expectedType==='movie'?eps[0]:eps.find(x=>parseInt(x.episode,10)===1)||eps[0];
    if(!ep||!ep.playId){console.log('OT NO EP',title);return;}
    const sd=await enc('/vod/'+encodeURIComponent(hit.id)+'/episode/'+encodeURIComponent(ep.playId));
    const srcs=sd&&Array.isArray(sd.sources)?sd.sources:[];
    console.log('OT SOURCES',title,srcs.map(x=>({name:x.name,quality:x.quality,type:x.type,host:(()=>{try{return new URL(x.url).host}catch(_){return''}})()})));
    for(const x of srcs.slice(0,3)){
      if(!x||!x.url)continue;
      try{
        const r=await fetch(x.url,{headers:{'User-Agent':'Mozilla/5.0','Referer':O_BASE+'/',Range:'bytes=0-4095'},redirect:'manual',signal:AbortSignal.timeout(15000)});
        const b=Buffer.from(await r.arrayBuffer());
        console.log('OT MEDIA',title,x.quality,r.status,r.headers.get('content-type'),new URL(x.url).host,b.subarray(0,100).toString('utf8').replace(/\s+/g,' '));
      }catch(e){console.log('OT MEDIA ERR',title,e.message)}
    }
  }catch(e){console.log('OT ERROR',title,e.stack||e.message)}
}

async function probeOneTouch(){
  console.log('\n=== OneTouchTV coverage ===');
  for(const [t,k] of [
    ['Avatar','movie'],
    ['Inception','movie'],
    ['Titanic','movie'],
    ['Avengers','movie'],
    ['Game of Thrones','tv'],
    ['Breaking Bad','tv'],
    ['The Walking Dead','tv'],
    ['Squid Game','tv']
  ]) await testOneTouchTitle(t,k);
}

(async()=>{await probeZxc();await probeOneTouch();})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
