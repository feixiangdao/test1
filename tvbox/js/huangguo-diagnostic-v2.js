// 黄果短剧诊断版 v2 - 2026-11-13
// 适配黄果 2026-11-11 新播放机制：POST /api/videos/:id/episodes/:ep/playback
// 保持 OK影视 5.1.9 稳定策略：不使用本地 proxy；最终播放结果不附带 header。

var rule = {};
try {
    var _src = request('https://raw.githubusercontent.com/feixiangdao/test1/main/tvbox/js/huangguo.js');
    _src = String(_src || '').replace('var rule =', 'rule =');
    eval(_src);
} catch (e) {
    rule = {
        title: '黄果短剧-诊断V2',
        host: 'https://huangguoai.com',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    };
}

rule.title = '黄果短剧-诊断V2';

rule.lazy = `js:
    var raw = String(input || '');
    var ep = '1';
    var mark = raw.lastIndexOf('@@ep=');
    if (mark >= 0) {
        ep = decodeURIComponent(raw.slice(mark + 5)) || '1';
        raw = raw.slice(0, mark);
    }

    var epm = raw.match(/\\/ep-(\\d+)\\//i);
    if ((!ep || ep === '1') && epm) ep = epm[1];
    var epn = parseInt(ep, 10);
    if (epn > 0) ep = String(epn);

    var idm = raw.match(/\\/(?:video|detail)\\/(\\d+)/i);
    if (!idm) {
        input = {parse:0, jx:0, url:raw};
    } else {
        var id = idm[1];
        var api = rule.host + '/api/videos/' + id + '/episodes/' + encodeURIComponent(ep) + '/playback';
        var h = {
            'User-Agent': rule.headers['User-Agent'],
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            'Origin': rule.host,
            'Referer': rule.host + '/video/' + id + '/'
        };
        var play = '';
        try {
            var ret = post(api, {headers:h, body:'{}'});
            var data = JSON.parse(String(ret || '{}'));
            var streams = data && data.data && data.data.streams ? data.data.streams : {};
            play = streams.main || streams.hevc || '';
        } catch (e) {
            play = '';
        }

        if (play) {
            input = {parse:0, jx:0, url:String(play)};
        } else {
            input = {parse:0, jx:0, url:raw};
        }
    }
`;
