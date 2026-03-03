import React, { memo } from 'react';
import { JournalEntry } from '../utils/utils';
import { generatePreview } from '../utils/utils';
import { formatYearsAgo } from '../utils/onThisDay';
import { useJournalView } from '../context/JournalViewContext';

/** Excerpt uses CSS line-clamp for container-based truncation; pass enough text for it to fill */
const EXCERPT_PREVIEW_LIMIT = 1000; // Generous limit; CSS truncates by container size
const TITLE_MAX_CHARS = 12;

function truncateTitle(title: string, maxLen: number): string {
	if (!title) return '';
	const stripped = title.replace(/\.[^.]+$/, ''); // Remove extension
	if (stripped.length <= maxLen) return stripped;
	return stripped.slice(0, maxLen) + '…';
}

interface OnThisDayTileProps {
	entry: JournalEntry;
	yearsAgo?: string;
}

export const OnThisDayTile: React.FC<OnThisDayTileProps> = memo(
	({ entry, yearsAgo }) => {
		const { app, plugin } = useJournalView();
		// Cached entries have empty content, use preview as excerpt source
		const excerpt = generatePreview(entry.content || entry.preview || '', EXCERPT_PREVIEW_LIMIT);
		const rawTitle = entry.title || entry.file.basename;
		const title = truncateTitle(rawTitle, TITLE_MAX_CHARS);
		const hasImage = entry.images.length > 0;
		const firstImage = hasImage ? entry.images[0] : null;

		const handleClick = () => {
			try {
				const openInNewTab = (plugin as { settings?: { openInNewTab?: boolean } })?.settings?.openInNewTab !== false;
				if (openInNewTab) {
					app.workspace.openLinkText(entry.file.path, '', true);
				} else {
					const activeLeaf = app.workspace.activeLeaf;
					const targetLeaf =
						activeLeaf?.getViewState?.().type === 'journal-view-react'
							? activeLeaf
							: app.workspace.getLeaf(false);
					targetLeaf?.openFile(entry.file, { active: true });
				}
			} catch (e) {
				console.error('Failed to open file:', e);
			}
		};

		const label = yearsAgo ?? formatYearsAgo(entry);

		return (
			<button
				type="button"
				className={`on-this-day-tile ${hasImage ? '' : 'on-this-day-tile-no-image'}`}
				onClick={handleClick}
			>
				<div className="on-this-day-tile-inner">
					{hasImage && firstImage ? (
						<>
							<div
								className="on-this-day-tile-bg"
								style={{ backgroundImage: `url(${firstImage.url})` }}
								aria-hidden
							/>
							<div className="on-this-day-tile-overlay" aria-hidden />
						</>
					) : null}
					<div className="on-this-day-tile-content">
						<div className="on-this-day-tile-title">{title}</div>
						<div className="on-this-day-tile-excerpt">
							<div className="on-this-day-tile-excerpt-inner">{excerpt}</div>
						</div>
						<span className="on-this-day-tile-label">{label}</span>
					</div>
				</div>
			</button>
		);
	},
	(prev, next) => prev.entry.file.path === next.entry.file.path
);
