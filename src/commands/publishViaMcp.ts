import { Notice, Platform, TFile } from "obsidian";
import { appendPublishLog } from "../logger";
import type XArticleInObsidianPlugin from "../main";
import { buildPublishFunctionForNote, buildPublishFunctionFromActiveNote } from "./copyPublishScript";

type McpRuntimeConfig = {
	command: string;
	args: string[];
	env: Record<string, string>;
	source: string;
};

type JsonRpcResponse = {
	id?: number;
	result?: unknown;
	error?: {
		message?: string;
	};
};

type ParsedMcpConfig = {
	path: string;
	servers: Record<string, ParsedServerEntry>;
};

type ParsedServerEntry = {
	command: string;
	args: string[];
	env: Record<string, string>;
};

type NodeRequireLike = (id: string) => unknown;
type RequireContainer = typeof globalThis & { require?: NodeRequireLike };
type ChildStdoutChunk = string | Uint8Array;

const PLAYWRIGHT_SERVER_NAME = "playwright";
const PLAYWRIGHT_TOKEN_ENV = "PLAYWRIGHT_MCP_EXTENSION_TOKEN";
const PLAYWRIGHT_EXTENSION_ID = "mmlmfjhmonkocbjadbfplnigmagldckm";
const MCP_REQUEST_TIMEOUT_MS = 5_000;
const MCP_EVALUATE_TIMEOUT_MS = 180_000;
const REQUIRED_PLAYWRIGHT_TOOLS = ["browser_navigate", "browser_wait_for", "browser_evaluate"] as const;

type PublishSourceNote = {
	file: TFile;
	content: string;
};

export async function publishViaDetectedMcp(
	plugin: XArticleInObsidianPlugin,
	sourceNote?: PublishSourceNote,
): Promise<void> {
	if (!Platform.isDesktopApp) {
		new Notice(plugin.t("notice.publishDesktopOnly"));
		return;
	}

	try {
		const nodeEnvironment = inspectLocalNodeEnvironment();
		await appendPublishLog(plugin, "publish.preflight", {
			sourceNotePath: sourceNote?.file.path ?? null,
			nodeEnvironment,
		});
		if (!nodeEnvironment.available) {
			new Notice(plugin.t("notice.nodeRequiredForPublish"));
			return;
		}

		const functionSource = sourceNote
			? await buildPublishFunctionForNote(plugin, sourceNote.file, sourceNote.content)
			: await buildPublishFunctionFromActiveNote(plugin);
		const runtime = await detectPlaywrightRuntime(plugin);
		if (!runtime) {
			await appendPublishLog(plugin, "publish.runtime_missing", {
				sourceNotePath: sourceNote?.file.path ?? null,
				nodeEnvironment,
			});
			new Notice(plugin.t("notice.noBrowserBridge"));
			return;
		}
		await appendPublishLog(plugin, "publish.runtime_detected", {
			sourceNotePath: sourceNote?.file.path ?? null,
			runtime,
			functionSourceLength: functionSource.length,
		});

		const client = await StdioMcpClient.connect(runtime);
		try {
			await client.assertToolsAvailable(REQUIRED_PLAYWRIGHT_TOOLS);
			await client.callTool("browser_navigate", { url: "https://x.com/compose/articles" });
			await client.callTool("browser_wait_for", { time: 2 });
			await client.callTool("browser_evaluate", {
				function: normalizeEvaluateSource(`async () => {
					const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
					const findCreateButton = () =>
						document.querySelector("button[aria-label='create']") ||
						Array.from(document.querySelectorAll("button[role='button'], button")).find((button) =>
							(button.getAttribute("aria-label") || "").toLowerCase() === "create"
						);

					const button = findCreateButton();
					if (!button) {
						throw new Error("Create button not found.");
					}

					button.click();

					for (let attempt = 0; attempt < 30; attempt += 1) {
						const editor =
							document.querySelector("[data-contents='true'] [contenteditable='true']") ||
							document.querySelector("[contenteditable='true']");
						if (editor) {
							return true;
						}
						await sleep(200);
					}

					throw new Error("Editor did not become ready after clicking create.");
				}`),
			}, MCP_EVALUATE_TIMEOUT_MS);
			const publishResult = parsePlaywrightToolResult(
				await client.callTool(
					"browser_evaluate",
					{ function: normalizeEvaluateSource(functionSource) },
					MCP_EVALUATE_TIMEOUT_MS,
				),
			);
			if (!isSuccessfulPublishResult(publishResult)) {
				throw new Error(
					`Browser publish script did not report success. Result: ${stringifyPlaywrightResult(publishResult)}`,
				);
			}
		} finally {
			await client.close();
		}

		await appendPublishLog(plugin, "publish.success", {
			sourceNotePath: sourceNote?.file.path ?? null,
			runtimeSource: runtime.source,
		});
		new Notice(plugin.t("notice.publishSuccess", { source: runtime.source }));
	} catch (error) {
		await appendPublishLog(plugin, "publish.error", {
			sourceNotePath: sourceNote?.file.path ?? null,
			error,
			normalizedMessage: normalizeMcpErrorMessage(error, plugin),
		});
		const message = normalizeMcpErrorMessage(error, plugin);
		new Notice(message);
	}
}

