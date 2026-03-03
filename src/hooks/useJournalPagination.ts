import { useState, useEffect, useRef, useCallback } from 'react';
import { JournalEntry } from '../utils/utils';
import { PAGINATION } from '../constants';

export const useJournalPagination = (entries: JournalEntry[]) => {
	const [currentPage, setCurrentPage] = useState(0);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const loadMoreTriggerRef = useRef<HTMLDivElement>(null);
	const observerRef = useRef<IntersectionObserver | null>(null);

	const itemsPerPage = PAGINATION.ITEMS_PER_PAGE;
	const startIndex = currentPage * itemsPerPage;
	const endIndex = Math.min(startIndex + itemsPerPage, entries.length);
	const displayedEntries = entries.slice(0, endIndex);
	const hasMore = endIndex < entries.length;

	const loadMore = useCallback(() => {
		if (isLoadingMore || !hasMore) {
			return;
		}

		setIsLoadingMore(true);
		// Simulate load delay
		setTimeout(() => {
			setCurrentPage(prev => prev + 1);
			setIsLoadingMore(false);
		}, 100);
	}, [isLoadingMore, hasMore]);

	useEffect(() => {
		if (!loadMoreTriggerRef.current) {
			return;
		}

		observerRef.current = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting && !isLoadingMore && hasMore) {
						loadMore();
					}
				});
			},
			{
				rootMargin: '300px',
				threshold: 0.01,
			}
		);

		observerRef.current.observe(loadMoreTriggerRef.current);

		return () => {
			if (observerRef.current) {
				observerRef.current.disconnect();
			}
		};
	}, [loadMore, isLoadingMore, hasMore]);

	const resetPagination = useCallback(() => {
		setCurrentPage(0);
		setIsLoadingMore(false);
	}, []);

	// Reset pagination when entries change
	useEffect(() => {
		resetPagination();
	}, [entries.length, resetPagination]);

	return {
		displayedEntries,
		hasMore,
		isLoadingMore,
		loadMoreTriggerRef,
		resetPagination,
	};
};
