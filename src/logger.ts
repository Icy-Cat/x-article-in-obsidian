import { FileSystemAdapter, Notice, Platform } from "obsidian";
import type XArticleInObsidianPlugin from "./main";

const LOG_DIRECTORY_NAME = "logs";
const PUBLISH_LOG_FILE_NAME = "publish.log";

type NodeRequireLike = (id: string) => unknown;
type RequireContainer = typeof globalThis & { require?: NodeRequireLike };

export async function appendPublishLog(
	plugin: XArticleInObsidianPlugin,
	event: string,
	details: Record<string, unknown>,
): Promise<void> {
	if (!plugin.settings.enableDebugLog) {
		return;
	}

	const logPath = getPublishLogPath(plugin);
	if (!logPath) {
		return;
	}

	try {
		const req = getNodeRequire();
		const fs = req("node:fs") as typeof import("node:fs");
		const path = req("node:path") as typeof import("node:path");
		fs.mkdirSync(path.dirname(logPath), { recursive: true });
		const entry = [
			`[${new Date().toISOString()}] ${event}`,
			safeStringify(details),
			"",
		].join("\n");
		fs.appendFileSync(logPath, entry, "utf8");
	} catch {
		// Logging must never break the main flow.
	}
}

export async function openPublishLogFile(plugin: XArticleInObsidianPlugin): Promise<void> {
	const logPath = getPublishLogPath(plugin);
	if (!logPath) {
		new Notice(plugin.t("notice.logUnavailable"));
		return;
	}

	try {
		const req = getNodeRequire();
		const fs = req("node:fs") as typeof import("node:fs");
		const path = req("node:path") as typeof import("node:path");
		fs.mkdirSync(path.dirname(logPath), { recursive: true });
		if (!fs.existsSync(logPath)) {
			fs.writeFileSync(logPath, "", "utf8");
		}

		const electron = req("electron") as { shell?: { openPath: (target: string) => Promise<string> } };
		const openResult = await electron.shell?.openPath(logPath);
		if (typeof openResult === "string" && openResult.length > 0) {
			new Notice(plugin.t("notice.logOpenFailed"));
			return;
		}
	} catch {
		new Notice(plugin.t("notice.logOpenFailed"));
	}
}

export function getPublishLogPath(plugin: XArticleInObsidianPlugin): string | null {
	if (!Platform.isDesktopApp) {
		return null;
	}

	const adapter = plugin.app.vault.adapter;
	if (!(adapter instanceof FileSystemAdapter)) {
		return null;
	}

	try {
		const req = getNodeRequire();
		const path = req("node:path") as typeof import("node:path");
		return path.join(
			adapter.getBasePath(),
			plugin.app.vault.configDir,
			"plugins",
			plugin.manifest.id,
			LOG_DIRECTORY_NAME,
			PUBLISH_LOG_FILE_NAME,
		);
	} catch {
		return null;
	}
}

function getNodeRequire(): NodeRequireLike {
	const maybeRequire = (globalThis as RequireContainer).require;
	if (typeof maybeRequire === "function") {
		return maybeRequire;
	}
	throw new Error("Node require is not available in this environment.");
}

function safeStringify(value: unknown): string {
	return JSON.stringify(
		value,
		(_, currentValue) => {
			if (currentValue instanceof Error) {
				return {
					name: currentValue.name,
					message: currentValue.message,
					stack: currentValue.stack,
					...("code" in currentValue ? { code: currentValue.code } : {}),
				};
			}
			return currentValue;
		},
		2,
	);
}
