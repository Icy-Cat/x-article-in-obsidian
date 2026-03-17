import { App, PluginSettingTab, Setting } from "obsidian";
import { LocaleSetting } from "./i18n";
import XArticleInObsidianPlugin from "./main";

export interface XArticlePreviewSettings {
	locale: LocaleSetting;
	autoRefresh: boolean;
	stripFrontmatter: boolean;
	useFilenameAsTitle: boolean;
	showDraftNotice: boolean;
}

export const DEFAULT_SETTINGS: XArticlePreviewSettings = {
	locale: "auto",
	autoRefresh: true,
	stripFrontmatter: true,
	useFilenameAsTitle: false,
	showDraftNotice: true,
};

export class XArticleSettingTab extends PluginSettingTab {
	plugin: XArticleInObsidianPlugin;

	constructor(app: App, plugin: XArticleInObsidianPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName(this.plugin.t("settings.heading.general")).setHeading();

		new Setting(containerEl)
			.setName(this.plugin.t("settings.language.name"))
			.setDesc(this.plugin.t("settings.language.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("auto", this.plugin.t("settings.locale.auto"))
					.addOption("en", this.plugin.t("settings.locale.en"))
					.addOption("zh-CN", this.plugin.t("settings.locale.zh-CN"))
					.setValue(this.plugin.settings.locale)
					.onChange((value) => {
						this.plugin.settings.locale = value as LocaleSetting;
						void this.plugin.saveSettings().then(() => {
							this.display();
							void this.plugin.refreshPreviewViews();
						});
					}),
			);

		new Setting(containerEl).setName(this.plugin.t("settings.heading.preview")).setHeading();

		new Setting(containerEl)
			.setName(this.plugin.t("settings.autoRefresh.name"))
			.setDesc(this.plugin.t("settings.autoRefresh.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoRefresh).onChange((value) => {
					this.plugin.settings.autoRefresh = value;
					void this.plugin.saveSettings().then(() => this.plugin.refreshPreviewViews());
				}),
			);

		new Setting(containerEl)
			.setName(this.plugin.t("settings.stripFrontmatter.name"))
			.setDesc(this.plugin.t("settings.stripFrontmatter.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.stripFrontmatter).onChange((value) => {
					this.plugin.settings.stripFrontmatter = value;
					void this.plugin.saveSettings().then(() => this.plugin.refreshPreviewViews());
				}),
			);

		new Setting(containerEl)
			.setName(this.plugin.t("settings.useFilenameAsTitle.name"))
			.setDesc(this.plugin.t("settings.useFilenameAsTitle.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.useFilenameAsTitle).onChange((value) => {
					this.plugin.settings.useFilenameAsTitle = value;
					void this.plugin.saveSettings().then(() => this.plugin.refreshPreviewViews());
				}),
			);

		new Setting(containerEl)
			.setName(this.plugin.t("settings.showDraftNotice.name"))
			.setDesc(this.plugin.t("settings.showDraftNotice.desc"))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showDraftNotice).onChange((value) => {
					this.plugin.settings.showDraftNotice = value;
					void this.plugin.saveSettings().then(() => this.plugin.refreshPreviewViews());
				}),
			);
	}
}
