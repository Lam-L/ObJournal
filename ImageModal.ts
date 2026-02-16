import { App } from 'obsidian';
import { ImageInfo } from './utils';
import { logger } from './logger';

/**
 * 图片全屏查看器
 * 支持全屏查看和图片轮播
 */
export class ImageModal {
	private app: App;
	private overlay: HTMLElement | null = null;
	private currentIndex: number = 0;
	private images: ImageInfo[] = [];
	private isVisible: boolean = false;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 显示图片查看器
	 * @param images 所有图片列表
	 * @param startIndex 起始图片索引
	 */
	show(images: ImageInfo[], startIndex: number = 0): void {
		if (images.length === 0) return;

		this.images = images;
		this.currentIndex = Math.max(0, Math.min(startIndex, images.length - 1));
		this.isVisible = true;

		this.createModal();
		this.renderCurrentImage();
		this.attachEventListeners();

		// 添加到 body
		document.body.appendChild(this.overlay!);
		// 防止背景滚动
		document.body.style.overflow = 'hidden';

		logger.debug('[ImageModal] 显示图片查看器', {
			total: images.length,
			current: this.currentIndex
		});
	}

	/**
	 * 创建模态框结构
	 */
	private createModal(): void {
		// 如果已存在，先移除
		if (this.overlay) {
			this.overlay.remove();
		}

		this.overlay = document.createElement('div');
		this.overlay.addClass('journal-image-modal-overlay');

		// 关闭按钮
		const closeBtn = this.overlay.createEl('button', {
			cls: 'journal-image-modal-close',
			attr: { 'aria-label': '关闭' }
		});
		closeBtn.innerHTML = '×';
		closeBtn.addEventListener('click', () => this.hide());

		// 图片容器
		const imageContainer = this.overlay.createDiv('journal-image-modal-container');

		// 左侧导航按钮（多张图片时显示）
		if (this.images.length > 1) {
			const prevBtn = imageContainer.createEl('button', {
				cls: 'journal-image-modal-nav journal-image-modal-prev',
				attr: { 'aria-label': '上一张' }
			});
			prevBtn.innerHTML = '‹';
			prevBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.showPrevious();
			});
		}

		// 图片显示区域
		const imageWrapper = imageContainer.createDiv('journal-image-modal-wrapper');
		const img = imageWrapper.createEl('img', {
			cls: 'journal-image-modal-image'
		});
		img.alt = this.images[this.currentIndex]?.name || '';

		// 图片信息（可选）
		if (this.images.length > 1) {
			const imageInfo = imageWrapper.createDiv('journal-image-modal-info');
			imageInfo.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
		}

		// 右侧导航按钮（多张图片时显示）
		if (this.images.length > 1) {
			const nextBtn = imageContainer.createEl('button', {
				cls: 'journal-image-modal-nav journal-image-modal-next',
				attr: { 'aria-label': '下一张' }
			});
			nextBtn.innerHTML = '›';
			nextBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.showNext();
			});
		}
	}

	/**
	 * 渲染当前图片
	 */
	private renderCurrentImage(): void {
		if (!this.overlay) return;

		const img = this.overlay.querySelector('.journal-image-modal-image') as HTMLImageElement;
		const info = this.overlay.querySelector('.journal-image-modal-info') as HTMLElement;

		if (!img) return;

		const currentImage = this.images[this.currentIndex];
		if (!currentImage) return;

		// 显示加载状态
		img.style.opacity = '0.5';
		img.src = currentImage.url;
		img.alt = currentImage.altText || currentImage.name;

		// 图片加载完成后恢复透明度
		img.onload = () => {
			img.style.opacity = '1';
		};

		// 更新图片信息
		if (info && this.images.length > 1) {
			info.textContent = `${this.currentIndex + 1} / ${this.images.length}`;
		}

		// 更新导航按钮状态
		this.updateNavButtons();
	}

	/**
	 * 更新导航按钮状态
	 */
	private updateNavButtons(): void {
		if (!this.overlay) return;

		const prevBtn = this.overlay.querySelector('.journal-image-modal-prev') as HTMLElement;
		const nextBtn = this.overlay.querySelector('.journal-image-modal-next') as HTMLElement;

		if (prevBtn) {
			prevBtn.style.opacity = this.currentIndex === 0 ? '0.3' : '1';
			prevBtn.style.pointerEvents = this.currentIndex === 0 ? 'none' : 'auto';
		}

		if (nextBtn) {
			nextBtn.style.opacity = this.currentIndex === this.images.length - 1 ? '0.3' : '1';
			nextBtn.style.pointerEvents = this.currentIndex === this.images.length - 1 ? 'none' : 'auto';
		}
	}

	/**
	 * 显示上一张图片
	 */
	private showPrevious(): void {
		if (this.currentIndex > 0) {
			this.currentIndex--;
			this.renderCurrentImage();
		}
	}

	/**
	 * 显示下一张图片
	 */
	private showNext(): void {
		if (this.currentIndex < this.images.length - 1) {
			this.currentIndex++;
			this.renderCurrentImage();
		}
	}

	/**
	 * 附加事件监听器
	 */
	private attachEventListeners(): void {
		if (!this.overlay) return;

		// 点击背景关闭
		this.overlay.addEventListener('click', (e) => {
			if (e.target === this.overlay) {
				this.hide();
			}
		});

		// ESC 键关闭
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				this.hide();
			} else if (e.key === 'ArrowLeft' && this.images.length > 1) {
				this.showPrevious();
			} else if (e.key === 'ArrowRight' && this.images.length > 1) {
				this.showNext();
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		// 保存处理器引用以便清理
		(this.overlay as any)._keydownHandler = handleKeyDown;
	}

	/**
	 * 隐藏图片查看器
	 */
	hide(): void {
		if (!this.overlay) return;

		// 移除键盘事件监听器
		const handler = (this.overlay as any)?._keydownHandler;
		if (handler) {
			document.removeEventListener('keydown', handler);
		}

		// 移除模态框
		this.overlay.remove();
		this.overlay = null;

		// 恢复背景滚动
		document.body.style.overflow = '';

		this.isVisible = false;
		logger.debug('[ImageModal] 隐藏图片查看器');
	}

	/**
	 * 检查是否可见
	 */
	getVisible(): boolean {
		return this.isVisible;
	}
}
