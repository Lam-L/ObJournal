/**
 * Serializable journal entry cache structure for IndexedDB persistence
 * Note: Does not store TFile or full content; TFile is resolved via path at render time
 */
export interface CachedImageInfo {
	name: string;
	path: string;
	/** Store path only; generate url via app.vault.getResourcePath at render time to avoid cross-session invalidation */
	url?: string;
	altText?: string;
	position: number;
	mtime?: number;
}

export interface CachedJournalEntry {
	path: string;
	mtime: number;
	ctime: number; // For sorting (by creation time when date is same)
	dateIso: string;
	title: string;
	preview: string;
	wordCount: number;
	images: CachedImageInfo[];
	/** Date field used when extracting date (folder-specific). Invalidate cache when it changes. */
	dateFieldUsed?: string;
	/** Bump when image extraction logic changes (e.g. external URL support). Missing = stale. */
	imageExtractionVersion?: number;
}
