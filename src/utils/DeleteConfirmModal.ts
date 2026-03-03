import { App, Modal } from 'obsidian';

export interface DeleteConfirmModalOptions {
	message: string;
	confirmText?: string;
	cancelText?: string;
	onConfirm: () => void | Promise<void>;
}

/**
 * Native Obsidian-style confirm dialog, replaces window.confirm()
 * Native Modal avoids focus loss (e.g. editor cannot get cursor after delete)
 */
export class DeleteConfirmModal extends Modal {
	private options: DeleteConfirmModalOptions;

	constructor(app: App, options: DeleteConfirmModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		this.setTitle('');
		this.contentEl.createEl('p', { text: this.options.message });
		const btnContainer = this.contentEl.createDiv({ cls: 'modal-button-container' });
		btnContainer
			.createEl('button', { text: this.options.cancelText ?? 'Cancel', cls: 'mod-cta' })
			.addEventListener('click', () => this.close());
		const confirmBtn = btnContainer.createEl('button', {
			text: this.options.confirmText ?? 'Confirm',
			cls: 'mod-warning',
		});
		confirmBtn.addEventListener('click', async () => {
			await this.options.onConfirm();
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
