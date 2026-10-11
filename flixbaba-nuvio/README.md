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
| `flixbaba-vidbolt` | `scraper.vidbolt.xyz` | 直接把 TMDB id 交给 VidBolt scraper：`/scrape/Quasar/{movie\|tv}/{tmdbId}?tmdbId=`，返回签名 HLS / 直链，带 `quality` / `language` / `headers` / `subtitles`，按清晰度排序。电影 14 条→过滤后 8 条、剧集 15 条→过滤后 10 条实测（该次实测早于 v1.3.1 的过期签名过滤；开启后过期行会再被剔掉）。 |
| `flixbaba-mapple` | `mapple.fun` | **默认关闭**（`"enabled": false`，见下）。`/api/request-token` → `/api/playback-init`（PoW，difficulty 18）→ `/api/encrypt` 会话流程，再逐 hoster 解析，取到 2 个可用 hoster 即停。上游有 Cloudflare 挑战，见下方「网络注意事项」。 |

### 为什么 mapple 默认关闭

mapple 的失败发生在**第一步** `POST /api/request-token`（`flixbaba-mapple.js` 的
`getPlaybackSession()`），返回 403。这个 403 不是「站点死了」，而是 **Cloudflare 托管挑战**：
非浏览器 `fetch` 解不了它，而**放不放行取决于出口 IP 的信誉** —— 数据中心 / 代理出口基本必挂，
干净的家宽 / 移动网络可能直接通过。

默认关闭的理由是**噪声与可诊断性**的权衡：

- provider 只要返回了行，Nuvio 就会为它建一个 tab。mapple 失败时**故意返回一条诊断行**
  （`url: "about:error"`、`quality: "Status"`、`type: "diagnostic"`）而不是 `[]`，
  于是会多出一个只有一条「Status」的 tab。
- 保留这条诊断行是有意的：它让**没有电脑的人也能在设备上看到失败原因**。
  相同信息虽然也在 logcat 里（`[Flixbaba/Mapple] token status=403 cookie=no`），但那需要 adb。
- 但在这类出口上它**永远**只会产出那一条 403 诊断行，纯粹是噪声，所以默认关掉。

**没有删除它**：403 取决于出口 IP，换个网络就可能可用。想启用时把 manifest 里
`flixbaba-mapple` 的 `"enabled"` 改回 `true`（或直接用带 `"enabled": true` 的副本），
再在设备上刷新仓库即可。

> 已实测：设备的 Plugins 页**只有仓库级的刷新 / 删除，没有 per-provider 开关**，
> 所以 `enabled` 是唯一的控制点。仓库里另有 45 个 scraper 用同样的 `"enabled": false` 方式默认关闭。

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
| `img1.klnwm.com` 等 | 裸 m3u8 | ✅ 200 + `#EXTM3U`（签名未过期时；过期则 403 `Sign expired`，见下节） |
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

### 播放地址：签名过期（v1.3.1 新增过滤）

VidBolt 给每条播放地址签了名：`?auth_key=...&expire=<epoch-ms>`。它的 scraper
**把某个标题解析一次之后就一直回放那份缓存**，所以某一行可能带着早已失效的签名回来，
源站返回 HTTP `403` + 正文 `Sign expired`。

实测证据（2026-10-11，模拟器）：两条 1080p 行的 `expire` 是 `1791723922113` →
`13:05:22Z`，而使用时刻约 `13:50Z`，**已过期约 45 分钟**。点「Refresh streams」重新抓取
（日志确认插件重跑、仍是 `streams=8`）后再点同一条，拿到的 URL **字节完全相同**
（同一个 `auth_key`、同一个过期 `expire`）—— 说明**陈旧性在上游**，插件侧无法重新签名。

因为过期时间可以直接从 URL 上读出来，这类行在**零网络开销**下被剔除：

- 判据 `isExpiredSign()` 同时看 URL 本身和 `originOf()` 解出的上游
  （`/proxy/<kind>/<b64>` 里的上游可能是 percent-encoded 的）。
- `expire` 按毫秒解析，**秒级（10 位）也兼容**，防止上游改单位。
- 减去 60 秒宽限期（`EXPIRY_GRACE_MS`），把「马上过期」的行一并算作不可用。
- **读不出 `expire` 的行不动** —— 无法从本地判断就不下结论。
- 与 `GATED_ORIGINS` 同一套兜底：**若过滤会导致结果为空则全部保留**；
  整个过滤可用 `DROP_EXPIRED_SIGNS = false` 一键关闭。

> **不要**把 `img1.klnwm.com` / `img1.hbsxcn.com` 加进 `GATED_ORIGINS`。
> 它们不是 Cloudflare 托管挑战（对比 `Just a moment...`），而是会自愈的**签名过期**，
> 域名本身是好的。

设备日志会同时给出两个计数，便于区分两类丢弃（下例为格式示意）：

