// focused-probe-trigger
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
 const r=await fetch(BASE+path,{headers:H});
 const t=await r.text();
 console.log('HTTP',r.status,path,'len',t.length);
 if(!r.ok)throw new Error('HTTP '+r.status+' '+t.slice(0,200));
 return dec(t);
}
function norm(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'')}
(async()=>{
 console.log('=== OneTouchTV ===');
 try{
   const search=await enc('/vod/search?keyword='+encodeURIComponent('Fight Club'));
   console.log('search count',Array.isArray(search)?search.length:null,JSON.stringify(search).slice(0,3500));
   const candidates=(Array.isArray(search)?search:[]).filter(x=>norm(x.title)==='fightclub');
   const hit=candidates.find(x=>String(x.year||'').includes('1999'))||candidates[0];
   console.log('chosen',hit&&{id:hit.id,title:hit.title,year:hit.year,type:hit.type});
   if(!hit)return;
   const det=await enc('/vod/'+encodeURIComponent(hit.id)+'/detail');
   console.log('detail',JSON.stringify(det).slice(0,4000));
   const ep=det&&Array.isArray(det.episodes)?det.episodes[0]:null;
   console.log('episode',ep);
   if(!ep)return;
   const sd=await enc('/vod/'+encodeURIComponent(hit.id)+'/episode/'+encodeURIComponent(ep.playId));
   console.log('streamData',JSON.stringify(sd).slice(0,5000));
   const srcs=(sd&&sd.sources)||[];
   for(const s of srcs.slice(0,8)){
     if(!s||!s.url)continue;
     try{
       const r=await fetch(s.url,{headers:{'User-Agent':'Mozilla/5.0','Referer':BASE+'/',Range:'bytes=0-2047'},redirect:'manual'});
       const ct=r.headers.get('content-type');
       const body=await r.text();
       console.log('media',s.name,s.quality,s.type,new URL(s.url).host,r.status,ct,'prefix',body.slice(0,150).replace(/\s+/g,' '));
     }catch(e){console.log('media error',s.name,e.message)}
   }

   const tvs=await enc('/vod/search?keyword='+encodeURIComponent('Game of Thrones'));
   const tvhit=(Array.isArray(tvs)?tvs:[]).find(x=>norm(x.title)==='gameofthrones'&&String(x.type||'').toLowerCase()!=='movie')||(Array.isArray(tvs)?tvs[0]:null);
   console.log('tv chosen',tvhit&&{id:tvhit.id,title:tvhit.title,year:tvhit.year,type:tvhit.type});
   if(tvhit){
     const td=await enc('/vod/'+encodeURIComponent(tvhit.id)+'/detail');
     console.log('tv detail episodes',td&&td.episodes&&td.episodes.slice(0,5));
     const tep=td&&Array.isArray(td.episodes)?td.episodes.find(x=>parseInt(x.episode,10)===1):null;
     if(tep){
       const ts=await enc('/vod/'+encodeURIComponent(tvhit.id)+'/episode/'+encodeURIComponent(tep.playId));
       console.log('tv streamData',JSON.stringify(ts).slice(0,3500));
     }
   }
 }catch(e){console.log('OneTouchTV error',e.stack||e.message)}
})();