export async function detectAndPersistPlaywrightToken(
	plugin: XArticleInObsidianPlugin,
): Promise<string | null> {
	const detection = detectPlaywrightToken(plugin, undefined, { ignoreSavedToken: true });
	if (!detection) {
		new Notice(plugin.t("notice.playwrightTokenMissing"));
		return null;
	}

	if (plugin.settings.playwrightToken !== detection.token) {
		plugin.settings.playwrightToken = detection.token;
		await plugin.saveSettings();
	}

	new Notice(plugin.t("notice.playwrightTokenDetected", { source: detection.source }));
	return detection.token;
}

async function detectPlaywrightRuntime(plugin: XArticleInObsidianPlugin): Promise<McpRuntimeConfig | null> {
	const req = getNodeRequire();
	const path = req("node:path") as typeof import("node:path");
	const os = req("node:os") as typeof import("node:os");
	const processRef = req("node:process") as typeof import("node:process");

	const configs = getDefaultMcpConfigPaths(path, os.homedir(), processRef.cwd());
	const parsedConfigs = configs
		.map((configPath) => readMcpConfig(configPath))
		.filter((config): config is ParsedMcpConfig => config !== null);

	const detectedToken = detectPlaywrightToken(plugin, parsedConfigs);
	const extensionToken = detectedToken?.token ?? processRef.env[PLAYWRIGHT_TOKEN_ENV] ?? undefined;

	if (
		detectedToken?.source === "browser profile scan" &&
		detectedToken.token !== plugin.settings.playwrightToken
	) {
		plugin.settings.playwrightToken = detectedToken.token;
		void plugin.saveSettings();
	}

	return (
		findPlaywrightRuntime(parsedConfigs, extensionToken) ??
		(extensionToken
			? {
					command: "npx",
					args: ["-y", "@playwright/mcp@latest", "--extension"],
					env: { [PLAYWRIGHT_TOKEN_ENV]: extensionToken },
					source: "auto-detected token",
				}
			: null)
	);
}

function detectPlaywrightToken(
	plugin: XArticleInObsidianPlugin,
	parsedConfigs?: ParsedMcpConfig[],
	options?: { ignoreSavedToken?: boolean },
): { token: string; source: string } | null {
	const req = getNodeRequire();
	const path = req("node:path") as typeof import("node:path");
	const os = req("node:os") as typeof import("node:os");
	const processRef = req("node:process") as typeof import("node:process");

	const savedToken = plugin.settings.playwrightToken.trim();
	if (!options?.ignoreSavedToken && savedToken) {
		return { token: savedToken, source: "plugin settings" };
	}

	const envToken = processRef.env[PLAYWRIGHT_TOKEN_ENV];
	if (envToken) {
		return { token: envToken, source: PLAYWRIGHT_TOKEN_ENV };
	}

	const configs =
		parsedConfigs ??
		getDefaultMcpConfigPaths(path, os.homedir(), processRef.cwd())
			.map((configPath) => readMcpConfig(configPath))
			.filter((config): config is ParsedMcpConfig => config !== null);

	const configToken = findPlaywrightTokenInConfigs(configs);
	if (configToken) {
		return { token: configToken, source: "MCP config" };
	}

	const scannedToken = discoverPlaywrightExtensionToken(req, path, os, processRef);
	if (scannedToken) {
		return { token: scannedToken, source: "browser profile scan" };
	}

	return null;
}

