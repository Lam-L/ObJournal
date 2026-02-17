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

		// 5. 菜单按钮（三个点）- 右下角
		const menuButton = card.createDiv('journal-card-menu-button');
		menuButton.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="1"></circle>
				<circle cx="12" cy="5" r="1"></circle>
				<circle cx="12" cy="19" r="1"></circle>
			</svg>
		`;
		menuButton.setAttribute('aria-label', '更多选项');

		// 附加菜单按钮点击事件
		this.attachMenuHandler(menuButton, entry, card);

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
	 * 附加菜单按钮点击事件处理器
	 */
	private attachMenuHandler(menuButton: HTMLElement, entry: JournalEntry, card: HTMLElement): void {
		let menu: HTMLElement | null = null;

		menuButton.addEventListener('click', (e) => {
			e.stopPropagation(); // 阻止事件冒泡到卡片

			// 如果菜单已存在，关闭它
			if (menu) {
				menu.remove();
				menu = null;
				return;
			}

			// 创建悬浮菜单
			menu = document.createElement('div');
			menu.addClass('journal-card-menu');

			// 删除选项
			const deleteItem = menu.createDiv('journal-card-menu-item');
			deleteItem.innerHTML = `
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="3 6 5 6 21 6"></polyline>
					<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
				</svg>
				<span>删除</span>
			`;
			deleteItem.addEventListener('click', async (e) => {
				e.stopPropagation();
				await this.deleteEntry(entry, card);
				if (menu) {
					menu.remove();
					menu = null;
				}
			});

			// 将菜单添加到卡片中
			card.appendChild(menu);

			// 计算菜单位置（按钮上方，右下角对齐）
			// 按钮在右下角（bottom: 8px），菜单显示在按钮上方，距离按钮 8px
			// 按钮高度 32px + 间距 8px = 40px
			menu.style.bottom = '48px';
			menu.style.right = '8px';

			// 点击外部关闭菜单
			const closeMenu = (e: MouseEvent) => {
				if (menu && !menu.contains(e.target as Node) && !menuButton.contains(e.target as Node)) {
					menu.remove();
					menu = null;
					document.removeEventListener('click', closeMenu);
				}
			};

			// 延迟添加事件监听器，避免立即触发
			setTimeout(() => {
				document.addEventListener('click', closeMenu);
			}, 0);
		});
	}

	/**
	 * 删除条目
	 */
	private async deleteEntry(entry: JournalEntry, card: HTMLElement): Promise<void> {
		// 确认删除
		const confirmed = confirm(`确定要删除 "${entry.title || entry.file.basename}" 吗？\n\n此操作无法撤销。`);
		if (!confirmed) {
			return;
		}

		try {
			// 删除文件
			await this.app.vault.delete(entry.file);

			// 从 DOM 中移除卡片
			card.remove();
		} catch (error) {
			console.error('删除文件失败:', error);
			alert('删除文件失败，请重试。');
		}
	}

	/**
	 * 更新滚动容器引用
	 */
	setScrollContainer(scrollContainer: HTMLElement | null): void {
		this.scrollContainer = scrollContainer;
	}
}
