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
