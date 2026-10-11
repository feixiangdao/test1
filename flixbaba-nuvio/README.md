# Flixbaba Local (Nuvio Provider)

`https://www.flixbaba.best/` 的 Nuvio 本地 Provider。

## 这个站是什么

flixbaba.best 是一个 **纯 iframe 聚合站**：它的 Next.js 观看页
（`/movie/{tmdbId}/{slug}`、`/tv/{tmdbId}/{slug}`、`.../watch`）本身**不产出任何视频地址**，
只是把 TMDB id 拼进 12 个第三方播放器的 URL 里嵌进 `<iframe>`。

因此“给 flixbaba 写 Provider”实际等于：**在设备本机复现这 12 个内嵌播放器的解析**，
直接返回它们最终的 HLS/MP4 直链，而不是返回 iframe 页面。

### flixbaba 的 12 个内嵌播放器（从站点 chunk 提取）

电影用 `Q = tmdbId`；剧集用 `m = tmdbId, ek = season, j = episode`。

| # | host | 电影 | 状态 |
|---|---|---|---|
| 1 | vsembed.ru | `https://vsembed.ru/embed/movie?tmdb=${Q}` | ✗ 两跳链，末跳需要 API token |
| 2 | vidcore.io | `https://vidcore.io/movie/${Q}?autoPlay=true` | ✗ 源由 Next.js **Server Action** 服务端生成，本地不可复现 |
| 3 | player.videasy.to | `https://player.videasy.to/movie/${Q}?color=addc35` | ✗ `api.videasy.to` 在本机 DNS 解析失败 |
| 4 | mapple.rip | `https://mapple.rip/watch/movie/${Q}?autoPlay=true` | ⚠️ **已实现**，但上游挂 Cloudflare，部分出口 403 |
| 5 | vidbolt.xyz | `https://vidbolt.xyz/movie/${Q}?autoplay=true` | ✅ **已实现，实测可用** |
| 6 | cinemaos.tech | `https://cinemaos.tech/player/${Q}?autoPlay=true` | ✗ HMAC 签名算法已完整还原并复现成功，但接口另有服务端闸门，恒返回 `403 Forbidden` |
| 7 | zxcstream.xyz | `https://zxcstream.xyz/player/movie/${Q}?autoplay=true` | ✗ 后端 `/backend_/tigasmukha` 已 404，旧混淆端点失效 |
| 8 | peachify.top | `https://peachify.top/embed/movie/${Q}?accent=ADDC35` | ✗ Cloudflare `523`，源站不可达 |
| 9 | play.xpass.top | `https://play.xpass.top/e/movie/${Q}?autostart=true` | ✗ Cloudflare 挑战页 |
| 10 | 1embed.cc | `https://1embed.cc/embed/movie/${Q}?autoPlay=1` | ✗ 本机不可达 |
| 11 | multiembed.mov | `https://multiembed.mov/?tmdb=1&video_id=${Q}` | ✗ 302 到 `streamingnow.mov`，无可复现接口 |
| 12 | vidfast.vc | `https://vidfast.vc/movie/${Q}?autoPlay=true` | ✗ 前端无 API 字符串，后端混淆（`/zirlaku/u/<opaque>`），旧 `enc-dec.app` token 流程已失效 |

**v1.1.0 只发布第 4、5 两个解析器。** 其余 10 个宁可不上，也不放会返回假源的代码。

## 已发布的 Scraper

| id | 上游 | 说明 |
|---|---|---|
| `flixbaba-vidbolt` | `scraper.vidbolt.xyz` | 直接把 TMDB id 交给 VidBolt scraper：`/scrape/Quasar/{movie\|tv}/{tmdbId}?tmdbId=`，返回签名 HLS / 直链，带 `quality` / `language` / `headers` / `subtitles`，按清晰度排序。电影 14 条→过滤后 8 条、剧集 15 条→过滤后 10 条实测。 |
| `flixbaba-mapple` | `mapple.fun` | `/api/request-token` → `/api/playback-init`（PoW，difficulty 18）→ `/api/encrypt` 会话流程，再逐 hoster 解析，取到 2 个可用 hoster 即停。上游有 Cloudflare 挑战，见下方「网络注意事项」。 |

