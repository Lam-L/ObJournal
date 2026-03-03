import React, { createContext, useContext, useState, ReactNode } from 'react';

export type JournalViewMode = 'list' | 'calendar';

interface JournalViewModeContextValue {
	viewMode: JournalViewMode;
	setViewMode: (mode: JournalViewMode) => void;
	cycleViewMode: () => void;
}

const JournalViewModeContext = createContext<JournalViewModeContextValue | null>(null);

export const useJournalViewMode = () => {
	const context = useContext(JournalViewModeContext);
	if (!context) {
		throw new Error('useJournalViewMode must be used within JournalViewModeProvider');
	}
	return context;
};

interface JournalViewModeProviderProps {
	children: ReactNode;
}

export const JournalViewModeProvider: React.FC<JournalViewModeProviderProps> = ({ children }) => {
	const [viewMode, setViewMode] = useState<JournalViewMode>('list');

	const cycleViewMode = () => {
		setViewMode((prev) => (prev === 'list' ? 'calendar' : 'list'));
	};

	return (
		<JournalViewModeContext.Provider
			value={{
				viewMode,
				setViewMode,
				cycleViewMode,
			}}
		>
			{children}
		</JournalViewModeContext.Provider>
	);
};
