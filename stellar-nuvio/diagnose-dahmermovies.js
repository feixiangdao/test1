const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36';
const API='https://a.111477.xyz';
const WORK='https://p.111477.xyz/bulk?u=';
function parseLinks(html){
 const out=[];const re=/<tr[^>]*>([\s\S]*?)<\/tr>/gi;let m;
 while((m=re.exec(html))){const row=m[1];const a=row.match(/<a[^>]*href=["']([^"']*)["'][^>]*>([^<]*)<\/a>/i);const s=row.match(/<td[^>]*>(\d+(?:\.\d+)?\s?[KMGT]B)<\/td>/i);if(a&&a[2]&&a[1]!=='../'&&/\.(mkv|mp4|avi|webm|m3u8)$/i.test(a[2]))out.push({href:a[1],text:a[2].trim(),size:s?s[1]:'N/A'})}
 return out;
}
(async()=>{
 console.log('=== DahmerMovies ===');
 const dir=API+'/movies/'+encodeURIComponent('Fight Club (1999)')+'/';
 try{
   const r=await fetch(dir,{headers:{'User-Agent':UA,Referer:API+'/'},redirect:'follow'});
   const html=await r.text();
   console.log('dir',r.status,r.url,r.headers.get('content-type'),'len',html.length,'prefix',html.slice(0,500).replace(/\s+/g,' '));
   const links=parseLinks(html);
   console.log('links',links.slice(0,10));
   for(const x of links.slice(0,5)){
     let direct=x.href.startsWith('http')?x.href:(x.href.startsWith('/')?API+x.href:dir+x.href);
     direct=decodeURI(direct.replace(/([^:]\/)\/+/g,'$1'));
     const worker=WORK+encodeURI(direct);
     for(const [label,url] of [['direct',direct],['worker',worker]]){
       try{
         const mr=await fetch(url,{headers:{'User-Agent':UA,Referer:API+'/',Range:'bytes=0-2047',Accept:'*/*'},redirect:'manual'});
         const buf=await mr.arrayBuffer();
         console.log(label,x.text,new URL(url).host,mr.status,mr.headers.get('content-type'),mr.headers.get('content-length'),'bytes',buf.byteLength,'location',mr.headers.get('location'));
       }catch(e){console.log(label,x.text,'error',e.message)}
     }
   }

   const tvdir=API+'/tvs/'+encodeURIComponent('Game of Thrones')+'/Season%2001/';
   const tr=await fetch(tvdir,{headers:{'User-Agent':UA,Referer:API+'/'},redirect:'follow'});
   const th=await tr.text();
   console.log('tvdir',tr.status,tr.url,'len',th.length,'links',parseLinks(th).slice(0,8));
 }catch(e){console.log('DahmerMovies error',e.stack||e.message)}
})();