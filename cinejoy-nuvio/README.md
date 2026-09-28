# Cinejoy Nuvio Local Scrapers

Nuvio 本地播放源插件。解析逻辑尽量直接在 Android / Nuvio 设备上执行，最终媒体 URL 不经过 Cinejoy 的 Vercel 服务。

## 安装

在 Nuvio 中打开：

Settings → Plugins → Add repository

添加：

https://raw.githubusercontent.com/feixiangdao/test1/main/cinejoy-nuvio/manifest.json

然后刷新仓库并启用需要的 provider。

## 当前 provider

CineJoy 上游当前 11 条线路已全部建立对应项；另外增加 VidZee 原生直链源和一个可选的用户自有媒体库直连源：

- Cinejoy · Aether 1 (CinemaOS) — 实验性，默认关闭
- Cinejoy · Nebula Stream X (VidKing)
- Cinejoy · VidLink
- Cinejoy · Solaris Cloud (VidSrc.to)
- Cinejoy · Chronos Node (VidNest)
- Cinejoy · Vortex Quantum (VidFast)
- Cinejoy · Elysium Edge (VidEasy)
- Cinejoy · Pulsar Relay (VidSrc Me / VSEmbed)
- Cinejoy · Titan Mesh (VidUp)
- Cinejoy · Zenith Direct (RiveStream)
- Cinejoy · Astral Core 9 (VidCore)\n- VidZee Direct — 使用当前 VidZee 明文流接口（e=0），直接返回 HLS/媒体 URL
- Cinejoy · Jellyfin Direct — 用户自有 Jellyfin 媒体库，默认关闭；无 iframe，直接交给 Nuvio 原生播放器

## 兼容性原则

- provider 只向 Nuvio 返回真实 `http(s)` 媒体地址；不把 iframe/embed 网页地址冒充成视频流。
- Nuvio 会向 provider 传入 TMDB ID、`movie/tv`、season 和 episode。
- 需要 Referer / Origin 的线路会随 stream 返回播放 headers。
- VidZee Direct 使用 `core.vidzee.wtf/streams/...&e=0` 的明文返回模式，并在播放请求中带 `Referer: https://player.vidzee.wtf/`。
- VidFast / VidEasy / VidNest 的辅助解密请求只处理小型元数据；最终媒体流仍由设备直接访问。
- CinemaOS 当前公开集成属于 embed-only，而 Nuvio `PluginRuntimeResult` 需要 `url` 直链，因此该项默认关闭；只有页面直接暴露真实媒体地址时才会返回结果。

## 建议测试

优先用同一部电影与同一集剧集分别检查：

1. 是否能返回播放源；
2. 是否能起播；
3. 快进/拖动是否正常；
4. 字幕轨是否能加载；
5. Wi‑Fi 与移动网络下是否存在 403/区域差异。

若某条线路无结果，不代表插件框架失败：这类第三方站点域名、加密参数和反爬规则变化较快，需要按该 provider 单独修正。


## Jellyfin Direct

这是一个与第三方网页播放站不同的直连模式：

- 只访问你在插件设置里填写的 Jellyfin 服务器；
- 使用 Access Token 授权，不把 Token 写入 GitHub；
- 电影按 TMDB ID 匹配 Movie；
- 剧集先按 TMDB ID 匹配 Series，再按 Season / Episode 找到具体 Episode；
- 通过 Jellyfin PlaybackInfo 获取 MediaSource；
- 最终返回 Jellyfin 的原始/static 媒体 URL 和 Authorization header，交给 Nuvio 原生播放器；
- 不使用 iframe，不经过 Cinejoy Vercel，不包含网页广告。

安装仓库后，在 Nuvio 的 Plugins 中找到「Cinejoy · Jellyfin Direct」→ Settings，填写 Server URL 和 Access Token，再启用该 provider。

当前版本优先 Direct Play 原始文件，不主动要求 Jellyfin 转码。因此若某个文件的封装/编码设备播放器不支持，可能无法起播；后续可以再增加可选 HLS 转码模式。
