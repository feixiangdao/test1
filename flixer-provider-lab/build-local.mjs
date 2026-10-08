// Build a standalone JavaScript proof-of-concept from public wasm-bindgen glue
// and Binaryen wasm2js output. Research only: not enabled in Nuvio.
import {readFile,writeFile} from "node:fs/promises";

const glue = await readFile("/tmp/flixer-img-data.js","utf8");
const translated = await readFile("/tmp/flixer-wasm-translation.mjs","utf8");
const importText = "import * as wbg from 'wbg';";
if(!translated.includes(importText)) throw new Error("Unsupported translated import structure");
const exportStart = translated.lastIndexOf("\nexport var memory = ");
if(exportStart<0) throw new Error("No translated export marker");
const nativeShim = translated.slice(0,exportStart).replace(importText,`var __flixerWbgRaw = __wbg_get_imports().wbg;
globalThis.__FLIXER_WBG_CALLS = [];
var wbg = {};
Object.keys(__flixerWbgRaw).forEach(function(k){
 var v=__flixerWbgRaw[k];
 wbg[k]=typeof v==="function" ? function(){
  globalThis.__FLIXER_WBG_CALLS.push(k);
  return v.apply(this, arguments);
 } : v;
});`);
if(!glue.includes("function __wbg_get_imports()")) throw new Error("Missing glue import factory");
const assembled = glue + "\n// wasm2js translation starts here\n" + nativeShim +
 "\nwasm = retasmFunc;\n" +
 "\nexport const _local_asm_exports = Object.keys(retasmFunc);\n";
const file="/tmp/flixer-standalone.mjs";
await writeFile(file,assembled);
console.log("LOCAL_BUNDLE_CREATED",JSON.stringify({bytes:assembled.length,glueBytes:glue.length,wasm2jsBytes:translated.length,hasBareWbgImport:/import\s+\*\s+as\s+wbg/.test(assembled)}));
const env = globalThis;
const store={};
class WindowShim {}
class CanvasRenderingContext2DShim {
  constructor(){this.font="12px sans-serif";this.textBaseline="top"}
  fillText(){}
}
class HTMLCanvasElementShim {
  constructor(){this.width=250;this.height=200;this.tagName="CANVAS";}
  getContext(){return new CanvasRenderingContext2DShim();}
  toDataURL(){return "data:image/png;base64,"+"AAAA".repeat(50);}
  setAttribute(){}
  getAttribute(){return null;}
}
env.Window=WindowShim;
env.HTMLCanvasElement=HTMLCanvasElementShim;
env.CanvasRenderingContext2D=CanvasRenderingContext2DShim;
const win=new WindowShim();
env.window=win;
env.self=win;
env.screen={width:1365,height:900,colorDepth:24};
const nav={userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",platform:"Win32",language:"en-US"};
Object.defineProperty(env,"navigator",{configurable:true,value:nav});
env.localStorage={getItem:k=>store[k]||null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
env.document={
  getElementsByTagName:tag=>{console.log("LOCAL_DOM_GET_TAGS",tag);return tag==="script"?Array.from({length:5},()=>({src:"https://flixer.su/assets/js/index-52585954.js"})):[]},
  createElement:tag=>tag==="canvas" ? new HTMLCanvasElementShim() : ({tagName:tag.toUpperCase()})
};
Object.assign(win,{window:win,self:win,screen:env.screen,navigator:nav,localStorage:env.localStorage,document:env.document,performance:env.performance});

try{
 const local=await import("file:///tmp/flixer-standalone.mjs");
 console.log("LOCAL_BUNDLE_IMPORT_PASS",JSON.stringify({exports:Object.keys(local).slice(0,12),wasmExports:local._local_asm_exports.slice(0,15)}));
 try{
  const v=await local.get_img_key();
  console.log("LOCAL_GET_IMG_KEY_RESULT",JSON.stringify({type:typeof v,length:typeof v==="string"?v.length:-1,keyLooksValid:typeof v==="string"&&v.length===64}));
 }catch(e){ console.log("LOCAL_GET_IMG_KEY_ERROR",String(e).slice(0,600));console.log("LOCAL_WBG_IMPORT_TRACE",JSON.stringify(globalThis.__FLIXER_WBG_CALLS.slice(-65))); }
}catch(e){
 console.error("LOCAL_BUNDLE_IMPORT_FAILED",String(e),e?.stack?.slice(0,1200));
 process.exitCode=1;
}
