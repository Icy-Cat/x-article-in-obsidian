# 📰 X Article Preview

[![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7C3AED?style=flat-square)](#) [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square)](#) [![Version](https://img.shields.io/badge/version-1.0.0-111827?style=flat-square)](#) [![License](https://img.shields.io/badge/license-MIT-16A34A?style=flat-square)](#)

Render the current Markdown note into an X Article-style reading sidebar, so you can write and review the final reading feel at the same time.

<p>
  <a href="./README.md">简体中文</a>
</p>

## Why use it

- ✨ Feels closer to a finished article than a normal editor preview
- 📝 Follows the note you are actively editing or viewing
- 🔄 Keeps refreshing while you edit or switch files
- 🧷 Supports rich previews for standalone X / Twitter links
- 📚 Includes frontmatter stripping, title fallback, and draft notice

## Best for

- Drafting X articles, blog posts, and long-form notes
- Writing and previewing in Obsidian without leaving the workspace
- Checking cover, title, summary, and reading rhythm while editing

## Install

### Option 1: install from Release

1. Open the [GitHub Releases page](https://github.com/Icy-Cat/x-article-in-obsidian/releases/latest)
2. Download `main.js`, `manifest.json`, and `styles.css`, or download the zip package
3. Extract or copy them into:

```text
<Vault>/.obsidian/plugins/x-article-in-obsidian/
```

4. Reload Obsidian and enable the plugin in **Settings → Community plugins**

### Option 2: build from source

```bash
npm install
npm run build
```

Place these files in:

```text
<Vault>/.obsidian/plugins/x-article-in-obsidian/
├── main.js
├── manifest.json
└── styles.css
```

Then reload Obsidian and enable the plugin in **Settings → Community plugins**.

## Release

This repository includes GitHub Actions for automatic build and release.

Latest release: <https://github.com/Icy-Cat/x-article-in-obsidian/releases/latest>

To publish a new version:

```bash
npm version patch
git push
git push --tags
```

The workflow will automatically:

- verify the version in `manifest.json`
- build `main.js`
- package a distributable zip
- upload `main.js`, `manifest.json`, `styles.css`, and the zip to GitHub Release

`versions.json` is updated automatically when `npm version` runs.

## Common examples

Open the preview panel:

```text
Command palette -> Open preview
```

Refresh the preview manually:

```text
Command palette -> Refresh preview
```

Insert a standalone X link in your note:

```md
# My draft

https://x.com/yan5xu/status/2032858943874281782?s=20

This paragraph will still render as normal article content.
```

Use frontmatter for cover and summary:

```md
---
cover: https://example.com/cover.jpg
summary: A long-form draft written in Obsidian.
---

Start writing here.
```

## Screenshot

```text
docs/screenshot-1.png
docs/screenshot-2.png
```

Replace the placeholders with actual images:

```md
![Preview](./docs/screenshot-1.png)
![Sidebar](./docs/screenshot-2.png)
```

## Tech info

- Language: TypeScript
- Runtime: Obsidian Plugin API
- Build: esbuild
- Package manager: npm
- License: MIT

## Star

If this project is useful to you, welcome to star the repo.
