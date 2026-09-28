const vm=require('vm');

function makeLoggedFetch(tag){
  return async function(url,opt){
    const s=String(url);
    const quiet=s.includes('api.themoviedb.org')||s.includes('raw.githubusercontent.com/NuvioPlugin');
    try{
      const r=await fetch(url,opt);
      if(!quiet) console.log('FETCH',tag,r.status,s,'->',r.url||'');
      return r;
    }catch(e){
      if(!quiet) console.log('FETCH_ERR',tag,s,e&&e.message||String(e));
      throw e;
    }
  };
}

async function loadProvider(name){
  const raw='https://raw.githubusercontent.com/NuvioPlugin/All-in-One-Nuvio/main/providers/'+name+'.js';
  const r=await fetch(raw);
  if(!r.ok)throw new Error(name+' raw '+r.status);
  const code=await r.text();
  const module={exports:{}};
  const sandbox={
    module,exports:module.exports,require,console,
    fetch:makeLoggedFetch(name),
    URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,
    Promise,Math,Date,JSON,String,Number,Boolean,Object,RegExp,Error,
    parseInt,parseFloat,isNaN,setTimeout,clearTimeout,
    atob:global.atob,btoa:global.btoa,crypto:global.crypto,
    globalThis:null,global:null
  };
  sandbox.globalThis=sandbox;sandbox.global=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code,sandbox,{timeout:30000,filename:name+'.js'});
  const p=module.exports&&typeof module.exports.getStreams==='function'?module.exports:sandbox;
  if(typeof p.getStreams!=='function')throw new Error(name+' no getStreams');
  return p;
}

async function probeRow(name,row){
  if(!row||!row.url)return;
  try{
    const r=await fetch(row.url,{headers:row.headers||{},redirect:'manual'});
    const ab=await r.arrayBuffer();
    const prefix=Buffer.from(ab).subarray(0,220).toString('utf8').replace(/\s+/g,' ');
    console.log('MEDIA',name,r.status,r.headers.get('content-type'),new URL(row.url).host,prefix);
  }catch(e){console.log('MEDIA_ERR',name,e&&e.message||String(e));}
}

async function run(name){
  console.log('\n=== '+name+' instrumented ===');
  try{
    const p=await loadProvider(name);
    for(const args of [['550','movie'],['1399','tv',1,1]]){
      try{
        const rows=await p.getStreams.apply(null,args);
        console.log('ROWS',name,args[1],Array.isArray(rows)?rows.length:null,(rows||[]).slice(0,6).map(x=>({
          name:x.name,title:x.title,quality:x.quality,url:x.url&&String(x.url).slice(0,240)
        })));
        if(rows&&rows[0])await probeRow(name+' '+args[1],rows[0]);
      }catch(e){console.log('RUN_ERR',name,args[1],e&&e.stack||String(e));}
    }
  }catch(e){console.log('LOAD_ERR',name,e&&e.stack||String(e));}
}

(async()=>{
  await run('moonflix');
  await run('purstream');
  await run('1shows');
})().catch(e=>{console.error(e);process.exit(1)});
