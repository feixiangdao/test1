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
