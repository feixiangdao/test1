# VidZee Direct for Nuvio

独立的 Nuvio 本地播放源插件，与 Cinejoy Local 完全分离。

## 安装

在 Nuvio 中打开：

Settings → Plugins → Add repository

添加：

https://raw.githubusercontent.com/feixiangdao/test1/main/vidzee-nuvio/manifest.json

然后刷新仓库并启用 **VidZee Direct**。

## 工作方式

- 不使用 iframe / 网页播放器；
- 调用 VidZee 当前的 plaintext stream API（`e=0`）；
- 电影：`/streams/movie/{tmdbId}?s={server}&e=0`
- 剧集：`/streams/tv/{tmdbId}/{season}/{episode}?s={server}&e=0`
- 当前尝试 `dcloud / tik / ipcloud / v6:Hindi`；
- 最终把真实 `http(s)` 媒体 URL 和所需 Referer header 交给 Nuvio 原生播放器；
- 不经过 Cinejoy Local，也不依赖 Stellar 网页播放器。

第三方接口可能变化；若某个 server 临时失效，插件会继续尝试其它 server。