function readMcpConfig(configPath: string): ParsedMcpConfig | null {
	const req = getNodeRequire();
	const fs = req("node:fs") as typeof import("node:fs");

	if (!fs.existsSync(configPath)) {
		return null;
	}

	try {
		const content = fs.readFileSync(configPath, "utf-8");
		if (configPath.endsWith(".toml")) {
			return {
				path: configPath,
				servers: readTomlServers(content),
			};
		}

		const parsed = JSON.parse(content) as {
			mcpServers?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>;
			mcp?: Record<
				string,
				{ command?: string | string[]; args?: string[]; env?: Record<string, string>; enabled?: boolean }
			>;
		};

		const servers: Record<string, ParsedServerEntry> = {};
		for (const [name, server] of Object.entries(parsed.mcpServers ?? {})) {
			if (!server.command) {
				continue;
			}
			servers[name] = {
				command: server.command,
				args: server.args ?? [],
				env: normalizeEnv(server.env),
			};
		}

		for (const [name, server] of Object.entries(parsed.mcp ?? {})) {
			const commandParts = Array.isArray(server.command)
				? server.command
				: server.command
					? [server.command]
					: [];
			if (commandParts.length === 0) {
				continue;
			}
			const [command, ...embeddedArgs] = commandParts;
			if (!command) {
				continue;
			}
			servers[name] = {
				command,
				args: [...embeddedArgs, ...(server.args ?? [])],
				env: normalizeEnv(server.env),
			};
		}

		return { path: configPath, servers };
	} catch {
		return null;
	}
}

function normalizeEnv(env: Record<string, string> | undefined): Record<string, string> {
	const normalized: Record<string, string> = {};
	for (const [key, value] of Object.entries(env ?? {})) {
		if (typeof value === "string" && value.length > 0) {
			normalized[key] = value;
		}
	}
	return normalized;
}

function readTomlServers(content: string): Record<string, ParsedServerEntry> {
	const servers: Record<string, ParsedServerEntry> = {};
	const sectionRegex = /^\s*\[mcp_servers\.([^.]+)\]\s*$/gm;
	const matches = Array.from(content.matchAll(sectionRegex));

	for (let index = 0; index < matches.length; index += 1) {
		const match = matches[index];
		if (!match) {
			continue;
		}
		const name = match[1];
		if (!name) {
			continue;
		}
		const start = match.index ?? 0;
		const nextMatch = index + 1 < matches.length ? matches[index + 1] : undefined;
		const end = nextMatch?.index ?? content.length;
		const section = content.slice(start, end);

		const commandMatch = section.match(/^\s*command\s*=\s*"([^"\n]+)"/m);
		const argsMatch = section.match(/^\s*args\s*=\s*\[([^\]]*)\]/m);
		if (!commandMatch?.[1]) {
			continue;
		}

		const envSectionMatch = section.match(/\[mcp_servers\.[^.]+\.env\]([\s\S]*)$/m);
		const env: Record<string, string> = {};
		for (const envMatch of (envSectionMatch?.[1] ?? "").matchAll(/^\s*([A-Z0-9_]+)\s*=\s*"([^"\n]+)"/gm)) {
			if (envMatch[1] && envMatch[2]) {
				env[envMatch[1]] = envMatch[2];
			}
		}

		servers[name] = {
			command: commandMatch[1],
			args: parseTomlArray(argsMatch?.[1] ?? ""),
			env,
		};
	}

	return servers;
}

function parseTomlArray(value: string): string[] {
	return value
		.split(",")
		.map((part) => part.trim().replace(/^"/, "").replace(/"$/, ""))
		.filter((part) => part.length > 0);
}

function getDefaultMcpConfigPaths(path: typeof import("node:path"), home: string, cwd: string): string[] {
	return [
		path.join(home, ".codex", "config.toml"),
		path.join(home, ".codex", "mcp.json"),
		path.join(home, ".cursor", "mcp.json"),
		path.join(home, ".claude.json"),
		path.join(home, ".gemini", "settings.json"),
		path.join(home, ".gemini", "antigravity", "mcp_config.json"),
		path.join(home, ".config", "opencode", "opencode.json"),
		path.join(cwd, ".cursor", "mcp.json"),
		path.join(cwd, ".vscode", "mcp.json"),
		path.join(cwd, ".opencode", "opencode.json"),
		path.join(cwd, ".mcp.json"),
	];
}

function findPlaywrightTokenInConfigs(configs: ParsedMcpConfig[]): string | null {
	for (const config of configs) {
		const server = config.servers[PLAYWRIGHT_SERVER_NAME];
		const token = server?.env[PLAYWRIGHT_TOKEN_ENV];
		if (token) {
			return token;
		}
	}
	return null;
}

