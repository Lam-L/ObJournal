/**
 * Hook to resolve display URL for journal card images: prefer IndexedDB thumbnail, fallback to original.
 * References notebook-navigator: blob from IndexedDB → URL.createObjectURL, revoke on unmount.
 */
import { useState, useEffect, useRef } from 'react';
import { TFile } from 'obsidian';
import type { ImageInfo } from '../utils/utils';
import { getStorage } from '../storage/storageLifecycle';
import { getThumbnailKey, canGenerateThumbnail, generateAndStoreThumbnail } from '../utils/thumbnailGenerator';
import { thumbnailBlobCache } from '../utils/thumbnailCache';
import { THUMBNAIL } from '../storage/constants';
import type { App } from 'obsidian';

const REGEN_THROTTLE_MS = THUMBNAIL.regenThrottleMs;
const lastRegenByKey = new Map<string, number>();

function shouldThrottleRegen(key: string): boolean {
	const last = lastRegenByKey.get(key);
	if (!last) return false;
	return Date.now() - last < REGEN_THROTTLE_MS;
}

export function useThumbnailUrl(image: ImageInfo, app: App | null): string {
	const [thumbUrl, setThumbUrl] = useState<string | null>(null);
	const objectUrlRef = useRef<string | null>(null);
	const isExternal = image.path.startsWith('http://') || image.path.startsWith('https://');

	useEffect(() => {
		if (!app || !image.path || isExternal) return;

		// Resolve mtime: use image.mtime, fallback to file stat (cache may lack mtime)
		let mtime = image.mtime ?? 0;
		if (mtime <= 0) {
			const imgFile = app.vault.getAbstractFileByPath(image.path);
			if (imgFile && imgFile instanceof TFile) {
				mtime = imgFile.stat.mtime;
			}
		}
		const key = getThumbnailKey(image.path, mtime);

		// P0: revoke our object URL on unmount (reference nn)
		const cleanup = () => {
			if (objectUrlRef.current) {
				URL.revokeObjectURL(objectUrlRef.current);
				objectUrlRef.current = null;
			}
		};

		// Try in-memory blob cache first (LRU)
		const cachedBlob = thumbnailBlobCache.get(key);
		if (cachedBlob) {
			const url = URL.createObjectURL(cachedBlob);
			objectUrlRef.current = url;
			setThumbUrl(url);
			return cleanup;
		}

		let cancelled = false;
		const storage = getStorage();

		const tryThumbnail = async () => {
			if (!storage || !canGenerateThumbnail(image.path)) return null;

			const blob = await storage.getThumbnailBlob(key);
			if (cancelled || !blob) return null;

			thumbnailBlobCache.set(key, blob);
			return blob;
		};

		tryThumbnail()
			.then((blob) => {
				if (cancelled) return cleanup;
				if (blob) {
					const url = URL.createObjectURL(blob);
					objectUrlRef.current = url;
					setThumbUrl(url);
				}
			})
			.catch(() => {}); // Absorb errors when storage is closing

		return cleanup;
	}, [image.path, image.mtime, app, isExternal]);

	// P2: Trigger background generation with throttle (reference nn regenerateFeatureImageForFile)
	useEffect(() => {
		if (!app || !image.path || isExternal) return;
		if (!canGenerateThumbnail(image.path)) return;

		// Use image.mtime; fallback to file stat when missing (cache from older version may lack mtime)
		let mtime = image.mtime ?? 0;
		if (mtime <= 0) {
			const imgFile = app.vault.getAbstractFileByPath(image.path);
			if (imgFile && imgFile instanceof TFile) {
				mtime = imgFile.stat.mtime;
			}
		}
		if (mtime <= 0) return;

		const key = getThumbnailKey(image.path, mtime);
		const storage = getStorage();
		if (!storage) return;

		if (shouldThrottleRegen(key)) return;

		storage
			.getThumbnailBlob(key)
			.then((blob) => {
				if (!blob) {
					lastRegenByKey.set(key, Date.now());
					generateAndStoreThumbnail(app, image.path, mtime).catch(() => {});
				}
			})
			.catch(() => {}); // Absorb errors when storage is closing
	}, [app, image.path, image.mtime, isExternal]);

	if (isExternal) return image.url;
	if (thumbUrl) return thumbUrl;
	return image.url;
}
