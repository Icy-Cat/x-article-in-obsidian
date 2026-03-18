import { MarkdownView, Plugin, WorkspaceLeaf } from "obsidian";
import {
	COPY_PUBLISH_SCRIPT_COMMAND_ID,
	OPEN_GUIDE_COMMAND_ID,
	OPEN_PREVIEW_COMMAND_ID,
	PUBLISH_VIA_MCP_COMMAND_ID,
	REFRESH_PREVIEW_COMMAND_ID,
	VIEW_TYPE_X_ARTICLE_PREVIEW,
} from "./constants";
import { copyPublishScript } from "./commands/copyPublishScript";
import { translate, type TranslationKey } from "./i18n";
import { DEFAULT_SETTINGS, XArticlePreviewSettings, XArticleSettingTab } from "./settings";
import { XArticleWelcomeModal } from "./ui/welcomeModal";
import { XArticlePreviewView } from "./views/xArticlePreviewView";

type AppWithInternalSettings = typeof Plugin.prototype.app & {
	setting?: {
		open: () => void;
		openTabById: (id: string) => void;
	};
};

export default class XArticleInObsidianPlugin extends Plugin {
	settings: XArticlePreviewSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_X_ARTICLE_PREVIEW,
			(leaf) => new XArticlePreviewView(leaf, this),
		);

		this.addRibbonIcon("newspaper", this.t("ribbon.openPreview"), () => {
			void this.activatePreviewView();
		});

		this.addCommand({
			id: OPEN_PREVIEW_COMMAND_ID,
			name: this.t("command.openPreview"),
			callback: () => {
				void this.activatePreviewView();
			},
		});

		this.addCommand({
			id: REFRESH_PREVIEW_COMMAND_ID,
			name: this.t("command.refreshPreview"),
			callback: () => {
				void this.refreshPreviewViews();
			},
		});

		this.addCommand({
			id: COPY_PUBLISH_SCRIPT_COMMAND_ID,
			name: this.t("command.copyPublishScript"),
			callback: () => {
				void copyPublishScript(this);
			},
		});

		this.addCommand({
			id: PUBLISH_VIA_MCP_COMMAND_ID,
			name: this.t("command.publishViaMcp"),
			callback: () => {
				void import("./commands/publishViaMcp").then(({ publishViaDetectedMcp }) =>
					publishViaDetectedMcp(this),
				);
			},
		});

		this.addCommand({
			id: OPEN_GUIDE_COMMAND_ID,
			name: this.t("command.openGuide"),
			callback: () => {
				this.openWelcomeGuide();
			},
		});

		this.addSettingTab(new XArticleSettingTab(this.app, this));
		this.maybeShowWelcomeGuide();
	}

	onunload(): void {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_X_ARTICLE_PREVIEW);
		void Promise.all(leaves.map((leaf) => leaf.setViewState({ type: "empty" })));
	}

	async loadSettings(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<XArticlePreviewSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	openWelcomeGuide(): void {
		new XArticleWelcomeModal(this).open();
	}

	openSettingsTab(): void {
		const appWithSettings = this.app as AppWithInternalSettings;
		appWithSettings.setting?.open();
		appWithSettings.setting?.openTabById(this.manifest.id);
	}

	t(key: TranslationKey, vars?: Record<string, string | number>): string {
		return translate(this.settings.locale, key, vars);
	}

	async activatePreviewView(): Promise<void> {
		const currentMarkdownFile =
			this.app.workspace.activeEditor?.file ??
			this.app.workspace.getActiveViewOfType(MarkdownView)?.file ??
			null;
		let leaf: WorkspaceLeaf | null =
			this.app.workspace.getLeavesOfType(VIEW_TYPE_X_ARTICLE_PREVIEW)[0] ?? null;

		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false);
		}

		if (!leaf) {
			return;
		}

		if (!(leaf.view instanceof XArticlePreviewView)) {
			await leaf.setViewState({ type: VIEW_TYPE_X_ARTICLE_PREVIEW, active: true });
		}

		if (leaf.view instanceof XArticlePreviewView) {
			leaf.view.setTargetFilePath(currentMarkdownFile?.path ?? null);
		}

		void this.app.workspace.revealLeaf(leaf);
		void this.refreshLeaf(leaf);
	}

	async refreshPreviewViews(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_X_ARTICLE_PREVIEW);
		await Promise.all(leaves.map((leaf) => this.refreshLeaf(leaf)));
	}

	private maybeShowWelcomeGuide(): void {
		if (!this.settings.showWelcomeGuide || this.settings.hasSeenWelcomeGuide) {
			return;
		}

		this.settings.hasSeenWelcomeGuide = true;
		void this.saveSettings();
		window.setTimeout(() => this.openWelcomeGuide(), 300);
	}

	private async refreshLeaf(leaf: WorkspaceLeaf): Promise<void> {
		if (leaf.view instanceof XArticlePreviewView) {
			await leaf.view.refresh();
		}
	}
}
