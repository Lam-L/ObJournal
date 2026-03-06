import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { ImageInfo, JournalEntry } from '../utils/utils';
import type { CachedJournalEntry } from './types';
import { CREATION_ONLY_DATE_FIELD } from '../constants';
import { IMAGE_EXTRACTION_VERSION } from './constants';

/**
 * Normalize date field for cache comparison (creation-only = empty string)
 */
export function normalizeDateField(field: string | undefined): string {
	if (!field) return '';
	return field === CREATION_ONLY_DATE_FIELD ? '' : field;
}

/**
 * Convert JournalEntry to serializable CachedJournalEntry
 */
export function journalEntryToCached(entry: JournalEntry, dateFieldUsed?: string): CachedJournalEntry {
	return {
		path: entry.file.path,
		mtime: entry.file.stat.mtime,
		ctime: entry.file.stat.ctime,
		dateIso: entry.date.toISOString(),
		title: entry.title,
		preview: entry.preview,
		wordCount: entry.wordCount,
		images: entry.images.map((img) => ({
			name: img.name,
			path: img.path,
			url: img.url,
			altText: img.altText,
			position: img.position,
			mtime: img.mtime,
		})),
		dateFieldUsed: normalizeDateField(dateFieldUsed),
		imageExtractionVersion: IMAGE_EXTRACTION_VERSION,
	};
}

/**
 * Convert CachedJournalEntry to JournalEntry
 * Returns null if file has been deleted
 */
export function cachedToJournalEntry(
	cached: CachedJournalEntry,
	app: App
): JournalEntry | null {
	const file = app.vault.getAbstractFileByPath(cached.path);
	if (!(file instanceof TFile)) return null;

	// Obsidian getResourcePath returns session-scoped URL that becomes invalid after restart.
	// Never trust cached url; always resolve from path.
	// Resolve mtime from file when missing (older cache may lack it, needed for thumbnail key)
	// External images: img.path is URL, no vault file; use cached img.url
	const images: ImageInfo[] = cached.images.map((img) => {
		let url = '';
		let mtime = img.mtime ?? 0;
		const isExternal = img.path.startsWith('http://') || img.path.startsWith('https://');
		if (isExternal && img.url) {
			url = img.url;
		} else {
			const imgFile = app.vault.getAbstractFileByPath(img.path);
			if (imgFile && imgFile instanceof TFile) {
				try {
					url = app.vault.getResourcePath(imgFile);
				} catch {
					// ignore
				}
				if (mtime <= 0) mtime = imgFile.stat.mtime;
			}
		}
		return {
			name: img.name,
			path: img.path,
			url,
			altText: img.altText,
			position: img.position,
			mtime: mtime > 0 ? mtime : undefined,
		};
	});

	return {
		file,
		date: new Date(cached.dateIso),
		title: cached.title,
		content: '',
		images,
		preview: cached.preview,
		wordCount: cached.wordCount,
	};
}
