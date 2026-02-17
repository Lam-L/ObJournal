import {
	ItemView,
	WorkspaceLeaf,
	TFile,
	TFolder,
	App,
	Plugin,
} from 'obsidian';
import {
	JournalEntry,
	ImageInfo,
	extractDate,
	extractImagesFromContent,
	generatePreview,
	countWords,
	formatDate,
	groupByMonth,
	extractTitle,
	parseDate,
} from './utils';
import { PAGINATION, CONTENT, IMAGE_LOADING, UI_DELAYS, FILE_FILTER } from './constants';
import { logger } from './logger';
import { ImageLayoutBuilder } from './ImageLayoutBuilder';
import { JournalCardBuilder } from './JournalCardBuilder';
import { StatisticsCalculator } from './StatisticsCalculator';
import { ImageModal } from './ImageModal';

export const JOURNAL_VIEW_TYPE = 'journal-view';

export class JournalView extends ItemView {
	private entries: JournalEntry[] = [];
	private isLoading: boolean = false;
	private renderedEntries: Set<number> = new Set(); // 已渲染的条目索引
	private itemsPerPage: number = PAGINATION.ITEMS_PER_PAGE;
	private currentPage: number = 0;
	private scrollContainer: HTMLElement | null = null;
	private listContainer: HTMLElement | null = null; // 列表容器引用
	private loadMoreObserver: IntersectionObserver | null = null;
	private isLoadingMore: boolean = false; // 防止重复加载
	public targetFolderPath: string | null = null; // 目标文件夹路径
	private cardBuilder: JournalCardBuilder; // 卡片构建器
	private imageModal: ImageModal; // 图片查看器
	private stateRestored: boolean = false; // 标记状态是否已恢复
	private plugin: Plugin | null = null; // 插件实例
	private isRefreshing: boolean = false; // 是否正在刷新（防止并发刷新）

	constructor(leaf: WorkspaceLeaf, app: App, plugin?: Plugin) {
		super(leaf);
		// @ts-ignore - app is already defined in ItemView
		this.app = app;
		this.plugin = plugin || null;

		// 关键修复：在某些 Obsidian 版本中，contentEl 需要手动设置
		// 参考 folder-notes 插件的实现
		if (!this.contentEl && this.containerEl) {
			this.contentEl = this.containerEl.children[1] as HTMLElement;
		}

		// 如果还是不存在，创建一个新的容器
		if (!this.contentEl && this.containerEl) {
			this.contentEl = this.containerEl.createDiv('view-content');
		}

		logger.debug('构造函数调用', { contentEl: this.contentEl, containerEl: this.containerEl });

		// 初始化图片查看器
		this.imageModal = new ImageModal(app);

		// 初始化卡片构建器
		this.cardBuilder = new JournalCardBuilder(app, null, this.imageModal);
	}

	getViewType(): string {
		return JOURNAL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return '手记视图';
	}

	getIcon(): string {
		return 'calendar';
	}

	/**
	 * 获取视图状态（用于保存）
	 */
	getState(): any {
		const state = {
			targetFolderPath: this.targetFolderPath,
			hasLoaded: this.entries.length > 0, // 标记是否已经加载过
		};
		logger.debug('getState 被调用，返回状态', {
			state: state,
			entriesLength: this.entries.length,
			hasLoaded: state.hasLoaded
		});
		return state;
	}

	/**
	 * 设置视图状态（用于恢复）
	 */
	async setState(state: any): Promise<void> {
		logger.debug('setState 被调用', {
			state: state,
			stateType: typeof state,
			hasState: !!state,
			hasLoaded: state?.hasLoaded,
			stateKeys: state ? Object.keys(state) : []
		});

		// 如果状态已经恢复过，避免重复处理
		if (this.stateRestored) {
			logger.debug('setState: 状态已恢复过，跳过');
			return;
		}

		this.stateRestored = true;

		// 确保 contentEl 存在
		if (!this.contentEl && this.containerEl) {
			this.contentEl = this.containerEl.children[1] as HTMLElement;
		}
		if (!this.contentEl && this.containerEl) {
			this.contentEl = this.containerEl.createDiv('view-content');
		}

		// 检查状态是否存在且包含 hasLoaded
		if (state && typeof state === 'object' && state.hasLoaded === true) {
			this.targetFolderPath = state.targetFolderPath || null;

			logger.debug('恢复状态：之前已加载，自动重新加载', {
				targetFolderPath: this.targetFolderPath,
				hasLoaded: state.hasLoaded
			});

			// 清空当前显示（如果有空状态界面）
			if (this.contentEl) {
				this.contentEl.empty();
			}

			// 延迟一下，确保 DOM 已经准备好
			setTimeout(async () => {
				// 检查是否正在加载中，避免重复加载
				if (!this.isLoading && this.contentEl) {
					await this.loadEntries();
					this.render();
				}
			}, 100);
			return;
		}

		// 如果没有保存的状态或之前没有加载过，显示空状态
		logger.debug('恢复状态：没有保存的状态或之前没有加载过，显示空状态', {
			state: state,
			hasState: !!state,
			hasLoaded: state?.hasLoaded
		});
		if (this.contentEl) {
			this.renderEmpty();
		}
	}

	async onOpen(): Promise<void> {
		logger.debug('onOpen 被调用');

		// 再次确保 contentEl 存在（在 onOpen 时 DOM 应该已经准备好了）
		if (!this.contentEl && this.containerEl) {
			this.contentEl = this.containerEl.children[1] as HTMLElement;
		}

		// 如果还是不存在，创建一个新的容器
		if (!this.contentEl && this.containerEl) {
			this.contentEl = this.containerEl.createDiv('view-content');
		}

		logger.debug('onOpen', {
			contentEl: this.contentEl,
			containerEl: this.containerEl,
			childrenLength: this.containerEl?.children.length
		});

		if (!this.contentEl) {
			logger.error('错误：无法找到 contentEl！');
			return;
		}

		// 注意：Obsidian 会在 onOpen 之后调用 setState 来恢复状态
		// 我们延迟显示空状态，给 setState 一个机会先执行
		// 如果 setState 没有在短时间内被调用，再显示空状态
		// 增加延迟时间，确保 setState 有足够时间被调用
		setTimeout(() => {
			if (!this.stateRestored) {
				logger.debug('onOpen: setState 没有被调用或没有保存的状态，显示空状态');
				this.renderEmpty();
			} else {
				logger.debug('onOpen: setState 已被调用，等待状态恢复完成');
			}
		}, 500);
	}

