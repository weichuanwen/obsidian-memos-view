import { App, Component, MarkdownRenderer, Modal, Notice } from "obsidian";
import domtoimage from "dom-to-image-more";
import type { MemoEntry } from "../types";
import { t } from "../i18n";

type MemoShareStyleId = "daily" | "ticket" | "phone" | "memo" | "feed" | "plain";

interface MemoShareStyle {
	id: MemoShareStyleId;
	label: string;
	background: string;
	cardBackground: string;
	text: string;
	muted: string;
	accent: string;
	border: string;
	shadow: string;
	title: string;
}

const SHARE_STYLES: MemoShareStyle[] = [
	{
		id: "daily",
		label: "Daily",
		background: "linear-gradient(135deg, #f5ecd5 0%, #fbf6e8 54%, #e7d2a0 100%)",
		cardBackground: "#fffaf0",
		text: "#4f3f2a",
		muted: "#b79755",
		accent: "#d5a64d",
		border: "#ead9ac",
		shadow: "0 30px 80px rgba(112, 83, 28, 0.22)",
		title: "memos",
	},
	{
		id: "ticket",
		label: "Ticket",
		background: "linear-gradient(145deg, #f2f2f2 0%, #ffffff 48%, #e5e5e5 100%)",
		cardBackground: "#ffffff",
		text: "#303030",
		muted: "#969696",
		accent: "#d95f64",
		border: "#d6d6d6",
		shadow: "0 30px 70px rgba(38, 38, 38, 0.15)",
		title: "memos",
	},
	{
		id: "phone",
		label: "Phone",
		background: "linear-gradient(160deg, #f8f9f3 0%, #f1f4e8 46%, #d9e3c2 100%)",
		cardBackground: "#fffef8",
		text: "#3f4434",
		muted: "#9aa184",
		accent: "#b7c66a",
		border: "#d9dfbd",
		shadow: "0 32px 72px rgba(81, 91, 54, 0.18)",
		title: "memos",
	},
	{
		id: "memo",
		label: "Memo",
		background: "linear-gradient(140deg, #fff9dc 0%, #fffdf1 56%, #f2dfa3 100%)",
		cardBackground: "#fffdf0",
		text: "#4f452d",
		muted: "#b7a76d",
		accent: "#dfb93f",
		border: "#efe0a6",
		shadow: "0 28px 78px rgba(145, 112, 33, 0.18)",
		title: "memos",
	},
	{
		id: "feed",
		label: "Clean",
		background: "linear-gradient(135deg, #f6faf7 0%, #ffffff 54%, #edf5ef 100%)",
		cardBackground: "#ffffff",
		text: "#2f3d34",
		muted: "#95a99b",
		accent: "#36c275",
		border: "#dce9df",
		shadow: "0 28px 76px rgba(40, 87, 58, 0.14)",
		title: "memos",
	},
	{
		id: "plain",
		label: "Plain",
		background: "linear-gradient(135deg, #f7f7f7 0%, #ffffff 52%, #ededed 100%)",
		cardBackground: "#ffffff",
		text: "#272727",
		muted: "#a3a3a3",
		accent: "#787878",
		border: "#eeeeee",
		shadow: "0 24px 68px rgba(0, 0, 0, 0.1)",
		title: "memos",
	},
];

const DEFAULT_SHARE_STYLE = SHARE_STYLES[1] as MemoShareStyle;
const SHARE_CARD_WIDTH = 900;

function resolveShareTitle(shareTitle: string, memo: MemoEntry): string {
	const trimmed = shareTitle.trim();
	if (!trimmed) {
		return "memos";
	}
	return trimmed.replace(/\{date\}/g, memo.dayKey);
}

export function openMemoShareModal(app: App, memo: MemoEntry, shareTitle: string): void {
	new MemoShareModal(app, memo, shareTitle).open();
}

class MemoShareModal extends Modal {
	private readonly memo: MemoEntry;
	private readonly customTitle: string;
	private readonly markdownRenderComponent = new Component();
	private selectedStyle: MemoShareStyle = DEFAULT_SHARE_STYLE;
	private previewWrapEl: HTMLElement | null = null;
	private styleListEl: HTMLElement | null = null;
	private previewRenderId = 0;

	constructor(app: App, memo: MemoEntry, shareTitle: string) {
		super(app);
		this.memo = memo;
		this.customTitle = shareTitle;
	}

