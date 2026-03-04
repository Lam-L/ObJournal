import {
	DB_NAME_PREFIX,
	DB_VERSION,
	STORE_NAME,
	THUMBNAIL_STORE_NAME,
	THUMBNAIL,
} from './constants';
import type { CachedJournalEntry } from './types';

type ThumbnailRecord = { blob: Blob; lastAccessedAt?: number };

/**
 * Wrap IndexedDB request as Promise
 */
function idbRequestToPromise<T>(request: IDBRequest<T>, fallback = 'IDB request failed'): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error || new Error(fallback));
	});
}

/**
 * IndexedDB persistent storage for journal view
 * - Stores CachedJournalEntry by path
 * - Supports batch read/write for cache hydration and incremental updates
 */
/** True when the DB connection is closing and new transactions must not be started */
function isDbClosingError(e: unknown): boolean {
	if (e instanceof DOMException && e.name === 'InvalidStateError') return true;
	return e instanceof Error && /database connection is closing/i.test(e.message);
}

export class JournalIndexedDBStorage {
	private db: IDBDatabase | null = null;
	private dbName: string;
	private initPromise: Promise<void> | null = null;
	private isClosing = false;

	constructor(appId: string) {
		this.dbName = `${DB_NAME_PREFIX}/cache/${appId}`;
	}

	private canUseDb(): boolean {
		return !!this.db && !this.isClosing;
	}

