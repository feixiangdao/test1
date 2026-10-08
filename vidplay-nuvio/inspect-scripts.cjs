const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'});
const page=await context.newPage();
const address='https://vidplay.top/movie/51381-watch-life-2017-online';
const p=await page.goto(address,{waitUntil:'domcontentloaded',timeout:25000});
console.log('DETAIL',p.status(),await page.title());
const inspect=await page.evaluate(()=>{
const scripts=[...document.scripts].map(x=>({src:x.src,inline:x.src?'':x.textContent.slice(0,2500)}));
return {scripts:scripts.filter(x=>/vplay|embed|ajaxlink|movie|imdb/i.test(x.src+x.inline)).slice(0,12),buttons:[...document.querySelectorAll('a.ajaxlink_vplay,a.ajaxlink_vplay2,a.ajaxlink_vplay3')].map(x=>({className:x.className,html:x.outerHTML.slice(0,350)}))};
});
console.log('SCRIPTS',JSON.stringify(inspect).slice(0,11000));
for(let i=1;i<=3;i++){
 const suffix=i===1?'':i;const u='https://vidplay.top/ajax/mov_vplay'+suffix+'.php?embed='+(i===3?'395992':'tt5442430');
 try{const r=await page.request.get(u,{headers:{'Referer':address,'X-Requested-With':'XMLHttpRequest'}});const s=await r.text();console.log('AJAX',i,JSON.stringify({status:r.status(),contentType:r.headers()['content-type'],cookies:(await context.cookies()).map(c=>c.name),body:s.slice(0,300).replace(/\s+/g,' ')}));}catch(e){console.log('AJAX_ERR',i,e.message)}
}
await browser.close();
})().catch(e=>{console.error('FATAL',e.stack);process.exitCode=1});
