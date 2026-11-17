# 点读 v0.4.3（SillyDroid 1.0.1.68 / SillyTavern 1.19.0）

将旧版普通 div 弹窗替换为 HTML dialog 原生模态窗口，让弹窗进入 Chromium Top Layer，避免被酒馆抽屉和主题界面的层级压住。

在顶部扩展设置里点击「打开词典 / 自检」，下方实时显示按钮是否响应、dialog 的 open/hidden/display 状态。即便弹窗没有显示，也可以看到诊断信息以便后续准确定位。

轻点英文应自动查询；长按仍保留安卓原生复制菜单。不添加常驻按钮，不改变 RPG 对话。中文解释需要当前模型接口可用。

这是 Chromium 手机视口交互测试版，尚未在 SillyDroid 真机 WebView 上验证。

Git 仓库：https://github.com/feixiangdao/test1
分支：sillydroid-selection-dictionary
