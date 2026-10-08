const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'});
 const page=await context.newPage();
 const targets=/\/ajax\/mov_vplay(?:2|3)?\.php/;
 page.on('request',async r=>{if(targets.test(r.url())){const h=await r.allHeaders();console.log('AJAX_REQUEST',JSON.stringify({method:r.method(),url:r.url(),headers:Object.fromEntries(Object.entries(h).filter(([k])=>['accept','referer','origin','x-requested-with','sec-fetch-site','sec-fetch-mode','content-type'].includes(k))),postData:r.postData()?.slice(0,120)||null}));}});
 page.on('response',async r=>{if(targets.test(r.url())){let body='';try{body=(await r.text()).slice(0,500)}catch(e){body='cannot-read'}console.log('AJAX_RESPONSE',JSON.stringify({status:r.status(),url:r.url(),server:r.headers()['server'],cfRay:!!r.headers()['cf-ray'],type:r.headers()['content-type'],bodySnippet:body.replace(/\s+/g,' ')}));}});
 const res=await page.goto('https://vidplay.top/movie/51381-watch-life-2017-online',{waitUntil:'domcontentloaded',timeout:25000});
 console.log('PAGE',res.status(),await page.title(),'cookies', (await context.cookies()).map(c=>c.name));
 await page.waitForTimeout(1200);
 console.log('LINKS',JSON.stringify(await page.locator('a').filter({hasText:/#V[123]/}).evaluateAll(xs=>xs.map(x=>({text:x.textContent?.trim(),href:x.getAttribute('href'),onclick:x.getAttribute('onclick'),outer:x.outerHTML.slice(0,500)})))));
 for(const v of [1,2,3]){
  const loc=page.locator('a').filter({hasText:new RegExp('#V'+v+'\\b')}).first();
  if(await loc.count())await loc.click({timeout:3500});
  await page.waitForTimeout(2200);
  console.log('IFRAMES',v,JSON.stringify(await page.locator('iframe').evaluateAll(xs=>xs.map(x=>({src:x.getAttribute('src'),dataSrc:x.getAttribute('data-src')})))));
 }
 await browser.close();
})().catch(e=>{console.error('ERROR',e.stack||e);process.exitCode=1});
