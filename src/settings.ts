import { App, PluginSettingTab, Setting } from "obsidian";
import XArticleInObsidianPlugin from "./main";

export interface XArticlePreviewSettings {
	autoRefresh: boolean;
	stripFrontmatter: boolean;
	useFilenameAsTitle: boolean;
	showDraftNotice: boolean;
}

export const DEFAULT_SETTINGS: XArticlePreviewSettings = {
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

		new Setting(containerEl).setName("Preview").setHeading();

		new Setting(containerEl)
			.setName("Auto refresh")
			.setDesc("Refresh the preview when you switch files or edit the current note.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoRefresh).onChange((value) => {
					this.plugin.settings.autoRefresh = value;
					void this.plugin.saveSettings().then(() => this.plugin.refreshPreviewViews());
				}),
			);

		new Setting(containerEl)
			.setName("Strip frontmatter")
			.setDesc("Hide YAML frontmatter from the article preview.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.stripFrontmatter).onChange((value) => {
					this.plugin.settings.stripFrontmatter = value;
					void this.plugin.saveSettings().then(() => this.plugin.refreshPreviewViews());
				}),
			);

		new Setting(containerEl)
			.setName("Use filename as a title")
			.setDesc("Insert the note filename as a top heading when the note does not start with one.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.useFilenameAsTitle).onChange((value) => {
					this.plugin.settings.useFilenameAsTitle = value;
					void this.plugin.saveSettings().then(() => this.plugin.refreshPreviewViews());
				}),
			);

		new Setting(containerEl)
			.setName("Show draft notice")
			.setDesc("Display the small draft notice above the article body.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.showDraftNotice).onChange((value) => {
					this.plugin.settings.showDraftNotice = value;
					void this.plugin.saveSettings().then(() => this.plugin.refreshPreviewViews());
				}),
			);
	}
}
