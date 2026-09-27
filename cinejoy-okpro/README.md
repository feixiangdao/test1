# Cinejoy OK影视Pro

这是一个供 **OK影视Pro / FongMi** 使用的 Cinejoy 兼容源。

## 推荐使用方式

- `cinejoy_okpro.js` 保持在线托管在 GitHub，便于后续自动更新。
- `cinejoy_okpro_config.json` 只作为 **本地配置模板**。
- 请把模板下载到手机 / 电视本地后，再把：

```json
"tmdbKey": "YOUR_TMDB_V3_API_KEY"
```

替换成你自己的 TMDB API v3 Key。

**不要把填入真实 TMDB Key 的配置文件重新提交到公开 GitHub 仓库。**

## 在线 JS 地址

```text
https://raw.githubusercontent.com/feixiangdao/test1/main/cinejoy-okpro/cinejoy_okpro.js
```

因此即使本地 JSON 不变，后续更新 GitHub 上的 JS 后，OK影视Pro 仍然会加载最新版 Spider。


## App 内设置 TMDB Key

新版 Cinejoy 源会把 TMDB API v3 Key 保存在 OK影视Pro 本机存储中。

进入 Cinejoy 后，首页最前面会显示 **🔑 TMDB Key 设置** 卡片；也可以进入 **设置** 分类。点开后会显示本机设置地址和二维码。

- 手机：用浏览器打开页面中显示的 127.0.0.1 本机地址。
- 电视：使用手机扫描详情页二维码。
- Key 不写入 GitHub，只保存在运行 OK影视Pro 的设备上。


## SubDL 中文字幕

Cinejoy v5 新增 SubDL 字幕源，与现有 OpenSubtitles 同时聚合。

使用方法：
1. 进入 Cinejoy 的 **设置** 分类。
2. 点击 **📝 SubDL API Key 设置**。
3. 在原生弹窗中输入自己的 SubDL API Key 并保存。
4. 播放影片或剧集时，会同时搜索 OpenSubtitles 与 SubDL。

实现要点：
- 使用 TMDB ID 精确查询 SubDL。
- 中文查询包含 `ZH` 与 `ZH_BG`，用于覆盖中文和繁体中文条目。
- 剧集查询会附带季号与集号，并优先使用 SubDL `unpack=1` 返回的单集文件。
- 对 ZIP 字幕包提供本地解包兜底；ASS/SSA/VTT 会转换为 SRT 再交给播放器。
- SubDL API Key 只保存在 OK影视Pro 本机，不写入 GitHub。
