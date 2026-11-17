# 点读 v0.4.2（SillyDroid 1.0.1.68 / SillyTavern 1.19.0）

## 修复

- 修复点击单词短暂高亮但未打开词典：同时处理安卓短触 `touchend` 和浏览器 `click`，无需依赖 Android WebView 是否合成 `click`。
- 修复因为旧原生选区未清空，导致后续点读被忽略；改用触摸时长及移动距离区分点读、长按、滚动。
- 词典延迟到触摸点击事件结束后打开，避免同一触摸事件立即触发关闭背景。
- 长按原生选词和复制不受插件阻止；无常驻悬浮按钮。
- 插件清单使用新脚本名称，避免旧 WebView 缓存；保留 `点读 v0.4.2` 短名称。

## 使用

打开 RPG 对话，轻点英文单词应出现词典并自动请求 DeepSeek。长按则保留安卓复制菜单。若模型返回空白，请检查 API/思考模式/输出限制。需要关闭点读时，在扩展设置里关闭开关。

Git 仓库：https://github.com/feixiangdao/test1 ，分支：sillydroid-selection-dictionary。

这是模拟安卓触摸测试版，尚未在真实 SillyDroid Android WebView 测试。
