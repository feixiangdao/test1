const BASE='https://vidplay.top';
const tests=[
 {name:'Life (2017)',query:'Life',page:'/movie/51381-watch-life-2017-online',ajax:'/ajax/mov_vplay3.php?embed=395992'},
 {name:'Abbott Elementary S1E1',query:'Abbott Elementary',page:'/watchseries/abbott-elementary-online-free/season/1/episode/1',ajax:'/ajax/tv_vplay.php?embed=125935&season=1&episode=1'}
];
async function get(url,referer){const res=await fetch(url,{signal:AbortSignal.timeout(14000),headers:{'User-Agent':'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/139.0 Mobile Safari/537.36','Referer':referer,'X-Requested-With':'XMLHttpRequest','Accept':'text/html, */*;q=0.8'}});const s=await res.text();return{status:res.status,length:s.length,challenge:/Just a moment|challenge-platform/i.test(s),matchingUrl:s.includes('watch-life-2017-online')||s.includes('abbott-elementary-online-free'),media:/\.m3u8|\.mp4|\.mpd/i.test(s)}}
(async()=>{
 for(const t of tests){
   const search=BASE+'/index.php?menu=search&query='+encodeURIComponent(t.query);
   try{const first=await get(search,BASE+'/');console.log('SEARCH',JSON.stringify({name:t.name,url:search,...first}));}catch(e){console.log('SEARCH_ERR',t.name,e.message)}
   try{const second=await get(BASE+t.ajax,BASE+t.page);console.log('AJAX_WITH_REAL_REFERER',JSON.stringify({name:t.name,ref:BASE+t.page,...second}));}catch(e){console.log('AJAX_ERR',t.name,e.message)}
 }
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});