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

MP4Hydra 当前上游处于维护状态，没有加入。

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

NetMirror 已使用当前 mobile playlist 流程接入 Stellar Local：

- 自动尝试 Netflix → Prime Video → Hotstar/Disney+；
- 电影和剧集均支持；
- 返回 Auto / 1080p / 720p / 480p HLS（以上游实际提供为准）；
- HLS 内可包含多语言音轨；
- 上游 captions 同步作为字幕返回。
