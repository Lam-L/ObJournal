import React, { createContext, useContext, ReactNode } from 'react';
import { TFile } from 'obsidian';
import { JournalEntry } from '../utils/utils';

interface JournalDataContextValue {
	entries: JournalEntry[];
	isLoading: boolean;
	error: Error | null;
	refresh: () => Promise<void>;
	updateSingleEntry: (file: TFile) => Promise<void>;
	updateEntryAfterRename: (file: TFile, oldPath: string) => Promise<void>;
}

const JournalDataContext = createContext<JournalDataContextValue | null>(null);

export const useJournalData = () => {
	const context = useContext(JournalDataContext);
	if (!context) {
		throw new Error('useJournalData must be used within JournalDataProvider');
	}
	return context;
};

interface JournalDataProviderProps {
	entries: JournalEntry[];
	isLoading: boolean;
	error: Error | null;
	refresh: () => Promise<void>;
	updateSingleEntry: (file: TFile) => Promise<void>;
	updateEntryAfterRename: (file: TFile, oldPath: string) => Promise<void>;
	children: ReactNode;
}

export const JournalDataProvider: React.FC<JournalDataProviderProps> = ({
	entries,
	isLoading,
	error,
	refresh,
	updateSingleEntry,
	updateEntryAfterRename,
	children,
}) => {
	return (
		<JournalDataContext.Provider
			value={{
				entries,
				isLoading,
				error,
				refresh,
				updateSingleEntry,
				updateEntryAfterRename,
			}}
		>
			{children}
		</JournalDataContext.Provider>
	);
};
