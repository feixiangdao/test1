// NOVIPNOAD privacy regression: synthetic credentials must not appear in UI rows/logs.
// No live credentials, website connections, or device access.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.resolve(__dirname,'../novipnoad-nuvio/providers/novipnoad-v023.js'),'utf8');
const cookie='SYNTHETIC_COOKIE_NEVER_LOG_a19b3f';
const apiKey='SYNTHETIC_API_KEY_NEVER_LOG_d0e49f';
const userAgent='Synthetic Test Browser';
const requests=[];
const logs=[];
const context={
  module:{exports:{}},Promise,
  SCRAPER_SETTINGS:{browserCookie:cookie,tmdbApiKey:apiKey,browserUserAgent:userAgent},
  console:{
    log(...parts){logs.push(parts.map(String).join(' '));},
    error(...parts){logs.push(parts.map(String).join(' '));},
    warn(...parts){logs.push(parts.map(String).join(' '));}
  },
  fetch(url,options={}){
    requests.push({url:String(url),headers:options.headers||{}});
    return Promise.reject(new Error('MOCK_OFFLINE'));
  }
};
vm.createContext(context);
vm.runInContext(source,context,{timeout:1000});

async function main(){
  const rows=await context.module.exports.getStreams('157336','movie');
  assert.ok(Array.isArray(rows)&&rows.length,'offline case must return diagnostic rows');
  const visible=JSON.stringify(rows)+'\n'+logs.join('\n');
  assert.ok(!visible.includes(cookie),'cookie leaked into UI rows or logs');
  assert.ok(!visible.includes(apiKey),'TMDB API key leaked into UI rows or logs');
  assert.ok(rows.every(r=>r.quality==='Status'),'offline must not return playable media');
  assert.equal(requests.length,2,'TMDB metadata uses exactly two requests in this fixture');
  assert.ok(requests.every(r=>r.url.startsWith('https://api.themoviedb.org/3/')));
  assert.ok(requests.every(r=>!r.headers.Cookie && !r.headers.cookie),'site Cookie must never be sent to TMDB');
  assert.equal(typeof context.siteHeaders,'function','fixture expects siteHeaders helper');
  const headers=context.siteHeaders('https://www.novipnoad.ca/',true);
  assert.equal(headers.Cookie,cookie,'site Cookie should be available for first-party requests');
  console.log('PASS synthetic Cookie/API key absent from error diagnostics and logs');
  console.log('PASS external TMDB requests have no site Cookie');
  console.log('NOTE: Uses synthetic test credentials only; no live HTTP or video playback');
}
main().catch(e=>{console.error('FAIL',e.stack||e);process.exitCode=1;});
