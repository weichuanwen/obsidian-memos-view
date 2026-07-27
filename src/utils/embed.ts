import type { TFile } from "obsidian";

/**
 * 构建附件嵌入链接（wikilink 或 markdown 格式）。
 * 自动计算源文件目录到目标文件的相对路径。
 */
export function buildAttachmentEmbedLink(
	file: TFile,
	sourcePath: string,
	embedStyle: "wikilink" | "markdown",
): string {
	const normalizedPath = sourcePath.replace(/\\/g, "/");
	const sourceDir = normalizedPath.includes("/")
		? normalizedPath.slice(0, normalizedPath.lastIndexOf("/"))
		: "";
	const targetPath = file.path.replace(/\\/g, "/");
	const relativePath =
		sourceDir && targetPath.startsWith(`${sourceDir}/`)
			? targetPath.slice(sourceDir.length + 1)
			: targetPath;
	if (embedStyle === "markdown") {
		const fileName = file.basename || file.name;
		return `\n![${fileName}](${relativePath})\n`;
	}
	return `\n![[${relativePath}]]\n`;
}
