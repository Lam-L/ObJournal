import React, { memo, useRef, useState } from 'react';
import { strings } from '../i18n';
import { JournalEntry, formatDate } from '../utils/utils';
import { CONTENT } from '../constants';
import { JournalImageContainer } from './JournalImageContainer';
import { JournalCardMenu } from './JournalCardMenu';
import { useJournalView } from '../context/JournalViewContext';

interface JournalCardProps {
	entry: JournalEntry;
	/** When true in virtualized list, images render directly to avoid flicker */
	skipLazyLoad?: boolean;
}

export const JournalCard: React.FC<JournalCardProps> = memo(({ entry, skipLazyLoad = false }) => {
	const { app, plugin } = useJournalView();
	const cardRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLElement | null>(null);
	const lastScrollTopRef = useRef<number>(0);

	// Get scroll container ref (scroll happens on journal-view-container, not journal-list-container)
	React.useEffect(() => {
		const scrollContainer = document.querySelector('.journal-view-container') as HTMLElement;
		if (scrollContainer) {
			scrollContainerRef.current = scrollContainer;
			lastScrollTopRef.current = scrollContainer.scrollTop;
		}
	}, []);

	const handleCardClick = async (e: React.MouseEvent) => {
		// Check if click target is card or its child (exclude image click and menu button)
		const target = e.target as HTMLElement;

		// If image container clicked, skip (images have their own click handler)
		if (target.closest('.journal-image-container')) {
			return;
		}

		// If menu button or menu clicked, skip
		if (target.closest('.journal-card-menu-button') || target.closest('.journal-card-menu')) {
			return;
		}

		// Check if scrolling (per original impl)
		if (scrollContainerRef.current) {
			const currentScrollTop = scrollContainerRef.current.scrollTop;
			const isScrolling = currentScrollTop !== lastScrollTopRef.current;
			lastScrollTopRef.current = currentScrollTop;

			// If just scrolled, don't open file
			if (isScrolling) {
				return;
			}
		}

		// Open file
		try {
			// Get open mode setting
			let openInNewTab = true; // Default: open in new tab
			if (plugin) {
				const pluginSettings = (plugin as any).settings;
				if (pluginSettings?.openInNewTab !== undefined) {
					openInNewTab = pluginSettings.openInNewTab;
				}
			}

			if (openInNewTab) {
				// Open in new tab
				app.workspace.openLinkText(entry.file.path, '', true);
			} else {
				// Open in current tab
				// Get active leaf; if it's journal view, use it; otherwise get a usable leaf
				const activeLeaf = app.workspace.activeLeaf;
				let targetLeaf = activeLeaf;

				// If active leaf is journal view, use it directly
				// Otherwise getLeaf(false) returns navigable leaf or creates new one
				if (activeLeaf && activeLeaf.getViewState().type === 'journal-view-react') {
					// Current leaf is journal view, use it to open file (will replace view)
					targetLeaf = activeLeaf;
				} else {
					// Current leaf is not journal view, get usable leaf
					targetLeaf = app.workspace.getLeaf(false);
				}

				if (targetLeaf) {
					await targetLeaf.openFile(entry.file, { active: true });
				}
			}
		} catch (error) {
			console.error('Failed to open file:', entry.file.path, error);
		}
	};

	return (
		<div ref={cardRef} className="journal-card" onClick={handleCardClick}>
			{/* Images */}
			{entry.images.length > 0 && (
				<JournalImageContainer
					images={entry.images.slice(0, CONTENT.MAX_IMAGES_PER_CARD)}
					totalImages={entry.images.length}
					allImages={entry.images}
					skipLazyLoad={skipLazyLoad}
				/>
			)}

			{/* Title */}
			{entry.title && (
				<h3 className="journal-title">{entry.title}</h3>
			)}

			{/* Content preview */}
			<div className="journal-content">
				<div className="journal-preview">{entry.preview}</div>
			</div>

			{/* Date and menu button container */}
			<div className="journal-date-container">
				<div className="journal-date">{formatDate(entry.date)}</div>
				<JournalCardMenu
					app={app}
					entry={entry}
					onDelete={async () => {
						try {
							await app.vault.delete(entry.file);
							// After delete, real-time update will handle it
						} catch (error) {
							console.error('删除文件失败:', error);
							alert(strings.card.deleteFailed);
						}
					}}
				/>
			</div>
		</div>
	);
}, (prevProps, nextProps) => {
	// Custom compare: re-render only when key props change
	return (
		prevProps.entry.file.path === nextProps.entry.file.path &&
		prevProps.entry.file.stat.mtime === nextProps.entry.file.stat.mtime &&
		prevProps.entry.title === nextProps.entry.title &&
		prevProps.entry.preview === nextProps.entry.preview &&
		prevProps.entry.images.length === nextProps.entry.images.length &&
		prevProps.entry.date.getTime() === nextProps.entry.date.getTime()
	);
});
