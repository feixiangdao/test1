# YTS Movies for Nuvio Mobile — v1.0.0

Nuvio Android **Full** 0.6.12-beta（155）电影来源 Provider。

这个版本以用户在 Android 设备上验证**可显示 4 条来源、其中前 2 条可以正常播放**的 v0.3.3 为基础，**仅清理播放源显示名称**。v1.0.0 本身尚未完成用户手机的实机回归测试。

## 安装或升级

在 Nuvio → Settings → Content & Discovery → Plugins 中添加或刷新：

https://raw.githubusercontent.com/feixiangdao/test1/main/yts-nuvio/manifest.json

升级后，仓库应显示 **YTS Movies for Nuvio Mobile**（Version **1.0.0**），Provider 为 **YTS Movies**（Version **1.0.0**）。

正式版使用新的 Provider ID（`yts-movies-stable-v1`）及新的源文件（`providers/yts-v1.js`）。刷新仓库时，旧诊断 Provider 应被替换。若刷新未成功，确认仓库版本后再决定是否重新安装；无需卸载整个 Nuvio 应用。

## 播放源显示

例：`YTS 1080p x264 | 3.18 GB | S:100`

- 画质和视频编码来自 YTS API（例如 720p、1080p、4K、x264、x265）。
- 大小和 S: 种子数来自 API，**不是独立实时验证**。
- 此版本移除 v033、Raw、Prefix、Pick、IMDb ID 等诊断长字段。
- 当前仅支持电影，不提供电视剧来源。

## 保留的已验证工作机制

与 v0.3.3 相同：

1. 根据 Nuvio 的 TMDB ID 获取 IMDb ID，匹配正确电影；
2. 分别查询 `list_movies` 与 `movie_details`，并比较两组 API；
3. 按完整、合法的 40 位 InfoHash 去重，选择来源更完整的一组；
4. 显式设置 Android User-Agent、`Cache-Control: no-cache, no-store`、`Pragma: no-cache`；
5. 增加 URL 防缓存参数，先读取原始 JSON 文本再解析；
6. 返回 Magnet URL、InfoHash、画质及文件大小，由 Nuvio 的 P2P 播放器处理。

原始响应扫描、内部计数与缓存规避逻辑仍保留在代码里，仅不再显示在播放源名称中。未重新设计 Torrent 播放逻辑、文件序号或引入第三方 Torrent 元数据缓存。

## 回退到 v0.3.3

用户已实机验证过的原始 JS 文件完整保留在：

`providers/yts-api-v033.js`

升级前整个 GitHub 仓库快照保存在独立分支：

`backup/yts-verified-v0.3.3`

这条备份分支保留当时的 `manifest.json` 和所有源文件。如果 v1.0.0 出现问题，可切换回备份分支中的插件仓库配置，恢复诊断版。正式版与原版脚本不要同时启用来比较播放源，以免混淆。

## 测试方法

在本目录运行 `npm test`（Node.js 18+）。测试将正式版和保留的 v0.3.3 进行回归对照，检查 Magnet、Hash、画质、大小及 API 请求行为一致，只允许名称不同。

本地模拟测试**不能代替手机实际播放验证**。升级后建议先检查是否能显示相同的 4 条来源，再验证以前成功的两个来源是否仍能播放。

## 限制与隐私

本 Provider 只查询 YTS 提供的索引数据，不托管影片。Torrent 种子数、文件名与 Hash 格式并不能证明视频真实、健康或有授权。只能访问你有权使用的内容；BitTorrent P2P 可能向其他节点暴露公网 IP。某些 Nuvio 构建不支持第三方插件，自动 Debrid 解析也不保证适用于 Plugin 来源。

