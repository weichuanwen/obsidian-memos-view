import { App, TFile, moment, normalizePath } from "obsidian";

function resolveTemplateFile(app: App, configuredPath: string): TFile | null {
	const normalizedPath = normalizePath(configuredPath.trim().replace(/^\/+/, ""));
	if (!normalizedPath) {
		return null;
	}

	for (const path of [normalizedPath, normalizedPath.endsWith(".md") ? normalizedPath : `${normalizedPath}.md`]) {
		const file = app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			return file;
		}
	}

	return app.metadataCache.getFirstLinkpathDest(normalizedPath, "");
}

export async function readDailyNoteTemplate(app: App, configuredPath?: string): Promise<string> {
	if (!configuredPath?.trim()) {
		return "";
	}

	const templateFile = resolveTemplateFile(app, configuredPath);
	return templateFile ? app.vault.cachedRead(templateFile) : "";
}

export function renderDailyNoteTemplate(template: string, date: Date, title: string): string {
	const templateDate = moment(date);
	return template
		.replace(/{{\s*title\s*}}/gi, title)
		.replace(/{{\s*date(?::([^}]+))?\s*}}/gi, (_match, format: string | undefined) =>
			templateDate.format(format?.trim() || "YYYY-MM-DD"),
		)
		.replace(/{{\s*time(?::([^}]+))?\s*}}/gi, (_match, format: string | undefined) =>
			templateDate.format(format?.trim() || "HH:mm"),
		);
}
