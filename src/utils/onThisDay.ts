import type { JournalEntry } from './utils';
import { strings } from '../i18n';

/** Check if entry is "on this day" (same month-day, past years) */
export function isOnThisDay(entry: JournalEntry): boolean {
	const today = new Date();
	const d = new Date(entry.date);
	return (
		d.getMonth() === today.getMonth() &&
		d.getDate() === today.getDate() &&
		d.getFullYear() < today.getFullYear()
	);
}

/** Filter entries for "on this day", sorted by year descending (most recent first) */
export function getOnThisDayEntries(entries: JournalEntry[]): JournalEntry[] {
	return entries
		.filter(isOnThisDay)
		.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** Get latest "on this day" within past year (for home display) */
export function getLatestOnThisDayWithinYear(entries: JournalEntry[]): JournalEntry | null {
	const onThisDay = getOnThisDayEntries(entries);
	if (onThisDay.length === 0) return null;
	// Latest within year = first (year descending, so largest year)
	return onThisDay[0];
}

/** Format "X years ago" */
export function formatYearsAgo(entry: JournalEntry): string {
	const years = new Date().getFullYear() - new Date(entry.date).getFullYear();
	return strings.onThisDay.yearsAgo(years);
}
