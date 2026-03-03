import type { App } from 'obsidian';
import { JournalIndexedDBStorage } from './JournalIndexedDBStorage';

let storageInstance: JournalIndexedDBStorage | null = null;
let appIdUsed: string | null = null;

/**
 * Get vault unique identifier (for IndexedDB namespace)
 */
export function getAppId(app: App): string {
	// Extended Obsidian App may include appId; otherwise use vault path hash
	const extended = app as { appId?: string };
	if (extended.appId) return extended.appId;
	// vault.getAbstractFile can access adapter; fallback to vault name here
	const name = app.vault.getName?.() || 'default';
	return name.replace(/[^a-zA-Z0-9-_]/g, '_');
}

/**
 * Initialize IndexedDB storage, called on plugin onload
 */
export async function initializeStorage(app: App): Promise<JournalIndexedDBStorage> {
	const appId = getAppId(app);
	if (storageInstance && appIdUsed === appId) {
		return storageInstance;
	}
	await shutdownStorage();
	storageInstance = new JournalIndexedDBStorage(appId);
	appIdUsed = appId;
	await storageInstance.init();
	return storageInstance;
}

/**
 * Get initialized storage instance (may be null)
 */
export function getStorage(): JournalIndexedDBStorage | null {
	return storageInstance;
}

/**
 * Close and cleanup storage, called on plugin onunload
 */
export function shutdownStorage(): void {
	if (storageInstance) {
		storageInstance.close();
		storageInstance = null;
		appIdUsed = null;
	}
}
