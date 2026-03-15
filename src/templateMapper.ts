function createBlockShell(
	documentRef: Document,
	className: string,
	blockClassName = "public-DraftStyleDefault-block public-DraftStyleDefault-ltr",
): HTMLDivElement {
	const shell = documentRef.createElement("div");
	shell.className = className;

	const block = documentRef.createElement("div");
	block.className = blockClassName;
	shell.appendChild(block);

	return shell;
}

function appendNodeChildren(target: HTMLElement, source: HTMLElement): void {
	while (source.firstChild) {
		target.appendChild(source.firstChild);
	}
}

function wrapStandaloneNode(documentRef: Document, node: HTMLElement): HTMLDivElement {
	const shell = createBlockShell(documentRef, "longform-unstyled");
	appendNodeChildren(shell.firstElementChild as HTMLElement, node);
	return shell;
}

function mapParagraph(documentRef: Document, paragraph: HTMLParagraphElement): HTMLDivElement {
	const shell = createBlockShell(documentRef, "longform-unstyled");
	appendNodeChildren(shell.firstElementChild as HTMLElement, paragraph);
	return shell;
}

function mapHeading(documentRef: Document, heading: HTMLHeadingElement): HTMLDivElement {
	const level = heading.tagName.toLowerCase();
	const className = level === "h1" ? "longform-header-one" : "longform-header-two";
	const shell = createBlockShell(documentRef, className);
	appendNodeChildren(shell.firstElementChild as HTMLElement, heading);
	return shell;
}

function mapBlockquote(documentRef: Document, blockquote: HTMLElement): HTMLDivElement {
	const shell = createBlockShell(documentRef, "longform-blockquote");
	appendNodeChildren(shell.firstElementChild as HTMLElement, blockquote);
	return shell;
}

function mapList(documentRef: Document, listEl: HTMLUListElement | HTMLOListElement): HTMLElement {
	const listClassName =
		listEl.tagName.toLowerCase() === "ol"
			? "public-DraftStyleDefault-ol"
			: "public-DraftStyleDefault-ul";
	listEl.classList.add(listClassName);

	Array.from(listEl.children).forEach((child) => {
		if (!(child instanceof HTMLLIElement)) {
			return;
		}

		const itemClassName =
			listEl.tagName.toLowerCase() === "ol"
				? "longform-ordered-list-item"
				: "longform-unordered-list-item";
		child.classList.add(itemClassName);

		const inlineChildren = Array.from(child.childNodes).filter((node) => {
			if (node instanceof HTMLElement) {
				return !["UL", "OL"].includes(node.tagName);
			}
			return (node.textContent ?? "").trim().length > 0;
		});

		if (inlineChildren.length > 0) {
			const block = documentRef.createElement("div");
			block.className = "public-DraftStyleDefault-block public-DraftStyleDefault-ltr";
			inlineChildren.forEach((node) => block.appendChild(node));
			child.prepend(block);
		}
	});

	return listEl;
}

export function remapArticleDom(container: HTMLElement): void {
	const documentRef = container.ownerDocument;
	const mappedNodes: HTMLElement[] = [];

	Array.from(container.children).forEach((child) => {
		if (!(child instanceof HTMLElement)) {
			return;
		}

		switch (child.tagName.toLowerCase()) {
			case "h1":
			case "h2":
			case "h3":
			case "h4":
			case "h5":
			case "h6":
				mappedNodes.push(mapHeading(documentRef, child as HTMLHeadingElement));
				break;
			case "p":
				mappedNodes.push(mapParagraph(documentRef, child as HTMLParagraphElement));
				break;
			case "blockquote":
				mappedNodes.push(mapBlockquote(documentRef, child));
				break;
			case "ul":
			case "ol":
				mappedNodes.push(mapList(documentRef, child as HTMLUListElement | HTMLOListElement));
				break;
			case "pre":
				child.classList.add("x-article-code-block");
				mappedNodes.push(child);
				break;
			default:
				mappedNodes.push(wrapStandaloneNode(documentRef, child));
				break;
		}
	});

	container.empty();

	const draftRoot = documentRef.createElement("div");
	draftRoot.className = "draftjs-styles_0 x-article-template";

	const draftEditorRoot = documentRef.createElement("div");
	draftEditorRoot.className = "DraftEditor-root";
	draftRoot.appendChild(draftEditorRoot);

	const editorContainer = documentRef.createElement("div");
	editorContainer.className = "DraftEditor-editorContainer";
	draftEditorRoot.appendChild(editorContainer);

	const content = documentRef.createElement("div");
	content.className = "public-DraftEditor-content";
	editorContainer.appendChild(content);

	mappedNodes.forEach((node) => content.appendChild(node));
	container.appendChild(draftRoot);
}
