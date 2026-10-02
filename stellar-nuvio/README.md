# Stellar Local for Nuvio

这是一个独立的 Nuvio Local Plugin 包，不与 Cinejoy Local 合并。

## 为什么改成本地执行

远程 Vercel Addon 的实测结果：

- VidZee 可以工作；
- VixSrc 在普通网络可解析，但 Vercel 生产环境被上游限制，返回 0；
- MovieBox 的 API 在 Vercel 可以拿到媒体地址，但媒体 CDN 对远程服务器/跨出口请求返回 429/426，Nuvio 中表现为一直 buffering。

因此 Stellar Local 把解析逻辑放到 Nuvio 设备上执行，让取链和播放走同一个设备网络。

## 当前来源

- Stellar · VidZee
- Stellar · VixSrc
- Stellar · MovieBox
- Stellar · VAPlayer
- Stellar · VidRock
- Stellar · CastleTV
- Stellar · NetMirror
- Stellar · Cineby
- Stellar · Movix
- Stellar · Mapple
- Stellar · Vidlink
- Stellar · ZXCStreams
- Stellar · OneTouchTV
- Stellar · 4KHDHub
- Stellar · UHDMovies
- Stellar · DVDPlay（仅 TV，limited）
- Stellar · PurStream
- Stellar · VegaMovies（limited）

未注册研究候选目前包括 HDHub4U。MP4Hydra 当前上游处于维护状态，没有加入。

## 安装地址

https://raw.githubusercontent.com/feixiangdao/test1/main/stellar-nuvio/manifest.json

建议先保留旧 Stellar Direct 作为对照；确认本地版可用后，再删除旧的远程 Stellar Direct，避免重复播放源。

## 测试建议

1. 先测试一部常见电影，例如 Fight Club。
2. 再测试一集常见剧集，例如 Game of Thrones S01E01。
3. 分别确认 VidZee / VixSrc / MovieBox 是否出现。
4. MovieBox 会区分 `Play` 和 `Download` 两组地址，便于确认哪组 CDN 在你的网络可用。


### MovieBox v1.2

MovieBox 已改为当前 v4.0.02 移动端协议：

`anonymous bootstrap → x-user guest token → signed search → play-info → signCookie → index.mpd`

不会再把 `bcdnw/bcdnxw` 或 `macdn ... b164...` 的表面 MP4 地址交给播放器。播放结果名称会直接显示为：

`MovieBox · Signed DASH · 720p/480p · HEVC`

并把 CloudFront / Edge-Cache Cookie 作为播放请求头交给 Nuvio。


### VAPlayer

新增 **Stellar · VAPlayer**。它使用 `streamdata.vaplayer.ru` 的 IMDb API 返回多镜像 HLS，电影和剧集都支持。

已真实验证：

- Fight Club：3 条 HLS，master playlist HTTP 200；
- Game of Thrones S01E01：3 条 HLS，master playlist HTTP 200；
- HLS 使用 H.264/AVC + AAC，兼容性较好；
- 插件会读取 master playlist 中最高 `RESOLUTION`，显示为 `up to 1080p/720p...`。


### VidRock

新增 **Stellar · VidRock**（仅电影）。

它直接调用 `vidrock.ru/api/movie/{TMDB}/`，再在 Nuvio 本机使用 WebCrypto AES-GCM 解密最终媒体 URL。真实联网测试《Fight Club》返回 3 条媒体流，三条均 HTTP 200，其中包含 HLS master 和 1080p 线路。

当前 VidRock 的 TV endpoint 实测返回 404，因此 manifest 明确只声明 `movie`，不会在剧集里制造空播放源。


### NetMirror

NetMirror 已使用当前 mobile playlist 流程接入 Stellar Local，并标记为 `limited: true`：

- 自动尝试 Netflix → Prime Video → Hotstar/Disney+；
- 电影和剧集均支持；
- 候选返回后在 Nuvio 设备本机验证 master.m3u8，并继续验证首个 variant.m3u8；
- 只有真正可播放的 HLS 才显示，避免“master 能开但 variant 403”导致 buffering；
- GitHub 数据中心实测 variant 在不同 UA / Referer 组合下均为 403，因此 CI 的 0 条不代表手机网络一定不可用；
- HLS 内仍保留多语言音轨与上游字幕信息。


### Mapple

Mapple 保留为设备网络依赖型补充源，并标记为 `limited: true`。

当前 GitHub Runner 访问 `mapple.fun/` 与 `/api/request-token` 都直接返回 HTTP 403，说明失败发生在会话/token 之前，并非 hoster 解析逻辑本身。Local Provider 已同步当前 18 个 hoster；是否可用以 Android 设备本机网络结果为准。

### ZXCStreams v1.13

新增 **Stellar · ZXCStreams**，适配 2026-09 当前新版播放器 API，而不是已经失效的旧 `/backend/token` 流程。

