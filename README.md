# SillyDroid RPG 点读英语词典 v0.4.0

适配目标：SillyDroid 1.0.1.68 / SillyTavern 1.19.0。

- 默认开启点读；轻点 RPG 聊天正文中的英文单词，会自动使用当前模型获取中文释义。
- 长按英文再松开，尝试查询所在句（安卓 WebView 长按行为因设备而异）。
- 弹窗可切换词组、翻译、语法解析，保留朗读与生词本。
- **无常驻按钮**，不再要求通过安卓原生菜单或魔法棒查询。
- 在顶部「扩展」设置中找到「点读英语词典」，可关闭点读，恢复安卓原生选择/复制；也提供手动查询入口。
- 只影响聊天正文，不拦截输入框、快捷回复和其他扩展按钮。

技术说明：通过 CSS 禁止正文原生选择，再用触摸坐标及 caretPositionFromPoint / caretRangeFromPoint 检测英文单词，并非真正改动 Android ActionMode。查询调用当前 SillyTavern generateRaw，不改变 RPG 聊天记录，可能消耗 API 额度。跨行拖动选择暂未实现。已作逻辑检查，仍需要你手机真实 Android WebView 验证。

安装：Git 仓库 https://github.com/feixiangdao/test1 ，分支 sillydroid-selection-dictionary。若仍出现旧菜单，卸载**仅本插件**后重新安装、刷新页面。