function findPlaywrightRuntime(
	configs: ParsedMcpConfig[],
	token: string | undefined,
): McpRuntimeConfig | null {
	for (const config of configs) {
		const server = config.servers[PLAYWRIGHT_SERVER_NAME];
		if (!server) {
			continue;
		}
		return normalizeRuntimeConfig({
			command: server.command,
			args: server.args,
			env: {
				...server.env,
				...(token ? { [PLAYWRIGHT_TOKEN_ENV]: token } : {}),
			},
			source: config.path,
		});
	}
	return null;
}

function normalizeRuntimeConfig(runtime: McpRuntimeConfig): McpRuntimeConfig {
	const normalized = wrapShellScriptRuntime(resolveExecutablePath(unwrapShellCommand(runtime)));
	const commandName = normalized.command.toLowerCase();
	if (!commandName.endsWith("npx") && !commandName.endsWith("npx.cmd")) {
		return normalized;
	}

	if (normalized.args.includes("-y") || normalized.args.includes("--yes")) {
		return normalized;
	}

	return {
		...normalized,
		args: ["-y", ...normalized.args],
	};
}

function unwrapShellCommand(runtime: McpRuntimeConfig): McpRuntimeConfig {
	const command = runtime.command.toLowerCase();
	if (command !== "cmd" && command !== "cmd.exe") {
		return runtime;
	}

	const args = [...runtime.args];
	let cursor = 0;
	while (cursor < args.length) {
		const current = args[cursor]?.toLowerCase();
		if (!current) {
			cursor += 1;
			continue;
		}
		if (current === "/c") {
			const nextCommand = args[cursor + 1];
			if (!nextCommand) {
				return runtime;
			}
			return {
				...runtime,
				command: nextCommand,
				args: args.slice(cursor + 2),
			};
		}
		if (current === "/s") {
			cursor += 1;
			continue;
		}
		break;
	}

	return runtime;
}

function resolveExecutablePath(runtime: McpRuntimeConfig): McpRuntimeConfig {
	const req = getNodeRequire();
	const path = req("node:path") as typeof import("node:path");
	const os = req("node:os") as typeof import("node:os");
	const fs = req("node:fs") as typeof import("node:fs");
	const processRef = req("node:process") as typeof import("node:process");

	const candidates = buildExecutableCandidates(runtime.command, path, os, fs, processRef);
	for (const candidate of candidates) {
		if (!path.isAbsolute(candidate)) {
			continue;
		}
		if (fs.existsSync(candidate)) {
			return {
				...runtime,
				command: candidate,
			};
		}
	}

	return runtime;
}

function buildExecutableCandidates(
	command: string,
	path: typeof import("node:path"),
	os: typeof import("node:os"),
	fs: typeof import("node:fs"),
	processRef: typeof import("node:process"),
): string[] {
	const candidates: string[] = [];
	const lower = command.toLowerCase();
	const isWindows = processRef.platform === "win32";
	const pathEntries = getExecutableSearchDirs(path, os, fs, processRef);
	const hasExtension = /\.[a-z0-9]+$/i.test(command);

	if (path.isAbsolute(command)) {
		candidates.push(command);
		return candidates;
	}

	for (const entry of pathEntries) {
		if (!hasExtension) {
			if (isWindows) {
				candidates.push(path.join(entry, `${command}.cmd`));
				candidates.push(path.join(entry, `${command}.exe`));
				candidates.push(path.join(entry, `${command}.bat`));
				candidates.push(path.join(entry, command));
			} else {
				candidates.push(path.join(entry, command));
			}
		} else {
			candidates.push(path.join(entry, command));
		}
	}

	if (isWindows) {
		const appData = getEnvValue(processRef, "APPDATA") ?? path.join(os.homedir(), "AppData", "Roaming");
		const programFiles = getEnvValue(processRef, "ProgramFiles") ?? "C:\\Program Files";
		const programFilesX86 = getEnvValue(processRef, "ProgramFiles(x86)") ?? "C:\\Program Files (x86)";
		if (lower === "npx" || lower === "npx.cmd") {
			candidates.push(path.join(appData, "npm", "npx.cmd"));
		}
		if (lower === "npm" || lower === "npm.cmd") {
			candidates.push(path.join(appData, "npm", "npm.cmd"));
		}
		if (lower === "node" || lower === "node.exe") {
			candidates.push(path.join(programFiles, "nodejs", "node.exe"));
			candidates.push(path.join(programFilesX86, "nodejs", "node.exe"));
		}
		if (lower === "npm" || lower === "npm.cmd" || lower === "npx" || lower === "npx.cmd") {
			candidates.push(path.join(programFiles, "nodejs", `${command.replace(/\.cmd$/i, "")}.cmd`));
			candidates.push(path.join(programFilesX86, "nodejs", `${command.replace(/\.cmd$/i, "")}.cmd`));
		}
	}

	return Array.from(new Set(candidates));
}

