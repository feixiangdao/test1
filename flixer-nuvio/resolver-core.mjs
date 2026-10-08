// Standalone Flixer resolver (experimental).
// Uses publicly served WASM client assets in a server-side Node.js runtime.
import {createHmac,randomBytes} from 'node:crypto';
const ORIGIN='https://plsdontscrapemelove.flixer.su';
const SITE='https://flixer.su/';
let clientPromise=null;
const str=x=>x==null?'':String(x);
const get=async(url,headers={},ms=12000)=>fetch(url,{headers,signal:AbortSignal.timeout(ms),redirect:'follow'});
async function client(){
 if(clientPromise)return clientPromise;
 clientPromise=(async()=>{
  const [js,w]=await Promise.all([
    get(ORIGIN+'/assets/wasm/img_data.js'),
    get(ORIGIN+'/assets/wasm/img_data_bg.wasm')
  ]);
  if(!js.ok||!w.ok)throw Error('Flixer WASM assets unavailable');
  const source=await js.text(),binary=new Uint8Array(await w.arrayBuffer());
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  console.log('PHASE wasm init start'); await module.default({module_or_path:binary});console.log('PHASE wasm init ok');
  console.log('PHASE key start');const key=module.get_img_key();console.log('PHASE key ok', typeof key,str(key).length);
  if(!/^[0-9a-f]{64}$/i.test(str(key)))throw Error('Flixer WASM returned invalid signing key');
  return{module,key};
 })().catch(e=>{clientPromise=null;throw e});
 return clientPromise;
}
async function timestamp(){
 try{const r=await get(ORIGIN+'/api/time?t='+Date.now(),{},6000);const j=await r.json();if(r.ok&&Number(j.timestamp)>0)return Math.floor(Number(j.timestamp))}catch(_){}
 return Math.floor(Date.now()/1000);
}
async function signature(key,url){
 const t=String(await timestamp()),nonce=randomBytes(16).toString('base64').replace(/[/+=]/g,'').substring(0,22);
 const pathname=new URL(url).pathname;
 return {
  'X-Api-Key':key,'X-Request-Timestamp':t,'X-Request-Nonce':nonce,
  'X-Request-Signature':createHmac('sha256',key).update(key+':'+t+':'+nonce+':'+pathname).digest('base64'),
  'X-Client-Fingerprint':'nuvio-browser-'+randomBytes(5).toString('hex')
 };
}
function endpoint(type,id,season,episode){
 if(!/^\d{1,12}$/.test(str(id)))throw Error('Invalid TMDB id');
 if(type==='tv'){
  if(!/^\d{1,4}$/.test(str(season))||!/^\d{1,4}$/.test(str(episode)))throw Error('Invalid season/episode');
  return ORIGIN+'/api/tmdb/tv/'+id+'/season/'+season+'/episode/'+episode+'/images'
 }
 return ORIGIN+'/api/tmdb/movie/'+id+'/images'
}
function names(result){
 if(result&&Array.isArray(result.sources))return [...new Set(result.sources.map(x=>str(x&&x.server).toLowerCase()).filter(Boolean))];
 if(result&&result.servers&&typeof result.servers==='object')return Object.keys(result.servers);
 return[];
}
function mediaFrom(result,server){
 let matches=Array.isArray(result?.sources)?result.sources:[];
 const obj=matches.find(x=>str(x?.server).toLowerCase()===str(server).toLowerCase()&&x?.url)
   ||matches.find(x=>typeof x?.url==='string'&&x.url);
 const s=obj?.url||result?.sources?.file||result?.sources?.url;
 return /^https?:\/\//.test(str(s))?s:null;
}
async function query(module,key,url,extra){
 const signed=await signature(key,url);
 const response=await get(url,{Accept:'text/plain',Origin:SITE.slice(0,-1),Referer:SITE,'User-Agent':'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/148 Mobile Safari/537.36',...signed,...extra},13000);
 if(!response.ok)throw Error('Flixer HTTP '+response.status);
 const payload=await response.text();console.log('PHASE encrypted response',response.status,payload.length);
 console.log('PHASE decode start');const decrypted=await module.process_img_data(payload,key);console.log('PHASE decode ok');
 return JSON.parse(decrypted);
}
export async function resolveFlixer(id,type='movie',season=1,episode=1){
 const {module,key}=await client(),url=endpoint(type,id,season,episode);
 console.log('PHASE roster start',type,id);const roster=await query(module,key,url,{'bW90aGFmYWth':'1'});console.log('PHASE roster ok');
 const available=names(roster),out=[];
 for(const server of available.slice(0,15)){
  try{
   const data=await query(module,key,url,{'X-Only-Sources':'1','X-Server':server});
   const link=mediaFrom(data,server);
   if(link){out.push({url:link,server});break}
  }catch(_){}
 }
 return{servers:available,streams:out};
}
