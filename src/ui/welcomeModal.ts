import { Modal, Setting, setIcon } from "obsidian";
import type XArticleInObsidianPlugin from "../main";

const NODEJS_DOWNLOAD_URL = "https://nodejs.org/en/download";

export class XArticleWelcomeModal extends Modal {
	constructor(
		private readonly plugin: XArticleInObsidianPlugin,
	) {
		super(plugin.app);
	}

	onOpen(): void {
		const { contentEl, modalEl, titleEl } = this;
		modalEl.addClass("x-article-guide-modal");
		titleEl.empty();
		contentEl.empty();

		const headerEl = contentEl.createDiv({ cls: "x-article-guide-modal__header" });
		const iconEl = headerEl.createSpan({ cls: "x-article-guide-modal__icon" });
		setIcon(iconEl, "newspaper");
		const headingWrapEl = headerEl.createDiv({ cls: "x-article-guide-modal__heading" });
		headingWrapEl.createEl("h2", { text: this.plugin.t("guide.title") });

		this.renderSection("guide.section.preview", [
			"guide.preview.open",
			"guide.preview.frontmatter",
			"guide.preview.scroll",
		]);
		this.renderSection("guide.section.publish", [
			"guide.publish.node",
			"guide.publish.bridge",
			"guide.publish.token",
			"guide.publish.cover",
		]);

		new Setting(contentEl)
			.addButton((button) =>
				button
					.setButtonText(this.plugin.t("guide.action.openPreview"))
					.setCta()
					.onClick(() => {
						void this.plugin.activatePreviewView();
						this.close();
					}),
			)
			.addButton((button) =>
				button.setButtonText(this.plugin.t("guide.action.downloadNode")).onClick(() => {
					window.open(NODEJS_DOWNLOAD_URL, "_blank", "noopener,noreferrer");
				}),
			)
			.addButton((button) =>
				button.setButtonText(this.plugin.t("guide.action.openSettings")).onClick(() => {
					this.plugin.openSettingsTab();
					this.close();
				}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("check")
					.setTooltip(this.plugin.t("guide.action.dismiss"))
					.onClick(() => {
						this.plugin.settings.showWelcomeGuide = false;
						void this.plugin.saveSettings();
						this.close();
					}),
			);
	}

	private renderSection(titleKey: Parameters<XArticleInObsidianPlugin["t"]>[0], itemKeys: Parameters<XArticleInObsidianPlugin["t"]>[0][]): void {
		const sectionEl = this.contentEl.createDiv({ cls: "x-article-guide-modal__section" });
		sectionEl.createEl("h3", { text: this.plugin.t(titleKey) });
		const listEl = sectionEl.createEl("ul");
		for (const key of itemKeys) {
			listEl.createEl("li", { text: this.plugin.t(key) });
		}
	}
}
