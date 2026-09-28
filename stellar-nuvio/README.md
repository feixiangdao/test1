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
