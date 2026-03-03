import React from 'react';
import { strings } from '../i18n';

interface CalendarHeaderProps {
	cursorMonth: Date;
	onPrevMonth: () => void;
	onNextMonth: () => void;
	onGoToToday: () => void;
}

/* ChevronLeft - light SVG stroke icon */
const ChevronLeftIcon = () => (
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
		<polyline points="15 18 9 12 15 6" />
	</svg>
);

/* ChevronRight - light SVG stroke icon */
const ChevronRightIcon = () => (
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
		<polyline points="9 18 15 12 9 6" />
	</svg>
);

export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
	cursorMonth,
	onPrevMonth,
	onNextMonth,
	onGoToToday,
}) => {
	const year = cursorMonth.getFullYear();
	const month = cursorMonth.getMonth() + 1;
	const monthLabel = `${year}.${String(month).padStart(2, '0')}`;

	return (
		<div className="journal-calendar-header">
			<button
				type="button"
				className="journal-calendar-nav journal-calendar-nav-arrow journal-calendar-nav-prev"
				onClick={onPrevMonth}
				title={strings.calendar.prevMonth}
				aria-label={strings.calendar.prevMonth}
			>
				<ChevronLeftIcon />
			</button>
			<button
				type="button"
				className="journal-calendar-nav journal-calendar-nav-title"
				onClick={onGoToToday}
				title={strings.calendar.goToToday}
			>
				{monthLabel}
			</button>
			<button
				type="button"
				className="journal-calendar-nav journal-calendar-nav-arrow journal-calendar-nav-next"
				onClick={onNextMonth}
				title={strings.calendar.nextMonth}
				aria-label={strings.calendar.nextMonth}
			>
				<ChevronRightIcon />
			</button>
		</div>
	);
};
