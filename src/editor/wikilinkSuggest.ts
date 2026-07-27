import { App, TFile } from "obsidian";
import {
	type WikilinkContext,
	type WikilinkSuggestion,
	applyWikilinkSuggestion,
	expandEmptyAnchorToCurrentFile,
	getWikilinkSuggestions,
	parseWikilinkContext,
} from "../memos/wikilink";
import { t } from "../i18n";

/**
 * wikilink 建议控制器:从 MemosView.bindTextareaWikilinkSuggest 抽取。
 * 负责监听 textarea 事件、查询建议、渲染面板、处理键盘导航与选中插入。
 */

/** 纯函数:判断是否为锚点(#)快捷键 */
export function isWikilinkAnchorShortcut(event: KeyboardEvent): boolean {
	return event.key === "#" || (event.shiftKey && event.code === "Digit3");
}

/** 纯函数:将中文输入法下的 [[ 和 #^ 规范化为英文符号;发生替换返回 true */
export function normalizeWikilinkInput(
	textareaEl: HTMLTextAreaElement,
	onChange: (value: string) => void,
): boolean {
	const cursor = textareaEl.selectionStart ?? textareaEl.value.length;
	let value = textareaEl.value;
	let nextCursor = cursor;
	let changed = false;

	if (cursor >= 2 && value.slice(cursor - 2, cursor) === "【【") {
		value = `${value.slice(0, cursor - 2)}[[${value.slice(cursor)}`;
		changed = true;
	}

	if (cursor >= 3 && value.slice(cursor - 3, cursor) === "#……") {
		value = `${value.slice(0, cursor - 3)}#^${value.slice(cursor)}`;
		nextCursor -= 1;
		changed = true;
	}

	if (!changed) {
		return false;
	}

	textareaEl.value = value;
	onChange(value);
	textareaEl.setSelectionRange(nextCursor, nextCursor);
	return true;
}

/** 纯函数:镜像测量 textarea 光标的像素坐标 */
export function measureTextareaCaretOffset(
	textareaEl: HTMLTextAreaElement,
): { left: number; top: number; lineHeight: number } {
	const mirrorEl = document.createElement("div");
	const style = window.getComputedStyle(textareaEl);
	const textareaRect = textareaEl.getBoundingClientRect();
	const cursor = textareaEl.selectionStart ?? textareaEl.value.length;
	const contentBeforeCursor = textareaEl.value.slice(0, cursor);
	const contentAfterCursor = textareaEl.value.slice(cursor) || ".";

	mirrorEl.setCssStyles({
		position: "absolute",
		visibility: "hidden",
		pointerEvents: "none",
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
		overflowWrap: "anywhere",
		boxSizing: "border-box",
		left: "-9999px",
		top: "0",
	});
	mirrorEl.style.width = `${textareaRect.width}px`;
	mirrorEl.style.font = style.font;
	mirrorEl.style.fontFamily = style.fontFamily;
	mirrorEl.style.fontFeatureSettings = style.fontFeatureSettings;
	mirrorEl.style.fontKerning = style.fontKerning;
	mirrorEl.style.fontSize = style.fontSize;
	mirrorEl.style.fontStretch = style.fontStretch;
	mirrorEl.style.fontStyle = style.fontStyle;
	mirrorEl.style.fontVariant = style.fontVariant;
	mirrorEl.style.fontWeight = style.fontWeight;
	mirrorEl.style.letterSpacing = style.letterSpacing;
	mirrorEl.style.lineHeight = style.lineHeight;
	mirrorEl.style.padding = style.padding;
	mirrorEl.style.border = style.border;

	const beforeEl = document.createElement("span");
	beforeEl.textContent = contentBeforeCursor;
	mirrorEl.appendChild(beforeEl);

	const caretEl = document.createElement("span");
	caretEl.textContent = "\u200b";
	mirrorEl.appendChild(caretEl);

	const afterEl = document.createElement("span");
	afterEl.textContent = contentAfterCursor;
	mirrorEl.appendChild(afterEl);

	document.body.appendChild(mirrorEl);

	const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.6 || 22;
	const left = caretEl.offsetLeft - textareaEl.scrollLeft;
	const top = caretEl.offsetTop - textareaEl.scrollTop;

	mirrorEl.remove();

	return { left, top, lineHeight };
}

/** 纯函数:根据光标位置计算建议面板的坐标 */
export function positionSuggestPanel(
	textareaEl: HTMLTextAreaElement,
	panelEl: HTMLElement,
): void {
	const caretOffset = measureTextareaCaretOffset(textareaEl);
	const horizontalPadding = 12;
	const verticalGap = 8;
	const maxPanelWidth = Math.min(420, Math.max(260, textareaEl.clientWidth - horizontalPadding * 2));
	const panelWidth = Math.min(maxPanelWidth, textareaEl.clientWidth);
	const maxLeft = Math.max(horizontalPadding, textareaEl.clientWidth - panelWidth);
	const nextLeft = Math.min(Math.max(caretOffset.left, horizontalPadding), maxLeft);
	const nextTop = Math.min(
		Math.max(caretOffset.top + caretOffset.lineHeight + verticalGap, verticalGap),
		Math.max(verticalGap, textareaEl.clientHeight - 16),
	);

	panelEl.style.width = `${panelWidth}px`;
	panelEl.style.left = `${nextLeft}px`;
	panelEl.style.top = `${nextTop}px`;
}

