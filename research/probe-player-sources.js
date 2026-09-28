const vm=require('vm');

const PROVIDERS=['mapple','fibwatch','movix','vidlove','xpass'];
const RAW_BASE='https://raw.githubusercontent.com/NuvioPlugin/All-in-One-Nuvio/main/providers/';
const UA='Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36';

function loggedFetch(tag){
  return async function(url,opt){
    const s=String(url);
    try{
      const r=await fetch(url,opt);
      if(!s.includes('api.themoviedb.org')) console.log('FETCH',tag,r.status,s,'->',r.url||'');
      return r;
    }catch(e){
      console.log('FETCH_ERR',tag,s,e&&e.message||String(e));
      throw e;
    }
  };
}

async function load(name){
  const r=await fetch(RAW_BASE+name+'.js');
  if(!r.ok)throw new Error('raw '+name+' '+r.status);
  const code=await r.text();
  const module={exports:{}};
  const sandbox={
    module,exports:module.exports,console,
    require:(id)=>{
      if(id==='crypto-js')return require('crypto-js');
      if(id==='cheerio-without-node-native')return require('cheerio-without-node-native');
      if(id==='crypto')return require('crypto');
      return require(id);
    },
    fetch:loggedFetch(name),
    URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,
    Promise,Math,Date,JSON,String,Number,Boolean,Object,RegExp,Error,
    parseInt,parseFloat,isNaN,setTimeout,clearTimeout,
    atob:global.atob,btoa:global.btoa,crypto:global.crypto,
    globalThis:null,global:null,window:undefined
  };
  sandbox.globalThis=sandbox;
  sandbox.global=sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code,sandbox,{timeout:30000,filename:name+'.js'});
  const p=module.exports&&typeof module.exports.getStreams==='function'?module.exports:sandbox;
  if(typeof p.getStreams!=='function')throw new Error(name+' no getStreams');
  return p;
}

async function mediaProbe(name,row){
  if(!row||!row.url)return;
  const h={...(row.headers||{})};
  if(!h['User-Agent']&&!h['user-agent'])h['User-Agent']=UA;
  try{
    const r=await fetch(row.url,{headers:h,redirect:'manual'});
    const ab=await r.arrayBuffer();
    const prefix=Buffer.from(ab).subarray(0,300).toString('utf8').replace(/\s+/g,' ');
    console.log('MEDIA',name,r.status,r.headers.get('content-type'),new URL(row.url).host,prefix);
  }catch(e){
    console.log('MEDIA_ERR',name,e&&e.message||String(e));
  }
}

async function run(name){
  console.log('\n=== '+name+' ===');
  try{
    const p=await load(name);
    for(const args of [['550','movie'],['1399','tv',1,1]]){
      try{
        const rows=await Promise.race([
          p.getStreams.apply(null,args),
          new Promise(resolve=>setTimeout(()=>resolve('__TIMEOUT__'),45000))
        ]);
        if(rows==='__TIMEOUT__'){
          console.log('ROWS',name,args[1],'TIMEOUT');
          continue;
        }
        console.log('ROWS',name,args[1],Array.isArray(rows)?rows.length:null,(rows||[]).slice(0,8).map(x=>({
          name:x.name,title:x.title,quality:x.quality,url:x.url&&String(x.url).slice(0,220),
          headers:Object.keys(x.headers||{})
        })));
        if(Array.isArray(rows)&&rows.length)await mediaProbe(name+' '+args[1],rows[0]);
      }catch(e){
        console.log('RUN_ERR',name,args[1],e&&e.stack||String(e));
      }
    }
  }catch(e){
    console.log('LOAD_ERR',name,e&&e.stack||String(e));
  }
}

(async()=>{
  for(const n of PROVIDERS)await run(n);
})().catch(e=>{console.error(e);process.exitCode=1});
