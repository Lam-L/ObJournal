import { TFile, App } from 'obsidian';

export interface ImageInfo {
	name: string;
	path: string;
	url: string;
	altText?: string;
	position: number;
}

export interface JournalEntry {
	file: TFile;
	date: Date;
	images: ImageInfo[];
	content: string;
	preview: string;
	wordCount: number;
	title: string;
}

/**
 * 从 Markdown 正文中提取图片信息
 */
export function extractImagesFromContent(
	content: string,
	file: TFile,
	app: App
): ImageInfo[] {
	const images: ImageInfo[] = [];

	// 1. 提取 Wikilink 格式: ![[image.png]] 或 ![[image.png|100x100]]
	const wikiLinkRegex = /!\[\[([^\]]+)\]\]/g;
	let match;

	while ((match = wikiLinkRegex.exec(content)) !== null) {
		const imageRef = match[1];
		const position = match.index;

		// 处理带尺寸的格式: image.png|100x100
		const [imageName] = imageRef.split('|');

		// 使用 Obsidian API 解析图片路径
		const imageFile = app.metadataCache.getFirstLinkpathDest(
			imageName.trim(),
			file.path
		);

		if (imageFile && imageFile instanceof TFile) {
			images.push({
				name: imageName.trim(),
				path: imageFile.path,
				url: app.vault.getResourcePath(imageFile),
				position: position,
			});
		}
	}

	// 2. 提取标准 Markdown 格式: ![alt text](path/to/image.png)
	const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
	while ((match = markdownImageRegex.exec(content)) !== null) {
		const altText = match[1];
		const imagePath = match[2];
		const position = match.index;

		// 跳过外部链接
		if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
			continue;
		}

		// 处理相对路径和绝对路径
		let imageFile: TFile | null = null;

		if (imagePath.startsWith('/')) {
			// 绝对路径（相对于 vault 根目录）
			imageFile = app.vault.getAbstractFileByPath(
				imagePath.slice(1)
			) as TFile;
		} else {
			// 相对路径
			const fileDir = file.parent?.path || '';
			const fullPath = fileDir ? `${fileDir}/${imagePath}` : imagePath;
			// 规范化路径
			const normalizedPath = fullPath.split('/').filter(p => p !== '.').join('/');
			imageFile = app.vault.getAbstractFileByPath(normalizedPath) as TFile;
		}

		if (imageFile && imageFile instanceof TFile) {
			images.push({
				name: imageFile.basename,
				path: imageFile.path,
				url: app.vault.getResourcePath(imageFile),
				altText: altText || undefined,
				position: position,
			});
		}
	}

	// 按在原文中的位置排序
	return images.sort((a, b) => a.position - b.position);
}

/**
 * 从文件名提取日期
 */
function parseDateFromFileName(fileName: string): Date | null {
	// ISO 格式: 2026-01-12
	const isoMatch = fileName.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (isoMatch) {
		return new Date(
			parseInt(isoMatch[1]),
			parseInt(isoMatch[2]) - 1,
			parseInt(isoMatch[3])
		);
	}

	// 中文格式: 2026年1月12日
	const chineseMatch = fileName.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
	if (chineseMatch) {
		return new Date(
			parseInt(chineseMatch[1]),
			parseInt(chineseMatch[2]) - 1,
			parseInt(chineseMatch[3])
		);
	}

	// 点分隔: 2026.01.12
	const dotMatch = fileName.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/);
	if (dotMatch) {
		return new Date(
			parseInt(dotMatch[1]),
			parseInt(dotMatch[2]) - 1,
			parseInt(dotMatch[3])
		);
	}

	return null;
}

/**
 * 从正文内容提取日期
 */
function parseDateFromContent(content: string): Date | null {
	// 匹配多种日期格式
	const patterns = [
		/(\d{4})年(\d{1,2})月(\d{1,2})日/, // 2026年1月12日
		/(\d{4})-(\d{1,2})-(\d{1,2})/, // 2026-01-12
		/(\d{4})\/(\d{1,2})\/(\d{1,2})/, // 2026/01/12
	];

	for (const pattern of patterns) {
		const match = content.match(pattern);
		if (match) {
			return new Date(
				parseInt(match[1]),
				parseInt(match[2]) - 1,
				parseInt(match[3])
			);
		}
	}

	return null;
}

