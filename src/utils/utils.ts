import { TFile, App } from 'obsidian';
import { strings } from '../i18n';

export interface ImageInfo {
	name: string;
	path: string;
	url: string;
	altText?: string;
	position: number;
	/** Image file mtime for thumbnail cache key (optional for backward compat) */
	mtime?: number;
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
 * Extract image info from Markdown content
 */
export function extractImagesFromContent(
	content: string,
	file: TFile,
	app: App
): ImageInfo[] {
	const images: ImageInfo[] = [];

	// 1. Extract Wikilink format: ![[image.png]] or ![[image.png|100x100]]
	const wikiLinkRegex = /!\[\[([^\]]+)\]\]/g;
	let match;

	while ((match = wikiLinkRegex.exec(content)) !== null) {
		const imageRef = match[1];
		const position = match.index;

		// Handle size format: image.png|100x100
		const [imageName] = imageRef.split('|');

		// Use Obsidian API to resolve image path
		const imageFile = app.metadataCache.getFirstLinkpathDest(
			imageName.trim(),
			file.path
		);

		if (imageFile && imageFile instanceof TFile) {
			// Check if it's an image file
			const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
			const isImage = imageExtensions.includes(imageFile.extension.toLowerCase());

			if (isImage) {
				try {
					const resourcePath = app.vault.getResourcePath(imageFile);
					images.push({
						name: imageName.trim(),
						path: imageFile.path,
						url: resourcePath,
						position: position,
						mtime: imageFile.stat.mtime,
					});
				} catch (error) {
					console.warn(`Failed to get resource path for image ${imageFile.path}:`, error);
				}
			}
		}
	}

	// 2. Extract standard Markdown format: ![alt text](path/to/image.png)
	const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
	while ((match = markdownImageRegex.exec(content)) !== null) {
		const altText = match[1];
		const imagePath = match[2];
		const position = match.index;

		// Skip external links
		if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
			continue;
		}

		// Handle relative and absolute paths
		let imageFile: TFile | null = null;

		if (imagePath.startsWith('/')) {
			// Absolute path (relative to vault root)
			imageFile = app.vault.getAbstractFileByPath(
				imagePath.slice(1)
			) as TFile;
		} else {
			// Relative path
			const fileDir = file.parent?.path || '';
			const fullPath = fileDir ? `${fileDir}/${imagePath}` : imagePath;
			// Normalize path
			const normalizedPath = fullPath.split('/').filter(p => p !== '.').join('/');
			imageFile = app.vault.getAbstractFileByPath(normalizedPath) as TFile;
		}

		if (imageFile && imageFile instanceof TFile) {
			// Check if it's an image file
			const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];
			const isImage = imageExtensions.includes(imageFile.extension.toLowerCase());

			if (isImage) {
				try {
					const resourcePath = app.vault.getResourcePath(imageFile);
					images.push({
						name: imageFile.basename,
						path: imageFile.path,
						url: resourcePath,
						altText: altText || undefined,
						position: position,
						mtime: imageFile.stat.mtime,
					});
				} catch (error) {
					console.warn(`Failed to get resource path for image ${imageFile.path}:`, error);
				}
			}
		}
	}

	// Sort by position in original text
	return images.sort((a, b) => a.position - b.position);
}

/**
 * Parse date value
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
 * Extract date from file
 * Priority 1: Frontmatter (custom field or date/Date/created/created_time)
 * Priority 2: File creation time
 */
export function extractDate(file: TFile, content: string, app: App, customDateField?: string): Date | null {
	// Priority 1: Extract from frontmatter
	const metadata = app.metadataCache.getFileCache(file);
	if (metadata?.frontmatter) {
		// If custom date field specified, use it first
		if (customDateField && metadata.frontmatter[customDateField]) {
			const parsed = parseDate(metadata.frontmatter[customDateField]);
			if (parsed) return parsed;
		}

		// If no custom field or no value, use default date field list
		if (!customDateField) {
			const dateFields = ['date', 'Date', 'created', 'created_time'] as const;
			for (const field of dateFields) {
				if (metadata.frontmatter[field]) {
					const parsed = parseDate(metadata.frontmatter[field]);
					if (parsed) return parsed;
				}
			}
		}
	}

	// Priority 2: File creation time
	return new Date(file.stat.ctime);
}

/**
 * Extract title from content
 * Uses filename as title
 */
export function extractTitle(content: string, fileName: string, app: App, file: TFile): string {
	return fileName;
}

/**
 * Generate content preview
 */
export function generatePreview(content: string, maxLength: number): string {
	// Remove frontmatter
	const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, '');
	// Remove image markers
	const withoutImages = withoutFrontmatter.replace(
		/!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)]+\)/g,
		''
	);
	// Remove header markers
	const withoutHeaders = withoutImages.replace(/^#+\s+/gm, '');
	// Extract plain text
	const text = withoutHeaders.replace(/[#*_`~\[\]()]/g, '').trim();

	if (text.length <= maxLength) {
		return text;
	}

	return text.substring(0, maxLength) + '...';
}

/**
 * Count words
 */
export function countWords(content: string): number {
	// Remove frontmatter
	const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, '');
	// Remove Markdown syntax
	const text = withoutFrontmatter.replace(/[#*_`~\[\]()!]/g, '');
	// Chinese chars count by character; English by word
	const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
	const englishWords = text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w))
		.length;
	return chineseChars + englishWords;
}

/**
 * Format date display (per current language)
 */
export function formatDate(date: Date): string {
	return strings.formatDate(date);
}

/**
 * Check if two dates are the same day
 */
function isSameDay(date1: Date, date2: Date): boolean {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
}

/**
 * Group entries by month, with today and yesterday as separate groups
 */
export function groupByMonth(
	entries: JournalEntry[]
): Record<string, JournalEntry[]> {
	const grouped: Record<string, JournalEntry[]> = {};

	// Get today and yesterday dates (compare YMD only, ignore time)
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	for (const entry of entries) {
		// Set entry date to 0:00:00 for YMD-only comparison
		const entryDate = new Date(entry.date);
		entryDate.setHours(0, 0, 0, 0);

		let groupKey: string;

		if (isSameDay(entryDate, today)) {
			groupKey = strings.dateGroups.today;
		} else if (isSameDay(entryDate, yesterday)) {
			groupKey = strings.dateGroups.yesterday;
		} else {
			groupKey = strings.formatMonthGroupKey(entryDate.getFullYear(), entryDate.getMonth());
		}

		if (!grouped[groupKey]) {
			grouped[groupKey] = [];
		}
		grouped[groupKey].push(entry);
	}

	return grouped;
}
