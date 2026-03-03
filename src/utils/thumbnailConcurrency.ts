/**
 * Concurrency limiter for thumbnail generation (reference nn thumbnailCanvasParallelLimit).
 */
import { THUMBNAIL } from '../storage/constants';

let available = THUMBNAIL.parallelLimit;

export async function acquireThumbnailSlot(): Promise<() => void> {
	while (available <= 0) {
		await new Promise<void>((r) => setTimeout(r, 50));
	}
	available -= 1;
	return () => {
		available += 1;
	};
}
