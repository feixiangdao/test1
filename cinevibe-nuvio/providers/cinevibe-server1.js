// CineVibe Local for Nuvio
// v0.1.2
// CineVibe.cc Server 1 compatible route:
// TMDB -> MovieBox / OneRoom (aoneroom) -> direct HLS/DASH/MP4.
//
// Why this exists:
// CineVibe's current/previous frontend uses an embed-player layer. The default
// Vidsuper-compatible source order puts OneRoom/MovieBox first ("Server 1").
// This provider resolves that upstream directly so Nuvio does not depend on
// vidsuper.net being reachable.
//
// React Native / Hermes friendly: Promise chains, no async/await.

var MAIN_URL = "https://themoviebox.org";
var API_BASE = "https://h5-api.aoneroom.com";
var REFERER = "https://themoviebox.org/";
var DEFAULT_TMDB_API_KEY = "1865f43a0549ca50d341dd9ab8b29f49";
var UA = "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36";

var bearerToken = "";
var bearerExpiry = 0;
var DIAG = [];

function clean(v){ return v == null ? "" : String(v).trim(); }
function now(){ return Date.now ? Date.now() : (new Date()).getTime(); }
function settings(){ try { return (typeof globalThis !== "undefined" && globalThis.SCRAPER_SETTINGS) || {}; } catch(_) { return {}; } }

function diag(msg){
  msg = clean(msg).replace(/\s+/g, " ").slice(0, 180);
  if(msg && DIAG.indexOf(msg) < 0) DIAG.push(msg);
}
function resetDiag(){ DIAG = []; }

function flushDiag(){
  try {
    if(DIAG.length) console.log("[CineVibe] " + DIAG.join(" | "));
  } catch(_) {}
}

function tmdbKey(){
  var s = settings();
  var k = clean(s.tmdbApiKey);
  if(k) return k;
  try {
    k = clean(typeof globalThis !== "undefined" && globalThis.TMDB_API_KEY);
    if(k) return k;
  } catch(_) {}
  return DEFAULT_TMDB_API_KEY;
}

// Minimal dependency-free MD5. clientTimeToken() only hashes ASCII digits,
 // so this implementation intentionally handles the byte string directly.
