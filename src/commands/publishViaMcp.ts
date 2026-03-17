import { Notice, Platform } from "obsidian";
import type XArticleInObsidianPlugin from "../main";
import { buildPublishFunctionFromActiveNote } from "./copyPublishScript";

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

export async function publishViaDetectedMcp(plugin: XArticleInObsidianPlugin): Promise<void> {
	if (!Platform.isDesktopApp) {
		new Notice("Playwright publishing is desktop only.");
		return;
	}

	try {
		const functionSource = await buildPublishFunctionFromActiveNote(plugin);
		const runtime = await detectPlaywrightRuntime();
		if (!runtime) {
			new Notice("No browser bridge detected. Configure it first.");
			return;
		}

		const client = await StdioMcpClient.connect(runtime);
		try {
			await client.callTool("browser_navigate", { url: "https://x.com/compose/articles" });
			await client.callTool("browser_wait_for", { time: 2 });
			await client.callTool("browser_evaluate", {
				function: `async () => {
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
				}`,
			});
			await client.callTool("browser_evaluate", { function: functionSource });
		} finally {
			await client.close();
		}

		new Notice(`Published to X via Playwright MCP (${runtime.source}).`);
	} catch (error) {
		const message = error instanceof Error ? error.message : "MCP publish failed.";
		new Notice(message);
	}
}

async function detectPlaywrightRuntime(): Promise<McpRuntimeConfig | null> {
	const req = getNodeRequire();
	const path = req("node:path") as typeof import("node:path");
	const os = req("node:os") as typeof import("node:os");
	const processRef = req("node:process") as typeof import("node:process");

	const configs = getDefaultMcpConfigPaths(path, os.homedir(), processRef.cwd());
	const parsedConfigs = configs
		.map((configPath) => readMcpConfig(configPath))
		.filter((config): config is ParsedMcpConfig => config !== null);

	const extensionToken =
		processRef.env[PLAYWRIGHT_TOKEN_ENV] ??
		findPlaywrightTokenInConfigs(parsedConfigs) ??
		discoverPlaywrightExtensionToken(req, path, os, processRef) ??
		undefined;

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
		return {
			command: server.command,
			args: server.args,
			env: {
				...server.env,
				...(token ? { [PLAYWRIGHT_TOKEN_ENV]: token } : {}),
			},
			source: config.path,
		};
	}
	return null;
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
		await client.request("initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "x-article-in-obsidian", version: "1.0.2" },
		});
		client.writeFrame({ jsonrpc: "2.0", method: "notifications/initialized" });
		return client;
	}

	private attach(): void {
		const req = getNodeRequire();
		const bufferModule = req("node:buffer") as typeof import("node:buffer");
		this.proc.stdout.on("data", (chunk: ChildStdoutChunk) => {
			const nextChunk =
				typeof chunk === "string"
					? chunk
					: bufferModule.Buffer.from(chunk).toString("utf8");
			this.buffer += nextChunk;
			while (true) {
				const headerEnd = this.buffer.indexOf("\r\n\r\n");
				if (headerEnd === -1) {
					break;
				}
				const header = this.buffer.slice(0, headerEnd);
				const match = header.match(/Content-Length:\s*(\d+)/i);
				if (!match?.[1]) {
					this.buffer = "";
					break;
				}
				const contentLength = Number(match[1]);
				const bodyStart = headerEnd + 4;
				const messageEnd = bodyStart + contentLength;
				if (this.buffer.length < messageEnd) {
					break;
				}
				const body = this.buffer.slice(bodyStart, messageEnd);
				this.buffer = this.buffer.slice(messageEnd);
				try {
					const response = JSON.parse(body) as JsonRpcResponse;
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

		this.proc.on("close", () => {
			for (const pending of this.pending.values()) {
				pending.reject(new Error("MCP process closed."));
			}
			this.pending.clear();
		});
	}

	async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
		const response = await this.request("tools/call", {
			name,
			arguments: args,
		});
		if (response.error?.message) {
			throw new Error(response.error.message);
		}
		return response.result;
	}

	private request(method: string, params: Record<string, unknown>): Promise<JsonRpcResponse> {
		const id = this.nextId++;
		return new Promise<JsonRpcResponse>((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.writeFrame(
				{ jsonrpc: "2.0", id, method, params },
				(error) => {
					if (error) {
						this.pending.delete(id);
						reject(error);
					}
				},
			);
		});
	}

	private writeFrame(
		message: Record<string, unknown>,
		callback?: (error: Error | null | undefined) => void,
	): void {
		const req = getNodeRequire();
		const bufferModule = req("node:buffer") as typeof import("node:buffer");
		const body = JSON.stringify(message);
		const header = `Content-Length: ${bufferModule.Buffer.byteLength(body, "utf8")}\r\n\r\n`;
		this.proc.stdin.write(`${header}${body}`, callback);
	}

	async close(): Promise<void> {
		this.proc.kill();
	}
}

function getNodeRequire(): NodeRequireLike {
	const maybeRequire = (globalThis as RequireContainer).require;
	if (typeof maybeRequire === "function") {
		return maybeRequire;
	}
	throw new Error("Node require is not available in this environment.");
}
