const {chromium}=require('playwright');
(async()=>{
 const b=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await b.newPage({viewport:{width:1600,height:900},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'});
 const events=[],origin='https://vidplay.top';
 page.on('request',r=>{if(/ajax|mov_vplay|embed|iframe|player|video|\.mp4|\.m3u8|\.mpd/i.test(r.url()))events.push(['request',r.method(),r.url().slice(0,260)]);});
 page.on('response',r=>{if(/ajax|mov_vplay|embed|iframe|player|video|\.mp4|\.m3u8|\.mpd/i.test(r.url()))events.push(['response',r.status(),r.url().slice(0,260)]);});
 page.on('popup',async p=>{console.log('POPUP',p.url());try{await p.waitForLoadState('domcontentloaded',{timeout:3000})}catch(e){}console.log('POPUP_FINAL',p.url());try{await p.close()}catch(e){}});
 page.on('framenavigated',f=>{if(f!==page.mainFrame())console.log('FRAME',f.url().slice(0,260))});
 const r=await page.goto(origin+'/movie/51381-watch-life-2017-online',{waitUntil:'domcontentloaded',timeout:25000});
 await page.waitForTimeout(1400);
 const diag=await page.evaluate(()=>{
  const pick=(e)=>({tag:e?.tagName||'',id:e?.id||'',cl:String(e?.className||'').slice(0,120),text:(e?.textContent||'').slice(0,90),outer:e?.outerHTML?.slice(0,800)});
  const cx=Math.min(innerWidth-1,Math.round(innerWidth*0.36)),cy=Math.min(innerHeight-1,380);
  const p=document.elementFromPoint(cx,cy);
  const matches=[...document.querySelectorAll('[class*=play],[id*=play],[onclick],[data-src],[data-url],video,iframe')].slice(0,35).map(pick);
  return {point:{x:cx,y:cy,element:pick(p),parent:pick(p?.parentElement)},matches,buttons:[...document.querySelectorAll('button')].slice(0,20).map(pick), scripts:[...document.scripts].filter(x=>/ajaxlink|poster|playbtn|bigplay|mov_vplay/i.test(x.textContent||'')).map(x=>(x.textContent||'').slice(0,1800)).slice(0,7)};
 });
 console.log('PAGE',r.status(),await page.title());
 console.log('OVERLAY',JSON.stringify(diag).slice(0,16500));
 const loc=page.locator('[class*="play"]').filter({visible:true});
 let target;
 try{
  let all=await page.locator('[class*="play"],[id*="play"]').evaluateAll(xs=>xs.slice(0,50).map(x=>({cl:x.className,id:x.id,visible:!!(x.offsetWidth||x.offsetHeight||x.getClientRects().length),outer:x.outerHTML.slice(0,420)})));
  console.log('POSSIBLE_CLICKS',JSON.stringify(all).slice(0,11500));
  const center=await page.evaluate(()=>{const e=document.elementFromPoint(Math.min(innerWidth-1,Math.round(innerWidth*.36)),Math.min(innerHeight-1,380));return e?.outerHTML?.slice(0,500)});
  console.log('CENTER',center);
  // Perform exactly one user-equivalent click on the visible hero playback overlay.
  await page.mouse.click(Math.min(1600-1,580),380);
  await page.waitForTimeout(3500);
  console.log('AFTER_CLICK',JSON.stringify({url:page.url(),frames:page.frames().map(f=>f.url().slice(0,260)),events:events.slice(-30),body:(await page.locator('body').innerText()).slice(0,180)}));
 }catch(e){console.log('CLICK_ERROR',String(e).slice(0,300))}
 await b.close();
})().catch(e=>{console.error('FATAL',e.stack);process.exitCode=1});