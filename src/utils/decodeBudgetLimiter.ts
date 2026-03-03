/**
 * Budget limiter for image decode operations (reference nn createRenderBudgetLimiter).
 * Prevents "decode storms" when many images decode concurrently during fast scroll.
 */
import { Platform } from 'obsidian';
import { THUMBNAIL } from '../storage/constants';

const MAX_BUDGET =
	Platform.isMobile ? THUMBNAIL.imageDecodeBudgetPixels.mobile : THUMBNAIL.imageDecodeBudgetPixels.desktop;

let activeWeight = 0;
const waiters: { weight: number; resolve: (release: () => void) => void }[] = [];

function tryFulfillWaiters(): void {
	while (waiters.length > 0 && activeWeight + waiters[0].weight <= MAX_BUDGET) {
		const next = waiters.shift()!;
		activeWeight += next.weight;
		const release = () => {
			activeWeight = Math.max(0, activeWeight - next.weight);
			tryFulfillWaiters();
		};
		next.resolve(release);
	}
}

/** Acquire pixel budget before decode; call release when done */
export async function acquireDecodeBudget(pixels: number): Promise<() => void> {
	const weight = Math.min(Math.max(1, Math.floor(pixels)), MAX_BUDGET);

	if (activeWeight + weight <= MAX_BUDGET) {
		activeWeight += weight;
		return () => {
			activeWeight = Math.max(0, activeWeight - weight);
			tryFulfillWaiters();
		};
	}

	return new Promise<() => void>((resolve) => {
		waiters.push({ weight, resolve });
		tryFulfillWaiters();
	});
}
