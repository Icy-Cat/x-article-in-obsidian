# 📰 X Article Preview

[![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7C3AED?style=flat-square)](#) [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square)](#) [![Version](https://img.shields.io/badge/version-1.0.0-111827?style=flat-square)](#) [![License](https://img.shields.io/badge/license-MIT-16A34A?style=flat-square)](#)

把当前 Markdown 笔记实时渲染成接近 X Article 的阅读侧栏，让你一边写，一边看最终阅读效果。

<p>
  <a href="./README_EN.md">English</a>
</p>

## 为什么用它

- ✨ 更像成稿，而不是普通编辑器预览
- 📝 自动跟随当前正在编辑或查看的笔记
- 🔄 切换文件和修改内容时可持续刷新
- 🧷 独立的 X / Twitter 链接支持富预览
- 📚 支持隐藏 frontmatter、标题兜底和草稿提示

## 适合场景

- 写 X 长文
- 在 Obsidian 里完成写作和排版预览
- 边改边看文章封面、标题、摘要和正文节奏

## 安装

```bash
npm install
npm run build
```

将以下文件放到：

```text
<Vault>/.obsidian/plugins/x-article-in-obsidian/
├── main.js
├── manifest.json
└── styles.css
```

然后重载 Obsidian，并在 **设置 → 第三方插件** 中启用。

## 常用示例

在左侧边栏功能区找到报纸样式的Icon并点击，在右侧边栏打开预览窗口。

在笔记中插入独立 X 链接：

```md
# 我的草稿

https://x.com/xxxxx/status/123123

这段正文会继续按文章内容正常渲染。
```

## 效果截图

![预览效果](./docs/screenshot-1.png)
![侧栏界面](./docs/screenshot-2.png)


## 技术信息

- 语言：TypeScript
- 运行环境：Obsidian Plugin API
- 构建工具：esbuild
- 包管理器：npm
- 协议：MIT

## Star

如果这个项目对你有帮助，欢迎 star。
