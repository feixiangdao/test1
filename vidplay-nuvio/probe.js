// Diagnostic only. Reads public VidPlay pages and prints non-sensitive page structure.
const UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";
const BASE="https://vidplay.top";
const targets=["/","/movie/51381-watch-life-2017-online","/movie/205093-watch-resident-evil-2026-online","/tv-shows","/search?q=Life"];
function snippets(text,re,size=220,limit=15){const out=[];for(const m of text.matchAll(re)){if(out.length>=limit)break;out.push(text.slice(Math.max(0,m.index-size),Math.min(text.length,m.index+m[0].length+size)).replace(/\s+/g," ").slice(0,650));}return out;}
async function one(path){const u=BASE+path;try{const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),18000);const r=await fetch(u,{headers:{"User-Agent":UA,"Accept":"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"},redirect:"follow",signal:controller.signal});clearTimeout(timer);const body=await r.text();
console.log("\nPAGE",path,"STATUS",r.status,"FINAL",r.url,"LEN",body.length,"TYPE",r.headers.get("content-type"));
console.log("TITLE",body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.slice(0,150));
console.log("FORMS",JSON.stringify(snippets(body,/<form\b[\s\S]*?<\/form>/gi,0,2).map(t=>t.slice(0,500))));
console.log("IFRAMES",JSON.stringify([...body.matchAll(/<iframe\b[^>]*>/gi)].map(m=>m[0]).slice(0,8)));
console.log("SCRIPT SRCS",JSON.stringify([...body.matchAll(/<script\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)].map(m=>m[1]).slice(0,30)));
console.log("MEDIA SRC",JSON.stringify(snippets(body,/(?:https?:)?\/\/[^"'\s<>]+(?:\.m3u8|\.mp4|\/embed|\/player|\/e\/)[^"'\s<>]*/gi,20,20)));
console.log("PLAYER REFERENCES",JSON.stringify(snippets(body,/(?:iframe|player|server|episode|embed|data-src|data-id|stream|\.m3u8|#V1|#V2|#V3)/gi,100,18)));
console.log("META",JSON.stringify(snippets(body,/<meta\b[^>]*>/gi,0,9)));
if(r.status!==200)console.log("BEGIN",body.slice(0,700).replace(/\s+/g," "));}catch(e){console.log("FAIL",path,e.message);}}
(async()=>{for(const path of targets)await one(path)})().catch(e=>{console.log("FATAL",e.message);process.exitCode=1});
