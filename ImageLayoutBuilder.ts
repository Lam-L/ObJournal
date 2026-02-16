import { ImageInfo } from './utils';
import { CONTENT, IMAGE_LOADING } from './constants';
import { ImageModal } from './ImageModal';

/**
 * 图片布局构建器
 * 负责根据图片数量创建不同的布局结构
 */
export class ImageLayoutBuilder {
	private static imageModal: ImageModal | null = null;

	/**
	 * 设置图片查看器实例
	 */
	static setImageModal(modal: ImageModal): void {
		this.imageModal = modal;
	}
	/**
	 * 创建懒加载图片
	 */
	static createLazyImage(image: ImageInfo, container: HTMLElement, allImages: ImageInfo[] = [], imageIndex: number = 0): HTMLImageElement {
		const img = document.createElement('img');
		img.alt = image.altText || image.name;
		img.addClass('journal-image');
		img.loading = 'lazy';
		img.decoding = 'async';

		// 添加点击事件：打开全屏查看器
		img.style.cursor = 'pointer';
		img.addEventListener('click', (e) => {
			e.stopPropagation(); // 阻止事件冒泡到卡片
			if (this.imageModal && allImages.length > 0) {
				// 找到当前图片在所有图片中的索引
				const currentIndex = allImages.findIndex(img => img.path === image.path);
				this.imageModal.show(allImages, currentIndex >= 0 ? currentIndex : imageIndex);
			}
		});

		// 使用 Intersection Observer 实现懒加载
		const imageObserver = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					img.src = image.url;
					imageObserver.unobserve(img);
				}
			});
		}, { rootMargin: IMAGE_LOADING.ROOT_MARGIN });

		imageObserver.observe(img);
		container.appendChild(img);
		return img;
	}

	/**
	 * 根据图片数量构建布局
	 * @param imagesEl 图片容器元素
	 * @param displayImages 要显示的图片列表
	 * @param totalImages 总图片数（用于显示 "+N"）
	 * @param allImages 所有图片列表（用于全屏查看器）
	 */
	static buildImageLayout(
		imagesEl: HTMLElement,
		displayImages: ImageInfo[],
		totalImages: number,
		allImages: ImageInfo[] = displayImages
	): void {
		const imageCount = displayImages.length;

		// 根据图片数量添加不同的布局类
		if (imageCount === 1) {
			imagesEl.addClass('journal-images-single');
		} else if (imageCount === 2) {
			imagesEl.addClass('journal-images-double');
		} else if (imageCount === 3) {
			imagesEl.addClass('journal-images-triple');
		} else if (imageCount === 4) {
			imagesEl.addClass('journal-images-quad');
		} else if (imageCount >= 5) {
			imagesEl.addClass('journal-images-multiple');
		}

		// 根据不同图片数量创建对应的布局结构
		if (imageCount === 4) {
			this.buildQuadLayout(imagesEl, displayImages, allImages);
		} else if (imageCount >= 5) {
			this.buildMultipleLayout(imagesEl, displayImages, totalImages, allImages);
		} else {
			this.buildSimpleLayout(imagesEl, displayImages, imageCount, allImages);
		}
	}

	/**
	 * 构建四张图片的布局：左半边一张大图，右半边三张（上1下2左右）
	 */
	private static buildQuadLayout(imagesEl: HTMLElement, displayImages: ImageInfo[], allImages: ImageInfo[]): void {
		// 第一张：左半边大图
		const imgContainer1 = imagesEl.createDiv('journal-image-container journal-image-container-quad-left');
		this.createLazyImage(displayImages[0], imgContainer1, allImages, 0);

		// 第二张：右半边上半部分
		const imgContainer2 = imagesEl.createDiv('journal-image-container journal-image-container-quad-right-top');
		this.createLazyImage(displayImages[1], imgContainer2, allImages, 1);

		// 右半边下半部分：创建包装器
		const rightBottomWrapper = imagesEl.createDiv('journal-images-quad-right-bottom');
		// 第三张：右半边下半部分左侧
		const imgContainer3 = rightBottomWrapper.createDiv('journal-image-container journal-image-container-quad-right-bottom-left');
		this.createLazyImage(displayImages[2], imgContainer3, allImages, 2);
		// 第四张：右半边下半部分右侧
		const imgContainer4 = rightBottomWrapper.createDiv('journal-image-container journal-image-container-quad-right-bottom-right');
		this.createLazyImage(displayImages[3], imgContainer4, allImages, 3);
	}

	/**
	 * 构建五张或更多图片的布局：左边一张大正方形，右边2x2网格
	 */
	private static buildMultipleLayout(
		imagesEl: HTMLElement,
		displayImages: ImageInfo[],
		totalImages: number,
		allImages: ImageInfo[]
	): void {
		// 第一张：左边大正方形
		const imgContainer1 = imagesEl.createDiv('journal-image-container journal-image-container-large');
		this.createLazyImage(displayImages[0], imgContainer1, allImages, 0);

		// 右边2x2网格：创建包装器
		const rightGridWrapper = imagesEl.createDiv('journal-images-multiple-right-grid');
		// 第二、三、四、五张图片
		for (let i = 1; i < displayImages.length; i++) {
			const imgContainer = rightGridWrapper.createDiv('journal-image-container journal-image-container-small');
			this.createLazyImage(displayImages[i], imgContainer, allImages, i);

			// 如果超过最大显示数，在最后一张显示的图片上显示 "+N"
			if (totalImages > CONTENT.MAX_IMAGES_PER_CARD && i === CONTENT.MAX_IMAGES_PER_CARD - 1) {
				const moreEl = imgContainer.createDiv('journal-image-more');
				moreEl.textContent = `+${totalImages - CONTENT.MAX_IMAGES_PER_CARD}`;
				moreEl.style.cssText = `
					position: absolute !important;
					top: 0 !important;
					left: 0 !important;
					right: 0 !important;
					bottom: 0 !important;
					display: flex !important;
					align-items: center !important;
					justify-content: center !important;
					background: rgba(0, 0, 0, 0.6) !important;
					color: white !important;
					font-size: 24px !important;
					font-weight: 600 !important;
					pointer-events: none !important;
					z-index: 10 !important;
					border-radius: 8px !important;
				`;
			}
		}
	}

	/**
	 * 构建简单布局（1-3张图片）
	 */
	private static buildSimpleLayout(
		imagesEl: HTMLElement,
		displayImages: ImageInfo[],
		imageCount: number,
		allImages: ImageInfo[]
	): void {
		for (let i = 0; i < displayImages.length; i++) {
			const image = displayImages[i];
			const imgContainer = imagesEl.createDiv('journal-image-container');

			// 为不同布局添加类
			if (imageCount === 3) {
				if (i === 0) {
					imgContainer.addClass('journal-image-container-large');
				} else {
					imgContainer.addClass('journal-image-container-small');
				}
			}

			this.createLazyImage(image, imgContainer, allImages, i);
		}
	}
}
