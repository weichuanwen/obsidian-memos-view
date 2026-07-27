import type { WorkspaceLeaf } from "obsidian";
import { setIcon } from "obsidian";
import { VIEW_TYPE_MEMOS_SIDEBAR } from "../types";
import { t } from "../i18n";
import type MemosViewPlugin from "../main";
import { MemosView } from "./memosView";

/**
 * 侧边栏紧凑视图:始终使用 IM 风格的单列布局
 * (顶部搜索框 → 中间时间轴 → 底部输入框),
 * 不渲染固定侧栏面板(统计/热力图/标签树)。
 *
 * 继承 MemosView 复用全部 memo 渲染、保存、交互逻辑,
 * 仅通过 forceCompactLayout 切换布局,并覆盖视图标识。
 */
export class MemosSidebarView extends MemosView {
	/** 是否正在锁定滚动到底部(覆盖异步分批渲染) */
	private isPinnedToBottom = false;

	constructor(leaf: WorkspaceLeaf, plugin: MemosViewPlugin) {
		super(leaf, plugin);
		this.forceCompactLayout = true;
		// 时间轴:最新 memo 在最底部
		this.sortOrder = "created-asc";
	}

	getViewType(): string {
		return VIEW_TYPE_MEMOS_SIDEBAR;
	}

	getDisplayText(): string {
		return t("view.sidebarDisplayName");
	}

	getIcon(): string {
		return "lightbulb";
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		// render() 已完成,但 renderMemoStream 内部的 setTimeout 分批渲染还未开始
		// 延迟一帧让第一批 setTimeout 触发后再开始锁定
		this.scheduleFrame(() => this.pinScrollToBottom());
	}

	protected scrollToNewMemo(wasNearBottom: boolean): void {
		if (wasNearBottom) {
			this.pinScrollToBottom();
		}
	}

	/**
	 * 将容器锁定在底部:每帧直接设置 scrollTop,覆盖异步分批渲染
	 * (setTimeout 批次 + await MarkdownRenderer),
	 * 不产生滚动动画,避免"先跳顶再滚回"的闪烁。
	 */
	private pinScrollToBottom(): void {
		const container = this.memoStreamContainerEl;
		if (!container) {
			return;
		}

		this.isPinnedToBottom = true;
		// 立即同步设置,确保在浏览器下一次绘制前就到位
		container.scrollTop = container.scrollHeight;

		let frames = 0;
		const maxFrames = 60; // ~1s,覆盖大量卡片的异步分批渲染
		const pin = (): void => {
			if (!this.isPinnedToBottom || frames >= maxFrames) {
				this.isPinnedToBottom = false;
				return;
			}
			container.scrollTop = container.scrollHeight;
			frames++;
			this.scheduleFrame(pin);
		};
		this.scheduleFrame(pin);
	}

	protected createBackToTopButton(parentEl: HTMLElement, bodyEl: HTMLElement): HTMLButtonElement {
		// 按钮放入 bodyEl(滚动容器),用 sticky 钉在可视区底部
		const buttonEl = bodyEl.createEl("button", {
			cls: "memos-back-to-top memos-scroll-to-bottom",
			attr: {
				type: "button",
				"aria-label": t("view.backToTop"),
			},
		});
		setIcon(buttonEl, "arrow-down");
		buttonEl.addEventListener("click", () => {
			bodyEl.scrollTo({ top: bodyEl.scrollHeight, behavior: "smooth" });
		});
		return buttonEl;
	}

	/** 紧凑视图:离底部超过 240px 时显示回到底部按钮 */
	protected isScrollButtonVisible(bodyEl: HTMLElement): boolean {
		return bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight > 240;
	}
}