/** 控制器所需的上下文回调 */
export interface WikilinkSuggestDeps {
	/** 确保段落块 ID 存在并返回,失败返回 null */
	ensureParagraphBlockId: (
		item: Extract<WikilinkSuggestion, { type: "paragraph" }>,
	) => Promise<string | null>;
}

export class WikilinkSuggestController {
	private suggestions: WikilinkSuggestion[] = [];
	private selectedIndex = 0;
	private activeContext: WikilinkContext | null = null;
	private lockedAnchorTargetPath: string | null = null;
	private syncRequestId = 0;
	private isComposing = false;
	private isDestroyed = false;
	private readonly listeners: Array<() => void> = [];

	constructor(
		private readonly app: App,
		private readonly textareaEl: HTMLTextAreaElement,
		private readonly panelEl: HTMLElement,
		private readonly sourcePath: string,
		private readonly onChange: (value: string) => void,
		private readonly deps: WikilinkSuggestDeps,
	) {
		this.bind();
	}

	/** 销毁控制器,清理引用(事件监听器因绑在 textareaEl 上,随 DOM 移除自动回收) */
	destroy(): void {
		this.isDestroyed = true;
		this.hidePanel();
		this.listeners.length = 0;
	}

	private hidePanel(): void {
		this.suggestions = [];
		this.selectedIndex = 0;
		this.activeContext = null;
		this.lockedAnchorTargetPath = null;
		this.panelEl.empty();
		this.panelEl.setAttr("hidden", "hidden");
	}

	private async applySuggestion(item: WikilinkSuggestion): Promise<void> {
		const contextAtSelection = this.activeContext;
		if (!contextAtSelection) {
			this.hidePanel();
			return;
		}

		if (item.type === "paragraph") {
			const blockId = await this.deps.ensureParagraphBlockId(item);
			if (!blockId) {
				this.hidePanel();
				return;
			}

			const result = applyWikilinkSuggestion(
				this.textareaEl.value,
				contextAtSelection.matchEnd,
				contextAtSelection,
				{
					type: "block",
					file: item.file,
					blockId,
					displayText: `^${blockId}`,
					path: item.path,
				},
			);
			this.textareaEl.value = result.newText;
			this.onChange(result.newText);
			this.hidePanel();
			this.textareaEl.focus();
			this.textareaEl.setSelectionRange(result.newCursor, result.newCursor);
			this.textareaEl.dispatchEvent(new Event("input", { bubbles: true }));
			return;
		}

		const result = applyWikilinkSuggestion(
			this.textareaEl.value,
			contextAtSelection.matchEnd,
			contextAtSelection,
			item,
		);
		this.textareaEl.value = result.newText;
		this.onChange(result.newText);
		this.hidePanel();
		this.textareaEl.focus();
		this.textareaEl.setSelectionRange(result.newCursor, result.newCursor);
		this.textareaEl.dispatchEvent(new Event("input", { bubbles: true }));
	}

	private applyAnchorTransition(): void {
		if (!this.activeContext || !this.suggestions.length) {
			return;
		}

		const selectedItem = this.suggestions[this.selectedIndex];
		const targetFile = selectedItem?.file ?? null;
		const baseName = targetFile?.basename ?? (this.activeContext.filePart.trim() || "");
		if (!baseName) {
			return;
		}

		this.lockedAnchorTargetPath = targetFile?.path ?? this.lockedAnchorTargetPath;

		const before = this.textareaEl.value.slice(0, this.activeContext.matchStart);
		const after = this.textareaEl.value.slice(this.activeContext.matchEnd);
		const replacement = `[[${baseName}#`;
		const nextValue = `${before}${replacement}${after}`;
		const nextCursor = before.length + replacement.length;

		this.textareaEl.value = nextValue;
		this.onChange(nextValue);
		this.textareaEl.focus();
		this.textareaEl.setSelectionRange(nextCursor, nextCursor);
		this.textareaEl.dispatchEvent(new Event("input", { bubbles: true }));
	}

