import { ItemView, WorkspaceLeaf, App, Plugin, EventRef } from 'obsidian';
import { strings } from '../i18n';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { JournalViewProvider } from '../context/JournalViewContext';
import { JournalViewContainer } from '../components/JournalViewContainer';

export const JOURNAL_VIEW_TYPE = 'journal-view-react';

/** Dispatched when this view's leaf becomes active; virtualizer listens to remeasure */
export const JOURNAL_VIEW_ACTIVE_EVENT = 'journal-view-react:active';

export class JournalView extends ItemView {
	private root: Root | null = null;
	private plugin: Plugin | null = null;
	public targetFolderPath: string | null = null;
	private activeLeafEventRef: EventRef | null = null;

	constructor(leaf: WorkspaceLeaf, app: App, plugin?: Plugin) {
		super(leaf);
		this.plugin = plugin || null;
	}

	async refresh(): Promise<void> {
		// Re-render React component to trigger data refresh
		if (this.root) {
			this.renderReact();
		}
	}

	getViewType(): string {
		return JOURNAL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return strings.view.viewName;
	}

	getIcon(): string {
		return 'calendar';
	}

	getState(): any {
		return {
			targetFolderPath: this.targetFolderPath,
		};
	}

	async setState(state: any): Promise<void> {
		// If state has targetFolderPath, use it
		// Otherwise keep current value (if any) to avoid accidental clear
		if (state?.targetFolderPath !== undefined) {
			this.targetFolderPath = state.targetFolderPath;
		} else if (this.targetFolderPath === null && this.plugin) {
			// If current is null and state has none, try to restore from plugin settings
			const pluginSettings = (this.plugin as any).settings;
			if (pluginSettings?.defaultFolderPath) {
				this.targetFolderPath = pluginSettings.defaultFolderPath;
			} else if (pluginSettings?.folderPath) {
				this.targetFolderPath = pluginSettings.folderPath;
			}
		}
		// If React component already rendered, update it
		if (this.root) {
			this.renderReact();
		}
	}

	async onOpen(): Promise<void> {
		// Use ItemView contentEl (Obsidian official API), avoid DOM structure dependency
		const container = this.contentEl;
		if (!container) {
			return;
		}

		// When this view's leaf becomes active, notify virtualizer to remeasure (fixes white screen on tab switch)
		this.activeLeafEventRef = this.app.workspace.on('active-leaf-change', () => {
			if (this.app.workspace.activeLeaf?.view === this && this.contentEl) {
				this.contentEl.dispatchEvent(new CustomEvent(JOURNAL_VIEW_ACTIVE_EVENT));
			}
		});
		if (this.plugin) {
			this.plugin.registerEvent(this.activeLeafEventRef);
		}

		// Ensure targetFolderPath is set correctly
		// Prefer saved state; if none, restore from plugin settings
		if (this.targetFolderPath === null && this.plugin) {
			const pluginSettings = (this.plugin as any).settings;
			if (pluginSettings?.defaultFolderPath) {
				this.targetFolderPath = pluginSettings.defaultFolderPath;
			} else if (pluginSettings?.folderPath) {
				this.targetFolderPath = pluginSettings.folderPath;
			}
		}

		// Apply image gap setting
		if (this.plugin) {
			const pluginSettings = (this.plugin as any).settings;
			if (pluginSettings?.imageGap !== undefined) {
				document.documentElement.style.setProperty('--journal-image-gap', `${pluginSettings.imageGap}px`);
			}
		}

		// Create React Root
		this.root = createRoot(container);
		this.renderReact();
	}

	async onClose(): Promise<void> {
		if (this.activeLeafEventRef) {
			this.app.workspace.offref(this.activeLeafEventRef);
			this.activeLeafEventRef = null;
		}
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}

	private renderReact(): void {
		if (!this.root) {
			return;
		}

		// Apply image gap setting (update on each render)
		if (this.plugin) {
			const pluginSettings = (this.plugin as any).settings;
			if (pluginSettings?.imageGap !== undefined) {
				document.documentElement.style.setProperty('--journal-image-gap', `${pluginSettings.imageGap}px`);
			}
		}

		this.root.render(
			<React.StrictMode>
				<JournalViewProvider
					app={this.app}
					plugin={this.plugin}
					targetFolderPath={this.targetFolderPath}
					setTargetFolderPath={(path: string | null) => {
						this.targetFolderPath = path;
						this.renderReact();
					}}
				>
					<JournalViewContainer />
				</JournalViewProvider>
			</React.StrictMode>
		);
	}
}
