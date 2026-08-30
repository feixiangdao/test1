// 黄果短剧 - TVBox / drpy2 适配版
// 基于 Yswag/xptv-extensions 的 huangguo.js 页面结构移植
// 适用：支持 drpy2.min.js 的 TVBox 分支
// 说明：部分封面为站点 AES 加密图片，普通 TVBox 可能无法直接显示；视频播放不依赖第三方解析。

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

    推荐: `js:
        function hgFix(u) {
            if (!u) return '';
            if (u.indexOf('//') === 0) return 'https:' + u;
            if (u.indexOf('/') === 0) return rule.host + u;
            return u;
        }
        function hgPic(u) { return hgFix(u || ''); }
        function hgText(s) {
            return String(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
        }
        function hgGridSlices(src, allGrids) {
            var re = /<div\\s+class=["'][^"']*\\bhg-card-grid\\b[^"']*["'][^>]*>/g;
            var starts = [], m;
            while ((m = re.exec(src)) !== null) starts.push(m.index + m[0].length);
            if (!starts.length) return [];
            var out = [];
            var n = allGrids ? starts.length : Math.min(1, starts.length);
            for (var i = 0; i < n; i++) {
                var to = i + 1 < starts.length ? starts[i + 1] : src.length;
                out.push(src.slice(starts[i], to));
            }
            return out;
        }
        function hgCardBlocks(slice) {
            var re = /<div\\s+class=["'][^"']*\\bhg-drama-card\\b[^"']*["'][^>]*>/g;
            var starts = [], m;
            while ((m = re.exec(slice)) !== null) starts.push(m.index + m[0].length);
            var out = [];
            for (var i = 0; i < starts.length; i++) {
                var to = i + 1 < starts.length ? starts[i + 1] : slice.length;
                out.push(slice.slice(starts[i], to));
            }
            return out;
        }
        function hgCards(src, allGrids) {
            var list = [], seen = {};
            var slices = hgGridSlices(src, allGrids);
            for (var s = 0; s < slices.length; s++) {
                var blocks = hgCardBlocks(slices[s]);
                for (var i = 0; i < blocks.length; i++) {
                    var b = blocks[i];
                    var a = b.match(/href=["'][^"']*\\/detail\\/(\\d+)\\/[^"']*["']/);
                    if (!a || seen[a[1]]) continue;
                    var id = a[1];
                    var im = b.match(/data-src=["']([^"']+)["']/) || b.match(/src=["']([^"']+)["']/);
                    var tm = b.match(/hg-drama-card__title[^>]*>([\\s\\S]*?)<\\/a>/);
                    if (!tm) tm = b.match(/<a[^>]+href=["'][^"']*\\/detail\\/\\d+\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/);
                    var title = tm ? hgText(tm[1]) : '';
                    if (!title) continue;
                    var ep = b.match(/hg-drama-card__episode[^>]*>([\\s\\S]*?)<\\/span>/);
                    var sc = b.match(/hg-drama-card__score[^>]*>([\\s\\S]*?)<\\/span>/);
                    var rem = ep ? hgText(ep[1]) : '';
                    var score = sc ? hgText(sc[1]) : '';
                    var desc = rem && score ? rem + ' · ' + score : (rem || score);
                    seen[id] = 1;
                    list.push({
                        vod_id: rule.host + '/detail/' + id + '/',
                        vod_name: title,
                        vod_pic: hgPic(im ? im[1] : ''),
                        vod_remarks: desc
                    });
                }
            }
            return list;
        }
        var html = request(rule.host + '/', {headers: rule.headers});
        VODS = hgCards(html, true);
    `,

    一级: `js:
        function hgFix(u) {
            if (!u) return '';
            if (u.indexOf('//') === 0) return 'https:' + u;
            if (u.indexOf('/') === 0) return rule.host + u;
            return u;
        }
        function hgPic(u) { return hgFix(u || ''); }
        function hgText(s) {
            return String(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
        }
        function hgGridSlices(src, allGrids) {
            var re = /<div\\s+class=["'][^"']*\\bhg-card-grid\\b[^"']*["'][^>]*>/g;
            var starts = [], m;
            while ((m = re.exec(src)) !== null) starts.push(m.index + m[0].length);
            if (!starts.length) return [];
            var out = [];
            var n = allGrids ? starts.length : Math.min(1, starts.length);
            for (var i = 0; i < n; i++) {
                var to = i + 1 < starts.length ? starts[i + 1] : src.length;
                out.push(src.slice(starts[i], to));
            }
            return out;
        }
        function hgCardBlocks(slice) {
            var re = /<div\\s+class=["'][^"']*\\bhg-drama-card\\b[^"']*["'][^>]*>/g;
            var starts = [], m;
            while ((m = re.exec(slice)) !== null) starts.push(m.index + m[0].length);
            var out = [];
            for (var i = 0; i < starts.length; i++) {
                var to = i + 1 < starts.length ? starts[i + 1] : slice.length;
                out.push(slice.slice(starts[i], to));
            }
            return out;
        }
        function hgCards(src, allGrids) {
            var list = [], seen = {};
            var slices = hgGridSlices(src, allGrids);
            for (var s = 0; s < slices.length; s++) {
                var blocks = hgCardBlocks(slices[s]);
                for (var i = 0; i < blocks.length; i++) {
                    var b = blocks[i];
                    var a = b.match(/href=["'][^"']*\\/detail\\/(\\d+)\\/[^"']*["']/);
                    if (!a || seen[a[1]]) continue;
                    var id = a[1];
                    var im = b.match(/data-src=["']([^"']+)["']/) || b.match(/src=["']([^"']+)["']/);
                    var tm = b.match(/hg-drama-card__title[^>]*>([\\s\\S]*?)<\\/a>/);
                    if (!tm) tm = b.match(/<a[^>]+href=["'][^"']*\\/detail\\/\\d+\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/);
                    var title = tm ? hgText(tm[1]) : '';
                    if (!title) continue;
                    var ep = b.match(/hg-drama-card__episode[^>]*>([\\s\\S]*?)<\\/span>/);
                    var sc = b.match(/hg-drama-card__score[^>]*>([\\s\\S]*?)<\\/span>/);
                    var rem = ep ? hgText(ep[1]) : '';
                    var score = sc ? hgText(sc[1]) : '';
                    var desc = rem && score ? rem + ' · ' + score : (rem || score);
                    seen[id] = 1;
                    list.push({
                        vod_id: rule.host + '/detail/' + id + '/',
                        vod_name: title,
                        vod_pic: hgPic(im ? im[1] : ''),
                        vod_remarks: desc
                    });
                }
            }
            return list;
        }
        function hgRanks(src) {
            var list = [], seen = {};
            var lm = src.match(/<div\\s+class=["'][^"']*\\bhg-rank-list\\b[^"']*["'][^>]*>/);
            var from = lm ? lm.index + lm[0].length : 0;
            var slice = src.slice(from);
            var re = /<div\\s+class=["'][^"']*\\bhg-rank-item\\b[^"']*["'][^>]*>/g;
            var starts = [], m;
            while ((m = re.exec(slice)) !== null) starts.push(m.index + m[0].length);
            for (var i = 0; i < starts.length; i++) {
                var to = i + 1 < starts.length ? starts[i + 1] : slice.length;
                var b = slice.slice(starts[i], to);
                var a = b.match(/href=["'][^"']*\\/detail\\/(\\d+)\\/[^"']*["']/);
                if (!a || seen[a[1]]) continue;
                var id = a[1];
                var im = b.match(/data-src=["']([^"']+)["']/) || b.match(/src=["']([^"']+)["']/);
                var tm = b.match(/hg-rank-item__title[^>]*>([\\s\\S]*?)<\\/h2>/);
                if (!tm) tm = b.match(/<a[^>]+href=["'][^"']*\\/detail\\/\\d+\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/);
                var title = tm ? hgText(tm[1]) : '';
                if (!title) continue;
                var tags = b.match(/hg-rank-item__tags[^>]*>([\\s\\S]*?)<\\/div>/);
                seen[id] = 1;
                list.push({
                    vod_id: rule.host + '/detail/' + id + '/',
                    vod_name: title,
                    vod_pic: hgPic(im ? im[1] : ''),
                    vod_remarks: tags ? hgText(tags[1]) : ''
                });
            }
            return list;
        }

        var cate = String(MY_CATE || 'home').replace(/^\\//, '');
        var pg = parseInt(MY_PAGE || 1);
        if (!pg || pg < 1) pg = 1;
        var target;
        if (cate === 'home') target = rule.host + '/';
        else target = rule.host + '/' + cate + '/' + (pg > 1 ? pg + '/' : '');
        var html = request(target, {headers: rule.headers});
        if (cate.indexOf('rank') !== -1) VODS = hgRanks(html);
        else VODS = hgCards(html, cate === 'home');
    `,

    二级: `js:
        function hgFix(u) {
            if (!u) return '';
            if (u.indexOf('//') === 0) return 'https:' + u;
            if (u.indexOf('/') === 0) return rule.host + u;
            return u;
        }
        function hgText(s) {
            return String(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
        }
        function hgMeta(src, name) {
            var re = new RegExp('<meta[^>]+(?:property|name)=["\\\']' + name + '["\\\'][^>]+content=["\\\']([^"\\\']+)["\\\']', 'i');
            var m = src.match(re);
            if (!m) {
                re = new RegExp('<meta[^>]+content=["\\\']([^"\\\']+)["\\\'][^>]+(?:property|name)=["\\\']' + name + '["\\\']', 'i');
                m = src.match(re);
            }
            return m ? hgText(m[1]) : '';
        }

        var detailUrl = String(input || '');
        if (detailUrl.indexOf('http') !== 0) detailUrl = hgFix(detailUrl);
        var html = request(detailUrl, {headers: rule.headers});
        var idm = detailUrl.match(/\\/detail\\/(\\d+)\\//);
        var vid = idm ? idm[1] : detailUrl;
        var title = '';
        var tm = html.match(/<h1[^>]*>([\\s\\S]*?)<\\/h1>/i);
        if (tm) title = hgText(tm[1]);
        if (!title) title = hgMeta(html, 'og:title').replace(/\\s*[-|].*$/, '');
        var pic = hgMeta(html, 'og:image');
        if (pic) pic = hgFix(pic);
        if (!pic) {
            var im = html.match(/<img[^>]+(?:class=["'][^"']*hg-web-detail[^"']*["'][^>]+)?(?:data-src|src)=["']([^"']+)["']/i);
            if (im) pic = hgFix(im[1]);
        }
        var content = hgMeta(html, 'description');
        if (!content) {
            var cm = html.match(/hg-web-detail__desc[^>]*>([\\s\\S]*?)<\\/[^>]+>/i);
            if (cm) content = hgText(cm[1]);
        }
        var remarks = '';
        var rm = html.match(/hg-web-detail__meta[^>]*>([\\s\\S]*?)<\\/div>/i);
        if (rm) remarks = hgText(rm[1]);
        var plays = [];
        var grid = html.match(/<div\\s+class=["'][^"']*\\bhg-web-detail__ep-grid\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>/i);
        if (grid) {
            var are = /<a\\b[^>]*>[\\s\\S]*?<\\/a>/gi;
            var am;
            while ((am = are.exec(grid[1])) !== null) {
                var tag = am[0];
                var hm = tag.match(/href=["']([^"']+)["']/i);
                if (!hm) continue;
                var em = tag.match(/data-ep-id=["']([^"']*)["']/i);
                var ep = em && em[1] ? em[1] : hgText(tag).replace(/^0+/, '');
                if (!ep) ep = String(plays.length + 1);
                var name = '第' + ep + '集';
                var playPage = hgFix(hm[1]);
                plays.push(name + '$' + playPage + '@@ep=' + encodeURIComponent(ep));
            }
        }
        if (!plays.length) {
            var pm = html.match(/<a\\b[^>]*class=["'][^"']*\\bhg-web-detail__play\\b[^"']*["'][^>]*href=["']([^"']+)["']/i);
            if (!pm) pm = html.match(/<a\\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*\\bhg-web-detail__play\\b[^"']*["']/i);
            if (pm) plays.push('第1集$' + hgFix(pm[1]) + '@@ep=1');
        }
        VOD = {
            vod_id: vid,
            vod_name: title || '黄果短剧',
            vod_pic: pic || '',
            vod_remarks: remarks,
            vod_content: content || '',
            vod_play_from: '黄果短剧',
            vod_play_url: plays.join('#')
        };
    `,

    搜索: `js:
        function hgFix(u) {
            if (!u) return '';
            if (u.indexOf('//') === 0) return 'https:' + u;
            if (u.indexOf('/') === 0) return rule.host + u;
            return u;
        }
        function hgText(s) {
            return String(s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim();
        }
        function hgGridSlices(src) {
            var re = /<div\\s+class=["'][^"']*\\bhg-card-grid\\b[^"']*["'][^>]*>/g;
            var starts = [], m;
            while ((m = re.exec(src)) !== null) starts.push(m.index + m[0].length);
            if (!starts.length) return [];
            var to = starts.length > 1 ? starts[1] : src.length;
            return [src.slice(starts[0], to)];
        }
        function hgCardBlocks(slice) {
            var re = /<div\\s+class=["'][^"']*\\bhg-drama-card\\b[^"']*["'][^>]*>/g;
            var starts = [], m;
            while ((m = re.exec(slice)) !== null) starts.push(m.index + m[0].length);
            var out = [];
            for (var i = 0; i < starts.length; i++) {
                var to = i + 1 < starts.length ? starts[i + 1] : slice.length;
                out.push(slice.slice(starts[i], to));
            }
            return out;
        }
        var html = request(input, {headers: rule.headers});
        var list = [], seen = {};
        var slices = hgGridSlices(html);
        for (var s = 0; s < slices.length; s++) {
            var blocks = hgCardBlocks(slices[s]);
            for (var i = 0; i < blocks.length; i++) {
                var b = blocks[i];
                var a = b.match(/href=["'][^"']*\\/detail\\/(\\d+)\\/[^"']*["']/);
                if (!a || seen[a[1]]) continue;
                var id = a[1];
                var im = b.match(/data-src=["']([^"']+)["']/) || b.match(/src=["']([^"']+)["']/);
                var tm = b.match(/hg-drama-card__title[^>]*>([\\s\\S]*?)<\\/a>/);
                if (!tm) tm = b.match(/<a[^>]+href=["'][^"']*\\/detail\\/\\d+\\/[^"']*["'][^>]*>([\\s\\S]*?)<\\/a>/);
                var title = tm ? hgText(tm[1]) : '';
                if (!title) continue;
                var ep = b.match(/hg-drama-card__episode[^>]*>([\\s\\S]*?)<\\/span>/);
                var sc = b.match(/hg-drama-card__score[^>]*>([\\s\\S]*?)<\\/span>/);
                var rem = ep ? hgText(ep[1]) : '';
                var score = sc ? hgText(sc[1]) : '';
                seen[id] = 1;
                list.push({
                    vod_id: rule.host + '/detail/' + id + '/',
                    vod_name: title,
                    vod_pic: hgFix(im ? im[1] : ''),
                    vod_remarks: rem && score ? rem + ' · ' + score : (rem || score)
                });
            }
        }
        VODS = list;
    `,

    lazy: `js:
        var raw = String(input || '');
        var ep = '1';
        var mark = raw.lastIndexOf('@@ep=');
        if (mark >= 0) {
            ep = decodeURIComponent(raw.slice(mark + 5)) || '1';
            raw = raw.slice(0, mark);
        }
        var h = {
            'User-Agent': rule.headers['User-Agent'],
            'Accept': rule.headers['Accept'],
            'Accept-Language': rule.headers['Accept-Language'],
            'Referer': rule.host + '/'
        };
        var html = request(raw, {headers: h});
        var play = '';
        var m = html.match(/id=["']videoInitialData["'][^>]*>([\\s\\S]*?)<\\/script>/i);
        if (m) {
            try {
                var data = JSON.parse(m[1]);
                var srcs = data && data.epPlaySrcs ? data.epPlaySrcs : {};
                play = srcs[ep] || (data && data.videoSrc ? data.videoSrc : '');
            } catch (e) {}
        }
        if (play) {
            play = String(play).replace(/\\u0026/g, '&');
            if (play.indexOf('http') !== 0) {
                var mm = play.match(/(https?:\\/\\/[^\\s"']+)/);
                play = mm ? mm[1] : '';
            }
        }
        if (play) {
            input = {
                parse: 0,
                jx: 0,
                url: play,
                header: {
                    'User-Agent': rule.headers['User-Agent'],
                    'Referer': rule.host + '/'
                }
            };
        } else {
            input = { parse: 1, jx: 0, url: raw, header: h };
        }
    `
};
