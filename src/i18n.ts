export type SupportedLocale = "en" | "zh-CN";
export type LocaleSetting = "auto" | SupportedLocale;

export type TranslationKey =
	| "ribbon.openPreview"
	| "command.openPreview"
	| "command.refreshPreview"
	| "command.copyPublishScript"
	| "command.publishViaMcp"
	| "command.openGuide"
	| "view.title"
	| "view.heroBadge"
	| "view.publish"
	| "view.publishing"
	| "view.refresh"
	| "view.empty.title"
	| "view.empty.summary"
	| "view.empty.body"
	| "view.draftNotice"
	| "view.defaultSummary"
	| "view.renderFailed"
	| "notice.renderFailed"
	| "settings.heading.general"
	| "settings.language.name"
	| "settings.language.desc"
	| "settings.showWelcomeGuide.name"
	| "settings.showWelcomeGuide.desc"
	| "settings.showWelcomeGuide.open"
	| "settings.heading.preview"
	| "settings.heading.publish"
	| "settings.autoRefresh.name"
	| "settings.autoRefresh.desc"
	| "settings.stripFrontmatter.name"
	| "settings.stripFrontmatter.desc"
	| "settings.useFilenameAsTitle.name"
	| "settings.useFilenameAsTitle.desc"
	| "settings.showDraftNotice.name"
	| "settings.showDraftNotice.desc"
	| "settings.locale.auto"
	| "settings.locale.en"
	| "settings.locale.zh-CN"
	| "settings.playwrightToken.name"
	| "settings.playwrightToken.desc"
	| "settings.playwrightToken.placeholder"
	| "settings.playwrightToken.detect"
	| "settings.playwrightToken.clear"
	| "settings.playwrightBridge.name"
	| "settings.playwrightBridge.desc"
	| "settings.playwrightBridge.link"
	| "settings.nodejs.name"
	| "settings.nodejs.desc"
	| "settings.nodejs.link"
	| "notice.copyScriptSuccess"
	| "error.buildPublishScriptFailed"
	| "error.openMarkdownFirst"
	| "notice.publishDesktopOnly"
	| "notice.noBrowserBridge"
	| "notice.nodeRequiredForPublish"
	| "notice.publishSuccess"
	| "notice.publishFailed"
	| "notice.playwrightDisconnected"
	| "notice.playwrightTokenDetected"
	| "notice.playwrightTokenMissing"
	| "render.copyCodeBlock"
	| "render.loadingPostPreview"
	| "render.fallbackPostBody"
	| "render.fallbackPostLink"
	| "render.fallbackPostId"
	| "guide.title"
	| "guide.section.preview"
	| "guide.section.publish"
	| "guide.preview.open"
	| "guide.preview.frontmatter"
	| "guide.preview.scroll"
	| "guide.publish.node"
	| "guide.publish.bridge"
	| "guide.publish.token"
	| "guide.publish.cover"
	| "guide.action.openPreview"
	| "guide.action.downloadNode"
	| "guide.action.openSettings"
	| "guide.action.dismiss";

type Translations = Record<SupportedLocale, Record<TranslationKey, string>>;

