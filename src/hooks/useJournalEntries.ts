import { useState, useEffect, useCallback, useRef } from 'react';
import { TFile, TFolder } from 'obsidian';
import { useJournalView } from '../context/JournalViewContext';
import { JournalEntry, extractDate, extractImagesFromContent, generatePreview, countWords, extractTitle } from '../utils/utils';
import { PAGINATION } from '../constants';
import { getStorage } from '../storage/storageLifecycle';
import { journalEntryToCached, cachedToJournalEntry } from '../storage/cacheAdapter';
import { logger } from '../utils/logger';

function sortEntries(entries: JournalEntry[]): JournalEntry[] {
	return [...entries].sort((a, b) => {
		const dateDiff = b.date.getTime() - a.date.getTime();
		if (dateDiff !== 0) return dateDiff;
		const ctimeDiff = b.file.stat.ctime - a.file.stat.ctime;
		if (ctimeDiff !== 0) return ctimeDiff;
		return b.file.path.localeCompare(a.file.path);
	});
}

export const useJournalEntries = () => {
	const { app, targetFolderPath, plugin } = useJournalView();
	const [entries, setEntries] = useState<JournalEntry[]>([]);
	const [isLoading, setIsLoading] = useState(true); // Start true: avoid flashing "Start scan" before load begins
	const [error, setError] = useState<Error | null>(null);
	const entriesMapRef = useRef<Map<string, JournalEntry>>(new Map());

	const loadEntryMetadata = async (file: TFile): Promise<JournalEntry | null> => {
		try {
			const content = await app.vault.read(file);
			
			// Get custom date field config for current folder
			let customDateField: string | undefined = undefined;
			if (plugin && targetFolderPath) {
				const pluginSettings = (plugin as any).settings;
				if (pluginSettings?.folderDateFields && pluginSettings.folderDateFields[targetFolderPath]) {
					customDateField = pluginSettings.folderDateFields[targetFolderPath];
				}
			}
			
			const date = extractDate(file, content, app, customDateField);
			if (!date) {
				// If no date, skip this file
				return null;
			}
			const title = extractTitle(content, file.basename, app, file);
			const images = extractImagesFromContent(content, file, app);
			const preview = generatePreview(content, 200); // Use default max length
			const wordCount = countWords(content);

			return {
				file,
				date,
				title,
				content,
				images,
				preview,
				wordCount,
			};
		} catch (error) {
			console.error(`Error loading entry ${file.path}:`, error);
			return null;
		}
	};

	const getMarkdownFilesInFolder = (folder: TFolder): TFile[] => {
		const files: TFile[] = [];
		const processFolder = (f: TFolder) => {
			for (const child of f.children) {
				if (child instanceof TFile && child.extension === 'md') {
					files.push(child);
				} else if (child instanceof TFolder) {
					processFolder(child);
				}
			}
		};
		processFolder(folder);
		return files;
	};

	const loadEntries = useCallback(async () => {
		setIsLoading(true);
		setError(null);

		try {
			let files: TFile[] = [];
			if (targetFolderPath) {
				const targetFolder = app.vault.getAbstractFileByPath(targetFolderPath);
				if (targetFolder instanceof TFolder) {
					files = getMarkdownFilesInFolder(targetFolder);
				} else {
					files = app.vault.getMarkdownFiles();
				}
			} else {
				files = app.vault.getMarkdownFiles();
			}

			const currentFilePaths = new Set(files.map((f) => f.path));
			const toRemove: string[] = [];
			for (const [path] of entriesMapRef.current) {
				if (!currentFilePaths.has(path)) toRemove.push(path);
			}
			for (const path of toRemove) {
				entriesMapRef.current.delete(path);
			}

			// IndexedDB cache: batch read cache for current files
			const storage = getStorage();
			let cachedMap = new Map<string, import('../storage/types').CachedJournalEntry>();
			if (storage) {
				try {
					const paths = files.map((f) => f.path);
					cachedMap = await storage.getMany(paths);
				} catch (e) {
					logger.warn('IndexedDB read failed', e);
				}
			}

			// Distinguish: from cache vs need to load from vault
			const toProcess: TFile[] = [];
			for (const file of files) {
				const cached = cachedMap.get(file.path);
				if (cached && cached.mtime === file.stat.mtime) {
					const entry = cachedToJournalEntry(cached, app);
					if (entry) entriesMapRef.current.set(file.path, entry);
				} else {
					toProcess.push(file);
				}
			}

			// Show existing results first (including cache hits)
			const buildAndSetResults = () => {
				const results = sortEntries(Array.from(entriesMapRef.current.values()));
				setEntries((prev) => {
					if (prev.length !== results.length) return results;
					const prevMap = new Map(prev.map((e) => [e.file.path, e]));
					const hasChange = results.some(
						(e) => prevMap.get(e.file.path)?.file.stat.mtime !== e.file.stat.mtime
					);
					return hasChange ? results : prev;
				});
			};
			buildAndSetResults();

			// Background load toProcess, write to IndexedDB
			if (toProcess.length > 0 && storage) {
				const batchSize = PAGINATION.BATCH_SIZE;
				for (let i = 0; i < toProcess.length; i += batchSize) {
					const batch = toProcess.slice(i, i + batchSize);
					const batchResults = await Promise.all(
						batch.map((file) =>
							loadEntryMetadata(file).catch((e) => {
								console.error(`Error processing file ${file.path}:`, e);
								return null;
							})
						)
					);
					const toPersist: import('../storage/types').CachedJournalEntry[] = [];
					for (const entry of batchResults) {
						if (entry) {
							entriesMapRef.current.set(entry.file.path, entry);
							toPersist.push(journalEntryToCached(entry));
						}
					}
					if (toPersist.length > 0) {
						storage.batchPut(toPersist).catch((e) => logger.warn('IndexedDB write failed', e));
					}
					buildAndSetResults();
				}
			} else if (toProcess.length > 0) {
				// No IndexedDB, use original batch load
				const batchSize = PAGINATION.BATCH_SIZE;
				for (let i = 0; i < toProcess.length; i += batchSize) {
					const batch = toProcess.slice(i, i + batchSize);
					const batchResults = await Promise.all(
						batch.map((file) =>
							loadEntryMetadata(file).catch((e) => {
								console.error(`Error processing file ${file.path}:`, e);
								return null;
							})
						)
					);
					for (const entry of batchResults) {
						if (entry) entriesMapRef.current.set(entry.file.path, entry);
					}
					buildAndSetResults();
				}
			}
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Unknown error'));
		} finally {
			setIsLoading(false);
		}
	}, [app, targetFolderPath, plugin]);

	// Incremental update for single file
	const updateSingleEntry = useCallback(async (file: TFile) => {
		const entry = await loadEntryMetadata(file);
		if (!entry) {
			entriesMapRef.current.delete(file.path);
			getStorage()?.delete(file.path).catch((e) => logger.warn('IndexedDB delete failed', e));
		} else {
			entriesMapRef.current.set(file.path, entry);
			getStorage()?.put(journalEntryToCached(entry)).catch((e) => logger.warn('IndexedDB put failed', e));
		}
		setEntries(sortEntries(Array.from(entriesMapRef.current.values())));
	}, []);

	// Handle file rename: delete old path, add new path
	const updateEntryAfterRename = useCallback(async (file: TFile, oldPath: string) => {
		entriesMapRef.current.delete(oldPath);
		getStorage()?.delete(oldPath).catch((e) => logger.warn('IndexedDB delete failed', e));

		const entry = await loadEntryMetadata(file);
		if (entry) {
			entriesMapRef.current.set(file.path, entry);
			getStorage()?.put(journalEntryToCached(entry)).catch((e) => logger.warn('IndexedDB put failed', e));
		}
		setEntries(sortEntries(Array.from(entriesMapRef.current.values())));
	}, [app, targetFolderPath, plugin]);

	useEffect(() => {
		loadEntries();
	}, [loadEntries]);

	return {
		entries,
		isLoading,
		error,
		refresh: loadEntries,
		updateSingleEntry,
		updateEntryAfterRename,
	};
};
