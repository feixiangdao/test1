# SillyDroid Selection Dictionary v0.3.0

适配目标：SillyDroid 1.0.1.68 / SillyTavern 1.19.0（仍需用户手机真实环境实测）。

## 关键修复

- 删除覆盖聊天正文的常驻浮动「查词」按钮。
- 把入口整合到 SillyTavern **输入框旁的魔法棒菜单**，显示「📖 查词 · 词典 v0.3.0」。
- 修正点击后按钮消失但查词弹窗不显示：弹窗层级提升到最高、增加明确显隐控制。
- 避免自动弹出安卓键盘导致 WebView 高度变化，取消自动聚焦输入框。
- 支持先用安卓系统菜单「复制」，进入魔法棒 → 查词 →「📋 读取剪贴板」。如果 WebView 拒绝读取，手动粘贴。
- 不自动调用模型，只有点「AI 查询」才发起独立查询，避免意外 API 费用。

## 使用方法

1. 打开 RPG 聊天，长按单词或短句，点击安卓系统自带的「复制」。
2. 点击聊天输入框旁的魔法棒图标（SillyTavern Extensions Menu）。
3. 选择「📖 查词 · 词典 v0.3.0」。
4. 在词典中点击「📋 读取剪贴板」；若未获权限，在词典输入框里长按选择「粘贴」。
5. 选择词汇释义、翻译或句式解析，点击「AI 查询」。查询不加入 RPG 对话。

如果魔法棒菜单中没有本项：检查是否已启用第三方扩展，并刷新 SillyTavern 页面。
如果点击菜单项仍无弹窗：请检查手机当前 WebView 页面或查看 SillyDroid 的日志；这表示仍有兼容问题。

## API 与隐私

沿用现有 SillyTavern 的模型 API，使用 `generateRaw()` 单独查询；每次发送所选文本和附近故事上下文，不读取密钥。查词会产生模型 API 使用费用。生词本保存在当前酒馆浏览器 localStorage，清除站点数据可能导致丢失。

## 文件清单

- `manifest.json`
- `dictionary-v030.js`
- `dictionary-v030.css`
- `README.md`

SillyTavern 1.19.0 `public/scripts/templates/wandMenu.html` 中定义了 `#extensionsMenu`，通过它集成入口，避免安卓原生文本选择工具栏的覆盖。