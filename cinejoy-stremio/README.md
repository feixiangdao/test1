# Cinejoy Stremio / Nuvio Addon

Cinejoy 的 Stremio 协议版本。当前采用“首页只保留两个 Catalog”的结构，避免多个插件安装后把首页堆满。

## 首页结构

- Cinejoy · 电影
- Cinejoy · 剧集

其他分类放在 Catalog 的筛选项里，不使用 Deep Link。

### 电影

- 推荐
- 热门
- 正在上映
- 即将上映
- 高评分
- 最新
- 动作 / 冒险 / 动画 / 喜剧 / 犯罪 / 纪录 / 剧情 / 家庭 / 奇幻 / 历史 / 恐怖 / 音乐 / 悬疑 / 爱情 / 科幻 / 电视电影 / 惊悚 / 战争 / 西部
- 年份
- 排序
- 搜索

### 剧集

- 推荐
- 热门
- 今日播出
- 本周播出
- 高评分
- 最新
- 动作冒险 / 动画 / 喜剧 / 犯罪 / 纪录 / 剧情 / 家庭 / 儿童 / 悬疑 / 新闻 / 真人秀 / 科幻奇幻 / 肥皂剧 / 脱口秀 / 战争政治 / 西部
- 年份
- 排序
- 搜索

## 已实现

- 标准 Stremio catalog
- TMDB 实时分类
- IMDb ID 映射，方便与其他 Stremio stream addon 协同
- movie / series meta
- 剧集季 / 集列表
- OpenSubtitles
- SubDL（优先使用 unpack=1 返回的直接字幕文件）
- 配置页
- TMDB / SubDL Key 不写入 GitHub

## 暂未实现

Cinejoy 自己的播放源 resolver 尚未迁移。

当前 Catalog 返回 IMDb ID，因此如果 Stremio / Nuvio 已安装其他支持 IMDb 的 stream addon，打开 Cinejoy 影片时仍可以由那些插件提供播放源。

后续可以继续把 OK影视版现有的 embed provider 做服务器端 resolver，再由本 addon 返回标准 Stremio `stream` 资源。

## 部署到 Vercel

Vercel 目前可直接识别 Express 项目，无需自定义 build command。

1. 在 Vercel 新建 Project。
2. 导入 GitHub 仓库 `feixiangdao/test1`。
3. Root Directory 设置为：

   `cinejoy-stremio`

4. Framework Preset 可保持自动检测。
5. 部署。
6. 打开：

   `https://你的域名/configure`

7. 输入 TMDB API v3 Key；需要 SubDL 时再填写 SubDL API Key。
8. 生成 Manifest URL 后，在 Stremio / Nuvio 中添加。

## Key 说明

配置后的 Manifest URL 中包含 Base64URL 编码后的设置。Key 不会写入公开 GitHub，但 Base64URL 不是加密，因此不要公开分享自己的配置 URL。

如果后续作为多人公共服务使用，应再增加服务端加密 token 或账号级配置存储。
