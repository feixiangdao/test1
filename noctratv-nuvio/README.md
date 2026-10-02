# NoctraTV Local for Nuvio

这是从 Stellar Local 中完全拆出的独立 Nuvio Local Plugin，只包含 NoctraTV 一个 Provider。

## 安装地址

https://raw.githubusercontent.com/feixiangdao/test1/main/noctratv-nuvio/manifest.json

## 当前解析链路

Noctra 当前使用 VidSrc Me，电影和剧集都以 TMDB ID 取源。

Provider 不打开 Noctra / VidSrc 网页播放器，而是在 Nuvio 设备本机完成：

1. 请求 `data.vidsrcme.ru/api.php?...&stream_urls`；
2. 解析当前 ChaCha20 加密的 `stream_urls`；
3. 不依赖 Nuvio WebAssembly，纯 JavaScript 从上游 WASM data section 恢复动态 key；
4. 解出实际 `/pl/...` HLS；
5. 在设备本机获取与出口 IP 绑定的 token；
6. 实际读取 master playlist，只有有效 `#EXTM3U` 才返回给 Nuvio。

这样 token 获取和最终播放都从同一台 Android / Nuvio 设备网络发出，避免远程服务器与本机出口 IP 不一致导致播放失败。

## 已验证

- Fight Club：可解析真实 HLS；
- Game of Thrones S01E01：可解析真实 HLS；
- Noctra 页面样本 100 Girlfriends S01E01：可解析到 1080p HLS；
- 某些页面存在但上游当前没有有效 HLS 时会返回 0 条，不做错误兜底。

## Provider 名称

`NoctraTV`

它与 Stellar Local、Cinejoy Local 完全独立。
