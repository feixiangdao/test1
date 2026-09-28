const vm=require('vm');

async function loadProvider(name){
  const url='https://raw.githubusercontent.com/NuvioPlugin/All-in-One-Nuvio/main/providers/'+name+'.js';
  const r=await fetch(url);
  if(!r.ok)throw new Error(name+' raw '+r.status);
  const code=await r.text();
  const module={exports:{}};
  const sandbox={
    module,
    exports:module.exports,
    require,
    fetch,
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    Promise,
    Math,
    Date,
    JSON,
    String,
    Number,
    Object,
    RegExp,
    parseInt,
    parseFloat,
    setTimeout,
    clearTimeout,
    globalThis:null,
    global:null,
    atob:global.atob,
    btoa:global.btoa,
    crypto:global.crypto
  };
  sandbox.globalThis=sandbox;
  sandbox.global=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code,sandbox,{timeout:30000,filename:name+'.js'});
  return module.exports && module.exports.getStreams ? module.exports : sandbox;
}

async function probeRow(label,row){
  if(!row||!row.url)return false;
  try{
    const r=await fetch(row.url,{headers:row.headers||{},redirect:'manual'});
    const ct=r.headers.get('content-type');
    let prefix='';
    try{prefix=Buffer.from(await r.arrayBuffer()).subarray(0,180).toString('utf8').replace(/\s+/g,' ')}catch(_){}
    console.log(label,'MEDIA',r.status,ct,new URL(row.url).host,row.quality||'',prefix);
    return r.status>=200&&r.status<400;
  }catch(e){
    console.log(label,'MEDIA ERR',e&&e.message||String(e));
    return false;
  }
}

async function test(name){
  console.log('\n=== '+name+' ===');
  try{
    const p=await loadProvider(name);
    for(const args of [['550','movie'],['1399','tv',1,1]]){
      const rows=await p.getStreams.apply(null,args);
      console.log(name,args[1],'rows',Array.isArray(rows)?rows.length:null,(rows||[]).slice(0,8).map(x=>({name:x.name,title:x.title,quality:x.quality,url:x.url&&String(x.url).slice(0,200)})));
      if(rows&&rows[0])await probeRow(name+' '+args[1],rows[0]);
    }
  }catch(e){
    console.log(name,'ERROR',e&&e.stack||String(e));
  }
}

(async()=>{
  await test('goated');
  await test('cineby');
})().catch(e=>{console.error(e);process.exit(1)});