	// 显示空状态（等待用户手动触发扫描）- 应用 UI/UX Pro Max 设计原则
	private renderEmpty(): void {
		if (!this.contentEl) return;

		this.contentEl.empty();
		this.contentEl.addClass('journal-view-container');
		// 手记应用风格：浅粉色背景
		this.contentEl.style.cssText = `
			padding: 0 !important;
			background: #f5f0f1 !important;
			color: #1a1a1a !important;
			height: 100% !important;
			min-height: 100% !important;
			box-sizing: border-box !important;
			display: flex !important;
			flex-direction: column !important;
			overflow: hidden !important;
			position: relative !important;
		`;

		// 创建欢迎界面 - 使用现代卡片设计
		const welcomeEl = this.contentEl.createDiv('journal-welcome');
		welcomeEl.style.cssText = `
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 100%;
			padding: 60px 40px;
			text-align: center;
			max-width: 600px;
			margin: 0 auto;
			width: 100%;
		`;

		// 创建卡片容器 - 使用 Soft UI 风格
		const cardEl = welcomeEl.createDiv('journal-welcome-card');
		cardEl.style.cssText = `
			background: var(--background-secondary);
			border-radius: 16px;
			padding: 48px 40px;
			width: 100%;
			box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
			border: 1px solid var(--background-modifier-border);
			transition: transform 0.2s ease, box-shadow 0.2s ease;
		`;

		// 图标容器 - 使用渐变背景
		const iconContainer = cardEl.createDiv('journal-welcome-icon-container');
		iconContainer.style.cssText = `
			width: 80px;
			height: 80px;
			border-radius: 20px;
			background: linear-gradient(135deg, var(--interactive-accent) 0%, var(--interactive-accent-hover) 100%);
			display: flex;
			align-items: center;
			justify-content: center;
			margin: 0 auto 24px;
			box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
		`;

		// 使用 SVG 图标而不是 emoji（符合 UI/UX Pro Max 原则）
		const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		iconSvg.setAttribute('width', '40');
		iconSvg.setAttribute('height', '40');
		iconSvg.setAttribute('viewBox', '0 0 24 24');
		iconSvg.setAttribute('fill', 'none');
		iconSvg.setAttribute('stroke', 'currentColor');
		iconSvg.setAttribute('stroke-width', '2');
		iconSvg.setAttribute('stroke-linecap', 'round');
		iconSvg.setAttribute('stroke-linejoin', 'round');
		iconSvg.style.cssText = 'color: var(--text-on-accent);';

		const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path1.setAttribute('d', 'M8 2v4');
		iconSvg.appendChild(path1);

		const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path2.setAttribute('d', 'M16 2v4');
		iconSvg.appendChild(path2);

		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('x', '3');
		rect.setAttribute('y', '4');
		rect.setAttribute('width', '18');
		rect.setAttribute('height', '18');
		rect.setAttribute('rx', '2');
		iconSvg.appendChild(rect);

		const path3 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path3.setAttribute('d', 'M3 10h18');
		iconSvg.appendChild(path3);

		const path4 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path4.setAttribute('d', 'M8 14h.01');
		iconSvg.appendChild(path4);

		const path5 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path5.setAttribute('d', 'M12 14h.01');
		iconSvg.appendChild(path5);

		const path6 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path6.setAttribute('d', 'M16 14h.01');
		iconSvg.appendChild(path6);

		const path7 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path7.setAttribute('d', 'M8 18h.01');
		iconSvg.appendChild(path7);

		const path8 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path8.setAttribute('d', 'M12 18h.01');
		iconSvg.appendChild(path8);

		const path9 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path9.setAttribute('d', 'M16 18h.01');
		iconSvg.appendChild(path9);

		iconContainer.appendChild(iconSvg);

		const titleEl = cardEl.createEl('h2', { cls: 'journal-welcome-title' });
		titleEl.textContent = '手记视图';
		titleEl.style.cssText = `
			font-size: 28px;
			font-weight: 600;
			margin: 0 0 12px 0;
			color: var(--text-normal);
			line-height: 1.3;
		`;

		const descEl = cardEl.createEl('p', { cls: 'journal-welcome-desc' });
		descEl.textContent = '点击下方按钮开始扫描和加载手记条目';
		descEl.style.cssText = `
			font-size: 15px;
			color: var(--text-muted);
			margin: 0 0 32px 0;
			line-height: 1.6;
		`;

		// 创建开始扫描按钮 - 应用最佳实践
		const buttonEl = cardEl.createEl('button', { cls: 'journal-start-button' });
		buttonEl.textContent = '开始扫描';
		buttonEl.setAttribute('aria-label', '开始扫描手记条目');
		buttonEl.style.cssText = `
			padding: 14px 32px;
			font-size: 16px;
			font-weight: 500;
			background: var(--interactive-accent);
			color: var(--text-on-accent);
			border: none;
			border-radius: 10px;
			cursor: pointer;
			transition: all 0.2s ease;
			box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
			min-width: 140px;
			min-height: 44px;
			position: relative;
			overflow: hidden;
		`;

		// 添加焦点状态（无障碍性）
		buttonEl.addEventListener('focus', () => {
			buttonEl.style.outline = '2px solid var(--interactive-accent)';
			buttonEl.style.outlineOffset = '2px';
		});

		buttonEl.addEventListener('blur', () => {
			buttonEl.style.outline = 'none';
		});

		// 悬停效果 - 平滑过渡（150-300ms）
		buttonEl.addEventListener('mouseenter', () => {
			if (!buttonEl.disabled) {
				buttonEl.style.transform = 'translateY(-1px)';
				buttonEl.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.15)';
				buttonEl.style.background = 'var(--interactive-accent-hover)';
			}
		});

		buttonEl.addEventListener('mouseleave', () => {
			if (!buttonEl.disabled) {
				buttonEl.style.transform = 'translateY(0)';
				buttonEl.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
				buttonEl.style.background = 'var(--interactive-accent)';
			}
		});

