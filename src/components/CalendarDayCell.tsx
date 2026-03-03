import React, { memo } from 'react';
import type { CalendarDay } from '../utils/calendarUtils';
import type { JournalEntry } from '../utils/utils';

interface CalendarDayCellProps {
	day: CalendarDay;
	entry: JournalEntry | undefined;
	imageUrl: string | undefined;
	isSelected: boolean;
	onClick: (entry: JournalEntry | undefined, iso: string) => void;
}

export const CalendarDayCell = memo<CalendarDayCellProps>(function CalendarDayCell({
	day,
	entry,
	imageUrl,
	isSelected,
	onClick,
}) {
	const hasEntry = !!entry;
	const isEmpty = !hasEntry && day.type === 'current';

	const handleClick = () => {
		onClick(entry, day.iso);
	};

	const dayNum = day.date.getDate();

	return (
		<button
			type="button"
			className={`journal-calendar-day-cell ${day.type} ${day.isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${hasEntry ? 'has-entry' : ''} ${imageUrl ? 'has-image' : ''} ${isEmpty ? 'is-empty' : ''}`}
			onClick={handleClick}
			title={hasEntry ? (entry?.title ?? day.iso) : day.iso}
		>
			<span className="journal-calendar-day-cell-inner">
				{imageUrl ? (
					<img
						src={imageUrl}
						alt=""
						className="journal-calendar-day-image"
						loading="lazy"
					/>
				) : (
					<span className="journal-calendar-day-placeholder" />
				)}
				<span className="journal-calendar-day-number">{dayNum}</span>
			</span>
		</button>
	);
});
