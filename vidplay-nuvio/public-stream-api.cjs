const q=[
 ["CURRENT_IMDB","https://data.vidsrc.sh/api.php?type=movie&imdb=tt5442430&stream_urls"],
 ["CURRENT_TMDB","https://data.vidsrc.sh/api.php?type=movie&tmdb=395992&stream_urls"],
 ["LEGACY_TMDB","https://data.vidsrcme.ru/api.php?type=movie&tmdb=395992&stream_urls"]
];
(async()=>{
 for(const [label,url] of q){
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(10000),headers:{Accept:"application/json",Referer:"https://stellarconductornexus.com/","User-Agent":"Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36"}});
    const txt=await r.text();let j;try{j=JSON.parse(txt)}catch(e){}
    const s=j?.data?.stream_urls;const encrypted=typeof s==="string";const count=Array.isArray(s)?s.length:0;
    console.log("PUBLIC_STREAM_API",JSON.stringify({label,status:r.status,contentType:(r.headers.get("content-type")||"").split(";")[0],json:!!j,jsonKeys:j?Object.keys(j):[],statusCode:j?.status_code,dataKeys:j?.data?Object.keys(j.data):[],streamsPresent:!!s,encrypted,count,wasmReferencePresent:!!j?.vs?.wasm_url,responseBytes:txt.length,isChallenge:/Just a moment|cf-chl|Turnstile/i.test(txt)}));
  }catch(e){console.log("API_ERROR",JSON.stringify({label,name:e.name,message:e.message.slice(0,110)}))}
 }
})().catch(e=>{console.error(e.stack);process.exitCode=1});
