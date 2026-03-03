export const DB_NAME_PREFIX = 'journal-view-react';
export const STORE_NAME = 'journal-entries';
export const THUMBNAIL_STORE_NAME = 'journal-thumbnails';
export const DB_VERSION = 2; // Bump for thumbnail store

export const CACHE_HYDRATION_BATCH_SIZE = 500;

/** Thumbnail limits - 960×540 for single-image cards (large on mobile), 0.92 quality. Bump keyVersion to force regen. */
export const THUMBNAIL = {
	maxWidth: 1080,
	maxHeight: 1080,
	output: { mimeType: 'image/webp' as const, iosMimeType: 'image/png' as const, quality: 0.92 },
	keyVersion: 6,
	/** Max IndexedDB storage for thumbnails (bytes). LRU eviction when over. */
	storageQuotaBytes: 200 * 1024 * 1024, // 200 MB
	/** Max in-memory cached blobs (LRU) */
	cacheMaxEntries: 200,
	/** Throttle ms before retry regenerate (reference nn FEATURE_IMAGE_REGEN_THROTTLE) */
	regenThrottleMs: 5000,
	/** Max concurrent thumbnail generation */
	parallelLimit: 6,
	/** Max keys to prewarm from IndexedDB on entries load */
	prewarmMaxKeys: 150,
	/** Max pixels decoded concurrently (reference nn imageDecodeBudgetPixels) - prevents decode storms during scroll */
	imageDecodeBudgetPixels: {
		mobile: 100_000_000,
		desktop: Number.MAX_SAFE_INTEGER,
	},
} as const;
