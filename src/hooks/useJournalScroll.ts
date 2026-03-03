import { useRef, useMemo, useCallback, useEffect } from 'react';
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

export const useJournalScroll = (entries: JournalEntry[]) => {
	const parentRef = useRef<HTMLDivElement>(null);

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
		getScrollElement: () => {
			// Find parent scroll container (journal-view-container)
			if (parentRef.current) {
				const scrollContainer = parentRef.current.closest('.journal-view-container') as HTMLElement;
				return scrollContainer || parentRef.current;
			}
			return null;
		},
		estimateSize,
		overscan: 20, // Increased from 8: avoid white gap when fast scroll or switching back
		// Enable dynamic height measurement
		measureElement: (element) => {
			if (!element) {
				return 0;
			}
			return element.getBoundingClientRect().height;
		},
	});

	// Remeasure when scroll container becomes visible (e.g. switching back to tab)
	// Fixes white screen when returning to journal view
	// isScrollContainerReady: only measure when container has dimensions (reference nn)
	useEffect(() => {
		const scrollEl = parentRef.current?.closest('.journal-view-container') as HTMLElement;
		if (!scrollEl) return;

		const runMeasureIfReady = () => {
			requestAnimationFrame(() => {
				const el = parentRef.current?.closest('.journal-view-container') as HTMLElement;
				if (!el) return;
				const rect = el.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) {
					virtualizer.measure();
				}
			});
		};

		const ro = new ResizeObserver(runMeasureIfReady);
		ro.observe(scrollEl);
		return () => ro.disconnect();
	}, [virtualizer]);

	return {
		parentRef,
		virtualizer,
		listItems,
	};
};
