const UA='Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36';

async function hdghar(){
 console.log('\n=== HDGharTV ===');
 const base='https://hdghartv.cc/api';
 const headers={'User-Agent':UA,Accept:'application/json, */*',Referer:'https://hdghartv.cc/'};
 try{
   const sr=await fetch(base+'/search?q='+encodeURIComponent('Fight Club'),{headers});
   const st=await sr.text(); console.log('search',sr.status,st.slice(0,1200));
   let sj=null;try{sj=JSON.parse(st)}catch(_){}
   const rows=(sj&&sj.movies)||[];
   const hit=rows.find(x=>String(x.title||'').toLowerCase().includes('fight club'))||rows[0];
   console.log('movie hit',hit&&{id:hit._id,title:hit.title});
   if(hit&&hit._id){
     const mr=await fetch(base+'/movies/public/'+encodeURIComponent(hit._id),{headers});
     const mt=await mr.text();console.log('movie',mr.status,mt.slice(0,1800));
     let mj=null;try{mj=JSON.parse(mt)}catch(_){}
     const links=(mj&&mj.streamingLinks)||[];
     for(const l of links.slice(0,5)){
       if(!l||!l.url)continue;
       try{
         const r=await fetch(l.url,{headers:{...headers,Range:'bytes=0-2047'},redirect:'manual'});
         console.log('media',l.quality,l.isActive,new URL(l.url).host,r.status,r.headers.get('content-type'),r.headers.get('content-length'));
         await r.arrayBuffer();
       }catch(e){console.log('media error',l.quality,e.message)}
     }
   }

   const tr=await fetch(base+'/search?q='+encodeURIComponent('Game of Thrones'),{headers});
   const tt=await tr.text();let tj=null;try{tj=JSON.parse(tt)}catch(_){}
   const series=(tj&&tj.series)||[];
   const thit=series.find(x=>String(x.title||'').toLowerCase().includes('game of thrones'))||series[0];
   console.log('tv hit',thit&&{id:thit._id,title:thit.title});
   if(thit&&thit._id){
     const rr=await fetch(base+'/series/public/'+encodeURIComponent(thit._id),{headers});
     const rt=await rr.text();console.log('tv detail',rr.status,rt.slice(0,2200));
   }
 }catch(e){console.log('HDGharTV error',e.stack||e.message)}
}

async function netmirror(){
 console.log('\n=== NetMirror ===');
 const base='https://net27.cc';
 const headers={Accept:'application/json, text/plain, */*',Referer:base+'/','User-Agent':UA,'Accept-Language':'en-US,en;q=0.9'};
 for(const [label,url] of [
   ['movie',base+'/api/embed-tmdb/550'],
   ['tv',base+'/api/embed-tmdb/1399?type=tv&se=1&ep=1']
 ]){
   try{
     const r=await fetch(url,{headers});
     const t=await r.text();console.log(label,r.status,r.headers.get('content-type'),'len',t.length,t.slice(0,2200));
     let j=null;try{j=JSON.parse(t)}catch(_){}
     const urls=[];
     if(j&&Array.isArray(j.streams))for(const s of j.streams){if(s&&s.url)urls.push(s.url)}
     if(j&&j.mp4)urls.push(j.mp4);
     for(const u of urls.slice(0,5)){
       try{
         const mr=await fetch(u,{headers:{'User-Agent':UA,Referer:'https://videodownloader.site/',Range:'bytes=0-2047'},redirect:'manual'});
         console.log('media',label,new URL(u).host,mr.status,mr.headers.get('content-type'),mr.headers.get('content-length'),mr.headers.get('location'));
         await mr.arrayBuffer();
       }catch(e){console.log('media error',label,e.message)}
     }
   }catch(e){console.log(label,'error',e.message)}
 }
}

(async()=>{await hdghar();await netmirror();})().catch(e=>{console.error(e);process.exit(1)});