	private renderPanel(): void {
		this.panelEl.empty();
		if (!this.suggestions.length) {
			this.panelEl.setAttr("hidden", "hidden");
			this.panelEl.style.removeProperty("left");
			this.panelEl.style.removeProperty("top");
			return;
		}

		this.panelEl.removeAttribute("hidden");
		positionSuggestPanel(this.textareaEl, this.panelEl);
		this.suggestions.forEach((item, index) => {
			const itemEl = this.panelEl.createEl("button", {
				cls: `memos-wikilink-suggest-item${index === this.selectedIndex ? " is-selected" : ""}`,
				attr: {
					type: "button",
					"aria-label": item.path,
				},
			});
			itemEl.addEventListener("mousedown", (event) => {
				event.preventDefault();
				void this.applySuggestion(item);
			});

			const typeEl = itemEl.createSpan({ cls: "memos-wikilink-suggest-type" });
			typeEl.setText(
				item.type === "file"
					? t("view.wikilinkFile")
					: item.type === "heading"
						? t("view.wikilinkHeading")
						: item.type === "paragraph"
							? t("view.wikilinkParagraph")
							: t("view.wikilinkBlock"),
			);

			const contentEl = itemEl.createSpan({ cls: "memos-wikilink-suggest-content" });
			contentEl.createSpan({
				cls: "memos-wikilink-suggest-title",
				text: item.displayText,
			});
			contentEl.createSpan({
				cls: "memos-wikilink-suggest-path",
				text: item.path,
			});
		});

		const selectedItemEl = this.panelEl.querySelector(".memos-wikilink-suggest-item.is-selected");
		if (selectedItemEl instanceof HTMLElement) {
			selectedItemEl.scrollIntoView({ block: "nearest" });
		}
	}

	private async syncPanel(): Promise<void> {
		const requestId = ++this.syncRequestId;
		const cursor = this.textareaEl.selectionStart ?? this.textareaEl.value.length;
		const context = parseWikilinkContext(this.textareaEl.value, cursor);
		if (!context) {
			this.hidePanel();
			return;
		}

		if (!context.separator) {
			this.lockedAnchorTargetPath = null;
		} else if (this.lockedAnchorTargetPath) {
			const lockedTargetFile = this.app.vault.getAbstractFileByPath(this.lockedAnchorTargetPath);
			if (
				!(lockedTargetFile instanceof TFile) ||
				(context.filePart.trim() &&
					context.filePart.trim() !== lockedTargetFile.basename &&
					context.filePart.trim() !== lockedTargetFile.path)
			) {
				this.lockedAnchorTargetPath = null;
			}
		}

		const normalizedContext = expandEmptyAnchorToCurrentFile(this.app, context, this.sourcePath);
		const nextSuggestions = await getWikilinkSuggestions(
			this.app,
			normalizedContext,
			this.sourcePath,
			this.lockedAnchorTargetPath,
		);
		if (requestId !== this.syncRequestId || this.isDestroyed) {
			return;
		}
		if (!nextSuggestions.length) {
			this.hidePanel();
			return;
		}

		this.activeContext = context;
		this.suggestions = nextSuggestions;
		this.selectedIndex = Math.min(this.selectedIndex, this.suggestions.length - 1);
		this.renderPanel();
	}

	private addListener<K extends keyof HTMLElementEventMap>(
		type: K,
		handler: (event: HTMLElementEventMap[K]) => void,
	): void {
		this.textareaEl.addEventListener(type, handler);
		this.listeners.push(() => this.textareaEl.removeEventListener(type, handler));
	}

	private bind(): void {
		this.addListener("compositionstart", () => {
			this.isComposing = true;
		});
		this.addListener("compositionend", () => {
			this.isComposing = false;
			normalizeWikilinkInput(this.textareaEl, this.onChange);
			void this.syncPanel();
		});
		this.addListener("input", () => {
			if (!this.isComposing) {
				normalizeWikilinkInput(this.textareaEl, this.onChange);
			}
			void this.syncPanel();
		});
		this.addListener("click", () => {
			void this.syncPanel();
		});
		this.addListener("keyup", (event) => {
			if (event.key === "ArrowUp" || event.key === "ArrowDown" || event.key === "Enter" || event.key === "Tab") {
				return;
			}
			void this.syncPanel();
		});
		this.addListener("blur", () => {
			window.setTimeout(() => {
				if (document.activeElement === this.textareaEl) {
					return;
				}
				this.hidePanel();
			}, 80);
		});
		this.addListener("keydown", (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				this.hidePanel();
				return;
			}

			if (!this.suggestions.length) {
				return;
			}

			if (event.key === "ArrowDown") {
				event.preventDefault();
				this.selectedIndex = (this.selectedIndex + 1) % this.suggestions.length;
				this.renderPanel();
				return;
			}

			if (event.key === "ArrowUp") {
				event.preventDefault();
				this.selectedIndex = (this.selectedIndex - 1 + this.suggestions.length) % this.suggestions.length;
				this.renderPanel();
				return;
			}

			if (isWikilinkAnchorShortcut(event) && this.activeContext?.separator === "") {
				event.preventDefault();
				this.applyAnchorTransition();
				return;
			}

			if (event.key === "Enter" || event.key === "Tab") {
				event.preventDefault();
				const selectedSuggestion = this.suggestions[this.selectedIndex];
				if (!selectedSuggestion) {
					this.hidePanel();
					return;
				}
				void this.applySuggestion(selectedSuggestion);
				return;
			}
		});
	}
}