const translations: Translations = {
	en: {
		"ribbon.openPreview": "Open X article preview",
		"command.openPreview": "Open preview",
		"command.refreshPreview": "Refresh preview",
		"command.copyPublishScript": "Copy X publish script",
		"command.publishViaMcp": "Publish article through browser",
		"command.openGuide": "Open quick start guide",
		"view.title": "X article preview",
		"view.heroBadge": "Preview",
		"view.publish": "Publish",
		"view.publishing": "Publishing...",
		"view.refresh": "Refresh",
		"view.empty.title": "No note selected",
		"view.empty.summary": "Open a Markdown note to preview it in the X article layout.",
		"view.empty.body": "Open a Markdown note to preview it as an X article.",
		"view.draftNotice": "This is a private draft preview. Only you can see it in Obsidian.",
		"view.defaultSummary": "Previewing the current note with the X article layout.",
		"view.renderFailed": "The preview could not be rendered.",
		"notice.renderFailed": "X article preview failed to render.",
		"settings.heading.general": "General",
		"settings.language.name": "Language",
		"settings.language.desc": "Choose the language for commands, notices, and settings text.",
		"settings.showWelcomeGuide.name": "Show quick start guide",
		"settings.showWelcomeGuide.desc": "Show the welcome guide after installation and keep a button here to reopen it later.",
		"settings.showWelcomeGuide.open": "Open guide",
		"settings.heading.preview": "Preview",
		"settings.heading.publish": "Publish",
		"settings.autoRefresh.name": "Auto refresh",
		"settings.autoRefresh.desc": "Refresh the preview when you switch notes or edit the current one.",
		"settings.stripFrontmatter.name": "Hide frontmatter",
		"settings.stripFrontmatter.desc": "Remove YAML frontmatter from the preview output.",
		"settings.useFilenameAsTitle.name": "Use filename as title",
		"settings.useFilenameAsTitle.desc":
			"Insert the note filename as a top heading when the note does not already start with one.",
		"settings.showDraftNotice.name": "Show draft notice",
		"settings.showDraftNotice.desc": "Show a small private preview notice above the article body.",
		"settings.locale.auto": "Follow system",
		"settings.locale.en": "English",
		"settings.locale.zh-CN": "简体中文",
		"settings.playwrightToken.name": "Playwright token",
		"settings.playwrightToken.desc":
			"Use a saved Playwright MCP extension token to skip repeated browser profile scans. You can paste one manually or detect it automatically.",
		"settings.playwrightToken.placeholder": "Paste PLAYWRIGHT_MCP_EXTENSION_TOKEN",
		"settings.playwrightToken.detect": "Detect",
		"settings.playwrightToken.clear": "Clear",
		"settings.playwrightBridge.name": "Playwright MCP Bridge",
		"settings.playwrightBridge.desc": "Open the Chrome Web Store page to install or manage the bridge extension.",
		"settings.playwrightBridge.link": "Install extension",
		"settings.nodejs.name": "Node.js",
		"settings.nodejs.desc": "Browser publishing requires a local Node.js environment. Open the official download page here.",
		"settings.nodejs.link": "Download Node.js",
		"notice.copyScriptSuccess": "Copied the X publish script to the clipboard.",
		"error.buildPublishScriptFailed": "Failed to build the publish script.",
		"error.openMarkdownFirst": "Open a Markdown note first.",
		"notice.publishDesktopOnly": "Browser publishing is available on desktop only.",
		"notice.noBrowserBridge": "No browser bridge was detected. Configure Playwright MCP first.",
		"notice.nodeRequiredForPublish":
			"Browser publishing requires a local Node.js environment. Install Node.js and make sure node, npm, and npx are available in PATH before using Publish through browser.",
		"notice.publishSuccess": "Published to X through Playwright MCP ({source}).",
		"notice.publishFailed": "Publishing through MCP failed.",
		"notice.playwrightDisconnected":
			"Playwright MCP disconnected before initialization finished. Make sure Chrome or Edge is open and the bridge extension is connected.",
		"notice.playwrightTokenDetected": "Detected and saved the Playwright token ({source}).",
		"notice.playwrightTokenMissing": "No Playwright token was detected.",
		"render.copyCodeBlock": "Copy code block",
		"render.loadingPostPreview": "Loading post preview...",
		"render.fallbackPostBody": "Open the original post on X to view the live embed content.",
		"render.fallbackPostLink": "View post on X",
		"render.fallbackPostId": "Post ID {statusId}",
		"guide.title": "X Aarticle in Obsidian quick start",
		"guide.section.preview": "Preview",
		"guide.section.publish": "Publish",
		"guide.preview.open": "Open the preview from the newspaper ribbon icon on the left or the Open preview command.",
		"guide.preview.frontmatter": "Type --- at the beginning of the note to open frontmatter, then use title and cover to control the hero title and cover image.",
		"guide.preview.scroll": "The preview follows the current Markdown note and keeps scrolling in sync.",
		"guide.publish.node": "Install Node.js locally before using Publish through browser.",
		"guide.publish.bridge": "Install the Playwright MCP Bridge extension from plugin settings.",
		"guide.publish.token": "Paste or auto-detect the Playwright token in settings if needed.",
		"guide.publish.cover": "The publish flow fills the title first and uploads the cover last so you can adjust the crop.",
		"guide.action.openPreview": "Open preview",
		"guide.action.downloadNode": "Download Node.js",
		"guide.action.openSettings": "Open settings",
		"guide.action.dismiss": "Do not show again",
	},
	"zh-CN": {
		"ribbon.openPreview": "打开 X 文章预览",
		"command.openPreview": "打开预览",
		"command.refreshPreview": "刷新预览",
		"command.copyPublishScript": "复制 X 发布脚本",
		"command.publishViaMcp": "通过浏览器发布文章",
		"command.openGuide": "打开快速使用指南",
		"view.title": "X 文章预览",
		"view.heroBadge": "预览",
		"view.publish": "发布",
		"view.publishing": "发布中...",
		"view.refresh": "刷新",
		"view.empty.title": "未选择笔记",
		"view.empty.summary": "打开一篇 Markdown 笔记后，这里会按 X Article 的样式实时预览。",
		"view.empty.body": "请先打开一篇 Markdown 笔记，再在这里预览为 X Article。",
		"view.draftNotice": "这是仅在 Obsidian 中可见的私有草稿预览，不会自动发布。",
		"view.defaultSummary": "正在以 X Article 的版式预览当前笔记。",
		"view.renderFailed": "预览渲染失败。",
		"notice.renderFailed": "X 文章预览渲染失败。",
		"settings.heading.general": "通用",
		"settings.language.name": "语言",
		"settings.language.desc": "设置命令、通知和配置页所使用的界面语言。",
		"settings.showWelcomeGuide.name": "显示快速使用指南",
		"settings.showWelcomeGuide.desc": "安装后显示欢迎引导，并在这里保留一个可再次打开的入口。",
		"settings.showWelcomeGuide.open": "打开指南",
		"settings.heading.preview": "预览",
		"settings.heading.publish": "发布",
		"settings.autoRefresh.name": "自动刷新",
		"settings.autoRefresh.desc": "切换笔记或编辑当前笔记时，自动刷新右侧预览。",
		"settings.stripFrontmatter.name": "隐藏 Frontmatter",
		"settings.stripFrontmatter.desc": "在预览中移除 YAML Frontmatter 内容。",
		"settings.useFilenameAsTitle.name": "文件名补标题",
		"settings.useFilenameAsTitle.desc": "当笔记开头没有一级标题时，自动使用文件名作为标题。",
		"settings.showDraftNotice.name": "显示草稿提示",
		"settings.showDraftNotice.desc": "在正文上方显示一条仅供本地预览的提示信息。",
		"settings.locale.auto": "跟随系统",
		"settings.locale.en": "English",
		"settings.locale.zh-CN": "简体中文",
		"settings.playwrightToken.name": "Playwright Token",
		"settings.playwrightToken.desc":
			"保存 Playwright MCP 扩展 token，避免每次都扫描浏览器配置。可手动填写，也可自动检测后写入。",
		"settings.playwrightToken.placeholder": "粘贴 PLAYWRIGHT_MCP_EXTENSION_TOKEN",
		"settings.playwrightToken.detect": "自动检测",
		"settings.playwrightToken.clear": "清空",
		"settings.playwrightBridge.name": "Playwright MCP Bridge",
		"settings.playwrightBridge.desc": "打开 Chrome 应用商店页面，安装或管理这个桥接扩展。",
		"settings.playwrightBridge.link": "安装扩展",
		"settings.nodejs.name": "Node.js",
		"settings.nodejs.desc": "通过浏览器发布需要本地 Node.js 环境。可在这里打开 Node.js 官网下载页。",
		"settings.nodejs.link": "下载 Node.js",
		"notice.copyScriptSuccess": "已将 X 发布脚本复制到剪贴板。",
		"error.buildPublishScriptFailed": "生成发布脚本失败。",
		"error.openMarkdownFirst": "请先打开一篇 Markdown 笔记。",
		"notice.publishDesktopOnly": "浏览器发布功能仅支持桌面端。",
		"notice.noBrowserBridge": "未检测到浏览器桥接，请先配置 Playwright MCP。",
		"notice.nodeRequiredForPublish":
			"通过浏览器发布需要本地 Node.js 环境。请先安装 Node.js，并确保 node、npm、npx 可在 PATH 中使用，然后再使用浏览器发布。",
		"notice.publishSuccess": "已通过 Playwright MCP 发布到 X（{source}）。",
		"notice.publishFailed": "通过 MCP 发布失败。",
		"notice.playwrightDisconnected":
			"Playwright MCP 在初始化完成前断开连接。请确认 Chrome 或 Edge 已打开，且桥接扩展已连接。",
		"notice.playwrightTokenDetected": "已检测并保存 Playwright token（{source}）。",
		"notice.playwrightTokenMissing": "未检测到 Playwright token。",
		"render.copyCodeBlock": "复制代码块",
		"render.loadingPostPreview": "正在加载帖子预览...",
		"render.fallbackPostBody": "打开 X 原帖即可查看实时嵌入内容。",
		"render.fallbackPostLink": "在 X 中查看原帖",
		"render.fallbackPostId": "帖子 ID {statusId}",
		"guide.title": "X Aarticle in Obsidian快速上手",
		"guide.section.preview": "预览",
		"guide.section.publish": "发布",
		"guide.preview.open": "通过左侧功能区的报纸图标或“打开预览”命令打开侧栏预览。",
		"guide.preview.frontmatter": "可在笔记开头输入 --- 打开 frontmatter，再用 title 和 cover 控制头图标题与封面。",
		"guide.preview.scroll": "预览会跟随当前 Markdown 笔记，并保持滚动同步。",
		"guide.publish.node": "使用“通过浏览器发布”前，请先在本机安装 Node.js。",
		"guide.publish.bridge": "在插件设置中安装 Playwright MCP Bridge 扩展。",
		"guide.publish.token": "如有需要，在设置中粘贴或自动检测 Playwright token。",
		"guide.publish.cover": "发布时会先填写标题，最后上传封面，方便你手动调整封面裁切。",
		"guide.action.openPreview": "打开预览",
		"guide.action.downloadNode": "下载 Node.js",
		"guide.action.openSettings": "打开设置",
		"guide.action.dismiss": "不再显示",
	},
};

export function resolveLocale(localeSetting: LocaleSetting): SupportedLocale {
	if (localeSetting !== "auto") {
		return localeSetting;
	}

	if (typeof navigator !== "undefined") {
		const language = navigator.language.toLowerCase();
		if (language.startsWith("zh")) {
			return "zh-CN";
		}
	}

	return "en";
}

export function translate(
	localeSetting: LocaleSetting,
	key: TranslationKey,
	vars?: Record<string, string | number>,
): string {
	const locale = resolveLocale(localeSetting);
	const template = translations[locale][key] ?? translations.en[key] ?? key;
	if (!vars) {
		return template;
	}

	return template.replace(/\{(\w+)\}/g, (_, name: string) => {
		const value = vars[name];
		return value === undefined ? `{${name}}` : String(value);
	});
}
