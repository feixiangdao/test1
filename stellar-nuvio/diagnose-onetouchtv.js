const crypto=require('crypto');
const BASE='https://api3.devcorp.me';
const KEY=Buffer.from('im72charPasswordofdInitVectorStm','utf8');
const IV=Buffer.from('im72charPassword','utf8');
const H={'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36','Referer':'https://onetouchtv.xyz/'};

function dec(s){
 s=String(s||'').replace(/-_\./g,'/').replace(/@/g,'+').replace(/\s+/g,'');
 while(s.length%4)s+='=';
 const d=crypto.createDecipheriv('aes-256-cbc',KEY,IV);
 return JSON.parse(Buffer.concat([d.update(Buffer.from(s,'base64')),d.final()]).toString('utf8')).result;
}
async function enc(path){
 const r=await fetch(BASE+path,{headers:H,signal:AbortSignal.timeout(15000)});
 const t=await r.text();
 console.log('HTTP',r.status,path,'len',t.length);
 if(!r.ok)throw new Error('HTTP '+r.status+' '+t.slice(0,160));
 return dec(t);
}
function norm(v){return String(v||'').toLowerCase().replace(/\s*\((?:19|20)\d{2}\)\s*$/,'').replace(/[^a-z0-9]+/g,'')}
async function inspect(query,wanted){
 console.log('\n===',query,'===');
 const rows=await enc('/vod/search?keyword='+encodeURIComponent(query));
 console.log('SEARCH',JSON.stringify((rows||[]).slice(0,12),null,2));
 const hit=(rows||[]).find(x=>norm(x.title)===norm(wanted));
 console.log('CHOSEN',hit&&{id:hit.id,title:hit.title,year:hit.year,type:hit.type});
 if(!hit)return;
 const d=await enc('/vod/'+encodeURIComponent(hit.id)+'/detail');
 console.log('EPISODES',JSON.stringify(d&&d.episodes,null,2));
 const ep=(d&&Array.isArray(d.episodes)?d.episodes:[]).find(x=>Number(x&&x.episode)===1);
 console.log('EP1',ep);
 if(!ep||ep.playId==null)return;
 const data=await enc('/vod/'+encodeURIComponent(hit.id)+'/episode/'+encodeURIComponent(ep.playId));
 console.log('SOURCES',JSON.stringify(data&&data.sources,null,2));
 for(const src of (data&&data.sources||[]).slice(0,4)){
  if(!src||!src.url)continue;
  try{
   const r=await fetch(src.url,{headers:{'User-Agent':'Mozilla/5.0','Referer':BASE+'/',Range:'bytes=0-2047'},redirect:'manual',signal:AbortSignal.timeout(15000)});
   const b=Buffer.from(await r.arrayBuffer());
   console.log('MEDIA',src.name,src.quality,src.type,r.status,r.headers.get('content-type'),new URL(src.url).host,b.subarray(0,140).toString('utf8').replace(/\s+/g,' '));
  }catch(e){console.log('MEDIA ERR',e.message)}
 }
}
(async()=>{
 await inspect('Squid Game Season 2','Squid Game Season 2');
 await inspect('Squid Game Season 3','Squid Game Season 3');
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
