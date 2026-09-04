// 黄果短剧诊断版：不使用任何本地 proxy，播放返回不带 header，并使用全新 key 绕过旧缓存。
var rule = {};
try {
    var _src = request('https://raw.githubusercontent.com/feixiangdao/test1/main/tvbox/js/huangguo.js');
    _src = String(_src || '').replace('var rule =', 'rule =');
    eval(_src);
} catch (e) {
    rule = {title:'黄果短剧-诊断版',host:'https://huangguoai.com'};
}

rule.title = '黄果短剧-诊断版';
rule.lazy = `js:
    function _pick(v){
        if(!v)return '';
        if(typeof v==='string')return v;
        if(typeof v==='object')return v.url||v.src||v.play_url||v.playUrl||v.file||'';
        return String(v||'');
    }
    function _clean(v){
        v=_pick(v);
        if(!v)return '';
        v=String(v).replace(/\\u0026/g,'&').replace(/\\u003d/g,'=').replace(/\\u002f/g,'/').replace(/\\\//g,'/').trim();
        if(v.indexOf('//')===0)return 'https:'+v;
        if(v.indexOf('/')===0)return rule.host+v;
        if(v.indexOf('http')===0)return v;
        var mm=v.match(/https?:\\/\\/[^\\s"'<>]+/i);
        return mm?mm[0]:'';
    }
    var raw=String(input||''),ep='1',mark=raw.lastIndexOf('@@ep=');
    if(mark>=0){ep=decodeURIComponent(raw.slice(mark+5))||'1';raw=raw.slice(0,mark);}
    var html=request(raw,{headers:{'User-Agent':rule.headers['User-Agent'],'Referer':rule.host+'/'}});
    var play='',m=html.match(/id=["']videoInitialData["'][^>]*>([\\s\\S]*?)<\\/script>/i);
    if(m){
        try{
            var data=JSON.parse(m[1]),srcs=data&&data.epPlaySrcs?data.epPlaySrcs:{};
            var epNum=String(parseInt(ep,10)||ep),ep2=epNum.length<2?'0'+epNum:epNum;
            play=_pick(srcs[ep])||_pick(srcs[epNum])||_pick(srcs[ep2])||_pick(data&&data.videoSrc)||_pick(data&&data.src)||_pick(data&&data.url);
        }catch(e){}
    }
    play=_clean(play);
    if(!play){
        var mm=html.match(/https?:\\?\\/\\?\\/[^\\s"'<>]+?\\.m3u8(?:\\?[^\\s"'<>]*)?/i);
        if(mm)play=_clean(mm[0]);
    }
    if(!play){
        var sm=html.match(/<(?:source|video)[^>]+src=["']([^"']+)["']/i);
        if(sm)play=_clean(sm[1]);
    }
    if(play){
        input={parse:0,jx:0,url:play};
    }else{
        input={parse:0,jx:0,url:raw};
    }
`;
