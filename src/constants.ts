/**
 * Plugin constants
 */

// Pagination
export const PAGINATION = {
	ITEMS_PER_PAGE: 20,
	BATCH_SIZE: 10,
} as const;

// Content processing
export const CONTENT = {
	MAX_PREVIEW_LENGTH: 200,
	MAX_CONTENT_READ_LENGTH: 2000, // N chars to read when metadata-first loading
	MAX_IMAGES_PER_CARD: 5,
} as const;

// Image lazy loading
export const IMAGE_LOADING = {
	ROOT_MARGIN: '50px',
	LAZY_LOADING: true,
} as const;

// UI delays
export const UI_DELAYS = {
	FILE_OPEN_DELAY: 100, // File open delay (ms)
	RENDER_DELAY: 50, // Render delay (ms)
	SCAN_DELAY: 100, // Scan delay (ms)
} as const;

// Logging
export const LOGGING = {
	ENABLED: true, // Set true for debugging
	PREFIX: '[JournalView]',
	/** Log thumbnail cache hits/misses and generation (set true to debug IndexedDB) */
	THUMBNAIL: true,
} as const;

// File filter
export const FILE_FILTER = {
	EXCLUDED_PREFIXES: ['.'],
	EXCLUDED_NAMES: ['手记视图'],
} as const;

// Date fields
export const DATE_FIELDS = ['date', 'Date', 'created', 'created_time'] as const;
