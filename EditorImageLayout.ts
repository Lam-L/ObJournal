import { Plugin, MarkdownPostProcessorContext, MarkdownView } from 'obsidian';
import { App } from 'obsidian';
import { logger } from './logger';

/**
 * 编辑器图片布局增强
 * 自动检测连续图片并应用布局样式
 * 使用声明式渲染：JS 只负责包装，CSS 负责布局
 */
export class EditorImageLayout {
    private app: App;
    private plugin: Plugin;
    private isProcessing: boolean = false; // 防止重复处理
    private processingSet: WeakSet<HTMLElement> = new WeakSet(); // 记录正在处理的元素
    private lastProcessedTime: number = 0; // 上次处理时间
    private readonly PROCESS_COOLDOWN = 1500; // 处理冷却时间（毫秒）- 小屏幕设备增加冷却时间以提高稳定性

    constructor(app: App, plugin: Plugin) {
        this.app = app;
        this.plugin = plugin;
        logger.log('[EditorImageLayout] 初始化');
    }

    /**
     * 初始化编辑器增强
     */
    initialize(): void {
        logger.log('[EditorImageLayout] 开始初始化');

        // 1. 注册 Markdown 后处理器，在阅读模式和实时预览模式下自动应用图片布局
        this.plugin.registerMarkdownPostProcessor((element, context) => {
            logger.debug('[EditorImageLayout] PostProcessor 被调用', {
                elementTag: element.tagName,
                elementClasses: element.className,
                sourcePath: context.sourcePath
            });
            this.processMarkdownImages(element, context);
        });

        // 2. 监听 DOM 变化，处理实时预览模式下的图片
        // 使用 MutationObserver 监听图片插入
        this.setupMutationObserver();

        // 3. 监听编辑器变化，实时处理图片
        this.setupEditorChangeListener();

        logger.log('[EditorImageLayout] 初始化完成');
    }

    /**
     * 设置编辑器变化监听器
     */
    private setupEditorChangeListener(): void {
        let editorChangeTimeout: number | null = null;

        // 监听编辑器内容变化
        this.plugin.registerEvent(
            this.app.workspace.on('editor-change', () => {
                // 清除之前的定时器
                if (editorChangeTimeout) {
                    clearTimeout(editorChangeTimeout);
                }
                // 延迟处理，等待实时预览渲染完成
                editorChangeTimeout = window.setTimeout(() => {
                    this.processActiveEditor();
                }, 500);
            })
        );

        // 监听文件打开
        this.plugin.registerEvent(
            this.app.workspace.on('file-open', () => {
                setTimeout(() => {
                    this.processActiveEditor();
                }, 500);
            })
        );

        // 监听布局变化（切换视图时）
        this.plugin.registerEvent(
            this.app.workspace.on('layout-change', () => {
                setTimeout(() => {
                    this.processActiveEditor();
                }, 300);
            })
        );

        // 监听窗口大小变化（小屏幕设备优化）
        this.setupResizeListener();

        logger.log('[EditorImageLayout] 编辑器变化监听器已设置');
    }

    /**
     * 设置窗口大小变化监听器
     * 用于在屏幕尺寸变化时重新处理布局，避免布局垮掉
     */
    private setupResizeListener(): void {
        let resizeTimeout: number | null = null;

        window.addEventListener('resize', () => {
            // 清除之前的定时器
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }

            // 延迟处理，等待布局稳定（小屏幕设备需要更长的延迟）
            const isSmallScreen = window.innerWidth <= 480;
            const delay = isSmallScreen ? 800 : 500;

            resizeTimeout = window.setTimeout(() => {
                // 检查当前活动文件是否应该处理
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                const filePath = view?.file?.path;
                if (this.shouldProcessFile(filePath)) {
                    logger.debug('[EditorImageLayout] 窗口大小变化，重新处理布局', {
                        width: window.innerWidth,
                        height: window.innerHeight
                    });
                    this.processActiveEditor();
                }
            }, delay);
        });

