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
| 4 | mapple.rip | `https://mapple.rip/watch/movie/${Q}?autoPlay=true` | ✅ **已实现** |
| 5 | vidbolt.xyz | `https://vidbolt.xyz/movie/${Q}?autoplay=true` | ✅ **已实现** |
| 6 | cinemaos.tech | `https://cinemaos.tech/player/${Q}?autoPlay=true` | ✗ HMAC 签名算法已完整还原并复现成功，但接口另有服务端闸门，恒返回 `403 Forbidden` |
| 7 | zxcstream.xyz | `https://zxcstream.xyz/player/movie/${Q}?autoplay=true` | ✗ 后端 `/backend_/tigasmukha` 已 404，旧混淆端点失效 |
| 8 | peachify.top | `https://peachify.top/embed/movie/${Q}?accent=ADDC35` | ✗ Cloudflare `523`，源站不可达 |
| 9 | play.xpass.top | `https://play.xpass.top/e/movie/${Q}?autostart=true` | ✗ Cloudflare 挑战页 |
| 10 | 1embed.cc | `https://1embed.cc/embed/movie/${Q}?autoPlay=1` | ✗ 本机不可达 |
| 11 | multiembed.mov | `https://multiembed.mov/?tmdb=1&video_id=${Q}` | ✗ 302 到 `streamingnow.mov`，无可复现接口 |
| 12 | vidfast.vc | `https://vidfast.vc/movie/${Q}?autoPlay=true` | ✗ 前端无 API 字符串，后端混淆（`/zirlaku/u/<opaque>`），旧 `enc-dec.app` token 流程已失效 |

**v1.0.0 只发布第 4、5 两个已实测可用的解析器。** 其余 10 个宁可不上，也不放会返回假源的代码。

## 已发布的 Scraper

| id | 上游 | 说明 |
|---|---|---|
| `flixbaba-vidbolt` | `scraper.vidbolt.xyz` | TMDB→IMDb → `/scrape/{server}/{movie\|tv}/{imdb}?tmdbId=`，server 取 `Quasar` / `Vidlink`，返回带 `quality` / `language` / `headers` 的签名 HLS。 |
| `flixbaba-mapple` | `mapple.fun` | `/api/request-token` → `/api/playback-init`（PoW，difficulty 18）→ `/api/encrypt` 会话流程，再逐 hoster 解析，取到 2 个可用 hoster 即停。 |

## 设计约定

- **诊断行**：模块无法返回真实媒体时，返回一条
  `{url: "about:error", quality: "Status", type: "diagnostic"}` 的行，标题里带 `BUILD` 版本号。
  `about:error` 永远不可能被播放，所以诊断行不会被误当成可用源；同时它是设备上**唯一**能读到的失败原因
  （Nuvio 不展示 `console.log`）。
- **无 ID 不发请求**：`getStreams(null, ...)` 以及剧集缺 `season`/`episode` 时，直接返回 `[]`，
  不发起任何网络请求。这条由 CI 的 `check_all_enabled_nuvio_missing_id.cjs` 强制校验。
- **不返回 iframe**：只返回直链，播放由 Nuvio 本机完成。
- **就地升级**：升级时保持 `id` 与 manifest 地址不变，只改 `version`、`filename` 与 provider 内容，
  这样用户已填的设置不会被清掉。

## 测试状态

- 上游可达性与解析结果均在 **Android 模拟器**（真机网络出口）上实测，不是在 CI 上。
- CI 只做静态检查：manifest 结构、JS 语法、模块加载、`getStreams` 导出、无 ID 守卫。
  CI **不验证**真实解析与播放。
