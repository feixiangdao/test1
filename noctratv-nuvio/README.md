# NoctraTV Local for Nuvio

这是一个独立的 Nuvio Local Plugin，专门对应 **https://noctratv.com/**，不属于 Stellar Local，也不属于 Cinejoy Local。

## 安装地址

https://raw.githubusercontent.com/feixiangdao/test1/main/noctratv-nuvio/manifest.json

## 2026-10 当前网站结构

已用真实浏览器进入：

- `https://noctratv.com/title/movie/238`
- `https://noctratv.com/watch/movie/238`

NoctraTV 的 MPlayer 内有独立 **Source** 菜单，并有 “Remember a working source” 设置。

实际电影播放页当前枚举到 **129 个 Source 条目**。它们不是 129 个完全独立后端，其中很多属于同一个聚合器下的节点、语言版本或二级 provider。

示例：

- Vidy · Miami / Boise / Orlando / Atlanta / Tampa / Portland
- ZStream · Apollo / Stellar / Aphrodite / Nesterov / Velora / Vienna / Chase / Tokyo
- Cinevaro · VaPlayer / VidNest / Videasy
- Rive · PrimeVids / FlowCast / Citadel
- CinemaOS · MovieBox English / Helios / Selene / Eos / Rive / VidFast
- PopWatch 下包含 vidrock / cinextream / vidzee / videasy / vidcore 等多种后端
- Novera、Screenscape、Gaiaflix、Nxsha 等也属于聚合层

因此插件按 **真实后端解析器** 拆分，而不是机械创建 129 个重复 Provider。

## v2.0 第一批已接入 Provider

1. NoctraTV · VidAPI
2. NoctraTV · VidRock
3. NoctraTV · VixSrc
4. NoctraTV · VidLink
5. NoctraTV · PurStream
6. NoctraTV · Cinevaro · VidNest
7. NoctraTV · Cinevaro · Videasy
8. NoctraTV · Rive
9. NoctraTV · FrameX · VidCore
10. NoctraTV · CinemaOS · VidFast

这些名称都能在 noctratv.com 当前 Source 菜单中找到对应项或对应子源。

## 重要修正

v1.0 曾错误地把另一个站点的 VidSrc Me 链路当成 noctratv.com 的来源。该实现已从正式 manifest 移除，并不再作为 NoctraTV Provider 使用。

## 原则

- 不返回 iframe / 网页播放器地址；
- 只返回 Nuvio 可直接播放的 HLS / MP4 / DASH；
- 能预检时先验证最终媒体；
- 对同一聚合器下明显重复的后端优先复用解析器；
- 网站显示 Source 不等于该源当前一定有媒体，0 条优于错片或 HTML 假源。

## 后续研究组

仍待逐组解析的主要 Source family：

Vidy、CineJoy、Orion、Lyra、Phoenix、KissKH、LMScript、Atlas、Vega、Hexa、VidRift、FSOnline、AniPM、CineSrc、ZStream、Nesterov、Velora、Tokyo、Peestream、Atlantic、Bingr、Dulo、Cinema.army、Overlook、Movy、Cineflix、PopWatch、Aether、VidLove、Nextbox、StreamVault、1Embed、Novera、Screenscape、Gaiaflix、AniCine、Nxsha。