function md5Add32(a,b){ return (a + b) & 0xFFFFFFFF; }
function md5Cmn(q,a,b,x,s,t){
  a = md5Add32(md5Add32(a,q), md5Add32(x,t));
  return md5Add32((a << s) | (a >>> (32-s)), b);
}
function md5Ff(a,b,c,d,x,s,t){ return md5Cmn((b & c) | ((~b) & d),a,b,x,s,t); }
function md5Gg(a,b,c,d,x,s,t){ return md5Cmn((b & d) | (c & (~d)),a,b,x,s,t); }
function md5Hh(a,b,c,d,x,s,t){ return md5Cmn(b ^ c ^ d,a,b,x,s,t); }
function md5Ii(a,b,c,d,x,s,t){ return md5Cmn(c ^ (b | (~d)),a,b,x,s,t); }
function md5Cycle(x,k){
  var a=x[0],b=x[1],c=x[2],d=x[3];

  a=md5Ff(a,b,c,d,k[0],7,-680876936); d=md5Ff(d,a,b,c,k[1],12,-389564586);
  c=md5Ff(c,d,a,b,k[2],17,606105819); b=md5Ff(b,c,d,a,k[3],22,-1044525330);
  a=md5Ff(a,b,c,d,k[4],7,-176418897); d=md5Ff(d,a,b,c,k[5],12,1200080426);
  c=md5Ff(c,d,a,b,k[6],17,-1473231341); b=md5Ff(b,c,d,a,k[7],22,-45705983);
  a=md5Ff(a,b,c,d,k[8],7,1770035416); d=md5Ff(d,a,b,c,k[9],12,-1958414417);
  c=md5Ff(c,d,a,b,k[10],17,-42063); b=md5Ff(b,c,d,a,k[11],22,-1990404162);
  a=md5Ff(a,b,c,d,k[12],7,1804603682); d=md5Ff(d,a,b,c,k[13],12,-40341101);
  c=md5Ff(c,d,a,b,k[14],17,-1502002290); b=md5Ff(b,c,d,a,k[15],22,1236535329);

  a=md5Gg(a,b,c,d,k[1],5,-165796510); d=md5Gg(d,a,b,c,k[6],9,-1069501632);
  c=md5Gg(c,d,a,b,k[11],14,643717713); b=md5Gg(b,c,d,a,k[0],20,-373897302);
  a=md5Gg(a,b,c,d,k[5],5,-701558691); d=md5Gg(d,a,b,c,k[10],9,38016083);
  c=md5Gg(c,d,a,b,k[15],14,-660478335); b=md5Gg(b,c,d,a,k[4],20,-405537848);
  a=md5Gg(a,b,c,d,k[9],5,568446438); d=md5Gg(d,a,b,c,k[14],9,-1019803690);
  c=md5Gg(c,d,a,b,k[3],14,-187363961); b=md5Gg(b,c,d,a,k[8],20,1163531501);
  a=md5Gg(a,b,c,d,k[13],5,-1444681467); d=md5Gg(d,a,b,c,k[2],9,-51403784);
  c=md5Gg(c,d,a,b,k[7],14,1735328473); b=md5Gg(b,c,d,a,k[12],20,-1926607734);

  a=md5Hh(a,b,c,d,k[5],4,-378558); d=md5Hh(d,a,b,c,k[8],11,-2022574463);
  c=md5Hh(c,d,a,b,k[11],16,1839030562); b=md5Hh(b,c,d,a,k[14],23,-35309556);
  a=md5Hh(a,b,c,d,k[1],4,-1530992060); d=md5Hh(d,a,b,c,k[4],11,1272893353);
  c=md5Hh(c,d,a,b,k[7],16,-155497632); b=md5Hh(b,c,d,a,k[10],23,-1094730640);
  a=md5Hh(a,b,c,d,k[13],4,681279174); d=md5Hh(d,a,b,c,k[0],11,-358537222);
  c=md5Hh(c,d,a,b,k[3],16,-722521979); b=md5Hh(b,c,d,a,k[6],23,76029189);
  a=md5Hh(a,b,c,d,k[9],4,-640364487); d=md5Hh(d,a,b,c,k[12],11,-421815835);
  c=md5Hh(c,d,a,b,k[15],16,530742520); b=md5Hh(b,c,d,a,k[2],23,-995338651);

  a=md5Ii(a,b,c,d,k[0],6,-198630844); d=md5Ii(d,a,b,c,k[7],10,1126891415);
  c=md5Ii(c,d,a,b,k[14],15,-1416354905); b=md5Ii(b,c,d,a,k[5],21,-57434055);
  a=md5Ii(a,b,c,d,k[12],6,1700485571); d=md5Ii(d,a,b,c,k[3],10,-1894986606);
  c=md5Ii(c,d,a,b,k[10],15,-1051523); b=md5Ii(b,c,d,a,k[1],21,-2054922799);
  a=md5Ii(a,b,c,d,k[8],6,1873313359); d=md5Ii(d,a,b,c,k[15],10,-30611744);
  c=md5Ii(c,d,a,b,k[6],15,-1560198380); b=md5Ii(b,c,d,a,k[13],21,1309151649);
  a=md5Ii(a,b,c,d,k[4],6,-145523070); d=md5Ii(d,a,b,c,k[11],10,-1120210379);
  c=md5Ii(c,d,a,b,k[2],15,718787259); b=md5Ii(b,c,d,a,k[9],21,-343485551);

  x[0]=md5Add32(a,x[0]); x[1]=md5Add32(b,x[1]);
  x[2]=md5Add32(c,x[2]); x[3]=md5Add32(d,x[3]);
}
function md5Block(s){
  var out=[],i;
  for(i=0;i<64;i+=4){
    out[i>>2]=s.charCodeAt(i) | (s.charCodeAt(i+1)<<8) |
      (s.charCodeAt(i+2)<<16) | (s.charCodeAt(i+3)<<24);
  }
  return out;
}
function md5State(s){
  var n=s.length,state=[1732584193,-271733879,-1732584194,271733878],i,tail,len;
  for(i=64;i<=n;i+=64) md5Cycle(state,md5Block(s.substring(i-64,i)));
  s=s.substring(i-64);
  tail=new Array(16);
  for(i=0;i<16;i++)tail[i]=0;
  for(i=0;i<s.length;i++)tail[i>>2] |= s.charCodeAt(i) << ((i%4)<<3);
  tail[i>>2] |= 0x80 << ((i%4)<<3);
  if(i>55){ md5Cycle(state,tail); for(i=0;i<16;i++)tail[i]=0; }
  len=n*8;
  tail[14]=len & 0xFFFFFFFF;
  tail[15]=Math.floor(len/4294967296);
  md5Cycle(state,tail);
  return state;
}
function md5Hex(s){
  s=String(s||"");
  var st=md5State(s),hex="",i,j,v;
  for(i=0;i<st.length;i++){
    v=st[i];
    for(j=0;j<4;j++){
      var b=(v >>> (j*8)) & 255;
      hex += (b<16?"0":"") + b.toString(16);
    }
  }
  return hex;
}

