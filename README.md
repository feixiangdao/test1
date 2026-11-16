# SillyDroid Selection Dictionary · 划词英语词典

**版本：0.1.1（适配目标 SillyTavern 1.19.0 / SillyDroid 1.0.1.68）**

> 说明：已经按 SillyTavern 1.19.0 官方 `getContext().generateRaw()` 和第三方扩展清单实现，并完成静态检查。**尚未在实际 SillyDroid Android WebView 上运行测试**，尤其长按选词和 TTS 取决于手机 WebView 实现。

## 功能

- 在酒馆聊天消息的英文文本中长按并选中一个单词、词组、句子，显示浮动「查词」按钮。
- 右下角始终有固定「查词」入口：即使 WebView 不出现选词菜单，仍可手动粘贴英文查询。
- 词汇释义、句子翻译、句式解析三种模式。
- 复用 SillyTavern 现有聊天补全模型（例如你配置的 DeepSeek），**不要求额外输入 API Key**。
- 使用 `generateRaw()` 独立请求，无聊天历史；查词结果不会追加到当前 RPG 对话。
- 支持系统英文朗读（取决于 Android WebView/TTS 服务）。
- 生词本本地保存，支持复制生词和解释（可粘贴到 Anki 的表格准备中）。

## 如何安装（优先使用 Git URL）

SillyTavern 官方第三方插件安装器要求 **Git 仓库 URL，而不是 ZIP 或文件名**。此 ZIP 是可上传 GitHub 的完整源码包，不是「角色卡」；切勿从角色管理导入，也不要把它当作 SillyDroid 的「数据迁移 ZIP」导入（后者可能替换你的酒馆数据）。

代码已发布到 GitHub 的独立分支：

- 仓库 URL：`https://github.com/feixiangdao/test1`
- 分支：`sillydroid-selection-dictionary`
- **安装时必须填写该分支，而不是使用默认 `main`。**

安装流程：

1. 在 SillyDroid 点击酒馆上方「扩展」→「安装扩展（Install Extension）」。
2. 粘贴**真实 Git 仓库 URL**，安装到当前用户。
3. 按界面提示刷新页面。
4. 在任意聊天内容中长按英文，选择文字后点击「查词」；或点击右下角的固定入口。

如果尚未上传 GitHub：

1. 解压本包，保持 `manifest.json`、`index.js`、`style.css` 在同一个文件夹根目录。
2. 在你拥有控制权限的 GitHub 仓库根目录上传这三个文件并提交（README 可选）。
3. 使用刚刚上传的仓库 URL 按上述流程安装。

如果能访问酒馆服务器文件系统，也可以把整个 `sillydroid-selection-dictionary` 文件夹放进 `data/default-user/extensions/`，然后重启酒馆服务。但 Android 普通文件管理器通常不能访问 SillyDroid 的应用私有目录。

## 使用说明

1. 长按 RPG 回复里的 `mysterious`、`in the distance` 或整句英语，并拖动选区。
2. 选中后点击附近的小「查词」按钮；若没有出现，用右下角固定的「查词」，也可手动粘贴文本。
3. 选择「词汇释义 / 翻译 / 句式解析」，点击「AI 查询」。
4. 想收藏时点「☆ 收藏本条」；点击「生词本」查看及复制。
5. 查询失败、只出现“思考”或正文为空时，检查模型连接、思考模式及输出 token 上限，必要时重试。

## 安全与限制

- 不包含外部 JS、CDN、广告或远程数据收集逻辑。只调用 SillyTavern 已配置模型。
- **每次查询会消耗模型 API Token，并发送选中文本和最多约 230 字符的故事上下文给当前 API 提供商。** 请勿查询敏感信息。
- 不读取或保存 API Key；不修改任何 SillyTavern 聊天记录、角色卡或世界书。
- 生词本保存在酒馆 WebView 的 `localStorage` 中；清除该网站数据可能丢失收藏。
- 音标与例句是模型生成内容，可能出现错误；系统朗读是否可用由 Android WebView 决定。
- 原生安卓选词工具栏不可由本扩展控制。某些设备上必须改用固定「查词」按钮。
- 本扩展不需要后台服务、Termux 或独立服务器插件，但仍需要酒馆本身连接的 AI 模型可用。

## 文件结构

```
sillydroid-selection-dictionary/
├── manifest.json
├── index.js
├── style.css
└── README.md
```

## 来源与目标接口

- https://docs.sillytavern.app/for-contributors/writing-extensions/ （`getContext().generateRaw()`）
- https://github.com/SillyTavern/SillyTavern/tree/1.19.0 （目标版本）
- https://github.com/jialmaster/SillyDroid （Android 宿主）

## GitHub 说明

此版本位于 `feixiangdao/test1` 仓库的 `sillydroid-selection-dictionary` 分支。该分支根目录只包含插件文件，不修改 `main` 分支及其已有项目。