        logger.log('[EditorImageLayout] 窗口大小变化监听器已设置');
    }

    /**
     * 验证图片是否有效（不是占位符或空图片）
     */
    private isValidImage(img: HTMLImageElement): boolean {
        // 必须有src属性
        if (!img.src) {
            return false;
        }

        // 排除data URI占位符（通常是data:image/svg+xml或data:image/gif等）
        if (img.src.startsWith('data:image/svg+xml') ||
            img.src.startsWith('data:image/gif;base64,R0lGOD')) {
            return false;
        }

        // 排除空的src（空字符串或只有空白）
        if (img.src.trim() === '' || img.src === 'about:blank') {
            return false;
        }

        // 检查是否是Obsidian的内部图片链接（app://开头）
        // 或者是否是有效的文件路径
        const isValidObsidianImage = img.src.startsWith('app://') ||
            img.src.startsWith('http://') ||
            img.src.startsWith('https://') ||
            img.src.startsWith('file://');

        // 检查是否有alt属性（通常Obsidian的图片embed会有alt属性）
        // 或者src包含有效的文件扩展名
        const hasValidExtension = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(img.src);
        const altAttr = img.getAttribute('alt');
        const hasAlt = altAttr !== null && altAttr.trim() !== '';

        // 图片必须满足以下条件之一：
        // 1. 是Obsidian内部链接（app://）
        // 2. 有有效的文件扩展名
        // 3. 有alt属性（通常是文件名）
        return isValidObsidianImage || hasValidExtension || hasAlt;
    }

    /**
     * 检查是否应该处理该文件
     * 新增功能：只在手记视图文件夹中启用自动布局
     */
    private shouldProcessFile(filePath: string | null | undefined): boolean {
        // 1. 检查是否启用自动布局功能
        // 使用类型断言访问 settings，因为 Plugin 基类没有定义 settings 属性
        const settings = (this.plugin as { settings?: { enableAutoLayout?: boolean; defaultFolderPath?: string | null } }).settings;
        if (!settings || !settings.enableAutoLayout) {
            return false;
        }

        // 2. 检查文件路径是否有效
        if (!filePath) {
            return false;
        }

        // 3. 检查是否在默认文件夹中
        const defaultFolderPath = settings.defaultFolderPath;
        if (!defaultFolderPath) {
            return false; // 如果没有设置默认文件夹，不启用
        }

        // 4. 检查文件是否在默认文件夹或其子文件夹中
        const isInFolder = filePath === defaultFolderPath ||
            filePath.startsWith(defaultFolderPath + '/');

        logger.debug('[EditorImageLayout] 检查文件路径', {
            filePath: filePath,
            defaultFolderPath: defaultFolderPath,
            isInFolder: isInFolder
        });

        return isInFolder;
    }

    /**
     * 处理活动编辑器中的图片
     */
    private processActiveEditor(): void {
        // 冷却时间检查
        const now = Date.now();
        if (now - this.lastProcessedTime < this.PROCESS_COOLDOWN) {
            logger.debug('[EditorImageLayout] 在冷却时间内，跳过');
            return;
        }

        if (this.isProcessing) {
            logger.debug('[EditorImageLayout] 正在处理中，跳过 processActiveEditor');
            return;
        }

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return;

        // 新增：检查文件路径是否应该处理
        const filePath = view.file?.path;
        if (!this.shouldProcessFile(filePath)) {
            logger.debug('[EditorImageLayout] 文件不在默认文件夹中或未启用自动布局，跳过', {
                filePath: filePath
            });
            return;
        }

        // 获取编辑器容器
        const editorEl = view.contentEl;
        if (!editorEl) return;

        logger.debug('[EditorImageLayout] 处理活动编辑器', {
            mode: view.getMode()
        });

        // 先更新现有的 gallery 容器（处理图片删除的情况）
        this.updateExistingGalleries();

        // 在实时预览模式下，查找预览渲染区域
        if (view.getMode() === 'source') {
            // 实时预览模式：查找所有可能的预览容器
            const previewImages = Array.from(editorEl.querySelectorAll('.markdown-source-view img'))
                .filter(img => {
                    const imgEl = img as HTMLElement;
                    return !imgEl.classList.contains('diary-processed') &&
                        !imgEl.closest('.diary-gallery');
                });

            if (previewImages.length > 0) {
                logger.debug('[EditorImageLayout] 实时预览模式：找到图片', { count: previewImages.length });
                // 处理包含这些图片的容器（只处理一次）
                const processedContainers = new Set<HTMLElement>();
                previewImages.forEach((img) => {
                    const container = img.closest('.cm-line, .cm-content, .cm-editor, p') as HTMLElement;
                    if (container && !processedContainers.has(container) && !container.closest('.diary-gallery')) {
                        processedContainers.add(container);
                        this.processImagesInElement(container);
                    }
                });
            }

            // 也处理整个编辑器容器
            this.processImagesInElement(editorEl);
        } else {
            // 阅读模式：处理整个容器
            this.processImagesInElement(editorEl);
        }
    }

    /**
     * 设置 MutationObserver 监听 DOM 变化
     */
    private setupMutationObserver(): void {
        let processTimeout: number | null = null;

        const observer = new MutationObserver((mutations) => {
            // 如果正在处理，跳过（防止无限循环）
            if (this.isProcessing) {
                return;
            }

            // 冷却时间检查
            const now = Date.now();
            if (now - this.lastProcessedTime < this.PROCESS_COOLDOWN) {
                return;
            }

            let hasImages = false;
            let hasRemovedImages = false;

            mutations.forEach((mutation) => {
                // 忽略我们自己的容器插入（更严格的检查）
                if (mutation.target instanceof HTMLElement) {
                    // 如果目标本身就是我们的容器，直接忽略
                    if (mutation.target.classList.contains('diary-gallery') ||
                        mutation.target.classList.contains('diary-gallery-bottom') ||
                        mutation.target.classList.contains('diary-gallery-right-grid')) {
                        return;
                    }
                    // 如果目标在我们的容器内，也忽略
                    if (mutation.target.closest('.diary-gallery')) {
                        return;
                    }
                }

                if (mutation.type === 'childList') {
                    // 检测删除的节点（图片被删除）
                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as HTMLElement;

                            // 检查是否是图片被删除
                            if (element.tagName === 'IMG' && element.classList.contains('diary-processed')) {
                                hasRemovedImages = true;
                                const img = element as HTMLImageElement;
                                logger.log('[EditorImageLayout] [删除流程] MutationObserver 检测到图片直接删除', {
                                    imgAlt: img.getAttribute('alt'),
                                    imgSrc: img.src?.substring(0, 50),
                                    parentTag: img.parentElement?.tagName,
                                    parentClass: img.parentElement?.className
                                });
                            } else {
                                // 检查是否是 internal-embed 被删除（包含图片的容器）
                                if (element.classList.contains('internal-embed') &&
                                    element.classList.contains('image-embed')) {
                                    // 检查这个 internal-embed 中是否有图片
                                    const images = element.querySelectorAll('img');
                                    if (images.length > 0) {
                                        hasRemovedImages = true;
                                        const embedSrc = element.getAttribute('src');
                                        const embedAlt = element.getAttribute('alt');
                                        logger.log('[EditorImageLayout] [删除流程] MutationObserver 检测到 internal-embed 被删除', {
                                            elementTag: element.tagName,
                                            embedSrc: embedSrc,
                                            embedAlt: embedAlt,
                                            imageCount: images.length,
                                            imageAlts: Array.from(images).map(img => (img as HTMLImageElement).getAttribute('alt'))
                                        });
                                    }
                                } else {
                                    // 检查是否包含已处理的图片
                                    const removedImages = element.querySelectorAll('img.diary-processed');
                                    if (removedImages.length > 0) {
                                        hasRemovedImages = true;
                                        logger.log('[EditorImageLayout] [删除流程] MutationObserver 检测到包含图片的元素被删除', {
                                            elementTag: element.tagName,
                                            elementClass: element.className,
                                            imageCount: removedImages.length,
                                            imageAlts: Array.from(removedImages).map(img => (img as HTMLImageElement).getAttribute('alt'))
                                        });
                                    }
                                }
                            }
                        }
                    });

                    mutation.addedNodes.forEach((node) => {
                        // 忽略我们创建的容器（更严格的检查）
                        if (node instanceof HTMLElement) {
                            // 如果节点本身就是我们的容器，直接忽略
                            if (node.classList.contains('diary-gallery') ||
                                node.classList.contains('diary-gallery-bottom') ||
                                node.classList.contains('diary-gallery-right-grid')) {
                                return;
                            }
                            // 如果节点在我们的容器内，也忽略
                            if (node.closest('.diary-gallery')) {
                                return;
                            }
                        }

                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as HTMLElement;

                            // 检查是否是图片或包含图片的元素
                            if (element.tagName === 'IMG') {
                                const img = element as HTMLImageElement;
                                // 排除已处理的图片和我们创建的容器中的图片
                                // 关键修复：验证图片是否有效（有有效的src属性）
                                if (!img.classList.contains('diary-processed') &&
                                    !img.closest('.diary-gallery') &&
                                    this.isValidImage(img)) {
                                    hasImages = true;
                                    logger.debug('[EditorImageLayout] MutationObserver 检测到图片插入', {
                                        imgSrc: img.src?.substring(0, 50),
                                        parentTag: img.parentElement?.tagName
                                    });
                                }
                            } else {
                                // 检查子元素中是否有未处理的图片（排除我们创建的容器）
                                if (element.closest('.diary-gallery')) {
                                    return;
                                }
                                // 更严格的检查：确保图片不在我们的容器中，且是有效的图片
                                const images = Array.from(element.querySelectorAll('img:not(.diary-processed)'))
                                    .filter(img => {
                                        const imgEl = img as HTMLElement;
                                        return !imgEl.closest('.diary-gallery') && this.isValidImage(img as HTMLImageElement);
                                    });
                                if (images.length > 0) {
                                    hasImages = true;
                                    logger.debug('[EditorImageLayout] MutationObserver 检测到包含图片的元素', {
                                        elementTag: element.tagName,
                                        elementClass: element.className,
                                        imageCount: images.length
                                    });
                                }
                            }
                        }
                    });
                }
            });

            // 如果有新图片或删除图片，延迟处理（防抖）
            if ((hasImages || hasRemovedImages) && !this.isProcessing) {
                if (processTimeout) {
                    clearTimeout(processTimeout);
                }
                processTimeout = window.setTimeout(() => {
                    if (this.isProcessing) {
                        logger.debug('[EditorImageLayout] 正在处理中，跳过');
                        return;
                    }

                    // 新增：检查当前活动文件是否应该处理
                    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                    const filePath = view?.file?.path;
                    if (!this.shouldProcessFile(filePath)) {
                        logger.debug('[EditorImageLayout] MutationObserver: 文件不在默认文件夹中或未启用自动布局，跳过', {
                            filePath: filePath
                        });
                        return;
                    }

                    // 如果检测到图片删除，先更新现有的 gallery 容器
                    if (hasRemovedImages) {
                        logger.log('[EditorImageLayout] [删除流程] MutationObserver 触发删除处理流程', {
                            filePath: filePath,
                            timestamp: new Date().toISOString()
                        });
                        this.updateExistingGalleries();
                    }

                    logger.debug('[EditorImageLayout] MutationObserver 触发图片处理');
                    // 优先处理活动编辑器
                    this.processActiveEditor();
                }, 500);
            }
        });

        // 监听整个文档的变化（但只处理编辑器区域）
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        logger.log('[EditorImageLayout] MutationObserver 已设置，监听整个文档');
    }

    /**
     * 更新现有的 gallery 容器
     * 当图片被删除时，重新计算并更新 gallery 的 data-count 和布局
     * 关键修复：通过匹配 internal-embed 的 src 属性来找到对应的图片
     */
    private updateExistingGalleries(): void {
        logger.log('[EditorImageLayout] [删除流程] ========== 开始更新现有 Gallery ==========');

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            logger.debug('[EditorImageLayout] [删除流程] 无法获取活动视图，退出');
            return;
        }

        const editorEl = view.contentEl;
        if (!editorEl) {
            logger.debug('[EditorImageLayout] [删除流程] 无法获取编辑器容器，退出');
            return;
        }

        // 查找所有现有的 gallery 容器
        const galleries = Array.from(editorEl.querySelectorAll('.diary-gallery')) as HTMLElement[];
        logger.log('[EditorImageLayout] [删除流程] 找到 gallery 容器数量', {
            galleryCount: galleries.length
        });

        if (galleries.length === 0) {
            logger.debug('[EditorImageLayout] [删除流程] 没有找到 gallery 容器，退出');
            return;
        }

        // 获取所有仍然存在的 internal-embed
        const existingEmbeds = Array.from(editorEl.querySelectorAll('.internal-embed.image-embed')) as HTMLElement[];
        logger.log('[EditorImageLayout] [删除流程] 当前存在的 internal-embed 数量', {
            embedCount: existingEmbeds.length,
            embedSrcs: existingEmbeds.map(embed => embed.getAttribute('src'))
        });

        galleries.forEach((gallery, galleryIndex) => {
            logger.log('[EditorImageLayout] [删除流程] ---------- 处理 Gallery #' + (galleryIndex + 1) + ' ----------');

            // 获取 gallery 中所有图片
            const allImages = Array.from(gallery.querySelectorAll('img.diary-processed')) as HTMLImageElement[];
            const currentCount = parseInt(gallery.getAttribute('data-count') || '0');

            logger.log('[EditorImageLayout] [删除流程] Gallery 当前状态', {
                galleryIndex: galleryIndex + 1,
                currentDataCount: currentCount,
                actualImageCount: allImages.length,
                imageAlts: allImages.map(img => img.getAttribute('alt'))
            });

            // 查找所有仍然存在的 internal-embed（通过检查它们的 src 属性）
            const validImages: HTMLImageElement[] = [];
            const removedImages: HTMLImageElement[] = [];

            allImages.forEach((img, imgIndex) => {
                // 获取图片的 alt 属性（这通常是文件名）
                const imgAlt = img.getAttribute('alt') || '';

                logger.debug('[EditorImageLayout] [删除流程] 检查图片 #' + (imgIndex + 1), {
                    imgAlt: imgAlt,
                    imgSrc: img.src?.substring(0, 50)
                });

                // 查找是否有对应的 internal-embed 存在
                // internal-embed 的 src 或 alt 属性应该匹配图片的 alt
                const matchingEmbed = existingEmbeds.find(embed => {
                    const embedSrc = embed.getAttribute('src') || '';
                    const embedAlt = embed.getAttribute('alt') || '';
                    return embedSrc === imgAlt || embedAlt === imgAlt;
                });

                if (matchingEmbed) {
                    logger.debug('[EditorImageLayout] [删除流程] 找到匹配的 internal-embed', {
                        imgAlt: imgAlt,
                        embedSrc: matchingEmbed.getAttribute('src'),
                        embedAlt: matchingEmbed.getAttribute('alt')
                    });

                    // 关键修复：如果找到了匹配的 internal-embed，说明 markdown 代码还在
                    // 图片可能已经被移动到 gallery 中，这是正常的，所以应该保留
                    // 检查图片是否在 gallery 中（说明已经被处理过，应该保留）
                    const isInGallery = img.closest('.diary-gallery') !== null;

                    // 或者检查 embed 中是否包含这个图片（图片可能还在 embed 中，还没被移动到 gallery）
                    const embedImages = matchingEmbed.querySelectorAll('img');
                    const hasMatchingImageInEmbed = Array.from(embedImages).some(embedImg => {
                        const embedImgAlt = embedImg.getAttribute('alt') || '';
                        return embedImgAlt === imgAlt;
                    });

                    // 如果图片在 gallery 中，或者 embed 中有匹配的图片，都应该保留
                    if (isInGallery || hasMatchingImageInEmbed) {
                        validImages.push(img);
                        logger.log('[EditorImageLayout] [删除流程] ✅ 图片保留', {
                            imgAlt: imgAlt,
                            reason: isInGallery
                                ? '找到匹配的 internal-embed 且图片已在 gallery 中'
                                : '找到匹配的 internal-embed 且包含匹配的图片',
                            isInGallery: isInGallery,
                            hasMatchingImageInEmbed: hasMatchingImageInEmbed
                        });
                    } else {
                        // 这种情况理论上不应该发生：找到了 embed 但图片既不在 gallery 也不在 embed 中
                        // 可能是图片还在加载中，为了安全起见，先保留
                        validImages.push(img);
                        logger.log('[EditorImageLayout] [删除流程] ⚠️ 图片保留（安全处理）', {
                            imgAlt: imgAlt,
                            reason: '找到匹配的 internal-embed 但图片位置异常，为安全起见保留',
                            isInGallery: isInGallery,
                            embedImageAlts: Array.from(embedImages).map(ei => ei.getAttribute('alt'))
                        });
                    }
                } else {
                    removedImages.push(img);
                    logger.log('[EditorImageLayout] [删除流程] ❌ 图片将被移除', {
                        imgAlt: imgAlt,
                        reason: '没有找到对应的 internal-embed',
                        searchedEmbedSrcs: existingEmbeds.map(e => e.getAttribute('src'))
                    });
                }
            });

            const newCount = validImages.length;

            logger.log('[EditorImageLayout] [删除流程] Gallery 匹配结果汇总', {
                galleryIndex: galleryIndex + 1,
                currentDataCount: currentCount,
                actualImageCount: allImages.length,
                validImageCount: validImages.length,
                removedImageCount: removedImages.length,
                validImageAlts: validImages.map(img => img.getAttribute('alt')),
                removedImageAlts: removedImages.map(img => img.getAttribute('alt'))
            });

            // 如果图片数量发生变化，更新 gallery
            if (newCount !== currentCount || newCount !== allImages.length) {
                logger.log('[EditorImageLayout] [删除流程] Gallery 需要更新', {
                    galleryIndex: galleryIndex + 1,
                    oldCount: currentCount,
                    newCount: newCount,
                    willRemove: newCount === 0
                });

                if (newCount === 0) {
                    // 如果没有图片了，移除 gallery 容器
                    logger.log('[EditorImageLayout] [删除流程] 🗑️ 移除空 Gallery', {
                        galleryIndex: galleryIndex + 1
                    });
                    gallery.remove();
                } else {
                    // 更新 data-count 并重新组织布局
                    logger.log('[EditorImageLayout] [删除流程] 🔄 更新 Gallery 布局', {
                        galleryIndex: galleryIndex + 1,
                        oldCount: currentCount,
                        newCount: newCount
                    });

                    gallery.setAttribute('data-count', newCount.toString());

                    // 保存所有有效图片的引用（在清空容器之前）
                    const imagesToReorganize = [...validImages];

                    // 清空容器
                    gallery.innerHTML = '';

                    // 重新组织图片
                    this.organizeImagesInContainer(imagesToReorganize, gallery);

                    logger.log('[EditorImageLayout] [删除流程] ✅ Gallery 更新完成', {
                        galleryIndex: galleryIndex + 1,
                        oldCount: currentCount,
                        newCount: newCount,
                        reorganizedImageAlts: imagesToReorganize.map(img => img.getAttribute('alt'))
                    });
                }
            } else {
                logger.debug('[EditorImageLayout] [删除流程] Gallery 无需更新', {
                    galleryIndex: galleryIndex + 1,
                    count: currentCount
                });
            }
        });

        logger.log('[EditorImageLayout] [删除流程] ========== 完成更新现有 Gallery ==========');
    }

    /**
     * 在指定元素中处理图片
     * 关键修复：先合并相邻的单个 gallery，再处理新图片
     */
    private processImagesInElement(element: HTMLElement): void {
        if (!element) return;

        // 防止重复处理同一个元素
        if (this.processingSet.has(element)) {
            logger.debug('[EditorImageLayout] 元素正在处理中，跳过');
            return;
        }

        // 排除我们创建的容器
        if (element.classList.contains('diary-gallery') || element.closest('.diary-gallery')) {
            return;
        }

        // 关键修复：先合并相邻的单个 gallery 容器
        this.mergeAdjacentGalleries(element);

        // 更严格地过滤图片：排除已处理的、在我们容器中的、无效的图片
        const allImages = Array.from(element.querySelectorAll('img'));
        const images = allImages.filter(img => {
            const imgEl = img as HTMLElement;
            // 排除已处理的
            if (imgEl.classList.contains('diary-processed')) {
                return false;
            }
            // 排除在我们容器中的
            if (imgEl.closest('.diary-gallery')) {
                return false;
            }
            // 关键修复：验证图片是否有效（有有效的src属性）
            if (!this.isValidImage(img as HTMLImageElement)) {
                return false;
            }
            return true;
        }) as HTMLImageElement[];

        if (images.length === 0) {
            return;
        }

        // 标记为正在处理
        this.isProcessing = true;
        this.processingSet.add(element);
        this.lastProcessedTime = Date.now();

        logger.debug('[EditorImageLayout] 在元素中处理图片', {
            elementTag: element.tagName,
            imageCount: images.length
        });

        try {
            // 将连续的图片分组
            const imageGroups = this.groupConsecutiveImages(images);
            logger.log('[EditorImageLayout] 图片分组完成', {
                groups: imageGroups.length,
                groupSizes: imageGroups.map(g => g.length)
            });

            // 为每组图片应用布局
            imageGroups.forEach((group, index) => {
                if (group.length >= 1) {
                    logger.debug(`[EditorImageLayout] 处理第 ${index + 1} 组图片`, { count: group.length });
                    this.wrapImageGroup(group);
                }
            });
        } finally {
            // 处理完成，清除标记
            this.isProcessing = false;
            // 延迟清除 processingSet，避免立即重复处理
            setTimeout(() => {
                this.processingSet.delete(element);
            }, 2000);
        }
    }

    /**
     * 合并相邻的单个 gallery 容器
     * 关键修复：处理两张图片分别被包装在两个 internal-embed 中的情况
     */
    private mergeAdjacentGalleries(container: HTMLElement): void {
        // 查找所有 gallery 容器
        const galleries = Array.from(container.querySelectorAll('.diary-gallery')) as HTMLElement[];

        if (galleries.length < 2) {
            return; // 少于两个，不需要合并
        }

        // 按 DOM 顺序排序
        galleries.sort((a, b) => {
            const position = a.compareDocumentPosition(b);
            return position & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        });

        // 检查相邻的 gallery 是否可以合并
        for (let i = 0; i < galleries.length - 1; i++) {
            const gallery1 = galleries[i];
            const gallery2 = galleries[i + 1];

            // 检查是否相邻（中间只有空白或 internal-embed 容器）
            if (this.areGalleriesAdjacent(gallery1, gallery2)) {
                const count1 = parseInt(gallery1.getAttribute('data-count') || '0');
                const count2 = parseInt(gallery2.getAttribute('data-count') || '0');
                const totalCount = count1 + count2;

                logger.debug('[EditorImageLayout] 合并相邻的 gallery', {
                    count1: count1,
                    count2: count2,
                    totalCount: totalCount
                });

                // 获取所有图片
                const images1 = Array.from(gallery1.querySelectorAll('img.diary-processed')) as HTMLImageElement[];
                const images2 = Array.from(gallery2.querySelectorAll('img.diary-processed')) as HTMLImageElement[];
                const allImages = [...images1, ...images2];

                // 更新第一个 gallery
                gallery1.setAttribute('data-count', totalCount.toString());
                gallery1.innerHTML = '';

                // 重新组织所有图片
                this.organizeImagesInContainer(allImages, gallery1);

                // 移除第二个 gallery 及其父容器（如果是 internal-embed）
                const gallery2Parent = gallery2.parentElement;
                if (gallery2Parent && gallery2Parent.classList.contains('internal-embed')) {
                    gallery2Parent.remove();
                } else {
                    gallery2.remove();
                }

                // 从数组中移除已合并的 gallery
                galleries.splice(i + 1, 1);
                i--; // 调整索引，继续检查
            }
        }
    }

    /**
     * 检查两个 gallery 是否相邻
     */
    private areGalleriesAdjacent(gallery1: HTMLElement, gallery2: HTMLElement): boolean {
        // 获取 gallery 的父元素（可能是 internal-embed）
        const parent1 = gallery1.parentElement;
        const parent2 = gallery2.parentElement;

        if (!parent1 || !parent2) return false;

        // 如果父元素相同，直接相邻
        if (parent1 === parent2) {
            return gallery1.nextElementSibling === gallery2 || gallery2.nextElementSibling === gallery1;
        }

        // 如果父元素不同，检查父元素是否相邻
        // 检查中间是否只有空白或 internal-embed 容器
        let current: Node | null = parent1.nextSibling;
        while (current) {
            if (current === parent2) {
                return true; // 直接相邻
            }
            if (current.nodeType === Node.ELEMENT_NODE) {
                const element = current as HTMLElement;
                // 允许 internal-embed、cm-line 等容器
                if (!element.classList.contains('internal-embed') &&
                    !element.classList.contains('media-embed') &&
                    !element.classList.contains('image-embed') &&
                    !element.classList.contains('cm-line') &&
                    !element.classList.contains('diary-gallery') &&
                    element.textContent?.trim() &&
                    !element.querySelector('img')) {
                    return false; // 中间有其他内容
                }
            } else if (current.nodeType === Node.TEXT_NODE) {
                if (current.textContent?.trim()) {
                    return false; // 中间有非空白文本
                }
            }
            current = current.nextSibling;
        }

        return false;
    }

    /**
     * 处理 Markdown 渲染后的图片（阅读模式和实时预览模式）
     * 自动检测连续图片并应用布局
     */
    private processMarkdownImages(element: HTMLElement, context: MarkdownPostProcessorContext): void {
        // 新增：检查文件路径是否应该处理
        if (!this.shouldProcessFile(context.sourcePath)) {
            logger.debug('[EditorImageLayout] 文件不在默认文件夹中或未启用自动布局，跳过', {
                sourcePath: context.sourcePath
            });
            return;
        }

        // 冷却时间检查
        const now = Date.now();
        if (now - this.lastProcessedTime < this.PROCESS_COOLDOWN) {
            return;
        }

        logger.debug('[EditorImageLayout] 开始处理图片', {
            elementTag: element.tagName,
            elementClasses: element.className,
            sourcePath: context.sourcePath
        });

        // 查找所有未处理的图片
        const images = Array.from(element.querySelectorAll('img:not(.diary-processed)'))
            .filter(img => !(img as HTMLElement).closest('.diary-gallery')) as HTMLImageElement[];

        if (images.length === 0) {
            return;
        }

        logger.debug('[EditorImageLayout] 找到未处理的图片', { count: images.length });

        // 将连续的图片分组
        const imageGroups = this.groupConsecutiveImages(images);
        logger.log('[EditorImageLayout] 图片分组完成', {
            groups: imageGroups.length,
            groupSizes: imageGroups.map(g => g.length)
        });

        // 为每组图片应用布局（只做包装，布局交给 CSS）
        imageGroups.forEach((group, index) => {
            if (group.length >= 1) {
                logger.debug(`[EditorImageLayout] 处理第 ${index + 1} 组图片`, { count: group.length });
                this.wrapImageGroup(group);
            }
        });

        this.lastProcessedTime = Date.now();
        logger.debug('[EditorImageLayout] 图片处理完成');
    }

    /**
     * 将连续的图片分组
     * 优化：优先检查是否在同一段落中（更健壮）
     */
    private groupConsecutiveImages(images: HTMLImageElement[]): HTMLImageElement[][] {
        const groups: HTMLImageElement[][] = [];
        let currentGroup: HTMLImageElement[] = [];

        images.forEach((img) => {
            // 检查图片是否连续
            if (currentGroup.length === 0 || this.areImagesConsecutive(currentGroup[currentGroup.length - 1], img)) {
                currentGroup.push(img);
            } else {
                if (currentGroup.length > 0) {
                    groups.push(currentGroup);
                }
                currentGroup = [img];
            }
        });

        if (currentGroup.length > 0) {
            groups.push(currentGroup);
        }

        return groups;
    }

    /**
     * 检查两张图片是否连续
     * 优化：优先检查是否在同一段落中（Obsidian 会将连续图片放在同一 <p> 中）
     */
    private areImagesConsecutive(img1: HTMLImageElement, img2: HTMLImageElement): boolean {
        // 策略1：检查是否在同一段落中（最可靠）
        const paragraph1 = img1.closest('p');
        const paragraph2 = img2.closest('p');
        if (paragraph1 && paragraph2 && paragraph1 === paragraph2) {
            return true;
        }

        // 策略2：检查是否在同一父元素中
        const parent1 = img1.parentElement;
        const parent2 = img2.parentElement;
        if (parent1 === parent2) {
            return true;
        }

        // 策略3：检查是否相邻的兄弟元素（考虑中间可能有空白文本节点）
        if (parent1 && parent2) {
            // 检查直接相邻
            if (parent1.nextElementSibling === parent2) {
                return true;
            }
            // 检查中间只有空白文本节点
            let current: Node | null = parent1.nextSibling;
            while (current) {
                if (current === parent2) {
                    return true;
                }
                // 如果是文本节点，检查是否只有空白
                if (current.nodeType === Node.TEXT_NODE) {
                    const text = current.textContent?.trim() || '';
                    if (text !== '') {
                        break; // 中间有非空白文本，不连续
                    }
                } else if (current.nodeType === Node.ELEMENT_NODE) {
                    // 中间有其他元素，不连续
                    break;
                }
                current = current.nextSibling;
            }
        }

        return false;
    }

    /**
     * 为图片组应用布局
     * 关键修复：
     * 1. 保留图片的原始 data-pos 属性，让 CodeMirror 能够识别
     * 2. 检查是否可以将新图片添加到现有的 gallery 容器中
     */
    private wrapImageGroup(images: HTMLImageElement[]): void {
        if (images.length === 0) return;

        // 检查是否已经处理过（避免重复处理）- 更严格的检查
        for (const img of images) {
            if (img.closest('.diary-gallery') || img.classList.contains('diary-processed')) {
                logger.debug('[EditorImageLayout] 图片组已处理过，跳过');
                return;
            }
        }

        // 获取第一张图片的父元素
        const firstImg = images[0];
        const parent = firstImg.parentElement;
        if (!parent) {
            logger.error('[EditorImageLayout] 无法获取图片父元素');
            return;
        }

        // 关键修复：检查前面是否有现有的 gallery 容器可以合并
        const existingGallery = this.findAdjacentGallery(firstImg);
        if (existingGallery) {
            logger.debug('[EditorImageLayout] 找到相邻的 gallery 容器，合并图片', {
                existingCount: parseInt(existingGallery.getAttribute('data-count') || '0'),
                newCount: images.length
            });
            this.addImagesToExistingGallery(images, existingGallery);
            return;
        }

        // 保存插入位置：第一张图片的位置（在移动之前）
        const insertBefore = firstImg.nextSibling;

        logger.debug('[EditorImageLayout] 开始包装图片组', {
            count: images.length,
            firstImgSrc: images[0].src?.substring(0, 50),
            parentTag: parent.tagName
        });

        // 创建新容器
        const container = document.createElement('div');
        container.addClass('diary-gallery');
        const count = images.length;
        container.setAttribute('data-count', count.toString());

        // 关键改进：先插入容器（空容器），再移动图片
        try {
            if (insertBefore && insertBefore.parentNode === parent) {
                parent.insertBefore(container, insertBefore);
            } else {
                parent.insertBefore(container, firstImg);
            }
        } catch (error) {
            // 如果插入失败，尝试追加
            try {
                parent.insertBefore(container, firstImg);
            } catch (e) {
                parent.appendChild(container);
            }
        }

        // 将图片移动到容器中（标记为已处理）
        this.organizeImagesInContainer(images, container);

        logger.log('[EditorImageLayout] 成功包装图片组', {
            count: count,
            containerCreated: !!container.parentElement
        });
    }

    /**
     * 查找与图片相邻的现有 gallery 容器
     * 关键修复：支持跨父元素查找（处理 internal-embed 的情况）
     */
    private findAdjacentGallery(img: HTMLImageElement): HTMLElement | null {
        const parent = img.parentElement;
        if (!parent) return null;

        // 策略1：检查同一父元素中，图片前面的兄弟元素
        let current: Node | null = img.previousSibling;
        while (current) {
            if (current.nodeType === Node.ELEMENT_NODE) {
                const element = current as HTMLElement;
                // 如果找到 gallery 容器
                if (element.classList.contains('diary-gallery')) {
                    return element;
                }
                // 如果中间有其他非空白元素，停止搜索
                if (element.tagName !== 'BR' && element.textContent?.trim()) {
                    break;
                }
            } else if (current.nodeType === Node.TEXT_NODE) {
                // 如果中间有非空白文本，停止搜索
                if (current.textContent?.trim()) {
                    break;
                }
            }
            current = current.previousSibling;
        }

        // 策略2：检查父元素的兄弟元素（处理 internal-embed 的情况）
        // 在 Obsidian 中，每张图片可能被包装在独立的 internal-embed div 中
        let currentParent: Node | null = parent;
        while (currentParent && currentParent.parentElement) {
            const parentElement = currentParent.parentElement;
            let sibling: Node | null = currentParent.previousSibling;

            while (sibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE) {
                    const element = sibling as HTMLElement;

                    // 如果找到 gallery 容器
                    if (element.classList.contains('diary-gallery')) {
                        return element;
                    }

                    // 如果找到包含 gallery 的元素（比如 internal-embed）
                    const gallery = element.querySelector('.diary-gallery') as HTMLElement;
                    if (gallery) {
                        return gallery;
                    }

                    // 如果中间有其他非图片内容，停止搜索
                    // 但允许 internal-embed、cm-line 等容器元素
                    if (element.textContent?.trim() &&
                        !element.classList.contains('internal-embed') &&
                        !element.classList.contains('media-embed') &&
                        !element.classList.contains('image-embed') &&
                        !element.classList.contains('cm-line') &&
                        !element.querySelector('img')) {
                        break;
                    }
                } else if (sibling.nodeType === Node.TEXT_NODE) {
                    // 如果中间有非空白文本，停止搜索
                    if (sibling.textContent?.trim()) {
                        break;
                    }
                }
                sibling = sibling.previousSibling;
            }

            // 继续向上查找
            currentParent = currentParent.parentElement;

            // 如果到达了 cm-content 层级，停止向上查找
            if (currentParent && currentParent instanceof HTMLElement && currentParent.classList.contains('cm-content')) {
                break;
            }
        }

        return null;
    }

    /**
     * 将新图片添加到现有的 gallery 容器中
     */
    private addImagesToExistingGallery(images: HTMLImageElement[], gallery: HTMLElement): void {
        // 获取现有图片数量
        const existingCount = parseInt(gallery.getAttribute('data-count') || '0');
        const newCount = existingCount + images.length;

        // 更新容器计数
        gallery.setAttribute('data-count', newCount.toString());

        // 获取现有容器中的所有图片
        const existingImages = Array.from(gallery.querySelectorAll('img.diary-processed')) as HTMLImageElement[];

        // 合并所有图片（现有 + 新增）
        const allImages = [...existingImages, ...images];

        // 清空容器（保留结构）
        gallery.innerHTML = '';

        // 重新组织所有图片
        this.organizeImagesInContainer(allImages, gallery);

        logger.log('[EditorImageLayout] 成功合并图片到现有容器', {
            existingCount: existingCount,
            newCount: images.length,
            totalCount: newCount
        });
    }

    /**
     * 在容器中组织图片布局
     */
    private organizeImagesInContainer(images: HTMLImageElement[], container: HTMLElement): void {
        const count = images.length;

        // 关键：保留每张图片的所有原始属性，特别是 data-pos 等 CodeMirror 需要的属性
        if (count === 4) {
            // 第一张：左半边大图
            const img1 = images[0];
            this.moveImageToContainer(img1, container);

            // 第二张：右半边上半部分
            const img2 = images[1];
            this.moveImageToContainer(img2, container);

            // 第三、四张：右半边下半部分，需要嵌套容器
            const bottomWrapper = document.createElement('div');
            bottomWrapper.addClass('diary-gallery-bottom');
            const img3 = images[2];
            const img4 = images[3];
            this.moveImageToContainer(img3, bottomWrapper);
            this.moveImageToContainer(img4, bottomWrapper);
            container.appendChild(bottomWrapper);
        } else if (count >= 5) {
            // 5+ 张图片：第一张单独，其余放在右边 2x2 网格中
            const img1 = images[0];
            this.moveImageToContainer(img1, container);

            // 创建右边 2x2 网格容器
            const rightGrid = document.createElement('div');
            rightGrid.addClass('diary-gallery-right-grid');

            // 添加第 2-5 张图片到网格
            for (let i = 1; i < Math.min(count, 5); i++) {
                const img = images[i];
                this.moveImageToContainer(img, rightGrid);
                // 如果超过 5 张，为第 5 张添加剩余数量信息
                if (count > 5 && i === 4) {
                    img.setAttribute('data-remaining', (count - 5).toString());
                }
            }
            container.appendChild(rightGrid);
        } else {
            // 1-3 张图片：直接添加
            images.forEach((img) => {
                this.moveImageToContainer(img, container);
            });
        }
    }

    /**
     * 移动图片到容器，保留所有原始属性
     */
    private moveImageToContainer(img: HTMLImageElement, container: HTMLElement): void {
        // 保存所有原始属性（特别是 CodeMirror 需要的 data-pos 等）
        const originalAttributes: { [key: string]: string | null } = {};
        for (let i = 0; i < img.attributes.length; i++) {
            const attr = img.attributes[i];
            originalAttributes[attr.name] = attr.value;
        }

        // 标记为已处理
        img.addClass('diary-processed');

        // 移动到容器
        container.appendChild(img);

        // 确保所有原始属性都被保留
        Object.keys(originalAttributes).forEach(key => {
            if (originalAttributes[key] !== null) {
                img.setAttribute(key, originalAttributes[key]!);
            }
        });
    }
}
