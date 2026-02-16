import { JournalEntry } from './utils';

/**
 * 统计计算器
 * 负责计算手记相关的统计数据
 */
export class StatisticsCalculator {
	/**
	 * 计算连续记录天数
	 * 从今天开始往前计算连续有记录的日期
	 */
	static calculateConsecutiveDays(entries: JournalEntry[]): number {
		if (entries.length === 0) return 0;

		// 获取所有日期并去重
		const dates = new Set(
			entries.map((e) => {
				const d = new Date(e.date);
				d.setHours(0, 0, 0, 0);
				return d.getTime();
			})
		);

		const sortedDates = Array.from(dates).sort((a, b) => b - a);
		if (sortedDates.length === 0) return 0;

		// 从今天开始计算连续天数
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const todayTime = today.getTime();

		let consecutive = 0;
		let currentDate = todayTime;

		for (const dateTime of sortedDates) {
			if (dateTime === currentDate) {
				consecutive++;
				currentDate -= 24 * 60 * 60 * 1000; // 减一天
			} else if (dateTime < currentDate) {
				break;
			}
		}

		return consecutive;
	}

	/**
	 * 计算总字数
	 */
	static calculateTotalWords(entries: JournalEntry[]): number {
		return entries.reduce((sum, e) => sum + e.wordCount, 0);
	}

	/**
	 * 计算写手记天数（去重后的日期数）
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
	 * 计算总图片数
	 */
	static calculateTotalImages(entries: JournalEntry[]): number {
		return entries.reduce((sum, e) => sum + e.images.length, 0);
	}
}