		// 点击效果
		buttonEl.addEventListener('mousedown', () => {
			if (!buttonEl.disabled) {
				buttonEl.style.transform = 'translateY(0)';
			}
		});

		buttonEl.addEventListener('click', async () => {
			buttonEl.disabled = true;
			buttonEl.style.opacity = '0.7';
			buttonEl.style.cursor = 'not-allowed';
			buttonEl.textContent = '扫描中...';

			// 显示优雅的加载状态
			this.contentEl.empty();
			await this.renderLoading();

			// 等待一小段时间确保 DOM 准备好
			await new Promise(resolve => setTimeout(resolve, UI_DELAYS.SCAN_DELAY));

			// 开始加载和渲染
			await this.loadEntries();
			await new Promise(resolve => setTimeout(resolve, UI_DELAYS.RENDER_DELAY));
			this.render();
			// 加载完成后保存状态
			this.saveState();
		});
	}

	// 渲染加载状态 - 使用骨架屏风格
	private async renderLoading(): Promise<void> {
		if (!this.contentEl) return;

		const loadingContainer = this.contentEl.createDiv('journal-loading-container');
		loadingContainer.style.cssText = `
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			height: 100%;
			padding: 60px 40px;
		`;

		// 加载动画
		const spinner = loadingContainer.createDiv('journal-loading-spinner');
		spinner.style.cssText = `
			width: 48px;
			height: 48px;
			border: 4px solid var(--background-modifier-border);
			border-top-color: var(--interactive-accent);
			border-radius: 50%;
			animation: spin 0.8s linear infinite;
			margin-bottom: 24px;
		`;

		// 添加旋转动画
		if (!document.getElementById('journal-spinner-style')) {
			const style = document.createElement('style');
			style.id = 'journal-spinner-style';
			style.textContent = `
				@keyframes spin {
					to { transform: rotate(360deg); }
				}
			`;
			document.head.appendChild(style);
		}

		const loadingText = loadingContainer.createEl('p', { cls: 'journal-loading-text' });
		loadingText.textContent = '正在加载手记视图...';
		loadingText.style.cssText = `
			font-size: 16px;
			color: var(--text-muted);
			margin: 0;
		`;
	}

	async onClose(): Promise<void> {
		// 清理资源
		if (this.loadMoreObserver) {
			this.loadMoreObserver.disconnect();
			this.loadMoreObserver = null;
		}
		this.renderedEntries.clear();

		// 在关闭时确保状态被保存
		logger.debug('onClose: 保存状态');
		this.saveState();
	}

	async loadEntries(): Promise<void> {
		if (this.isLoading) return;
		this.isLoading = true;

		try {
			// 如果指定了目标文件夹，只扫描该文件夹
			let files: TFile[] = [];
			if (this.targetFolderPath) {
				const targetFolder = this.app.vault.getAbstractFileByPath(this.targetFolderPath);
				if (targetFolder instanceof TFolder) {
					files = this.getMarkdownFilesInFolder(targetFolder);
					logger.log(`扫描文件夹 ${this.targetFolderPath}，找到 ${files.length} 个 Markdown 文件`);
				} else {
					logger.log(`文件夹 ${this.targetFolderPath} 不存在，扫描整个 vault`);
					files = this.app.vault.getMarkdownFiles();
				}
			} else {
				files = this.app.vault.getMarkdownFiles();
				logger.log(`找到 ${files.length} 个 Markdown 文件`);
			}

			this.entries = [];
			this.renderedEntries.clear();
			this.currentPage = 0;

			// 第一步：快速扫描，只提取元数据（不读取完整内容）
			const entryPromises: Promise<JournalEntry | null>[] = [];

			for (const file of files) {
				entryPromises.push(
					this.loadEntryMetadata(file).catch(error => {
						logger.error(`处理文件 ${file.path} 时出错:`, error);
						return null;
					})
				);
			}

			// 批量处理，但限制并发数
			const batchSize = PAGINATION.BATCH_SIZE;
			for (let i = 0; i < entryPromises.length; i += batchSize) {
				const batch = entryPromises.slice(i, i + batchSize);
				const results = await Promise.all(batch);
				this.entries.push(...results.filter((e): e is JournalEntry => e !== null));

				// 更新进度
				if (i % 50 === 0) {
					logger.debug(`已处理 ${Math.min(i + batchSize, files.length)}/${files.length} 个文件`);
				}
			}

			// 按日期排序（最新的在前），如果日期相同则按创建时间排序（最新的在前）
			this.entries.sort((a, b) => {
				// 首先按日期排序
				const dateDiff = b.date.getTime() - a.date.getTime();
				if (dateDiff !== 0) {
					return dateDiff;
				}
				// 如果日期相同，按创建时间排序（最新的在前）
				// 注意：ctime 是毫秒时间戳，值越大表示越新
				const ctimeDiff = b.file.stat.ctime - a.file.stat.ctime;
				if (ctimeDiff !== 0) {
					return ctimeDiff;
				}
				// 如果创建时间也相同（理论上不应该），按文件路径排序作为最后的排序依据
				return b.file.path.localeCompare(a.file.path);
			});

			// 调试：打印前几个条目的排序信息
			if (this.entries.length > 0) {
				logger.debug('排序后的前几个条目:', this.entries.slice(0, 5).map((e, index) => ({
					index,
					path: e.file.path,
					date: e.date.toISOString().split('T')[0],
					ctime: new Date(e.file.stat.ctime).toISOString(),
					ctimeMs: e.file.stat.ctime
				})));
			}

			logger.log(`成功加载 ${this.entries.length} 个手记条目（元数据）`);
		} catch (error) {
			logger.error('加载条目时出错:', error);
		} finally {
			this.isLoading = false;
		}
	}

	// 只加载元数据，不加载完整内容（使用 Obsidian Metadata Cache 优化）
	private async loadEntryMetadata(file: TFile): Promise<JournalEntry | null> {
		// 优先使用 Obsidian 的 metadata cache
		const metadata = this.app.metadataCache.getFileCache(file);

		// 尝试从 frontmatter 提取日期（最快）
		if (metadata?.frontmatter?.date) {
			const frontmatterDate = parseDate(metadata.frontmatter.date);
			if (frontmatterDate) {
				// 如果 frontmatter 有日期，可以快速处理
				return this.loadEntryMetadataFromCache(file, metadata, frontmatterDate);
			}
		}

		// 如果没有 frontmatter 日期，需要读取文件内容
		// 但只读取前 1000 个字符（通常足够提取日期和标题）
		let content: string;
		try {
			// 使用缓存的内容（如果可用）
			const cachedContent = this.app.metadataCache.getFileCache(file);
			if (cachedContent && (cachedContent as any).content) {
				content = (cachedContent as any).content;
			} else {
				// 只读取文件的前 1000 个字符（通常足够提取日期、标题和预览）
				const fullContent = await this.app.vault.read(file);
				content = fullContent.substring(0, 2000); // 读取前 2000 字符
			}
		} catch (error) {
			logger.error(`读取文件失败 ${file.path}:`, error);
			return null;
		}

		// 获取当前文件夹的日期字段配置
		let customDateField: string | undefined = undefined;
		if (this.plugin && this.targetFolderPath) {
			const pluginSettings = (this.plugin as any).settings;
			if (pluginSettings?.folderDateFields && pluginSettings.folderDateFields[this.targetFolderPath]) {
				customDateField = pluginSettings.folderDateFields[this.targetFolderPath];
			}
		}

		const date = extractDate(file, content, this.app, customDateField);
		if (!date) {
			return null;
		}

		// 使用 metadata cache 中的链接信息（如果可用）
		let images: ImageInfo[] = [];
		if (metadata?.embeds) {
			// 从 metadata cache 中提取嵌入的图片
			images = this.extractImagesFromMetadata(metadata, file);
		}

		// 如果 metadata cache 中没有图片信息，才从内容中提取
		if (images.length === 0) {
			// 需要完整内容来提取图片，但只读取一次
			const fullContent = await this.app.vault.read(file);
			images = extractImagesFromContent(fullContent, file, this.app);
			content = fullContent; // 使用完整内容
		}

		// 快速计算字数（使用完整内容或部分内容）
		const wordCount = countWords(content);

		// 提取标题（优先使用 frontmatter）
		let title = metadata?.frontmatter?.title || '';
		if (!title) {
			title = extractTitle(content, file.basename, this.app, file);
		}

		// 生成预览
		const preview = generatePreview(content, CONTENT.MAX_PREVIEW_LENGTH);

		return {
			file,
			date,
			images,
			content: '', // 不保存完整内容，需要时再加载
			preview,
			wordCount,
			title,
		};
	}

	// 从 metadata cache 快速加载（当 frontmatter 有日期时）
	// 这是最快的路径，不需要读取文件内容
	private loadEntryMetadataFromCache(
		file: TFile,
		metadata: any,
		date: Date
	): JournalEntry {
		// 从 metadata cache 提取图片（不需要读取文件）
		const images = this.extractImagesFromMetadata(metadata, file);

		// 从 frontmatter 获取标题
		const title = metadata.frontmatter?.title || file.basename;

		// 生成预览（从 frontmatter 或标题）
		let preview = '';
		if (metadata.frontmatter?.description) {
			preview = metadata.frontmatter.description;
		} else if (metadata.headings && metadata.headings.length > 0) {
			preview = metadata.headings[0].heading;
		} else {
			preview = title;
		}

		// 字数统计：如果 frontmatter 有字数信息就使用，否则延迟计算
		// 为了性能，这里先设为 0，需要时再计算
		const wordCount = metadata.frontmatter?.wordCount || 0;

		return {
			file,
			date,
			images,
			content: '',
			preview: preview || '无预览',
			wordCount,
			title,
		};
	}

	// 从 metadata cache 提取图片
	private extractImagesFromMetadata(metadata: any, file: TFile): ImageInfo[] {
		const images: ImageInfo[] = [];

		if (metadata.embeds) {
			for (const embed of metadata.embeds) {
				const imageFile = this.app.metadataCache.getFirstLinkpathDest(
					embed.link,
					file.path
				);

				if (imageFile && imageFile instanceof TFile) {
					// 检查是否是图片文件
					const ext = imageFile.extension.toLowerCase();
					if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
						images.push({
							name: embed.link,
							path: imageFile.path,
							url: this.app.vault.getResourcePath(imageFile),
							altText: embed.displayText || '',
							position: embed.position?.start?.line || 0,
						});
					}
				}
			}
		}

		return images;
	}

	// 按需加载完整内容
	private async loadEntryContent(entry: JournalEntry): Promise<void> {
		if (entry.content) return; // 已经加载过了

		try {
			entry.content = await this.app.vault.read(entry.file);
		} catch (error) {
			logger.error(`加载文件内容失败 ${entry.file.path}:`, error);
		}
	}

	render(): void {
		// 确保 contentEl 存在
		let container = this.contentEl;

		if (!container && this.containerEl) {
			// 尝试从 containerEl.children[1] 获取
			container = this.containerEl.children[1] as HTMLElement;
		}

		if (!container && this.containerEl) {
			// 尝试查找 .view-content
			container = this.containerEl.querySelector('.view-content') as HTMLElement;
		}

		if (!container && this.containerEl) {
			// 最后尝试：创建一个新的容器
			container = this.containerEl.createDiv('view-content');
			this.contentEl = container;
		}

		if (!container) {
			logger.error('错误：无法找到或创建容器！', { containerEl: this.containerEl });
			return;
		}

		logger.debug('使用容器:', container);
		this.renderToContainer(container);
	}

	private renderToContainer(container: HTMLElement): void {
		container.empty();
		container.addClass('journal-view-container');

		// 强制设置样式，确保可见（使用内联样式，优先级最高）
		// 使用 flex 布局，让统计信息和内容正确排列
		// 手记应用风格：浅粉色背景
		// 滚动条直接在 journal-view-container 上
		container.style.cssText = `
			padding: 16px !important;
			background: #f5f0f1 !important;
			color: #1a1a1a !important;
			height: 100% !important;
			min-height: 100% !important;
			box-sizing: border-box !important;
			display: flex !important;
			flex-direction: column !important;
			overflow-y: auto !important;
			overflow-x: hidden !important;
			position: relative !important;
			-webkit-overflow-scrolling: touch !important;
		`;

		if (this.isLoading) {
			const loadingEl = container.createDiv({
				text: '加载中...',
				cls: 'journal-loading',
			});
			loadingEl.style.cssText = 'text-align: center; padding: 40px; color: var(--text-normal);';
			logger.debug('显示加载中');
			return;
		}

		if (this.entries.length === 0) {
			const emptyEl = container.createDiv({
				text: '没有找到手记条目。请确保文件包含日期信息（文件名、frontmatter 或正文）。\n\n提示：\n- 文件名格式：2026-01-12.md 或 2026年1月12日.md\n- Frontmatter：date: 2026-01-12\n- 正文内容：2026年1月12日',
				cls: 'journal-empty',
			});
			emptyEl.style.cssText = 'text-align: center; padding: 40px; color: var(--text-normal); white-space: pre-line;';
			logger.debug('没有找到条目');
			return;
		}

		logger.log(`开始渲染 ${this.entries.length} 个条目（使用分页加载）`);

		// 创建内容包装器（不再需要单独的滚动容器）
		const contentWrapper = container.createDiv('journal-content-wrapper');
		contentWrapper.style.cssText = `
			display: flex !important;
			flex-direction: column !important;
			width: 100% !important;
			background: transparent !important;
		`;

		// 更新卡片构建器的滚动容器引用（使用主容器）
		this.scrollContainer = container;
		this.cardBuilder.setScrollContainer(this.scrollContainer);

		// 在内容包装器内渲染统计信息（header 会随内容滚动）
		this.renderStats(contentWrapper);
		logger.debug('统计信息已渲染');

		// 创建列表容器（renderListPaginated 只清空这个容器，不影响 header）
		const listContainer = contentWrapper.createDiv('journal-list-container');
		this.listContainer = listContainer; // 保存引用

		// 渲染手记列表（分页加载）
		this.renderListPaginated(listContainer);

		// 设置滚动监听，实现懒加载（使用主容器作为滚动根，listContainer作为触发器容器）
		this.setupLazyLoading(container, listContainer);
	}

	private setupLazyLoading(scrollContainer: HTMLElement, listContainer: HTMLElement): void {
		// 清理旧的观察器
		if (this.loadMoreObserver) {
			this.loadMoreObserver.disconnect();
			this.loadMoreObserver = null;
		}

		// 创建 Intersection Observer 来检测是否需要加载更多
		this.loadMoreObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting && !this.isLoadingMore) {
						// 延迟一下，避免过于频繁触发
						setTimeout(() => {
							if (!this.isLoadingMore && this.listContainer) {
								this.loadMoreEntries(this.listContainer);
							}
						}, 100);
					}
				});
			},
			{
				root: scrollContainer, // 滚动根容器
				rootMargin: '300px', // 增加提前加载距离，确保能及时触发（提前300px开始加载）
				threshold: 0.01 // 降低阈值，只要有一点可见就触发
			}
		);

		// 观察加载更多触发器（延迟设置，确保DOM已渲染）
		// 关键修复：在 listContainer 中查找触发器，而不是 scrollContainer
		setTimeout(() => {
			const loadMoreTrigger = listContainer.querySelector('.journal-load-more-trigger');
			if (loadMoreTrigger) {
				logger.debug('找到加载触发器，开始观察', {
					trigger: loadMoreTrigger,
					triggerRect: loadMoreTrigger.getBoundingClientRect(),
					scrollContainerRect: scrollContainer.getBoundingClientRect()
				});
				this.loadMoreObserver?.observe(loadMoreTrigger);
			} else {
				logger.debug('未找到加载触发器，将在首次加载后创建', {
					listContainer: listContainer,
					hasEntries: this.entries.length > 0
				});
			}
		}, 300); // 增加延迟，确保触发器已创建
	}

	private async loadMoreEntries(container: HTMLElement): Promise<void> {
		// 防止重复加载
		if (this.isLoadingMore) {
			logger.debug('正在加载中，跳过重复请求');
			return;
		}

		const startIndex = this.currentPage * this.itemsPerPage;
		const endIndex = Math.min(startIndex + this.itemsPerPage, this.entries.length);

		if (startIndex >= this.entries.length) {
			// 没有更多内容了
			logger.debug('没有更多内容了');
			const trigger = container.querySelector('.journal-load-more-trigger');
			if (trigger) {
				this.loadMoreObserver?.unobserve(trigger);
				trigger.remove();
			}
			return;
		}

		this.isLoadingMore = true;
		logger.debug(`loadMoreEntries: ${startIndex} - ${endIndex} (共 ${this.entries.length} 个)`);

		try {
			// 移除旧的触发器
			const oldTrigger = container.querySelector('.journal-load-more-trigger');
			if (oldTrigger) {
				this.loadMoreObserver?.unobserve(oldTrigger);
				oldTrigger.remove();
			}

			// 渲染这一批条目
			await this.renderEntriesBatch(container, startIndex, endIndex);
			logger.debug(`已渲染 ${endIndex - startIndex} 个条目`);

			// 创建新的触发器（完全隐藏，只用于 Intersection Observer）
			// 关键：触发器必须位于列表容器的最后，在正常文档流中
			if (endIndex < this.entries.length) {
				const trigger = container.createDiv('journal-load-more-trigger');
				trigger.style.cssText = `
					height: 1px !important;
					margin: 20px 0 !important;
					visibility: hidden !important;
					opacity: 0 !important;
					pointer-events: none !important;
					width: 100% !important;
					position: relative !important;
				`;
				logger.debug('创建新的加载触发器', {
					trigger,
					container: container,
					remaining: this.entries.length - endIndex,
					containerHeight: container.scrollHeight
				});
				// 延迟观察，确保DOM已完全渲染
				setTimeout(() => {
					if (this.loadMoreObserver && trigger.parentElement) {
						this.loadMoreObserver.observe(trigger);
						logger.debug('开始观察新的加载触发器', {
							triggerRect: trigger.getBoundingClientRect(),
							containerRect: container.getBoundingClientRect()
						});
					} else {
						logger.debug('无法观察触发器', {
							hasObserver: !!this.loadMoreObserver,
							hasParent: !!trigger.parentElement
						});
					}
				}, 100);
			}

			this.currentPage++;
		} finally {
			this.isLoadingMore = false;
		}
	}

	private async renderEntriesBatch(
		container: HTMLElement,
		startIndex: number,
		endIndex: number
	): Promise<void> {
		// 按月份分组当前批次的条目
		const batchEntries = this.entries.slice(startIndex, endIndex);
		const grouped = groupByMonth(batchEntries);

		logger.debug(`renderEntriesBatch: 处理 ${batchEntries.length} 个条目，分为 ${Object.keys(grouped).length} 个月份`);

		// 按月份排序
		const sortedMonths = Object.keys(grouped).sort((a, b) => {
			const dateA = this.parseMonthKey(a);
			const dateB = this.parseMonthKey(b);
			return dateB.getTime() - dateA.getTime();
		});

		for (const monthKey of sortedMonths) {
			const entries = grouped[monthKey];

			// 检查月份标题是否已存在
			let monthSection = container.querySelector(
				`.journal-month-section[data-month="${monthKey}"]`
			) as HTMLElement;

			if (!monthSection) {
				monthSection = container.createDiv('journal-month-section');
				monthSection.setAttribute('data-month', monthKey);
				const title = monthSection.createEl('h2', {
					text: monthKey,
					cls: 'journal-month-title',
				});
				logger.debug(`创建月份标题: ${monthKey}`);
			}

			for (const entry of entries) {
				const entryIndex = this.entries.indexOf(entry);
				if (!this.renderedEntries.has(entryIndex)) {
					const card = await this.createJournalCard(entry);
					monthSection.appendChild(card);
					this.renderedEntries.add(entryIndex);
				}
			}
		}

		logger.debug(`renderEntriesBatch 完成，容器子元素数: ${container.children.length}`);
	}

	// 创建 SVG 图标（符合 UI/UX Pro Max 原则：使用 SVG 而非 emoji）
	// 参考手记应用设计：火焰和对话气泡用红色，日历用蓝色
	private createSVGIcon(iconName: 'flame' | 'message' | 'calendar', size: number = 20, color?: string): string {
		const iconColor = color || 'currentColor';
		const svgMap = {
			flame: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`,
			message: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
			calendar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`
		};
		return svgMap[iconName];
	}

	renderStats(container: HTMLElement): void {
		// 创建头部容器（参考手记应用设计）
		const headerEl = container.createDiv('journal-header');

		// 标题和新建按钮容器
		const titleContainer = headerEl.createDiv('journal-title-container');

		// 标题
		const titleEl = titleContainer.createEl('h1', { cls: 'journal-title-header' });
		titleEl.textContent = '手记';

		// 按钮容器
		const buttonContainer = titleContainer.createDiv('journal-header-buttons');
		buttonContainer.style.cssText = 'display: flex; gap: 8px; align-items: center;';

		// 刷新按钮
		const refreshButton = buttonContainer.createEl('button', { cls: 'journal-refresh-button' });
		refreshButton.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="23 4 23 10 17 10"></polyline>
				<polyline points="1 20 1 14 7 14"></polyline>
				<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
			</svg>
		`;
		refreshButton.setAttribute('aria-label', '刷新视图');
		refreshButton.setAttribute('title', '刷新视图');
		refreshButton.addEventListener('click', async () => {
			refreshButton.disabled = true;
			refreshButton.style.opacity = '0.6';
			refreshButton.style.cursor = 'not-allowed';
			try {
				await this.refresh();
			} finally {
				refreshButton.disabled = false;
				refreshButton.style.opacity = '1';
				refreshButton.style.cursor = 'pointer';
			}
		});

		// 新建笔记按钮
		const createButton = buttonContainer.createEl('button', { cls: 'journal-create-button' });
		createButton.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="12" y1="5" x2="12" y2="19"></line>
				<line x1="5" y1="12" x2="19" y2="12"></line>
			</svg>
			<span>新建笔记</span>
		`;
		createButton.setAttribute('aria-label', '新建笔记');
		createButton.addEventListener('click', () => {
			this.createNewNote();
		});

		// 统计信息容器
		const statsEl = headerEl.createDiv('journal-stats');

		// 计算统计信息（使用 StatisticsCalculator）
		const consecutiveDays = StatisticsCalculator.calculateConsecutiveDays(this.entries);
		const totalWords = StatisticsCalculator.calculateTotalWords(this.entries);
		const totalDays = StatisticsCalculator.calculateTotalDays(this.entries);

		// 统计项 1：连续记录天数（红色火焰图标）
		const stat1 = statsEl.createDiv('journal-stat-item');
		const stat1Content = stat1.createDiv('journal-stat-content');
		const icon1 = stat1Content.createDiv('journal-stat-icon journal-stat-icon-flame');
		icon1.innerHTML = this.createSVGIcon('flame', 20, '#ef4444'); // 红色
		const value1 = stat1Content.createDiv('journal-stat-value');
		value1.textContent = this.formatNumber(consecutiveDays);
		const label1 = stat1.createDiv('journal-stat-label');
		label1.textContent = '连续纪录天数';

		// 统计项 2：字数（红色对话气泡图标）
		const stat2 = statsEl.createDiv('journal-stat-item');
		const stat2Content = stat2.createDiv('journal-stat-content');
		const icon2 = stat2Content.createDiv('journal-stat-icon journal-stat-icon-message');
		icon2.innerHTML = this.createSVGIcon('message', 20, '#ef4444'); // 红色
		const value2 = stat2Content.createDiv('journal-stat-value');
		value2.textContent = this.formatNumber(totalWords);
		const label2 = stat2.createDiv('journal-stat-label');
		label2.textContent = '字数';

		// 统计项 3：写手记天数（蓝色日历图标）
		const stat3 = statsEl.createDiv('journal-stat-item');
		const stat3Content = stat3.createDiv('journal-stat-content');
		const icon3 = stat3Content.createDiv('journal-stat-icon journal-stat-icon-calendar');
		icon3.innerHTML = this.createSVGIcon('calendar', 20, '#3b82f6'); // 蓝色
		const value3 = stat3Content.createDiv('journal-stat-value');
		value3.textContent = this.formatNumber(totalDays);
		const label3 = stat3.createDiv('journal-stat-label');
		label3.textContent = '写手记天数';

		// 去年今日卡片
		this.renderOnThisDay(headerEl);

		// 调试：打印前10条条目的创建时间和标题
		if (this.entries.length > 0) {
			const top10Entries = this.entries.slice(0, 10);
			logger.log('========== 前10条条目信息 ==========');
			top10Entries.forEach((entry, index) => {
				logger.log(`[${index + 1}] ${entry.title || entry.file.basename}`, {
					path: entry.file.path,
					title: entry.title,
					date: entry.date.toISOString().split('T')[0],
					ctime: new Date(entry.file.stat.ctime).toISOString(),
					ctimeMs: entry.file.stat.ctime,
					ctimeReadable: new Date(entry.file.stat.ctime).toLocaleString('zh-CN')
				});
			});
			logger.log('====================================');
		}
	}

	/**
	 * 查找去年今日的条目
	 */
	private findOnThisDayEntry(): JournalEntry | null {
		const today = new Date();
		const targetYear = today.getFullYear() - 1;
		const targetMonth = today.getMonth();
		const targetDate = today.getDate();

		// 查找去年同月同日的条目（必须精确匹配年份）
		for (const entry of this.entries) {
			const entryDate = entry.date;
			if (
				entryDate.getFullYear() === targetYear &&
				entryDate.getMonth() === targetMonth &&
				entryDate.getDate() === targetDate
			) {
				return entry;
			}
		}

		return null;
	}

	/**
	 * 渲染去年今日卡片
	 */
	private renderOnThisDay(headerEl: HTMLElement): void {
		const onThisDayEntry = this.findOnThisDayEntry();

		// 创建去年今日容器
		const onThisDayContainer = headerEl.createDiv('journal-on-this-day-container');

		if (onThisDayEntry) {
			// 找到去年今日的条目，显示卡片
			const card = onThisDayContainer.createDiv('journal-on-this-day-card');
			card.setAttribute('role', 'button');
			card.setAttribute('tabindex', '0');
			card.setAttribute('aria-label', '查看去年今日的手记');

			// 添加点击事件
			card.addEventListener('click', () => {
				this.app.workspace.openLinkText(onThisDayEntry.file.path, '', true);
			});

			card.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					this.app.workspace.openLinkText(onThisDayEntry.file.path, '', true);
				}
			});

			// 标题部分
			const titleSection = card.createDiv('journal-on-this-day-title');
			const icon = titleSection.createDiv('journal-on-this-day-icon');
			icon.innerHTML = this.createSVGIcon('calendar', 18, '#3b82f6');
			const titleText = titleSection.createEl('span', { cls: 'journal-on-this-day-title-text' });
			const lastYear = new Date().getFullYear() - 1;
			titleText.textContent = `去年今日 (${lastYear}年)`;

			// 内容部分
			const contentSection = card.createDiv('journal-on-this-day-content');

			// 如果有图片，显示第一张图片
			if (onThisDayEntry.images.length > 0) {
				const imageContainer = contentSection.createDiv('journal-on-this-day-image');
				const img = document.createElement('img');
				img.src = onThisDayEntry.images[0].url;
				img.alt = onThisDayEntry.images[0].altText || onThisDayEntry.title;
				img.loading = 'lazy';
				imageContainer.appendChild(img);
			}

			// 文本内容
			const textSection = contentSection.createDiv('journal-on-this-day-text');
			const entryTitle = textSection.createEl('div', { cls: 'journal-on-this-day-entry-title' });
			entryTitle.textContent = onThisDayEntry.title;

			if (onThisDayEntry.preview) {
				const preview = textSection.createEl('div', { cls: 'journal-on-this-day-preview' });
				preview.textContent = onThisDayEntry.preview.length > 100
					? onThisDayEntry.preview.substring(0, 100) + '...'
					: onThisDayEntry.preview;
			}
		} else {
			// 没有找到去年今日的条目，显示提示
			const emptyCard = onThisDayContainer.createDiv('journal-on-this-day-empty');
			const icon = emptyCard.createDiv('journal-on-this-day-empty-icon');
			icon.innerHTML = this.createSVGIcon('calendar', 20, '#999999');
			const text = emptyCard.createEl('span', { cls: 'journal-on-this-day-empty-text' });
			const lastYear = new Date().getFullYear() - 1;
			text.textContent = `去年今日 (${lastYear}年) 暂无记录`;
		}
	}

	renderListPaginated(container: HTMLElement): void {
		// 重置分页
		this.currentPage = 0;
		this.renderedEntries.clear();
		this.isLoadingMore = false;
		// 只清空列表容器，不影响 header
		container.empty();

		// 确保容器背景透明，避免黑色遮罩
		container.style.background = 'transparent';

		logger.debug('renderListPaginated 被调用');
		logger.debug(`总条目数: ${this.entries.length}, 每页: ${this.itemsPerPage}`);

		// 加载第一页（异步调用，但不等待）
		this.loadMoreEntries(container).catch(error => {
			logger.error('loadMoreEntries 出错:', error);
			this.isLoadingMore = false;
		});
	}

	parseMonthKey(monthKey: string): Date {
		const match = monthKey.match(/(\d{4})年(\d{1,2})月/);
		if (match) {
			return new Date(parseInt(match[1]), parseInt(match[2]) - 1, 1);
		}
		return new Date();
	}

	async createJournalCard(entry: JournalEntry): Promise<HTMLElement> {
		return this.cardBuilder.createJournalCard(entry);
	}

	async refresh(): Promise<void> {
		// 防止并发刷新
		if (this.isRefreshing) {
			logger.debug('正在刷新中，跳过重复刷新请求');
			return;
		}

		this.isRefreshing = true;
		try {
			await this.loadEntries();
			this.render();
			// 加载完成后，触发状态保存
			this.saveState();
		} finally {
			this.isRefreshing = false;
		}
	}

	/**
	 * 保存当前状态
	 * 通过更新 leaf 的 viewState 来触发 Obsidian 保存状态
	 */
	private saveState(): void {
		try {
			// @ts-ignore - leaf 是 ItemView 的 protected 属性
			const leaf = (this as any).leaf;
			if (leaf) {
				const currentState = leaf.getViewState();
				const newState = this.getState();

				logger.debug('saveState: 准备保存状态', {
					currentState: currentState,
					newState: newState,
					hasCurrentState: !!currentState
				});

				if (currentState) {
					// 临时重置 stateRestored，避免 setViewState 触发 setState 时被跳过
					const wasRestored = this.stateRestored;
					this.stateRestored = false;

					// 更新 viewState 来触发状态保存
					leaf.setViewState({
						...currentState,
						state: newState
					});

					// 恢复 stateRestored 标志
					this.stateRestored = wasRestored;

					logger.debug('状态已保存', {
						targetFolderPath: this.targetFolderPath,
						hasLoaded: this.entries.length > 0,
						savedState: newState
					});
				} else {
					logger.warn('无法获取当前 viewState，状态可能未保存');
				}
			} else {
				logger.warn('无法获取 leaf，状态可能未保存');
			}
		} catch (error) {
			logger.error('保存状态失败:', error);
		}
	}

	// 递归获取文件夹下的所有 Markdown 文件
	private getMarkdownFilesInFolder(folder: TFolder): TFile[] {
		const files: TFile[] = [];

		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === 'md') {
				// 排除配置文件
				const shouldExclude = FILE_FILTER.EXCLUDED_PREFIXES.some(prefix =>
					child.basename.startsWith(prefix)
				) || (FILE_FILTER.EXCLUDED_NAMES as readonly string[]).includes(child.basename);

				if (!shouldExclude) {
					files.push(child);
				}
			} else if (child instanceof TFolder) {
				// 递归处理子文件夹
				files.push(...this.getMarkdownFilesInFolder(child));
			}
		}

		return files;
	}

	/**
	 * 创建新笔记
	 */
	private async createNewNote(): Promise<void> {
		try {
			// 确定目标文件夹
			let targetFolder: TFolder | null = null;

			if (this.targetFolderPath) {
				const folder = this.app.vault.getAbstractFileByPath(this.targetFolderPath);
				if (folder instanceof TFolder) {
					targetFolder = folder;
				}
			}

			// 如果没有指定文件夹，使用Vault根目录
			if (!targetFolder) {
				// 尝试获取第一个顶级文件夹，或者使用根目录
				const rootFolders = this.app.vault.getAllFolders();
				if (rootFolders.length > 0) {
					// 使用第一个文件夹的父目录（通常是根目录）
					targetFolder = rootFolders[0].parent;
				}
			}

			if (!targetFolder) {
				logger.error('无法确定目标文件夹');
				return;
			}

			// 生成文件名（使用当前日期）
			const today = new Date();
			const year = today.getFullYear();
			const month = String(today.getMonth() + 1).padStart(2, '0');
			const day = String(today.getDate()).padStart(2, '0');
			const fileName = `${year}-${month}-${day}.md`;
			const filePath = targetFolder.path === '/'
				? fileName
				: `${targetFolder.path}/${fileName}`;

			// 检查文件是否已存在，如果存在则添加时间戳
			let finalPath = filePath;
			let counter = 1;
			while (await this.app.vault.adapter.exists(finalPath)) {
				const timeStr = `${String(today.getHours()).padStart(2, '0')}-${String(today.getMinutes()).padStart(2, '0')}`;
				finalPath = targetFolder.path === '/'
					? `${year}-${month}-${day}-${timeStr}.md`
					: `${targetFolder.path}/${year}-${month}-${day}-${timeStr}.md`;
				counter++;
				// 防止无限循环
				if (counter > 100) break;
			}

			// 获取模板（从插件设置中获取）
			let fileContent = '';
			// @ts-ignore - plugin 可能是 JournalPlugin，需要访问 settings
			if (this.plugin && (this.plugin as any).settings && (this.plugin as any).settings.defaultTemplate) {
				// @ts-ignore
				const template = (this.plugin as any).settings.defaultTemplate;
				// 替换模板变量
				fileContent = template
					.replace(/\{\{date\}\}/g, `${year}-${month}-${day}`)
					.replace(/\{\{year\}\}/g, String(year))
					.replace(/\{\{month\}\}/g, month)
					.replace(/\{\{day\}\}/g, day)
					.replace(/\{\{title\}\}/g, `${year}年${month}月${day}日`);
			} else {
				// 使用默认格式
				fileContent = `---
date: ${year}-${month}-${day}
---

# ${year}年${month}月${day}日

`;
			}

			// 创建文件
			const newFile = await this.app.vault.create(finalPath, fileContent);

			// 打开新创建的文件
			await this.app.workspace.openLinkText(finalPath, '', true);

			// 等待文件元数据（创建时间）完全更新后刷新
			// 延迟足够的时间，确保文件元数据已完全更新
			setTimeout(async () => {
				// 重新获取文件对象，确保获取最新的元数据
				const file = this.app.vault.getAbstractFileByPath(finalPath);
				if (file instanceof TFile) {
					logger.debug('准备刷新，新文件信息:', {
						path: file.path,
						ctime: new Date(file.stat.ctime).toISOString(),
						ctimeMs: file.stat.ctime
					});
				}

				// 执行刷新
				await this.refresh();

				// 刷新后，验证新文件是否在最前面
				if (this.entries.length > 0) {
					const firstEntry = this.entries[0];
					logger.debug('刷新后第一个条目:', {
						path: firstEntry.file.path,
						date: firstEntry.date.toISOString().split('T')[0],
						ctime: new Date(firstEntry.file.stat.ctime).toISOString(),
						isNewFile: firstEntry.file.path === finalPath
					});
				}
			}, 1000);

			logger.log(`已创建新笔记: ${finalPath}`);
		} catch (error) {
			logger.error('创建新笔记失败:', error);
		}
	}

	/**
	 * 格式化数字，使用 k、w 等方式节省空间
	 * 例如：3410 -> 3.4k, 10000 -> 1w
	 */
	private formatNumber(num: number): string {
		if (num >= 10000) {
			// 万：10000 -> 1w, 100000 -> 10w
			const w = Math.floor(num / 10000);
			const remainder = Math.floor((num % 10000) / 1000);
			if (remainder > 0) {
				return `${w}.${remainder}w`;
			}
			return `${w}w`;
		} else if (num >= 1000) {
			// 千：1000 -> 1k, 3410 -> 3.4k
			const k = Math.floor(num / 1000);
			const remainder = Math.floor((num % 1000) / 100);
			if (remainder > 0) {
				return `${k}.${remainder}k`;
			}
			return `${k}k`;
		}
		return num.toString();
	}

}
