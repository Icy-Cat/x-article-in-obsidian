import { Component, MarkdownRenderer, MarkdownView, Notice, TFile, requestUrl } from "obsidian";
import { buildPreviewMarkdown } from "../markdown";
import type XArticleInObsidianPlugin from "../main";

type PublishItem =
	| {
			type: "code";
			marker: string;
			language: string;
			code: string;
	  }
	| {
			type: "post";
			marker: string;
			url: string;
	  }
	| {
			type: "divider";
			marker: string;
	  }
	| {
			type: "image";
			marker: string;
			alt: string;
			fileName: string;
			mimeType: string;
			base64: string;
	  };

type PublishImageAsset = Omit<
	Extract<PublishItem, { type: "image" }>,
	"type" | "marker"
>;

type PublishPayload = {
	html: string;
	markdown: string;
	items: PublishItem[];
	title: string | null;
	cover: PublishImageAsset | null;
};

export async function copyPublishScript(plugin: XArticleInObsidianPlugin): Promise<void> {
	try {
		const script = await buildPublishScriptFromActiveNote(plugin);
		await navigator.clipboard.writeText(script);
		new Notice(plugin.t("notice.copyScriptSuccess"));
	} catch (error) {
		const message = error instanceof Error ? error.message : plugin.t("error.buildPublishScriptFailed");
		new Notice(message);
	}
}

export async function buildPublishScriptFromActiveNote(
	plugin: XArticleInObsidianPlugin,
): Promise<string> {
	const payload = await buildPublishPayloadFromActiveNote(plugin);
	return buildBrowserPublishScript(
		payload.html,
		payload.markdown,
		payload.items,
		payload.title,
		payload.cover,
	);
}

export async function buildPublishFunctionFromActiveNote(
	plugin: XArticleInObsidianPlugin,
): Promise<string> {
	const payload = await buildPublishPayloadFromActiveNote(plugin);
	return buildBrowserPublishFunction(
		payload.html,
		payload.markdown,
		payload.items,
		payload.title,
		payload.cover,
	);
}

export async function buildPublishFunctionForNote(
	plugin: XArticleInObsidianPlugin,
	file: TFile,
	rawMarkdown: string,
): Promise<string> {
	const payload = await buildPublishPayload(plugin, file, rawMarkdown);
	return buildBrowserPublishFunction(
		payload.html,
		payload.markdown,
		payload.items,
		payload.title,
		payload.cover,
	);
}

async function buildPublishPayloadFromActiveNote(
	plugin: XArticleInObsidianPlugin,
): Promise<PublishPayload> {
	const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!markdownView?.file) {
		throw new Error(plugin.t("error.openMarkdownFirst"));
	}

	return buildPublishPayload(plugin, markdownView.file, markdownView.editor.getValue());
}

async function buildPublishPayload(
	plugin: XArticleInObsidianPlugin,
	file: TFile,
	rawMarkdown: string,
): Promise<PublishPayload> {
	const markdown = buildPreviewMarkdown(file, rawMarkdown, plugin.settings);
	const extraction = await extractPublishItems(plugin, file, markdown);
	const html = await renderMarkdownToHtml(plugin, file, extraction.processedMarkdown);
	const title = getFrontmatterString(plugin, file, ["title", "Title"]);
	const coverTarget = getFrontmatterString(plugin, file, ["cover", "Cover"]);
	const cover = coverTarget
		? await resolveImageAsset(plugin, file, normalizeFrontmatterImageTarget(coverTarget), "")
		: null;
	return {
		html,
		markdown: extraction.processedMarkdown,
		items: extraction.items,
		title,
		cover,
	};
}

function getFrontmatterString(
	plugin: XArticleInObsidianPlugin,
	file: TFile,
	keys: string[],
): string | null {
	const frontmatter = plugin.app.metadataCache.getFileCache(file)?.frontmatter as
		| Record<string, unknown>
		| undefined;
	if (!frontmatter) {
		return null;
	}

	for (const key of keys) {
		const value = frontmatter[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}

	return null;
}

function normalizeFrontmatterImageTarget(value: string): string {
	return value
		.replace(/^!\[\[|\]\]$/g, "")
		.replace(/^!\[[^\]]*\]\((.+)\)$/u, "$1")
		.trim();
}

