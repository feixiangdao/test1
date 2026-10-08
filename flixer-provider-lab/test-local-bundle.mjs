import {readFile} from "node:fs/promises";
import vm from "node:vm";
import crypto from "node:crypto";
const source=await readFile("/tmp/flixer-local-candidate.js","utf8");
const fixture=JSON.parse(await readFile("/tmp/flixer-fixture.json","utf8"));
if(!/^[a-f0-9]{64}$/i.test(fixture.suppliedKey)||typeof fixture.body!=="string"||fixture.body.length<100)throw Error("INVALID_TEMPORARY_FIXTURE");
const requests=[];
const sandbox={
  console,Date,Math,Promise,Uint8Array,Uint16Array,Uint32Array,Int32Array,Float32Array,Float64Array,
  ArrayBuffer,DataView,Object,Array,String,Number,Boolean,RegExp,JSON,Error,TypeError,
  module:{exports:{}},setTimeout,clearTimeout,
  fetch:async (url,opt)=>{
    requests.push({url,headers:opt?.headers||{}});
    if(url.includes("/api/time"))return {ok:true,status:200,json:async()=>({timestamp:Math.floor(Date.now()/1000)})};
    if(url.includes("/api/tmdb/movie/9502/images"))return {ok:true,status:200,text:async()=>fixture.body};
    throw Error("Unexpected local provider fetch");
  }
};
sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{timeout:30000,filename:"flixer-local-candidate.js"});
if(typeof sandbox.process_img_data!=="function")throw Error("NO_LOCAL_DECODER");
const actual=JSON.parse(sandbox.process_img_data(fixture.body,fixture.suppliedKey));
const sources=Array.isArray(actual.sources)?actual.sources:[];
if(!sources.some(x=>typeof x.url==="string"&&x.url.startsWith("https://")))throw Error("LOCAL_DECRYPT_NO_MEDIA");
console.log("SINGLEFILE_LIVE_CIPHER_DECRYPT_PASS",{sources:sources.length,mediaUrls:sources.filter(x=>!!x.url).length});
if(typeof sandbox.get_img_key!=="function")throw Error("NO_LOCAL_KEYGEN");
const key=sandbox.get_img_key();
if(typeof key!=="string"||key.length!==64)throw Error("LOCAL_KEYGEN_MISSING");
console.log("SINGLEFILE_KEYGEN_PASS",{length:key.length});
sandbox.get_img_key=()=>fixture.suppliedKey;
const streamList=await sandbox.module.exports.getStreams("9502","movie");
if(!Array.isArray(streamList)||streamList.length!==1||!streamList[0].url||streamList[0].quality!=="Auto")throw Error("NO_NUVIO_STREAM");
if(streamList[0].url!==sources.find(x=>!!x.url)?.url)throw Error("MISMATCH_MEDIA_URL");
const headers=requests.find(x=>x.headers["X-Server"]==="alpha")?.headers;
if(!headers)throw Error("MISSING_ALPHA_REQUEST");
const key2=headers["X-Api-Key"],ts=headers["X-Request-Timestamp"],nonce=headers["X-Request-Nonce"];
const path="/api/tmdb/movie/9502/images";
const expected=crypto.createHmac("sha256",key2).update(key2+":"+ts+":"+nonce+":"+path).digest("base64");
if(headers["X-Request-Signature"]!==expected)throw Error("INVALID_HTTP_HMAC");
console.log("SINGLEFILE_GETSTREAMS_PASS",{streams:streamList.length,quality:streamList[0].quality,type:streamList[0].type,requests:requests.length,hmacValid:true});
