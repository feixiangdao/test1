const url='https://flixer.su/assets/js/WatchPartyOverlay-52585954.js';
async function main(){
  const s=await (await fetch(url,{signal:AbortSignal.timeout(18000)})).text();
  console.log('SOURCE_LOADER',s.slice(40500,47800));
  for(const term of ['getMoviePosterData','getPosterSourceQualities','getTVBackdropData','G=','function G(','const G=','await G()','tmdb-client','import(','createElement("script"','script.src','js/']){
    const re=new RegExp(term.replace(/[.*+?^$()|[\]{}]/g,'\\$&'),'gi');const m=[...s.matchAll(re)];console.log('MATCH',term,m.length);for(const x of m.slice(0,3))console.log('CTX',term,x.index,s.slice(Math.max(0,x.index-380),x.index+450));
  }
}
main().catch(e=>{console.log('ERR',String(e));process.exitCode=1});