async function extractPublishItems(
	plugin: XArticleInObsidianPlugin,
	file: TFile,
	markdown: string,
): Promise<{ processedMarkdown: string; items: PublishItem[] }> {
	const segments: Array<{
		type: "code" | "image" | "divider" | "post";
		start: number;
		end: number;
		language?: string;
		code?: string;
		alt?: string;
		target?: string;
		url?: string;
	}> = [];

	const codePattern = /```([^\n`]*)\n([\s\S]*?)```/g;
	let match: RegExpExecArray | null;
	while ((match = codePattern.exec(markdown)) !== null) {
		const wholeMatch = match[0];
		const language = match[1] ?? "";
		const code = match[2] ?? "";
		segments.push({
			type: "code",
			start: match.index,
			end: match.index + wholeMatch.length,
			language: language.trim(),
			code: code.replace(/\n$/, ""),
		});
	}

	const dividerPattern = /^(?: {0,3})(?:(?:-{3,})|(?:\*{3,})|(?:_{3,}))(?:[ \t]*)$/gm;
	while ((match = dividerPattern.exec(markdown)) !== null) {
		const wholeMatch = match[0];
		const start = match.index;
		const end = match.index + wholeMatch.length;
		if (segments.some((segment) => start >= segment.start && start < segment.end)) {
			continue;
		}
		segments.push({
			type: "divider",
			start,
			end,
		});
	}

	const postUrlPattern =
		/^(?: {0,3})(https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/\d+(?:\?[^\s]+)?)\s*$/gm;
	while ((match = postUrlPattern.exec(markdown)) !== null) {
		const wholeMatch = match[0];
		const postUrl = match[1] ?? "";
		const start = match.index;
		const end = match.index + wholeMatch.length;
		if (segments.some((segment) => start >= segment.start && start < segment.end)) {
			continue;
		}
		segments.push({
			type: "post",
			start,
			end,
			url: postUrl.trim(),
		});
	}

	const postMarkdownLinkPattern =
		/\[(https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/\d+(?:\?[^\]\s]+)?)\]\((https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[A-Za-z0-9_]+\/status\/\d+(?:\?[^)\s]+)?)\)/g;
	while ((match = postMarkdownLinkPattern.exec(markdown)) !== null) {
		const wholeMatch = match[0];
		const hrefUrl = match[2] ?? match[1] ?? "";
		const start = match.index;
		const end = match.index + wholeMatch.length;
		if (segments.some((segment) => start >= segment.start && start < segment.end)) {
			continue;
		}
		segments.push({
			type: "post",
			start,
			end,
			url: hrefUrl.trim(),
		});
	}

	const imagePatterns: Array<{
		kind: "markdown" | "wikilink";
		pattern: RegExp;
	}> = [
		{ kind: "markdown", pattern: /!\[([^\]]*)\]\(([^)]+)\)/g },
		{ kind: "wikilink", pattern: /!\[\[([^\]]+)\]\]/g },
	];

	for (const imagePattern of imagePatterns) {
		while ((match = imagePattern.pattern.exec(markdown)) !== null) {
			const wholeMatch = match[0];
			const firstGroup = match[1] ?? "";
			const secondGroup = match[2] ?? "";
			const start = match.index;
			const end = match.index + wholeMatch.length;
			if (segments.some((segment) => start >= segment.start && start < segment.end)) {
				continue;
			}

			if (imagePattern.kind === "markdown") {
				segments.push({
					type: "image",
					start,
					end,
					alt: firstGroup.trim(),
					target: secondGroup.trim(),
				});
			} else {
				segments.push({
					type: "image",
					start,
					end,
					alt: "",
					target: firstGroup.trim(),
				});
			}
		}
	}

	segments.sort((left, right) => left.start - right.start);

	let processedMarkdown = markdown;
	const items: PublishItem[] = [];

	for (let index = segments.length - 1; index >= 0; index -= 1) {
		const segment = segments[index];
		if (!segment) {
			continue;
		}
		const marker = `MPH_MARKER_${index + 1}`;
		const replacement = `\n${marker}\n`;
		processedMarkdown =
			processedMarkdown.slice(0, segment.start) + replacement + processedMarkdown.slice(segment.end);

		if (segment.type === "code") {
			items.unshift({
				type: "code",
				marker,
				language: segment.language ?? "",
				code: segment.code ?? "",
			});
			continue;
		}

		if (segment.type === "divider") {
			items.unshift({
				type: "divider",
				marker,
			});
			continue;
		}

		if (segment.type === "post") {
			items.unshift({
				type: "post",
				marker,
				url: segment.url ?? "",
			});
			continue;
		}

		const imageAsset = await resolveImageAsset(plugin, file, segment.target ?? "", segment.alt ?? "");
		if (imageAsset) {
			items.unshift({ type: "image", marker, ...imageAsset });
		}
	}

	return { processedMarkdown, items };
}

async function resolveImageAsset(
	plugin: XArticleInObsidianPlugin,
	file: TFile,
	rawTarget: string,
	alt: string,
): Promise<Omit<Extract<PublishItem, { type: "image" }>, "type" | "marker" | "alt"> & { alt: string } | null> {
	const target = normalizeImageTarget(rawTarget);
	if (!target) {
		return null;
	}

	if (isRemoteImageTarget(target)) {
		return resolveRemoteImageAsset(target, alt);
	}

	const linkedFile =
		plugin.app.metadataCache.getFirstLinkpathDest(target, file.path) ??
		plugin.app.vault.getAbstractFileByPath(target);
	if (!(linkedFile instanceof TFile)) {
		return null;
	}

	const binary = await plugin.app.vault.readBinary(linkedFile);
	return {
		alt,
		fileName: linkedFile.name,
		mimeType: getMimeType(linkedFile.extension),
		base64: arrayBufferToBase64(binary),
	};
}

async function resolveRemoteImageAsset(
	target: string,
	alt: string,
): Promise<Omit<Extract<PublishItem, { type: "image" }>, "type" | "marker" | "alt"> & { alt: string } | null> {
	try {
		const response = await requestUrl({
			url: target,
			method: "GET",
			throw: false,
		});
		if (response.status < 200 || response.status >= 300) {
			return null;
		}

		const arrayBuffer = response.arrayBuffer;
		const mimeType = inferRemoteMimeType(target, response.headers["content-type"]);
		return {
			alt,
			fileName: extractRemoteFileName(target, mimeType),
			mimeType,
			base64: arrayBufferToBase64(arrayBuffer),
		};
	} catch {
		return null;
	}
}

function normalizeImageTarget(target: string): string {
	const trimmed = target.trim();
	if (trimmed.length === 0) {
		return "";
	}

	const pipeIndex = trimmed.indexOf("|");
	const withoutAlias = pipeIndex >= 0 ? trimmed.slice(0, pipeIndex) : trimmed;
	return withoutAlias.replace(/^</, "").replace(/>$/, "").trim();
}

function isRemoteImageTarget(target: string): boolean {
	return /^https?:\/\//i.test(target);
}

function getMimeType(extension: string): string {
	switch (extension.toLowerCase()) {
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "webp":
			return "image/webp";
		case "gif":
			return "image/gif";
		case "svg":
			return "image/svg+xml";
		default:
			return "image/png";
	}
}

function inferRemoteMimeType(target: string, contentType: string | undefined): string {
	const normalized = contentType?.split(";")[0]?.trim().toLowerCase();
	if (normalized && normalized.startsWith("image/")) {
		return normalized;
	}

	const cleanUrl = target.split("?")[0] ?? target;
	const extension = cleanUrl.split(".").pop() ?? "";
	return getMimeType(extension);
}

function extractRemoteFileName(target: string, mimeType: string): string {
	const cleanUrl = target.split("?")[0] ?? target;
	const lastSegment = cleanUrl.split("/").pop()?.trim();
	if (lastSegment) {
		return lastSegment;
	}

	const fallbackExtension = mimeType.split("/")[1] ?? "png";
	return `remote-image.${fallbackExtension}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

