import { MarkdownRenderer, Modal, Notice, setIcon } from "obsidian";
import type { MemosView } from "../memosView";
import type { MemoEntry } from "../../types";
import { t } from "../../i18n";

export class MemosRandomWalkModal extends Modal {
	private readonly view: MemosView;
	private readonly memos: MemoEntry[];
	private currentMemo: MemoEntry | null = null;

	constructor(view: MemosView, memos: MemoEntry[]) {
		super(view.app);
		this.view = view;
		this.memos = memos;
	}

	onOpen(): void {
		this.modalEl.addClass("memos-random-walk-modal");
		this.contentEl.empty();
		void this.showRandomMemo();
	}

	onClose(): void {
		this.contentEl.empty();
		this.modalEl.removeClass("memos-random-walk-modal");
	}

	private async showRandomMemo(): Promise<void> {
		const nextMemo = this.pickRandomMemo();
		if (!nextMemo) {
			new Notice(t("notices.noMemosForRandomWalk"));
			this.close();
			return;
		}

		this.currentMemo = nextMemo;
		await this.renderCurrentMemo();
	}

	private pickRandomMemo(): MemoEntry | null {
		if (!this.memos.length) {
			return null;
		}

		if (this.memos.length === 1) {
			return this.memos[0] ?? null;
		}

		let candidate = this.memos[Math.floor(Math.random() * this.memos.length)] ?? null;
		let attempts = 0;
		while (candidate && this.currentMemo && candidate.id === this.currentMemo.id && attempts < 6) {
			candidate = this.memos[Math.floor(Math.random() * this.memos.length)] ?? null;
			attempts += 1;
		}

		return candidate;
	}

	private async renderCurrentMemo(): Promise<void> {
		if (!this.currentMemo) {
			return;
		}

		const memo = this.currentMemo;
		this.contentEl.empty();

		const shellEl = this.contentEl.createDiv({ cls: "memos-random-walk-shell" });

		const headerEl = shellEl.createDiv({ cls: "memos-random-walk-header" });
		const eyebrowEl = headerEl.createDiv({ cls: "memos-random-walk-eyebrow" });
		eyebrowEl.createSpan({ text: t("view.randomWalk") });
		eyebrowEl.createSpan({ cls: "memos-random-walk-slash", text: "/" });
		eyebrowEl.createSpan({ text: memo.dayKey });

		const titleRowEl = headerEl.createDiv({ cls: "memos-random-walk-title-row" });
		titleRowEl.createEl("h2", { text: memo.sourceBasename });
		const titleActionsEl = titleRowEl.createDiv({ cls: "memos-random-walk-title-actions" });
		const openFileButtonEl = titleActionsEl.createEl("button", {
			cls: "memos-random-walk-next",
			attr: { type: "button", "aria-label": t("view.openSourceFile") },
		});
		setIcon(openFileButtonEl, "file-pen");
		openFileButtonEl.addEventListener("click", () => {
			void this.openSourceAndClose(memo);
		});
		const shuffleButtonEl = titleActionsEl.createEl("button", {
			cls: "memos-random-walk-next",
			attr: { type: "button", "aria-label": t("view.nextRandomMemo") },
		});
		setIcon(shuffleButtonEl, "shuffle");
		shuffleButtonEl.addEventListener("click", () => {
			void this.showRandomMemo();
		});

		const metaEl = shellEl.createDiv({ cls: "memos-random-walk-meta" });
		this.createMetaPill(metaEl, "clock-3", memo.createdLabel);
		if (memo.archivedAt) {
			this.createMetaPill(metaEl, "archive", t("view.archived"));
		}
		if (memo.deletedAt) {
			this.createMetaPill(metaEl, "trash-2", t("view.deleted"));
		}
		memo.tags.slice(0, 6).forEach((tag) => {
			this.createMetaPill(metaEl, "hash", tag.replace(/^#/, ""));
		});

		const bodyEl = shellEl.createDiv({ cls: "memos-random-walk-body markdown-rendered" });
		await MarkdownRenderer.render(this.app, memo.content, bodyEl, memo.sourcePath, this.view);
		this.view.bindRenderedInternalLinks(bodyEl, memo.sourcePath);

		const footerEl = shellEl.createDiv({ cls: "memos-random-walk-footer" });
		const sourceInfoEl = footerEl.createDiv({ cls: "memos-random-walk-source" });
		sourceInfoEl.createSpan({ text: memo.sourcePath });
	}

	private createMetaPill(parentEl: HTMLElement, icon: string, label: string): void {
		const pillEl = parentEl.createDiv({ cls: "memos-random-walk-pill" });
		const iconEl = pillEl.createSpan({ cls: "memos-random-walk-pill-icon" });
		setIcon(iconEl, icon);
		pillEl.createSpan({ text: label });
	}

	private async openSourceAndClose(memo: MemoEntry): Promise<void> {
		await this.view.openMemoSourceAtLine(memo);
		this.close();
	}
}
