/**
 * Calendar utility functions
 */

/**
 * Convert Date to ISO date string (YYYY-MM-DD)
 */
export function dateToIso(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
}

/** Day cell type in calendar: current month | prev month tail | next month head */
export type DayCellType = 'current' | 'prev' | 'next';

export interface CalendarDay {
	date: Date;
	iso: string;
	type: DayCellType;
	/** Whether today */
	isToday: boolean;
}

/**
 * Generate calendar grid for a month (Sunday as first day)
 * Row count varies 4~6 by month; compact layout
 * Includes prev month tail and next month head to fill gaps
 */
export function getMonthGrid(cursorMonth: Date): CalendarDay[] {
	const year = cursorMonth.getFullYear();
	const month = cursorMonth.getMonth();
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	// First day of current month
	const firstDay = new Date(year, month, 1);
	const firstDayOfWeek = firstDay.getDay(); // 0=Sun, 1=Mon, ...

	// Last days of previous month
	const prevMonthLastDate = new Date(year, month, 0).getDate();
	const prevMonthDays: CalendarDay[] = [];
	for (let i = firstDayOfWeek - 1; i >= 0; i--) {
		const d = prevMonthLastDate - i;
		const date = new Date(year, month - 1, d);
		prevMonthDays.push({
			date,
			iso: dateToIso(date),
			type: 'prev',
			isToday: isSameDay(date, today),
		});
	}

	// All days of current month
	const currentMonthDays = new Date(year, month + 1, 0).getDate();
	const currentDays: CalendarDay[] = [];
	for (let d = 1; d <= currentMonthDays; d++) {
		const date = new Date(year, month, d);
		currentDays.push({
			date,
			iso: dateToIso(date),
			type: 'current',
			isToday: isSameDay(date, today),
		});
	}

	// First days of next month (fill min rows, 4~6 by month)
	const totalSoFar = prevMonthDays.length + currentDays.length;
	const minRowsNeeded = Math.ceil(totalSoFar / 7);
	const cellsNeeded = minRowsNeeded * 7;
	const nextMonthDaysNeeded = Math.max(0, cellsNeeded - totalSoFar);
	const nextDays: CalendarDay[] = [];
	for (let d = 1; d <= nextMonthDaysNeeded; d++) {
		const date = new Date(year, month + 1, d);
		nextDays.push({
			date,
			iso: dateToIso(date),
			type: 'next',
			isToday: isSameDay(date, today),
		});
	}

	return [...prevMonthDays, ...currentDays, ...nextDays];
}