	onOpen(): void {
		this.modalEl.addClass("memos-share-modal");
		this.markdownRenderComponent.load();
		this.render();
	}

	onClose(): void {
		this.markdownRenderComponent.unload();
		this.contentEl.empty();
		this.modalEl.removeClass("memos-share-modal");
	}

	private render(): void {
		this.contentEl.empty();

		this.previewWrapEl = this.contentEl.createDiv({ cls: "memos-share-preview-wrap" });
		this.previewWrapEl.addEventListener("click", () => {
			void this.copyImage();
		});

		this.styleListEl = this.contentEl.createDiv({ cls: "memos-share-style-list" });
		this.renderStyleList();

		const actionsEl = this.contentEl.createDiv({ cls: "memos-share-actions" });
		const copyButtonEl = actionsEl.createEl("button", {
			cls: "memos-share-action is-primary",
			text: t("share.copyImage"),
			attr: { type: "button" },
		});
		copyButtonEl.addEventListener("click", () => {
			void this.copyImage();
		});
		const saveButtonEl = actionsEl.createEl("button", {
			cls: "memos-share-action",
			text: t("share.saveImage"),
			attr: { type: "button" },
		});
		saveButtonEl.addEventListener("click", () => {
			void this.saveImage();
		});

		void this.renderPreview();
	}

	private renderStyleList(): void {
		if (!this.styleListEl) {
			return;
		}

		this.styleListEl.empty();
		SHARE_STYLES.forEach((style) => {
			const buttonEl = this.styleListEl?.createEl("button", {
				cls: `memos-share-style-button${this.selectedStyle.id === style.id ? " is-active" : ""}`,
				attr: {
					type: "button",
					"aria-pressed": String(this.selectedStyle.id === style.id),
					"aria-label": `Choose ${style.label} style`,
				},
			});
			if (!buttonEl) {
				return;
			}
			buttonEl.dataset.shareStyleId = style.id;
			buttonEl.setText(style.label);
			buttonEl.addEventListener("click", () => {
				this.selectedStyle = style;
				this.updateStyleListActive();
				if (!this.updatePreviewStyle()) {
					void this.renderPreview();
				}
			});
		});
	}

	private updateStyleListActive(): void {
		if (!this.styleListEl) {
			return;
		}

		this.styleListEl.querySelectorAll(".memos-share-style-button").forEach((buttonEl) => {
			if (!(buttonEl instanceof HTMLElement)) {
				return;
			}

			const isActive = buttonEl.dataset.shareStyleId === this.selectedStyle.id;
			buttonEl.toggleClass("is-active", isActive);
			buttonEl.setAttribute("aria-pressed", String(isActive));
		});
	}

	private async renderPreview(): Promise<void> {
		if (!this.previewWrapEl) {
			return;
		}

		const renderId = ++this.previewRenderId;
		const previousPreviewEl = this.previewWrapEl.querySelector(".memos-share-preview");
		const previousHeight = previousPreviewEl instanceof HTMLElement
			? previousPreviewEl.offsetHeight
			: this.previewWrapEl.offsetHeight;
		if (previousHeight > 0) {
			this.previewWrapEl.style.minHeight = `${previousHeight}px`;
		}

		const previewEl = this.previewWrapEl.createDiv({ cls: "memos-share-preview" });
		const previewInnerEl = previewEl.createDiv({ cls: "memos-share-preview-inner" });
		previewInnerEl.empty();
		const previewCard = new DOMParser().parseFromString(
			buildShareCardHtml(this.memo, this.selectedStyle, "preview", "", resolveShareTitle(this.customTitle, this.memo)),
			"text/html",
		);
		previewInnerEl.append(...Array.from(previewCard.body.childNodes));
		previewEl.setCssStyles({
			position: "absolute",
			visibility: "hidden",
			pointerEvents: "none",
		});
		const contentEl = previewInnerEl.querySelector(".memos-share-card-content");
		if (contentEl instanceof HTMLElement) {
			contentEl.empty();
			await MarkdownRenderer.render(
				this.app,
				this.memo.content,
				contentEl,
				this.memo.sourcePath,
				this.markdownRenderComponent,
			);
		}

		await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
		if (renderId !== this.previewRenderId || !this.previewWrapEl) {
			previewEl.remove();
			return;
		}

		this.fitPreviewToContainer(previewEl, previewInnerEl);
		previewEl.setCssStyles({
			position: "",
			visibility: "",
			pointerEvents: "",
		});
		const nextHeight = previewEl.offsetHeight;
		if (nextHeight > 0) {
			this.previewWrapEl.style.minHeight = `${nextHeight}px`;
		}
		Array.from(this.previewWrapEl.querySelectorAll(".memos-share-preview")).forEach((node) => {
			if (node !== previewEl) {
				node.remove();
			}
		});
	}

