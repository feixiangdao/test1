// Browser smoke test, no credentials or downloads.
const {spawn,execFileSync}=require('node:child_process');
const {mkdtempSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
 let exe;
 for(const x of ['google-chrome','chromium','chromium-browser']){
  try {exe=execFileSync('which',[x],{encoding:'utf8'}).trim();break}catch(_){}
 }
 if(!exe){console.log('CHROME_MISSING');return}
 console.log('BROWSER',exe,execFileSync(exe,['--version'],{encoding:'utf8'}).trim());
 const cp=spawn(exe,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=9229','--no-first-run','--no-default-browser-check','--user-data-dir='+mkdtempSync(path.join(tmpdir(),'flixer-chrome-')),'about:blank'],{stdio:'ignore'});
 let list=null;
 for(let i=0;i<35;i++){try{const r=await fetch('http://127.0.0.1:9229/json/list');list=await r.json();if(list?.find(x=>x.type==='page'))break}catch(_){}await sleep(200)}
 const target=list?.find(x=>x.type==='page');
 if(!target)throw Error('CDP target unavailable');
 const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let index=0,requests=[];
 await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
 ws.addEventListener('message',ev=>{
  let msg;try{msg=JSON.parse(ev.data)}catch{return}
  if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id); msg.error?p.reject(new Error(JSON.stringify(msg.error))):p.resolve(msg.result)}} 
  if(msg.method==='Network.responseReceived' && /\/api\/tmdb\/|\/assets\/client\/|\/assets\/wasm\/|\/api\/time/.test(msg.params.response.url)){
    const u=msg.params.response.url;
    if(requests.length<45){requests.push({status:msg.params.response.status,resource: u.replace(/https?:\/\/[^/]+/,''),type:msg.params.response.mimeType})}
  }
 });
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++index;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error(method+' timeout'))}},85000)});
 await call('Runtime.enable');await call('Page.enable');await call('Network.enable');
 await call('Page.navigate',{url:'https://flixer.su/watch/movie/550'});
 await sleep(6000);
 const ev=async(expr,timeout=70000)=>{
  const val=await call('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true,timeout,generatePreview:false});
  if(val.exceptionDetails) return {exception:val.exceptionDetails.text||val.exceptionDetails.exception?.description};
  return val.result?.value;
 };
 console.log('PAGE',JSON.stringify(await ev('({title:document.title,url:location.href,clientLoaded:!!window.__TMDB_CLIENT_MODULES__,videoCount:document.querySelectorAll("video").length})')));
 const result=await ev("(async()=>{const m=await import('https://plsdontscrapemelove.flixer.su/assets/client/tmdb-poster-utils.js');const v=await m.getMoviePosterData('550');const servers=v?.poster_sources||{};return {count:Object.keys(servers).length,results:Object.entries(servers).slice(0,26).map(([k,v])=>({name:k,available:!!(v?.url||v?.file),kind:typeof v,host:(()=>{try{return new URL(v?.url||v?.file||\"\").hostname}catch{return\"\"}})()}))}})()");

 console.log('MOVIE',JSON.stringify(result));
 console.log('NETWORK',JSON.stringify(requests));
 ws.close();cp.kill('SIGTERM');
}
main().catch(e=>{console.log('ERROR',e.message);process.exitCode=1});