async function renderMarkdownToHtml(
	plugin: XArticleInObsidianPlugin,
	file: TFile,
	markdown: string,
): Promise<string> {
	const container = document.createElement("div");
	const renderComponent = new Component();
	try {
		await MarkdownRenderer.render(plugin.app, markdown, container, file.path, renderComponent);
	} finally {
		renderComponent.unload();
	}
	cleanupRenderedHtml(container);
	return container.innerHTML;
}

function cleanupRenderedHtml(container: HTMLElement): void {
	const removableSelectors = [
		".frontmatter",
		".markdown-preview-sizer",
		".internal-query",
		".callout-fold",
	];
	for (const selector of removableSelectors) {
		container.querySelectorAll(selector).forEach((element) => element.remove());
	}

	container.querySelectorAll("*").forEach((element) => {
		for (const attr of Array.from(element.attributes)) {
			if (
				attr.name === "href" ||
				attr.name === "src" ||
				attr.name === "alt" ||
				attr.name === "title"
			) {
				continue;
			}

			if (attr.name.startsWith("data-") || attr.name === "class" || attr.name === "style") {
				element.removeAttribute(attr.name);
			}
		}
	});
}

function buildBrowserPublishScript(
	html: string,
	markdown: string,
	items: PublishItem[],
	title?: string | null,
	cover?: PublishImageAsset | null,
): string {
	return `(${buildBrowserPublishFunction(html, markdown, items, title, cover)})();`;
}