	private fitPreviewToContainer(previewEl: HTMLElement, previewInnerEl: HTMLElement): void {
		if (!this.previewWrapEl) {
			return;
		}

		const wrapStyle = window.getComputedStyle(this.previewWrapEl);
		const horizontalPadding =
			Number.parseFloat(wrapStyle.paddingLeft) +
			Number.parseFloat(wrapStyle.paddingRight);
		const availableWidth = Math.max(320, this.previewWrapEl.clientWidth - horizontalPadding);
		const scale = Math.min(1, Math.max(0.38, availableWidth / SHARE_CARD_WIDTH));
		const cardEl = previewInnerEl.querySelector(".memos-share-card");
		const cardHeight = cardEl instanceof HTMLElement ? cardEl.offsetHeight : 0;

		previewEl.style.width = `${SHARE_CARD_WIDTH * scale}px`;
		previewEl.style.height = cardHeight ? `${cardHeight * scale}px` : "";
		previewInnerEl.style.transform = `scale(${scale})`;
	}

	private async copyImage(): Promise<void> {
		try {
			const blob = await this.createImageBlob();
			await navigator.clipboard.write([
				new ClipboardItem({
					"image/png": blob,
				}),
			]);
			new Notice(t("share.imageCopied"));
		} catch (error) {
			console.error("Failed to copy share image", error);
			new Notice(t("share.copyFailed"));
			await this.saveImage();
		}
	}

	private updatePreviewStyle(): boolean {
		if (!this.previewWrapEl) {
			return false;
		}

		const cardEl = this.previewWrapEl.querySelector(".memos-share-card");
		const brandEl = this.previewWrapEl.querySelector(".memos-share-card-brand");
		if (!(cardEl instanceof HTMLElement) || !(brandEl instanceof HTMLElement)) {
			return false;
		}

		this.applyStyleToShareCard(cardEl, this.selectedStyle);
		brandEl.setText(`- ${resolveShareTitle(this.customTitle, this.memo)} -`);
		return true;
	}

	private applyStyleToShareCard(cardEl: HTMLElement, style: MemoShareStyle): void {
		cardEl.style.setProperty("--share-bg", style.cardBackground);
		cardEl.style.setProperty("--share-text", style.text);
		cardEl.style.setProperty("--share-muted", style.muted);
		cardEl.style.setProperty("--share-accent", style.accent);
		cardEl.style.setProperty("--share-border", style.border);
		cardEl.style.setProperty("--share-shadow", style.shadow);
	}

	private async saveImage(): Promise<void> {
		try {
			const blob = await this.createImageBlob();
			const url = URL.createObjectURL(blob);
			const linkEl = document.createElement("a");
			linkEl.href = url;
			linkEl.download = `memo-share-${this.memo.dayKey}-${this.memo.createdLabel.replace(/[:\s]/g, "")}.png`;
			linkEl.click();
			window.setTimeout(() => {
				URL.revokeObjectURL(url);
			}, 1000);
			new Notice(t("share.imageSaved"));
		} catch (error) {
			console.error("Failed to save share image", error);
			new Notice(t("share.saveFailed"));
		}
	}

	private async createImageBlob(): Promise<Blob> {
		return exportShareCardDomToBlob(
			this.app,
			this.memo,
			this.selectedStyle,
			this.markdownRenderComponent,
			resolveShareTitle(this.customTitle, this.memo),
		);
	}
}

async function exportShareCardDomToBlob(
	app: App,
	memo: MemoEntry,
	style: MemoShareStyle,
	component: Component,
	resolvedTitle = "memos",
): Promise<Blob> {
	const surfaceEl = document.createElement("div");
	surfaceEl.addClass("memos-share-export-surface");
	surfaceEl.style.setProperty("--share-export-bg", style.background);
	const exportCard = new DOMParser().parseFromString(
		buildShareCardHtml(memo, style, "image", "", resolvedTitle),
		"text/html",
	);
	surfaceEl.append(...Array.from(exportCard.body.childNodes));

	const contentEl = surfaceEl.querySelector(".memos-share-card-content");
	if (!(contentEl instanceof HTMLElement)) {
		throw new Error("Share card content element was not created.");
	}

	document.body.appendChild(surfaceEl);
	try {
		await MarkdownRenderer.render(app, memo.content, contentEl, memo.sourcePath, component);
		await waitForDomToSettle(surfaceEl);
		const rect = surfaceEl.getBoundingClientRect();
		return await domtoimage.toBlob(surfaceEl, {
			width: Math.ceil(rect.width),
			height: Math.ceil(rect.height),
			cacheBust: true,
			imagePlaceholder: TRANSPARENT_IMAGE_PLACEHOLDER,
		});
	} finally {
		surfaceEl.remove();
	}
}

