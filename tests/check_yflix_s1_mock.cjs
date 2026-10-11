// Deterministic fixture tests for YFlix S1. No external network requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.resolve(__dirname, '../yflix-nuvio/providers/yflix-server1.js');
const code = fs.readFileSync(file, 'utf8');

function setup(reply) {
  const requests = [];
  const context = {
    module: { exports: {} },
    Promise,
    console: { log() {}, error() {} },
    fetch(url, options) {
      requests.push({ url, options });
      return typeof reply === 'function' ? reply(url) : Promise.resolve(reply);
    }
  };
  vm.createContext(context);
  vm.runInContext(code, context, { timeout: 1000 });
  return { getStreams: context.module.exports.getStreams, requests };
}

async function main() {
  const fixture = { ok:true, status:200, json:async()=>({
    success:true,
    streams:[
      {provider:'Vidplay',quality:'1080',url:'https://media.invalid/test.m3u8',headers:{Referer:'https://player.invalid/'},subtitles:[{url:'https://media.invalid/sub.vtt',lang:'en'}]},
      {provider:'Vidplay',quality:'1080',url:'https://media.invalid/test.m3u8'},
      {provider:'DahmerMovies',quality:'2160',url:'https://media.invalid/excluded.mkv'},
      {provider:'Other',url:'javascript:alert(1)'},
      {provider:'Other',quality:'720',url:'https://media.invalid/movie.mp4'}
    ]
  }) };
  let env = setup(fixture);
  const rows = await env.getStreams('157336','movie');
  assert.equal(rows.length,2,'dedupe, unsafe URI and DahmerMovies filters');
  assert.equal(rows[0].quality,'1080p');
  assert.equal(rows[0].type,'hls');
  assert.equal(rows[0].headers.Referer,'https://player.invalid/');
  assert.equal(rows[0].subtitles[0].language,'en');
  assert.equal(rows[1].type,'mp4');
  assert.ok(env.requests[0].url.endsWith('/api/streams/movie/157336'));
  console.log('PASS S1 movie normalization, filter, dedupe, order, headers, subtitles');

  env=setup(fixture);
  const tv=await env.getStreams('123','tv',2,3);
  assert.equal(tv.length,2);
  assert.match(env.requests[0].url,/\/api\/streams\/tv\/123\?season=2&episode=3$/);
  console.log('PASS S1 TV request parameters');

  env=setup({ok:false,status:503,statusText:'Unavailable'});
  const failed=await env.getStreams('157336','movie');
  assert.ok(failed.length>0);
  assert.ok(failed.every(x=>x.quality==='Status' && x.url==='about:error'));
  console.log('PASS S1 HTTP 503 fail-closed diagnostic');

  env=setup(()=>Promise.reject(new Error('simulated network disconnect')));
  const disconnected=await env.getStreams('157336','movie');
  assert.ok(disconnected.every(x=>x.quality==='Status' && x.url==='about:error'));
  console.log('PASS S1 network rejection fail-closed');

  env=setup(fixture);
  const invalid=await env.getStreams('123','tv');
  assert.ok(invalid.every(x=>x.quality==='Status'));
  assert.equal(env.requests.length,0);
  console.log('PASS S1 missing TV coordinates do not fetch');
  env=setup({ok:true,status:200,json:async()=>({success:true,streams:[]})});
  const empty=await env.getStreams('157336','movie');
  assert.ok(empty.length>0 && empty.every(x=>x.quality==='Status' && x.url==='about:error'));
  console.log('PASS S1 HTTP 200 empty list produces diagnostics only');

  env=setup({ok:true,status:200,json:async()=>({success:false,streams:[]})});
  const denied=await env.getStreams('157336','movie');
  assert.ok(denied.every(x=>x.quality==='Status' && x.url==='about:error'));
  console.log('PASS S1 HTTP 200 upstream failure flag is not playable');

  env=setup({ok:true,status:200,json:async()=>{throw new SyntaxError('mock malformed JSON');}});
  const badJson=await env.getStreams('157336','movie');
  assert.ok(badJson.every(x=>x.quality==='Status' && x.url==='about:error'));
  console.log('PASS S1 JSON parsing exception safely returns diagnostics');
  console.log('NOTE: All HTTP responses are mocked; playback is not tested.');
}
main().catch(err=>{console.error('FAIL',err.stack||err);process.exitCode=1;});