function getEnvValue(processRef: typeof import("node:process"), name: string): string | undefined {
	const direct = processRef.env[name];
	if (typeof direct === "string" && direct.length > 0) {
		return direct;
	}

	const matchedKey = Object.keys(processRef.env).find((key) => key.toLowerCase() === name.toLowerCase());
	if (!matchedKey) {
		return undefined;
	}
	const value = processRef.env[matchedKey];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getExecutableSearchDirs(
	path: typeof import("node:path"),
	os: typeof import("node:os"),
	fs: typeof import("node:fs"),
	processRef: typeof import("node:process"),
): string[] {
	const dirs = new Set<string>();
	const addDir = (dir: string | undefined) => {
		if (!dir) {
			return;
		}
		const normalized = dir.trim();
		if (!normalized) {
			return;
		}
		dirs.add(normalized);
	};
	const addExistingChildDirs = (baseDir: string, childDirName: string) => {
		if (!fs.existsSync(baseDir)) {
			return;
		}
		try {
			const entries = fs.readdirSync(baseDir, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) {
					continue;
				}
				addDir(path.join(baseDir, entry.name, childDirName));
			}
		} catch {
			// Ignore unreadable version-manager directories.
		}
	};

	const envPath = getEnvValue(processRef, "PATH");
	for (const entry of (envPath ?? "").split(path.delimiter)) {
		addDir(entry);
	}

	const home = os.homedir();
	if (processRef.platform === "win32") {
		addDir(path.join(getEnvValue(processRef, "APPDATA") ?? path.join(home, "AppData", "Roaming"), "npm"));
		addDir(path.join(getEnvValue(processRef, "LOCALAPPDATA") ?? path.join(home, "AppData", "Local"), "Volta", "bin"));
		addDir(path.join(getEnvValue(processRef, "ProgramFiles") ?? "C:\\Program Files", "nodejs"));
		addDir(path.join(getEnvValue(processRef, "ProgramFiles(x86)") ?? "C:\\Program Files (x86)", "nodejs"));
	} else {
		addDir("/opt/homebrew/bin");
		addDir("/usr/local/bin");
		addDir("/opt/local/bin");
		addDir("/usr/local/sbin");
		addDir(path.join(home, ".volta", "bin"));
		addDir(path.join(home, ".fnm"));
		addDir(path.join(home, ".asdf", "shims"));
		addDir(path.join(home, ".nodenv", "shims"));
		addDir(path.join(home, ".n", "bin"));
		addDir(path.join(home, ".local", "bin"));
		addExistingChildDirs(path.join(home, ".nvm", "versions", "node"), "bin");
		addExistingChildDirs(path.join(home, ".fnm", "node-versions"), path.join("installation", "bin"));
	}

	return Array.from(dirs);
}

function inspectLocalNodeEnvironment(): {
	available: boolean;
	tools: Array<{ name: string; resolved: string | null; candidates: string[] }>;
	pathEntries: string[];
	error?: string;
} {
	try {
		const req = getNodeRequire();
		const path = req("node:path") as typeof import("node:path");
		const os = req("node:os") as typeof import("node:os");
		const fs = req("node:fs") as typeof import("node:fs");
		const processRef = req("node:process") as typeof import("node:process");
		const names = ["node", "npm", "npx"];
		const pathEntries = getExecutableSearchDirs(path, os, fs, processRef);

		const tools = names.map((name) => {
			const candidates = buildExecutableCandidates(name, path, os, fs, processRef);
			const resolved = candidates.find((candidate) => path.isAbsolute(candidate) && fs.existsSync(candidate)) ?? null;
			return {
				name,
				resolved,
				candidates,
			};
		});

		return {
			available: tools.every((tool) => Boolean(tool.resolved)),
			tools,
			pathEntries,
		};
	} catch (error) {
		return {
			available: false,
			tools: [],
			pathEntries: [],
			...(error instanceof Error ? { error: error.message } : { error: String(error) }),
		};
	}
}

