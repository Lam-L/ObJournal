import { useMemo, useState, useCallback } from 'react';
import { JournalEntry } from '../utils/utils';
import { dateToIso, getMonthGrid, type CalendarDay } from '../utils/calendarUtils';

export interface UseCalendarMonthResult {
	/** Currently displayed month (for switching) */
	cursorMonth: Date;
	setCursorMonth: (d: Date) => void;
	/** Previous month */
	prevMonth: () => void;
	/** Next month */
	nextMonth: () => void;
	/** Go to today's month */
	goToToday: () => void;
	/** Currently selected date iso */
	selectedIso: string | null;
	setSelectedIso: (iso: string | null) => void;
	/** 6×7 date grid */
	days: CalendarDay[];
	/** iso -> entry map */
	entriesByIso: Map<string, JournalEntry>;
	/** iso -> first image URL */
	firstImageUrlByIso: Map<string, string>;
}

/**
 * Calendar month data hook: generate grid and maps from entries and cursorMonth
 * entries filtered by targetFolderPath in useJournalEntries
 */
export function useCalendarMonth(entries: JournalEntry[]): UseCalendarMonthResult {
	const [cursorMonth, setCursorMonth] = useState(() => {
		const d = new Date();
		d.setDate(1);
		return d;
	});
	const [selectedIso, setSelectedIso] = useState<string | null>(null);

	const prevMonth = useCallback(() => {
		setCursorMonth((prev) => {
			const d = new Date(prev.getFullYear(), prev.getMonth() - 1, 1);
			return d;
		});
	}, []);

	const nextMonth = useCallback(() => {
		setCursorMonth((prev) => {
			const d = new Date(prev.getFullYear(), prev.getMonth() + 1, 1);
			return d;
		});
	}, []);

	const goToToday = useCallback(() => {
		const d = new Date();
		d.setDate(1);
		setCursorMonth(d);
	}, []);

	const { days, entriesByIso, firstImageUrlByIso } = useMemo(() => {
		const days = getMonthGrid(cursorMonth);
		const entriesByIso = new Map<string, JournalEntry>();
		const firstImageUrlByIso = new Map<string, string>();

		for (const entry of entries) {
			const iso = dateToIso(entry.date);
			// Multiple entries per day; take first (date descending, so latest)
			if (!entriesByIso.has(iso)) {
				entriesByIso.set(iso, entry);
				if (entry.images.length > 0 && entry.images[0].url) {
					firstImageUrlByIso.set(iso, entry.images[0].url);
				}
			}
		}

		return { days, entriesByIso, firstImageUrlByIso };
	}, [entries, cursorMonth]);

	return {
		cursorMonth,
		setCursorMonth,
		prevMonth,
		nextMonth,
		goToToday,
		selectedIso,
		setSelectedIso,
		days,
		entriesByIso,
		firstImageUrlByIso,
	};
}
