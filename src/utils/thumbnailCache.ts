/**
 * In-memory LRU cache for thumbnail blobs (reference notebook-navigator FeatureImageBlobCache).
 * Caches Blobs, not URLs - component creates URL and revokes on unmount.
 */
import { THUMBNAIL } from '../storage/constants';

const MAX = THUMBNAIL.cacheMaxEntries;

export class ThumbnailBlobCache {
	private entries = new Map<string, Blob>();

	get(key: string): Blob | null {
		const blob = this.entries.get(key);
		if (!blob) return null;
		// LRU: move to end (most recently used)
		this.entries.delete(key);
		this.entries.set(key, blob);
		return blob;
	}

	set(key: string, blob: Blob): void {
		if (this.entries.has(key)) this.entries.delete(key);
		this.entries.set(key, blob);
		this.evict();
	}

	private evict(): void {
		while (this.entries.size > MAX) {
			const first = this.entries.keys().next().value;
			if (first) this.entries.delete(first);
		}
	}

	remove(key: string): void {
		this.entries.delete(key);
	}

	removeMany(keys: string[]): void {
		for (const k of keys) this.entries.delete(k);
	}
}

export const thumbnailBlobCache = new ThumbnailBlobCache();
