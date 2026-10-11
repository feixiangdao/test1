# NO视频 Local (Nuvio Provider)

`https://www.novipnoad.ca/` 的 Nuvio 本地 Provider。**不依赖浏览器、不依赖 iframe、不依赖任何第三方 scraper**：全部解析都在设备本机完成，直接返回可播的 MP4 / HLS 直链。

## 这个站是什么

WordPress 前台 + 自建播放器（`player.novipnoad.ca`）+ 腾讯云 / 阿里云 OSS 存储。前台只做索引和选片，真正的取流要经过一段 WASM 鉴权和一层载荷加密。

### 三种帖子形态（这是本站最容易踩错的地方）

站方**不**把一部剧建模成一个帖子，三种形态混用：

| 形态 | 路径 | 页面特征 |
|---|---|---|
| 电影 | `/movie/<id>.html` | `window.playInfo = {vid, pkey}`，单条流 |
| 整剧单帖 | `/tv/<region>/<id>.html` | `playInfo` **只有 pkey 没有 vid**；每集一个 `<a class="multilink-btn" data-vid="ali-…">E01</a>`，集号在**锚文本**（`E01` / `E08 End`），流 id 在 `data-vid` |
| 一集一帖 | `/tv/<region>/<id>.html` | 每集独立成帖，集号写在**标题**里：`【美剧】沙丘：预言 06 完结【衣柜字幕组】`、`… 02-03【…】`、`… 05【…】` |

`chooseTv()` 对候选帖打分，**精确分集帖 > 区间帖（`02-03`）> 整剧帖**；`selectVids()` 再决定用 `playInfo.vid` 还是按集号挑 `data-vid` 按钮。只做其中一种，另一类剧集会整季拿不到源。

## 取流链路

```
1. 搜索    GET /wp-json/wp/v2/posts?search=<标题>&per_page=20     （首选，JSON 带 link+title）
           回退 GET /search/<标题>/                              （HTML 列表）
2. 详情    GET <详情页>            -> window.playInfo = {vid, pkey}
3. 播放页  GET player.novipnoad.ca/v1/?url=<vid>&pkey=<pkey>&ref=<路径>
           该页服务端逐请求渲染 params['device']（24 hex）和内联 WASM（atob('…')）
4. 鉴权    不执行该页，直接在本机解 WASM，得到 <40 hex ckey> + {"ref","ip","time"}
5. 清单    GET player.novipnoad.ca/v1/player.php?id=<vid>&device=<dev>
           -> const jsapi = 'https://enc-vod.oss-internal.novipnoad.ca/<源>/<id>.js'
6. 载荷    GET <jsapi>?ckey=<CK>&ref=<ref>&ip=<ip>&time=<time>
           -> var videoUrl = JSON.decrypt("<540 字符>")
7. 解密    base64 -> XOR 固定 keystream -> 把 \/ 还原成 / -> JSON.parse
```

### 第 4 步：WASM 鉴权

模块只有 537 B。数据段布局固定：`seg0` 在 offset 0、长 256（置换表），`seg1` 在 offset 256、长 108（密文）。服务端**逐请求改写**模块——数据段不变，但代码段里的一个 `i32.xor` 立即数 `K` 和指纹哈希 `s` 每次都换。

- `K` 从代码段模式 `41 <sleb> 73 20 00 6b`（`i32.const K ; i32.xor ; local.get 0 ; i32.sub`）提取；
- 解码式 `out[i] = table[ ((blob[i] ^ K) - s - i*7) & 255 ]`；
- `s` 是页内那段 2202 字符浏览器指纹源码的 DJB2 哈希，**只能暴力 `s = 0..255`**，并以「前 40 字节匹配 `/^[0-9a-f]{40}$/i`」+「其余能 `JSON.parse` 出含 `ref`/`ip` 的对象」双重收窄。

已与真实浏览器逐字节比对一致（浏览器 ckey `de6f6ab8f058ab652bf8b89b04d76fd5f8b7638e`；本次复核中浏览器解出的 `{"ref":"/movie/145077.html","ip":"…","time":"…"}` 与本机求解完全相同）。

### 第 7 步：所谓 “decrypt” 其实是固定 keystream

