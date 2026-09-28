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
    Boolean,
    Object,
    RegExp,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    setTimeout,
    clearTimeout,
    atob:global.atob,
    btoa:global.btoa,
    crypto:global.crypto,
    globalThis:null,
    global:null
  };
  sandbox.globalThis=sandbox;
  sandbox.global=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code,sandbox,{timeout:30000,filename:name+'.js'});
  const p=module.exports&&typeof module.exports.getStreams==='function'?module.exports:sandbox;
  if(typeof p.getStreams!=='function')throw new Error(name+' missing getStreams');
  return p;
}

async function mediaProbe(label,row){
  if(!row||!row.url)return false;
  const headers=row.headers||{};
  try{
    const r=await fetch(row.url,{headers:{...headers,Range:'bytes=0-4095'},redirect:'manual'});
    let prefix='';
    try{
      const ab=await r.arrayBuffer();
      prefix=Buffer.from(ab).subarray(0,240).toString('utf8').replace(/\s+/g,' ');
    }catch(_){}
    console.log(label,'MEDIA',r.status,r.headers.get('content-type'),new URL(row.url).host,row.quality||'',prefix);
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
      let rows=[];
      try{rows=await p.getStreams.apply(null,args);}catch(e){console.log(name,args[1],'getStreams ERR',e&&e.stack||String(e));continue;}
      console.log(name,args[1],'rows',Array.isArray(rows)?rows.length:null,(rows||[]).slice(0,10).map(x=>({
        name:x.name,title:x.title,quality:x.quality,url:x.url&&String(x.url).slice(0,240),
        headers:x.headers&&Object.keys(x.headers)
      })));
      if(rows&&rows[0])await mediaProbe(name+' '+args[1],rows[0]);
    }
  }catch(e){
    console.log(name,'ERROR',e&&e.stack||String(e));
  }
}

(async()=>{
  await test('moonflix');
  await test('purstream');
})().catch(e=>{console.error(e);process.exit(1)});
