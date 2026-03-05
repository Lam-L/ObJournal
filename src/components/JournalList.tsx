import React, { useRef, useEffect } from 'react';
import { useJournalData } from '../context/JournalDataContext';
import { useJournalScroll } from '../hooks/useJournalScroll';
import { JournalCard } from './JournalCard';
import { JOURNAL_VIEW_ACTIVE_EVENT } from '../view/JournalView';
import { lastOpenedFilePathRef } from '../context/JournalViewContext';

function getScrollContainer(parent: HTMLDivElement | null): HTMLElement | null {
    return parent?.closest('.journal-view-container') as HTMLElement | null;
}

export const JournalList: React.FC = () => {
    const { entries } = useJournalData();
    const scrollPositionRef = useRef<number>(0);
    const { parentRef, virtualizer, listItems, restoreScroll, scrollToFile, filePathToIndex } = useJournalScroll(entries, scrollPositionRef, lastOpenedFilePathRef);
    const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

    // Restore when entries change: prefer scrollToFile
    useEffect(() => {
        const path = lastOpenedFilePathRef.current;
        const saved = scrollPositionRef.current;
        if (!path && saved <= 0) return;
        requestAnimationFrame(() => {
            if (path && filePathToIndex.has(path)) {
                scrollToFile(path);
            } else if (saved > 0) {
                restoreScroll(saved);
            }
        });
    }, [entries.length, restoreScroll, scrollToFile, filePathToIndex]);

    // Update measurement when virtual items change (only when container is ready - reference nn isScrollContainerReady)
    useEffect(() => {
        const scrollEl = getScrollContainer(parentRef.current);
        if (scrollEl) {
            const rect = scrollEl.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                virtualizer.measure();
            }
        }
    }, [entries.length, virtualizer]);

    // Remeasure + restore when view becomes active (tab switch back)
    useEffect(() => {
        const handler = () => {
            const path = lastOpenedFilePathRef.current;
            const saved = scrollPositionRef.current;
            requestAnimationFrame(() => {
                const scrollEl = getScrollContainer(parentRef.current);
                if (!scrollEl) return;
                const rect = scrollEl.getBoundingClientRect();
                if (rect.width <= 0 || rect.height <= 0) return;
                virtualizer.measure();
                if (path && filePathToIndex.has(path)) {
                    scrollToFile(path);
                } else if (saved > 0) {
                    restoreScroll(saved);
                }
            });
        };
        document.addEventListener(JOURNAL_VIEW_ACTIVE_EVENT, handler);
        return () => document.removeEventListener(JOURNAL_VIEW_ACTIVE_EVENT, handler);
    }, [virtualizer, restoreScroll, scrollToFile, filePathToIndex]);

    return (
        <div
            ref={parentRef}
            className="journal-list-container"
        >
            <div
                style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {virtualizer.getVirtualItems().map((virtualItem) => {
                    const item = listItems[virtualItem.index];

                    if (!item) {
                        return null;
                    }

                    const setRef = (element: HTMLDivElement | null) => {
                        if (element) {
                            itemRefs.current.set(virtualItem.index, element);
                            virtualizer.measureElement(element);
                        } else {
                            itemRefs.current.delete(virtualItem.index);
                        }
                    };

                    if (item.type === 'month-header') {
                        // Use monthKey as stable key
                        return (
                            <div
                                key={`month-${item.monthKey}`}
                                ref={setRef}
                                className="journal-virtual-item"
                                data-index={virtualItem.index}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualItem.start}px)`,
                                }}
                            >
                                <h2 className="journal-month-title">{item.monthKey}</h2>
                            </div>
                        );
                    }

                    if (item.type === 'card' && item.entry) {
                        // Use file.path as stable key instead of virtualItem.key
                        return (
                            <div
                                key={item.entry.file.path}
                                ref={setRef}
                                className="journal-virtual-item"
                                data-index={virtualItem.index}
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    transform: `translateY(${virtualItem.start}px)`,
                                }}
                            >
                                <JournalCard entry={item.entry} skipLazyLoad />
                            </div>
                        );
                    }

                    return null;
                })}
            </div>
        </div>
    );
};
