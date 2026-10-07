# YesMovies Local for Nuvio

独立 YesMovies Provider，和 Cinejoy / Stellar / NoctraTV / OnlyFlix 分开。

## 安装地址

`https://raw.githubusercontent.com/feixiangdao/test1/main/yesmovies-nuvio/manifest.json`

## 当前版本

v0.1.0

## 解析链

1. Nuvio 传入 TMDB ID。
2. TMDB ID → 英文片名 / 原始片名 / 年份。
3. 搜索 YesMovies，匹配电影或 “Title - Season N” 页面。
4. 读取 `/ajax/v4_movie_episodes/{movieId}` 的 Server / Episode 项。
5. 并行尝试：
   - `/ajax/movie_embed/{episodeId}`
   - `/ajax/movie_sources/{episodeId}`
   - `/ajax/movie_token?... → /ajax/movie_sources/{episodeId}?x=...&y=...`
   - POST `/ajax/movie_sources/` + `eid`
6. 只保留可验证的 `.m3u8 / .mp4 / .mpd`。
7. HLS master playlist 会拆成实际 1080p / 720p / 480p 等分辨率。

## v0.1.0 的用途

当前 YesMovies 的动态 AJAX 请求受 Cloudflare / bot protection 影响，云端浏览器未能直接抓到实时 XHR，因此此版本同时兼容历史 YesMovies 的几条已知播放路线，并输出分阶段日志。

实机测试时重点看日志：
- `search ... => N`
- `matched ...`
- `episodes total=N selected=N`
- `server X media candidates=N`
- `token plain server=X`
- `verified streams=N`
- `ERROR ...`

这些日志足够定位下一版需要补的是搜索路径、episode AJAX、token 解码还是具体第三方播放器。