async function waitForDomToSettle(rootEl: HTMLElement): Promise<void> {
	await Promise.resolve(document.fonts?.ready).catch(() => undefined);
	const images = Array.from(rootEl.querySelectorAll("img"));
	await Promise.all(
		images.map((image) => {
			if (image.complete) {
				return Promise.resolve();
			}

			return new Promise<void>((resolve) => {
				image.addEventListener("load", () => resolve(), { once: true });
				image.addEventListener("error", () => resolve(), { once: true });
			});
		}),
	);
	await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

const TRANSPARENT_IMAGE_PLACEHOLDER =
	"data:image/gif;base64,R0lGODlhAQABAAAAACw=";

function buildShareCardHtml(
	memo: MemoEntry,
	style: MemoShareStyle,
	mode: "preview" | "image",
	contentHtml = renderMemoContentHtml(memo.content),
	resolvedTitle = style.title,
): string {
	const scale = mode === "preview" ? "memos-share-card-preview" : "memos-share-card-image";
	return [
		`<section class="memos-share-card ${scale}" style="--share-bg:${style.cardBackground};--share-text:${style.text};--share-muted:${style.muted};--share-accent:${style.accent};--share-border:${style.border};--share-shadow:${style.shadow};">`,
		"<div class=\"memos-share-card-body\">",
		`<div class="memos-share-card-brand">- ${escapeHtml(resolvedTitle)} -</div>`,
		"<div class=\"memos-share-card-rule\"></div>",
		`<article class="memos-share-card-content markdown-rendered">${contentHtml}</article>`,
		"<footer class=\"memos-share-card-footer\">",
		`<span>${escapeHtml(memo.dayKey)} ${escapeHtml(memo.createdLabel)}</span>`,
		`<span>${escapeHtml(memo.sourceBasename)}</span>`,
		"</footer>",
		"</div>",
		"</section>",
	].join("");
}

function renderMemoContentHtml(content: string): string {
	const lines = content.replace(/\r\n/g, "\n").trim().split("\n");
	const html: string[] = [];
	let listItems: string[] = [];
	let codeLines: string[] = [];
	let inCodeBlock = false;

	const flushList = (): void => {
		if (!listItems.length) {
			return;
		}
		html.push(`<ul>${listItems.join("")}</ul>`);
		listItems = [];
	};

	const flushCode = (): void => {
		if (!codeLines.length) {
			return;
		}
		html.push(`<pre>${escapeHtml(codeLines.join("\n"))}</pre>`);
		codeLines = [];
	};

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		if (line.trim().startsWith("```")) {
			if (inCodeBlock) {
				inCodeBlock = false;
				flushCode();
			} else {
				flushList();
				inCodeBlock = true;
			}
			continue;
		}

		if (inCodeBlock) {
			codeLines.push(line);
			continue;
		}

		if (!line.trim()) {
			flushList();
			continue;
		}

		const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
		if (headingMatch) {
			flushList();
			html.push(`<h3>${formatInlineText(headingMatch[2] ?? "")}</h3>`);
			continue;
		}

		const listMatch = line.match(/^[-*+]\s+(?:\[[ xX]\]\s*)?(.+)$/);
		if (listMatch) {
			listItems.push(`<li>${formatInlineText(listMatch[1] ?? "")}</li>`);
			continue;
		}

		flushList();
		if (line.startsWith(">")) {
			html.push(`<blockquote>${formatInlineText(line.replace(/^>\s?/, ""))}</blockquote>`);
		} else {
			html.push(`<p>${formatInlineText(line)}</p>`);
		}
	}

	flushList();
	flushCode();
	return html.join("");
}

function formatInlineText(value: string): string {
	return escapeHtml(value)
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/(^|\s)(#[A-Za-z0-9_/-]+)/g, "$1<span class=\"memos-share-tag\">$2</span>");
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}
