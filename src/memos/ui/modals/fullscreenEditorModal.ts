import { Modal, type App } from "obsidian";
import { t } from "../../../i18n";

/**
 * 全屏编辑模态:移动端在小输入框中编辑长文本体验差,
 * 由 composer 的展开图标唤起,确认后把文本回写到原输入框。
 */
export class MemosFullscreenEditorModal extends Modal {
	private readonly initialValue: string;
	private readonly onSubmit: (value: string) => void;

	constructor(app: App, initialValue: string, onSubmit: (value: string) => void) {
		super(app);
		this.initialValue = initialValue;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		this.modalEl.addClass("memos-fs-editor");
		this.contentEl.empty();

		const textareaEl = this.contentEl.createEl("textarea", {
			cls: "memos-fs-editor-input",
			placeholder: t("view.composerPlaceholder"),
		});
		textareaEl.value = this.initialValue;

		const footerEl = this.contentEl.createDiv({ cls: "memos-fs-editor-footer" });
		const cancelButton = footerEl.createEl("button", {
			cls: "memos-fs-editor-button is-cancel",
			text: t("view.cancel"),
			attr: { type: "button" },
		});
		cancelButton.addEventListener("click", () => this.close());

		const submitButton = footerEl.createEl("button", {
			cls: "memos-fs-editor-button is-submit",
			text: t("view.done"),
			attr: { type: "button" },
		});
		submitButton.addEventListener("click", () => {
			this.onSubmit(textareaEl.value);
			this.close();
		});

		// 等模态动画完成后再聚焦,避免移动端键盘闪烁
		window.setTimeout(() => textareaEl.focus(), 100);
	}

	onClose(): void {
		this.contentEl.empty();
		this.modalEl.removeClass("memos-fs-editor");
	}
}