function wrapShellScriptRuntime(runtime: McpRuntimeConfig): McpRuntimeConfig {
	const req = getNodeRequire();
	const processRef = req("node:process") as typeof import("node:process");
	if (processRef.platform !== "win32") {
		return runtime;
	}

	const lower = runtime.command.toLowerCase();
	if (!lower.endsWith(".cmd") && !lower.endsWith(".bat")) {
		return runtime;
	}

	return {
		...runtime,
		command: processRef.env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
		args: ["/d", "/s", "/c", runtime.command, ...runtime.args],
	};
}

function discoverPlaywrightExtensionToken(
	req: NodeRequireLike,
	path: typeof import("node:path"),
	os: typeof import("node:os"),
	processRef: typeof import("node:process"),
): string | null {
	const fs = req("node:fs") as typeof import("node:fs");
	const bufferModule = req("node:buffer") as typeof import("node:buffer");
	const home = os.homedir();
	const appData = processRef.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
	const bases = [
		path.join(appData, "Google", "Chrome", "User Data"),
		path.join(appData, "Microsoft", "Edge", "User Data"),
	];
	const profiles = ["Default", "Profile 1", "Profile 2", "Profile 3"];
	const tokenRe = /([A-Za-z0-9_-]{40,50})/;
	const extIdBuf = bufferModule.Buffer.from(PLAYWRIGHT_EXTENSION_ID);
	const keyBuf = bufferModule.Buffer.from("auth-token");

	for (const base of bases) {
		for (const profile of profiles) {
			const dir = path.join(base, profile, "Local Storage", "leveldb");
			if (!fs.existsSync(dir)) {
				continue;
			}

			let files: string[] = [];
			try {
				files = fs
					.readdirSync(dir)
					.filter((file) => file.endsWith(".ldb") || file.endsWith(".log"))
					.map((file) => path.join(dir, file));
			} catch {
				continue;
			}

			files.sort((left, right) => {
				try {
					return fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs;
				} catch {
					return 0;
				}
			});

			for (const filePath of files) {
				let data: import("node:buffer").Buffer;
				try {
					data = fs.readFileSync(filePath);
				} catch {
					continue;
				}

				const extPos = data.indexOf(extIdBuf);
				if (extPos === -1) {
					continue;
				}

				let cursor = 0;
				while (true) {
					const keyPos = data.indexOf(keyBuf, cursor);
					if (keyPos === -1) {
						break;
					}
					const contextStart = Math.max(0, keyPos - 500);
					const extensionPos = data.indexOf(extIdBuf, contextStart);
					if (extensionPos !== -1 && extensionPos < keyPos) {
						const candidate = data
							.subarray(keyPos + keyBuf.length, keyPos + keyBuf.length + 200)
							.toString("latin1")
							.match(tokenRe)?.[1];
						if (candidate && validateBase64urlToken(candidate)) {
							return candidate;
						}
					}
					cursor = keyPos + 1;
				}
			}
		}
	}

	return null;
}

function validateBase64urlToken(token: string): boolean {
	try {
		const req = getNodeRequire();
		const bufferModule = req("node:buffer") as typeof import("node:buffer");
		const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
		const decoded = bufferModule.Buffer.from(normalized, "base64");
		return decoded.length >= 28 && decoded.length <= 36;
	} catch {
		return false;
	}
}

class StdioMcpClient {
	private nextId = 1;
	private pending = new Map<number, { resolve: (value: JsonRpcResponse) => void; reject: (reason?: unknown) => void }>();
	private buffer = "";
	private readonly stderrChunks: string[] = [];
	private closed = false;
	private exitCode: number | null = null;
	private signal: string | null = null;
	private spawnError: Error | null = null;
	private stdinError: Error | null = null;

	private constructor(
		private readonly proc: import("node:child_process").ChildProcessWithoutNullStreams,
	) {}