function buildBrowserPublishFunction(
	html: string,
	markdown: string,
	items: PublishItem[],
	title?: string | null,
	cover?: PublishImageAsset | null,
): string {
	return `async () => {
  const payload = ${JSON.stringify({ html, markdown, items, title: title ?? null, cover: cover ?? null }, null, 2)};

  const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

  function findEditor() {
    return (
      document.querySelector("[data-contents='true'] [contenteditable='true']") ||
      document.querySelector("[contenteditable='true']")
    );
  }

  function findTitleField() {
    const editor = findEditor();
    const candidates = Array.from(
      document.querySelectorAll("input[type='text'], textarea, [contenteditable='true']")
    ).filter((node) => node !== editor);

    const titleKeywords = ["title", "标题", "add title", "输入标题"];
    const scored = candidates
      .filter((node) => isVisibleElement(node))
      .map((node) => {
        const text = normalizeText(
          node.getAttribute?.("aria-label") ||
          node.getAttribute?.("placeholder") ||
          node.getAttribute?.("data-testid") ||
          ""
        );
        const rect = node.getBoundingClientRect();
        let score = 0;
        if (titleKeywords.some((keyword) => text.includes(keyword))) score += 10;
        if (rect.top < 420) score += 4;
        if (rect.width > 240) score += 2;
        return { node, score };
      })
      .sort((left, right) => right.score - left.score);

    return scored[0]?.node || null;
  }

  async function setArticleTitle() {
    if (!payload.title) {
      return;
    }

    const titleField = findTitleField();
    if (!titleField) {
      console.warn("Title field not found.");
      return;
    }

    if (titleField instanceof HTMLInputElement || titleField instanceof HTMLTextAreaElement) {
      const proto = titleField instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter?.call(titleField, payload.title);
      titleField.dispatchEvent(new Event("input", { bubbles: true }));
      titleField.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      titleField.focus();
      await sleep(80);
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, payload.title);
      titleField.dispatchEvent(new Event("input", { bubbles: true }));
      titleField.dispatchEvent(new Event("change", { bubbles: true }));
    }

    await sleep(250);
  }

  function createClipboardEvent(htmlValue, textValue) {
    const data = new DataTransfer();
    data.setData("text/html", htmlValue);
    data.setData("text/plain", textValue);
    return new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
  }

  async function insertArticleHtml() {
    const editor = findEditor();
    if (!editor) {
      throw new Error("Editor not found.");
    }

    editor.focus();
    await sleep(100);

    const before = (editor.textContent || "").replace(/\\s/g, "").length;
    editor.dispatchEvent(createClipboardEvent(payload.html, payload.markdown));
    await sleep(500);

    const afterPaste = (editor.textContent || "").replace(/\\s/g, "").length;
    if (afterPaste > before) {
      return;
    }

    document.execCommand("insertHTML", false, payload.html);
    await sleep(200);
  }

  function findMarker(marker) {
    const editor = findEditor();
    if (!editor) return null;

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let current;
    while ((current = walker.nextNode())) {
      const offset = current.textContent.indexOf(marker);
      if (offset >= 0) {
        return {
          node: current,
          offset,
          block: current.parentElement?.closest("[data-block='true']") || current.parentElement,
        };
      }
    }

    return null;
  }

  function deleteMarkerFromTextNode(node, marker, offset) {
    const text = node.textContent || "";
    const markerOffset = typeof offset === "number" ? offset : text.indexOf(marker);
    if (markerOffset < 0) {
      return false;
    }

    node.textContent = text.slice(0, markerOffset) + text.slice(markerOffset + marker.length);
    return true;
  }

  function clickAt(rect) {
    const x = rect.left + Math.min(rect.width, 8);
    const y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y);
    if (!target) return;
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: x, clientY: y }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
  }

  function placeCaretFromPoint(rect) {
    const x = rect.left + Math.min(Math.max(rect.width, 4), 12);
    const y = rect.top + Math.max(rect.height / 2, 4);
    const selection = window.getSelection();
    if (!selection) return false;

    if (document.caretPositionFromPoint) {
      const caret = document.caretPositionFromPoint(x, y);
      if (caret?.offsetNode) {
        const range = document.createRange();
        range.setStart(caret.offsetNode, caret.offset);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
    }

    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      if (range) {
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
    }

    return false;
  }

  async function restoreCaretAtRect(rect) {
    const editor = findEditor();
    if (editor) {
      editor.focus();
    }
    await sleep(30);
    if (!placeCaretFromPoint(rect)) {
      clickAt(rect);
      await sleep(30);
      placeCaretFromPoint(rect);
    }
  }

  async function focusMarker(marker) {
    const markerInfo = findMarker(marker);
    if (!markerInfo?.node || !markerInfo.block) {
      return null;
    }

    markerInfo.block.scrollIntoView({ behavior: "instant", block: "center" });
    await sleep(150);

    const range = document.createRange();
    range.setStart(markerInfo.node, markerInfo.offset);
    range.setEnd(markerInfo.node, markerInfo.offset + marker.length);
    const rect = range.getBoundingClientRect();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    await sleep(50);
    await sleep(150);
    return { rect: getRectAfterToken(marker) || rect, marker, token: marker };
  }

  function findAnchorToken(token) {
    const editor = findEditor();
    if (!editor) return null;

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let current;
    while ((current = walker.nextNode())) {
      const offset = current.textContent.indexOf(token);
      if (offset >= 0) {
        return { node: current, offset };
      }
    }

    return null;
  }

  function removeAnchorToken(token) {
    const found = findAnchorToken(token);
    if (!found) return false;

    deleteMarkerFromTextNode(found.node, token, found.offset);
    removeEmptyBlock(found.node.parentElement?.closest("[data-block='true']"));
    return true;
  }

  function removeEmptyBlock(block) {
    if (!block) return;
    const text = (block.textContent || "").replace(/\\u200b/g, "").trim();
    const hasStructuredContent = Boolean(
      block.querySelector("img, video, iframe, figure, pre, hr, [data-testid='tweet'], [data-testid='tweetPhoto']")
    );
    if (!hasStructuredContent && text.length === 0) {
      block.remove();
    }
  }

  function removeResidualMarkers() {
    const editor = findEditor();
    if (!editor) return;

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const markerPattern = /(?:^|\\s)MPH_MARKER_\\d+(?=\\s|$)/g;
    const touchedBlocks = new Set();
    let current;
    while ((current = walker.nextNode())) {
      const text = current.textContent || "";
      const cleaned = text.replace(markerPattern, " ").replace(/\\s{2,}/g, " ").trim();
      if (cleaned !== text.trim()) {
        current.textContent = cleaned;
        touchedBlocks.add(current.parentElement?.closest("[data-block='true']"));
      }
    }

    touchedBlocks.forEach((block) => removeEmptyBlock(block));
  }

  function setCaretAfterToken(token) {
    const found = findAnchorToken(token);
    if (!found) {
      return false;
    }

    const selection = window.getSelection();
    if (!selection) {
      return false;
    }

    const range = document.createRange();
    range.setStart(found.node, found.offset + token.length);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);

    const editor = findEditor();
    if (editor) {
      editor.focus();
    }

    return true;
  }

  function getRectAfterToken(token) {
    const found = findAnchorToken(token);
    if (!found) {
      return null;
    }

    const range = document.createRange();
    range.setStart(found.node, found.offset + token.length);
    range.collapse(true);
    return range.getBoundingClientRect();
  }

  async function clickAnchorToken(token) {
    const rect = getRectAfterToken(token);
    if (!rect) {
      return false;
    }

    await restoreCaretAtRect(rect);
    await sleep(30);
    clickAt(rect);
    await sleep(60);
    return true;
  }

  function normalizeText(value) {
    return (value || "").replace(/\\s+/g, " ").trim().toLowerCase();
  }

  function isVisibleElement(node) {
    if (!(node instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
      return false;
    }

    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function measureDistanceToRect(node, targetRect) {
    if (!(node instanceof HTMLElement) || !targetRect) {
      return Number.POSITIVE_INFINITY;
    }

    const rect = node.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const targetX = targetRect.left + targetRect.width / 2;
    const targetY = targetRect.top + targetRect.height / 2;
    const dx = x - targetX;
    const dy = y - targetY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function findClickableByText(labels, targetRect) {
    const textLabels = Array.isArray(labels) ? labels : [labels];
    const normalizedLabels = textLabels.map((label) => normalizeText(label));
    const nodes = Array.from(document.querySelectorAll("button, [role='button'], [role='menuitem'], [role='option']"))
      .filter((node) => isVisibleElement(node))
      .filter((node) => {
        const text = normalizeText(node.textContent || "");
        return normalizedLabels.some((label) => text === label || text.includes(label));
      });

    if (nodes.length === 0) {
      return null;
    }

    nodes.sort((left, right) => measureDistanceToRect(left, targetRect) - measureDistanceToRect(right, targetRect));
    return nodes[0] || null;
  }

  function findByXPath(xpath) {
    try {
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      return result.singleNodeValue;
    } catch {
      return null;
    }
  }

  async function waitForXPath(xpath, attempts = 20, delayMs = 150) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const node = findByXPath(xpath);
      if (node) {
        return node;
      }
      await sleep(delayMs);
    }
    return null;
  }

  async function openInsertMenu(optionLabels, anchorInfo) {
    if (anchorInfo?.token) {
      await clickAnchorToken(anchorInfo.token);
    } else if (anchorInfo?.rect) {
      await restoreCaretAtRect(anchorInfo.rect);
    }

    const insertButton = findClickableByText(["插入", "Insert", "insert"], anchorInfo?.rect);
    if (!insertButton) {
      throw new Error("Insert button not found.");
    }

    insertButton.click();
    await sleep(300);

    const option = findClickableByText(optionLabels, anchorInfo?.rect);
    if (!option) {
      throw new Error("Insert menu option not found: " + optionLabels.join("/"));
    }

    option.click();
    await sleep(400);
  }

  async function waitForSelector(selector, attempts = 20, delayMs = 150) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
      await sleep(delayMs);
    }
    return null;
  }

  async function openInsertPostDialog(anchorInfo) {
    if (anchorInfo?.token) {
      await clickAnchorToken(anchorInfo.token);
    } else if (anchorInfo?.rect) {
      await restoreCaretAtRect(anchorInfo.rect);
    }

    const insertButton = findClickableByText(["插入", "Insert", "insert"], anchorInfo?.rect);
    if (!insertButton) {
      throw new Error("Insert button not found.");
    }

    insertButton.click();
    await sleep(300);

    const postOption = findClickableByText(["帖子", "Posts", "posts", "post", "tweet"]);
    if (!postOption) {
      throw new Error("Post option not found.");
    }

    postOption.click();
    const input = await waitForSelector("input[name='TweetByUrlInput']");
    if (!input) {
      throw new Error("TweetByUrlInput not found after opening post dialog.");
    }

    return input;
  }

  async function insertCodeBlock(item, anchorInfo) {
    await openInsertMenu(["代码", "Code", "code"], anchorInfo);

    const languageInput = await waitForSelector("input[name='programming-language-input'], input[data-testid='programming-language-input']");
    if (languageInput && item.language) {
      const languageValue = item.language.trim();
      const inputProto = languageInput instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const languageSetter = Object.getOwnPropertyDescriptor(inputProto, "value")?.set;
      languageSetter?.call(languageInput, languageValue);
      languageInput.dispatchEvent(new Event("input", { bubbles: true }));
      languageInput.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(250);
      languageInput.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
      languageInput.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
      await sleep(250);
    }

    let textarea = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      textarea =
        document.querySelector("textarea[name='code-input']") ||
        document.querySelector("[role='dialog'] textarea[name='code-input']") ||
        document.querySelector("[role='dialog'] textarea") ||
        document.querySelector("textarea") ||
        document.querySelector("[role='dialog'] [contenteditable='true']");
      if (textarea) break;
      await sleep(150);
    }

    if (!textarea) {
      throw new Error("Code textarea not found.");
    }

    if (textarea instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, item.code);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      textarea.focus();
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, item.code);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await sleep(200);

    const dialog = textarea.closest("[role='dialog']") || document;
    const submitButton = Array.from(dialog.querySelectorAll("button[role='button'], button")).find((button) => {
      const text = normalizeText(button.textContent || "");
      const disabled = button.getAttribute("aria-disabled") === "true" || button.disabled;
      return (
        text === "插入" ||
        text.includes("插入") ||
        text === "insert" ||
        text.includes("insert")
      ) && !disabled;
    });
    if (!submitButton) {
      throw new Error("Code submit button not found.");
    }

    submitButton.click();
    await sleep(800);
    removeAnchorToken(anchorInfo.token);
  }

  async function insertPost(item, anchorInfo) {
    let urlInput = await openInsertPostDialog(anchorInfo);
    if (!(urlInput instanceof HTMLInputElement) && !(urlInput instanceof HTMLTextAreaElement)) {
      urlInput =
        document.querySelector("input[name='TweetByUrlInput']") ||
        document.querySelector("input[type='text'], input:not([type]), textarea");
    }

    if (!urlInput) {
      throw new Error("Post URL input not found.");
    }

    const proto = urlInput instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(urlInput, item.url);
    urlInput.dispatchEvent(new Event("input", { bubbles: true }));
    urlInput.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(200);

    const xpathConfirm = await waitForXPath("//button/article", 30, 200);
    if (xpathConfirm instanceof HTMLElement) {
      xpathConfirm.click();
    } else {
      const fallbackButton =
        findClickableByText(["插入", "Insert", "确认", "Confirm"]) ||
        (urlInput.closest("[role='dialog']") || document).querySelector("button[role='button'], button");
      if (!(fallbackButton instanceof HTMLElement)) {
        throw new Error("Post confirm button not found.");
      }
      fallbackButton.click();
    }

    await sleep(1000);
    removeAnchorToken(anchorInfo.token);
  }

  function base64ToFile(base64, fileName, mimeType) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([new Blob([bytes], { type: mimeType })], fileName, { type: mimeType });
  }

  async function waitForFileInput(targetRect) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const dialogs = Array.from(document.querySelectorAll("div[data-testid='sheetDialog']"))
        .filter((node) => isVisibleElement(node));
      const dialog =
        dialogs.sort((left, right) => measureDistanceToRect(left, targetRect) - measureDistanceToRect(right, targetRect))[0] ||
        dialogs.at(-1) ||
        null;
      const input =
        dialog?.querySelector("input[type='file'], input[data-testid='fileInput']") ||
        document.querySelector("input[type='file'], input[data-testid='fileInput']") ||
        null;
      if (input instanceof HTMLInputElement) return input;
      await sleep(150);
    }
    throw new Error("Media file input not found.");
  }

  async function waitForCoverFileInput(coverButton) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const container =
        coverButton?.closest("div") ||
        coverButton?.parentElement ||
        document;
      const directInput =
        container?.querySelector("input[data-testid='fileInput']") ||
        document.querySelector("input[data-testid='fileInput']");
      if (directInput instanceof HTMLInputElement) {
        return directInput;
      }
      await sleep(150);
    }

    throw new Error("Cover file input not found.");
  }

  async function waitForMediaUpload(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const progress = document.querySelector("[data-testid='uploadProgress'], [role='progressbar']");
      if (!progress) {
        await sleep(300);
        return;
      }
      await sleep(300);
    }
  }

  async function insertImage(item, anchorInfo) {
    try {
      await openInsertMenu(["媒体", "Media", "media", "photo", "image"], anchorInfo);
      const input = await waitForFileInput(anchorInfo.rect);
      const file = base64ToFile(item.base64, item.fileName, item.mimeType);
      const data = new DataTransfer();
      data.items.add(file);
      input.files = data.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await waitForMediaUpload(15000);
    } finally {
      removeAnchorToken(anchorInfo.token);
    }
  }

  async function insertDivider(anchorInfo) {
    await openInsertMenu(["分割线", "Divider", "divider", "separator", "horizontal rule"], anchorInfo);
    await sleep(500);
    removeAnchorToken(anchorInfo.token);
  }

  function findCoverButton() {
    const directButton = document.querySelector(
      "button[aria-label='添加照片或视频'], button[aria-label='Add photos or video']"
    );
    if (directButton instanceof HTMLElement && isVisibleElement(directButton)) {
      return directButton;
    }

    const labels = [
      "封面",
      "cover",
      "add cover",
      "upload cover",
      "更换封面",
      "编辑封面",
      "添加照片或视频",
      "add photos or video"
    ];
    const nodes = Array.from(document.querySelectorAll("button, [role='button']"))
      .filter((node) => isVisibleElement(node));

    for (const node of nodes) {
      const text = normalizeText(
        [
          node.textContent || "",
          node.getAttribute("aria-label") || "",
          node.getAttribute("data-testid") || ""
        ].join(" ")
      );
      if (labels.some((label) => text.includes(label))) {
        return node;
      }
    }

    return null;
  }

  async function uploadCover() {
    if (!payload.cover) {
      return;
    }

    const coverButton = findCoverButton();
    if (!(coverButton instanceof HTMLElement)) {
      console.warn("Cover button not found.");
      return;
    }

    coverButton.click();
    await sleep(400);

    const input = await waitForCoverFileInput(coverButton);
    const file = base64ToFile(payload.cover.base64, payload.cover.fileName, payload.cover.mimeType);
    const data = new DataTransfer();
    data.items.add(file);
    input.files = data.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForMediaUpload(15000);
    await sleep(600);
  }

  async function run() {
    await setArticleTitle();
    await sleep(200);
    await insertArticleHtml();
    await sleep(800);
    let processedItems = 0;

    for (const item of payload.items) {
      const anchorInfo = await focusMarker(item.marker);
      if (!anchorInfo) {
        console.warn("Marker not found:", item.marker);
        continue;
      }

      if (item.type === "code") {
        await insertCodeBlock(item, anchorInfo);
      } else if (item.type === "post") {
        await insertPost(item, anchorInfo);
      } else if (item.type === "divider") {
        await insertDivider(anchorInfo);
      } else if (item.type === "image") {
        await insertImage(item, anchorInfo);
      }

      processedItems += 1;
      await sleep(500);
    }

    removeResidualMarkers();
    await uploadCover();
    console.log("X publish script finished.");
    return { ok: true, processedItems, totalItems: payload.items.length };
  }

  return await run().catch((error) => {
    console.error("X publish script failed:", error);
    throw error;
  });
}`;
}
