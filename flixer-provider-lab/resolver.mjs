// Flixer Alpha resolver proof of concept.
// A persistent Node service is required; GitHub Actions only runs its test suite.
// Never deploy as an unauthenticated, unbounded public endpoint.
import { createServer } from "node:http";
import { chromium } from "playwright";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || "8833");
const TOKEN = process.env.RESOLVER_TOKEN || "";
const MAX_WAIT_MS = Math.max(3000, Math.min(25000, Number(process.env.MAX_WAIT_MS || "18000")));
const TTL_MS = 2 * 60 * 1000;
const cache = new Map();
let active = 0;
async function publicDnsA(hostname) {
  try {
    const r = await fetch("https://dns.google/resolve?name=" + encodeURIComponent(hostname) + "&type=A&cd=true", {
      signal: AbortSignal.timeout(7000)
    });
    if (!r.ok) return null;
    const data=await r.json();
    const a=(data.Answer || []).find(x=>x.type===1 && /^\\d{1,3}(\\.\\d{1,3}){3}$/.test(x.data));
    return a ? a.data : null;
  } catch (e) { console.warn("[DNS] DoH unavailable for",hostname,String(e).slice(0,120));return null; }
}
const originHosts=["flixer.su","plsdontscrapemelove.flixer.su"];
const aRecords=await Promise.all(originHosts.map(publicDnsA));
const mappings=originHosts.map((h,i)=>aRecords[i] ? "MAP " + h + " " + aRecords[i] : "").filter(Boolean);
console.log("[DNS] Origin mappings",mappings.length,"of",originHosts.length);
const chromeArgs=["--no-sandbox"];
if (mappings.length) chromeArgs.push("--host-resolver-rules=" + mappings.join(", "));
const browser = await chromium.launch({headless:true,args:chromeArgs});

function respond(res, status, body) {
  res.writeHead(status, {
    "Content-Type":"application/json; charset=utf-8",
    "Cache-Control":"no-store",
    "Access-Control-Allow-Origin":"*"
  });
  res.end(JSON.stringify(body));
}
function identity(path) {
  const m = path.match(/^\/resolve\/(movie|tv)\/([0-9]{1,10})(?:\/([0-9]{1,3})\/([0-9]{1,3}))?\/?$/);
  if (!m || (m[1]==="tv" && (!m[3] || !m[4])) || (m[1]==="movie" && (m[3] || m[4]))) return null;
  return {type:m[1],id:m[2],season:m[3],episode:m[4]};
}
function pageUrl(x) {
  return "https://flixer.su/watch/" + x.type + "/" + x.id +
    (x.type==="tv" ? "/" + x.season + "/" + x.episode : "");
}
async function extract(x) {
  const referer = pageUrl(x);
  const ctx = await browser.newContext({
    userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
    viewport:{width:1280,height:720}
  });
  const page = await ctx.newPage();
  const media = [];
  const pending = [];
  try {
    page.on("response", r => {
      if (r.status()!==200 || !/\.m3u8(?:[?#]|$)/i.test(r.url())) return;
      pending.push(r.text().then(body => {
        if (!body.startsWith("#EXTM3U")) return;
        const master = body.includes("#EXT-X-STREAM-INF:");
        if (!media.some(p=>p.url===r.url())) {
          media.push({url:r.url(),master,variants:
            [...body.matchAll(/RESOLUTION=(\d+)x(\d+)/g)]
              .map(m=>({width:Number(m[1]),height:Number(m[2])}))});
        }
      }).catch(()=>{}));
    });
    await page.goto(referer,{waitUntil:"domcontentloaded",timeout:40000});
    await page.waitForTimeout(MAX_WAIT_MS);
    await Promise.allSettled(pending);
    const master = media.find(x=>x.master);
    const chosen = master || media[0];
    if (!chosen) return {streams:[],reason:"NO_HLS_SOURCE"};
    const qualities = chosen.variants.map(v=>v.height>=790?"1080p":v.height>=690?"720p":v.height>=460?"480p":"SD");
    return {streams:[{
      name:"Flixer · Alpha",
      title:"Flixer · Alpha · " + (qualities[qualities.length-1] || "Auto"),
      url:chosen.url,
      quality:chosen.master?"Auto":(qualities[qualities.length-1]||"Auto"),
      type:"hls",
      headers:{"Referer":referer,"Origin":"https://flixer.su"}
    }],variants:chosen.variants};
  } finally {
    await ctx.close();
  }
}
const server = createServer(async(req,res)=>{
  if (req.method==="OPTIONS") {res.writeHead(204,{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"GET, OPTIONS"});res.end();return;}
  if (req.method!=="GET") {respond(res,405,{error:"METHOD_NOT_ALLOWED"});return;}
  if (TOKEN && req.headers.authorization!=="Bearer "+TOKEN) {respond(res,401,{error:"UNAUTHORIZED"});return;}
  const pathname = new URL(req.url||"/","http://localhost").pathname;
  if (pathname==="/health") {respond(res,200,{ok:true,active});return;}
  const x = identity(pathname);
  if (!x) {respond(res,404,{error:"INVALID_ROUTE"});return;}
  const key=[x.type,x.id,x.season,x.episode].join(":");
  const old=cache.get(key);
  if (old && old.expires>Date.now()) {respond(res,200,{...old.value,cached:true});return;}
  if (active>=2) {respond(res,503,{error:"BUSY"});return;}
  active++;
  try {
    const result=await extract(x);
    if (result.streams.length) cache.set(key,{expires:Date.now()+TTL_MS,value:result});
    respond(res,200,result);
  }catch(e){
    console.error("[FlixerResolver]",x.type,x.id,String(e).slice(0,230));
    respond(res,502,{error:"RESOLVE_FAILED",streams:[]});
  }finally{active--;}
});
server.listen(PORT,HOST,()=>console.log("[FlixerResolver] http://"+HOST+":"+PORT));
process.on("SIGTERM",async()=>{server.close();await browser.close();});
