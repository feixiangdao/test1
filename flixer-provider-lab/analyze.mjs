const urls=[
'https://flixer.su/assets/js/VideoPlayer-52585954.js',
'https://flixer.su/assets/js/index-52585954.js'
];
const keys=['alpha','bravo','charlie','m3u8','playlist','sources','Source found','plsdontscrapemelove','dragonballzfans','/api/','server','decrypt','endpoint','fetch('];
for(const url of urls){
  try{
    const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Referer':'https://flixer.su/'}});
    const s=await r.text();
    console.log('FLIXER_JS_START',JSON.stringify({url,status:r.status,length:s.length}));
    for(const k of keys){
      const positions=[];
      let p=-1;const low=s.toLowerCase();const needle=k.toLowerCase();
      while((p=low.indexOf(needle,p+1))>=0){
        positions.push(p);
        if(positions.length>=15)break;
      }
      if(positions.length)console.log(JSON.stringify({keyword:k,totalAtLeast:positions.length,samples:positions.slice(0,7).map(p=>s.slice(Math.max(0,p-170),Math.min(s.length,p+260)))}).slice(0,4300));
    }
    console.log('FLIXER_JS_END');
  }catch(e){console.log('FLIXER_JS_ERROR',url,String(e))}
}
