import React from 'react';
import { useJournalView } from '../context/JournalViewContext';
import type { CalendarDay } from '../utils/calendarUtils';
import type { JournalEntry } from '../utils/utils';
import { CalendarDayCell } from './CalendarDayCell';

interface CalendarGridProps {
	days: CalendarDay[];
	entriesByIso: Map<string, JournalEntry>;
	firstImageUrlByIso: Map<string, string>;
	selectedIso: string | null;
	onSelect: (iso: string) => void;
}

import { strings } from '../i18n';

const WEEKDAY_LABELS = strings.calendar.weekdayShort;

export const CalendarGrid: React.FC<CalendarGridProps> = ({
	days,
	entriesByIso,
	firstImageUrlByIso,
	selectedIso,
	onSelect,
}) => {
	const { app } = useJournalView();

	const handleDayClick = (entry: JournalEntry | undefined, iso: string) => {
		onSelect(iso);
		if (entry) {
			app.workspace.openLinkText(entry.file.path, '', true);
		}
	};

	return (
		<div className="journal-calendar-grid">
			<div className="journal-calendar-weekdays">
				{WEEKDAY_LABELS.map((label, index) => (
					<span key={`weekday-${index}`} className="journal-calendar-weekday">
						{label}
					</span>
				))}
			</div>
			<div className="journal-calendar-days">
				{days.map((day) => (
					<CalendarDayCell
						key={day.iso + day.type}
						day={day}
						entry={entriesByIso.get(day.iso)}
						imageUrl={firstImageUrlByIso.get(day.iso)}
						isSelected={selectedIso === day.iso}
						onClick={handleDayClick}
					/>
				))}
			</div>
		</div>
	);
};
