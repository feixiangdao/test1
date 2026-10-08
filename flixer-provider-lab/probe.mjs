import { chromium } from 'playwright';

const targets = [
  ['Kung Fu Panda', 'https://flixer.su/watch/movie/9502'],
  ['Constantine', 'https://flixer.su/watch/movie/561'],
];
const safe = u => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return ''; } };
const isInteresting = u => /\\.(?:m3u8|mp4|mpd)(?:[?#]|$)|\\/(?:api|sources?|servers?|embed|watch|stream|play|video|proxy|playlist)(?:\\/|\\?|$)/i.test(u);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
for (const [name,url] of targets) {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36', viewport: {width:1365,height:900} });
  const page = await ctx.newPage();
  const requests = new Map();
  const responseInfo = [];
  page.on('request', req => {
    const u = req.url();
    if (isInteresting(u) && requests.size < 180) requests.set(req.method() + ' ' + safe(u), {method:req.method(),url:safe(u),kind:req.resourceType()});
  });
  page.on('response', response => {
    const u = response.url();
    if (isInteresting(u) && responseInfo.length < 200) responseInfo.push({status:response.status(),url:safe(u),type:response.headers()['content-type']||''});
  });
  let error=null;
  try {
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:40000});
    await page.waitForTimeout(18000);
  } catch (e) { error=String(e).slice(0,350); }
  const p = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    bodyText: (document.body?.innerText||'').slice(0,2500),
    scripts: [...document.querySelectorAll('script[src]')].map(x=>x.src).slice(0,70),
    videos: [...document.querySelectorAll('video')].map(x=>({currentSrc:x.currentSrc,src:x.src,duration:x.duration,readyState:x.readyState,error:x.error?.message || null})),
    sources: [...document.querySelectorAll('source')].map(x=>x.src),
    iframes: [...document.querySelectorAll('iframe')].map(x=>x.src),
    buttons: [...document.querySelectorAll('button')].map(x=>(x.innerText||x.getAttribute('aria-label')||'').trim()).filter(Boolean).slice(0,60)
  })).catch(e=>({error:String(e)}));
  if(p?.videos) for(const v of p.videos){v.src=safe(v.src);v.currentSrc=safe(v.currentSrc);}
  if(p?.sources) p.sources=p.sources.map(safe);
  if(p?.iframes) p.iframes=p.iframes.map(safe);
  console.log('FLIXER_RESULT_START');
  console.log(JSON.stringify({name,url,error,info:p,requests:[...requests.values()],responses:responseInfo},null,2).slice(0,26000));
  console.log('FLIXER_RESULT_END');
  await ctx.close();
}
await browser.close();
