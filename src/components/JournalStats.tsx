import React from 'react';
import { useJournalData } from '../context/JournalDataContext';
import { StatisticsCalculator } from '../utils/StatisticsCalculator';
import { strings } from '../i18n';

const formatNumber = (num: number): string => {
	if (num >= 10000) {
		const w = Math.floor(num / 10000);
		const remainder = Math.floor((num % 10000) / 1000);
		if (remainder > 0) {
			return `${w}.${remainder}w`;
		}
		return `${w}w`;
	} else if (num >= 1000) {
		const k = Math.floor(num / 1000);
		const remainder = Math.floor((num % 1000) / 100);
		if (remainder > 0) {
			return `${k}.${remainder}k`;
		}
		return `${k}k`;
	}
	return num.toString();
};

// Create SVG icons (keep consistent with original)
const createSVGIcon = (iconName: 'flame' | 'message' | 'calendar', size: number = 20, color?: string): string => {
	const iconColor = color || 'currentColor';
	const svgMap = {
		flame: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`,
		message: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`,
		calendar: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`
	};
	return svgMap[iconName];
};

export const JournalStats: React.FC = () => {
	const { entries } = useJournalData();

	const consecutiveDays = StatisticsCalculator.calculateConsecutiveDays(entries);
	const totalWords = StatisticsCalculator.calculateTotalWords(entries);
	const totalDays = StatisticsCalculator.calculateTotalDays(entries);

	return (
		<div className="journal-stats">
			{/* Stat 1: Consecutive days (red flame icon) */}
			<div className="journal-stat-item">
				<div className="journal-stat-content">
					<div className="journal-stat-icon journal-stat-icon-flame" dangerouslySetInnerHTML={{ __html: createSVGIcon('flame', 20, '#ef4444') }} />
					<div className="journal-stat-value">{formatNumber(consecutiveDays)}</div>
				</div>
				<div className="journal-stat-label">{strings.stats.consecutiveDays}</div>
			</div>

			{/* Stat 2: Word count (red message bubble icon) */}
			<div className="journal-stat-item">
				<div className="journal-stat-content">
					<div className="journal-stat-icon journal-stat-icon-message" dangerouslySetInnerHTML={{ __html: createSVGIcon('message', 20, '#ef4444') }} />
					<div className="journal-stat-value">{formatNumber(totalWords)}</div>
				</div>
				<div className="journal-stat-label">{strings.stats.totalWords}</div>
			</div>

			{/* Stat 3: Days with entries (blue calendar icon) */}
			<div className="journal-stat-item">
				<div className="journal-stat-content">
					<div className="journal-stat-icon journal-stat-icon-calendar" dangerouslySetInnerHTML={{ __html: createSVGIcon('calendar', 20, '#3b82f6') }} />
					<div className="journal-stat-value">{formatNumber(totalDays)}</div>
				</div>
				<div className="journal-stat-label">{strings.stats.totalDays}</div>
			</div>
		</div>
	);
};
