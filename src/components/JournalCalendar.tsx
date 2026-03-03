import React from 'react';
import { useJournalData } from '../context/JournalDataContext';
import { useCalendarMonth } from '../hooks/useCalendarMonth';
import { CalendarHeader } from './CalendarHeader';
import { CalendarGrid } from './CalendarGrid';

export const JournalCalendar: React.FC = () => {
	const { entries } = useJournalData();
	const {
		cursorMonth,
		prevMonth,
		nextMonth,
		goToToday,
		selectedIso,
		setSelectedIso,
		days,
		entriesByIso,
		firstImageUrlByIso,
	} = useCalendarMonth(entries);

	return (
		<div className="journal-calendar-section">
			<CalendarHeader
				cursorMonth={cursorMonth}
				onPrevMonth={prevMonth}
				onNextMonth={nextMonth}
				onGoToToday={goToToday}
			/>
			<CalendarGrid
				days={days}
				entriesByIso={entriesByIso}
				firstImageUrlByIso={firstImageUrlByIso}
				selectedIso={selectedIso}
				onSelect={setSelectedIso}
			/>
		</div>
	);
};