```
[Flixbaba/VidBolt] FB1.3.1 tmdb=157336 sources=14 streams=6 dropped=8 gated=6 expired=2 subs=12
```

该逻辑有本地 mock harness 覆盖（不联网，喂造数据），断言包括：新鲜的直连行保留、
秒级 `expire` 保留、无 `expire` 的行保留、b64 上游过期/未过期分别剔除/保留、
宽限期内剔除、全过期时兜底保留、无 ID 时不发请求。

### 关键设计：不依赖 api.themoviedb.org

flixbaba 只把 TMDB id 拼进播放器 URL，**VidBolt 的 scraper 本身也接受 TMDB id**，
所以整个解析链路可以完全绕开 `api.themoviedb.org`：

```
/scrape/Quasar/movie/157336?tmdbId=157336   ← 与用 IMDb id 的返回完全一致
```

这一点很重要：实测 `api.themoviedb.org` 在不少网络上是 **DNS 投毒**，
任何依赖 TMDB 的 Provider 都会在拿到流之前就挂掉。v1.0.0 就是因为调了 TMDB 而
在设备上只拿到 `tmdb 0`（即 `response.status === 0`，请求根本没发出去）。

#### `api.themoviedb.org` 到底怎么了（2026-10-11 查清）

**域名本身完全健康**，是被 DNS 投毒。同一次排查里，本机不同解析路径给出的假 IP
**每次都不一样**，且全部落在著名境外站点段里：

| 解析路径 | 返回 | 归属 |
|---|---|---|
| Windows 系统解析 #1 | `104.244.43.104` | Twitter 段 |
| Windows 系统解析 #2 | `202.160.130.118` | Twitter 段 |
| Node c-ares | `69.63.186.31` | Facebook 段 |
| **Android 模拟器** | `162.125.2.5` | **Dropbox 段** |
| **真实 DNS（远端解析）** | `13.32.230.36` / `13.32.230.46` | AWS CloudFront ✅ |

「每次不同 + 落在 Twitter/Facebook/Dropbox 段」是 DNS 投毒的教科书特征。
模拟器同样中招，因为它的 DNS 走宿主机上游。

**决定性对照**（同一个本地 SOCKS5 代理，只改解析方式）：

| 方式 | `api.themoviedb.org` |
|---|---|
| `socks5h`（域名交给代理，**远端解析**） | ✅ **401 / 0.48s**（401 只是缺 API key，HTTP 层完全正常） |
| `socks5`（本地解析成 IP 再交给代理） | ❌ 000 / 9.0s |
| 直连 | ❌ 000 / 20.0s |

也就是说：**只要让域名在远端解析，这个域名立刻就能用。** 本机之所以失败，是因为
Proxifier 默认「先在本地把域名解析成 IP 再交给代理」——域名一旦变成 IP，
代理的远端解析与分流规则全部失效，于是去连投毒 IP，TLS 被中断。

**修复**（二选一，改完必须 `Profile → Save Profile` 并重启目标应用）：
1. Proxifier → `Profile → Name Resolution...` → 勾选 **Resolve hostnames through proxy**
2. 或给该域名单独加一条 `Direct` 规则（前提是直连能通；本机直连 20s 超时，所以只能选 1）

**结论：这个问题的正确修法是修代理的解析模式，而不是在 Provider 里绕。**
本 Provider 选择绕开 TMDB（改用 Cinemeta）只是为了不把可用性绑在一个会被人为破坏的域名上 ——
即使 DNS 修好了，Cinemeta 方案也不需要维护 API key。

### 其余 10 个播放器：区分「被投毒」与「真死了」

同一个方法（用代理做远端解析，拿真实 DNS 答案）逐个复核后，结论是：
**除了 `api.themoviedb.org`，其余失败都不是本机 DNS 的问题**，属于站点自身已死或不可本地复现。

| 站点 | 真实 DNS 结论 | 能否解决 |
|---|---|---|
| `api.videasy.to` | **`Status: 3` = NXDOMAIN**（权威 `ns1.ddos-guard.net` 明确回不存在） | ❌ 域名已注销，救不了 |
| `api.themoviedb.org` | `Status: 0` + 真实 IP | ✅ **可救**，见上（修 Proxifier 解析模式） |
| `peachify.top` | 解析正常 | ❌ Cloudflare `523`，源站挂了 |
| `zxcstream.xyz` | 解析正常 | ❌ 后端 `/backend_/tigasmukha` 已 404 |
| `cinemaos.tech` | 解析正常 | ❌ HMAC 签名已完整还原复现，但接口另有服务端闸门，恒 403 |
| `vidcore.io` | 解析正常 | ❌ 源由 Next.js **Server Action** 服务端生成，本地不可复现 |
| `play.xpass.top` / `1embed.cc` | 解析正常 | ❌ Cloudflare 挑战 / 不可达 |
| `multiembed.mov` | 解析正常 | ❌ 302 到 `streamingnow.mov`，无可复现接口 |
| `vidfast.vc` / `vsembed.ru` | 解析正常 | ❌ 后端混淆 / 末跳需 API token |

