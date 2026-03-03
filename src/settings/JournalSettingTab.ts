import { PluginSettingTab, Setting, App, TFolder, TFile } from 'obsidian';
import { JournalViewPlugin } from '../main';
import { JournalPluginSettings } from '../settings';
import { strings } from '../i18n';
import { getStorage } from '../storage/storageLifecycle';

export class JournalSettingTab extends PluginSettingTab {
	plugin: JournalViewPlugin;

	constructor(app: App, plugin: JournalViewPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: strings.settings.title });

		// Create section container
		const createSection = (parent: HTMLElement, title: string) => {
			const section = parent.createDiv({ cls: 'journal-settings-section' });
			section.createEl('h3', { text: title, cls: 'journal-settings-section-title' });
			return section;
		};

		// Get all folders recursively
		const getAllFolders = (): TFolder[] => {
			const folders: TFolder[] = [];
			const processFolder = (folder: TFolder) => {
				folders.push(folder);
				for (const child of folder.children) {
					if (child instanceof TFolder) {
						processFolder(child);
					}
				}
			};
			// Start from root, process all folders recursively
			const rootFolders = this.app.vault.getAllFolders();
			for (const folder of rootFolders) {
				processFolder(folder);
			}
			// Sort by path
			return folders.sort((a, b) => a.path.localeCompare(b.path));
		};

		// Extract all frontmatter fields from folder
		const extractFrontmatterFields = (folderPath: string | null): Set<string> => {
			const fields = new Set<string>();
			if (!folderPath) return fields;

			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!(folder instanceof TFolder)) return fields;

			// Recursively get all Markdown files in folder
			const getMarkdownFiles = (f: TFolder): TFile[] => {
				const files: TFile[] = [];
				for (const child of f.children) {
					if (child instanceof TFile && child.extension === 'md') {
						files.push(child);
					} else if (child instanceof TFolder) {
						files.push(...getMarkdownFiles(child));
					}
				}
				return files;
			};

			const files = getMarkdownFiles(folder);
			for (const file of files) {
				const metadata = this.app.metadataCache.getFileCache(file);
				if (metadata?.frontmatter) {
					// Extract all frontmatter field names
					for (const key in metadata.frontmatter) {
						if (metadata.frontmatter.hasOwnProperty(key)) {
							fields.add(key);
						}
					}
				}
			}
			return fields;
		};

		// Get all .md files in folder (no subfolders)
		const getMarkdownFilesInFolder = (folderPath: string | null): TFile[] => {
			if (!folderPath) return [];
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!(folder instanceof TFolder)) return [];
			return (folder.children || [])
				.filter((c): c is TFile => c instanceof TFile && c.extension === 'md')
				.sort((a, b) => a.path.localeCompare(b.path));
		};

		// ========== Basics ==========
		const sectionBasics = createSection(containerEl, strings.settings.sectionBasics);
		let dateFieldSetting: Setting;

		new Setting(sectionBasics)
			.setName(strings.settings.defaultFolder)
			.setDesc(strings.settings.defaultFolderDesc)
			.addDropdown((dropdown) => {
				dropdown.addOption('', strings.settings.scanEntireVault);
				const folders = getAllFolders();
				for (const folder of folders) {
					dropdown.addOption(folder.path, folder.path);
				}
				const currentPath = this.plugin.settings.defaultFolderPath || this.plugin.settings.folderPath || '';
				dropdown.setValue(currentPath);
				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultFolderPath = value || null;
					this.plugin.settings.folderPath = value;
					await this.plugin.saveSettings();
					const dateFieldDropdown = dateFieldSetting.settingEl.querySelector('select') as HTMLSelectElement;
					if (dateFieldDropdown) updateDropdownOptions(dateFieldDropdown, value || null);
					updateDateFieldVisibility();
					if (this.plugin.view) {
						if (value) {
							const folder = this.app.vault.getAbstractFileByPath(value);
							this.plugin.view.targetFolderPath = folder instanceof TFolder ? folder.path : null;
						} else {
							this.plugin.view.targetFolderPath = null;
						}
						await this.plugin.view.refresh();
					}
				});
			});

		// Date field config (shown only when folder is selected)
		dateFieldSetting = new Setting(sectionBasics)
			.setName(strings.settings.dateField)
			.setDesc(strings.settings.dateFieldDesc)
			.addDropdown((dropdown) => {
				dropdown.addOption('', strings.settings.useDefaultFields);
				dropdown.addOption('date', 'date');
				dropdown.addOption('Date', 'Date');
				dropdown.addOption('created', 'created');
				dropdown.addOption('created_time', 'created_time');
				dropdown.addOption('created_at', 'created_at');
				dropdown.addOption('publish_date', 'publish_date');
				dropdown.addOption('publishDate', 'publishDate');

				// Extract frontmatter fields from folder and add to dropdown
				let currentPath = this.plugin.settings.defaultFolderPath || this.plugin.settings.folderPath || '';
				if (currentPath) {
					const folderFields = extractFrontmatterFields(currentPath);
					const commonFields = new Set(['', 'date', 'Date', 'created', 'created_time', 'created_at', 'publish_date', 'publishDate']);

					// Add fields actually used in folder (exclude common ones already added)
					const sortedFields = Array.from(folderFields)
						.filter(field => !commonFields.has(field))
						.sort();

					if (sortedFields.length > 0) {
						// Add separator (special value)
						dropdown.addOption('---separator---', '──────────');
						// Add folder fields
						for (const field of sortedFields) {
							dropdown.addOption(field, field);
						}
					}
				}

				dropdown.addOption('custom', strings.settings.custom);

				// Set current value
				currentPath = this.plugin.settings.defaultFolderPath || this.plugin.settings.folderPath || '';
				const currentDateField = currentPath ? (this.plugin.settings.folderDateFields[currentPath] || '') : '';

				// If current value exists in options, set it; else set "custom"
				if (currentDateField) {
					// Check if option exists
					const optionExists = Array.from(dropdown.selectEl.options).some(opt => opt.value === currentDateField);
					if (optionExists && currentDateField !== '---separator---') {
						dropdown.setValue(currentDateField);
					} else {
						dropdown.setValue('custom');
					}
				} else {
					dropdown.setValue('');
				}

				dropdown.onChange(async (value) => {
					// Ignore separator option
					if (value === '---separator---') {
						dropdown.setValue(currentDateField || '');
						return;
					}

					const folderPath = this.plugin.settings.defaultFolderPath || this.plugin.settings.folderPath || '';
					if (folderPath) {
						if (value === 'custom') {
							// If "custom" selected, show input for user
							const customInput = document.createElement('input');
							customInput.type = 'text';
							customInput.placeholder = strings.settings.customFieldPlaceholder;
							const currentDateField = folderPath ? (this.plugin.settings.folderDateFields[folderPath] || '') : '';
							// Check if current value is in dropdown options
							const optionExists = Array.from(dropdown.selectEl.options).some(opt => opt.value === currentDateField && opt.value !== '---separator---');
							customInput.value = currentDateField && !optionExists ? currentDateField : '';
							customInput.style.width = '200px';
							customInput.style.marginLeft = '10px';

							// Remove previous custom input if exists
							const existingInput = dateFieldSetting.settingEl.querySelector('.custom-date-field-input') as HTMLInputElement;
							if (existingInput) {
								existingInput.remove();
							}

							customInput.classList.add('custom-date-field-input');
							dateFieldSetting.settingEl.appendChild(customInput);

							// Focus input
							customInput.focus();

							// Listen for input change
							const handleCustomInput = async () => {
								const customValue = customInput.value.trim();
								if (customValue) {
									this.plugin.settings.folderDateFields[folderPath] = customValue;
								} else {
									delete this.plugin.settings.folderDateFields[folderPath];
								}
								await this.plugin.saveSettings();

								// Refresh if view is open
								if (this.plugin.view) {
									await this.plugin.view.refresh();
								}
							};

							customInput.addEventListener('blur', handleCustomInput);
							customInput.addEventListener('keydown', (e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									handleCustomInput();
									customInput.blur();
								}
							});
						} else {
							// Remove custom input if exists
							const existingInput = dateFieldSetting.settingEl.querySelector('.custom-date-field-input') as HTMLInputElement;
							if (existingInput) {
								existingInput.remove();
							}

							if (value) {
								this.plugin.settings.folderDateFields[folderPath] = value;
							} else {
								delete this.plugin.settings.folderDateFields[folderPath];
							}
							await this.plugin.saveSettings();

							// Refresh if view is open
							if (this.plugin.view) {
								await this.plugin.view.refresh();
							}
						}
					}
				});
			});

		// Update dropdown options when folder changes
		const updateDropdownOptions = (dropdown: HTMLSelectElement, folderPath: string | null) => {
			// Save current selection
			const currentValue = dropdown.value;

			// Clear all options except defaults (including separator)
			const defaultOptions = ['', 'date', 'Date', 'created', 'created_time', 'created_at', 'publish_date', 'publishDate', 'custom'];
			const optionsToKeep = new Set(defaultOptions);

			// Remove options not in default list (including separator)
			for (let i = dropdown.options.length - 1; i >= 0; i--) {
				const option = dropdown.options[i];
				if (!optionsToKeep.has(option.value)) {
					dropdown.remove(i);
				}
			}

			// Extract fields from new folder
			if (folderPath) {
				const folderFields = extractFrontmatterFields(folderPath);
				const commonFields = new Set(['', 'date', 'Date', 'created', 'created_time', 'created_at', 'publish_date', 'publishDate']);

				// Add fields actually used in folder (excluding already-added common fields)
				const sortedFields = Array.from(folderFields)
					.filter(field => !commonFields.has(field))
					.sort();

				if (sortedFields.length > 0) {
					// Find "custom" option position
					const customOptionIndex = Array.from(dropdown.options).findIndex(opt => opt.value === 'custom');

					// Insert separator and fields before "custom"
					if (customOptionIndex >= 0) {
						// Check if separator already exists
						const hasSeparator = Array.from(dropdown.options).some(opt => opt.value === '---separator---');
						if (!hasSeparator) {
							const separatorOption = new Option('──────────', '---separator---');
							separatorOption.disabled = true;
							dropdown.insertBefore(separatorOption, dropdown.options[customOptionIndex]);
						}

						// Insert field options
						for (let i = sortedFields.length - 1; i >= 0; i--) {
							const field = sortedFields[i];
							const option = new Option(field, field);
							dropdown.insertBefore(option, dropdown.options[customOptionIndex + (hasSeparator ? 1 : 2)]);
						}
					}
				}
			}

			// Restore previous selection if still valid
			if (currentValue && Array.from(dropdown.options).some(opt => opt.value === currentValue)) {
				dropdown.value = currentValue;
			} else {
				// If previous value invalid, check if should set "custom"
				const currentPath = this.plugin.settings.defaultFolderPath || this.plugin.settings.folderPath || '';
				const currentDateField = currentPath ? (this.plugin.settings.folderDateFields[currentPath] || '') : '';
				if (currentDateField && currentDateField !== currentValue) {
					dropdown.value = 'custom';
				} else {
					dropdown.value = '';
				}
			}
		};

		// Show/hide date field based on selected folder
		const updateDateFieldVisibility = () => {
			const currentPath = this.plugin.settings.defaultFolderPath || this.plugin.settings.folderPath || '';
			if (currentPath) {
				dateFieldSetting.settingEl.style.display = '';
				// Update dropdown value and options
				const dropdown = dateFieldSetting.settingEl.querySelector('select') as HTMLSelectElement;
				if (dropdown) {
					// Update options list
					updateDropdownOptions(dropdown, currentPath);

					const currentDateField = this.plugin.settings.folderDateFields[currentPath] || '';
					// If current value exists in options, set it; else set "custom"
					if (currentDateField) {
						const optionExists = Array.from(dropdown.options).some(opt => opt.value === currentDateField && opt.value !== '---separator---');
						if (optionExists) {
							dropdown.value = currentDateField;
						} else {
							dropdown.value = 'custom';
							// If custom selected, ensure input exists and update value
							let customInput = dateFieldSetting.settingEl.querySelector('.custom-date-field-input') as HTMLInputElement;
							if (!customInput) {
								customInput = document.createElement('input');
								customInput.type = 'text';
								customInput.placeholder = strings.settings.customFieldPlaceholder;
								customInput.style.width = '200px';
								customInput.style.marginLeft = '10px';
								customInput.classList.add('custom-date-field-input');
								dateFieldSetting.settingEl.appendChild(customInput);

								// Listen for input change
								const handleCustomInput = async () => {
									const customValue = customInput.value.trim();
									if (customValue) {
										this.plugin.settings.folderDateFields[currentPath] = customValue;
									} else {
										delete this.plugin.settings.folderDateFields[currentPath];
									}
									await this.plugin.saveSettings();

									// Refresh if view is open
									if (this.plugin.view) {
										await this.plugin.view.refresh();
									}
								};

								customInput.addEventListener('blur', handleCustomInput);
								customInput.addEventListener('keydown', (e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										handleCustomInput();
										customInput.blur();
									}
								});
							}
							customInput.value = currentDateField;
						}
					} else {
						dropdown.value = '';
						// Remove custom input (if exists)
						const existingInput = dateFieldSetting.settingEl.querySelector('.custom-date-field-input') as HTMLInputElement;
						if (existingInput) {
							existingInput.remove();
						}
					}
				}
			} else {
				dateFieldSetting.settingEl.style.display = 'none';
			}
		};

		// ========== Template ==========
		const sectionTemplate = createSection(containerEl, strings.settings.sectionTemplate);
		const templateFolderSetting = new Setting(sectionTemplate)
			.setName(strings.settings.templateFolder)
			.setDesc(strings.settings.templateFolderDesc)
			.addDropdown((dropdown) => {
				dropdown.addOption('', strings.settings.templateNone);
				for (const folder of getAllFolders()) {
					dropdown.addOption(folder.path, folder.path);
				}
				dropdown.setValue(this.plugin.settings.templateFolderPath || '');
				dropdown.onChange(async (value) => {
					this.plugin.settings.templateFolderPath = value || null;
					this.plugin.settings.templatePath = null; // Clear template when folder changes
					await this.plugin.saveSettings();
					await updateTemplateFileDropdown();
				});
			});

		const templateFileSetting = new Setting(sectionTemplate)
			.setName(strings.settings.templateFile)
			.setDesc(strings.settings.templateFileDesc)
			.addDropdown((dropdown) => {
				dropdown.addOption('', strings.settings.templateFileNone);
				const files = getMarkdownFilesInFolder(this.plugin.settings.templateFolderPath);
				for (const file of files) {
					dropdown.addOption(file.path, file.path);
				}
				dropdown.setValue(this.plugin.settings.templatePath || '');
				dropdown.onChange(async (value) => {
					this.plugin.settings.templatePath = value || null;
					await this.plugin.saveSettings();
				});
			});

		const updateTemplateFileDropdown = async () => {
			const selectEl = templateFileSetting.settingEl.querySelector('select');
			if (!selectEl) return;
			while (selectEl.options.length > 0) {
				selectEl.remove(0);
			}
			selectEl.add(new Option(strings.settings.templateFileNone, ''));
			const files = getMarkdownFilesInFolder(this.plugin.settings.templateFolderPath);
			for (const file of files) {
				selectEl.add(new Option(file.path, file.path));
			}
			const validPath = this.plugin.settings.templatePath && files.some(f => f.path === this.plugin.settings.templatePath);
			selectEl.value = validPath ? this.plugin.settings.templatePath! : '';
			if (!validPath && this.plugin.settings.templatePath) {
				this.plugin.settings.templatePath = null;
				await this.plugin.saveSettings();
			}
		};

		updateTemplateFileDropdown();

		// ========== View & Display ==========
		const sectionDisplay = createSection(containerEl, strings.settings.sectionDisplay);
		new Setting(sectionDisplay)
			.setName(strings.settings.showJournalStats)
			.setDesc(strings.settings.showJournalStatsDesc)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showJournalStats === true)
					.onChange(async (value) => {
						this.plugin.settings.showJournalStats = value;
						await this.plugin.saveSettings();
						if (this.plugin.view) {
							await this.plugin.view.refresh();
						}
					});
			});

		// ========== Editor ==========
		const sectionEditor = createSection(containerEl, strings.settings.sectionEditor);
		new Setting(sectionEditor)
			.setName(strings.settings.editorImageLayout)
			.setDesc(strings.settings.editorImageLayoutDesc)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.enableEditorImageLayout !== false)
					.onChange(async (value) => {
						this.plugin.settings.enableEditorImageLayout = value;
						await this.plugin.saveSettings();
					});
			});

		// Initial visibility state
		updateDateFieldVisibility();

		new Setting(sectionDisplay)
			.setName(strings.settings.imageDisplayLimit)
			.setDesc(strings.settings.imageDisplayLimitDesc)
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 1)
					.setValue(this.plugin.settings.imageLimit)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.imageLimit = value;
						await this.plugin.saveSettings();
						// Refresh view
						if (this.plugin.view) {
							this.plugin.view.refresh();
						}
					})
			);

		new Setting(sectionDisplay)
			.setName(strings.settings.imageGap)
			.setDesc(strings.settings.imageGapDesc)
			.addSlider((slider) =>
				slider
					.setLimits(0, 30, 1)
					.setValue(this.plugin.settings.imageGap)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.imageGap = value;
						await this.plugin.saveSettings();
						// Update CSS variable
						document.documentElement.style.setProperty('--journal-image-gap', `${value}px`);
						// Refresh view
						if (this.plugin.view) {
							this.plugin.view.refresh();
						}
					})
			);

		// ========== Interaction ==========
		const sectionInteraction = createSection(containerEl, strings.settings.sectionInteraction);
		new Setting(sectionInteraction)
			.setName(strings.settings.openNoteMode)
			.setDesc(strings.settings.openNoteModeDesc)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.openInNewTab)
					.setTooltip(this.plugin.settings.openInNewTab ? strings.settings.tooltipNewTab : strings.settings.tooltipCurrentTab)
					.onChange(async (value) => {
						this.plugin.settings.openInNewTab = value;
						await this.plugin.saveSettings();
						toggle.setTooltip(value ? strings.settings.tooltipNewTab : strings.settings.tooltipCurrentTab);
					});
			})
			.addExtraButton((button) => {
				button
					.setIcon('info')
					.setTooltip(strings.settings.tooltipOpenMode)
					.onClick(() => {});
			});

		// ========== Maintenance ==========
		const sectionMaintenance = createSection(containerEl, strings.settings.sectionMaintenance);

		const formatBytes = (bytes: number): string => {
			if (bytes < 1024) return `${bytes} B`;
			if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
			return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
		};

		const storageSetting = new Setting(sectionMaintenance)
			.setName(strings.settings.storageUsage)
			.setDesc(strings.settings.storageUsageCalculating);

		getStorage()
			?.getStorageSizeEstimate?.()
			.then((size) => {
				if (size) {
					const entries = formatBytes(size.entriesBytes);
					const thumbnails = formatBytes(size.thumbnailsBytes);
					const total = formatBytes(size.totalBytes);
					storageSetting.setDesc(
						`${strings.settings.storageUsageEntries}: ${entries}, ${strings.settings.storageUsageThumbnails}: ${thumbnails}, ${strings.settings.storageUsageTotal}: ${total}`
					);
				}
			})
			.catch(() => {
				storageSetting.setDesc(strings.settings.storageUsageError);
			});

		new Setting(sectionMaintenance)
			.setName(strings.settings.clearCache)
			.setDesc(strings.settings.clearCacheDesc)
			.addButton((button) => {
				button
					.setButtonText(strings.settings.clearCacheButton)
					.onClick(async () => {
						const storage = getStorage();
						if (storage) {
							await storage.clear();
							if (this.plugin.view) await this.plugin.view.refresh();
							new (await import('obsidian')).Notice('Journal cache cleared');
							// Refresh storage display
							storage.getStorageSizeEstimate().then((size) => {
								const entries = formatBytes(size.entriesBytes);
								const thumbnails = formatBytes(size.thumbnailsBytes);
								const total = formatBytes(size.totalBytes);
								storageSetting.setDesc(
									`${strings.settings.storageUsageEntries}: ${entries}, ${strings.settings.storageUsageThumbnails}: ${thumbnails}, ${strings.settings.storageUsageTotal}: ${total}`
								);
							});
						} else {
							new (await import('obsidian')).Notice('Cache not initialized');
						}
					});
			});
	}
}
