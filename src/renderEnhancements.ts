const X_POST_URL_PATTERN =
	/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([^/]+)\/status\/(\d+)(?:[/?#].*)?$/i;
const X_WIDGETS_SCRIPT_URL = "https://platform.twitter.com/widgets.js";
let widgetsLoader: Promise<TwitterWidgets | null> | null = null;

interface TwitterWidgets {
	widgets?: {
		createTweet?: (
			tweetId: string,
			targetEl: HTMLElement,
			options?: Record<string, unknown>,
		) => Promise<HTMLElement>;
		load?: (targetEl?: HTMLElement) => Promise<void>;
	};
}

export function enhanceArticlePreview(container: HTMLElement): void {
	enhanceCodeBlocks(container);
	enhanceStandaloneImages(container);
	enhancePostLinks(container);
	enhanceExternalLinks(container);
}

function applyInlineStyles(element: HTMLElement, styles: Record<string, string>): void {
	Object.entries(styles).forEach(([property, value]) => {
		element.style.setProperty(property, value);
	});
}

function applySvgInlineStyles(element: SVGElement, styles: Record<string, string>): void {
	Object.entries(styles).forEach(([property, value]) => {
		element.style.setProperty(property, value);
	});
}

function enhanceCodeBlocks(container: HTMLElement): void {
	container.querySelectorAll("pre > code").forEach((codeEl) => {
		if (!(codeEl instanceof HTMLElement)) {
			return;
		}

		const preEl = codeEl.parentElement;
		if (!(preEl instanceof HTMLElement)) {
			return;
		}

		const languageClass = Array.from(codeEl.classList).find((name) => name.startsWith("language-"));
		const language = languageClass?.replace("language-", "").toLowerCase() ?? "";

		if (language && preEl.dataset.language !== language) {
			preEl.dataset.language = language;
		}

		if (preEl.parentElement?.classList.contains("x-article-code-frame")) {
			return;
		}

		const frameEl = document.createElement("div");
		frameEl.className = "x-article-code-frame";
		applyInlineStyles(frameEl, {
			display: "block",
			"margin-top": "0",
			"margin-bottom": "28px",
		});

		const toolbarEl = document.createElement("div");
		toolbarEl.className = "x-article-code-toolbar";
		applyInlineStyles(toolbarEl, {
			display: "grid",
			"grid-template-columns": "1fr 1fr",
			"align-items": "center",
			background: "rgb(229,234,236)",
			"border-radius": "8px 8px 0 0",
			"padding-top": "2px",
			"padding-right": "8px",
			"padding-bottom": "2px",
			"padding-left": "12px",
			"box-sizing": "border-box",
			width: "100%",
		});
		frameEl.appendChild(toolbarEl);

		const languageEl = document.createElement("div");
		languageEl.className = "x-article-code-language";
		applyInlineStyles(languageEl, {
			direction: "ltr",
			"background-color": "rgba(0,0,0,0)",
			border: "0px solid black",
			"box-sizing": "border-box",
			display: "inline",
			font: '14px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
			margin: "0px",
			padding: "0px",
			position: "relative",
			"text-decoration": "none",
			"white-space": "pre-wrap",
			color: "rgb(15,20,25)",
			"font-size": "13px",
			"font-family": "monospace, monospace",
			"font-weight": "400",
			"line-height": "20px",
		});
		const languageTextEl = document.createElement("span");
		languageTextEl.textContent = language || "text";
		applyInlineStyles(languageTextEl, {
			"text-transform": "lowercase",
		});
		languageEl.appendChild(languageTextEl);
		toolbarEl.appendChild(languageEl);

		const actionsEl = document.createElement("div");
		applyInlineStyles(actionsEl, {
			display: "flex",
			"align-items": "center",
			"justify-content": "flex-end",
			width: "100%",
		});
		toolbarEl.appendChild(actionsEl);

		const copyButtonEl = document.createElement("button");
		copyButtonEl.type = "button";
		copyButtonEl.className = "x-article-code-copy";
		copyButtonEl.setAttribute("aria-label", "Copy code block");
		copyButtonEl.setAttribute("title", "Copy code block");
		applyInlineStyles(copyButtonEl, {
			display: "block",
			padding: "0",
			border: "0",
			margin: "0",
			"background-color": "rgba(0,0,0,0)",
			"border-color": "rgba(0,0,0,0)",
			outline: "none",
			"box-shadow": "none",
			appearance: "none",
			"-webkit-appearance": "none",
			cursor: "pointer",
		});

		const copyInnerEl = document.createElement("div");
		applyInlineStyles(copyInnerEl, {
			direction: "ltr",
			color: "rgb(15,20,25)",
			display: "flex",
			"align-items": "center",
			"justify-content": "center",
			width: "24px",
			height: "24px",
			"font-weight": "700",
		});
		copyInnerEl.appendChild(createCopyIcon(document));
		copyButtonEl.appendChild(copyInnerEl);

		const setCopyState = (state: "idle" | "success" | "error"): void => {
			copyButtonEl.dataset.state = state;
			copyInnerEl.style.setProperty(
				"color",
				state === "success"
					? "rgb(0,186,124)"
					: state === "error"
						? "rgb(244,33,46)"
						: "rgb(15,20,25)",
			);
		};

		setCopyState("idle");
		copyButtonEl.addEventListener("click", () => {
			void (async () => {
				try {
					await navigator.clipboard.writeText(codeEl.textContent ?? "");
					setCopyState("success");
					window.setTimeout(() => {
						setCopyState("idle");
					}, 1200);
				} catch {
					setCopyState("error");
					window.setTimeout(() => {
						setCopyState("idle");
					}, 1200);
				}
			})();
		});
		actionsEl.appendChild(copyButtonEl);

		applyInlineStyles(preEl, {
			background: "rgb(247,249,249)",
			color: "rgb(56,58,66)",
			"font-family": "monospace",
			direction: "ltr",
			"text-align": "left",
			"white-space": "pre",
			"word-spacing": "normal",
			"word-break": "normal",
			"line-height": "1.3",
			"tab-size": "2",
			hyphens: "none",
			padding: "12px",
			margin: "0px 0px 0.5em",
			overflow: "auto",
			"border-radius": "0.3em 0.3em 8px 8px",
			"font-size": "13px",
			display: "block",
			width: "100%",
			"box-sizing": "border-box",
		});

		applyInlineStyles(codeEl, {
			background: "rgb(250,250,250)",
			color: "rgb(56,58,66)",
			"font-family": '"Fira Code","Fira Mono",Menlo,Consolas,"DejaVu Sans Mono",monospace',
			direction: "ltr",
			"text-align": "left",
			"white-space": "pre",
			"word-spacing": "normal",
			"word-break": "normal",
			"line-height": "1.5",
			"tab-size": "2",
			hyphens: "none",
		});

		preEl.replaceWith(frameEl);
		frameEl.appendChild(preEl);
	});
}

function createCopyIcon(documentRef: Document): SVGSVGElement {
	const svgNamespace = "http://www.w3.org/2000/svg";
	const svgEl = documentRef.createElementNS(svgNamespace, "svg");
	svgEl.setAttribute("viewBox", "0 0 24 24");
	svgEl.setAttribute("aria-hidden", "true");
	applySvgInlineStyles(svgEl, {
		width: "18px",
		height: "18px",
		color: "currentcolor",
	});

	const groupEl = documentRef.createElementNS(svgNamespace, "g");
	svgEl.appendChild(groupEl);

	const pathEl = documentRef.createElementNS(svgNamespace, "path");
	pathEl.setAttribute(
		"d",
		"M19.5 2C20.88 2 22 3.12 22 4.5v11c0 1.21-.86 2.22-2 2.45V4.5c0-.28-.22-.5-.5-.5H6.05c.23-1.14 1.24-2 2.45-2h11zm-4 4C16.88 6 18 7.12 18 8.5v11c0 1.38-1.12 2.5-2.5 2.5h-11C3.12 22 2 20.88 2 19.5v-11C2 7.12 3.12 6 4.5 6h11zM4 19.5c0 .28.22.5.5.5h11c.28 0 .5-.22.5-.5v-11c0-.28-.22-.5-.5-.5h-11c-.28 0-.5.22-.5.5v11z",
	);
	groupEl.appendChild(pathEl);

	return svgEl;
}

function enhanceStandaloneImages(container: HTMLElement): void {
	container.querySelectorAll("p").forEach((paragraphEl) => {
		const childNodes = Array.from(paragraphEl.childNodes).filter((node) => {
			return node.nodeType !== Node.TEXT_NODE || (node.textContent ?? "").trim().length > 0;
		});

		if (childNodes.length !== 1 || !(childNodes[0] instanceof HTMLImageElement)) {
			return;
		}

		const imageEl = childNodes[0];
		const figureEl = document.createElement("figure");
		figureEl.className = "x-article-figure";

		paragraphEl.replaceWith(figureEl);
		figureEl.appendChild(imageEl);

		if (imageEl.alt.trim().length > 0) {
			const captionEl = document.createElement("figcaption");
			captionEl.className = "x-article-figcaption";
			captionEl.textContent = imageEl.alt.trim();
			figureEl.appendChild(captionEl);
		}
	});
}

function enhancePostLinks(container: HTMLElement): void {
	container.querySelectorAll("a").forEach((anchorEl) => {
		if (!(anchorEl instanceof HTMLAnchorElement)) {
			return;
		}

		const blockContainer = anchorEl.closest(".public-DraftStyleDefault-block");
		if (!(blockContainer instanceof HTMLElement)) {
			return;
		}

		const paragraphShell = blockContainer.parentElement;
		if (!(paragraphShell instanceof HTMLElement)) {
			return;
		}

		if (!isStandalonePostLink(blockContainer, anchorEl)) {
			return;
		}

		const match = anchorEl.href.match(X_POST_URL_PATTERN);
		if (!match) {
			return;
		}

		const handle = match[1] ?? "unknown";
		const statusId = match[2] ?? "";
		const embedHostUrl = `https://twitter.com/${handle}/status/${statusId}`;
		const embedEl = document.createElement("div");
		embedEl.className = "x-post-embed";
		const loadingEl = document.createElement("div");
		loadingEl.className = "x-post-embed__loading";
		loadingEl.textContent = "Loading post preview...";
		embedEl.appendChild(loadingEl);
		paragraphShell.replaceWith(embedEl);

		void renderOfficialPostEmbed(embedEl, statusId, embedHostUrl).catch((error: unknown) => {
			console.error("Failed to render official X embed", {
				url: anchorEl.href,
				statusId,
				error: error instanceof Error ? error.message : String(error),
			});
			embedEl.empty();
			embedEl.replaceWith(createFallbackPostCard(anchorEl.href, handle, statusId));
		});
	});
}

function isStandalonePostLink(blockContainer: HTMLElement, anchorEl: HTMLAnchorElement): boolean {
	const meaningfulNodes = Array.from(blockContainer.childNodes).filter((node) => {
		if (node === anchorEl) {
			return true;
		}

		if (node.nodeType === Node.TEXT_NODE) {
			return (node.textContent ?? "").trim().length > 0;
		}

		if (node instanceof HTMLElement) {
			return node.textContent?.trim().length !== 0;
		}

		return false;
	});

	return meaningfulNodes.length === 1 && meaningfulNodes[0] === anchorEl;
}

async function renderOfficialPostEmbed(
	targetEl: HTMLElement,
	statusId: string,
	embedUrl: string,
): Promise<void> {
	targetEl.empty();
	const twitter = await loadTwitterWidgets();
	if (twitter?.widgets?.createTweet) {
		await withEmbedTimeout(
			twitter.widgets.createTweet(statusId, targetEl, {
				align: "center",
				dnt: true,
				theme: document.body.classList.contains("theme-dark") ? "dark" : "light",
			}),
		);
		if (targetEl.children.length > 0) {
			return;
		}
		throw new Error("createTweet completed without rendering embed content.");
	}

	const blockquoteEl = document.createElement("blockquote");
	blockquoteEl.className = "twitter-tweet";
	const linkEl = document.createElement("a");
	linkEl.href = embedUrl;
	blockquoteEl.appendChild(linkEl);
	targetEl.appendChild(blockquoteEl);

	if (twitter?.widgets?.load) {
		await withEmbedTimeout(twitter.widgets.load(targetEl));
		const rendered =
			targetEl.querySelector("iframe") ??
			targetEl.querySelector(".twitter-tweet-rendered") ??
			targetEl.querySelector("[data-tweet-id]");
		if (rendered) {
			return;
		}

		throw new Error("widgets.load completed without rendering embed content.");
	}

	throw new Error("Twitter widgets.js did not expose embed APIs.");
}

function withEmbedTimeout<T>(promise: Promise<T>, timeoutMs = 5000): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timeoutId = window.setTimeout(() => {
			reject(new Error(`Embed render timed out after ${timeoutMs}ms.`));
		}, timeoutMs);

		void promise.then(
			(value) => {
				window.clearTimeout(timeoutId);
				resolve(value);
			},
			(error: unknown) => {
				window.clearTimeout(timeoutId);
				reject(error instanceof Error ? error : new Error(String(error)));
			},
		);
	});
}

