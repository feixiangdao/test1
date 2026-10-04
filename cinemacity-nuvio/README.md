# CinemaCity Local for Nuvio

这是一个独立的 Nuvio Local Plugin，专门对应 https://cinemacity.cc/ 。

它不属于 Cinejoy Local、Stellar Local 或 NoctraTV Local。

## 安装地址

https://raw.githubusercontent.com/feixiangdao/test1/main/cinemacity-nuvio/manifest.json

## 当前研究结论（2026-10-04）

公开网页与搜索索引已经确认：

- CinemaCity 有独立 Movies / TV Series 分类与影片详情页；
- 影片详情页会公开影片质量、音轨语言、字幕语言等元数据；
- 网站明确提示：游客不能 Watch / Download，注册登录后才能使用播放和下载；
- 网站目前还有 Cloudflare 人机验证，自动化浏览器在未完成人工验证时无法进入真实播放器 DOM；
- 因此当前没有把任何“猜测的 provider / iframe / 假直链”注册为可用播放源。

## v0.1.0 做了什么

首版先完成登录态适配骨架，不伪造一个“已测试可播”的源：

1. 通过 TMDB ID 获取英文标题 / 原始标题 / 年份；
2. 使用 CinemaCity 自己的搜索入口查找 movie / TV 详情页；
3. 严格比对标题和年份，避免错片；
4. Provider 设置里允许填写你自己的 Session Cookie；
5. 可额外填写与该 Cookie 对应的浏览器 User-Agent，用于 Cloudflare cf_clearance 场景；
6. 只提取 authenticated 页面或同源 player 页面已经暴露的 HLS、MP4、DASH；
7. 不返回 iframe / 网页播放器；
8. 不把 CinemaCity Cookie 发送给第三方 CDN；
9. 没有确认到直链时返回 0 条，避免错片、HTML 假源或无效地址。

## Nuvio 设置

安装 Repository 后：

1. 启用 CinemaCity · Authenticated；
2. 打开该 Provider 的设置；
3. 在浏览器正常登录你自己的 CinemaCity 账号；
4. 把该登录会话的完整 Cookie 请求头复制到 Session Cookie；
5. 如果 Cloudflare 仍然拦截，再把同一浏览器的 User-Agent 填到 Browser User-Agent。

插件源码中不需要填写账号密码。

Session Cookie 等价于临时登录凭证。只应放在你自己的 Nuvio 本地设置中，不要提交到 GitHub、聊天记录或公开配置。

## 当前限制

### 1. 播放链尚未完成 authenticated live verification

公开页面明确要求登录；当前自动化浏览器又被 Cloudflare challenge 挡在播放器之前，因此目前还不能负责任地声称 CinemaCity 的实际登录后播放器直链已经验证成功。

v0.1.0 的原则是：可安装、可配置、可进行真实设备测试，但没有经过登录态验证的 backend 不标记为“已成功”。

### 2. TV episode selector 仍需实机抓一次

电影页和 TV 详情页结构已确认，但第几季第几集如何切换到实际播放器请求，需要在登录后的真实页面抓一次。首版不会猜 endpoint。

### 3. Cloudflare

如果 CinemaCity 的 cf_clearance 与浏览器 User-Agent/IP 绑定，Cookie 与 User-Agent 必须来自同一个有效浏览器会话。失效后需要重新获取。

## 下一步

在 Nuvio 中安装这个 v0.1.0 后，用一部电影测试即可。

如果结果仍然是 0 条，下一轮只需要针对一次真实登录会话定位：

- 详情页实际 player DOM；
- episode 切换请求；
- 同源 player/AJAX endpoint；
- 是否存在二级 provider / CDN；
- 最终 HLS/MP4/DASH 是否需要 Referer、Cookie 或签名参数。

确认一个真实播放链后，再拆成正式 provider，并加入 live probe / CI；不会把未验证 provider 塞进 manifest。
