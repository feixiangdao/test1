# NoctraTV Local for Nuvio

这是一个独立的 Nuvio Local Plugin，专门对应 **https://noctratv.com/**，不属于 Stellar Local，也不属于 Cinejoy Local。

## 安装地址

https://raw.githubusercontent.com/feixiangdao/test1/main/noctratv-nuvio/manifest.json

如设备仍缓存旧版，可删除旧 Repository 后使用以下带版本参数的地址重新添加以强制绕过旧缓存：

https://raw.githubusercontent.com/feixiangdao/test1/main/noctratv-nuvio/manifest.json?v=2.7.0

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

## 当前已接入 Provider（v2.8.0）

当前 manifest 共 **24 个 Provider**。为缩短 Nuvio 首次搜源时间，v2.7.0 默认仅启用当前实时探针能稳定返回媒体的 Provider；持续 0/502 或明显拖慢加载的研究源保留但默认关闭：

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
11. NoctraTV · CineSrc
12. NoctraTV · 1Embed
13. NoctraTV · Nxsha
14. NoctraTV · VidLove
15. NoctraTV · Nextbox · MoviesAPI
16. NoctraTV · Cinevaro · VaPlayer
17. NoctraTV · CinemaOS · MovieBox English
18. NoctraTV · PopWatch · vidzee / tik

其中 16–18 是本轮根据 noctratv.com 实际 Source 菜单新增的映射。实现优先直接调用相同上游的本地直链解析链，而不是依赖 NoctraTV 网页播放器。

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

Vidy、CineJoy、Orion、Lyra、Phoenix、KissKH、LMScript、Atlas、Vega、Hexa、VidRift、FSOnline、AniPM、ZStream、Nesterov、Velora、Tokyo、Peestream、Atlantic、Bingr、Dulo、Cinema.army、Overlook、Movy、Cineflix、PopWatch 其余子源、Aether、StreamVault、Novera、Screenscape、Gaiaflix、AniCine。


## v2.8 新增研究 Provider

- NoctraTV · Screenscape：已实现 ScreenScape 当前加密 API 的本地解密与 direct stream 解析，初始默认关闭，待实时探针确认后再决定是否默认启用。
- NoctraTV · Novera · VidKing
- NoctraTV · Novera · VidRock Luna
- NoctraTV · Novera · Videasy Yoru
- NoctraTV · Novera · Videasy Vyse
- NoctraTV · Novera · VidZee Hindi v3

这些研究 Provider 均已独立注册，不与 Stellar/Cinejoy 合并。

## v4.55.0 继续研究

新增 **NoctraTV · MZone GapProbe** 研究 Provider（默认关闭），复用仓库现有研究解析器统一探测当前尚未拆成独立 Provider 的 MZone source IDs：

- Dulo · Auto
- Cineflix · Latino / Castellano / Subbed
- CinemaOS · Helios / Selene / Eos
- 1Shows · Jill

其中 Dulo 与 1Shows 已有独立 Provider，GapProbe 主要用于继续验证 Cineflix 与 CinemaOS 三个未独立落地的 Source family。只有最终媒体通过 HLS/MP4 校验才会返回，HTML/iframe 不返回。

当前 manifest 版本：**4.55.0**，共 **74 个 Provider**（包含研究 Provider）。

## NoctraTV 当前匿名 Source 名映射（2026-10-07）

NoctraTV 当前 MPlayer 会把真实 Provider 名显示为匿名别名。不要把这些别名当成新的独立后端。

- Lumen = vidapi
- Aurora = cinesrc
- Sol = cinejoy
- Titan = vidrock
- Sirius = vidlink
- Halo = hexa
- Draco = vidrift
- Comet = vixsrc
- Polaris = fsonline
- Hoshi = anipm
- Astra = purstream
- Mira = kisskh
- Zenith = lmscript
- Lyra = vidfast
- Phoenix = peachify
- Vega = vidcore
- Orion = vidup
- Nova = videasy_cdn
- Atlas = onetouchtv

因此播放器中出现 “Lumen Verified” 实际表示当前 vidapi 路径已通过验证，而不是新出现了一个名为 Lumen 的后端。

当前优先补齐的顶层 pStream 缺口：vidup、peachify、videasy_cdn、anipm，以及尚未独立落地的 vidfast/vidcore 顶层路径。