async function loadTwitterWidgets(): Promise<TwitterWidgets | null> {
	if (typeof window === "undefined") {
		return null;
	}

	const existingTwitter = (window as Window & { twttr?: unknown }).twttr as
		| TwitterWidgets
		| undefined;
	if (existingTwitter?.widgets?.createTweet || existingTwitter?.widgets?.load) {
		return existingTwitter;
	}

	if (!widgetsLoader) {
		widgetsLoader = new Promise<TwitterWidgets | null>((resolve) => {
			const existingScript = document.querySelector<HTMLScriptElement>(
				`script[src="${X_WIDGETS_SCRIPT_URL}"]`,
			);
			if (existingScript) {
				existingScript.addEventListener("load", () => {
					resolve((window as Window & { twttr?: TwitterWidgets }).twttr ?? null);
				});
				existingScript.addEventListener("error", () => resolve(null));
				return;
			}

			const scriptEl = document.createElement("script");
			scriptEl.async = true;
			scriptEl.src = X_WIDGETS_SCRIPT_URL;
			scriptEl.addEventListener("load", () => {
				resolve((window as Window & { twttr?: TwitterWidgets }).twttr ?? null);
			});
			scriptEl.addEventListener("error", () => resolve(null));
			document.head.appendChild(scriptEl);
		});
	}

	return widgetsLoader;
}

