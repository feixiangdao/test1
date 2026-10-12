# Diagnostic Row Visibility

一个小型、只读、**不联网**的实验仓库，用来回答一个具体问题：

> Provider 返回的**诊断行**，到底什么形态才能在 Nuvio 的 Streams 列表里被渲染出来？

## 为什么需要它

`novipnoad-nuvio` 在失败时返回一条 `url: "about:error"`、`quality: "Status"`、`type: "diagnostic"` 的诊断行。
2026-10-12 在 Android 模拟器（Pixel 9 / Android 16）+ 官方 Nuvio 0.5.8-beta 上实测时，
**这条行从未出现在 Streams 里**——于是「插件没出源」在界面上完全没有解释。

同一台设备上，本仓库其它诊断 provider 的行**都能显示**。对比它们的构造，发现三处差异：

| 字段 | 我们（不可见） | 其它诊断 provider（可见） |
|---|---|---|
| `url` | `about:error` | `https://example.com/*.m3u8` 或 `data:application/vnd.apple.mpegurl;base64,...` |
| `quality` | `Status` | `Diag` / `Diagnostic` / `Status` |
| `type` | `diagnostic` | `hls` |

三个变量同时不同，光靠对比无法判断是哪一个导致被过滤。所以这里做**单变量对照**。

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

装好仓库后在 Streams 里看筛选 chip：

- **A、B、C 都在** → 诊断行本来就能显示，`about:error` 不是原因，要另找解释。
- **只有 B、C** → Nuvio 过滤的是 **`url` scheme**（`about:` 不被接受）。修法：把诊断行的 url 换成可抓取的 https。
- **只有 C** → Nuvio 过滤的是 **`type`/`quality`**，即它只渲染被判定为「媒体行」的条目
  （与仓库自带审计 `check_all_enabled_nuvio_missing_id.cjs` 的判定一致：该脚本把
  `type:"hls"` 计为 media-like、把 `type:"diagnostic"` 排除）。
- **一个都没有** → 探针无效（例如仓库没装好），结论作废。

## 为什么不登记进 `tests/nuvio_manifest_projects.json`

登记会让 `check_all_enabled_nuvio_missing_id.cjs` 把它纳入审计，而该审计要求
「没有 ID 时不得产出 media-like 行」——`c.js` 按设计就必须是 media-like（`type:"hls"`），
否则失去阳性对照的意义。这会给本来就在失败的 CI 再添一条**误报**。

语法检查 `check_all_enabled_nuvio_syntax.cjs` 是按目录树扫描的，**不依赖登记**，所以
这三个文件仍然被覆盖（实测输出 `PARSED diag-visibility 3 enabled unique scripts`）。
