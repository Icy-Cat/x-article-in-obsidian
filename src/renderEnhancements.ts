const X_POST_URL_PATTERN =
	/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([^/]+)\/status\/(\d+)(?:[/?#].*)?$/i;

export function enhanceArticlePreview(container: HTMLElement): void {
	enhanceCodeBlocks(container);
	enhanceStandaloneImages(container);
	enhancePostLinks(container);
	enhanceExternalLinks(container);
}

function enhanceCodeBlocks(container: HTMLElement): void {
	container.querySelectorAll("pre > code").forEach((codeEl) => {
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

		const toolbarEl = document.createElement("div");
		toolbarEl.className = "x-article-code-toolbar";
		frameEl.appendChild(toolbarEl);

		const languageEl = document.createElement("span");
		languageEl.className = "x-article-code-language";
		languageEl.textContent = language || "text";
		toolbarEl.appendChild(languageEl);

		const copyButtonEl = document.createElement("button");
		copyButtonEl.type = "button";
		copyButtonEl.className = "x-article-code-copy";
		copyButtonEl.textContent = "Copy";
		copyButtonEl.setAttribute("aria-label", "Copy code block");
		copyButtonEl.addEventListener("click", () => {
			void (async () => {
				try {
					await navigator.clipboard.writeText(codeEl.textContent ?? "");
					copyButtonEl.textContent = "Copied";
					window.setTimeout(() => {
						copyButtonEl.textContent = "Copy";
					}, 1200);
				} catch {
					copyButtonEl.textContent = "Failed";
					window.setTimeout(() => {
						copyButtonEl.textContent = "Copy";
					}, 1200);
				}
			})();
		});
		toolbarEl.appendChild(copyButtonEl);

		preEl.replaceWith(frameEl);
		frameEl.appendChild(preEl);
	});
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
	container.querySelectorAll("p > a:only-child").forEach((anchorEl) => {
		if (!(anchorEl instanceof HTMLAnchorElement)) {
			return;
		}

		const parentParagraph = anchorEl.parentElement;
		if (!(parentParagraph instanceof HTMLParagraphElement)) {
			return;
		}

		const match = anchorEl.href.match(X_POST_URL_PATTERN);
		if (!match) {
			return;
		}

		const handle = match[1] ?? "unknown";
		const statusId = match[2] ?? "";
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
		linkEl.href = anchorEl.href;
		linkEl.target = "_blank";
		linkEl.rel = "noopener noreferrer";
		footerEl.appendChild(linkEl);

		const idEl = document.createElement("span");
		idEl.className = "x-post-card__id";
		idEl.textContent = `Post ID ${statusId}`;
		footerEl.appendChild(idEl);

		parentParagraph.replaceWith(cardEl);
	});
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
