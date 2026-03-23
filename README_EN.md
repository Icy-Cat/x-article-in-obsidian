# 📰 X Article in Obsidian

[![Obsidian](https://img.shields.io/badge/Obsidian-Plugin-7C3AED?style=flat-square)](#) [![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square)](#) [![Version](https://img.shields.io/badge/version-1.0.8-111827?style=flat-square)](#) [![License](https://img.shields.io/badge/license-MIT-16A34A?style=flat-square)](#)

Render the current Markdown note into an X Article-style reading sidebar, so you can write and review the final reading feel at the same time.

> The main development repository has moved to [x-article-workspace](https://github.com/Icy-Cat/x-article-workspace).
> This repository remains focused on the Obsidian plugin release and docs, while shared logic, the VS Code host, and the Claude skill are now maintained in the workspace monorepo.

<p>
  <a href="./README.md">简体中文</a>
</p>

## Why use it

- ✨ Feels closer to a finished article than a normal editor preview
- 📝 Follows the note you are actively editing or viewing
- 🔄 Keeps refreshing while you edit or switch files
- 🧷 Supports rich previews for standalone X / Twitter links
- 📚 Includes frontmatter stripping, title fallback, and draft notice
- 🌐 Supports English and Simplified Chinese UI
- 🚀 Can copy a publish script or publish through Playwright MCP

## Best for

- Drafting X articles, blog posts, and long-form notes
- Writing and previewing in Obsidian without leaving the workspace
- Checking cover, title, summary, and reading rhythm while editing

## Install

### Option 1: install from Release

1. Open the [GitHub Releases page](https://github.com/Icy-Cat/x-article-in-obsidian/releases/latest)
2. Download the latest release zip package and extract it. The extracted folder should contain `main.js`, `manifest.json`, and `styles.css`.
3. In Obsidian, go to **Settings → Community plugins** and click the button that opens the plugins folder.
4. Create a new folder named `x-article-in-obsidian`.
5. Copy `main.js`, `manifest.json`, and `styles.css` into that folder.
6. Back in Obsidian, refresh the installed plugins list and enable the plugin.

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

## How to use

### Preview an article

After enabling the plugin, open the preview with either:

- the newspaper ribbon icon
- **Open preview** in the command palette

The preview pane follows the current Markdown note and supports:

- auto refresh
- synchronized scrolling
- rich previews for standalone X links
- styled code blocks with copy buttons
- frontmatter `title` / `cover` as the preferred hero title and cover source

After installation, the plugin also shows a quick start guide once. You can reopen it anytime with **Open quick start guide** from the command palette.

If you want to add frontmatter, type this at the start of the note:

```md
---
title: Article title
cover: ![[cover.png]]
---
```

### Settings

In **Settings → X Article in Obsidian**, you can configure:

#### General

- `Language`: Follow system, English, or Simplified Chinese

#### Publish

- `Playwright token`: manually paste `PLAYWRIGHT_MCP_EXTENSION_TOKEN`
- `Detect`: scan the local machine for a usable token and save it to plugin settings
- `Install extension`: open the Chrome Web Store install page for Playwright MCP Bridge
- `Node.js`: open the official Node.js download page, required before browser publishing

#### Preview

- `Auto refresh`: refresh the preview when you switch notes or edit the current one
- `Hide frontmatter`: hide YAML frontmatter in the preview
- `Use filename as title`: insert the note filename as a title when the note does not start with a heading
- `Show draft notice`: show a local-only draft notice above the article body

### Publish to X

The plugin currently supports two publishing flows.

#### Option 1: copy the publish script

1. Open a Markdown note
2. Run **Copy X publish script** from the command palette
3. Open the X Article editor in your browser
4. Paste the script into the browser console and run it

#### Option 2: publish through the browser

1. Install the Playwright MCP Bridge extension
2. Install Node.js locally and make sure `node`, `npm`, and `npx` are available in your PATH
3. Use **Install extension** in plugin settings to open the store page
4. Paste or auto-detect the `Playwright token` if needed
5. Make sure Playwright MCP is available on your machine
6. Run **Publish article through browser** from the command palette

If a token has already been saved in plugin settings, the plugin will reuse it and skip repeated browser profile scans.

If you see errors such as `spawn npx ENOENT` or `MCP process closed`, the usual cause is that Node.js is not installed locally or `npx` is not available in PATH. Install Node.js first, then reopen Obsidian.

If the note frontmatter provides `title` and `cover`:

- the preview hero uses them first
- browser publishing fills `title` first
- `cover` is uploaded last so you can still adjust the crop in the browser

## Release development

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

Use frontmatter to control the title and cover:

```md
---
title: My X article title
cover: ![[cover.png]]
---
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
