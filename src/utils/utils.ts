import { TFile, App } from 'obsidian';
import { strings } from '../i18n';
import { CREATION_ONLY_DATE_FIELD } from '../constants';

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
				} catch {
					// Skip on resource path failure
				}
			}
		}
	}

	// 2. Extract standard Markdown format: ![alt text](path/to/image.png) ![alt text](path/to/image.png)
	const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
	const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'];

	while ((match = markdownImageRegex.exec(content)) !== null) {
		const altText = match[1];
		const imagePath = match[2].trim();
		const position = match.index;

		// External URLs (http/https only for security)
		if (imagePath.startsWith('https://') || imagePath.startsWith('http://')) {
			try {
				const url = new URL(imagePath);
				// Reject non-http(s) protocols (e.g. javascript:, data:)
				if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
				const pathname = url.pathname;
				const ext = pathname.split('.').pop()?.toLowerCase().replace(/\?.*$/, '') || '';
				// Accept: has image extension, OR extensionless URLs (Google Photos, Imgur CDN, etc.)
				const hasImageExt = imageExtensions.includes(ext);
				const isKnownImageHost = /googleusercontent\.com|imgur\.com|ibb\.co|i\.postimg|cdn\./i.test(url.hostname);
				if (hasImageExt || isKnownImageHost || pathname.split('.').length <= 1) {
					const name = pathname.split('/').pop() || altText || 'image';
					images.push({
						name: name.replace(/\?.*$/, ''),
						path: imagePath,
						url: imagePath,
						altText: altText || undefined,
						position,
						mtime: undefined,
					});
				}
			} catch {
				// Invalid URL, skip
			}
			continue;
		}

		// Handle relative and absolute paths (vault files)
		let imageFile: TFile | null = null;

		if (imagePath.startsWith('/')) {
			// Absolute path (relative to vault root)
			const f = app.vault.getAbstractFileByPath(imagePath.slice(1));
			imageFile = f instanceof TFile ? f : null;
		} else {
			// Relative path
			const fileDir = file.parent?.path || '';
			const fullPath = fileDir ? `${fileDir}/${imagePath}` : imagePath;
			// Normalize path
			const normalizedPath = fullPath.split('/').filter(p => p !== '.').join('/');
			const f = app.vault.getAbstractFileByPath(normalizedPath);
			imageFile = f instanceof TFile ? f : null;
		}

		if (imageFile) {
			// Check if it's an image file
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
				} catch {
					// Skip on resource path failure
				}
			}
		}
	}

	// Sort by position in original text
	return images.sort((a, b) => a.position - b.position);
}

/**
 * Parse date value.
 * For YYYY-MM-DD strings: parse as local date to avoid timezone shift (new Date("YYYY-MM-DD") uses UTC, causing Today/Yesterday to show wrong in Western timezones).
 */
export function parseDate(dateValue: unknown): Date | null {
	if (!dateValue) return null;

	if (dateValue instanceof Date) {
		return dateValue;
	}

	if (typeof dateValue === 'string') {
		const trimmed = dateValue.trim();
		// Parse YYYY-MM-DD as local date to fix Today/Yesterday grouping in Western timezones
		const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})($|[ T])/);
		if (isoMatch) {
			const y = parseInt(isoMatch[1], 10);
			const m = parseInt(isoMatch[2], 10) - 1;
			const d = parseInt(isoMatch[3], 10);
			if (m >= 0 && m <= 11 && d >= 1 && d <= 31) {
				const parsed = new Date(y, m, d);
				if (!isNaN(parsed.getTime())) return parsed;
			}
		}
		const parsed = new Date(dateValue);
		if (!isNaN(parsed.getTime())) return parsed;
	}

	return null;
}

/**
 * Parse frontmatter field from raw content (fallback when metadataCache not ready)
 */
function getFrontmatterFromContent(content: string, key: string): unknown {
	const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
	if (!fmMatch) return undefined;
	const block = fmMatch[1];
	// Match "key: value" or "key: value" (value can be quoted or unquoted)
	const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*(.+)$`, 'm');
	const m = block.match(re);
	if (!m) return undefined;
	const val = m[1].trim();
	if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
		return val.slice(1, -1);
	}
	return val;
}

/**
 * Extract date from file
 * When customDateField === CREATION_ONLY_DATE_FIELD or empty: use file creation time only
 * Otherwise: use specified frontmatter field, fallback to file creation time
 */
export function extractDate(file: TFile, content: string, app: App, customDateField?: string): Date | null {
	// Use file creation time only when "no selection" or empty (legacy)
	if (!customDateField || customDateField === CREATION_ONLY_DATE_FIELD) {
		return new Date(file.stat.ctime);
	}

	// Try metadataCache first
	const metadata = app.metadataCache.getFileCache(file);
	const metadataVal = metadata?.frontmatter?.[customDateField];
	if (metadataVal !== undefined && metadataVal !== null) {
		const parsed = parseDate(metadataVal);
		if (parsed) return parsed;
	}

	// Fallback: parse from content (metadataCache may not be ready yet)
	const contentVal = getFrontmatterFromContent(content, customDateField);
	if (contentVal !== undefined) {
		const parsed = parseDate(contentVal);
		if (parsed) return parsed;
	}

	// Fallback: file creation time
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
