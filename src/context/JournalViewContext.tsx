import React, { createContext, useContext, ReactNode } from 'react';
import { App } from 'obsidian';
import type { JournalViewPluginLike } from '../types';

interface JournalViewContextValue {
	app: App;
	plugin: JournalViewPluginLike | null;
	targetFolderPath: string | null;
	setTargetFolderPath: (path: string | null) => void;
}

const JournalViewContext = createContext<JournalViewContextValue | null>(null);

export const useJournalView = () => {
	const context = useContext(JournalViewContext);
	if (!context) {
		throw new Error('useJournalView must be used within JournalViewProvider');
	}
	return context;
};

interface JournalViewProviderProps {
	app: App;
	plugin: JournalViewPluginLike | null;
	targetFolderPath: string | null;
	setTargetFolderPath: (path: string | null) => void;
	children: ReactNode;
}

export const JournalViewProvider: React.FC<JournalViewProviderProps> = ({
	app,
	plugin,
	targetFolderPath,
	setTargetFolderPath,
	children,
}: JournalViewProviderProps) => {
	return (
		<JournalViewContext.Provider
			value={{
				app,
				plugin,
				targetFolderPath,
				setTargetFolderPath,
			}}
		>
			{children}
		</JournalViewContext.Provider>
	);
};
