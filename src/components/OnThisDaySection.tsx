import React from 'react';
import { useJournalData } from '../context/JournalDataContext';
import { OnThisDayTile } from './OnThisDayTile';
import { getOnThisDayEntries, formatYearsAgo } from '../utils/onThisDay';

export const OnThisDaySection: React.FC = () => {
	const { entries } = useJournalData();
	const onThisDayEntries = getOnThisDayEntries(entries);

	if (onThisDayEntries.length === 0) return null;

	return (
		<div className="on-this-day-section on-this-day-section-v2">
			<div className="on-this-day-tiles">
				{onThisDayEntries.map((entry) => (
					<OnThisDayTile key={entry.file.path} entry={entry} yearsAgo={formatYearsAgo(entry)} />
				))}
			</div>
		</div>
	);
};
