const express = require('express');
const { TmdbClient } = require('./lib/tmdb');
const { subtitles } = require('./lib/subtitles');
const { decodeConfig, validTmdbKey } = require('./lib/config');
const {
  MOVIE_GENRES, TV_GENRES, MOVIE_SECTIONS, TV_SECTIONS,
  SORT_OPTIONS, yearOptions
} = require('./lib/constants');

const app = express();
app.disable('x-powered-by');

app.use((req,res,next) => {
  res.set('Access-Control-Allow-Origin','*');
  res.set('Access-Control-Allow-Headers','*');
  res.set('Access-Control-Allow-Methods','GET,HEAD,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function sendJson(res, obj, maxAge=300) {
  res.set('Content-Type','application/json; charset=utf-8');
  res.set('Cache-Control', `public, max-age=${maxAge}, stale-while-revalidate=86400`);
  res.status(200).send(JSON.stringify(obj));
}

function catalogDef(type) {
  const isSeries = type === 'series';
  const sections = isSeries ? TV_SECTIONS : MOVIE_SECTIONS;
  const genres = (isSeries ? TV_GENRES : MOVIE_GENRES).map(x => x[1]);
  return {
    type,
    id: isSeries ? 'cinejoy_series' : 'cinejoy_movies',
    name: isSeries ? 'Cinejoy · 剧集' : 'Cinejoy · 电影',
    extra: [
      { name:'genre', isRequired:false, options:[...sections, ...genres], optionsLimit:1 },
      { name:'year', isRequired:false, options:yearOptions(), optionsLimit:1 },
      { name:'sort', isRequired:false, options:SORT_OPTIONS, optionsLimit:1 },
      { name:'search', isRequired:false },
      { name:'skip', isRequired:false }
    ]
  };
}

function manifest(configured=false) {
  return {
    id:'com.feixiangdao.cinejoy',
    version:'0.2.0',
    name:'Cinejoy',
    description:'Cinejoy for Stremio / Nuvio：TMDB 分类、详情、搜索与中文字幕聚合。',
    resources:[
      'catalog',
      { name:'meta', types:['movie','series'], idPrefixes:['tt'] },
      { name:'subtitles', types:['movie','series'], idPrefixes:['tt'] }
    ],
    types:['movie','series'],
    catalogs:[catalogDef('movie'),catalogDef('series')],
    behaviorHints:{
      configurable:true,
      configurationRequired:!configured
    }
  };
}

function parseExtra(raw='') {
  const out={};
  const s=String(raw||'').replace(/\.json$/,'');
  if (!s) return out;
  for (const piece of s.split('&')) {
    const i=piece.indexOf('=');
    if (i<0) continue;
    const k=decodeURIComponent(piece.slice(0,i));
    const v=decodeURIComponent(piece.slice(i+1));
    out[k]=v;
  }
  return out;
}

function cfgFromReq(req) {
  return decodeConfig(req.params.cfg || '');
}

function clientFromReq(req) {
  const cfg=cfgFromReq(req);
  if (!validTmdbKey(cfg.tmdbKey)) return {cfg,client:null};
  return {cfg,client:new TmdbClient(cfg.tmdbKey,cfg.language||'zh-CN')};
}

function safeHtml(s) {
  return String(s||'')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function configureHtml(req) {
  const origin=`${req.protocol}://${req.get('host')}`;
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cinejoy 配置</title>
<style>
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0e0f13;color:#f4f4f5;margin:0;padding:24px}
.wrap{max-width:720px;margin:0 auto}
.card{background:#181a20;border:1px solid #2a2d35;border-radius:16px;padding:22px;margin-bottom:18px}
h1{margin:0 0 8px;font-size:28px}.muted{color:#a1a1aa;font-size:14px;line-height:1.6}
label{display:block;margin:18px 0 8px;font-weight:600}
input,select{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid #343843;background:#101217;color:#fff;font-size:15px}
button,a.btn{display:inline-block;border:0;border-radius:10px;padding:12px 18px;background:#7c3aed;color:white;text-decoration:none;font-weight:700;cursor:pointer;margin:14px 8px 0 0}
button.secondary{background:#30343d}
pre{white-space:pre-wrap;word-break:break-all;background:#0b0c10;padding:12px;border-radius:10px;color:#d4d4d8}
.note{color:#fbbf24}
</style>
</head>
<body><div class="wrap">
<div class="card">
<h1>Cinejoy</h1>
<div class="muted">首页只保留「Cinejoy · 电影」和「Cinejoy · 剧集」两行。推荐、热门、正在上映、类型、年份、排序等都放在 Catalog 筛选里，不使用 Deep Link。</div>
<label>TMDB API v3 Key</label>
<input id="tmdb" autocomplete="off" placeholder="32位 TMDB API v3 Key">
<label>SubDL API Key（可选）</label>
<input id="subdl" autocomplete="off" placeholder="SubDL API Key">
<label>语言</label>
<select id="lang"><option value="zh-CN">简体中文</option><option value="zh-TW">繁体中文</option><option value="en-US">English</option></select>
<button onclick="make()">生成安装地址</button>
</div>
<div class="card" id="result" style="display:none">
<div class="muted">Manifest URL：</div>
<pre id="url"></pre>
<button class="secondary" onclick="copyUrl()">复制地址</button>
<a class="btn" id="install" href="#">用 Stremio 打开</a>
<div class="muted note">如果设备装了多个 Stremio 分支，“用 Stremio 打开”仍可能出现系统 App 选择器；这种情况下直接复制 Manifest URL，在目标客户端里手动添加即可。分类浏览本身完全不再使用 Deep Link。</div>
</div>
<div class="card"><div class="muted">Key 不写入 GitHub。由于这是远程 addon，配置后的 Manifest URL 会携带经过 Base64URL 编码的配置，服务端调用 TMDB/SubDL 时会读取它；这不是加密，因此不要公开分享自己的配置 URL。</div></div>
</div>
<script>
const origin=${JSON.stringify(origin)};
function b64url(obj){
  const bytes=new TextEncoder().encode(JSON.stringify(obj));
  let bin=''; for(const b of bytes) bin+=String.fromCharCode(b);
  return btoa(bin).split('+').join('-').split('/').join('_').replace(/=+$/,'');
}
function make(){
  const tmdb=document.getElementById('tmdb').value.trim();
  if(!/^[a-f0-9]{32}$/i.test(tmdb)){alert('请输入有效的32位 TMDB API v3 Key');return;}
  const token=b64url({
    tmdbKey:tmdb,
    subdlKey:document.getElementById('subdl').value.trim(),
    language:document.getElementById('lang').value
  });
  const url=origin+'/'+token+'/manifest.json';
  document.getElementById('url').textContent=url;
  document.getElementById('install').href='stremio://'+url.replace('https://','').replace('http://','');
  document.getElementById('result').style.display='block';
}
async function copyUrl(){
  await navigator.clipboard.writeText(document.getElementById('url').textContent);
}
</script>
</body></html>`;
}

app.get('/', (req,res) => res.redirect('/configure'));
app.get('/configure', (req,res) => {
  res.set('Content-Type','text/html; charset=utf-8');
  res.set('Cache-Control','no-store');
  res.send(configureHtml(req));
});
app.get('/manifest.json', (req,res) => sendJson(res,manifest(false),60));
app.get('/:cfg/manifest.json', (req,res) => {
  const cfg=cfgFromReq(req);
  sendJson(res,manifest(validTmdbKey(cfg.tmdbKey)),60);
});

async function catalogHandler(req,res,extra={}) {
  const {cfg,client}=clientFromReq(req);
  if (!client) return sendJson(res,{metas:[]},30);
  const type=req.params.type;
  const expected=type==='series'?'cinejoy_series':'cinejoy_movies';
  if (!['movie','series'].includes(type) || req.params.id!==expected) return sendJson(res,{metas:[]},60);
  try{
    const metas=await client.catalog(type,extra);
    sendJson(res,{metas},300);
  }catch(e){
    sendJson(res,{metas:[]},30);
  }
}

app.get('/:cfg/catalog/:type/:id.json',(req,res)=>catalogHandler(req,res,{}));
app.get('/:cfg/catalog/:type/:id/:extra.json',(req,res)=>catalogHandler(req,res,parseExtra(req.params.extra)));

app.get('/:cfg/meta/:type/:id.json', async (req,res) => {
  const {client}=clientFromReq(req);
  if (!client || !['movie','series'].includes(req.params.type)) return sendJson(res,{meta:null},30);
  try{
    const meta=await client.detail(req.params.type,req.params.id);
    sendJson(res,{meta:meta||null},600);
  }catch(e){
    sendJson(res,{meta:null},30);
  }
});

async function subtitleHandler(req,res){
  const {cfg,client}=clientFromReq(req);
  if (!client || !['movie','series'].includes(req.params.type)) return sendJson(res,{subtitles:[]},30);
  try{
    const rows=await subtitles({
      config:cfg,
      type:req.params.type,
      id:req.params.id,
      tmdbClient:client
    });
    sendJson(res,{subtitles:rows},300);
  }catch(e){
    sendJson(res,{subtitles:[]},30);
  }
}

app.get('/:cfg/subtitles/:type/:id.json',subtitleHandler);
app.get('/:cfg/subtitles/:type/:id/:extra.json',subtitleHandler);

app.get('/healthz',(req,res)=>sendJson(res,{ok:true,service:'cinejoy-stremio'},0));

app.use((req,res)=>res.status(404).json({error:'Not found'}));

module.exports=app;
