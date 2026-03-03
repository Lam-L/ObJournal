/**
 * Thumbnail generation for journal card images.
 * References notebook-navigator: resize to 256x144, WebP output, store in IndexedDB.
 */
import type { App } from 'obsidian';
import { Platform } from 'obsidian';
import { THUMBNAIL } from '../storage/constants';
import { getStorage } from '../storage/storageLifecycle';
import { acquireThumbnailSlot } from './thumbnailConcurrency';
import { thumbnailBlobCache } from './thumbnailCache';
import { acquireDecodeBudget } from './decodeBudgetLimiter';
import { LOGGING } from '../constants';

const MAX_W = THUMBNAIL.maxWidth;
const MAX_H = THUMBNAIL.maxHeight;
const MIME = THUMBNAIL.output.mimeType;
const IOS_MIME = THUMBNAIL.output.iosMimeType;
const QUALITY = THUMBNAIL.output.quality;

const SUPPORTED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif']);

const MIME_BY_EXT: Record<string, string> = {
	png: 'image/png',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	gif: 'image/gif',
	webp: 'image/webp',
	bmp: 'image/bmp',
	avif: 'image/avif',
};

export function getThumbnailKey(imagePath: string, mtime: number): string {
	return `${imagePath}@${mtime}@v${THUMBNAIL.keyVersion}`;
}

/** Check if file extension supports thumbnail generation */
export function canGenerateThumbnail(path: string): boolean {
	const ext = path.split('.').pop()?.toLowerCase();
	return ext ? SUPPORTED_EXTENSIONS.has(ext) : false;
}

/** Generate and store thumbnail; returns blob or null on failure */
export async function generateAndStoreThumbnail(
	app: App,
	imagePath: string,
	mtime: number
): Promise<Blob | null> {
	if (!canGenerateThumbnail(imagePath)) return null;

	const storage = getStorage();
	if (!storage) return null;

	const key = getThumbnailKey(imagePath, mtime);

	// P4: Concurrency limit (reference nn thumbnailCanvasParallelLimit)
	const release = await acquireThumbnailSlot();
	try {
		const buffer = await app.vault.adapter.readBinary(imagePath);
		if (!buffer || buffer.byteLength > 50_000_000) return null;

		const ext = imagePath.split('.').pop()?.toLowerCase();
		const mime = (ext && MIME_BY_EXT[ext]) || 'image/png';
		const blob = new Blob([buffer], { type: mime });
		const result = await resizeToThumbnail(blob);

		if (result) {
			await storage.putThumbnailBlob(key, result, (evicted) => thumbnailBlobCache.removeMany(evicted));
			thumbnailBlobCache.set(key, result);
			if (LOGGING.THUMBNAIL) console.log(`${LOGGING.PREFIX} [缩略图] 生成并写入 IndexedDB: ${imagePath}`);
			return result;
		}
	} catch (e) {
		if (LOGGING.THUMBNAIL) console.warn(`${LOGGING.PREFIX} [缩略图] 生成失败: ${imagePath}`, e);
		// Silently fail - fallback to original URL
	} finally {
		release();
	}
	return null;
}

/** Resize image blob to thumbnail dimensions using canvas */
async function resizeToThumbnail(sourceBlob: Blob): Promise<Blob | null> {
	// imageDecodeBudgetPixels: limit concurrent decode (reference nn)
	const decodePixels =
		typeof createImageBitmap !== 'undefined' ? MAX_W * MAX_H : 50_000_000;
	const releaseBudget = await acquireDecodeBudget(decodePixels);
	try {
		let drawable: { width: number; height: number; drawable: CanvasImageSource; close?: () => void } | null = null;

		if (typeof createImageBitmap !== 'undefined') {
			const bitmap = await createImageBitmap(sourceBlob, {
				maxWidth: MAX_W,
				maxHeight: MAX_H,
			} as ImageBitmapOptions);
			drawable = { width: bitmap.width, height: bitmap.height, drawable: bitmap, close: () => bitmap.close() };
		} else {
			const img = await loadBitmapFallback(sourceBlob);
			if (!img) return null;
			drawable = {
				width: img.naturalWidth,
				height: img.naturalHeight,
				drawable: img,
			};
		}

		const { w, h } = clampDimensions(drawable.width, drawable.height);
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			drawable.close?.();
			if ('src' in drawable.drawable && drawable.drawable instanceof HTMLImageElement) {
				URL.revokeObjectURL(drawable.drawable.src);
			}
			return null;
		}
		ctx.drawImage(drawable.drawable, 0, 0, w, h);
		drawable.close?.();
		if ('src' in drawable.drawable && drawable.drawable instanceof HTMLImageElement) {
			URL.revokeObjectURL(drawable.drawable.src);
		}

		// P1: iOS WebP fallback (reference nn iosMimeType)
		const outputMime = Platform.isIosApp ? IOS_MIME : MIME;
		return new Promise<Blob | null>((resolve) => {
			canvas.toBlob((b) => resolve(b ?? null), outputMime, QUALITY);
		});
	} catch {
		return null;
	} finally {
		releaseBudget();
	}
}

function clampDimensions(w: number, h: number): { w: number; h: number } {
	if (w <= MAX_W && h <= MAX_H) return { w, h };
	const ratio = Math.min(MAX_W / w, MAX_H / h);
	return {
		w: Math.max(1, Math.round(w * ratio)),
		h: Math.max(1, Math.round(h * ratio)),
	};
}

async function loadBitmapFallback(blob: Blob): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => {
			URL.revokeObjectURL(img.src);
			resolve(null);
		};
		img.src = URL.createObjectURL(blob);
	});
}
