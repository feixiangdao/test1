const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext({userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'});
 const page=await ctx.newPage();
 const ajax=[];
 page.on('request',r=>{if(/ajax|episode|embed|play|season|iframe|\\.m3u8|\\.mp4/i.test(r.url())&& !/googleapis|font-awesome|analytics/i.test(r.url()))ajax.push(['REQUEST',r.method(),r.url().slice(0,220)]);});
 page.on('response',r=>{if(/ajax|episode|embed|play|season/i.test(r.url())&&!/googleapis|font-awesome/i.test(r.url()))ajax.push(['RESPONSE',r.status(),r.url().slice(0,220)]);});
 const url='https://vidplay.top/watchseries/abbott-elementary-online-free';
 const res=await page.goto(url,{waitUntil:'domcontentloaded',timeout:28000});
 await page.waitForTimeout(1500);
 console.log('PAGE',JSON.stringify({status:res.status(),title:await page.title(),url:page.url(),frames:page.frames().map(f=>f.url())}));
 const info=await page.evaluate(()=>{
  const tags=[...document.querySelectorAll('a,button,li')].filter(x=>/Episode\\s+1|Season\\s+1/i.test((x.textContent||'').trim()) && (x.textContent||'').trim().length<150).slice(0,18);
  const scripts=[...document.scripts].filter(s=>/episode|season|ajax|vplay|embed|play/i.test(s.textContent||'')).map(s=>({src:s.src,text:(s.textContent||'').slice(0,2400)})).slice(0,9);
  const datasets=[...document.querySelectorAll('[data-id],[data-episode],[data-season],[data-src],[data-url]')].slice(0,20).map(x=>x.outerHTML.slice(0,500));
  return {episodeElements:tags.map(x=>x.outerHTML.slice(0,750)),scripts,datasets};
 });
 console.log('INFO',JSON.stringify(info).slice(0,23000));
 const match=page.getByText(/Episode 1.*Pilot/i).first();
 if(await match.count()){
   try{await match.click({timeout:3500});await page.waitForTimeout(1800);console.log('CLICK',JSON.stringify({url:page.url(),frames:page.frames().map(f=>f.url()),events:ajax.slice(-30),body:(await page.locator('body').innerText()).slice(0,600)}));}
   catch(e){console.log('CLICK_ERR',e.message.slice(0,300))}
 }
 await browser.close();
})().catch(e=>{console.error('ERROR',e.stack||e);process.exitCode=1});