	static async connect(runtime: McpRuntimeConfig): Promise<StdioMcpClient> {
		const req = getNodeRequire();
		const childProcess = req("node:child_process") as typeof import("node:child_process");
		const processRef = req("node:process") as typeof import("node:process");
		const proc = childProcess.spawn(runtime.command, runtime.args, {
			stdio: "pipe",
			env: {
				...processRef.env,
				...runtime.env,
			},
		});
		const client = new StdioMcpClient(proc);
		client.attach();
		await client.request(
			"initialize",
			{
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "x-article-in-obsidian", version: "1.0.2" },
			},
			MCP_REQUEST_TIMEOUT_MS,
		);
		client.writeFrame({ jsonrpc: "2.0", method: "notifications/initialized" });
		return client;
	}

	private attach(): void {
		this.proc.stdout.on("data", (chunk: ChildStdoutChunk) => {
			const req = getNodeRequire();
			const bufferModule = req("node:buffer") as typeof import("node:buffer");
			const nextChunk =
				typeof chunk === "string"
					? chunk
					: bufferModule.Buffer.from(chunk).toString("utf8");
			this.buffer += nextChunk;
			const lines = this.buffer.split("\n");
			this.buffer = lines.pop() ?? "";
			for (const line of lines) {
				if (!line.trim()) {
					continue;
				}
				try {
					const response = JSON.parse(line) as JsonRpcResponse;
					if (typeof response.id !== "number") {
						continue;
					}
					const pending = this.pending.get(response.id);
					if (!pending) {
						continue;
					}
					this.pending.delete(response.id);
					pending.resolve(response);
				} catch {
					continue;
				}
			}
		});

		this.proc.stderr.on("data", (chunk: ChildStdoutChunk) => {
			const req = getNodeRequire();
			const bufferModule = req("node:buffer") as typeof import("node:buffer");
			const nextChunk =
				typeof chunk === "string"
					? chunk
					: bufferModule.Buffer.from(chunk).toString("utf8");
			this.stderrChunks.push(nextChunk);
			if (this.stderrChunks.length > 20) {
				this.stderrChunks.shift();
			}
		});

		this.proc.on("error", (error) => {
			this.spawnError = error instanceof Error ? error : new Error(String(error));
		});

		this.proc.stdin.on("error", (error) => {
			this.stdinError = error instanceof Error ? error : new Error(String(error));
		});

		this.proc.on("close", (code, signal) => {
			this.closed = true;
			this.exitCode = code;
			this.signal = signal;
			const detail = this.getProcessErrorDetail();
			for (const pending of this.pending.values()) {
				pending.reject(new Error(detail));
			}
			this.pending.clear();
		});
	}

	async callTool(name: string, args: Record<string, unknown>, timeoutMs = MCP_REQUEST_TIMEOUT_MS): Promise<unknown> {
		const response = await this.request(
			"tools/call",
			{
				name,
				arguments: args,
			},
			timeoutMs,
		);
		if (response.error?.message) {
			throw new Error(response.error.message);
		}
		return response.result;
	}

	async assertToolsAvailable(toolNames: readonly string[]): Promise<void> {
		const response = await this.request("tools/list", {}, MCP_REQUEST_TIMEOUT_MS);
		if (response.error?.message) {
			throw new Error(response.error.message);
		}
		const result = response.result as { tools?: Array<{ name?: string }> } | undefined;
		const available = new Set((result?.tools ?? []).map((tool) => tool.name).filter((name): name is string => Boolean(name)));
		const missing = toolNames.filter((name) => !available.has(name));
		if (missing.length > 0) {
			throw new Error(`Playwright MCP is missing required tools: ${missing.join(", ")}.`);
		}
	}

	private request(
		method: string,
		params: Record<string, unknown>,
		timeoutMs: number,
	): Promise<JsonRpcResponse> {
		const id = this.nextId++;
		return new Promise<JsonRpcResponse>((resolve, reject) => {
			const timer = window.setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`${method} timed out after ${Math.round(timeoutMs / 1000)}s. Ensure the Playwright MCP Bridge extension is connected to a running Chrome/Edge window.`));
			}, timeoutMs);
			this.pending.set(id, { resolve, reject });
			this.writeFrame(
				{ jsonrpc: "2.0", id, method, params },
				(error) => {
					if (error) {
						window.clearTimeout(timer);
						this.pending.delete(id);
						reject(error);
					}
				},
			);
			const pending = this.pending.get(id);
			if (pending) {
				this.pending.set(id, {
					resolve: (value) => {
						window.clearTimeout(timer);
						resolve(value);
					},
					reject: (reason) => {
						window.clearTimeout(timer);
						reject(reason instanceof Error ? reason : new Error(String(reason)));
					},
				});
			}
		});
	}

	private writeFrame(
		message: Record<string, unknown>,
		callback?: (error: Error | null | undefined) => void,
	): void {
		if (this.closed || this.proc.stdin.destroyed || !this.proc.stdin.writable) {
			callback?.(new Error(this.getProcessErrorDetail()));
			return;
		}
		const body = JSON.stringify(message) + "\n";
		try {
			this.proc.stdin.write(body, (error) => {
				if (!error) {
					callback?.(undefined);
					return;
				}
				callback?.(this.normalizeTransportError(error));
			});
		} catch (error) {
			callback?.(this.normalizeTransportError(error));
		}
	}

	async close(): Promise<void> {
		this.proc.kill();
	}

	private getProcessErrorDetail(): string {
		const stderr = this.stderrChunks.join("").trim();
		const processBits: string[] = [];
		if (this.spawnError?.message) {
			processBits.push(this.spawnError.message);
		}
		if (this.stdinError?.message) {
			processBits.push(this.stdinError.message);
		}
		if (this.exitCode !== null) {
			processBits.push(`exit code ${this.exitCode}`);
		}
		if (this.signal) {
			processBits.push(`signal ${this.signal}`);
		}
		const suffix = [...processBits, stderr].filter((part) => part.length > 0).join(" ");
		if (suffix.length > 0) {
			return `MCP process closed. ${suffix}`;
		}
		return "MCP process closed.";
	}

	private normalizeTransportError(error: unknown): Error {
		const normalized = error instanceof Error ? error : new Error(String(error));
		if ("code" in normalized && normalized.code === "EPIPE") {
			return new Error(this.getProcessErrorDetail());
		}
		if (normalized.message.includes("EPIPE")) {
			return new Error(this.getProcessErrorDetail());
		}
		return normalized;
	}
}

