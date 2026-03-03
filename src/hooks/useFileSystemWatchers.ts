import { useEffect, useRef, useCallback } from 'react';
import { TAbstractFile, TFile, EventRef } from 'obsidian';
import { useJournalView } from '../context/JournalViewContext';
import { useJournalData } from '../context/JournalDataContext';
import { getStorage } from '../storage/storageLifecycle';
import { getThumbnailKey, canGenerateThumbnail } from '../utils/thumbnailGenerator';
import { thumbnailBlobCache } from '../utils/thumbnailCache';

export const useFileSystemWatchers = () => {
    const { app, targetFolderPath } = useJournalView();
    const { refresh, updateSingleEntry, updateEntryAfterRename } = useJournalData();
    const refreshTimerRef = useRef<number | null>(null);
    const eventRefsRef = useRef<EventRef[]>([]);

    const shouldRefreshForFile = useCallback((file: TAbstractFile): boolean => {
        if (!(file instanceof TFile)) {
            return false;
        }

        if (file.extension !== 'md') {
            return false;
        }

        if (targetFolderPath && !file.path.startsWith(targetFolderPath)) {
            return false;
        }

        return true;
    }, [targetFolderPath]);

    const debouncedRefresh = useCallback(() => {
        if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
        }

        refreshTimerRef.current = window.setTimeout(() => {
            refresh();
            refreshTimerRef.current = null;
        }, 500); // Increase debounce to 500ms to reduce frequent refresh
    }, [refresh]);

    useEffect(() => {
        const handleFileCreate = (file: TAbstractFile) => {
            if (shouldRefreshForFile(file)) {
                debouncedRefresh();
            }
        };

        const handleFileDelete = (file: TAbstractFile) => {
            if (file && 'path' in file) {
                getStorage()?.delete(file.path).catch((e) => console.warn('Journal View: IndexedDB delete failed', e));
            }
            if (shouldRefreshForFile(file)) {
                debouncedRefresh();
            }
        };

        const handleFileModify = (file: TAbstractFile) => {
            if (shouldRefreshForFile(file) && file instanceof TFile) {
                // For modify, use incremental update
                updateSingleEntry(file);
            }
        };

        const handleFileRename = (file: TAbstractFile, oldPath: string) => {
            const oldPathInTarget = targetFolderPath ? oldPath.startsWith(targetFolderPath) : true;
            const newPathInTarget = shouldRefreshForFile(file);

            if (oldPathInTarget || newPathInTarget) {
                // If new path in target folder, use incremental update
                if (newPathInTarget && file instanceof TFile) {
                    updateEntryAfterRename(file, oldPath);
                } else {
                    // If file moved out of target folder, use full refresh
                    debouncedRefresh();
                }
            }

            // P5: Move thumbnail blob when image file is renamed (reference nn)
            if (file instanceof TFile && canGenerateThumbnail(file.path)) {
                const mtime = file.stat.mtime;
                const oldKey = getThumbnailKey(oldPath, mtime);
                const newKey = getThumbnailKey(file.path, mtime);
                thumbnailBlobCache.remove(oldKey);
                getStorage()?.moveThumbnailBlob(oldKey, newKey).catch(() => {});
            }
        };

        const handleMetadataChange = (file: TAbstractFile | null) => {
            if (!file) {
                return;
            }

            if (shouldRefreshForFile(file) && file instanceof TFile) {
                // For metadata change, use incremental update
                updateSingleEntry(file);
            }
        };

        // Register Vault event listeners
        const vaultEventRefs: EventRef[] = [
            app.vault.on('create', handleFileCreate),
            app.vault.on('delete', handleFileDelete),
            app.vault.on('rename', handleFileRename),
            app.vault.on('modify', handleFileModify),
        ];

        // Register Metadata Cache event listener
        const metadataEventRef = app.metadataCache.on('changed', handleMetadataChange);

        // Save all event refs
        eventRefsRef.current = [...vaultEventRefs, metadataEventRef];

        // Cleanup
        return () => {
            // Clear debounce timer
            if (refreshTimerRef.current) {
                clearTimeout(refreshTimerRef.current);
                refreshTimerRef.current = null;
            }

            // Unregister all event listeners
            eventRefsRef.current.forEach((eventRef) => {
                app.vault.offref(eventRef);
            });
            app.metadataCache.offref(metadataEventRef);
            eventRefsRef.current = [];
        };
    }, [app, targetFolderPath, shouldRefreshForFile, debouncedRefresh, updateSingleEntry, updateEntryAfterRename]);
};