即：**DNS 投毒只影响 TMDB 一个域名**；修好 Proxifier 后，任何「依赖 TMDB 但接口本身活着」的
Provider 都能恢复，但上面这些站点本身已经不产出可播地址，与网络无关。

## 网络注意事项

| 现象 | 原因 | 影响 |
|---|---|---|
| `api.themoviedb.org` 报 `SSLHandshakeException: connection closed` | **DNS 投毒**（返回 Twitter/Facebook/Dropbox 段假 IP）；Proxifier 本地解析放大了它 | 本插件已完全规避（改用 Cinemeta）；根治办法见上 |
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
  已在设备 UI 上确认 Flixbaba 分组正常渲染（`Flixbaba · VidBolt · 1080p · Original · Interstellar (2014)` 等），
  并点开真实播放成功：`state=READY durationMs=10144336`（≈ 片长 2h49m）、`terminalError=none`、`isPlaying=true`。
- **从 GitHub raw URL 加载**的端到端验证也做过：在设备上删掉本地 URL 的仓库，改为安装
  `https://raw.githubusercontent.com/feixiangdao/test1/main/flixbaba-nuvio/manifest.json`，
  两个 provider 正常注册并执行（日志里的 manifest 前缀即 GitHub 地址，见下）。
  该插件没有用户填写的 Cookie/Token，所以重建仓库不会丢设置（scraper `id` 未变）。
- CI 只做静态检查：manifest 结构、JS 语法、模块加载、`getStreams` 导出、无 ID 守卫。
  CI **不验证**真实解析与播放。
- v1.3.1 的过期签名过滤已在设备上确认**新代码确实在跑**：刷新仓库后 manifest 显示
  `Version 1.3.1`，logcat 里 vidbolt 的构建标记变成 `FB1.3.1`，manifest 前缀仍是 GitHub raw 地址。
  但**该过滤的实际剔除效果未能当场复现** —— 复测时 VidBolt 的 scraper 后端对**所有**片、
  所有 server 名（`Quasar` / `Vidlink` / `Nova` / `VidFast` / `Videasy` / `VidCore` / `Nebula` / `Vidzee`）
  都返回 HTTP 404 + `{"sources":[],"cached":false}`，本机 `curl` 复现一致，属上游故障。
  过滤逻辑本身由本地离线 mock harness 覆盖（16 条断言，见上）。

### 设备上如何读日志

Nuvio 把 Provider 的 `console.log` 转发到 Android logcat，这是排查本插件最快的通道：

```bash
adb logcat -c                       # 清空
# 在 Nuvio 里打开某个影片的播放源页面
adb logcat -d | grep -iE "flixbaba|PluginRuntime"
```

实测输出（FB1.3.0，模拟器 + 星际穿越）：

```
# 仓库地址为本机 http://127.0.0.1:8899/...
D PluginRuntime: Plugin:http://127.0.0.1:8899/flixbaba-nuvio/manifest.json:flixbaba-vidbolt [Flixbaba/VidBolt] FB1.3.0 id=tt0816692 type=movie
D PluginRuntime: Plugin:...:flixbaba-vidbolt [Flixbaba/VidBolt] FB1.3.0 tmdb=157336 sources=14 streams=8 dropped=6 subs=12
D PluginRuntime: Plugin:...:flixbaba-mapple  [Flixbaba/Mapple] FB1.3.0 id=tt0816692 type=movie
D PluginRuntime: Plugin:...:flixbaba-mapple  [Flixbaba/Mapple] token status=403 cookie=no

# 同一台设备，仓库地址换成 GitHub raw
D PluginRuntime: Plugin:https://raw.githubusercontent.com/feixiangdao/test1/main/flixbaba-nuvio/manifest.json:flixbaba-vidbolt [Flixbaba/VidBolt] FB1.3.0 id=tt0816692 type=movie
D PluginRuntime: Plugin:...:flixbaba-vidbolt [Flixbaba/VidBolt] FB1.3.0 tmdb=157336 sources=14 streams=8 dropped=6 subs=12
```

`id=tt0816692` 说明 **Nuvio 传进来的 `tmdbId` 参数其实是 IMDb id**，
插件用 Cinemeta 映射成 `157336` 后才交给 VidBolt。`dropped=6` 即上文被 Cloudflare 挡掉的 6 条。
v1.3.1 起这一行还多出 `gated=` 与 `expired=` 两个计数，用于区分两类丢弃。

### VidBolt 只有 `Quasar` 一个有效 server

`/scrape/` 后面那一段只有 `Quasar` 是真的，其余（`Vidlink` / `Nova` / `VidFast` /
`Videasy` / `VidCore` / `Nebula` / `Vidzee`）一律 404，所以插件里写死 `Quasar`。