function clientTimeToken(){
  var ts = Math.floor(now() / 1000);
  var rev = String(ts).split("").reverse().join("");
  return String(ts) + "," + md5Hex(rev);
}

function baseHeaders(){
  return {
    "Accept": "application/json",
    "User-Agent": UA,
    "X-Client-Info": JSON.stringify({ timezone: "Asia/Jakarta" }),
    "Content-Type": "application/json"
  };
}

function copyObj(a){
  var o = {}, k;
  a = a || {};
  for(k in a) if(Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
  return o;
}

function mergeHeaders(a, b){
  var o = copyObj(a), k;
  b = b || {};
  for(k in b) if(Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k];
  return o;
}

function fetchJson(url, opt, label){
  opt = opt || {};
  try { opt.skipSizeCheck = true; } catch(_) {}
  return fetch(url, opt).then(function(r){
    if(!r || !r.ok) throw new Error((label || "HTTP") + " " + (r ? r.status : "no-response"));
    return r.text().then(function(t){
      try { return { response: r, data: JSON.parse(t) }; }
      catch(_) { throw new Error((label || "JSON") + " invalid JSON"); }
    });
  });
}

function getTmdbInfo(tmdbId, mediaType){
  var type = mediaType === "tv" ? "tv" : "movie";
  var u = "https://api.themoviedb.org/3/" + type + "/" + encodeURIComponent(String(tmdbId)) +
    "?api_key=" + encodeURIComponent(tmdbKey()) + "&language=en-US";
  return fetchJson(u, { headers: { "Accept":"application/json", "User-Agent":UA } }, "TMDB")
    .then(function(x){
      var d = x.data || {};
      var title = clean(d.title || d.name || d.original_title || d.original_name);
      var date = clean(d.release_date || d.first_air_date);
      var year = parseInt(date.slice(0,4),10) || 0;
      if(!title) throw new Error("TMDB title missing");
      diag("TMDB · " + title + (year ? " · " + year : ""));
      return { title:title, year:year };
    });
}

function getBearerToken(){
  if(bearerToken && bearerExpiry > now()) return Promise.resolve(bearerToken);

  var h;
  try {
    h = mergeHeaders(baseHeaders(), {
      "Authorization": "",
      "X-Request-Lang": "en",
      "X-Client-Token": clientTimeToken(),
      "Referer": MAIN_URL + "/"
    });
  } catch(e) {
    return Promise.reject(e);
  }

  return fetch(API_BASE + "/wefeed-h5api-bff/home?host=themoviebox.org", {
    headers: h,
    skipSizeCheck: true
  }).then(function(r){
    if(!r || !r.ok) throw new Error("home " + (r ? r.status : "no-response"));
    var xUser = "";
    try { xUser = clean(r.headers && r.headers.get && r.headers.get("x-user")); } catch(_) {}
    if(xUser){
      try {
        var j = JSON.parse(xUser);
        var t = clean(j && j.token);
        if(t){
          bearerToken = t;
          bearerExpiry = now() + 20 * 60 * 1000;
          diag("AUTH · bearer ok");
          return t;
        }
      } catch(_) {}
    }
    diag("AUTH · no bearer, continue anonymous");
    return "";
  }).catch(function(e){
    diag("AUTH · " + (e && e.message ? e.message : e));
    return "";
  });
}

function simple(v){
  return clean(v).toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^\s+|\s+$/g, "");
}

