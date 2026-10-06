# KissKH Local for Nuvio

这是一个和 Cinejoy、Stellar、NoctraTV **完全分开的独立 Nuvio Local Plugin**，对应 KissKH 当前站点/API。

## 安装地址

https://raw.githubusercontent.com/feixiangdao/test1/main/kisskh-nuvio/manifest.json

## 当前解析链

Nuvio TMDB ID → TMDB 标题/年份 → KissKH Search → Drama Detail → Episode ID → kkey → Episode API → 直接 HLS/MP4/DASH。

原则：

- 不返回 iframe 或网页播放器；
- 只返回经过媒体预检的直链；
- 电影与电视剧都支持；
- TV 会按 season/episode 做标题与 Episode 匹配；
- kkey 优先走当前 enc-kisskh token 端点，失败时尝试读取 KissKH 当前 common JS 在本地生成；
- 字幕支持 KissKH 直接字幕；加密 .txt 字幕使用当前 dec-kisskh 解密端点。

## 设置

Provider 带一个可选 TMDB API Key 输入框。留空时使用公共备用 Key；公共 Key 被限流时可填自己的 TMDB v3 Key。

## v0.1.0

首个独立版本。当前候选域名会在 `kisskh.co / kisskh.do / kisskh.is / kisskh.nl` 间尝试，避免单一域名切换导致插件整体失效。
