# Cinejoy Stremio 导航测试

这是一个纯静态的导航原型，用来验证 Stremio 是否能实现：

Cinejoy（一级 Catalog）
→ 推荐电影 / 热门电影 / 热门剧集 / 正在上映 / 即将上映（二级导航卡）
→ Deep Link 跳转到隐藏 Catalog

## 安装

Manifest:

https://raw.githubusercontent.com/feixiangdao/test1/main/cinejoy-stremio-nav/manifest.json

## 当前只验证导航

隐藏 Catalog 目前放的是示例 IMDb 条目，不是正式 Cinejoy/TMDB 数据。

如果交互体验可接受，下一步再替换成动态服务：
- Cinejoy/TMDB 真实分类
- 搜索
- meta
- stream resolver
- OpenSubtitles + SubDL
- 配置页与 Key 管理
