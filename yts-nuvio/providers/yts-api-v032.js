/*
 * YTS Dual-API Integrity Provider v0.3.2 (Nuvio Android 0.6.12-beta Full).
 * Only public catalog data; not a guarantee of lawful or playable media.
 * Compare both YTS-compatible APIs, select one response with most distinct
 * valid info hashes, never merge incompatible hash collections blindly.
 */
var BASES=['https://movies-api.accel.li/api/v2/','https://yts.gg/api/v2/'];
function imdb(v){var x=String(v||'').toLowerCase().trim();return /^tt\d{7,10}$/.test(x)?x:null;}
function hash(v){var x=String(v||'').toLowerCase().trim();return /^[0-9a-f]{40}$/.test(x)?x:null;}
function unique(rows){
  var out=[],seen=Object.create(null);
  (Array.isArray(rows)?rows:[]).forEach(function(t){
    var h=hash(t&&t.hash);
    if(h&&!seen[h]){seen[h]=1;out.push(t);}
  });
  return out;
}
function rawApi(url){
  return fetch(url,{headers:{Accept:'application/json'}}).then(function(r){
    if(!r||!r.ok)throw Error('HTTP '+(r&&r.status||'?'));
    return r.json();
  }).then(function(json){
    if(!json||json.status!=='ok'||!json.data)throw Error('Bad response');
    return json.data;
  });
}
function toImdb(id){
  var direct=imdb(id);
  if(direct)return Promise.resolve(direct);
  var clean=String(id||'').replace(/^tmdb:/i,'').trim();
  if(!/^\d{1,12}$/.test(clean))return Promise.resolve(null);
  var key=String(globalThis.TMDB_API_KEY||'').trim();
  if(!key)return Promise.resolve(null);
  return fetch('https://api.themoviedb.org/3/movie/'+clean+
    '/external_ids?api_key='+encodeURIComponent(key))
    .then(function(r){if(!r||!r.ok)throw Error('TMDB failed');return r.json();})
    .then(function(j){return imdb(j&&j.imdb_id);});
}
function lists(imdbId) {
  var query='list_movies.json?query_term='+encodeURIComponent(imdbId)+'&limit=50';
  return Promise.all(BASES.map(function(base,i){
    return rawApi(base+query).then(function(data){
      var films=Array.isArray(data.movies)?data.movies:[];
      var found=films.filter(function(f){return f&&imdb(f.imdb_code)===imdbId;});
      if(!found.length)return null;
      var all=[];
      found.forEach(function(f){all=all.concat(Array.isArray(f.torrents)?f.torrents:[]);});
      return {api:i,kind:'L',id:String(found[0].id||''),items:unique(all)};
    }).catch(function(){return null;});
  }));
}
function details(listSources,imdbId) {
  var known=listSources.filter(Boolean);
  if(!known.length)return Promise.resolve(null);
  known.sort(function(a,b){return b.items.length-a.items.length||a.api-b.api;});
  var defaultId=known[0].id;
  return Promise.all(BASES.map(function(base,i){
    var id=String(listSources[i]&&listSources[i].id||defaultId);
    if(!/^\d{1,12}$/.test(id))return Promise.resolve(null);
    return rawApi(base+'movie_details.json?movie_id='+encodeURIComponent(id))
      .then(function(data){
        var film=data.movie;
        if(!film||imdb(film.imdb_code)!==imdbId||!Array.isArray(film.torrents))
          return null;
        return {api:i,kind:'D',id:id,items:unique(film.torrents)};
      }).catch(function(){return null;});
  })).then(function(detailSources){
    var candidates=known.concat(detailSources.filter(Boolean));
    candidates.sort(function(a,b){
      return b.items.length-a.items.length ||
        (a.kind===b.kind?0:a.kind==='D'?-1:1) || a.api-b.api;
    });
    var best=candidates[0];
    var counts=function(a){return a.map(function(v){return v?v.items.length:'-';}).join('/');};
    return {items:best.items,imdbId:imdbId,movieId:best.id,
      listCounts:counts(listSources),detailCounts:counts(detailSources),
      pick:best.kind+best.api,
      mismatch:!!(detailSources[0]&&detailSources[1]&&
        detailSources[0].items.length!==detailSources[1].items.length)};
  });
}
function streams(r){
  if(!r)return [];
  var rank={'4K':4,'1080p':3,'720p':2,'480p':1};
  var result=[];
  r.items.forEach(function(t){
    var h=hash(t&&t.hash);
    if(!h)return;
    var q=String(t.quality||'?');
    if(q==='2160p')q='4K';
    var codec=String(t.video_codec||'').trim();
    var sd=Number(t.seeds);
    var badge='v032 '+r.imdbId+' M'+r.movieId+
      ' L'+r.listCounts+' D'+r.detailCounts+
      ' R'+r.items.length+' Pick'+r.pick+(r.mismatch?' !DIFF':'');
    var name='YTS '+q+(codec?' '+codec:'')+' | '+badge+' | '+h.slice(0,8).toUpperCase();
    if(isFinite(sd)&&sd>=0&&Number.isInteger(sd))name+=' | S:'+sd;
    var item={name:name,title:name,
      url:'magnet:?xt=urn:btih:'+h+'&dn='+encodeURIComponent('YTS '+q),
      infoHash:h,quality:q,type:'torrent',provider:'YTS'};
    if(t.size!=null)item.size=String(t.size);
    result.push(item);
  });
  result.sort(function(a,b){return (rank[b.quality]||0)-(rank[a.quality]||0);});
  return result;
}
function getStreams(id,type,season,episode){
  if(String(type||'').toLowerCase()!=='movie')return Promise.resolve([]);
  return toImdb(id).then(function(externalId){
    if(!externalId)return [];
    return lists(externalId).then(function(candidates){
      return details(candidates,externalId);
    }).then(streams);
  }).catch(function(){return [];});
}
module.exports={getStreams:getStreams};
