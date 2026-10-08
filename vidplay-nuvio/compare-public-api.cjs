const urls=[
  ["YTHD_CURRENT_METADATA","https://data.vidsrc.sh/api.php?type=movie&imdb=tt5442430"],
  ["OLD_S2_METADATA","https://data.vidsrcme.ru/api.php?type=movie&tmdb=395992"]
];
(async()=>{
 for(const [name,url] of urls){
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(9500),headers:{
     "Accept":"application/json",
     "Referer":"https://stellarconductornexus.com/",
     "User-Agent":"Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"
   }});
   const t=await r.text();let x=null;try{x=JSON.parse(t)}catch(_){}
   console.log("PUBLIC_METADATA",JSON.stringify({name,status:r.status,contentType:r.headers.get("content-type"),json:!!x,keys:x?Object.keys(x):[],statusCode:x?.status_code,dataKeys:x?.data?Object.keys(x.data):[],containsStream:!!x?.data?.stream_urls,bodyLength:t.length}));
  }catch(e){console.log("PUBLIC_METADATA_ERROR",JSON.stringify({name,error:e.name+":"+e.message.slice(0,120)}))}
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
