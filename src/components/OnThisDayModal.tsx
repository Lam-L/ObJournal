import React, { useEffect } from 'react';
import { useJournalData } from '../context/JournalDataContext';
import { useOnThisDay } from '../context/OnThisDayContext';
import { strings } from '../i18n';
import { JournalCard } from './JournalCard';
import { getOnThisDayEntries, formatYearsAgo } from '../utils/onThisDay';
import { formatDate } from '../utils/utils';

export const OnThisDayModal: React.FC = () => {
	const { isModalOpen, closeModal } = useOnThisDay();
	const { entries } = useJournalData();
	const onThisDayEntries = getOnThisDayEntries(entries);

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closeModal();
		};
		if (isModalOpen) {
			document.addEventListener('keydown', handleEscape);
			document.body.style.overflow = 'hidden';
		}
		return () => {
			document.removeEventListener('keydown', handleEscape);
			document.body.style.overflow = '';
		};
	}, [isModalOpen, closeModal]);

	if (!isModalOpen) return null;

	return (
		<div className="on-this-day-modal-overlay" onClick={closeModal}>
			<div
				className="on-this-day-modal"
				onClick={(e) => e.stopPropagation()}
			>
				<div className="on-this-day-modal-header">
					<h2 className="on-this-day-modal-title">{strings.view.onThisDay}</h2>
					<button
						className="on-this-day-modal-close"
						onClick={closeModal}
						title={strings.common.close}
						aria-label={strings.common.close}
					>
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
				<div className="on-this-day-modal-body">
					{onThisDayEntries.length === 0 ? (
						<div className="on-this-day-modal-empty">
							<p>{strings.onThisDay.empty}</p>
							<p className="on-this-day-modal-empty-hint">{strings.onThisDay.emptyHint}</p>
						</div>
					) : (
						<div className="on-this-day-modal-list">
							{onThisDayEntries.map((entry) => (
								<div key={entry.file.path} className="on-this-day-modal-item">
									<div className="on-this-day-modal-item-label">
										{formatYearsAgo(entry)} · {formatDate(entry.date)}
									</div>
									<JournalCard entry={entry} />
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};
