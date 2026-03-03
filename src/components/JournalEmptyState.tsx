import React from 'react';
import { useJournalView } from '../context/JournalViewContext';
import { strings } from '../i18n';

export const JournalEmptyState: React.FC = () => {
	const { app } = useJournalView();

	const handleScan = async () => {
		// TODO: Implement scan logic
		console.log('Scan files');
	};

	return (
		<div className="journal-welcome">
			<div className="journal-welcome-card">
				<h2>{strings.emptyState.welcomeTitle}</h2>
				<p>{strings.emptyState.noEntries}</p>
				<button className="journal-welcome-button" onClick={handleScan}>
					{strings.emptyState.startScan}
				</button>
			</div>
		</div>
	);
};
