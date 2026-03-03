import React from 'react';
import { TFolder, TFile } from 'obsidian';
import { useJournalView } from '../context/JournalViewContext';
import { useJournalData } from '../context/JournalDataContext';
import { useJournalViewMode } from '../context/JournalViewModeContext';
import { strings } from '../i18n';

export const JournalHeader: React.FC = () => {
	const { app, plugin, targetFolderPath } = useJournalView();
	const { refresh } = useJournalData();
	const { viewMode, cycleViewMode } = useJournalViewMode();

	const handleCreateNote = async () => {
		try {
			// Determine target folder
			let targetFolder: TFolder | null = null;

			if (targetFolderPath) {
				const folder = app.vault.getAbstractFileByPath(targetFolderPath);
				if (folder instanceof TFolder) {
					targetFolder = folder;
				}
			}

			// If no folder specified, use Vault root
			if (!targetFolder) {
				// Try first top-level folder or root
				const rootFolders = app.vault.getAllFolders();
				if (rootFolders.length > 0) {
					// Use first folder's parent (usually root)
					targetFolder = rootFolders[0].parent;
				}
			}

			if (!targetFolder) {
				console.error('Cannot determine target folder');
				return;
			}

			// Get content: read from template and replace variables only when template is set, else empty
			let fileContent = '';
			const templatePath = (plugin as { settings?: { templatePath?: string | null } })?.settings?.templatePath;

			if (templatePath) {
				const today = new Date();
				const year = today.getFullYear();
				const month = String(today.getMonth() + 1).padStart(2, '0');
				const day = String(today.getDate()).padStart(2, '0');
				const titleStr = `${year}年${month}月${day}日`;
				const timeStr = `${String(today.getHours()).padStart(2, '0')}-${String(today.getMinutes()).padStart(2, '0')}`;
				const templateFile = app.vault.getAbstractFileByPath(templatePath);
				if (templateFile instanceof TFile) {
					try {
						const raw = await app.vault.read(templateFile);
						fileContent = raw
							.replace(/\{\{date\}\}/g, `${year}-${month}-${day}`)
							.replace(/\{\{year\}\}/g, String(year))
							.replace(/\{\{month\}\}/g, month)
							.replace(/\{\{day\}\}/g, day)
							.replace(/\{\{title\}\}/g, titleStr)
							.replace(/\{\{time\}\}/g, timeStr);
					} catch {
						// Leave empty on template read failure
					}
				}
			}

			// Filename: Untitled, append number on conflict
			let finalPath = targetFolder.path === '/' ? 'Untitled.md' : `${targetFolder.path}/Untitled.md`;
			let counter = 1;
			while (await app.vault.adapter.exists(finalPath)) {
				finalPath = targetFolder.path === '/'
					? `Untitled ${counter}.md`
					: `${targetFolder.path}/Untitled ${counter}.md`;
				counter++;
				if (counter > 100) break;
			}

			// Create file
			const newFile = await app.vault.create(finalPath, fileContent);

			// Open new file: new tab or current tab based on settings
			const openInNewTab = (plugin as { settings?: { openInNewTab?: boolean } })?.settings?.openInNewTab !== false;
			if (openInNewTab) {
				await app.workspace.openLinkText(finalPath, '', true);
			} else {
				const activeLeaf = app.workspace.activeLeaf;
				const targetLeaf =
					activeLeaf?.getViewState?.().type === 'journal-view-react'
						? activeLeaf
						: app.workspace.getLeaf(false);
				await targetLeaf?.openFile(newFile, { active: true });
			}

			// Wait for file metadata (ctime) to be fully updated before refresh
			setTimeout(async () => {
				const file = app.vault.getAbstractFileByPath(finalPath);
				if (file instanceof TFile) {
					console.debug('Refreshing, new file info:', {
						path: file.path,
						ctime: new Date(file.stat.ctime).toISOString(),
						ctimeMs: file.stat.ctime
					});
				}

				await refresh();
			}, 500);
		} catch (error) {
			console.error('Failed to create note:', error);
		}
	};

	return (
		<div className="journal-header">
			<div className="journal-title-container">
				<h1 className="journal-title-header">{strings.view.title}</h1>
				<div className="journal-header-buttons">
					<button
						className={`clickable-icon nav-action-button journal-view-mode-toggle ${viewMode === 'calendar' ? 'journal-header-button-view-mode-active' : ''}`}
						onClick={cycleViewMode}
						aria-label={viewMode === 'list' ? strings.view.switchToCalendar : strings.view.switchToList}
					>
						{viewMode === 'list' ? (
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-calendar">
								<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
								<line x1="16" y1="2" x2="16" y2="6" />
								<line x1="8" y1="2" x2="8" y2="6" />
								<line x1="3" y1="10" x2="21" y2="10" />
							</svg>
						) : (
							<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-list">
								<line x1="8" y1="6" x2="21" y2="6" />
								<line x1="8" y1="12" x2="21" y2="12" />
								<line x1="8" y1="18" x2="21" y2="18" />
								<line x1="3" y1="6" x2="3.01" y2="6" />
								<line x1="3" y1="12" x2="3.01" y2="12" />
								<line x1="3" y1="18" x2="3.01" y2="18" />
							</svg>
						)}
					</button>
					<button
						className="clickable-icon nav-action-button"
						onClick={handleCreateNote}
						aria-label={strings.view.newNote}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="svg-icon lucide-edit">
							<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
							<path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
						</svg>
					</button>
				</div>
			</div>
		</div>
	);
};
