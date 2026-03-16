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
	private heroEl!: HTMLDivElement;
	private heroCoverEl!: HTMLDivElement;
	private heroLabelEl!: HTMLDivElement;
	private heroTitleEl!: HTMLDivElement;
	private heroSummaryEl!: HTMLDivElement;
	private noticeEl!: HTMLDivElement;
	private articleEl!: HTMLDivElement;
	private refreshButtonEl!: HTMLButtonElement;
	private refreshToken = 0;
	private refreshTimer: number | null = null;
	private sourceScrollEl: HTMLElement | null = null;
	private sourceScrollHandler: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: XArticleInObsidianPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_X_ARTICLE_PREVIEW;
	}

	getDisplayText(): string {
		return "X article preview";
	}

	getIcon(): string {
		return "newspaper";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("x-article-preview-view");

		const shellEl = this.contentEl.createDiv({ cls: "x-article-shell" });
		const chromeEl = shellEl.createDiv({ cls: "x-article-chrome" });

		this.heroEl = chromeEl.createDiv({ cls: "x-article-hero" });
		this.heroCoverEl = this.heroEl.createDiv({ cls: "x-article-hero__cover" });
		const heroBadgeEl = this.heroCoverEl.createDiv({ cls: "x-article-hero__badge" });
		this.heroLabelEl = heroBadgeEl.createDiv({ cls: "x-article-hero__label" });
		this.heroLabelEl.setText("Article");

		const heroBodyEl = this.heroEl.createDiv({ cls: "x-article-hero__body" });
		this.heroTitleEl = heroBodyEl.createDiv({ cls: "x-article-hero__title" });
		this.heroSummaryEl = heroBodyEl.createDiv({ cls: "x-article-hero__summary" });

		this.refreshButtonEl = chromeEl.createEl("button", {
			cls: "x-article-refresh",
			text: "Refresh",
		});
		this.refreshButtonEl.addEventListener("click", () => {
			void this.refresh();
		});

		const cardEl = shellEl.createDiv({ cls: "x-article-card" });
		this.noticeEl = cardEl.createDiv({ cls: "x-article-draft-notice" });
		this.articleEl = cardEl.createDiv({ cls: "x-article-body markdown-rendered" });

		this.registerEvent(this.app.workspace.on("file-open", () => this.queueRefresh()));
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				this.bindScrollSync();
				this.queueRefresh();
			}),
		);
		this.registerEvent(this.app.workspace.on("editor-change", () => this.queueRefresh()));
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (activeView?.file && file.path === activeView.file.path) {
					this.queueRefresh();
					return;
				}

				const markdownLeaf = this.app.workspace
					.getLeavesOfType("markdown")
					.find((leaf) => leaf.view instanceof MarkdownView && leaf !== this.leaf);
				const view = markdownLeaf?.view;
				if (view instanceof MarkdownView && view.file && file.path === view.file.path) {
					this.queueRefresh();
				}
			}),
		);

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

		if (!context) {
			this.renderEmptyState("Open a Markdown note to preview it as an X article.");
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
				this.noticeEl.setText("Only you can see this unpublished article preview.");
				this.noticeEl.removeClass("is-hidden");
			} else {
				this.noticeEl.addClass("is-hidden");
			}

			await MarkdownRenderer.render(this.app, previewMarkdown, this.articleEl, context.file.path, this);
			if (token !== this.refreshToken) {
				return;
			}

			remapArticleDom(this.articleEl);
			enhanceArticlePreview(this.articleEl, postEmbedCache);
			this.renderHeroCard(context.file.basename);
			this.syncToSourceScroll();
		} catch (error) {
			console.error("Failed to render X article preview", error);
			this.renderEmptyState("The preview could not be rendered.");
			new Notice("X article preview failed to render.");
		} finally {
			this.refreshButtonEl.disabled = false;
		}
	}

	private async getTargetContext(): Promise<{ file: TFile; content: string } | null> {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (activeView?.file) {
			return {
				file: activeView.file,
				content: activeView.editor.getValue(),
			};
		}

		const markdownLeaf = this.app.workspace
			.getLeavesOfType("markdown")
			.find((leaf) => leaf.view instanceof MarkdownView && leaf !== this.leaf);

		const view = markdownLeaf?.view;
		if (!(view instanceof MarkdownView) || !view.file) {
			return null;
		}

		return {
			file: view.file,
			content: await this.app.vault.cachedRead(view.file),
		};
	}

	private renderEmptyState(message: string): void {
		this.renderHeroPlaceholder("No note selected", "Open a Markdown note to preview it as an X article.");
		this.noticeEl.addClass("is-hidden");
		this.articleEl.empty();
		this.articleEl.addClass("is-empty");
		this.articleEl.createDiv({ cls: "x-article-empty" }).setText(message);
	}

	private renderHeroCard(fallbackTitle: string): void {
		const title =
			this.articleEl.querySelector(".longform-header-one")?.textContent?.trim() ||
			this.articleEl.querySelector(".longform-header-two")?.textContent?.trim() ||
			fallbackTitle;
		const summary =
			this.extractHeroSummary() || "Previewing the current note with an X article layout.";
		const coverSrc =
			this.articleEl.querySelector<HTMLImageElement>("img")?.getAttribute("src") || null;

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
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			return null;
		}

		return (
			activeView.containerEl.querySelector(".cm-scroller") ??
			activeView.containerEl.querySelector(".markdown-preview-view")
		);
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