当前正式启用的服务器：

- Daedalus：HLS；
- Berkas：多镜像 HLS；
- Alatreon：HLS；
- Valstrax：DASH；
- Atlas：DASH。

Resshin 虽然 API 能返回 MP4，但最终 `api1.zxcstream.xyz` 当前实测 HTTP 502，因此正式 Provider 主动排除。

真实联网回归：

- Fight Club：返回 8 条流，抽样验证 8/8 最终媒体可读；
- Game of Thrones S01E01：返回 8 条流，抽样验证 8/8 最终媒体可读；
- HLS 返回有效 `#EXTM3U`，DASH 返回有效 `<MPD>`；
- 不使用 iframe、网页播放器或外部跳转。


### OneTouchTV v1.14

新增 **Stellar · OneTouchTV**，作为覆盖有限的补充 HLS 源。

为避免站内搜索的近似错配，Provider 使用严格匹配策略：

- 电影要求归一化标题一致，并尽量要求年份一致；
- 剧集 Season 2+ 优先匹配明确的 `Title Season N` 条目；
- 不使用“第一条搜索结果”兜底；
- 最终 HLS 返回前必须能读取有效 `#EXTM3U`。

真实联网测试：

- Titanic (1997)：1 条 HLS，HTTP 206，有效 `#EXTM3U`；
- Inception (2010)：站内只有 2001 同名片，正确拒绝，0 条；
- Game of Thrones S01E01：站内无可靠匹配，正确返回 0；
- Squid Game S01E01：1 条 HLS，HTTP 206，有效 `#EXTM3U`；
- Squid Game S02E01：上游 Season 2 条目标记 upcoming 且 episodes 为空，因此返回 0；
- Squid Game S03E01：1 条 HLS，HTTP 200，有效 `#EXTM3U`。

因此该源标记为 `limited: true`：宁可缺源，也不返回错片。


### 4KHDHub

4KHDHub 作为高画质直文件补充源启用，并标记为 `limited: true`。

当前实现会在返回给 Nuvio 前做 Range 媒体预检，只保留真正可读的 MKV/直文件，自动丢弃 HubCloud 302、403、404 等中间页或失效链接。电影覆盖明显好于剧集，因此不作为主源。

### UHDMovies

UHDMovies 已适配当前 LinkPilot / DriveSeed 链路，并标记为 `limited: true`。

已验证 Fight Club 和 Game of Thrones S01E01 均可解析到实际 Google 视频 MKV；电影可出现 1080p/2160p，剧集也能返回 1080p/2160p。失效的 VideoSeed token 会自动丢弃，不把 HTML 中间页交给播放器。

### DVDPlay

DVDPlay 已重新启用，但仅声明 `tv`，并保持 `limited: true`。

当前版本已经修复旧实现“搜索不到目标时误选最新内容”的错片问题，并且在网络预检前先按 Season / Episode 精确过滤。已验证 Squid Game S03E01 / S03E02 能返回 Pixeldrain 1080p/720p MKV。

旧季与部分片库覆盖仍不完整，因此不开放 movie 类型。

### PurStream

PurStream 是当前较干净的 HLS 补充源：严格按 TMDB 标题/年份匹配，直接返回 master.m3u8，不经过网页播放器。

当前 CI 实测 Interstellar、Fight Club、Breaking Bad S01E01、Game of Thrones S01E01 均返回 1 条 720p HLS，HTTP 206 且包含有效 `#EXTM3U`。

### CI / 健康检查

主 CI 现在将两类检查分开：

- 语法、manifest、一致性和本地 helper tests：必须通过；
- 第三方实时源探针：继续执行并记录结果，但临时上游故障不会再把整个主分支打红。

同时实时探针日志只保留状态码、Host、Content-Type 等必要信息，不再打印完整签名媒体 URL。

### VegaMovies

VegaMovies 作为本地直文件补充源启用，并标记为 `limited: true`。

当前实现优先使用 IMDb ID，并保留严格标题/年份/季匹配；返回结果还会在 Nuvio 设备本机并发执行最终媒体 HEAD 预检，只保留 HTTP 200/206 且 Content-Type 确认为视频、Matroska 或 octet-stream 的直链。403 HTML、网页中间页以及 ZIP 响应会被直接丢弃。

当前回归结果：

- Fight Club：4/4 最终直链有效（1080p/720p）；
- Inception：4/4 最终直链有效（1080p/720p）；
- Game of Thrones S01E01：7 条候选中保留 4 条有效 MKV/直链；
- Squid Game S01E01：6 条候选中保留 2 条有效 1080p/720p；
- Squid Game S03E01：能严格匹配 Season 3 条目，但当前提取结果为 0，因此不做错误兜底。

这类 Workers/R2 镜像存在明显网络差异，最终是否显示由设备本机预检决定。