	async init(): Promise<void> {
		if (this.db) return;
		if (this.initPromise) return this.initPromise;
		if (this.isClosing) return;

		this.initPromise = new Promise<void>((resolve, reject) => {
			const request = indexedDB.open(this.dbName, DB_VERSION);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};
			request.onupgradeneeded = (e) => {
				const db = (e.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME, { keyPath: 'path' });
				}
				if (!db.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
					db.createObjectStore(THUMBNAIL_STORE_NAME);
				}
			};
		});

		return this.initPromise;
	}


	/**
	 * Batch get cached entries by paths
	 */
	async getMany(paths: string[]): Promise<Map<string, CachedJournalEntry>> {
		if (!this.canUseDb()) return new Map();
		const result = new Map<string, CachedJournalEntry>();
		let store: IDBObjectStore;
		try {
			store = this.db!.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME);
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return new Map();
			throw e;
		}

		// Parallel get, but avoid excessive concurrency
		const batchSize = 100;
		for (let i = 0; i < paths.length; i += batchSize) {
			const batch = paths.slice(i, i + batchSize);
			const entries = await Promise.all(
				batch.map((path) =>
					idbRequestToPromise(store.get(path), `get ${path}`).then(
						(row: CachedJournalEntry | undefined) => (row ? [path, row] as const : null)
					)
				)
			);
			for (const item of entries) {
				if (item) result.set(item[0], item[1]);
			}
		}
		return result;
	}

	private async finishTransaction(tx: IDBTransaction): Promise<void> {
		return new Promise((resolve, reject) => {
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
			tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
		});
	}

	/**
	 * Write single entry
	 */
	async put(entry: CachedJournalEntry): Promise<void> {
		if (!this.canUseDb()) return;
		try {
			const tx = this.db!.transaction([STORE_NAME], 'readwrite');
			tx.objectStore(STORE_NAME).put(entry);
			await this.finishTransaction(tx);
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return;
			throw e;
		}
	}

	/**
	 * Batch write
	 */
	async batchPut(entries: CachedJournalEntry[]): Promise<void> {
		if (!this.canUseDb() || entries.length === 0) return;
		try {
			const tx = this.db!.transaction([STORE_NAME], 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			for (const entry of entries) {
				store.put(entry);
			}
			await this.finishTransaction(tx);
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return;
			throw e;
		}
	}

	/**
	 * Delete single entry
	 */
	async delete(path: string): Promise<void> {
		if (!this.canUseDb()) return;
		try {
			const tx = this.db!.transaction([STORE_NAME], 'readwrite');
			tx.objectStore(STORE_NAME).delete(path);
			await this.finishTransaction(tx);
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return;
			throw e;
		}
	}

	/**
	 * Batch delete
	 */
	async batchDelete(paths: string[]): Promise<void> {
		if (!this.canUseDb() || paths.length === 0) return;
		try {
			const tx = this.db!.transaction([STORE_NAME], 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			for (const path of paths) {
				store.delete(path);
			}
			await this.finishTransaction(tx);
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return;
			throw e;
		}
	}

	/**
	 * Batch read all entries (for hydration or full scan)
	 */
	async getAllKeys(): Promise<string[]> {
		if (!this.canUseDb()) return [];
		try {
			const store = this.db!.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME);
			const keys = await idbRequestToPromise(store.getAllKeys(), 'getAllKeys failed');
			return keys as string[];
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return [];
			throw e;
		}
	}

	/**
	 * Batch read by paths (for current folder cache-first load)
	 * Uses getMany since we know paths.
	 */
	async getByPaths(paths: string[]): Promise<Map<string, CachedJournalEntry>> {
		return this.getMany(paths);
	}

	/**
	 * Clear entire cache (entries + thumbnails)
	 */
	async clear(): Promise<void> {
		if (!this.canUseDb()) return;
		try {
			const storeNames = this.db!.objectStoreNames.contains(THUMBNAIL_STORE_NAME)
				? [STORE_NAME, THUMBNAIL_STORE_NAME]
				: [STORE_NAME];
			const tx = this.db!.transaction(storeNames, 'readwrite');
			tx.objectStore(STORE_NAME).clear();
			if (storeNames.includes(THUMBNAIL_STORE_NAME)) {
				tx.objectStore(THUMBNAIL_STORE_NAME).clear();
			}
			await this.finishTransaction(tx);
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return;
			throw e;
		}
	}

	// ========== Thumbnail blob store ==========

	/** Get thumbnail blob by key (path@mtime) */
	async getThumbnailBlob(key: string): Promise<Blob | null> {
		if (!this.canUseDb()) return null;
		try {
			const tx = this.db!.transaction([THUMBNAIL_STORE_NAME], 'readonly');
			const store = tx.objectStore(THUMBNAIL_STORE_NAME);
			const record = await idbRequestToPromise<ThumbnailRecord | undefined>(store.get(key), `getThumbnail ${key}`);
			if (record?.blob instanceof Blob && record.blob.size > 0) {
				this.touchThumbnail(key, record.blob);
				return record.blob;
			}
			return null;
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return null;
			throw e;
		}
	}

	/** Batch get thumbnail blobs (single transaction, reference nn preload) */
	async getThumbnailBlobs(keys: string[]): Promise<Map<string, Blob>> {
		if (!this.canUseDb() || keys.length === 0) return new Map();
		try {
			const tx = this.db!.transaction([THUMBNAIL_STORE_NAME], 'readonly');
			const store = tx.objectStore(THUMBNAIL_STORE_NAME);
			const results = await Promise.all(
				keys.map((key) =>
					idbRequestToPromise<ThumbnailRecord | undefined>(store.get(key), `getThumbnail ${key}`).then(
						(record) => {
							if (record?.blob instanceof Blob && record.blob.size > 0) return [key, record.blob] as const;
							return null;
						}
					)
				)
			);
			const map = new Map<string, Blob>();
			for (const r of results) {
				if (r) {
					map.set(r[0], r[1]);
					this.touchThumbnail(r[0], r[1]);
				}
			}
			return map;
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return new Map();
			throw e;
		}
	}

	/** Put thumbnail blob. Runs LRU eviction when over quota. Calls onEvicted for keys removed from IDB. */
	async putThumbnailBlob(
		key: string,
		blob: Blob,
		onEvicted?: (keys: string[]) => void
	): Promise<void> {
		if (!this.canUseDb()) return;
		try {
			const record: ThumbnailRecord = { blob, lastAccessedAt: Date.now() };
			const tx = this.db!.transaction([THUMBNAIL_STORE_NAME], 'readwrite');
			tx.objectStore(THUMBNAIL_STORE_NAME).put(record, key);
			await this.finishTransaction(tx);
			const evicted = await this.evictThumbnailsIfOverQuota();
			if (evicted.length > 0 && onEvicted) onEvicted(evicted);
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return;
			throw e;
		}
	}

	/** Delete thumbnail blob */
	async deleteThumbnailBlob(key: string): Promise<void> {
		if (!this.canUseDb()) return;
		try {
			const tx = this.db!.transaction([THUMBNAIL_STORE_NAME], 'readwrite');
			tx.objectStore(THUMBNAIL_STORE_NAME).delete(key);
			await this.finishTransaction(tx);
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return;
			throw e;
		}
	}

	/** Fire-and-forget touch to update lastAccessedAt for LRU */
	private touchThumbnail(key: string, blob: Blob): void {
		if (!this.canUseDb()) return;
		try {
			const tx = this.db!.transaction([THUMBNAIL_STORE_NAME], 'readwrite');
			tx.objectStore(THUMBNAIL_STORE_NAME).put({ blob, lastAccessedAt: Date.now() }, key);
		} catch {
			// Ignore when closing
		}
	}

	/** Evict oldest thumbnails by lastAccessedAt until under quota. Returns evicted keys. */
	private async evictThumbnailsIfOverQuota(): Promise<string[]> {
		if (!this.canUseDb() || !this.db!.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) return [];
		try {
			const quota = THUMBNAIL.storageQuotaBytes;
			const entries: { key: string; size: number; lastAccessedAt: number }[] = [];
			const store = this.db!.transaction([THUMBNAIL_STORE_NAME], 'readonly').objectStore(THUMBNAIL_STORE_NAME);
			const req = store.openCursor();

			await new Promise<void>((resolve, reject) => {
				req.onsuccess = () => {
					const cursor = req.result;
					if (cursor) {
						const record = cursor.value as ThumbnailRecord;
						const size = record?.blob instanceof Blob ? record.blob.size : 0;
						const lastAccessedAt = record?.lastAccessedAt ?? 0;
						entries.push({ key: cursor.key as string, size, lastAccessedAt });
						cursor.continue();
					} else resolve();
				};
				req.onerror = () => reject(req.error);
			});

			let total = entries.reduce((s, e) => s + e.size, 0);
			if (total <= quota) return [];

			entries.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
			const toDelete: string[] = [];
			for (const e of entries) {
				if (total <= quota) break;
				toDelete.push(e.key);
				total -= e.size;
			}
			if (toDelete.length === 0) return [];

			const delTx = this.db!.transaction([THUMBNAIL_STORE_NAME], 'readwrite');
			const delStore = delTx.objectStore(THUMBNAIL_STORE_NAME);
			for (const k of toDelete) delStore.delete(k);
			await this.finishTransaction(delTx);
			return toDelete;
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return [];
			throw e;
		}
	}

	/** P5: Move thumbnail blob on file rename (reference nn moveBlob) */
	async moveThumbnailBlob(oldKey: string, newKey: string): Promise<void> {
		if (!this.canUseDb()) return;
		try {
			const tx = this.db!.transaction([THUMBNAIL_STORE_NAME], 'readwrite');
			const store = tx.objectStore(THUMBNAIL_STORE_NAME);
			const record = await idbRequestToPromise<ThumbnailRecord | undefined>(store.get(oldKey), 'get');
			if (record?.blob instanceof Blob && record.blob.size > 0) {
				store.put({ blob: record.blob, lastAccessedAt: Date.now() }, newKey);
				store.delete(oldKey);
			}
			await this.finishTransaction(tx);
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return;
			throw e;
		}
	}

	/**
	 * Estimate storage size in bytes by iterating both stores
	 */
	async getStorageSizeEstimate(): Promise<{ entriesBytes: number; thumbnailsBytes: number; totalBytes: number }> {
		const empty = { entriesBytes: 0, thumbnailsBytes: 0, totalBytes: 0 };
		if (!this.canUseDb()) return empty;

		let entriesBytes = 0;
		let thumbnailsBytes = 0;

		try {
			// Journal entries store: estimate from JSON size
			const entriesStore = this.db!.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME);
			const entriesRequest = entriesStore.openCursor();

			await new Promise<void>((resolve, reject) => {
				entriesRequest.onsuccess = () => {
					const cursor = entriesRequest.result;
					if (cursor) {
						entriesBytes += new TextEncoder().encode(JSON.stringify(cursor.value)).length;
						cursor.continue();
					} else {
						resolve();
					}
				};
				entriesRequest.onerror = () => reject(entriesRequest.error);
			});

			// Thumbnails store: sum blob sizes (may not exist in older DBs)
			if (this.db!.objectStoreNames.contains(THUMBNAIL_STORE_NAME)) {
				const thumbsStore = this.db!.transaction([THUMBNAIL_STORE_NAME], 'readonly').objectStore(THUMBNAIL_STORE_NAME);
				const thumbsRequest = thumbsStore.openCursor();

				await new Promise<void>((resolve, reject) => {
					thumbsRequest.onsuccess = () => {
						const cursor = thumbsRequest.result;
						if (cursor) {
							const record = cursor.value as { blob?: Blob };
							if (record?.blob instanceof Blob) thumbnailsBytes += record.blob.size;
							cursor.continue();
						} else {
							resolve();
						}
					};
					thumbsRequest.onerror = () => reject(thumbsRequest.error);
				});
			}

			return {
				entriesBytes,
				thumbnailsBytes,
				totalBytes: entriesBytes + thumbnailsBytes,
			};
		} catch (e) {
			if (isDbClosingError(e) || this.isClosing) return empty;
			throw e;
		}
	}

	/**
	 * Close connection, called on plugin unload.
	 * Sets isClosing first so no new transactions start; then closes db.
	 */
	close(): void {
		this.isClosing = true;
		this.initPromise = null;
		if (this.db) {
			this.db.close();
			this.db = null;
		}
	}
}