function normalizeMcpErrorMessage(error: unknown, plugin: XArticleInObsidianPlugin): string {
	if (!(error instanceof Error)) {
		return plugin.t("notice.publishFailed");
	}
	if (
		error.message.includes("spawn npx ENOENT") ||
		error.message.includes("spawn npx.cmd ENOENT") ||
		error.message.includes("spawn npm ENOENT") ||
		error.message.includes("spawn npm.cmd ENOENT") ||
		error.message.includes("Node require is not available in this environment.")
	) {
		return plugin.t("notice.nodeRequiredForPublish");
	}
	if ("code" in error && error.code === "EPIPE") {
		return plugin.t("notice.playwrightDisconnected");
	}
	if (error.message.includes("EPIPE")) {
		return plugin.t("notice.playwrightDisconnected");
	}
	return error.message;
}

function parsePlaywrightToolResult(result: unknown): unknown {
	if (!result || typeof result !== "object") {
		return result;
	}

	const content = (result as { content?: Array<{ type?: string; text?: string }> }).content;
	if (!Array.isArray(content)) {
		return result;
	}

	const textParts = content.filter(
		(part): part is { type: string; text: string } =>
			Boolean(part) && part.type === "text" && typeof part.text === "string",
	);
	if (textParts.length !== 1) {
		return result;
	}

	const firstTextPart = textParts[0];
	if (!firstTextPart) {
		return result;
	}

	let text = firstTextPart.text;
	const codeMarker = text.indexOf("### Ran Playwright code");
	if (codeMarker !== -1) {
		text = text.slice(0, codeMarker).trim();
	}
	const resultMarker = text.indexOf("### Result\n");
	if (resultMarker !== -1) {
		text = text.slice(resultMarker + "### Result\n".length).trim();
	}

	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function normalizeEvaluateSource(source: string): string {
	const stripped = source.trim();
	if (!stripped) {
		return "() => undefined";
	}
	if (stripped.startsWith("(") && stripped.endsWith(")()")) {
		return `() => (${stripped})`;
	}
	if (/^(async\s+)?\([^)]*\)\s*=>/.test(stripped)) {
		return stripped;
	}
	if (/^(async\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=>/.test(stripped)) {
		return stripped;
	}
	if (stripped.startsWith("function ") || stripped.startsWith("async function ")) {
		return stripped;
	}
	return `() => (${stripped})`;
}

function isSuccessfulPublishResult(
	result: unknown,
): result is { ok: true; processedItems?: number; totalItems?: number } {
	return Boolean(
		result &&
			typeof result === "object" &&
			"ok" in result &&
			(result as { ok?: unknown }).ok === true,
	);
}

function stringifyPlaywrightResult(result: unknown): string {
	if (typeof result === "string") {
		return result.length > 300 ? `${result.slice(0, 300)}...` : result;
	}

	try {
		const serialized = JSON.stringify(result);
		if (!serialized) {
			return String(result);
		}
		return serialized.length > 300 ? `${serialized.slice(0, 300)}...` : serialized;
	} catch {
		return String(result);
	}
}

function getNodeRequire(): NodeRequireLike {
	const maybeRequire = (globalThis as RequireContainer).require;
	if (typeof maybeRequire === "function") {
		return maybeRequire;
	}
	throw new Error("Node require is not available in this environment.");
}