function createFallbackPostCard(url: string, handle: string, statusId: string): HTMLElement {
		const cardEl = document.createElement("article");
		cardEl.className = "x-post-card";

		const headerEl = document.createElement("div");
		headerEl.className = "x-post-card__header";
		cardEl.appendChild(headerEl);

		const avatarEl = document.createElement("div");
		avatarEl.className = "x-post-card__avatar";
		headerEl.appendChild(avatarEl);

		const metaEl = document.createElement("div");
		metaEl.className = "x-post-card__meta";
		headerEl.appendChild(metaEl);

		const nameEl = document.createElement("div");
		nameEl.className = "x-post-card__name";
		nameEl.textContent = handle;
		metaEl.appendChild(nameEl);

		const handleEl = document.createElement("div");
		handleEl.className = "x-post-card__handle";
		handleEl.textContent = `@${handle}`;
		metaEl.appendChild(handleEl);

		const bodyEl = document.createElement("div");
		bodyEl.className = "x-post-card__body";
		bodyEl.textContent = "Open the original post on X to view the live embed content.";
		cardEl.appendChild(bodyEl);

		const footerEl = document.createElement("div");
		footerEl.className = "x-post-card__footer";
		cardEl.appendChild(footerEl);

		const linkEl = document.createElement("a");
		linkEl.className = "x-post-card__link";
		linkEl.textContent = "View post on X";
		linkEl.href = url;
		linkEl.target = "_blank";
		linkEl.rel = "noopener noreferrer";
		footerEl.appendChild(linkEl);

		const idEl = document.createElement("span");
		idEl.className = "x-post-card__id";
		idEl.textContent = `Post ID ${statusId}`;
		footerEl.appendChild(idEl);

	return cardEl;
}

function enhanceExternalLinks(container: HTMLElement): void {
	container.querySelectorAll("a").forEach((anchorEl) => {
		if (!(anchorEl instanceof HTMLAnchorElement)) {
			return;
		}

		if (anchorEl.hostname && anchorEl.hostname !== window.location.hostname) {
			anchorEl.classList.add("x-article-external-link");
			anchorEl.target = "_blank";
			anchorEl.rel = "noopener noreferrer";
		}
	});
}
