/*
 * YTS HTTP Response Integrity Diagnostic v0.3.3
 * Nuvio Android Full 0.6.12-beta (155).
 * Compares raw JSON response hashes to parsed object hashes.
 * Explicit Android mobile User-Agent and cache-bypass headers.
 * Returns only genuine API-provided hashes; does not assert playability.
 */
var API_URLS=['https://movies-api.accel.li/api/v2/','https://yts.gg/api/v2/'];
var MOBILE_UA='Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
function imdb(v) {
  var x=String(v||'').toLowerCase().trim();
  return /^tt[0-9]{7,10}$/.test(x)?x:null;
}
function validHash(v) {
  var x=String(v||'').toLowerCase().trim();
  return /^[a-f0-9]{40}$/.test(x)?x:null;
}
function uniqueTorrentList(rows) {
  var known=Object.create(null),out=[];
  (Array.isArray(rows)?rows:[]).forEach(function(t) {
    var h=validHash(t&&t.hash);
    if(h&&!known[h]){known[h]=true;out.push(t);}
  });
  return out;
}
function rawHashScan(text) {
  var re=/"hash"\s*:\s*"([0-9a-fA-F]{40})"/g;
  var match,all=[],uniq=Object.create(null);
  while((match=re.exec(text))!==null) {
    var hash=match[1].toLowerCase();
    all.push(hash);
    uniq[hash]=true;
  }
  return {count:all.length,unique:Object.keys(uniq).length,first:all.length?all[0].slice(0,8).toUpperCase():'-'};
}
function fetchApi(url) {
  var bust=(url.indexOf('?')>=0?'&':'?')+'_nuviocb='+Date.now();
  return fetch(url+bust,{
    headers:{'Accept':'application/json',
      'User-Agent':MOBILE_UA,
      'Cache-Control':'no-cache, no-store',
      'Pragma':'no-cache'}
  }).then(function(response) {
    if(!response||!response.ok)throw Error('HTTP '+(response&&response.status||'?'));
    return response.text().then(function(raw){
      var payload=JSON.parse(raw);
      if(!payload||payload.status!=='ok'||!payload.data)throw Error('Invalid API envelope');
      return {data:payload.data,rawScan:rawHashScan(raw),bytes:raw.length,
        fetchedUrl:String(response.url||url)};
    });
  });
}
function resolveImdb(id) {
  var direct=imdb(id);
  if(direct)return Promise.resolve(direct);
  var clean=String(id||'').trim().replace(/^tmdb:/i,'');
  if(!/^[0-9]{1,12}$/.test(clean))return Promise.resolve(null);
  var key=String(globalThis.TMDB_API_KEY||'').trim();
  if(!key)return Promise.resolve(null);
  return fetch('https://api.themoviedb.org/3/movie/'+clean+
    '/external_ids?api_key='+encodeURIComponent(key),{
      headers:{'Accept':'application/json','User-Agent':MOBILE_UA}
    }).then(function(r){
      if(!r||!r.ok)throw Error('TMDB request failed');
      return r.json();
    }).then(function(x){return imdb(x&&x.imdb_id);});
}
function listFetch(id) {
  var suffix='list_movies.json?query_term='+encodeURIComponent(id)+'&limit=50';
  return Promise.all(API_URLS.map(function(root,api) {
    return fetchApi(root+suffix).then(function(payload) {
      var films=Array.isArray(payload.data.movies)?payload.data.movies:[];
      var matching=films.filter(function(f){return f&&imdb(f.imdb_code)===id;});
      if(!matching.length)return null;
      var all=[];
      matching.forEach(function(f) {
        all=all.concat(Array.isArray(f.torrents)?f.torrents:[]);
      });
      return {api:api,kind:'L',id:String(matching[0].id||''),
        records:uniqueTorrentList(all),rawScan:payload.rawScan};
    }).catch(function(){return null;});
  }));
}
function detailFetch(listSources,id) {
  var valid=listSources.filter(Boolean);
  if(!valid.length)return Promise.resolve(null);
  valid.sort(function(a,b){return b.records.length-a.records.length||a.api-b.api;});
  var fallbackMovie=valid[0].id;
  return Promise.all(API_URLS.map(function(root,api) {
    var list=listSources[api];
    var movieId=String(list&&list.id||fallbackMovie);
    if(!/^[0-9]{1,12}$/.test(movieId))return Promise.resolve(null);
    return fetchApi(root+'movie_details.json?movie_id='+encodeURIComponent(movieId))
      .then(function(payload){
        var film=payload.data.movie;
        if(!film||imdb(film.imdb_code)!==id||!Array.isArray(film.torrents))return null;
        return {api:api,kind:'D',id:movieId,
          records:uniqueTorrentList(film.torrents),
          rawScan:payload.rawScan};
      }).catch(function(){return null;});
  })).then(function(details) {
    var possible=valid.concat(details.filter(Boolean));
    possible.sort(function(a,b) {
      return b.records.length-a.records.length||
        (a.kind===b.kind?0:a.kind==='D'?-1:1)||a.api-b.api;
    });
    var best=possible[0];
    function counts(xs) {
      return xs.map(function(x){return x?x.records.length:'-';}).join('/');
    }
    function rawCounts(xs) {
      return xs.map(function(x){return x?x.rawScan.count+'/'+x.rawScan.unique:'-';}).join('|');
    }
    function rawPrefix(xs) {
      return xs.map(function(x){return x?x.rawScan.first:'-';}).join('/');
    }
    return {torrents:best.records,imdbId:id,movieId:best.id,
      listCounts:counts(listSources),detailCounts:counts(details),
      rawCounts:rawCounts(details),rawPrefix:rawPrefix(details),
      pick:best.kind+best.api};
  });
}
function makeStreams(result) {
  if(!result)return [];
  var ranks={'4K':4,'1080p':3,'720p':2,'480p':1};
  var list=[];
  result.torrents.forEach(function(t) {
    var hash=validHash(t&&t.hash);
    if(!hash)return;
    var q=String(t.quality||'?');
    if(q==='2160p')q='4K';
    var codec=String(t.video_codec||'').trim();
    var badge='v033 '+result.imdbId+' M'+result.movieId+
      ' L'+result.listCounts+' D'+result.detailCounts+
      ' Raw'+result.rawCounts+' Prefix'+result.rawPrefix+
      ' R'+result.torrents.length+' Pick'+result.pick;
    var label='YTS '+q+(codec?' '+codec:'')+' | '+badge+
      ' | Hash'+hash.slice(0,8).toUpperCase();
    var item={name:label,title:label,quality:q,
      infoHash:hash,provider:'YTS',type:'torrent',
      url:'magnet:?xt=urn:btih:'+hash+'&dn='+encodeURIComponent('YTS '+q)};
    if(t.size!=null)item.size=String(t.size);
    list.push(item);
  });
  list.sort(function(a,b){return (ranks[b.quality]||0)-(ranks[a.quality]||0);});
  return list;
}
function getStreams(id,type,season,episode) {
  if(String(type||'').toLowerCase()!=='movie')return Promise.resolve([]);
  return resolveImdb(id).then(function(imdbId){
    if(!imdbId)return [];
    return listFetch(imdbId)
      .then(function(x){return detailFetch(x,imdbId);})
      .then(makeStreams);
  }).catch(function(){return [];});
}
module.exports={getStreams:getStreams};