/**
 * 解析日期值
 */
export function parseDate(dateValue: any): Date | null {
	if (!dateValue) return null;

	if (dateValue instanceof Date) {
		return dateValue;
	}

	if (typeof dateValue === 'string') {
		const parsed = new Date(dateValue);
		if (!isNaN(parsed.getTime())) {
			return parsed;
		}
	}

	return null;
}

/**
 * 从文件提取日期（多种策略）
 */
export function extractDate(file: TFile, content: string, app: App): Date | null {
	// 策略1: 从文件名提取日期
	const fileNameDate = parseDateFromFileName(file.basename);
	if (fileNameDate) return fileNameDate;

	// 策略2: 从 frontmatter 提取
	const metadata = app.metadataCache.getFileCache(file);
	if (metadata?.frontmatter) {
		// 使用常量配置的日期字段
		const dateFields = ['date', 'Date', 'created', 'created_time'] as const;
		for (const field of dateFields) {
			if (metadata.frontmatter[field]) {
				const parsed = parseDate(metadata.frontmatter[field]);
				if (parsed) return parsed;
			}
		}
	}

	// 策略3: 从正文内容提取（支持中文格式）
	const contentDate = parseDateFromContent(content);
	if (contentDate) return contentDate;

	// 策略4: 使用文件创建时间
	return new Date(file.stat.ctime);
}

/**
 * 从内容中提取标题
 */
export function extractTitle(content: string, fileName: string, app: App, file: TFile): string {
	// 策略1: 从 frontmatter 提取
	const metadata = app.metadataCache.getFileCache(file);
	if (metadata?.frontmatter?.title) {
		return metadata.frontmatter.title;
	}

	// 策略2: 提取第一个 H1 标题
	const h1Match = content.match(/^#\s+(.+)$/m);
	if (h1Match) {
		return h1Match[1].trim();
	}

	// 策略3: 提取第一个 H2 标题（如果没有 H1）
	const h2Match = content.match(/^##\s+(.+)$/m);
	if (h2Match) {
		return h2Match[1].trim();
	}

	// 策略4: 使用文件名（去掉扩展名）
	return fileName;
}

/**
 * 生成内容预览
 */
export function generatePreview(content: string, maxLength: number): string {
	// 移除 frontmatter
	const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, '');
	// 移除图片标记
	const withoutImages = withoutFrontmatter.replace(
		/!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)/g,
		''
	);
	// 移除标题标记
	const withoutHeaders = withoutImages.replace(/^#+\s+/gm, '');
	// 提取纯文本
	const text = withoutHeaders.replace(/[#*_`~\[\]()]/g, '').trim();

	if (text.length <= maxLength) {
		return text;
	}

	return text.substring(0, maxLength) + '...';
}

/**
 * 统计字数
 */
export function countWords(content: string): number {
	// 移除 frontmatter
	const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, '');
	// 移除 Markdown 语法
	const text = withoutFrontmatter.replace(/[#*_`~\[\]()!]/g, '');
	// 中文字符按字计算，英文按词计算
	const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
	const englishWords = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w))
		.length;
	return chineseChars + englishWords;
}

/**
 * 格式化日期显示
 */
export function formatDate(date: Date): string {
	const weekdays = [
		'星期日',
		'星期一',
		'星期二',
		'星期三',
		'星期四',
		'星期五',
		'星期六',
	];
	return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${
		weekdays[date.getDay()]
	}`;
}

/**
 * 按月份分组条目
 */
export function groupByMonth(
	entries: JournalEntry[]
): Record<string, JournalEntry[]> {
	const grouped: Record<string, JournalEntry[]> = {};

	for (const entry of entries) {
		const monthKey = `${entry.date.getFullYear()}年${
			entry.date.getMonth() + 1
		}月`;
		if (!grouped[monthKey]) {
			grouped[monthKey] = [];
		}
		grouped[monthKey].push(entry);
	}

	return grouped;
}
