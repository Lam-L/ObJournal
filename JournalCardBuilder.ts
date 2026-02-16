import { App } from 'obsidian';
import { JournalEntry, formatDate } from './utils';
import { CONTENT } from './constants';
import { ImageLayoutBuilder } from './ImageLayoutBuilder';
import { ImageModal } from './ImageModal';

/**
 * 卡片构建器
 * 负责创建手记卡片
 */
export class JournalCardBuilder {
	private app: App;
	private scrollContainer: HTMLElement | null;
	private imageModal: ImageModal | null = null;

	constructor(app: App, scrollContainer: HTMLElement | null = null, imageModal: ImageModal | null = null) {
		this.app = app;
		this.scrollContainer = scrollContainer;
		this.imageModal = imageModal;
		// 设置 ImageLayoutBuilder 的图片查看器
		if (imageModal) {
			ImageLayoutBuilder.setImageModal(imageModal);
		}
	}

	/**
	 * 创建手记卡片
	 */
	async createJournalCard(entry: JournalEntry): Promise<HTMLElement> {
		const card = document.createElement('div');
		card.addClass('journal-card');

		// 1. 图片（懒加载）- 最先显示
		if (entry.images.length > 0) {
			const imagesEl = card.createDiv('journal-images');
			// 最多显示N张：1张左边 + 4张右边2x2网格
			const displayImages = entry.images.slice(0, CONTENT.MAX_IMAGES_PER_CARD);
			const totalImages = entry.images.length;

			// 使用 ImageLayoutBuilder 构建布局（传入所有图片用于全屏查看器）
			ImageLayoutBuilder.buildImageLayout(imagesEl, displayImages, totalImages, entry.images);
		}

		// 2. 标题
		if (entry.title) {
			const titleEl = card.createEl('h3', { cls: 'journal-title' });
			titleEl.textContent = entry.title;
		}

		// 3. 正文预览
		const contentEl = card.createDiv('journal-content');
		const previewEl = contentEl.createDiv('journal-preview');
		previewEl.textContent = entry.preview;

		// 4. 日期 - 最后显示
		const dateEl = card.createDiv('journal-date');
		dateEl.textContent = formatDate(entry.date);

		// 点击打开文件
		this.attachClickHandler(card, entry);

		card.setAttribute('data-file-path', entry.file.path);
		card.style.cursor = 'pointer';
		card.style.userSelect = 'none';

		return card;
	}

	/**
	 * 附加点击事件处理器
	 */
	private attachClickHandler(card: HTMLElement, entry: JournalEntry): void {
		card.addEventListener('click', (e) => {
			// 不阻止默认行为，让滚动正常工作
			// 只在点击卡片内容区域时打开文件
			if (e.target === card || card.contains(e.target as Node)) {
				// 检查是否在滚动
				if (this.scrollContainer) {
					const isScrolling = this.scrollContainer.scrollTop !== (this.scrollContainer as any)._lastScrollTop;
					(this.scrollContainer as any)._lastScrollTop = this.scrollContainer.scrollTop;

					// 如果刚刚滚动过，不打开文件
					if (isScrolling) {
						return;
					}
				}

				this.app.workspace.openLinkText(entry.file.path, '', true);
			}
		});
	}

	/**
	 * 更新滚动容器引用
	 */
	setScrollContainer(scrollContainer: HTMLElement | null): void {
		this.scrollContainer = scrollContainer;
	}
}
