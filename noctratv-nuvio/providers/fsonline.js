// NoctraTV · FSOnline — local FileSuN HLS resolver
var ORIGIN="https://www3.fsonline.app";
var AJAX=ORIGIN+"/wp-admin/admin-ajax.php";
var TMDB="https://api.themoviedb.org/3";
var TMDB_KEY="68e094699525b18a70bab2f86b1fa706";
var UA="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/137 Mobile Safari/537.36";

function clean(v){return v==null?"":String(v).trim();}
function h(ref){return{"User-Agent":UA,"Origin":ORIGIN,"Referer":ref||ORIGIN+"/"};}
function meta(id,type){
  var t=type==="tv"?"tv":"movie";
  return fetch(TMDB+"/"+t+"/"+encodeURIComponent(String(id))+"?api_key="+TMDB_KEY,{headers:{"User-Agent":UA,"Accept":"application/json"}})
    .then(function(r){if(!r.ok)throw new Error("TMDB "+r.status);return r.json();})
    .then(function(d){
      var date=clean(t==="tv"?d.first_air_date:d.release_date);
      return{type:t,title:clean(t==="tv"?d.name:d.title),year:date?date.slice(0,4):""};
    });
}
function search(m){
  var q=m.title+(m.year?" "+m.year:"");
  return fetch(ORIGIN+"/?s="+encodeURIComponent(q),{headers:h()})
    .then(function(r){if(!r.ok)throw new Error("search HTTP "+r.status);return r.text();})
    .then(function(t){
      var folder=m.type==="tv"?"seriale":"film";
      var re=new RegExp('href=["\\\'](https?://www3\\.fsonline\\.app/'+folder+'/([^"\\\'/]+)/)["\\\']','i');
      var x=t.match(re);return x?{url:x[1],slug:x[2]}:null;
    });
}
function pageUrl(hit,m,season,episode){
  if(m.type!=="tv")return hit.url;
  var slug=String(hit.slug||"").replace(/-\d{4}$/,"");
  return ORIGIN+"/episoade/"+slug+"-sezonul-"+String(season||1)+"-episodul-"+String(episode||1)+"/";
}
function movieId(url){
  return fetch(url,{headers:h(url)}).then(function(r){if(!r.ok)throw new Error("page HTTP "+r.status);return r.text();})
    .then(function(t){
      var m=t.match(/movie-id=["']([^"']+)["']/i)||t.match(/movie-id=([^ >]+)/i);
      return m?m[1]:"";
    });
}
function lazy(id,ref){
  return fetch(AJAX,{
    method:"POST",
    headers:{
      "User-Agent":UA,"Origin":ORIGIN,"Referer":ref,
      "Content-Type":"application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With":"XMLHttpRequest"
    },
    body:"action=lazy_player&movieID="+encodeURIComponent(id)
  }).then(function(r){if(!r.ok)throw new Error("ajax HTTP "+r.status);return r.text();});
}
function htmlDecode(s){
  return String(s||"").replace(/&amp;/g,"&").replace(/&#038;/g,"&").replace(/&quot;/g,'"');
}
function fileSunEmbeds(html){
  var out=[],re=/data-vs=["']([^"']+)["'][\s\S]{0,800}?<span>([^<]*)<\/span>/ig,m;
  while((m=re.exec(html))){if(/filesun/i.test(m[2]||""))out.push(htmlDecode(m[1]));}
  return out;
}
function resolveEmbed(url){
  return fetch(url,{headers:{"Referer":ORIGIN+"/","User-Agent":UA}})
    .then(function(r){if(!r.ok)throw new Error("embed HTTP "+r.status);return r.text();})
    .then(function(t){
      var m=t.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i)||
            t.match(/["']?file["']?\s*:\s*["'](https?:\/\/[^"']+)["']/i);
      if(!m)return null;
      var u=htmlDecode(m[1]).replace(/\\\//g,"/");
      if(!/^https?:\/\//i.test(u))return null;
      return{
        name:"NoctraTV · FSOnline",
        title:"FSOnline · FileSuN · 1080p",
        url:u,
        quality:"1080p",
        provider:"noctra-fsonline",
        headers:{"Referer":url,"Origin":"https://player.fsonline.app","User-Agent":UA},
        subtitles:[]
      };
    }).catch(function(){return null;});
}
function getStreams(tmdbId,mediaType,season,episode){
  return meta(tmdbId,mediaType).then(function(m){
    return search(m).then(function(hit){
      if(!hit)throw new Error("search miss");
      var p=pageUrl(hit,m,season,episode);
      return movieId(p).then(function(id){
        if(!id)throw new Error("movie-id missing");
        return lazy(id,p);
      }).then(function(html){
        var embeds=fileSunEmbeds(html);
        return Promise.all(embeds.map(resolveEmbed)).then(function(rows){
          var seen={},out=[];rows.forEach(function(x){if(x&&x.url&&!seen[x.url]){seen[x.url]=1;out.push(x);}});
          return out;
        });
      });
    });
  }).then(function(out){
    console.log("[NoctraTV/FSOnline] streams="+out.length);return out;
  }).catch(function(e){
    console.log("[NoctraTV/FSOnline] "+(e&&e.message?e.message:e));return[];
  });
}
module.exports={getStreams:getStreams};
