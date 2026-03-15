import { TFile } from "obsidian";
import type { XArticlePreviewSettings } from "./settings";

const FRONTMATTER_PATTERN = /^---\n[\s\S]*?\n---\n*/;
const LEADING_HEADING_PATTERN = /^\s*#\s+/m;

export function buildPreviewMarkdown(
	file: TFile,
	markdown: string,
	settings: XArticlePreviewSettings,
): string {
	let output = markdown.replace(/\r\n/g, "\n");

	if (settings.stripFrontmatter) {
		output = output.replace(FRONTMATTER_PATTERN, "");
	}

	output = output.trim();

	if (settings.useFilenameAsTitle && !LEADING_HEADING_PATTERN.test(output)) {
		output = `# ${file.basename}\n\n${output}`;
	}

	return output;
}
