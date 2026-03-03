import { JournalEntry } from './utils';

/**
 * Statistics calculator
 * Computes journal-related stats
 */
export class StatisticsCalculator {
	/**
	 * Calculate consecutive days with entries
	 * From today backward
	 */
	static calculateConsecutiveDays(entries: JournalEntry[]): number {
		if (entries.length === 0) return 0;

		// Get all unique dates
		const dates = new Set(
			entries.map((e) => {
				const d = new Date(e.date);
				d.setHours(0, 0, 0, 0);
				return d.getTime();
			})
		);

		const sortedDates = Array.from(dates).sort((a, b) => b - a);
		if (sortedDates.length === 0) return 0;

		// Count consecutive from today
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayTime = today.getTime();

		let consecutive = 0;
		let currentDate = todayTime;

		for (const dateTime of sortedDates) {
			if (dateTime === currentDate) {
				consecutive++;
				currentDate -= 24 * 60 * 60 * 1000; // Subtract one day
			} else if (dateTime < currentDate) {
				break;
			}
		}

		return consecutive;
	}

	/**
	 * Calculate total word count
	 */
	static calculateTotalWords(entries: JournalEntry[]): number {
		return entries.reduce((sum, e) => sum + e.wordCount, 0);
	}

	/**
	 * Calculate days with entries (unique dates)
	 */
	static calculateTotalDays(entries: JournalEntry[]): number {
		if (entries.length === 0) return 0;

		const uniqueDates = new Set(
			entries.map((e) => {
				const d = new Date(e.date);
				d.setHours(0, 0, 0, 0);
				return d.getTime();
			})
		);

		return uniqueDates.size;
	}

	/**
	 * Calculate total image count
	 */
	static calculateTotalImages(entries: JournalEntry[]): number {
		return entries.reduce((sum, e) => sum + e.images.length, 0);
	}
}
