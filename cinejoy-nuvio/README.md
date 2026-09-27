# Cinejoy Nuvio Local Scrapers

Nuvio 本地播放源插件。解析逻辑直接在 Android / Nuvio 设备上执行，不经过 Cinejoy 的 Vercel 服务。

## 安装

在 Nuvio 中打开：

Settings → Plugins → Add repository

添加：

https://raw.githubusercontent.com/feixiangdao/test1/main/cinejoy-nuvio

然后刷新仓库并启用需要的 provider。

## 当前 provider

- Cinejoy · VidLink
- Cinejoy · Titan Mesh (VidUp)
- Cinejoy · Nebula Stream X (VidKing)

建议先用《权力的游戏》S01E01 测试 VidUp / VidKing，因为这两条在云服务器环境中曾出现数据中心 IP 403，本地插件正是用于验证设备直连是否可用。

## 说明

- provider 只返回播放地址，不提供目录。
- Nuvio 会向 provider 传入 TMDB ID、movie/tv、season 和 episode。
- Titan Mesh 与 Nebula Stream X 会携带播放所需 headers。
