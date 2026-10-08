const {chromium}=require('playwright');
(async()=>{
const b=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await b.newPage({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'});
const ep='https://vidplay.top/watchseries/abbott-elementary-online-free/season/1/episode/1';
const events=[];
page.on('request',r=>{if(/\/ajax\//.test(r.url()))events.push({method:r.method(),url:r.url()})});
page.on('response',r=>{if(/\/ajax\//.test(r.url()))events.push({status:r.status(),url:r.url()})});
const resp=await page.goto(ep,{waitUntil:'domcontentloaded',timeout:25000});
console.log('EP_PAGE',resp.status(),await page.title());
const info=await page.evaluate(()=>({
inline:[...document.scripts].filter(x=>/ajax|vplay|embed/i.test(x.textContent)).map(x=>x.textContent.slice(0,2700)).slice(0,10),
links:[...document.querySelectorAll('a')].filter(x=>/V[123]/.test(x.textContent||'')).map(x=>x.outerHTML.slice(0,340))
})); console.log('EP_HTML',JSON.stringify(info).slice(0,19000));
for(const v of ['#V1','#V2','#V3']){
const a=page.getByText(v,{exact:false}).first();if(await a.count()){try{await a.click({timeout:4000})}catch(e){console.log('CLICKERR',v,e.message.slice(0,180))}};
await page.waitForTimeout(900);console.log('AFTER',v,JSON.stringify({events:events.slice(-6),frames:page.frames().map(x=>x.url())}));
}
await b.close();
})().catch(e=>{console.log('ERROR',e.message);process.exitCode=1});