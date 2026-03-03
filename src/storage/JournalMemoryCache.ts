import type { CachedJournalEntry } from './types';

/**
 * In-session memory cache
 * Stores CachedJournalEntry for current view
 * Source for entriesMapRef: hydrate from IndexedDB first, then incremental updates from vault
 */
export class JournalMemoryCache {
	private map = new Map<string, CachedJournalEntry>();

	get(path: string): CachedJournalEntry | null {
		return this.map.get(path) ?? null;
	}

	has(path: string): boolean {
		return this.map.has(path);
	}

	set(path: string, entry: CachedJournalEntry): void {
		this.map.set(path, entry);
	}

	delete(path: string): void {
		this.map.delete(path);
	}

	batchDelete(paths: string[]): void {
		for (const path of paths) {
			this.map.delete(path);
		}
	}

	batchSet(entries: { path: string; entry: CachedJournalEntry }[]): void {
		for (const { path, entry } of entries) {
			this.map.set(path, entry);
		}
	}

	getAllPaths(): string[] {
		return Array.from(this.map.keys());
	}

	values(): CachedJournalEntry[] {
		return Array.from(this.map.values());
	}

	clear(): void {
		this.map.clear();
	}

	get size(): number {
		return this.map.size;
	}
}
