# Diagnostic Row Visibility

一个小型、只读、**不联网**的实验仓库，用来回答一个具体问题：

> Provider 返回的**诊断行**，到底什么形态才能在 Nuvio 的 Streams 列表里被渲染出来？

## 结论（2026-10-12 已实测完成）

**三个 arm 全部渲染。** 在 Android 模拟器（Pixel 9 / Android 16）+ 官方 Nuvio 0.5.8-beta 上，
`Diag A`、`Diag B`、`Diag C` 三个 chip 都出现在 Streams 的筛选条里，点开后各自显示一行：

| chip | 点开后显示的行 | 副标题 |
|---|---|---|
| `Diag A · about:error + diagnostic` | `DIAG A · about:error + diagnostic` | `Status` |
| `Diag B · https + diagnostic` | `DIAG B · https + diagnostic` | `Status` |
| `Diag C · https + hls` | `DIAG C · https + hls` | `Diag` |

即 **Nuvio 不过滤 `about:error`，也不过滤 `type: "diagnostic"` / `quality: "Status"`**。
「诊断行被过滤」这个假设被**证伪**。

进一步的旁证：把设备网络真正断掉后重进 Streams，`novipnoad-nuvio` 的失败诊断行
（`NO视频 · NP1.1.0 · FATAL · …`，同样是 `about:error` + `Status` + `diagnostic`）
也**完整显示**在该 provider 的 chip 下。

所以当初「看不到诊断行」的真实原因不是过滤，而是**根本没滑到那个 chip**：
这台设备装了 9 个仓库 / 14 个 provider，chip 条要横向滑**九屏**才滑得到 `NOVIPNOAD Local`，
而且 chip 条会**吸附回当前选中的 chip**，直接滑常常滑不动。

## 为什么需要它

`novipnoad-nuvio` 在失败时返回一条 `url: "about:error"`、`quality: "Status"`、`type: "diagnostic"` 的诊断行。
2026-10-12 在 Android 模拟器（Pixel 9 / Android 16）+ 官方 Nuvio 0.5.8-beta 上实测时，
一度以为**这条行从未出现在 Streams 里**——于是「插件没出源」在界面上完全没有解释。

同一台设备上，本仓库其它诊断 provider 的行**都能显示**。对比它们的构造，发现三处差异：

| 字段 | 我们（当时以为不可见） | 其它诊断 provider（可见） |
|---|---|---|
| `url` | `about:error` | `https://example.com/*.m3u8` 或 `data:application/vnd.apple.mpegurl;base64,...` |
| `quality` | `Status` | `Diag` / `Diagnostic` / `Status` |
| `type` | `diagnostic` | `hls` |

三个变量同时不同，光靠对比无法判断是哪一个导致被过滤。所以这里做**单变量对照**。
（**注意**：事后证明这个「过滤」假设本身就不成立，见上节。实验的价值在于**证伪**——
否则一条错误结论会被写进文档和技能。）

## 三个 arm

| 文件 | scraper id | url | quality | type |
|---|---|---|---|---|
| `a.js` | `diag-vis-about-error` | `about:error` | `Status` | `diagnostic` |
| `b.js` | `diag-vis-https-diagnostic` | `https://example.com/…` | `Status` | `diagnostic` |
| `c.js` | `diag-vis-https-hls` | `https://example.com/…` | `Diag` | `hls` |

每个 provider **只返回一行**，不发起任何网络请求，`getStreams()` 直接 resolve。

- **A vs B** 隔离 `url` scheme（`about:` 不可抓取）。
- **B vs C** 隔离 `type` / `quality`。
- **C 是阳性对照**：这是本仓库里所有能正常显示的诊断 provider 用的形态
  （`debug3/control.js`、`debug3/fetch.js`、`debug2/tmdb.js` …）。
  **如果 C 也不显示，说明整个探针无效，结论作废。**

## 怎么读结果

装好仓库后在 Streams 里看筛选 chip（本仓库 chip 排在列表最末，要先滑到底）：

- **A、B、C 都在** → 诊断行本来就能显示，`about:error` 不是原因，要另找解释。 ← **实测结果就是这个**
- **只有 B、C** → Nuvio 过滤的是 **`url` scheme**（`about:` 不被接受）。修法：把诊断行的 url 换成可抓取的 https。
- **只有 C** → Nuvio 过滤的是 **`type`/`quality`**，即它只渲染被判定为「媒体行」的条目
  （与仓库自带审计 `check_all_enabled_nuvio_missing_id.cjs` 的判定一致：该脚本把
  `type:"hls"` 计为 media-like、把 `type:"diagnostic"` 排除）。
- **一个都没有** → 探针无效（例如仓库没装好），结论作废。

**实测操作要点**（下次复现时省时间）：

1. 设备若不通外网，可以把仓库**本地托管**后用 `adb reverse` 装——本仓库三个 provider 都不联网，
   只需 manifest + 3 个 JS。步骤：`node static-server.cjs <repoDir> 19099` +
   `adb reverse tcp:19099 tcp:19099`，然后在插件页填 `http://127.0.0.1:19099/manifest.json`。
   注意 Nuvio 会连 `filename` 一起拉，所以**整个目录**都要能访问到，不能只托管 manifest。
2. 装完看插件页 OVERVIEW 的计数变化确认成功（本次 `8 repos / 11 providers` → `9 repos / 14 providers`）。
3. chip 条会**吸附回当前选中的 chip**，直接横向滑常常滑不动。想往右看：先点一个别的 chip
   改变选中项，再滑；或反复点最右侧可见的 chip，让它自己往右滚。
4. 想看**失败路径**，最干净的办法是 `svc wifi disable` + `svc data disable` 真正断网，
   再退回首页重新点开同一个影片（Nuvio 不缓存 Streams，断网后其它联网 provider 的结果会消失，
   正好可以确认这是一次真实重跑）。

## 为什么不登记进 `tests/nuvio_manifest_projects.json`

登记会让 `check_all_enabled_nuvio_missing_id.cjs` 把它纳入审计，而该审计要求
「没有 ID 时不得产出 media-like 行」——`c.js` 按设计就必须是 media-like（`type:"hls"`），
否则失去阳性对照的意义。这会给本来就在失败的 CI 再添一条**误报**。

语法检查 `check_all_enabled_nuvio_syntax.cjs` 是按目录树扫描的，**不依赖登记**，所以
这三个文件仍然被覆盖（实测输出 `PARSED diag-visibility 3 enabled unique scripts`）。
