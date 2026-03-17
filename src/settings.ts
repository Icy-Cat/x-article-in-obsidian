import { App, PluginSettingTab, Setting } from "obsidian";
import { detectAndPersistPlaywrightToken } from "./commands/publishViaMcp";
import { LocaleSetting } from "./i18n";
import XArticleInObsidianPlugin from "./main";

const PLAYWRIGHT_BRIDGE_STORE_URL =
	"https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm";

export interface XArticlePreviewSettings {
	locale: LocaleSetting;
	playwrightToken: string;
	autoRefresh: boolean;
	stripFrontmatter: boolean;
	useFilenameAsTitle: boolean;
	showDraftNotice: boolean;
}

export const DEFAULT_SETTINGS: XArticlePreviewSettings = {
	locale: "auto",
	playwrightToken: "",
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

		new Setting(containerEl).setName(this.plugin.t("settings.heading.publish")).setHeading();

		new Setting(containerEl)
			.setName(this.plugin.t("settings.playwrightToken.name"))
			.setDesc(this.plugin.t("settings.playwrightToken.desc"))
			.addText((text) =>
				text
					.setPlaceholder(this.plugin.t("settings.playwrightToken.placeholder"))
					.setValue(this.plugin.settings.playwrightToken)
					.onChange((value) => {
						this.plugin.settings.playwrightToken = value.trim();
						void this.plugin.saveSettings();
					}),
			)
			.addButton((button) =>
				button.setButtonText(this.plugin.t("settings.playwrightToken.detect")).onClick(() => {
					void detectAndPersistPlaywrightToken(this.plugin).then(() => this.display());
				}),
			)
			.addExtraButton((button) =>
				button
					.setIcon("reset")
					.setTooltip(this.plugin.t("settings.playwrightToken.clear"))
					.onClick(() => {
						this.plugin.settings.playwrightToken = "";
						void this.plugin.saveSettings().then(() => this.display());
					}),
			);

		new Setting(containerEl)
			.setName(this.plugin.t("settings.playwrightBridge.name"))
			.setDesc(this.plugin.t("settings.playwrightBridge.desc"))
			.addButton((button) =>
				button
					.setButtonText(this.plugin.t("settings.playwrightBridge.link"))
					.onClick(() => window.open(PLAYWRIGHT_BRIDGE_STORE_URL, "_blank", "noopener,noreferrer")),
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
