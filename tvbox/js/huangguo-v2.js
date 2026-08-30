// 黄果短剧 - OK影视 / TVBox drpy2 适配版 v2
// v2: 增加 AES-128-CBC 加密封面的本地代理解密。
// 图片 key/iv 来自站点前端 crypto-worker.js：
// key = f5d965df75336270, iv = 97b60394abc2fbe1（均按 UTF-8 16 bytes 使用）

var rule = {
    title: '黄果短剧',
    host: 'https://huangguoai.com',
    homeUrl: '/',
    url: '/fyclass/fypage/',
    searchUrl: '/search/video/**/',
    searchable: 2,
    quickSearch: 1,
    filterable: 0,
    play_parse: true,
    class_name: '首页&AI成人短剧&AI成人漫剧&AI换脸&AI魔改&排行榜',
    class_url: 'home&ai-duanju&ai-manju&ai-huanlian&ai-mogai&ranks/hot',
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://huangguoai.com/'
    },

    // OK影视本地代理：获取封面二进制 -> AES-CBC 解密 -> Base64 返回给壳解码成图片流。
    // 返回第5项 1 表示第3项为 Base64。
    proxy_rule: `js:
        function hgMime(hex) {
            hex = String(hex || '').toLowerCase();
            if (hex.indexOf('ffd8') === 0) return 'image/jpeg';
            if (hex.indexOf('89504e470d0a1a0a') === 0) return 'image/png';
            if (hex.indexOf('52494646') === 0 && hex.indexOf('57454250') === 16) return 'image/webp';
            if (hex.indexOf('474946383761') === 0 || hex.indexOf('474946383961') === 0) return 'image/gif';
            return '';
        }
        function hgTrimImage(hex, mime) {
            hex = String(hex || '').toLowerCase();
            if (hex.length >= 2) {
                var pad = parseInt(hex.slice(-2), 16);
                if (pad > 0 && pad <= 16 && hex.length >= pad * 2) {
                    var b = pad.toString(16);
                    if (b.length < 2) b = '0' + b;
                    var ok = true;
                    for (var i = hex.length - pad * 2; i < hex.length; i += 2) {
                        if (hex.slice(i, i + 2) !== b) { ok = false; break; }
                    }
                    if (ok) hex = hex.slice(0, -pad * 2);
                }
            }
            if (mime === 'image/jpeg') {
                var j = hex.lastIndexOf('ffd9');
                if (j >= 0) hex = hex.slice(0, j + 4);
            } else if (mime === 'image/png') {
                var p = hex.lastIndexOf('49454e44ae426082');
                if (p >= 0) hex = hex.slice(0, p + 16);
            }
            return hex;
        }

        var imgUrl = input && input.url ? String(input.url) : '';
        if (!imgUrl) {
            input = [400, 'text/plain', 'Missing image url'];
        } else {
            try {
                var b64 = request(imgUrl, {
                    headers: {
                        'User-Agent': rule.headers['User-Agent'],
                        'Referer': rule.host + '/',
                        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
                    },
                    toBase64: true
                });
                b64 = String(b64 || '').replace(/^data:[^,]+,/, '').trim();
                if (!b64) throw new Error('empty image response');

                var raw = CryptoJS.enc.Base64.parse(b64);
                var rawHex = CryptoJS.enc.Hex.stringify(raw).toLowerCase();
                var rawMime = hgMime(rawHex);
                if (rawMime) {
                    input = [200, rawMime, b64, {'Cache-Control':'public, max-age=86400'}, 1];
                } else if (!raw.sigBytes || raw.sigBytes % 16 !== 0) {
                    input = [200, 'application/octet-stream', b64, {'Cache-Control':'public, max-age=3600'}, 1];
                } else {
                    var key = CryptoJS.enc.Utf8.parse('f5d965df75336270');
                    var iv  = CryptoJS.enc.Utf8.parse('97b60394abc2fbe1');
                    var pt = CryptoJS.AES.decrypt(
                        {ciphertext: raw},
                        key,
                        {iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.NoPadding}
                    );
                    var hex = CryptoJS.enc.Hex.stringify(pt).toLowerCase();
                    var mime = hgMime(hex);
                    if (!mime) {
                        input = [200, 'application/octet-stream', b64, {'Cache-Control':'public, max-age=3600'}, 1];
                    } else {
                        hex = hgTrimImage(hex, mime);
                        var out = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Hex.parse(hex));
                        input = [200, mime, out, {'Cache-Control':'public, max-age=86400'}, 1];
                    }
                }
            } catch (e) {
                input = [502, 'text/plain', 'Huangguo image proxy error: ' + e.message];
            }
        }
    `,

    推荐: `js:
        function fix(u){ if(!u)return ''; if(u.indexOf('//')===0)return 'https:'+u; if(u.indexOf('/')===0)return rule.host+u; return u; }
        function txt(s){ return String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim(); }
        function pic(u){
            u=fix(u||'');
            if(!u)return '';
            if(u.indexOf('?')>=0)u=u.replace(/\\?.*$/,'');
            return getProxyUrl()+'&type=hgimg&url='+encodeURIComponent(u);
        }
        function grids(src,all){ var re=/<div\\s+class=["'][^"']*\\bhg-card-grid\\b[^"']*["'][^>]*>/g,a=[],m; while((m=re.exec(src))!==null)a.push(m.index+m[0].length); var o=[]; for(var i=0;i<(all?a.length:Math.min(1,a.length));i++)o.push(src.slice(a[i],i+1<a.length?a[i+1]:src.length)); return o; }
        function cards(slice){ var re=/<div\\s+class=["'][^"']*\\bhg-drama-card\\b[^"']*["'][^>]*>/g,a=[],m,o=[]; while((m=re.exec(slice))!==null)a.push(m.index+m[0].length); for(var i=0;i<a.length;i++)o.push(slice.slice(a[i],i+1<a.length?a[i+1]:slice.length)); return o; }
        var html=request(rule.host+'/',{headers:rule.headers}), out=[], seen={};
        var gs=grids(html,true);
        for(var g=0;g<gs.length;g++){
            var cs=cards(gs[g]);
            for(var i=0;i<cs.length;i++){
                var b=cs[i],a=b.match(/href=["'][^"']*\\/detail\\/(\\d+)\\/[^"']*["']/); if(!a||seen[a[1]])continue;
                var id=a[1],im=b.match(/data-src=["']([^"']+)["']/)||b.match(/src=["']([^"']+)["']/);
                var tm=b.match(/hg-drama-card__title[^>]*>([\\s\\S]*?)<\\/a>/); if(!tm)tm=b.match(/<a[^>]+href=["'][^"']*\\/detail\\/\\d+\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/);
                var name=tm?txt(tm[1]):''; if(!name)continue;
                var ep=b.match(/hg-drama-card__episode[^>]*>([\\s\\S]*?)<\\/span>/), sc=b.match(/hg-drama-card__score[^>]*>([\\s\\S]*?)<\\/span>/);
                var r=ep?txt(ep[1]):'', s=sc?txt(sc[1]):''; seen[id]=1;
                out.push({vod_id:rule.host+'/detail/'+id+'/',vod_name:name,vod_pic:pic(im?im[1]:''),vod_remarks:r&&s?r+' · '+s:(r||s)});
            }
        }
        VODS=out;
    `,

    一级: `js:
        function fix(u){ if(!u)return ''; if(u.indexOf('//')===0)return 'https:'+u; if(u.indexOf('/')===0)return rule.host+u; return u; }
        function txt(s){ return String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim(); }
        function pic(u){ u=fix(u||''); if(!u)return ''; if(u.indexOf('?')>=0)u=u.replace(/\\?.*$/,''); return getProxyUrl()+'&type=hgimg&url='+encodeURIComponent(u); }
        function parseCards(src,all){
            var gre=/<div\\s+class=["'][^"']*\\bhg-card-grid\\b[^"']*["'][^>]*>/g,gs=[],m; while((m=gre.exec(src))!==null)gs.push(m.index+m[0].length);
            var out=[],seen={},gn=all?gs.length:Math.min(1,gs.length);
            for(var g=0;g<gn;g++){
                var sl=src.slice(gs[g],g+1<gs.length?gs[g+1]:src.length), re=/<div\\s+class=["'][^"']*\\bhg-drama-card\\b[^"']*["'][^>]*>/g,bs=[],x;
                while((x=re.exec(sl))!==null)bs.push(x.index+x[0].length);
                for(var i=0;i<bs.length;i++){
                    var b=sl.slice(bs[i],i+1<bs.length?bs[i+1]:sl.length),a=b.match(/href=["'][^"']*\\/detail\\/(\\d+)\\/[^"']*["']/); if(!a||seen[a[1]])continue;
                    var id=a[1],im=b.match(/data-src=["']([^"']+)["']/)||b.match(/src=["']([^"']+)["']/),tm=b.match(/hg-drama-card__title[^>]*>([\\s\\S]*?)<\\/a>/);
                    if(!tm)tm=b.match(/<a[^>]+href=["'][^"']*\\/detail\\/\\d+\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/);
                    var name=tm?txt(tm[1]):''; if(!name)continue;
                    var ep=b.match(/hg-drama-card__episode[^>]*>([\\s\\S]*?)<\\/span>/),sc=b.match(/hg-drama-card__score[^>]*>([\\s\\S]*?)<\\/span>/),r=ep?txt(ep[1]):'',s=sc?txt(sc[1]):'';
                    seen[id]=1; out.push({vod_id:rule.host+'/detail/'+id+'/',vod_name:name,vod_pic:pic(im?im[1]:''),vod_remarks:r&&s?r+' · '+s:(r||s)});
                }
            }
            return out;
        }
        function parseRanks(src){
            var lm=src.match(/<div\\s+class=["'][^"']*\\bhg-rank-list\\b[^"']*["'][^>]*>/),sl=src.slice(lm?lm.index+lm[0].length:0),re=/<div\\s+class=["'][^"']*\\bhg-rank-item\\b[^"']*["'][^>]*>/g,bs=[],m,out=[],seen={};
            while((m=re.exec(sl))!==null)bs.push(m.index+m[0].length);
            for(var i=0;i<bs.length;i++){
                var b=sl.slice(bs[i],i+1<bs.length?bs[i+1]:sl.length),a=b.match(/href=["'][^"']*\\/detail\\/(\\d+)\\/[^"']*["']/); if(!a||seen[a[1]])continue;
                var id=a[1],im=b.match(/data-src=["']([^"']+)["']/)||b.match(/src=["']([^"']+)["']/),tm=b.match(/hg-rank-item__title[^>]*>([\\s\\S]*?)<\\/h2>/);
                if(!tm)tm=b.match(/<a[^>]+href=["'][^"']*\\/detail\\/\\d+\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/);
                var name=tm?txt(tm[1]):''; if(!name)continue; var tags=b.match(/hg-rank-item__tags[^>]*>([\\s\\S]*?)<\\/div>/); seen[id]=1;
                out.push({vod_id:rule.host+'/detail/'+id+'/',vod_name:name,vod_pic:pic(im?im[1]:''),vod_remarks:tags?txt(tags[1]):''});
            }
            return out;
        }
        var cate=String(MY_CATE||'home').replace(/^\\//,''),pg=parseInt(MY_PAGE||1)||1,target;
        if(cate==='home')target=rule.host+'/'; else target=rule.host+'/'+cate+'/'+(pg>1?pg+'/':'');
        var html=request(target,{headers:rule.headers}); VODS=cate.indexOf('rank')>=0?parseRanks(html):parseCards(html,cate==='home');
    `,

    二级: `js:
        function fix(u){ if(!u)return ''; if(u.indexOf('//')===0)return 'https:'+u; if(u.indexOf('/')===0)return rule.host+u; return u; }
        function txt(s){ return String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim(); }
        function pic(u){ u=fix(u||''); if(!u)return ''; if(u.indexOf('?')>=0)u=u.replace(/\\?.*$/,''); return getProxyUrl()+'&type=hgimg&url='+encodeURIComponent(u); }
        function meta(src,name){ var re=new RegExp('<meta[^>]+(?:property|name)=["\\\\\']'+name+'["\\\\\'][^>]+content=["\\\\\']([^"\\\\\']+)["\\\\\']','i'),m=src.match(re); if(!m){re=new RegExp('<meta[^>]+content=["\\\\\']([^"\\\\\']+)["\\\\\'][^>]+(?:property|name)=["\\\\\']'+name+'["\\\\\']','i');m=src.match(re);} return m?txt(m[1]):''; }
        var url=String(input||''); if(url.indexOf('http')!==0)url=fix(url); var html=request(url,{headers:rule.headers});
        var idm=url.match(/\\/detail\\/(\\d+)\\//),vid=idm?idm[1]:url,tm=html.match(/<h1[^>]*>([\\s\\S]*?)<\\/h1>/i),name=tm?txt(tm[1]):meta(html,'og:title').replace(/\\s*[-|].*$/,'');
        var rawPic=meta(html,'og:image'); if(!rawPic){var im=html.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i); if(im)rawPic=im[1];}
        var content=meta(html,'description'),remarks='',rm=html.match(/hg-web-detail__meta[^>]*>([\\s\\S]*?)<\\/div>/i); if(rm)remarks=txt(rm[1]);
        var plays=[],grid=html.match(/<div\\s+class=["'][^"']*\\bhg-web-detail__ep-grid\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>/i);
        if(grid){var are=/<a\\b[^>]*>[\\s\\S]*?<\\/a>/gi,am; while((am=are.exec(grid[1]))!==null){var tag=am[0],hm=tag.match(/href=["']([^"']+)["']/i); if(!hm)continue; var em=tag.match(/data-ep-id=["']([^"']*)["']/i),ep=em&&em[1]?em[1]:txt(tag).replace(/^0+/,''); if(!ep)ep=String(plays.length+1); plays.push('第'+ep+'集$'+fix(hm[1])+'@@ep='+encodeURIComponent(ep));}}
        if(!plays.length){var pm=html.match(/<a\\b[^>]*class=["'][^"']*\\bhg-web-detail__play\\b[^"']*["'][^>]*href=["']([^"']+)["']/i); if(pm)plays.push('第1集$'+fix(pm[1])+'@@ep=1');}
        VOD={vod_id:vid,vod_name:name||'黄果短剧',vod_pic:pic(rawPic),vod_remarks:remarks,vod_content:content||'',vod_play_from:'黄果短剧',vod_play_url:plays.join('#')};
    `,

    搜索: `js:
        function fix(u){ if(!u)return ''; if(u.indexOf('//')===0)return 'https:'+u; if(u.indexOf('/')===0)return rule.host+u; return u; }
        function txt(s){ return String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim(); }
        function pic(u){ u=fix(u||''); if(!u)return ''; if(u.indexOf('?')>=0)u=u.replace(/\\?.*$/,''); return getProxyUrl()+'&type=hgimg&url='+encodeURIComponent(u); }
        var html=request(input,{headers:rule.headers}),gre=/<div\\s+class=["'][^"']*\\bhg-card-grid\\b[^"']*["'][^>]*>/g,gs=[],m; while((m=gre.exec(html))!==null)gs.push(m.index+m[0].length);
        var out=[],seen={}; if(gs.length){var sl=html.slice(gs[0],gs.length>1?gs[1]:html.length),re=/<div\\s+class=["'][^"']*\\bhg-drama-card\\b[^"']*["'][^>]*>/g,bs=[],x; while((x=re.exec(sl))!==null)bs.push(x.index+x[0].length);
            for(var i=0;i<bs.length;i++){var b=sl.slice(bs[i],i+1<bs.length?bs[i+1]:sl.length),a=b.match(/href=["'][^"']*\\/detail\\/(\\d+)\\/[^"']*["']/); if(!a||seen[a[1]])continue; var id=a[1],im=b.match(/data-src=["']([^"']+)["']/)||b.match(/src=["']([^"']+)["']/),tm=b.match(/hg-drama-card__title[^>]*>([\\s\\S]*?)<\\/a>/); if(!tm)continue; var name=txt(tm[1]); if(!name)continue; seen[id]=1; out.push({vod_id:rule.host+'/detail/'+id+'/',vod_name:name,vod_pic:pic(im?im[1]:''),vod_remarks:''});}}
        VODS=out;
    `,

    lazy: `js:
        var raw=String(input||''),ep='1',mark=raw.lastIndexOf('@@ep='); if(mark>=0){ep=decodeURIComponent(raw.slice(mark+5))||'1';raw=raw.slice(0,mark);}
        var h={'User-Agent':rule.headers['User-Agent'],'Accept':rule.headers['Accept'],'Accept-Language':rule.headers['Accept-Language'],'Referer':rule.host+'/'};
        var html=request(raw,{headers:h}),play='',m=html.match(/id=["']videoInitialData["'][^>]*>([\\s\\S]*?)<\\/script>/i);
        if(m){try{var data=JSON.parse(m[1]),srcs=data&&data.epPlaySrcs?data.epPlaySrcs:{};play=srcs[ep]||(data&&data.videoSrc?data.videoSrc:'');}catch(e){}}
        if(play){play=String(play).replace(/\\u0026/g,'&');input={parse:0,jx:0,url:play,header:{'User-Agent':rule.headers['User-Agent'],'Referer':rule.host+'/'}};}else{input={parse:1,jx:0,url:raw,header:h};}
    `
};
