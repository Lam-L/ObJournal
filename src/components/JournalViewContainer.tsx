import React, { useEffect, useRef } from 'react';
import { JournalDataProvider } from '../context/JournalDataContext';
import { strings } from '../i18n';
import { useJournalEntries } from '../hooks/useJournalEntries';
import { useThumbnailPrewarm } from '../hooks/useThumbnailPrewarm';
import { useFileSystemWatchers } from '../hooks/useFileSystemWatchers';
import { useScrollbarWidth } from '../hooks/useScrollbarWidth';
import { JournalViewModeProvider, useJournalViewMode } from '../context/JournalViewModeContext';
import { JournalHeader } from './JournalHeader';
import { JournalStats } from './JournalStats';
import { OnThisDaySection } from './OnThisDaySection';
import { JournalList } from './JournalList';
import { JournalCalendar } from './JournalCalendar';
import { JournalEmptyState } from './JournalEmptyState';
import { MenuProvider } from './JournalCardMenu';
import { useJournalView } from '../context/JournalViewContext';

// Internal component: uses file system watchers inside JournalDataProvider
const JournalViewWithWatchers: React.FC = () => {
	useFileSystemWatchers();
	const { plugin } = useJournalView();
	const showStats = (plugin as { settings?: { showJournalStats?: boolean } })?.settings?.showJournalStats === true;

	return (
		<JournalViewModeProvider>
			<div className="journal-content-wrapper">
				<JournalHeader />
				{showStats && <JournalStats />}
				<JournalViewContentArea />
			</div>
		</JournalViewModeProvider>
	);
};

const JournalViewContentArea: React.FC = () => {
	const { viewMode } = useJournalViewMode();
	if (viewMode === 'calendar') {
		return (
			<div className="journal-calendar-with-list">
				<JournalCalendar />
				<OnThisDaySection />
				<JournalList />
			</div>
		);
	}
	return (
		<>
			<OnThisDaySection />
			<JournalList />
		</>
	);
};

const LOADING_DELAY_MS = 200; // Only show loading UI after this long (avoids flash on fast cache hits)

const JournalViewContent: React.FC = () => {
	const { entries, isLoading, error, refresh, updateSingleEntry, updateEntryAfterRename } = useJournalEntries();
	const [showLoadingUI, setShowLoadingUI] = React.useState(false);

	useThumbnailPrewarm(entries);

	// Defer loading indicator: avoid flash when load completes quickly (e.g. from IndexedDB cache)
	React.useEffect(() => {
		if (!isLoading) {
			setShowLoadingUI(false);
			return;
		}
		const t = setTimeout(() => setShowLoadingUI(true), LOADING_DELAY_MS);
		return () => clearTimeout(t);
	}, [isLoading]);

	// When loading but we already have entries (e.g. refresh, cache): keep showing content to avoid white flash
	if (isLoading && entries.length > 0) {
		return (
			<MenuProvider>
				<JournalDataProvider
					entries={entries}
					isLoading={isLoading}
					error={error}
					refresh={refresh}
					updateSingleEntry={updateSingleEntry}
					updateEntryAfterRename={updateEntryAfterRename}
				>
					<JournalViewWithWatchers />
				</JournalDataProvider>
			</MenuProvider>
		);
	}

	if (isLoading) {
		// Show loading only after delay (avoids flash on fast cache); meanwhile render minimal placeholder
		if (showLoadingUI) {
			return (
				<div className="journal-loading">
					{strings.common.loading}
				</div>
			);
		}
		// Brief initial load: show minimal placeholder instead of blank
		return <div className="journal-loading journal-empty" style={{ minHeight: 120 }} />;
	}

	if (error !== null && error !== undefined) {
		const errorMessage = (error as Error).message || String(error);
		return (
			<div className="journal-view-container">
				<div>{strings.common.error}: {errorMessage}</div>
			</div>
		);
	}

	if (entries.length === 0) {
		return (
			<div className="journal-view-container">
				<JournalEmptyState />
			</div>
		);
	}

	return (
		<MenuProvider>
			<JournalDataProvider
				entries={entries}
				isLoading={isLoading}
				error={error}
				refresh={refresh}
				updateSingleEntry={updateSingleEntry}
				updateEntryAfterRename={updateEntryAfterRename}
			>
				<JournalViewWithWatchers />
			</JournalDataProvider>
		</MenuProvider>
	);
};

export const JournalViewContainer: React.FC = () => {
	const containerRef = useRef<HTMLDivElement>(null);
	const scrollbarWidth = useScrollbarWidth();
	const [hasOverflow, setHasOverflow] = React.useState(false);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;

		const checkOverflow = () => {
			const overflow = el.scrollHeight > el.clientHeight;
			setHasOverflow((prev) => (prev !== overflow ? overflow : prev));
		};

		checkOverflow();

		const resizeObserver = new ResizeObserver(checkOverflow);
		resizeObserver.observe(el);

		const mutationObserver = new MutationObserver(() => {
			requestAnimationFrame(checkOverflow);
		});
		mutationObserver.observe(el, { childList: true, subtree: true });

		return () => {
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	}, []);

	useEffect(() => {
		if (!containerRef.current) return;
		const compensation = hasOverflow ? scrollbarWidth : 0;
		containerRef.current.style.setProperty('--scrollbar-width', `${compensation}px`);
	}, [scrollbarWidth, hasOverflow]);

	return (
		<div ref={containerRef} className="journal-view-container">
			<JournalViewContent />
		</div>
	);
};
