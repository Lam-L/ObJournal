import { Plugin, TFolder } from 'obsidian';
import { JournalView, JOURNAL_VIEW_TYPE } from './view/JournalView';
import { strings } from './i18n';
import { JournalPluginSettings, DEFAULT_SETTINGS } from './settings';
import { JournalSettingTab } from './settings/JournalSettingTab';
import { EditorImageLayout } from './editor/EditorImageLayout';
import { initializeStorage, shutdownStorage } from './storage/storageLifecycle';

export class JournalViewPlugin extends Plugin {
	settings: JournalPluginSettings;
	view: JournalView | null = null;
	private editorImageLayout: EditorImageLayout | null = null;

	async onload() {
		await this.loadSettings();

		// Apply image gap globally (editor image layout needs it)
		document.documentElement.style.setProperty('--journal-image-gap', `${this.settings.imageGap}px`);

		// Complete IndexedDB init before registering view to avoid storage not ready when view opens
		await initializeStorage(this.app).catch((e) => {
			console.warn('Journal View: IndexedDB init failed', e);
		});

		// Journal-style image layout in Live Preview (notes in default folder)
		this.editorImageLayout = new EditorImageLayout(this.app, this);
		this.editorImageLayout.initialize();

		// Register view
		this.registerView(JOURNAL_VIEW_TYPE, (leaf) => {
			const view = new JournalView(leaf, this.app, this);
			this.view = view;
			return view;
		});

		// Add command to open view
		this.addCommand({
			id: 'open-journal-view',
			name: strings.commands.openJournal,
			callback: async () => {
				try {
					await this.activateView();
				} catch (e) {
					console.error('手记视图: 打开失败', e);
				}
			},
		});

		// Add command to refresh journal view
		this.addCommand({
			id: 'refresh-journal-view',
			name: strings.commands.refreshJournal,
			callback: () => {
				if (this.view) {
					this.view.refresh();
				}
			},
		});

		// Add settings tab
		this.addSettingTab(new JournalSettingTab(this.app, this));

		// If view already open, activate it
		this.app.workspace.onLayoutReady(() => {
			const existingLeaf = this.app.workspace.getLeavesOfType(
				JOURNAL_VIEW_TYPE
			)[0];
			if (existingLeaf && existingLeaf.view instanceof JournalView) {
				this.view = existingLeaf.view;
			}
		});

		console.log('Journal View Plugin (React) loaded');
	}

	async onunload() {
		this.editorImageLayout?.destroy();
		shutdownStorage();
		console.log('Journal View Plugin (React) unloaded');
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(JOURNAL_VIEW_TYPE)[0];

		if (!leaf) {
			// Open in main content area (not sidebar)
			const newLeaf = workspace.getLeaf(true);
			if (newLeaf) {
				await newLeaf.setViewState({ type: JOURNAL_VIEW_TYPE, active: true });
				leaf = newLeaf;
			}
		}

		if (leaf && leaf.view instanceof JournalView) {
			// Ensure targetFolderPath is set correctly
			let targetPath: string | null = null;

			// If default folder is set, use it
			if (this.settings.defaultFolderPath) {
				const defaultFolder = this.app.vault.getAbstractFileByPath(this.settings.defaultFolderPath);
				if (defaultFolder instanceof TFolder) {
					targetPath = defaultFolder.path;
				}
			} else if (this.settings.folderPath) {
				// If no default folder, use legacy folderPath (backward compatibility)
				const folder = this.app.vault.getAbstractFileByPath(this.settings.folderPath);
				if (folder instanceof TFolder) {
					targetPath = folder.path;
				}
			}

			// Force set targetFolderPath (even if same, ensures correct state)
			// Ensures correct restore when view is replaced and reopened
			const previousPath = leaf.view.targetFolderPath;
			leaf.view.targetFolderPath = targetPath;
			
			// Refresh if path changed or view just opened (needs init)
			// Check leaf's viewState to determine if view was just created
			const viewState = leaf.getViewState();
			const isNewView = !viewState.state || !viewState.state.targetFolderPath;
			
			if (previousPath !== targetPath || isNewView) {
				await leaf.view.refresh();
			}

			// Use setActiveLeaf to ensure tab is active and view visible (revealLeaf may be insufficient)
			workspace.setActiveLeaf(leaf, { focus: true });
			workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		const data = (await this.loadData()) || {};
		const migrated = { ...data };
		// Migration: remove old defaultTemplate, use templatePath
		if ('defaultTemplate' in migrated) {
			delete migrated.defaultTemplate;
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, migrated);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

export default JournalViewPlugin;
