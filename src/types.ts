/**
 * Shared types to avoid circular imports.
 * JournalViewPlugin from main.ts satisfies these interfaces.
 */
import type { EventRef, MarkdownPostProcessorContext } from 'obsidian';
import type { JournalPluginSettings } from './settings';

export interface JournalViewPluginLike {
	settings: JournalPluginSettings;
	saveSettings?(): Promise<void>;
	view?: { refresh(): void | Promise<void> } | null;
	registerEvent?(eventRef: EventRef): void;
}

/** Plugin interface for EditorImageLayout (requires register methods from base Plugin) */
export interface EditorImageLayoutPlugin extends JournalViewPluginLike {
	registerEvent(eventRef: EventRef): void;
	registerMarkdownPostProcessor(
		processor: (element: HTMLElement, context: MarkdownPostProcessorContext) => void | Promise<void>
	): void;
}
