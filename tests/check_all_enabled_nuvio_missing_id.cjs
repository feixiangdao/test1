// Test all enabled Nuvio providers against missing TMDB ID.
// Only app-independent modules can be verified in this sandbox. Providers
// requiring React Native bundled dependencies are reported as UNVERIFIED.
// No network or device calls are permitted or executed.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const projects=JSON.parse(fs.readFileSync(path.join(__dirname,'nuvio_manifest_projects.json'),'utf8')).projects;
const bundled=new Set(['crypto-js','cheerio-without-node-native']);
let pass=0,dependent=0;
const failures=[],unverified=[];
function dependencyError(name) {
  const e=new Error('Missing app dependency: '+name);e.name='UnmodeledDependency';return e;
}
async function check(project,scraper){
  const relative=project+'/'+scraper.filename;
  let attempts=0;
  const exp={};
  const sandbox={
    module:{exports:exp},exports:exp,Promise,TextEncoder,TextDecoder,
    console:{log(){},warn(){},error(){},info(){}},
    fetch(){attempts++;return Promise.reject(new Error('MOCK_FETCH_DENIED'));},
    require(name) {
      if(bundled.has(name))throw dependencyError(name);
      throw new Error('UNEXPECTED_REQUIRE:'+String(name));
    },
  };
  sandbox.global=sandbox;
  const src=fs.readFileSync(path.join(root,relative),'utf8');
  const ctx=vm.createContext(sandbox,{codeGeneration:{strings:false,wasm:false}});
  vm.runInContext(src,ctx,{filename:relative,timeout:500});
  if(typeof ctx.module.exports.getStreams!=='function')throw new Error('Missing getStreams');
  for(const type of ['movie','tv']){
    let timeout;
    try{
      const rows=await Promise.race([
        Promise.resolve(ctx.module.exports.getStreams(null,type,1,1)),
        new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Async no-ID timeout')),1200);})
      ]);
      if(!Array.isArray(rows))throw new Error(type+': missing ID must return array');
      if(attempts)throw new Error(type+': missing ID attempted '+attempts+' network fetches');
      const unsafe=rows.filter(r=>!r || typeof r!=='object' || (/^https?:\/\//.test(String(r.url||'')) && r.quality!=='Status'));
      if(unsafe.length)throw new Error(type+': missing ID produced '+unsafe.length+' media-like rows');
    }finally{clearTimeout(timeout)}
  }
  pass++;
}
(async()=>{
  for(const project of projects) {
    const manifest=JSON.parse(fs.readFileSync(path.join(root,project,'manifest.json'),'utf8'));
    for(const entry of manifest.scrapers.filter(x=>x.enabled)){
      try{await check(project,entry);}
      catch(e){
        const label=project+'/'+entry.filename;
        if(e.name==='UnmodeledDependency'){dependent++;unverified.push(label+': '+e.message);}
        else failures.push(label+': '+e.message);
      }
    }
  }
  for(const s of unverified)console.log('UNVERIFIED',s);
  for(const s of failures)console.error('FAIL',s);
  console.log('RESULT missing-ID:',pass,'passed,',dependent,'dependency-gated,',failures.length,'failures');
  if(process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      '\n### Missing-ID offline guard\n\n- Passed: '+pass+'\n- Needs app dependencies: '+dependent+'\n- Failed: '+failures.length+'\n');
  }
  if(failures.length)process.exitCode=1;
})();
