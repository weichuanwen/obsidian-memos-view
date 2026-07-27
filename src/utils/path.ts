import { normalizePath } from "obsidian";

/**
 * 将绑定文件路径规范化为统一的、跨平台可比较的形式。
 * - 统一反斜杠为正斜杠
 * - 使用 Obsidian 的 normalizePath 处理冗余分隔符与大小写
 * - 空值/空字符串统一返回 ""
 */
export function normalizeBoundPath(path: string | undefined): string {
	const trimmed = path?.trim();
	if (!trimmed) {
		return "";
	}

	return normalizePath(trimmed.replace(/\\/g, "/"));
}
