import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { useJournalView } from './JournalViewContext';

export type OnThisDayDisplayMode = 'single' | 'all' | 'hidden';

interface OnThisDayContextValue {
	displayMode: OnThisDayDisplayMode;
	setDisplayMode: (mode: OnThisDayDisplayMode) => void;
	cycleDisplayMode: () => void;
	isModalOpen: boolean;
	openModal: () => void;
	closeModal: () => void;
}

const OnThisDayContext = createContext<OnThisDayContextValue | null>(null);

export const useOnThisDay = () => {
	const ctx = useContext(OnThisDayContext);
	if (!ctx) throw new Error('useOnThisDay must be used within OnThisDayProvider');
	return ctx;
};

interface OnThisDayProviderProps {
	children: ReactNode;
}

export const OnThisDayProvider: React.FC<OnThisDayProviderProps> = ({ children }) => {
	const { plugin } = useJournalView();
	const [isModalOpen, setIsModalOpen] = useState(false);

	const displayMode: OnThisDayDisplayMode =
		(plugin && (plugin as any).settings?.onThisDayDisplayMode) || 'single';

	const setDisplayMode = useCallback(
		(mode: OnThisDayDisplayMode) => {
			if (!plugin || !(plugin as any).settings) return;
			(plugin as any).settings.onThisDayDisplayMode = mode;
			(plugin as any).saveSettings?.();
			// Trigger view refresh to reflect new state
			(plugin as any).view?.refresh?.();
		},
		[plugin]
	);

	const cycleDisplayMode = useCallback(() => {
		const next: Record<OnThisDayDisplayMode, OnThisDayDisplayMode> = {
			single: 'all',
			all: 'hidden',
			hidden: 'single',
		};
		setDisplayMode(next[displayMode]);
	}, [displayMode, setDisplayMode]);

	const openModal = useCallback(() => setIsModalOpen(true), []);
	const closeModal = useCallback(() => setIsModalOpen(false), []);

	const value: OnThisDayContextValue = {
		displayMode,
		setDisplayMode,
		cycleDisplayMode,
		isModalOpen,
		openModal,
		closeModal,
	};

	return (
		<OnThisDayContext.Provider value={value}>
			{children}
		</OnThisDayContext.Provider>
	);
};
