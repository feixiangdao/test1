// Offline fault-injection tests for six Nuvio providers. All fetch calls reject.
// This never contacts third-party websites and makes no playback claims.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const files = [
  'novipnoad-nuvio/providers/novipnoad-v023.js',
  'yesmovies-nuvio/providers/yesmovies.js',
  'yflix-nuvio/providers/yflix-server1.js',
  'yflix-nuvio/providers/yflix-server2-v052.js',
  'yflix-nuvio/providers/yflix-server3.js',
  'yflix-nuvio/providers/yflix-server4-v051.js'
];

async function inspect(file, mediaType) {
  const requests = [];
  const sandbox = {
    module: { exports: {} }, Promise,
    console: { log() {}, warn() {}, error() {} },
    fetch(url) {
      requests.push(String(url));
      return Promise.reject(new Error('MOCK_NETWORK_UNAVAILABLE'));
    },
    setTimeout(handler, ms) { return setTimeout(handler, Math.min(Number(ms) || 0, 200)); },
    clearTimeout,
    TextDecoder,
    TextEncoder
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(root,file),'utf8');
  vm.runInContext(source, sandbox, { filename:file, timeout: 1000 });
  const provider = sandbox.module.exports;
  assert.equal(typeof provider.getStreams, 'function');

  const args = mediaType === 'tv' ? ['157336','tv',1,1] : ['157336','movie'];
  let timer;
  try {
    const rows = await Promise.race([
      Promise.resolve(provider.getStreams(...args)),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Provider timed out after 2500ms')),2500);})
    ]);
    assert.ok(Array.isArray(rows), 'Expected array on network rejection');
    assert.ok(rows.every(row => row && (row.url === 'about:error' || row.quality === 'Status')),
      'Network failure must never produce synthetic playable media');
    console.log('PASS',file,mediaType,'network unavailable =>',rows.length,'nonplayable rows; mocked requests:',requests.length);
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  let failures=0;
  for(const file of files) {
    for(const type of ['movie','tv']) {
      try { await inspect(file,type); }
      catch(e) { failures++; console.error('FAIL',file,type,e.message); }
    }
  }
  if(failures) process.exitCode = 1;
  else console.log('PASS all 12 offline fault-injection scenarios');
})().catch(e=>{console.error(e);process.exitCode=1;});
