import { ItemView, WorkspaceLeaf, App, EventRef } from 'obsidian';
import { strings } from '../i18n';
import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { JournalViewProvider } from '../context/JournalViewContext';
import { JournalViewContainer } from '../components/JournalViewContainer';
import type { JournalViewPluginLike } from '../types';

export const JOURNAL_VIEW_TYPE = 'journal-view-react';

/** Dispatched when this view's leaf becomes active; virtualizer listens to remeasure */
export const JOURNAL_VIEW_ACTIVE_EVENT = 'journal-view-react:active';

export interface JournalViewState extends Record<string, unknown> {
	targetFolderPath?: string | null;
}

export class JournalView extends ItemView {
	private root: Root | null = null;
	private plugin: JournalViewPluginLike | null = null;
	public targetFolderPath: string | null = null;
	private activeLeafEventRef: EventRef | null = null;

	constructor(leaf: WorkspaceLeaf, app: App, plugin?: JournalViewPluginLike) {
		super(leaf);
		this.plugin = plugin || null;
	}

	refresh(): Promise<void> {
		// Re-render React component to trigger data refresh
		if (this.root) {
			this.renderReact();
		}
		return Promise.resolve();
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

	getState(): JournalViewState {
		return {
			targetFolderPath: this.targetFolderPath,
		};
	}

		setState(state: unknown, _result?: { history?: boolean }): Promise<void> {
		const s = state != null && typeof state === 'object' && 'targetFolderPath' in state
			? (state as JournalViewState)
			: undefined;
		// If state has targetFolderPath, use it
		// Otherwise keep current value (if any) to avoid accidental clear
		if (s?.targetFolderPath !== undefined) {
			this.targetFolderPath = s.targetFolderPath;
		} else if (this.targetFolderPath === null && this.plugin?.settings) {
			// If current is null and state has none, try to restore from plugin settings
			const settings = this.plugin.settings;
			if (settings.defaultFolderPath) {
				this.targetFolderPath = settings.defaultFolderPath;
			} else if (settings.folderPath) {
				this.targetFolderPath = settings.folderPath;
			}
		}
		// If React component already rendered, update it
		if (this.root) {
			this.renderReact();
		}
		return Promise.resolve();
	}

	async onOpen(): Promise<void> {
		// Use ItemView contentEl (Obsidian official API), avoid DOM structure dependency
		const container = this.contentEl;
		if (!container) {
			return Promise.resolve();
		}

		// When this view's leaf becomes active, notify virtualizer to remeasure (fixes white screen on tab switch)
		this.activeLeafEventRef = this.app.workspace.on('active-leaf-change', (leaf) => {
			if (leaf && leaf.view === (this as import('obsidian').View) && this.contentEl) {
				this.contentEl.dispatchEvent(new CustomEvent(JOURNAL_VIEW_ACTIVE_EVENT));
			}
		});
		if (this.plugin?.registerEvent) {
			this.plugin.registerEvent(this.activeLeafEventRef);
		}

		// Ensure targetFolderPath is set correctly
		// Prefer saved state; if none, restore from plugin settings
		if (this.targetFolderPath === null && this.plugin?.settings) {
			const s = this.plugin.settings;
			if (s.defaultFolderPath) {
				this.targetFolderPath = s.defaultFolderPath;
			} else if (s.folderPath) {
				this.targetFolderPath = s.folderPath;
			}
		}

		// Apply image gap setting
		if (this.plugin?.settings?.imageGap !== undefined) {
			document.documentElement.style.setProperty('--journal-image-gap', `${this.plugin.settings.imageGap}px`);
		}

		// Create React Root
		this.root = createRoot(container);
		this.renderReact();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		if (this.activeLeafEventRef) {
			this.app.workspace.offref(this.activeLeafEventRef);
			this.activeLeafEventRef = null;
		}
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		return Promise.resolve();
	}

	private renderReact(): void {
		if (!this.root) {
			return;
		}

		// Apply image gap setting (update on each render)
		if (this.plugin?.settings?.imageGap !== undefined) {
			document.documentElement.style.setProperty('--journal-image-gap', `${this.plugin.settings.imageGap}px`);
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
