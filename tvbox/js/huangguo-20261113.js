// 黄果短剧 - OK影视 / drpy2 当前结构适配版 2026-11-13
// 适配：/detail/ 与 /video/；hg-web-play__ep 与旧 ep-grid；新 playback API。
// 播放最终只返回 parse:0 + url，不附带 header，不使用 OK影视本地 proxy。
// 封面采用上游当前公开使用的外部 HTTPS 图片代理签名方案。

var rule = {
    title: '黄果短剧-20261113',
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

    推荐: `js:
        function fix(u){if(!u)return '';if(u.indexOf('//')===0)return 'https:'+u;if(u.indexOf('/')===0)return rule.host+u;return u;}
        function txt(s){return String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();}
        function pic(u){
            u=fix(u||''); if(!u)return '';
            if(u.indexOf('?')>=0)u=u.replace(/\\?.*$/,'');
            try{
                var C=(typeof CryptoJS!=='undefined'&&CryptoJS)?CryptoJS:(typeof createCryptoJS==='function'?createCryptoJS():null);
                if(!C||!C.HmacSHA256)return u;
                var exp=Math.floor(Date.now()/1000)+21600;
                var secret='6482883d232408ab8658992a0bfc32574649c37e049847a9ab84dde61c6cfe35';
                var sig=C.HmacSHA256(u+'\\n'+exp,secret).toString(C.enc.Hex);
                return 'https://huangguo.498246.xyz/img?url='+encodeURIComponent(u)+'&exp='+exp+'&sig='+sig;
            }catch(e){return u;}
        }
        function parse(src,all){
            var gre=/<div\\s+class=["'][^"']*\\bhg-card-grid\\b[^"']*["'][^>]*>/g,gs=[],m;
            while((m=gre.exec(src))!==null)gs.push(m.index+m[0].length);
            var out=[],seen={},gn=all?gs.length:Math.min(1,gs.length);
            for(var g=0;g<gn;g++){
                var sl=src.slice(gs[g],g+1<gs.length?gs[g+1]:src.length);
                var re=/<div\\s+class=["'][^"']*\\bhg-drama-card\\b[^"']*["'][^>]*>/g,bs=[],x;
                while((x=re.exec(sl))!==null)bs.push(x.index+x[0].length);
                for(var i=0;i<bs.length;i++){
                    var b=sl.slice(bs[i],i+1<bs.length?bs[i+1]:sl.length);
                    var a=b.match(/href=["']([^"']*\\/(?:detail|video)\\/(\\d+)\\/[^"']*)["']/i);
                    if(!a||seen[a[2]])continue;
                    var id=a[2],im=b.match(/data-src=["']([^"']+)["']/i)||b.match(/src=["']([^"']+)["']/i);
                    var tm=b.match(/hg-drama-card__title[^>]*>([\\s\\S]*?)<\\/a>/i);
                    if(!tm)tm=b.match(/<a[^>]+href=["'][^"']*\\/(?:detail|video)\\/\\d+\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/i);
                    var name=tm?txt(tm[1]):''; if(!name)continue;
                    var ep=b.match(/hg-drama-card__episode[^>]*>([\\s\\S]*?)<\\/span>/i),sc=b.match(/hg-drama-card__score[^>]*>([\\s\\S]*?)<\\/span>/i);
                    var r=ep?txt(ep[1]):'',s=sc?txt(sc[1]):''; seen[id]=1;
                    out.push({vod_id:fix(a[1]),vod_name:name,vod_pic:pic(im?im[1]:''),vod_remarks:s||r});
                }
            }
            return out;
        }
        function fallback(src){
            var out=[],seen={},re=/<a\\b([^>]*)href=[\"']([^\"']*\\/(?:video|detail)\\/(\\d+)\\/?[^\"']*)[\"']([^>]*)>([\\s\\S]*?)<\\/a>/gi,m;
            while((m=re.exec(src))!==null){
                var id=m[3]; if(seen[id])continue;
                var attrs=(m[1]||'')+' '+(m[4]||''),inner=m[5]||'',name='';
                var ta=attrs.match(/(?:title|aria-label)=[\"']([^\"']+)[\"']/i); if(ta)name=txt(ta[1]);
                if(!name){
                    var q=txt(inner).match(/《([^》]+)》/); if(q)name=q[1].trim();
                }
                if(!name)name=txt(inner);
                name=name.replace(/^立即(?:播放|观看)/,'').replace(/^(?:播放|观看)/,'').trim();
                if(!name||/^\\d{1,3}$/.test(name)||name==='收藏'||name==='反馈')continue;
                var from=Math.max(0,m.index-1200),to=Math.min(src.length,re.lastIndex+1200),near=src.slice(from,to);
                var ims=[],ir=/<img\\b[^>]*(?:data-src|src)=[\"']([^\"']+)[\"'][^>]*>/gi,im;
                while((im=ir.exec(near))!==null)ims.push(im[1]);
                var u=fix(m[2]),pv=ims.length?pic(ims[0]):'';
                seen[id]=1;out.push({vod_id:u,vod_name:name,vod_pic:pv,vod_remarks:''});
            }
            return out;
        }
        var html=request(rule.host+'/',{headers:rule.headers});
        VODS=parse(html,true);
        if(!VODS||!VODS.length)VODS=fallback(html);
    `,

    一级: `js:
        function fix(u){if(!u)return '';if(u.indexOf('//')===0)return 'https:'+u;if(u.indexOf('/')===0)return rule.host+u;return u;}
        function txt(s){return String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();}
        function pic(u){
            u=fix(u||''); if(!u)return ''; if(u.indexOf('?')>=0)u=u.replace(/\\?.*$/,'');
            try{
                var C=(typeof CryptoJS!=='undefined'&&CryptoJS)?CryptoJS:(typeof createCryptoJS==='function'?createCryptoJS():null);
                if(!C||!C.HmacSHA256)return u;
                var exp=Math.floor(Date.now()/1000)+21600,secret='6482883d232408ab8658992a0bfc32574649c37e049847a9ab84dde61c6cfe35';
                var sig=C.HmacSHA256(u+'\\n'+exp,secret).toString(C.enc.Hex);
                return 'https://huangguo.498246.xyz/img?url='+encodeURIComponent(u)+'&exp='+exp+'&sig='+sig;
            }catch(e){return u;}
        }
        function cards(src,all){
            var gre=/<div\\s+class=["'][^"']*\\bhg-card-grid\\b[^"']*["'][^>]*>/g,gs=[],m;
            while((m=gre.exec(src))!==null)gs.push(m.index+m[0].length);
            var out=[],seen={},gn=all?gs.length:Math.min(1,gs.length);
            for(var g=0;g<gn;g++){
                var sl=src.slice(gs[g],g+1<gs.length?gs[g+1]:src.length),re=/<div\\s+class=["'][^"']*\\bhg-drama-card\\b[^"']*["'][^>]*>/g,bs=[],x;
                while((x=re.exec(sl))!==null)bs.push(x.index+x[0].length);
                for(var i=0;i<bs.length;i++){
                    var b=sl.slice(bs[i],i+1<bs.length?bs[i+1]:sl.length),a=b.match(/href=["']([^"']*\\/(?:detail|video)\\/(\\d+)\\/[^"']*)["']/i);
                    if(!a||seen[a[2]])continue;
                    var id=a[2],im=b.match(/data-src=["']([^"']+)["']/i)||b.match(/src=["']([^"']+)["']/i),tm=b.match(/hg-drama-card__title[^>]*>([\\s\\S]*?)<\\/a>/i);
                    if(!tm)tm=b.match(/<a[^>]+href=["'][^"']*\\/(?:detail|video)\\/\\d+\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/i);
                    var name=tm?txt(tm[1]):'';if(!name)continue;
                    var ep=b.match(/hg-drama-card__episode[^>]*>([\\s\\S]*?)<\\/span>/i),sc=b.match(/hg-drama-card__score[^>]*>([\\s\\S]*?)<\\/span>/i),r=ep?txt(ep[1]):'',s=sc?txt(sc[1]):'';
                    seen[id]=1;out.push({vod_id:fix(a[1]),vod_name:name,vod_pic:pic(im?im[1]:''),vod_remarks:s||r});
                }
            }
            return out;
        }
        function ranks(src){
            var lm=src.match(/<div\\s+class=["'][^"']*\\bhg-rank-list\\b[^"']*["'][^>]*>/i),sl=src.slice(lm?lm.index+lm[0].length:0);
            var re=/<div\\s+class=["'][^"']*\\bhg-rank-item\\b[^"']*["'][^>]*>/g,bs=[],m,out=[],seen={};
            while((m=re.exec(sl))!==null)bs.push(m.index+m[0].length);
            for(var i=0;i<bs.length;i++){
                var b=sl.slice(bs[i],i+1<bs.length?bs[i+1]:sl.length),a=b.match(/href=["']([^"']*\\/(?:detail|video)\\/(\\d+)\\/[^"']*)["']/i);
                if(!a||seen[a[2]])continue;
                var id=a[2],im=b.match(/data-src=["']([^"']+)["']/i)||b.match(/src=["']([^"']+)["']/i),tm=b.match(/hg-rank-item__title[^>]*>([\\s\\S]*?)<\\/h2>/i);
                if(!tm)tm=b.match(/<a[^>]+href=["'][^"']*\\/(?:detail|video)\\/\\d+\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/i);
                var name=tm?txt(tm[1]):'';if(!name)continue;var tags=b.match(/hg-rank-item__tags[^>]*>([\\s\\S]*?)<\\/div>/i);seen[id]=1;
                out.push({vod_id:fix(a[1]),vod_name:name,vod_pic:pic(im?im[1]:''),vod_remarks:tags?txt(tags[1]):''});
            }
            return out;
        }
        var cate=String(MY_CATE||'home').replace(/^\\//,''),pg=parseInt(MY_PAGE||1)||1,target;
        if(cate==='home')target=rule.host+'/';else target=rule.host+'/'+cate+'/'+(pg>1?pg+'/':'');
        function fallback(src){
            var out=[],seen={},re=/<a\\b([^>]*)href=[\"']([^\"']*\\/(?:video|detail)\\/(\\d+)\\/?[^\"']*)[\"']([^>]*)>([\\s\\S]*?)<\\/a>/gi,m;
            while((m=re.exec(src))!==null){
                var id=m[3];if(seen[id])continue;
                var attrs=(m[1]||'')+' '+(m[4]||''),inner=m[5]||'',name='';
                var ta=attrs.match(/(?:title|aria-label)=[\"']([^\"']+)[\"']/i);if(ta)name=txt(ta[1]);
                if(!name){var q=txt(inner).match(/《([^》]+)》/);if(q)name=q[1].trim();}
                if(!name)name=txt(inner);
                name=name.replace(/^立即(?:播放|观看)/,'').replace(/^(?:播放|观看)/,'').trim();
                if(!name||/^\\d{1,3}$/.test(name)||name==='收藏'||name==='反馈')continue;
                var from=Math.max(0,m.index-1200),to=Math.min(src.length,re.lastIndex+1200),near=src.slice(from,to);
                var im=near.match(/<img\\b[^>]*(?:data-src|src)=[\"']([^\"']+)[\"'][^>]*>/i);
                seen[id]=1;out.push({vod_id:fix(m[2]),vod_name:name,vod_pic:im?pic(im[1]):'',vod_remarks:''});
            }
            return out;
        }
        var html=request(target,{headers:rule.headers});
        VODS=cate.indexOf('rank')>=0?ranks(html):cards(html,cate==='home');
        if((cate==='home'||cate.indexOf('rank')<0)&&(!VODS||!VODS.length))VODS=fallback(html);
    `,

    二级: `js:
        function fix(u){if(!u)return '';if(u.indexOf('//')===0)return 'https:'+u;if(u.indexOf('/')===0)return rule.host+u;return u;}
        function txt(s){return String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();}
        function pic(u){
            u=fix(u||'');if(!u)return '';if(u.indexOf('?')>=0)u=u.replace(/\\?.*$/,'');
            try{
                var C=(typeof CryptoJS!=='undefined'&&CryptoJS)?CryptoJS:(typeof createCryptoJS==='function'?createCryptoJS():null);
                if(!C||!C.HmacSHA256)return u;
                var exp=Math.floor(Date.now()/1000)+21600,secret='6482883d232408ab8658992a0bfc32574649c37e049847a9ab84dde61c6cfe35';
                var sig=C.HmacSHA256(u+'\\n'+exp,secret).toString(C.enc.Hex);
                return 'https://huangguo.498246.xyz/img?url='+encodeURIComponent(u)+'&exp='+exp+'&sig='+sig;
            }catch(e){return u;}
        }
        function meta(src,name){
            var re=new RegExp('<meta[^>]+(?:property|name)=["\\\']'+name+'["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\']','i'),m=src.match(re);
            if(!m){re=new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+(?:property|name)=["\\\']'+name+'["\\\']','i');m=src.match(re);}
            return m?txt(m[1]):'';
        }
        var url=String(input||'');if(url.indexOf('http')!==0)url=fix(url);
        var html=request(url,{headers:rule.headers});
        var idm=url.match(/\\/(?:detail|video)\\/(\\d+)/i),vid=idm?idm[1]:url;
        var tm=html.match(/<h1[^>]*>([\\s\\S]*?)<\\/h1>/i),name=tm?txt(tm[1]):meta(html,'og:title').replace(/\\s*[-|].*$/,'');
        var rawPic=meta(html,'og:image');if(!rawPic){var im=html.match(/<img[^>]+(?:data-src|src)=["']([^"']+)["']/i);if(im)rawPic=im[1];}
        var content=meta(html,'description'),remarks='',rm=html.match(/hg-web-detail__meta[^>]*>([\\s\\S]*?)<\\/div>/i);if(rm)remarks=txt(rm[1]);
        var plays=[],seenEp={};

        var er=/<a\\b[^>]*class=["'][^"']*\\bhg-web-play__ep\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/a>/gi,em;
        while((em=er.exec(html))!==null){
            var tag=em[0],hm=tag.match(/href=["']([^"']+)["']/i);if(!hm)continue;
            var ei=tag.match(/data-ep-id=["']([^"']*)["']/i),ep=ei&&ei[1]?ei[1]:'';
            if(!ep){var mm=hm[1].match(/\\/ep-(\\d+)\\//i);if(mm)ep=mm[1];}
            if(!ep)ep=txt(tag).replace(/\\D/g,'');if(!ep)continue;if(seenEp[ep])continue;seenEp[ep]=1;
            plays.push('第'+ep+'集$'+fix(hm[1])+'@@ep='+encodeURIComponent(ep));
        }

        if(!plays.length){
            var grid=html.match(/<div\\s+class=["'][^"']*\\bhg-web-detail__ep-grid\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>/i);
            if(grid){
                var are=/<a\\b[^>]*>[\\s\\S]*?<\\/a>/gi,am;
                while((am=are.exec(grid[1]))!==null){
                    var tag2=am[0],hm2=tag2.match(/href=["']([^"']+)["']/i);if(!hm2)continue;
                    var ei2=tag2.match(/data-ep-id=["']([^"']*)["']/i),ep2=ei2&&ei2[1]?ei2[1]:'';
                    if(!ep2){var mm2=hm2[1].match(/\\/ep-(\\d+)\\//i);if(mm2)ep2=mm2[1];}
                    if(!ep2)ep2=txt(tag2).replace(/\\D/g,'');if(!ep2)continue;if(seenEp[ep2])continue;seenEp[ep2]=1;
                    plays.push('第'+ep2+'集$'+fix(hm2[1])+'@@ep='+encodeURIComponent(ep2));
                }
            }
        }

        if(!plays.length){
            var any=/<a\\b[^>]*href=["']([^"']*\\/video\\/\\d+\\/ep-(\\d+)\\/?[^"']*)["'][^>]*>/gi,aa;
            while((aa=any.exec(html))!==null){if(seenEp[aa[2]])continue;seenEp[aa[2]]=1;plays.push('第'+aa[2]+'集$'+fix(aa[1])+'@@ep='+aa[2]);}
        }

        if(!plays.length&&vid&&/^\\d+$/.test(String(vid))){
            plays.push('第1集$'+rule.host+'/video/'+vid+'/@@ep=1');
        }

        VOD={vod_id:vid,vod_name:name||'黄果短剧',vod_pic:pic(rawPic),vod_remarks:remarks,vod_content:content||'',vod_play_from:'黄果短剧',vod_play_url:plays.join('#')};
    `,

    搜索: `js:
        function fix(u){if(!u)return '';if(u.indexOf('//')===0)return 'https:'+u;if(u.indexOf('/')===0)return rule.host+u;return u;}
        function txt(s){return String(s||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').trim();}
        function pic(u){
            u=fix(u||'');if(!u)return '';if(u.indexOf('?')>=0)u=u.replace(/\\?.*$/,'');
            try{
                var C=(typeof CryptoJS!=='undefined'&&CryptoJS)?CryptoJS:(typeof createCryptoJS==='function'?createCryptoJS():null);
                if(!C||!C.HmacSHA256)return u;
                var exp=Math.floor(Date.now()/1000)+21600,secret='6482883d232408ab8658992a0bfc32574649c37e049847a9ab84dde61c6cfe35';
                var sig=C.HmacSHA256(u+'\\n'+exp,secret).toString(C.enc.Hex);
                return 'https://huangguo.498246.xyz/img?url='+encodeURIComponent(u)+'&exp='+exp+'&sig='+sig;
            }catch(e){return u;}
        }
        var html=request(input,{headers:rule.headers}),gre=/<div\\s+class=["'][^"']*\\bhg-card-grid\\b[^"']*["'][^>]*>/g,gs=[],m;
        while((m=gre.exec(html))!==null)gs.push(m.index+m[0].length);
        var out=[],seen={};
        if(gs.length){
            var sl=html.slice(gs[0],gs.length>1?gs[1]:html.length),re=/<div\\s+class=["'][^"']*\\bhg-drama-card\\b[^"']*["'][^>]*>/g,bs=[],x;
            while((x=re.exec(sl))!==null)bs.push(x.index+x[0].length);
            for(var i=0;i<bs.length;i++){
                var b=sl.slice(bs[i],i+1<bs.length?bs[i+1]:sl.length),a=b.match(/href=["']([^"']*\\/(?:detail|video)\\/(\\d+)\\/[^"']*)["']/i);
                if(!a||seen[a[2]])continue;var id=a[2],im=b.match(/data-src=["']([^"']+)["']/i)||b.match(/src=["']([^"']+)["']/i),tm=b.match(/hg-drama-card__title[^>]*>([\\s\\S]*?)<\\/a>/i);
                if(!tm)tm=b.match(/<a[^>]+href=["'][^"']*\\/(?:detail|video)\\/\\d+\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/i);
                var name=tm?txt(tm[1]):'';if(!name)continue;seen[id]=1;
                out.push({vod_id:fix(a[1]),vod_name:name,vod_pic:pic(im?im[1]:''),vod_remarks:''});
            }
        }
        VODS=out;
    `,

    lazy: `js:
        var raw=String(input||''),ep='1',mark=raw.lastIndexOf('@@ep=');
        if(mark>=0){ep=decodeURIComponent(raw.slice(mark+5))||'1';raw=raw.slice(0,mark);}
        var epm=raw.match(/\\/ep-(\\d+)\\//i);if((!ep||ep==='1')&&epm)ep=epm[1];
        var epn=parseInt(ep,10);if(epn>0)ep=String(epn);
        var idm=raw.match(/\\/(?:video|detail)\\/(\\d+)/i);
        if(!idm){input={parse:0,jx:0,url:raw};}
        else{
            var id=idm[1],api=rule.host+'/api/videos/'+id+'/episodes/'+encodeURIComponent(ep)+'/playback';
            var h={'User-Agent':rule.headers['User-Agent'],'Accept':'application/json, text/plain, */*','Content-Type':'application/json','Origin':rule.host,'Referer':rule.host+'/video/'+id+'/'};
            var play='';
            try{
                var ret=post(api,{headers:h,body:'{}'}),data=JSON.parse(String(ret||'{}')),streams=data&&data.data&&data.data.streams?data.data.streams:{};
                play=streams.main||streams.hevc||'';
            }catch(e){play='';}
            if(play)input={parse:0,jx:0,url:String(play)};
            else input={parse:0,jx:0,url:raw};
        }
    `
};
