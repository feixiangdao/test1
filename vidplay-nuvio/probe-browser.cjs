const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'});
 const events=[];
 page.on('request',r=>{let u=r.url();if(/embed|player|\.m3u8|\.mp4|\.mpd|ajax|episode/i.test(u))events.push(['REQ',u.slice(0,180)])});
 page.on('response',r=>{let u=r.url();if(/embed|player|\.m3u8|\.mp4|\.mpd|ajax|episode/i.test(u))events.push(['RES',r.status(),u.slice(0,180)])});
 try {
  const resp=await page.goto('https://vidplay.top/movie/51381-watch-life-2017-online',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(7000);
  console.log('INITIAL',JSON.stringify({status:resp?.status(),url:page.url(),title:await page.title(),body:(await page.locator('body').innerText()).slice(0,300),frames:page.frames().map(f=>f.url().slice(0,220))}));
  for(const v of ['V1','V2','V3']){
   try{
    const el=page.locator('a').filter({hasText:new RegExp('#'+v+'\\b','i')}).first();
    if(await el.count()){await el.click({timeout:2500});await page.waitForTimeout(1500)}
    console.log('SERVER',v,JSON.stringify({frames:page.frames().map(f=>f.url().slice(0,220)),iframe:await page.locator('iframe').evaluateAll(xs=>xs.map(x=>({src:x.src,outer:x.outerHTML.slice(0,300)}))),events:events.slice(-15)}));
   }catch(e){console.log('SERVER_ERR',v,e.message.slice(0,160))}
  }
 }catch(e){console.log('ERROR',e.message)}
 finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
