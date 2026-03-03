/**
 * Prewarm thumbnail blob cache when entries load (reference nn storage sync + Content Provider).
 * Batch fetches from IndexedDB so ImageItems hit memory cache on first render / scroll.
 */
import { useEffect } from 'react';
import type { JournalEntry } from '../utils/utils';
import { getStorage } from '../storage/storageLifecycle';
import { getThumbnailKey, canGenerateThumbnail } from '../utils/thumbnailGenerator';
import { thumbnailBlobCache } from '../utils/thumbnailCache';
import { THUMBNAIL } from '../storage/constants';
import { LOGGING } from '../constants';

const PREWARM_MAX_KEYS = THUMBNAIL.prewarmMaxKeys;

function collectPrewarmKeys(entries: JournalEntry[]): string[] {
	const seen = new Set<string>();
	const keys: string[] = [];
	for (const entry of entries) {
		if (keys.length >= PREWARM_MAX_KEYS) break;
		for (const img of entry.images) {
			if (!img.path || !canGenerateThumbnail(img.path)) continue;
			const mtime = img.mtime ?? 0;
			const key = getThumbnailKey(img.path, mtime);
			if (seen.has(key)) continue;
			seen.add(key);
			keys.push(key);
			if (keys.length >= PREWARM_MAX_KEYS) break;
		}
	}
	return keys;
}

/** Fire-and-forget prewarm when entries change */
export function useThumbnailPrewarm(entries: JournalEntry[]): void {
	useEffect(() => {
		if (!entries.length) return;

		const keys = collectPrewarmKeys(entries);
		const toFetch = keys.filter((k) => !thumbnailBlobCache.get(k));
		if (!toFetch.length) return;

		const storage = getStorage();
		if (!storage) return;

		storage.getThumbnailBlobs(toFetch).then((map) => {
			for (const [key, blob] of map) thumbnailBlobCache.set(key, blob);
			if (LOGGING.THUMBNAIL && map.size > 0) {
				console.log(`${LOGGING.PREFIX} [缩略图] 预取: 请求 ${toFetch.length} 个，IndexedDB 命中 ${map.size} 个`);
			}
		});
	}, [entries]);
}
