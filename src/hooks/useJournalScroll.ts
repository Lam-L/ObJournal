import { useRef, useMemo, useCallback, useEffect, useState, type MutableRefObject } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { JournalEntry } from '../utils/utils';
import { groupByMonth } from '../utils/utils';
import { strings } from '../i18n';
interface VirtualListItem {
	type: 'month-header' | 'card';
	monthKey?: string;
	entry?: JournalEntry;
	index: number;
}

// Cache measured heights
const sizeCache = new Map<number, number>();

/**
 * Scroll restoration (nn-style):
 * 1. enabled=false when container hidden
 * 2. Prefer scrollToFile(lastOpenedPath): restore by last-opened card id
 * 3. Fallback scrollToOffset: pixel position
 */
export const useJournalScroll = (
	entries: JournalEntry[],
	scrollPositionRef?: MutableRefObject<number>,
	lastOpenedFilePathRef?: { current: string | null }
) => {
	const parentRef = useRef<HTMLDivElement>(null);
	const [isContainerVisible, setIsContainerVisible] = useState(true);

	// Build virtualized list items
	const listItems = useMemo<VirtualListItem[]>(() => {
		const items: VirtualListItem[] = [];
		const grouped = groupByMonth(entries);

		const sortedGroups = Object.keys(grouped).sort((a, b) => {
			if (a === strings.dateGroups.today) return -1;
			if (b === strings.dateGroups.today) return 1;
			if (a === strings.dateGroups.yesterday) return -1;
			if (b === strings.dateGroups.yesterday) return 1;

			const parseMonthKey = (monthKey: string): Date => {
				const zhMatch = monthKey.match(/(\d{4})年(\d{1,2})月/);
				if (zhMatch) {
					return new Date(parseInt(zhMatch[1]), parseInt(zhMatch[2]) - 1, 1);
				}
				const enMatch = monthKey.match(new RegExp(`(${strings.monthNames.join('|')}) (\\d{4})`, 'i'));
				if (enMatch) {
					const monthIdx = strings.monthNames.findIndex(m => m.toLowerCase() === enMatch[1].toLowerCase());
					if (monthIdx >= 0) {
						return new Date(parseInt(enMatch[2]), monthIdx, 1);
					}
				}
				return new Date();
			};

			const dateA = parseMonthKey(a);
			const dateB = parseMonthKey(b);
			return dateB.getTime() - dateA.getTime();
		});

		let index = 0;
		for (const groupKey of sortedGroups) {
			items.push({
				type: 'month-header',
				monthKey: groupKey,
				index: index++,
			});

			for (const entry of grouped[groupKey]) {
				items.push({
					type: 'card',
					entry,
					index: index++,
				});
			}
		}

		return items;
	}, [entries]);

	// file.path -> listItems index (nn-style: scrollToIndex to target card)
	const filePathToIndex = useMemo(() => {
		const map = new Map<string, number>();
		for (const item of listItems) {
			if (item.type === 'card' && item.entry) map.set(item.entry.file.path, item.index);
		}
		return map;
	}, [listItems]);

	const estimateSize = useCallback((index: number): number => {
		// If in cache, use cached value
		if (sizeCache.has(index)) {
			return sizeCache.get(index)!;
		}

		const item = listItems[index];
		if (!item) {
			return 50;
		}

		if (item.type === 'month-header') {
			return 50; // Month header height
		}

		// Estimate height from card content
		// Base: title + date + padding = 80px
		// Preview: ~20px per line, max 3 lines = 60px
		// Images: ~200px if present
		let estimatedHeight = 80; // Base height

		if (item.entry) {
			// If has images, add image height
			if (item.entry.images.length > 0) {
				estimatedHeight += 200;
			}
			// If has preview, add content height
			if (item.entry.preview) {
				const previewLines = Math.ceil(item.entry.preview.length / 50);
				estimatedHeight += Math.min(previewLines * 20, 60);
			}
		}

		return estimatedHeight;
	}, [listItems]);

	const virtualizer = useVirtualizer({
		count: listItems.length,
		enabled: isContainerVisible,
		getScrollElement: () => {
			if (parentRef.current) {
				const scrollContainer = parentRef.current.closest('.journal-view-container') as HTMLElement;
				return scrollContainer || parentRef.current;
			}
			return null;
		},
		estimateSize,
		overscan: 20,
		measureElement: (element) => {
			if (!element) return 0;
			return element.getBoundingClientRect().height;
		},
	});

	const restoreScroll = useCallback((saved: number) => {
		if (saved <= 0) return;
		virtualizer.scrollToOffset(saved, { behavior: 'auto' });
	}, [virtualizer]);

	/** Scroll to card for given file path (nn-style) */
	const scrollToFile = useCallback((filePath: string) => {
		const index = filePathToIndex.get(filePath);
		if (index !== undefined) {
			virtualizer.scrollToIndex(index, { align: 'auto', behavior: 'auto' });
		}
	}, [virtualizer, filePathToIndex]);

	// ResizeObserver: sync visibility + restore (prefer scrollToFile, else scrollToOffset)
	useEffect(() => {
		const scrollEl = parentRef.current?.closest('.journal-view-container') as HTMLElement;
		if (!scrollEl) return;

		const run = () => {
			requestAnimationFrame(() => {
				const el = parentRef.current?.closest('.journal-view-container') as HTMLElement;
				if (!el) return;
				const rect = el.getBoundingClientRect();
				const visible = rect.width > 0 && rect.height > 0;
				setIsContainerVisible((prev) => (prev !== visible ? visible : prev));
				if (visible) {
					virtualizer.measure();
					const path = lastOpenedFilePathRef?.current;
					if (path && filePathToIndex.has(path)) {
						scrollToFile(path);
					} else {
						const saved = scrollPositionRef?.current ?? 0;
						if (saved > 0) {
							virtualizer.scrollToOffset(saved, { behavior: 'auto' });
						}
					}
				}
			});
		};

		run();
		const ro = new ResizeObserver(run);
		ro.observe(scrollEl);
		return () => ro.disconnect();
	}, [virtualizer, scrollToFile, filePathToIndex]);

	// DOM scroll save (only when rect visible, avoid bogus values during hide/transition)
	useEffect(() => {
		const scrollEl = parentRef.current?.closest('.journal-view-container') as HTMLElement | null;
		if (!scrollEl || !scrollPositionRef) return;
		const onScroll = () => {
			const rect = scrollEl.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return;
			const top = scrollEl.scrollTop;
			const prev = scrollPositionRef.current;
			if (prev > 0 && top === 0) return;
			if (prev > 200 && top < prev - 200) return;
			scrollPositionRef.current = top;
		};
		scrollEl.addEventListener('scroll', onScroll, { passive: true });
		return () => scrollEl.removeEventListener('scroll', onScroll);
	}, [scrollPositionRef]);

	return {
		parentRef,
		virtualizer,
		listItems,
		restoreScroll,
		scrollToFile,
		filePathToIndex,
	};
};
