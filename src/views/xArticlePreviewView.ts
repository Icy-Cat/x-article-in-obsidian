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
import { enhanceArticlePreview } from "../renderEnhancements";
import { remapArticleDom } from "../templateMapper";

export class XArticlePreviewView extends ItemView {
	plugin: XArticleInObsidianPlugin;
	private statusEl!: HTMLDivElement;
	private metaEl!: HTMLDivElement;
	private noticeEl!: HTMLDivElement;
	private articleEl!: HTMLDivElement;
	private refreshButtonEl!: HTMLButtonElement;
	private refreshToken = 0;
	private refreshTimer: number | null = null;

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

		const badgeEl = chromeEl.createDiv({ cls: "x-article-badge" });
		badgeEl.setText("Preview");

		this.statusEl = chromeEl.createDiv({ cls: "x-article-status" });
		this.metaEl = chromeEl.createDiv({ cls: "x-article-meta" });

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
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.queueRefresh()));
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

		await this.refresh();
	}

	async onClose(): Promise<void> {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
			this.refreshTimer = null;
		}
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
			enhanceArticlePreview(this.articleEl);
			this.statusEl.setText(context.file.basename);
			this.metaEl.setText(`Previewing ${context.file.path}`);
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
		this.statusEl.setText("No note selected");
		this.metaEl.setText("The preview follows the current Markdown file.");
		this.noticeEl.addClass("is-hidden");
		this.articleEl.empty();
		this.articleEl.addClass("is-empty");
		this.articleEl.createDiv({ cls: "x-article-empty" }).setText(message);
	}
}