### 播放地址：为什么有的行会被丢掉

VidBolt 返回的播放地址有两种形态：

- **(a) HLS 播放列表** —— `/proxy/m3u8/<base64>` 或裸上游主机（`img1.*.com`）。真的能播。
- **(b) 原始文件透传** —— `/proxy/segment/<base64>`，用于 MKV 整片。

**(b) 这个端点本身没问题**（它同样在给字幕 `.vtt` 提供正常服务）。真正被挡的是**它背后的源站**：
本插件遇到的所有 (b) 行都指向 `a.111477.xyz` / `cf.streamflixserver.site`，两者都挂在
Cloudflare 托管挑战后面。VidBolt 的代理会把这个挑战**原样透传**，于是该 URL 返回
HTTP `403/502/504` + HTML 正文（`Just a moment...`、`server: cloudflare`、
`cf-mitigated: challenge`）而不是视频。ExoPlayer 和 mpv 都会失败
（`ERROR_CODE_IO_BAD_HTTP_STATUS` / `"loading failed"`）。

2026-10-11 在**两个独立出口**（桌面 + Android 模拟器）实测：

| 源站 | 形态 | 结果 |
|---|---|---|
| `hls.shegu.net` | `/proxy/m3u8/` | ✅ 200 + `#EXTM3U` |
| `img1.klnwm.com` 等 | 裸 m3u8 | ✅ 200 + `#EXTM3U` |
| `aapanel.devcorp.me` | `/proxy/m3u8/` **和** `/proxy/segment/`（字幕） | ✅ 200 |
| `a.111477.xyz` / `p.111477.xyz` | `/proxy/segment/` | ❌ 403 挑战页，7/7 次 |
| `cf.streamflixserver.site` | `/proxy/segment/` | ❌ 502，2/2 次 |

运行时探测能 100% 区分（探测判据就是「状态码 2xx 且 content-type 不是 `text/html`」），
但在本出口上**并行探测 10 条地址要 15 秒**，远超任何 provider 的合理预算，
所以改成在 `GATED_ORIGINS` 里**列出已知被挡的源站域名**，零延迟。

判据走的是**解码后的真实源站**（`originOf()`：先从 `?q=u=` 取明文，取不到再 base64 解
`/proxy/<kind>/<base64>`），因此**不会**误伤同样走 `/proxy/segment/` 的字幕
（字幕源站是 `aapanel.devcorp.me`，正常保留）。

被挡的行默认丢弃，**但若丢弃会导致结果为空则全部保留**，保证调用方永远拿得到东西。
某个域名恢复后，从 `GATED_ORIGINS` 里删掉即可；整个过滤可用
`DROP_GATED_ORIGINS = false` 一键关闭。

### 关键设计：不依赖 api.themoviedb.org

flixbaba 只把 TMDB id 拼进播放器 URL，**VidBolt 的 scraper 本身也接受 TMDB id**，
所以整个解析链路可以完全绕开 `api.themoviedb.org`：

```
/scrape/Quasar/movie/157336?tmdbId=157336   ← 与用 IMDb id 的返回完全一致
```

这一点很重要：实测 `api.themoviedb.org` 在不少移动网络上是 **DNS 解析超时 / TLS 握手被重置**，
任何依赖 TMDB 的 Provider 都会在拿到流之前就挂掉。v1.0.0 就是因为调了 TMDB 而
在设备上只拿到 `tmdb 0`（即 `response.status === 0`，请求根本没发出去）。

## 网络注意事项

| 现象 | 原因 | 影响 |
|---|---|---|
| `api.themoviedb.org` 报 `SSLHandshakeException: connection closed` | 该域名在部分网络被 DNS/TLS 阻断 | 本插件已完全规避（改用 Cinemeta） |
| `mapple.fun` 返回 403 `Just a moment...` | Cloudflare 挑战页 | 非浏览器 fetch 无法通过；出口不同结果不同 |
| `mapple.rip` 返回 301 | 跳转到 `mapple.fun` | 同上 |
| `a.111477.xyz` / `p.111477.xyz` 返回 403 `Just a moment...` | 源站挂 Cloudflare 托管挑战，经 VidBolt 代理透传 | 对应播放行已被 `GATED_ORIGINS` 过滤掉 |
| `cf.streamflixserver.site` 返回 502 | 源站网关错误 | 同上 |