function titleScore(found, wanted){
  var a = simple(found), b = simple(wanted);
  if(!a || !b) return 0;
  if(a === b) return 200;
  if(a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return 120;
  var aa = a.split(" "), bb = b.split(" "), hit = 0;
  bb.forEach(function(t){ if(t.length > 1 && aa.indexOf(t) >= 0) hit++; });
  return bb.length ? Math.round(80 * hit / bb.length) : 0;
}

function itemYear(item){
  var vals = [
    item && item.releaseDate,
    item && item.release_date,
    item && item.year,
    item && item.releaseYear,
    item && item.firstAirDate
  ];
  for(var i=0;i<vals.length;i++){
    var m = clean(vals[i]).match(/(19\d{2}|20\d{2})/);
    if(m) return parseInt(m[1],10) || 0;
  }
  return 0;
}

function findBestItem(items, info, mediaType){
  var wantedTypes = mediaType === "tv" ? [2,3] : [1];
  var ranked = [];
  (items || []).forEach(function(item){
    var st = parseInt(item && item.subjectType,10) || 0;
    if(wantedTypes.indexOf(st) < 0) return;
    var title = clean(item && item.title);
    if(!title) return;
    var sc = titleScore(title, info.title);
    var y = itemYear(item);
    if(info.year && y) sc += Math.abs(info.year - y) <= 1 ? 35 : -15;
    ranked.push({ item:item, score:sc, title:title, year:y });
  });
  ranked.sort(function(a,b){ return b.score - a.score; });
  if(!ranked.length || ranked[0].score < 60) return null;
  return ranked[0];
}

function searchSubject(info, mediaType, token){
  var h;
  try {
    h = mergeHeaders(baseHeaders(), {
      "Authorization": token ? ("Bearer " + token) : "",
      "X-Request-Lang": "en",
      "X-Client-Token": clientTimeToken(),
      "Referer": MAIN_URL + "/"
    });
  } catch(e) {
    return Promise.reject(e);
  }

  return fetchJson(API_BASE + "/wefeed-h5api-bff/subject/search", {
    method: "POST",
    headers: h,
    body: JSON.stringify({
      keyword: info.title,
      page: 1,
      perPage: 28,
      subjectType: 0
    })
  }, "search").then(function(x){
    var items = x.data && x.data.data && x.data.data.items;
    items = Array.isArray(items) ? items : [];
    diag("SEARCH · " + items.length + " results");
    var best = findBestItem(items, info, mediaType);
    if(!best) throw new Error("no strong title match");
    diag("MATCH · " + best.title + " · score " + best.score);
    return best.item;
  });
}

function playSubject(item, season, episode){
  var subjectId = clean(item && item.subjectId);
  var detailPath = clean(item && item.detailPath);
  if(!subjectId || !detailPath) return Promise.reject(new Error("match missing id/path"));

  var h;
  try {
    h = mergeHeaders(baseHeaders(), {
      "X-Request-Lang": "en",
      "X-Client-Token": clientTimeToken(),
      "Referer": MAIN_URL + "/movies/" + detailPath
    });
  } catch(e) {
    return Promise.reject(e);
  }

  var u = API_BASE + "/wefeed-h5api-bff/subject/play?subjectId=" +
    encodeURIComponent(subjectId) +
    "&se=" + encodeURIComponent(String(season || 0)) +
    "&ep=" + encodeURIComponent(String(episode || 0)) +
    "&detailPath=" + encodeURIComponent(detailPath);

  return fetchJson(u, { headers:h }, "play").then(function(x){
    var d = x.data && x.data.data;
    if(!d || !d.hasResource) throw new Error("no resource");
    var rows = []
      .concat(Array.isArray(d.streams) ? d.streams : [])
      .concat(Array.isArray(d.hls) ? d.hls : [])
      .concat(Array.isArray(d.dash) ? d.dash : []);
    diag("PLAY · " + rows.length + " raw streams");
    return rows;
  });
}

function mediaTypeFromUrl(u){
  u = clean(u).toLowerCase();
  if(u.indexOf(".m3u8") >= 0) return "hls";
  if(u.indexOf(".mpd") >= 0) return "dash";
  return "mp4";
}

function qualityOf(row){
  var q = clean(row && (row.resolutions || row.resolution || row.quality || row.label));
  var m = q.match(/(2160|1440|1080|720|480|360|240)/);
  if(m) return m[1] === "2160" ? "4K" : (m[1] + "p");
  return q ? q.replace(/p$/i,"") + "p" : "Auto";
}

function normalizeStreams(rows, title, mediaType, season, episode){
  var out = [], seen = {};
  (rows || []).forEach(function(row, idx){
    var u = clean(row && row.url);
    if(!/^https?:\/\//i.test(u) || seen[u]) return;
    seen[u] = 1;
    var q = qualityOf(row);
    var t = title;
    if(mediaType === "tv") t += " · S" + season + "E" + episode;
    out.push({
      name: "CineVibe · Server 1",
      title: "CineVibe · Server 1 · " + q + (out.length ? " · " + (out.length + 1) : ""),
      url: u,
      quality: q,
      type: mediaTypeFromUrl(u),
      provider: "cinevibe-server1",
      headers: {
        "User-Agent": UA,
        "Referer": REFERER
      },
      subtitles: []
    });
  });

  out.sort(function(a,b){
    function n(q){
      if(q === "4K") return 2160;
      var m = String(q).match(/(\d+)/);
      return m ? parseInt(m[1],10) : 0;
    }
    return n(b.quality) - n(a.quality);
  });
  return out;
}

function getStreams(tmdbId, mediaType, season, episode){
  resetDiag();
  mediaType = mediaType === "tv" ? "tv" : "movie";
  season = parseInt(season,10) || 0;
  episode = parseInt(episode,10) || 0;

  if(!tmdbId) return Promise.resolve([]);
  if(mediaType === "tv" && (!season || !episode)){
    diag("TV · missing season/episode");
    flushDiag();
    return Promise.resolve([]);
  }

  return getTmdbInfo(String(tmdbId), mediaType)
    .then(function(info){
      return getBearerToken().then(function(token){
        return searchSubject(info, mediaType, token).then(function(item){
          return playSubject(item, season, episode).then(function(rows){
            var streams = normalizeStreams(rows, info.title, mediaType, season, episode);
            if(!streams.length) throw new Error("no direct http streams");
            diag("OK · " + streams.length + " playable rows");
            return streams;
          });
        });
      });
    })
    .catch(function(e){
      diag("FAIL · " + (e && e.message ? e.message : e));
      flushDiag();
      return [];
    });
}

function onSettings(){
  return [
    { type:"header", label:"CineVibe Local · Server 1" },
    {
      type:"info",
      label:"直接解析 CineVibe 默认 Server 1 对应的 MovieBox/OneRoom 后端，不依赖 vidsuper.net。"
    },
    {
      type:"text",
      key:"tmdbApiKey",
      label:"TMDB API Key（可选）",
      description:"留空使用公共备用 Key；若遇到限流可填写自己的 TMDB v3 API Key。",
      defaultValue:"",
      isPassword:true
    }
  ];
}

module.exports = {
  getStreams: getStreams,
  onSettings: onSettings
};
