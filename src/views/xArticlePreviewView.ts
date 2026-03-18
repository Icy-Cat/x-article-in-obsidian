import {
	ItemView,
	MarkdownRenderer,
	MarkdownView,
	Notice,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { VIEW_TYPE_X_ARTICLE_PREVIEW } from "../constants";
import { buildPreviewMarkdown } from "../markdown";
import type XArticleInObsidianPlugin from "../main";
import { collectPostEmbedCache, enhanceArticlePreview } from "../renderEnhancements";
import { remapArticleDom } from "../templateMapper";

const X_POST_URL_PATTERN =
	/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[^/]+\/status\/\d+(?:[/?#].*)?$/i;
const HERO_SUMMARY_TARGET_LENGTH = 260;

export class XArticlePreviewView extends ItemView {
	plugin: XArticleInObsidianPlugin;
	private toolbarEl!: HTMLDivElement;
	private heroEl!: HTMLDivElement;
	private heroCoverEl!: HTMLDivElement;
	private heroLabelEl!: HTMLDivElement;
	private heroTitleEl!: HTMLDivElement;
	private heroSummaryEl!: HTMLDivElement;
	private noticeEl!: HTMLDivElement;
	private articleEl!: HTMLDivElement;
	private publishButtonEl!: HTMLButtonElement;
	private refreshButtonEl!: HTMLButtonElement;
	private isPublishing = false;
	private refreshToken = 0;
	private refreshTimer: number | null = null;
	private sourceScrollEl: HTMLElement | null = null;
	private sourceScrollHandler: (() => void) | null = null;
	private lastTargetFilePath: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: XArticleInObsidianPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	setTargetFilePath(path: string | null): void {
		this.lastTargetFilePath = path;
	}

	getViewType(): string {
		return VIEW_TYPE_X_ARTICLE_PREVIEW;
	}

	getDisplayText(): string {
		return this.plugin.t("view.title");
	}

	getIcon(): string {
		return "newspaper";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("x-article-preview-view");

		const shellEl = this.contentEl.createDiv({ cls: "x-article-shell" });
		this.toolbarEl = shellEl.createDiv({ cls: "x-article-toolbar" });
		const chromeEl = shellEl.createDiv({ cls: "x-article-chrome" });

		this.publishButtonEl = this.toolbarEl.createEl("button", {
			cls: "x-article-toolbar__button mod-primary",
			text: this.plugin.t("view.publish"),
		});
		this.publishButtonEl.addEventListener("click", () => {
			void this.publish();
		});

		this.heroEl = chromeEl.createDiv({ cls: "x-article-hero" });
		this.heroCoverEl = this.heroEl.createDiv({ cls: "x-article-hero__cover" });
		const heroBadgeEl = this.heroCoverEl.createDiv({ cls: "x-article-hero__badge" });
		this.heroLabelEl = heroBadgeEl.createDiv({ cls: "x-article-hero__label" });
		this.heroLabelEl.setText(this.plugin.t("view.heroBadge"));

		const heroBodyEl = this.heroEl.createDiv({ cls: "x-article-hero__body" });
		this.heroTitleEl = heroBodyEl.createDiv({ cls: "x-article-hero__title" });
		this.heroSummaryEl = heroBodyEl.createDiv({ cls: "x-article-hero__summary" });

		this.refreshButtonEl = this.toolbarEl.createEl("button", {
			cls: "x-article-toolbar__button",
			text: this.plugin.t("view.refresh"),
		});
		this.refreshButtonEl.addEventListener("click", () => {
			void this.refresh();
		});

		const cardEl = shellEl.createDiv({ cls: "x-article-card" });
		this.noticeEl = cardEl.createDiv({ cls: "x-article-draft-notice" });
		this.articleEl = cardEl.createDiv({ cls: "x-article-body markdown-rendered" });

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				if (file instanceof TFile && file.extension === "md") {
					this.lastTargetFilePath = file.path;
				}
				this.queueRefresh();
			}),
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.captureTargetMarkdownView();
				this.bindScrollSync();
				this.queueRefresh();
			}),
		);
		this.registerEvent(this.app.workspace.on("editor-change", () => this.queueRefresh()));
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				const activeView = this.getTargetMarkdownView();
				if (activeView?.file && file.path === activeView.file.path) {
					this.queueRefresh();
					return;
				}
			}),
		);

		this.captureTargetMarkdownView();
		this.bindScrollSync();
		await this.refresh();
	}

	async onClose(): Promise<void> {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
		this.unbindScrollSync();
		this.contentEl.empty();
	}

	queueRefresh(): void {
		if (!this.plugin.settings.autoRefresh) {
			return;
		}

		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}

		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			void this.refresh();
		}, 120);
	}

	async refresh(): Promise<void> {
		const token = ++this.refreshToken;
		const context = await this.getTargetContext();

		this.refreshButtonEl.disabled = true;
		this.syncActionButtons();

		if (!context) {
			this.renderEmptyState(this.plugin.t("view.empty.body"));
			this.refreshButtonEl.disabled = false;
			return;
		}

		try {
			const postEmbedCache = collectPostEmbedCache(this.articleEl);
			this.articleEl.empty();
			this.articleEl.removeClass("is-empty");
			const previewMarkdown = buildPreviewMarkdown(
				context.file,
				context.content,
				this.plugin.settings,
			);

			if (this.plugin.settings.showDraftNotice) {
				this.noticeEl.setText(this.plugin.t("view.draftNotice"));
				this.noticeEl.removeClass("is-hidden");
			} else {
				this.noticeEl.addClass("is-hidden");
			}

			await MarkdownRenderer.render(this.app, previewMarkdown, this.articleEl, context.file.path, this);
			if (token !== this.refreshToken) {
				return;
			}

			remapArticleDom(this.articleEl);
			enhanceArticlePreview(this.articleEl, this.plugin, postEmbedCache);
			this.renderHeroCard(context.file);
			this.syncToSourceScroll();
		} catch (error) {
			console.error("Failed to render X article preview", error);
			this.renderEmptyState(this.plugin.t("view.renderFailed"));
			new Notice(this.plugin.t("notice.renderFailed"));
		} finally {
			this.refreshButtonEl.disabled = false;
			this.syncActionButtons();
		}
	}

	private async publish(): Promise<void> {
		if (this.isPublishing) {
			return;
		}

		this.isPublishing = true;
		this.syncActionButtons();

		try {
			const context = await this.getTargetContext();
			if (!context) {
				new Notice(this.plugin.t("error.openMarkdownFirst"));
				return;
			}
			const { publishViaDetectedMcp } = await import("../commands/publishViaMcp");
			await publishViaDetectedMcp(this.plugin, context);
		} finally {
			this.isPublishing = false;
			this.syncActionButtons();
		}
	}

	private syncActionButtons(): void {
		this.publishButtonEl.disabled = this.isPublishing;
		this.publishButtonEl.setText(
			this.plugin.t(this.isPublishing ? "view.publishing" : "view.publish"),
		);
	}

	private async getTargetContext(): Promise<{ file: TFile; content: string } | null> {
		const activeView = this.getTargetMarkdownView();
		if (activeView?.file) {
			this.lastTargetFilePath = activeView.file.path;
			return {
				file: activeView.file,
				content: activeView.editor.getValue(),
			};
		}

		return null;
	}

	private renderEmptyState(message: string): void {
		this.renderHeroPlaceholder(
			this.plugin.t("view.empty.title"),
			this.plugin.t("view.empty.summary"),
		);
		this.noticeEl.addClass("is-hidden");
		this.articleEl.empty();
		this.articleEl.addClass("is-empty");
		this.articleEl.createDiv({ cls: "x-article-empty" }).setText(message);
	}

	private renderHeroCard(file: TFile): void {
		const title =
			this.getFrontmatterString(file, ["title", "Title"]) ||
			this.articleEl.querySelector(".longform-header-one")?.textContent?.trim() ||
			this.articleEl.querySelector(".longform-header-two")?.textContent?.trim() ||
			file.basename;
		const summary =
			this.extractHeroSummary() || this.plugin.t("view.defaultSummary");
		const coverSrc =
			this.resolveFrontmatterCover(file, ["cover", "Cover"]) ||
			this.articleEl.querySelector<HTMLImageElement>("img")?.getAttribute("src") ||
			null;

		this.heroTitleEl.setText(title);
		this.heroSummaryEl.setText(summary);
		this.heroCoverEl.toggleClass("has-image", Boolean(coverSrc));
		if (coverSrc) {
			this.heroCoverEl.style.setProperty("--x-article-cover-image", `url("${coverSrc}")`);
		} else {
			this.heroCoverEl.style.removeProperty("--x-article-cover-image");
		}
	}

	private renderHeroPlaceholder(title: string, summary: string): void {
		this.heroTitleEl.setText(title);
		this.heroSummaryEl.setText(summary);
		this.heroCoverEl.removeClass("has-image");
		this.heroCoverEl.style.removeProperty("--x-article-cover-image");
	}

	private getFrontmatterString(file: TFile, keys: string[]): string | null {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as
			| Record<string, unknown>
			| undefined;
		if (!frontmatter) {
			return null;
		}

		for (const key of keys) {
			const value = frontmatter[key];
			if (typeof value === "string" && value.trim().length > 0) {
				return value.trim();
			}
		}

		return null;
	}

	private resolveFrontmatterCover(file: TFile, keys: string[]): string | null {
		const rawCover = this.getFrontmatterString(file, keys);
		if (!rawCover) {
			return null;
		}

		const normalized = rawCover
			.replace(/^!\[\[|\]\]$/g, "")
			.replace(/^!\[[^\]]*\]\((.+)\)$/u, "$1")
			.trim();
		if (/^https?:\/\//i.test(normalized)) {
			return normalized;
		}

		const linkedFile =
			this.app.metadataCache.getFirstLinkpathDest(normalized, file.path) ??
			this.app.metadataCache.getFirstLinkpathDest(normalized.replace(/^\.?\//, ""), file.path);

		if (linkedFile instanceof TFile) {
			return this.app.vault.getResourcePath(linkedFile);
		}

		return normalized.length > 0 ? normalized : null;
	}

	private extractHeroSummary(): string {
		const candidates = Array.from(
			this.articleEl.querySelectorAll<HTMLElement>(
				[
					".x-article-paragraph",
					".longform-unstyled",
					".longform-blockquote",
					".longform-unordered-list-item .public-DraftStyleDefault-block",
					".longform-ordered-list-item .public-DraftStyleDefault-block",
				].join(", "),
			),
		);

		const parts: string[] = [];
		for (const candidate of candidates) {
			if (
				candidate.querySelector(
					".x-post-embed, .x-post-card, .x-article-code-frame, .x-article-separator, img, table, iframe, blockquote.twitter-tweet",
				)
			) {
				continue;
			}

			const text = (candidate.textContent ?? "")
				.replace(/[ \t]+/g, " ")
				.replace(/\n{3,}/g, "\n\n")
				.trim();
			if (text.length === 0) {
				continue;
			}

			const links = Array.from(candidate.querySelectorAll<HTMLAnchorElement>("a"));
			if (
				links.length > 0 &&
				links.every((link) => X_POST_URL_PATTERN.test(link.href)) &&
				text.replace(/\s+/g, "") === links.map((link) => link.href).join("").replace(/\s+/g, "")
			) {
				continue;
			}

			parts.push(text);
			if (parts.join("\n\n").length >= HERO_SUMMARY_TARGET_LENGTH) {
				break;
			}
		}

		return parts.join("\n\n").trim();
	}

	private bindScrollSync(): void {
		const nextScrollEl = this.getSourceScrollElement();
		if (nextScrollEl === this.sourceScrollEl) {
			return;
		}

		this.unbindScrollSync();
		if (!nextScrollEl) {
			return;
		}

		const handler = (): void => {
			this.syncToSourceScroll();
		};

		nextScrollEl.addEventListener("scroll", handler, { passive: true });
		this.sourceScrollEl = nextScrollEl;
		this.sourceScrollHandler = handler;
		this.syncToSourceScroll();
	}

	private unbindScrollSync(): void {
		if (this.sourceScrollEl && this.sourceScrollHandler) {
			this.sourceScrollEl.removeEventListener("scroll", this.sourceScrollHandler);
		}
		this.sourceScrollEl = null;
		this.sourceScrollHandler = null;
	}

	private getSourceScrollElement(): HTMLElement | null {
		const activeView = this.getTargetMarkdownView();
		if (!activeView) {
			return null;
		}

		return (
			activeView.containerEl.querySelector(".cm-scroller") ??
			activeView.containerEl.querySelector(".markdown-preview-view")
		);
	}

	private getTargetMarkdownView(): MarkdownView | null {
		if (this.lastTargetFilePath) {
			const matchingLeaf = this.app.workspace.getLeavesOfType("markdown").find((leaf) => {
				return (
					leaf !== this.leaf &&
					leaf.view instanceof MarkdownView &&
					leaf.view.file?.path === this.lastTargetFilePath
				);
			});

			if (matchingLeaf?.view instanceof MarkdownView) {
				return matchingLeaf.view;
			}
		}

		const activeEditorFile = this.app.workspace.activeEditor?.file;
		if (activeEditorFile) {
			const matchingLeaf = this.app.workspace.getLeavesOfType("markdown").find((leaf) => {
				return (
					leaf !== this.leaf &&
					leaf.view instanceof MarkdownView &&
					leaf.view.file?.path === activeEditorFile.path
				);
			});

			if (matchingLeaf?.view instanceof MarkdownView) {
				return matchingLeaf.view;
			}
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView && activeView.leaf !== this.leaf) {
			return activeView;
		}

		const fallbackLeaf = this.app.workspace.getLeavesOfType("markdown").find((leaf) => {
			return leaf !== this.leaf && leaf.view instanceof MarkdownView && Boolean(leaf.view.file);
		});

		return fallbackLeaf?.view instanceof MarkdownView ? fallbackLeaf.view : null;
	}

	private captureTargetMarkdownView(): void {
		const activeEditorFile = this.app.workspace.activeEditor?.file;
		if (activeEditorFile) {
			this.lastTargetFilePath = activeEditorFile.path;
			return;
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView?.file && activeView.leaf !== this.leaf) {
			this.lastTargetFilePath = activeView.file.path;
		}
	}

	private syncToSourceScroll(): void {
		if (!this.sourceScrollEl) {
			return;
		}

		const sourceScrollable = this.sourceScrollEl.scrollHeight - this.sourceScrollEl.clientHeight;
		const previewScrollable = this.contentEl.scrollHeight - this.contentEl.clientHeight;
		if (sourceScrollable <= 0 || previewScrollable <= 0) {
			return;
		}

		const ratio = this.sourceScrollEl.scrollTop / sourceScrollable;
		this.contentEl.scrollTop = previewScrollable * ratio;
	}
}
