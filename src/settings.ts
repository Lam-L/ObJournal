import { Plugin } from 'obsidian';

export interface JournalPluginSettings {
	folderPath: string; // Kept for backward compatibility
	defaultFolderPath: string | null; // Default folder path (dropdown selection)
	imageLimit: number;
	folderJournalViews: Record<string, string>; // folder path -> view file path
	folderDateFields: Record<string, string>; // folder path -> date field name (in frontmatter)
	/** Template folder path for selecting template files (e.g. "Templates") */
	templateFolderPath: string | null;
	/** Template file path for new notes (e.g. "Templates/Journal.md"), empty uses default format */
	templatePath: string | null;
	imageGap: number; // Gap between image containers (px)
	openInNewTab: boolean; // Open notes in new tab (true=new tab, false=current tab)
	enableEditorImageLayout: boolean; // Enable journal-style image layout in Live Preview for default folder
	showJournalStats: boolean; // Show stats bar (consecutive days, word count, days with entries)
}

export const DEFAULT_SETTINGS: JournalPluginSettings = {
	folderPath: '',
	defaultFolderPath: null,
	imageLimit: 3,
	folderJournalViews: {},
	folderDateFields: {},
	templateFolderPath: null,
	templatePath: null,
	imageGap: 10,
	openInNewTab: true,
	enableEditorImageLayout: true,
	showJournalStats: false,
};