载荷是 `base64(明文 XOR 密钥流)`。**密钥流只跟字节偏移有关，跟会话、影片、来源都无关**：在 4 组独立会话上回收（2 组 `ftn-`、2 组 `ali-`），逐字节吻合 `403/403`、`203/203`、`312/312`。前 403 字节已内嵌进 Provider。

实测密文长度分布：13 个 `ftn-` 全为 403 字节，`ali-` 为 203 / 312 —— **全部 ≤ 403，keystream 完全覆盖**；超出时 Provider 会直接报错而不是让密钥流回绕。

keystream md5：`cbed7dea6a4c08ab0ebf26a220d452a6`。

> **一个真实踩过的坑**：解密出来的 JSON 里**每个 `/` 都写成 `\/`**。用 `JSON.stringify` 从浏览器里采明文时这些反斜杠会被静默吃掉，明文看起来比真实值短 8 字节，任何按长度对齐推出来的 keystream 都会整体偏移、解出看似合理实则错误的内容。**必须先把 `\/` 还原再 parse**，密文长度 = 明文长度 + 斜杠个数。

### 搜索端点（排除项也一并记录）

| 端点 | 结果 |
|---|---|
| `GET /wp-json/wp/v2/posts?search=<q>` | ✅ 200 + JSON，含 `link` / `title.rendered`。**首选** |
| `GET /search/<q>/`（**带尾斜杠**） | ✅ 200，`<body class="search search-results">`。HTML 回退 |
| `GET /?keyword=<q>` | ❌ 无效：换任何关键词都返回同样的 52 个 id |
| `GET /?s=<q>` | ❌ 302 → `/404.html` |
| `GET /?q=<q>` | ❌ 404 |
| `GET /search/<q>.html` | ❌ `.html` 被当成查询词的一部分，落 `search-no-results` |
| `GET /wp-json/wp/v2/search` | ❌ 404 `rest_no_route` |

## 元数据：为什么依赖 TMDB

Nuvio 只给 TMDB id，而本站索引的是**中文标题**，所以必须先把 id 换成片名。

- `https://api.tmdb.org` —— **TMDB 官方别名域名，首选**。实测 200，能拿到中文标题与 CN/HK/TW/SG/MO 别名（`693134` → `沙丘2`；`90228` → `沙丘：预言`）。
- `https://api.themoviedb.org` —— 同一份数据的规范域名，本机出口被代理 `CONNECT 502`，保留为第二跳。
- Cinemeta —— **对数字 TMDB id 完全不可用**：两台主机 307 互跳，且跳转途中丢掉 `/meta/` 前缀，最终 404。因此只在 id 非数字（IMDb `tt…`）时才会去问它，避免在失败路径上白等 6 秒。

> 早先版本让 Cinemeta 与 TMDB **并行竞争**，结果是被超时放弃的那条链并不会被取消，它继续开 CONNECT 隧道抢代理连接，把后续请求整体拖慢近一倍（`The Wild Robot` 一例 38.8s）。现在改为串行，且每个 host 各自计时。

## 出网 / 格式注意

| 源 | 落地域名 | 实测 |
|---|---|---|
| `ftn-*` | `njc-download.ftn.qq.com` / `gzc-download.ftn.qq.com` … `/ftn_handler/<hex>/?fname=hd.mp4` | **206 + `video/mp4`**，`ftypisom…avc1mp41` 头，真实可播。路径里没有扩展名，靠 `type:"normal"` 或 host 判定为 mp4 |
| `ali-*` | `media.oss-internal.novipnoad.ca/hls/…m3u8` | **200 + `application/vnd.apple.mpegurl`** |

两处共同点：**Referer 指向媒体 URL 自身会 403**；裸请求或带主站/播放器 Referer 均正常。Provider 统一带 `Referer: https://www.novipnoad.ca/`。

`oss-internal` 是阿里云内网端点，是整条链路上**最可能因网络而变**的一环。它若整体开始 403，keystream 依然有效，只是 `ali-*` 那部分会失败。

`player.novipnoad.ca` 无 `Referer` → 403（nginx），必须带主站 Referer。

## 设置项