**判断一个 403 是不是 Cloudflare**：看响应头 `cf-mitigated: challenge` 与正文 `<title>Just a moment...</title>`。
Cloudflare 挑战**基于出口 IP 信誉**，与请求头无关 —— 换到干净的家宽出口很可能就能通过，
所以 `GATED_ORIGINS` 是**可编辑的清单**而不是永久删除。

mapple 失败时**只返回一条诊断行**（`about:error` / `Status`），标题里带具体原因
（例如 `session failed · request-token HTTP 403`），不会产生任何假播放源。


## 设计约定

- **诊断行**：模块无法返回真实媒体时，返回一条
  `{url: "about:error", quality: "Status", type: "diagnostic"}` 的行，标题里带 `BUILD` 版本号。
  `about:error` 永远不可能被播放，所以诊断行不会被误当成可用源；同时它是设备上**唯一**能读到的失败原因
  （Nuvio 不展示 `console.log`）。
- **无 ID 不发请求**：`getStreams(null, ...)` 以及剧集缺 `season`/`episode` 时，直接返回 `[]`，
  不发起任何网络请求。这条由 CI 的 `check_all_enabled_nuvio_missing_id.cjs` 强制校验。
- **不返回 iframe**：只返回直链，播放由 Nuvio 本机完成。
- **就地升级**：升级时保持 `id` 与 manifest 地址不变，只改 `version` 与 provider 内容，
  这样用户已填的设置不会被清掉。

## 测试状态

- 解析结果在 **Android 模拟器 + Nuvio 0.5.9-beta** 上实测（真实设备网络出口），不是在 CI 上。
  已在设备 UI 上确认 Flixbaba 分组正常渲染（`Flixbaba · VidBolt · 1080p · Original · Interstellar (2014)` 等）。
- CI 只做静态检查：manifest 结构、JS 语法、模块加载、`getStreams` 导出、无 ID 守卫。
  CI **不验证**真实解析与播放。

### 设备上如何读日志

Nuvio 把 Provider 的 `console.log` 转发到 Android logcat，这是排查本插件最快的通道：

```bash
adb logcat -c                       # 清空
# 在 Nuvio 里打开某个影片的播放源页面
adb logcat -d | grep -iE "flixbaba|PluginRuntime"
```

实测输出（FB1.3.0，模拟器 + 星际穿越）：

```
D PluginRuntime: Plugin:http://127.0.0.1:8899/flixbaba-nuvio/manifest.json:flixbaba-vidbolt [Flixbaba/VidBolt] FB1.3.0 id=tt0816692 type=movie
D PluginRuntime: Plugin:...:flixbaba-vidbolt [Flixbaba/VidBolt] FB1.3.0 tmdb=157336 sources=14 streams=8 dropped=6 subs=12
D PluginRuntime: Plugin:...:flixbaba-mapple  [Flixbaba/Mapple] FB1.3.0 id=tt0816692 type=movie
D PluginRuntime: Plugin:...:flixbaba-mapple  [Flixbaba/Mapple] token status=403 cookie=no
```

`id=tt0816692` 说明 **Nuvio 传进来的 `tmdbId` 参数其实是 IMDb id**，
插件用 Cinemeta 映射成 `157336` 后才交给 VidBolt。`dropped=6` 即上文被 Cloudflare 挡掉的 6 条。

### VidBolt 只有 `Quasar` 一个有效 server

`/scrape/` 后面那一段只有 `Quasar` 是真的，其余（`Vidlink` / `Nova` / `VidFast` /
`Videasy` / `VidCore` / `Nebula` / `Vidzee`）一律 404，所以插件里写死 `Quasar`。

