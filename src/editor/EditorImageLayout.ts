import { App, MarkdownPostProcessorContext, MarkdownView, TFile } from 'obsidian';
import { strings } from '../i18n';

/**
 * Editor image layout in Live Preview (edit mode).
 * Notes in the default folder display images in the same layout as journal cards (1/2/3/4/5+ images).
 * Real-time: re-renders automatically when adding/removing images.
 * Reading mode uses native Obsidian rendering.
 * Images > 5 are split into multiple galleries.
 */
const MAX_IMAGES_PER_GALLERY = 5;

export class EditorImageLayout {
	private app: App;
	private plugin: { settings: any; registerEvent: (e: any) => void; registerMarkdownPostProcessor: (p: any) => any };
	private isProcessing = false;
	private lastProcessedTime = 0;
	private readonly PROCESS_COOLDOWN = 80;
	private scheduleTimeouts: number[] = [];
	private editorObserver: MutationObserver | null = null;
	private observedEditorEl: HTMLElement | null = null;
	private pollIntervalId: number | null = null;

	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}

	/** Schedule retries with multiple delays to handle Obsidian's async rendering */
	private scheduleProcessWithRetries(): void {
		this.cancelScheduledProcess();
		const delays = [30, 100, 250, 500, 900];
		delays.forEach((delay) => {
			const id = window.setTimeout(() => {
				this.scheduleTimeouts = this.scheduleTimeouts.filter((t) => t !== id);
				this.processActiveEditor();
			}, delay);
			this.scheduleTimeouts.push(id);
		});
	}

	private cancelScheduledProcess(): void {
		this.scheduleTimeouts.forEach((id) => window.clearTimeout(id));
		this.scheduleTimeouts = [];
	}

	initialize(): void {
		// 1. Markdown post-processor
		this.plugin.registerMarkdownPostProcessor((element: HTMLElement, context: MarkdownPostProcessorContext) => {
			this.processMarkdownImages(element, context);
		});

		// 2. Poll every 200ms to process all relevant Markdown views
		this.pollIntervalId = window.setInterval(() => {
			this.processAllRelevantViews();
		}, 200);

		// 3. Event triggers
		this.plugin.registerEvent(this.app.workspace.on('editor-change', () => this.scheduleProcessWithRetries()));
		this.plugin.registerEvent(this.app.workspace.on('file-open', () => this.scheduleProcessWithRetries()));
		this.plugin.registerEvent(this.app.workspace.on('layout-change', () => this.scheduleProcessWithRetries()));

		// 4. MutationObserver
		this.setupMutationObserver();
	}

	destroy(): void {
		this.cancelScheduledProcess();
		this.stopObservingEditor();
		if (this.pollIntervalId !== null) {
			window.clearInterval(this.pollIntervalId);
			this.pollIntervalId = null;
		}
	}

	private shouldProcessFile(filePath: string | null | undefined): boolean {
		const settings = this.plugin.settings;
		if (!settings?.defaultFolderPath) return false;
		if (!filePath) return false;

		const defaultFolderPath = settings.defaultFolderPath as string;
		const enableLayout = settings.enableEditorImageLayout !== false; // default on

		if (!enableLayout) return false;

		return filePath === defaultFolderPath || filePath.startsWith(defaultFolderPath + '/');
	}

	private isValidImage(img: HTMLImageElement): boolean {
		if (!img.src) return false;
		if (img.src.startsWith('data:image/svg+xml') || img.src.startsWith('data:image/gif;base64,R0lGOD'))
			return false;
		if (img.src.trim() === '' || img.src === 'about:blank') return false;

		const isValid = img.src.startsWith('app://') || img.src.startsWith('http') || img.src.startsWith('file://');
		const hasExt = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(img.src);
		const hasAlt = (img.getAttribute('alt') || '').trim() !== '';

		return isValid || hasExt || hasAlt;
	}

	private setupMutationObserver(): void {
		// Listen for active-leaf change to observe current editor DOM
		this.plugin.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.attachEditorObserver();
			})
		);
		// Attach on init
		this.attachEditorObserver();

		// Fallback: observe document.body when editor structure changes and observer may miss it
		// Ignore changes inside journal-view-container to avoid focus issues when journal list refreshes
		let debounceId: number | null = null;
		const bodyObserver = new MutationObserver((mutations: MutationRecord[]) => {
			const fromJournalView = mutations.some((m) => {
				const el = m.target.nodeType === Node.ELEMENT_NODE ? (m.target as Element) : m.target.parentElement;
				return el?.closest?.('.journal-view-container') != null;
			});
			if (fromJournalView) return;

			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view?.file || view.getMode() !== 'source' || !this.shouldProcessFile(view.file.path)) return;

			if (debounceId) clearTimeout(debounceId);
			debounceId = window.setTimeout(() => {
				debounceId = null;
				this.scheduleProcessWithRetries();
			}, 30);
		});
		bodyObserver.observe(document.body, { childList: true, subtree: true });
	}

	/** Observe current editor contentEl, process immediately on DOM change (edit mode only) */
	private attachEditorObserver(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.file) {
			this.stopObservingEditor();
			return;
		}
		if (view.getMode() !== 'source' || !this.shouldProcessFile(view.file.path)) {
			this.stopObservingEditor();
			return;
		}

		const editorEl = view.contentEl;
		if (!editorEl || editorEl === this.observedEditorEl) return;

		this.stopObservingEditor();

		this.editorObserver = new MutationObserver(() => {
			// Process next frame to allow DOM to finish updating
			requestAnimationFrame(() => {
				setTimeout(() => this.processActiveEditor(), 0);
			});
		});

		this.editorObserver.observe(editorEl, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['src', 'class'],
		});
		this.observedEditorEl = editorEl;
	}

	private stopObservingEditor(): void {
		if (this.editorObserver && this.observedEditorEl) {
			this.editorObserver.disconnect();
			this.editorObserver = null;
			this.observedEditorEl = null;
		}
	}

	/** Poll: only process edit mode (Live Preview), reading mode does not use gallery */
	private processAllRelevantViews(): void {
		if (this.isProcessing) return;

		this.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (!(view instanceof MarkdownView) || !view.file) return;
			if (view.getMode() !== 'source') return;
			if (!this.shouldProcessFile(view.file.path)) return;

			const sourceEl = this.getSourceViewContainer(view.contentEl);
			if (!sourceEl) return;

			this.processElement(sourceEl);
		});
	}

	/** Get markdown-source-view container, avoid processing reading-mode images (journal-preview-image) which would cause duplicates */
	private getSourceViewContainer(contentEl: HTMLElement | undefined): HTMLElement | null {
		if (!contentEl) return null;
		// contentEl contains both source + reading, only process source to avoid image duplicates on view switch
		const source = contentEl.querySelector('.markdown-source-view') as HTMLElement | null;
		return source ?? contentEl;
	}

	/** Process images within a single container */
	private processElement(containerEl: HTMLElement): void {
		if (this.isProcessing) return;

		this.updateExistingGalleries(containerEl);

		const images = Array.from(containerEl.querySelectorAll('img')).filter(
			(img) =>
				!img.classList.contains('journal-editor-processed') &&
				!img.classList.contains('journal-preview-image') &&
				!img.closest('.journal-images') &&
				!img.closest('.markdown-reading-view') &&
				this.isValidImage(img as HTMLImageElement)
		);

		if (images.length === 0) return;

		const now = Date.now();
		if (now - this.lastProcessedTime < this.PROCESS_COOLDOWN) return;

		this.isProcessing = true;
		this.lastProcessedTime = Date.now();

		try {
			const groups = this.groupConsecutiveImages(images as HTMLImageElement[]);
			groups.forEach((group) => this.wrapImageGroup(group as HTMLImageElement[], containerEl));
		} finally {
			this.isProcessing = false;
		}
	}

	private processActiveEditor(): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.file || !this.shouldProcessFile(view.file.path)) return;
		if (view.getMode() !== 'source') return;

		const sourceEl = this.getSourceViewContainer(view.contentEl);
		if (!sourceEl) return;

		this.processElement(sourceEl);
	}

	private updateExistingGalleries(editorEl: HTMLElement): void {
		const galleries = Array.from(editorEl.querySelectorAll('.journal-images')) as HTMLElement[];

		// 1. Merge adjacent galleries (e.g. two journal-images-single on same line → journal-images-double)
		this.mergeAdjacentGalleries(editorEl);

		// 2. Remove empty galleries
		const galleriesAfterMerge = Array.from(editorEl.querySelectorAll('.journal-images')) as HTMLElement[];
		galleriesAfterMerge.forEach((gallery) => {
			const imgs = gallery.querySelectorAll('img.journal-editor-processed');
			if (imgs.length === 0) {
				gallery.closest('.internal-embed')?.remove();
				gallery.remove();
			}
		});
	}

	/** Merge adjacent journal-images (e.g. two singles → one double); skip if merged count > 5 to avoid merge→split loop */
	private mergeAdjacentGalleries(scope: HTMLElement): void {
		const galleries = Array.from(scope.querySelectorAll('.journal-images')) as HTMLElement[];
		if (galleries.length < 2) return;

		// Sort by DOM order
		galleries.sort((a, b) => {
			const pos = a.compareDocumentPosition(b);
			return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
		});

		for (let i = 0; i < galleries.length - 1; i++) {
			const g1 = galleries[i];
			const g2 = galleries[i + 1];
			if (!g1.isConnected || !g2.isConnected) continue;
			if (!this.areGalleriesAdjacent(g1, g2)) continue;

			const imgs1 = Array.from(g1.querySelectorAll('img.journal-editor-processed')) as HTMLImageElement[];
			const imgs2 = Array.from(g2.querySelectorAll('img.journal-editor-processed')) as HTMLImageElement[];
			const allImgs = [...imgs1, ...imgs2];

			// Skip if > 5 to avoid merge→split loop with gallery splitting causing DOM jitter
			if (allImgs.length > MAX_IMAGES_PER_GALLERY) continue;

			g1.className = 'journal-images ' + this.getLayoutClass(allImgs.length);
			g1.innerHTML = '';
			this.organizeImagesInContainer(allImgs, g1);
			g2.remove();
			galleries.splice(i + 1, 1);
			i--;
		}
	}

	/** Whether two galleries are adjacent (no substantial content between them) */
	private areGalleriesAdjacent(g1: HTMLElement, g2: HTMLElement): boolean {
		const p1 = g1.closest('.internal-embed, .cm-line, p');
		const p2 = g2.closest('.internal-embed, .cm-line, p');
		if (!p1 || !p2) return false;
		if (p1 === p2) return true;

		// p1 and p2 are siblings, or p2 is in p1's nextSibling chain
		let cur: Element | null = p1.nextElementSibling;
		while (cur) {
			if (cur === p2) return true;
			if (!this.isImageOnlyBlock(cur as HTMLElement)) break;
			cur = cur.nextElementSibling;
		}
		return false;
	}

	/** Find existing gallery adjacent to given image (new images can merge into it) */
	private findAdjacentGallery(img: HTMLImageElement, scope: HTMLElement): HTMLElement | null {
		let el: Element | null = img.parentElement;
		while (el && scope.contains(el)) {
			let sibling: Element | null = el.previousElementSibling;
			while (sibling) {
				if (sibling.classList.contains('journal-images')) return sibling as HTMLElement;
				if (sibling.querySelector('.journal-images')) {
					return sibling.querySelector('.journal-images') as HTMLElement;
				}
				if (!this.isImageOnlyBlock(sibling as HTMLElement)) break;
				sibling = sibling.previousElementSibling;
			}
			el = el.parentElement;
			if (el?.classList.contains('cm-content')) break;
		}
		return null;
	}

	/** Merge new images into existing gallery and rebuild layout; split into multiple galleries when > 5 */
	private addImagesToExistingGallery(newImages: HTMLImageElement[], gallery: HTMLElement): void {
		const existingImgs = Array.from(gallery.querySelectorAll('img.journal-editor-processed')) as HTMLImageElement[];
		const allImages = [...existingImgs, ...newImages];

		if (allImages.length <= MAX_IMAGES_PER_GALLERY) {
			gallery.className = 'journal-images ' + this.getLayoutClass(allImages.length);
			gallery.innerHTML = '';
			this.organizeImagesInContainer(allImages, gallery);
			return;
		}

		const chunks = this.chunkImages(allImages, MAX_IMAGES_PER_GALLERY);
		const parent = gallery.parentElement;
		if (!parent) return;

		// Put first chunk in existing gallery
		gallery.className = 'journal-images ' + this.getLayoutClass(chunks[0].length);
		gallery.innerHTML = '';
		this.organizeImagesInContainer(chunks[0], gallery);

		// Create new galleries for remaining chunks, insert after current gallery
		let insertBefore: ChildNode | null = gallery.nextSibling;
		for (let i = 1; i < chunks.length; i++) {
			const chunk = chunks[i];
			const refImg = chunk[0];
			const container = document.createElement('div');
			container.addClasses(['journal-images', this.getLayoutClass(chunk.length)]);

			try {
				if (insertBefore && insertBefore.parentNode === parent) {
					parent.insertBefore(container, insertBefore);
				} else {
					parent.appendChild(container);
				}
			} catch {
				parent.appendChild(container);
			}
			this.organizeImagesInContainer(chunk, container);
			insertBefore = container.nextSibling; // Next insert after newly created container
		}
	}

	private groupConsecutiveImages(images: HTMLImageElement[]): HTMLImageElement[][] {
		const groups: HTMLImageElement[][] = [];
		let current: HTMLImageElement[] = [];

		images.forEach((img) => {
			if (
				current.length === 0 ||
				this.areImagesConsecutive(current[current.length - 1], img)
			) {
				current.push(img);
			} else {
				if (current.length > 0) groups.push(current);
				current = [img];
			}
		});
		if (current.length > 0) groups.push(current);
		return groups;
	}

	private areImagesConsecutive(img1: HTMLImageElement, img2: HTMLImageElement): boolean {
		// Strategy 1: Same paragraph/block (e.g. ![[a]] ![[b]] on same line)
		const p1 = img1.closest('p');
		const p2 = img2.closest('p');
		if (p1 && p2 && p1 === p2) return true;
		if (img1.parentElement === img2.parentElement) return true;

		// Strategy 2: Adjacent blocks (e.g. ![[a]] and ![[b]] on separate lines)
		// In Obsidian each line may be p, .cm-line, or parent of .internal-embed
		const block1 = img1.closest('p, .cm-line, .cm-block, .internal-embed');
		const block2 = img2.closest('p, .cm-line, .cm-block, .internal-embed');
		if (!block1 || !block2) return false;
		if (block1 === block2) return true;

		// Walk up from block1, check if block2 is in block1's nextSibling path
		let el: Element | null = block1;
		while (el) {
			let next: Element | null = el.nextElementSibling;
			while (next) {
				if (next === block2 || next.contains(block2) || block2.contains(next)) return true;
				// Continue if only empty nodes or image-only containers in between
				if (this.isImageOnlyBlock(next as HTMLElement)) {
					next = next.nextElementSibling;
					continue;
				}
				// Non-image content in between, not consecutive
				break;
			}
			el = el.parentElement;
		}
		return false;
	}

	/** Whether element is image/embed only with no substantial text */
	private isImageOnlyBlock(el: HTMLElement): boolean {
		if (!el) return true;
		const text = (el.textContent || '').trim();
		if (text.length > 0) {
			// Exclude minor text from alt etc., focus on non-img substantial content
			const imgs = el.querySelectorAll('img');
			const imgTextLen = Array.from(imgs).reduce((s, i) => s + (i.alt?.length || 0), 0);
			if (text.length > imgTextLen + 2) return false;
		}
		return true;
	}

	private processMarkdownImages(element: HTMLElement, context: MarkdownPostProcessorContext): void {
		if (!this.shouldProcessFile(context.sourcePath)) return;

		// Reading mode: Obsidian may produce empty internal-embed span (no img child), inject img manually
		this.fixEmptyImageSpansInPreview(element, context);
	}

	/**
	 * In reading mode, Obsidian may render empty image-embed span without img child.
	 * Fix display by parsing src/alt, resolving vault path, and creating img.
	 */
	private fixEmptyImageSpansInPreview(
		element: HTMLElement,
		context: MarkdownPostProcessorContext
	): void {
		const spans = element.querySelectorAll(
			'.internal-embed.media-embed.image-embed:not(.journal-preview-image-fixed)'
		);

		for (const span of Array.from(spans)) {
			if (span.querySelector('img')) continue;

			const src = (span.getAttribute('src') || span.getAttribute('alt') || '').trim();
			if (!src) continue;

			const imageFile = this.app.metadataCache.getFirstLinkpathDest(
				src,
				context.sourcePath
			);
			if (!(imageFile instanceof TFile)) continue;

			const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
			if (!imageExtensions.includes(imageFile.extension.toLowerCase())) continue;

			try {
				const resourcePath = this.app.vault.getResourcePath(imageFile);
				const img = document.createElement('img');
				img.src = resourcePath;
				img.alt = span.getAttribute('alt') || imageFile.basename;
				img.loading = 'lazy';
				img.decoding = 'async';
				img.addClass('journal-preview-image');
				span.appendChild(img);
				span.addClass('journal-preview-image-fixed');
			} catch {
				// Ignore parse failure
			}
		}
	}

	private wrapImageGroup(images: HTMLImageElement[], editorEl?: HTMLElement): void {
		if (images.length === 0) return;
		for (const img of images) {
			if (img.closest('.journal-images') || img.classList.contains('journal-editor-processed')) return;
		}

		const firstImg = images[0];
		// Prefer merging into adjacent existing gallery
		if (editorEl) {
			const adjacentGallery = this.findAdjacentGallery(firstImg, editorEl);
			if (adjacentGallery) {
				this.addImagesToExistingGallery(images, adjacentGallery);
				return;
			}
		}

		// Split into multiple galleries when > 5 to keep all images visible
		const chunks = this.chunkImages(images, MAX_IMAGES_PER_GALLERY);

		for (let i = 0; i < chunks.length; i++) {
			const chunk = chunks[i];
			const refImg = chunk[0]; // Reference node for insert position (saved before organizing since nodes move)
			const parent = refImg.parentElement;
			if (!parent) continue;

			const container = document.createElement('div');
			container.addClasses(['journal-images', this.getLayoutClass(chunk.length)]);

			// Insert empty container first (before moving nodes to avoid insertBefore ref becoming invalid)
			try {
				parent.insertBefore(container, refImg);
			} catch {
				parent.appendChild(container);
			}

			this.organizeImagesInContainer(chunk, container);
		}
	}

	/** Split image array into chunks of maxPer each */
	private chunkImages(images: HTMLImageElement[], maxPer: number): HTMLImageElement[][] {
		const chunks: HTMLImageElement[][] = [];
		for (let i = 0; i < images.length; i += maxPer) {
			chunks.push(images.slice(i, i + maxPer));
		}
		return chunks;
	}

	private getLayoutClass(count: number): string {
		if (count === 1) return 'journal-images-single';
		if (count === 2) return 'journal-images-double';
		if (count === 3) return 'journal-images-triple';
		if (count === 4) return 'journal-images-quad';
		return 'journal-images-multiple';
	}

	/**
	 * Organize images by JournalImageContainer layout
	 * Caller ensures max 5 images per batch (when split into multiple galleries)
	 */
	private organizeImagesInContainer(images: HTMLImageElement[], container: HTMLElement): void {
		const count = Math.min(images.length, MAX_IMAGES_PER_GALLERY);
		const moreCount = images.length > MAX_IMAGES_PER_GALLERY ? images.length - MAX_IMAGES_PER_GALLERY : 0;

		const createWrapper = (img: HTMLImageElement, className: string, showMore?: number): HTMLElement => {
			const wrap = document.createElement('div');
			wrap.addClass('journal-image-container');
			if (className) wrap.addClass(className);
			img.classList.add('journal-editor-processed');
			img.addClass('journal-image');
			img.style.width = '100%';
			img.style.height = '100%';
			img.style.objectFit = 'cover';
			wrap.appendChild(img);

			// Delete button (top-right)
			const deleteBtn = document.createElement('button');
			deleteBtn.addClass('journal-editor-image-delete');
			deleteBtn.innerHTML =
				'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
			deleteBtn.title = strings.editor.deleteImage;
			deleteBtn.onclick = (e) => {
				e.stopPropagation();
				e.preventDefault();
				this.deleteImageFromSource(img);
			};
			wrap.appendChild(deleteBtn);

			if (showMore !== undefined && showMore > 0) {
				const more = document.createElement('div');
				more.addClass('journal-image-more');
				more.textContent = '+' + showMore;
				wrap.appendChild(more);
			}
			return wrap;
		};

		if (count === 1) {
			container.appendChild(createWrapper(images[0], '', moreCount));
			return;
		}

		if (count === 2) {
			container.appendChild(createWrapper(images[0], ''));
			container.appendChild(createWrapper(images[1], '', moreCount));
			return;
		}

		if (count === 3) {
			container.appendChild(createWrapper(images[0], 'journal-image-container-large'));
			container.appendChild(createWrapper(images[1], 'journal-image-container-small'));
			container.appendChild(createWrapper(images[2], 'journal-image-container-small', moreCount));
			return;
		}

		if (count === 4) {
			container.appendChild(createWrapper(images[0], 'journal-image-container-quad-left'));
			container.appendChild(createWrapper(images[1], 'journal-image-container-quad-right-top'));
			const bottom = document.createElement('div');
			bottom.addClass('journal-images-quad-right-bottom');
			bottom.appendChild(createWrapper(images[2], 'journal-image-container-quad-right-bottom-left'));
			bottom.appendChild(createWrapper(images[3], 'journal-image-container-quad-right-bottom-right', moreCount));
			container.appendChild(bottom);
			return;
		}

		// 5+
		container.appendChild(createWrapper(images[0], 'journal-image-container-large'));
		const rightGrid = document.createElement('div');
		rightGrid.addClass('journal-images-multiple-right-grid');
		for (let i = 1; i < 5; i++) {
			rightGrid.appendChild(
				createWrapper(images[i], 'journal-image-container-small', i === 4 ? moreCount : undefined)
			);
		}
		container.appendChild(rightGrid);
	}

	/** Remove the image reference from Markdown source and update DOM immediately */
	private deleteImageFromSource(img: HTMLImageElement): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.editor || !view.contentEl?.contains(img)) return;

		const editor = view.editor;
		const content = editor.getValue();
		const lines = content.split('\n');

		// Extract filename from img alt or src
		const alt = (img.getAttribute('alt') || '').trim();
		const src = img.getAttribute('src') || '';
		const fileName = alt || this.extractFileNameFromSrc(src);
		if (!fileName) return;

		const escapedName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const patterns = [
			new RegExp(`!\\[\\[${escapedName}(\\|[^\\]]*)?\\]\\]`),
			new RegExp(`!\\[([^\\]]*)\\]\\([^)]*${escapedName}[^)]*\\)`),
			new RegExp(`\\[([^\\]]*)\\]\\([^)]*${escapedName}[^)]*\\)`),
			new RegExp(`!?\\[\\[${escapedName}\\]\\]`),
		];

		// Find line index containing this image reference
		let lineIndex = -1;
		let matchingPattern: RegExp | null = null;
		for (let i = 0; i < lines.length; i++) {
			const p = patterns.find((pat) => pat.test(lines[i]));
			if (p) {
				lineIndex = i;
				matchingPattern = p;
				break;
			}
		}
		if (lineIndex < 0 || !matchingPattern) return;

		// Same line may have multiple images (e.g. ![[a]] ![[b]]), only remove this image's reference, not the whole line
		const lineContent = lines[lineIndex];
		const newLineContent = lineContent
			.replace(matchingPattern, '')
			.replace(/\s+/g, ' ')
			.trim();

		// Only migrate when deleting the "first" image in gallery: gallery is always in the first embed,
		// deleting first removes that embed; deleting 2nd+ does not (deleted one is in another embed).
		const gallery = img.closest('.journal-images') as HTMLElement | null;
		const remainingImgs = gallery
			? (Array.from(gallery.querySelectorAll('img.journal-editor-processed')).filter(
					(el) => el !== img
			  ) as HTMLImageElement[])
			: [];

		const firstImgInGallery = gallery?.querySelector('img.journal-editor-processed');
		const needMoveFirst =
			!!gallery &&
			!!firstImgInGallery &&
			img === firstImgInGallery &&
			remainingImgs.length >= 1;

		let domUpdatedByMove = false;
		if (needMoveFirst) {
			const galleryParentEmbed = gallery!.closest('.internal-embed') as HTMLElement | null;
			const nextEmbed = galleryParentEmbed
				? this.findNextSiblingEmbed(galleryParentEmbed)
				: null;
			if (nextEmbed) {
				nextEmbed.appendChild(gallery);
				remainingImgs.forEach((i) => i.classList.remove('journal-editor-processed'));
				gallery.className = 'journal-images ' + this.getLayoutClass(remainingImgs.length);
				gallery.innerHTML = '';
				this.organizeImagesInContainer(remainingImgs, gallery);
				domUpdatedByMove = true;
			}
		}

		// Update markdown: remove whole line if only this image remains, else just remove this image reference
		const newLines = [...lines];
		if (newLineContent === '') {
			newLines.splice(lineIndex, 1);
		} else {
			newLines[lineIndex] = newLineContent;
		}
		editor.setValue(newLines.join('\n'));

		if (!domUpdatedByMove) {
			this.removeImageAndRebuildGallery(img, view.contentEl);
		}
		this.scheduleProcessWithRetries();
	}

	/** Find next sibling internal-embed adjacent to given embed (for gallery migration) */
	private findNextSiblingEmbed(embed: HTMLElement): HTMLElement | null {
		const block = embed.closest('p, .cm-line, .cm-block') || embed;
		let cur: Element | null = block.nextElementSibling;
		while (cur) {
			const nextEmbed = cur.classList.contains('internal-embed')
				? cur
				: (cur as HTMLElement).querySelector('.internal-embed');
			if (nextEmbed) return nextEmbed as HTMLElement;
			if (!this.isImageOnlyBlock(cur as HTMLElement)) break;
			cur = cur.nextElementSibling;
		}
		return null;
	}

	/** Remove specified image from gallery and rebuild layout immediately */
	private removeImageAndRebuildGallery(img: HTMLImageElement, scope: HTMLElement): void {
		const gallery = img.closest('.journal-images') as HTMLElement | null;
		if (!gallery || !scope.contains(gallery)) return;

		const remainingImgs = Array.from(gallery.querySelectorAll('img.journal-editor-processed')).filter(
			(el) => el !== img
		) as HTMLImageElement[];

		if (remainingImgs.length === 0) {
			gallery.closest('.internal-embed')?.remove();
			gallery.remove();
			return;
		}

		// Clear journal-editor-processed so organizeImagesInContainer can re-process
		remainingImgs.forEach((i) => i.classList.remove('journal-editor-processed'));

		gallery.className = 'journal-images ' + this.getLayoutClass(remainingImgs.length);
		gallery.innerHTML = '';
		this.organizeImagesInContainer(remainingImgs, gallery);
	}

	private extractFileNameFromSrc(src: string): string {
		try {
			const path = src.split('?')[0];
			const parts = path.split('/');
			return decodeURIComponent(parts[parts.length - 1] || '');
		} catch {
			return '';
		}
	}
}
