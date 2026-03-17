import { Plugin, WorkspaceLeaf } from "obsidian";
import {
	COPY_PUBLISH_SCRIPT_COMMAND_ID,
	OPEN_PREVIEW_COMMAND_ID,
	PUBLISH_VIA_MCP_COMMAND_ID,
	REFRESH_PREVIEW_COMMAND_ID,
	VIEW_TYPE_X_ARTICLE_PREVIEW,
} from "./constants";
import { copyPublishScript } from "./commands/copyPublishScript";
import { DEFAULT_SETTINGS, XArticlePreviewSettings, XArticleSettingTab } from "./settings";
import { XArticlePreviewView } from "./views/xArticlePreviewView";

export default class XArticleInObsidianPlugin extends Plugin {
	settings: XArticlePreviewSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_X_ARTICLE_PREVIEW,
			(leaf) => new XArticlePreviewView(leaf, this),
		);

		this.addRibbonIcon("newspaper", "Open X article preview", () => {
			void this.activatePreviewView();
		});

		this.addCommand({
			id: OPEN_PREVIEW_COMMAND_ID,
			name: "Open preview",
			callback: () => {
				void this.activatePreviewView();
			},
		});

		this.addCommand({
			id: REFRESH_PREVIEW_COMMAND_ID,
			name: "Refresh preview",
			callback: () => {
				void this.refreshPreviewViews();
			},
		});

		this.addCommand({
			id: COPY_PUBLISH_SCRIPT_COMMAND_ID,
			name: "Copy X publish script",
			callback: () => {
				void copyPublishScript(this);
			},
		});

		this.addCommand({
			id: PUBLISH_VIA_MCP_COMMAND_ID,
			name: "Publish to X via browser MCP",
			callback: () => {
				void import("./commands/publishViaMcp").then(({ publishViaDetectedMcp }) =>
					publishViaDetectedMcp(this),
				);
			},
		});

		this.addSettingTab(new XArticleSettingTab(this.app, this));
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

	async activatePreviewView(): Promise<void> {
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

		void this.app.workspace.revealLeaf(leaf);
		void this.refreshLeaf(leaf);
	}

	async refreshPreviewViews(): Promise<void> {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_X_ARTICLE_PREVIEW);
		await Promise.all(leaves.map((leaf) => this.refreshLeaf(leaf)));
	}

	private async refreshLeaf(leaf: WorkspaceLeaf): Promise<void> {
		if (leaf.view instanceof XArticlePreviewView) {
			await leaf.view.refresh();
		}
	}
}
