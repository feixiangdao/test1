// V1 diagnostics only: check whether the public V1 WASM is stable enough
// to decode the current encrypted response without binary fetch on Android.
// Never log signed URLs, API tokens or decrypted stream URLs.
const crypto=require("node:crypto");
const vm=require("node:vm");
const fs=require("node:fs");
const code=fs.readFileSync("vidplay-nuvio/providers/vidplay.js","utf8");
const sandbox={module:{exports:{}},console,fetch,Promise,Uint8Array,ArrayBuffer,URL,encodeURIComponent,decodeURIComponent,escape,unescape,setTimeout,clearTimeout};
vm.createContext(sandbox);vm.runInContext(code,sandbox);
const sha=x=>crypto.createHash("sha256").update(x).digest("hex").slice(0,16);
const H={"User-Agent":"Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/139.0.0.0 Mobile Safari/537.36"};
async function get(url,ref){let r=await fetch(url,{headers:{...H,"Referer":ref||"https://ythd.org/"},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error("HTTP "+r.status+" "+new URL(url).host);return r;}
async function sample(movie){
 let meta=await (await get("https://data.vidsrc.sh/api.php?type=movie&tmdb="+movie)).json();
 let imdb=meta?.data?.imdb_id;
 let outer="https://ythd.org/embed/"+imdb;
 await get(outer);
 let src=await(await get("https://ythd.org/vs_src.php?type=movie&id="+imdb,outer)).json();
 let landing=src.src;
 let first=await(await get(landing,outer)).text();
 let c1=sandbox.parseInlineConfig(first,"CFG");
 let inner=sandbox.asHttpUrl(c1.playerUrl,landing);
 let html=await(await get(inner,landing)).text();
 let cfg=sandbox.parseInlineConfig(html,"CONFIG");
 let api=sandbox.playerAPIURL(cfg.api,cfg.apiToken,inner);
 let body=await(await get(api,inner)).json();
 if(!body?.vs?.wasm_url||!body?.data?.stream_urls)throw Error("Missing media data");
 const wasmUrl=body.vs.wasm_url;
 let bytes=Buffer.from(await(await get(wasmUrl,inner)).arrayBuffer());
 let decrypted=sandbox.s2DecryptUrls(body.data.stream_urls,new Uint8Array(bytes));
 if(!decrypted.length)throw Error("No stream URLs after decrypt");
 return {movie,imdb, wasm:bytes, enc:body.data.stream_urls, wasmUrl,checksum:sha(bytes),wasmLength:bytes.length,encryptedHash:sha(body.data.stream_urls), wasmParams:Array.from(new URL(wasmUrl).searchParams.keys()),cipherLen:body.data.stream_urls.length, count:decrypted.length, host:new URL(decrypted[0]).host};
}
(async()=>{
 let arr=[];
 for(let movie of [395992,395992,9502,9502]){
  try{let z=await sample(movie);arr.push(z);console.log("WASM_SAMPLE",JSON.stringify({movie:z.movie,checksum:z.checksum,wasmLen:z.wasmLength,cipherHash:z.encryptedHash,cipherLen:z.cipherLen,params:z.wasmParams,count:z.count,host:z.host}));}
  catch(e){console.log("SAMPLE_ERROR",movie,String(e.message).slice(0,200));}
 }
 for(let i=0;i<arr.length;i++)for(let j=0;j<arr.length;j++){
  if(i===j)continue;
  let ok=false;
  try{const out=sandbox.s2DecryptUrls(arr[i].enc,new Uint8Array(arr[j].wasm));ok=out.length>0&&out.every(x=>x.startsWith("https://"))}catch(e){}
  console.log("CROSS_DECRYPT",JSON.stringify({cipherMovie:arr[i].movie,keyWasmMovie:arr[j].movie,sameWasm:arr[i].checksum===arr[j].checksum,success:ok}))
 }
 if(arr.length<4)throw Error("Not enough WASM samples to trust stable key");
 const keys=arr.map(x=>sandbox.s2RecoverKey(new Uint8Array(x.wasm),sandbox.s2Base64Bytes(x.enc)));
 const hex=keys.map(k=>k.map(v=>v.toString(16).padStart(8,"0")));
 if(!hex.every(z=>JSON.stringify(z)===JSON.stringify(hex[0])))throw Error("Stable WASM binary did not yield a stable ChaCha key");
 function decodeWithKey(b64,key){
   var enc=sandbox.s2Base64Bytes(b64),nonce=[sandbox.s2Rd32(enc,0),sandbox.s2Rd32(enc,4),sandbox.s2Rd32(enc,8)];
   var ct=enc.slice(12),out=new Uint8Array(ct.length);
   for(var b=0;b<Math.ceil(ct.length/64);b++){
     var ks=sandbox.s2ChaChaBlock(key,b,nonce);
     for(var j=0;j<64&&b*64+j<ct.length;j++)out[b*64+j]=ct[b*64+j]^ks[j];
   }
   return sandbox.s2Utf8(out).split(/\r?\n/).filter(x=>/^https?:\/\//.test(x));
 }
 const directSuccess=arr.every((x,i)=>{
   let derived=decodeWithKey(x.enc,keys[0]);
   let original=sandbox.s2DecryptUrls(x.enc,new Uint8Array(x.wasm));
   return JSON.stringify(derived)===JSON.stringify(original)&&derived.length>=1;
 });
 if(!directSuccess)throw Error("Hardcoded-key decryption mismatched public WASM output");
 console.log("STATIC_KEY_VERIFIED",JSON.stringify({wasmSha256Prefix:arr[0].checksum,keyWordsHex:hex[0],numberOfSamples:arr.length,allCrossDecrypted:true}));
 
})().catch(e=>{console.error(e);process.exitCode=1});