| key | 说明 |
|---|---|
| `tmdbApiKey` | 可选。留空时用内置默认 key。仅用于取中文片名/别名 |
| `browserUserAgent` | 可选。覆盖发给站点的 User-Agent |

**没有 Cookie 设置**——整条链都是第一方且无需登录，Provider 不读取也不转发任何 Cookie。

## 实测验证（BUILD `NP1.1.0`）

| TMDB id | 类型 | 站点帖子形态 | 结果 |
|---|---|---|---|
| 872585 | movie | 电影帖 | ✅ 1080P `gzc-download.ftn.qq.com/…` `type=mp4` |
| 83533 | movie | 电影帖（ali 源） | ✅ 1080P `media.oss-internal.novipnoad.ca/hls/…m3u8` `type=hls` |
| 90228 | tv S1E6 | 一集一帖（`06 完结`） | ✅ 1080P `njc-download.ftn.qq.com/…` |
| 100088 | tv S2E7 | 一集一帖（`07END`） | ✅ 1080P `gzc-download.ftn.qq.com/…` |
| 66732 | tv S5E3 | 整剧单帖（8 个按钮） | ✅ 1080P `njc-download.ftn.qq.com/…` |
| 66732 | tv S5E8 | 整剧单帖（`E08 End`） | ✅ 1080P，与 S5E3 **流 id 不同** |
| 66732 | tv S5E99 | 越界集 | ⛔ `NOHIT among 5 results`（站点只有 8 集，正确） |
| 693134 | movie | 电影帖（ali 源） | ⛔ `p3 code=404 invalid videoid`（见下） |

### 关于 `invalid videoid`

`693134`（沙丘2）与 `1184918`（荒野机器人）解析到 `enc-vod` 时，服务端以 **HTTP 200** 返回 `{"code":404,"msg":"invalid videoid"}`。这是**站点自身内容失效**（帖子还在、源已下架），不是 Provider 缺陷——证据：

1. `player.php`（服务端）自己给出的 jsapi 路径里就是这个 videoid；
2. 用真实 Chrome 加载真实站点、跑完真实 WASM 鉴权后，拿到的是**同一串** `{"code":404,"msg":"invalid videoid"}`；
3. 同一条链路的其它 ali 影片（`83533`）当场成功。

Provider 把该响应原文写进诊断行，不做任何猜测性降级。

## 已知边界

- **失效帖**：站点会保留已经播不了的帖子，此时返回一条说明原因的诊断行，而不是空数组。
- **`ali-*` 可达性**：依赖 `media.oss-internal.novipnoad.ca` 在用户网络下可达。
- **元数据**：数字 id 完全依赖 TMDB（两个域名）。若两者都不可达，会返回 `FATAL no title for <id>` 诊断行。
- 单次最多返回 8 条（`MAX_ROWS`）。
- 只做公开链路的解析，**不实现任何伪造会员或绕过付费校验**。

## 诊断行

Nuvio 不回传 `console`，所以**唯一的信息回收通道是结果行**。任何一次没有产出可播流的调用都会返回一条：

```
NO视频 · NP1.1.0 · <阶段> · <轨迹>
```

- `url: "about:error"`、`quality: "Status"`、`type: "diagnostic"`
- 轨迹含：TMDB 词条 → WP 搜索结果数 → 命中的帖子 → vid 数 → 每个 vid 的失败原因
- 阶段为 `SCAN` / `NOHIT` / `NOSTREAM` / `FATAL` 之一
- 行首的 `BUILD` 是判断「读到的是新版还是缓存旧版」的唯一可靠依据——**看诊断行里的 BUILD，不要看插件显示名**

## 文件

| 文件 | 说明 |
|---|---|
| `manifest.json` | 清单，`id` 固定为 `novipnoad-local` |
| `providers/novipnoad-v025.js` | Provider 本体（`BUILD = NP1.1.0`） |
| `providers/novipnoad-v018..v023.js` | 历史版本，保留备查 |

> **更新提示**：`id` 与 manifest 地址保持不变、只换 `filename` 内容时，Nuvio 会把设置按 `id` 保留，用户不必重填。一旦改动 `id`，用户必须重填全部设置。
