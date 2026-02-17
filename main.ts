import { Plugin, PluginSettingTab, Setting, App, TFolder, TFile, Menu, MenuItem, Notice, WorkspaceLeaf } from 'obsidian';
import { JournalView, JOURNAL_VIEW_TYPE } from './JournalView';
import { EditorImageLayout } from './EditorImageLayout';

interface JournalPluginSettings {
	folderPath: string; // 保留用于向后兼容
	defaultFolderPath: string | null; // 默认文件夹路径（下拉选择）
	imageLimit: number;
	folderJournalViews: Record<string, string>; // 文件夹路径 -> 视图文件路径
	enableAutoLayout: boolean; // 是否在手记视图文件夹中启用自动布局
	folderDateFields: Record<string, string>; // 文件夹路径 -> 日期字段名（frontmatter 中的字段名）
	defaultTemplate: string; // 创建新笔记时的默认模板
}

const DEFAULT_SETTINGS: JournalPluginSettings = {
	folderPath: '',
	defaultFolderPath: null,
	imageLimit: 3,
	folderJournalViews: {},
	enableAutoLayout: false, // 默认不启用
	folderDateFields: {}, // 文件夹路径 -> 日期字段名
	defaultTemplate: '', // 默认模板（空字符串表示使用默认格式）
};

export default class JournalPlugin extends Plugin {
	settings: JournalPluginSettings;
	view: JournalView | null = null;
	private editorImageLayout: EditorImageLayout | null = null;

	async onload() {
		await this.loadSettings();

		// 初始化编辑器图片布局增强
		this.editorImageLayout = new EditorImageLayout(this.app, this);
		this.editorImageLayout.initialize();

		// 注册视图
		this.registerView(JOURNAL_VIEW_TYPE, (leaf) => {
			const view = new JournalView(leaf, this.app, this);
			this.view = view;
			return view;
		});

		// 添加命令：打开手记视图
		this.addCommand({
			id: 'open-journal-view',
			name: '打开手记视图',
			callback: () => {
				this.activateView();
			},
		});

		// 添加命令：刷新手记视图
		this.addCommand({
			id: 'refresh-journal-view',
			name: '刷新手记视图',
			callback: () => {
				if (this.view) {
					this.view.refresh();
				}
			},
		});

		// 添加设置标签
		this.addSettingTab(new JournalSettingTab(this.app, this));

		// 注册文件夹右键菜单
		this.registerFolderContextMenu();

		// 监听文件浏览器点击事件（用于文件夹手记视图）
		this.registerDomEvent(document, 'click', (evt) => {
			this.handleFileExplorerClick(evt);
		}, true);

		// 监听文件打开事件（用于子文件手记视图）
		this.registerEvent(
			this.app.workspace.on('file-open', (file) => {
				this.handleFileOpen(file);
			})
		);

		// 如果已经有打开的视图，激活它
		this.app.workspace.onLayoutReady(() => {
			const existingLeaf = this.app.workspace.getLeavesOfType(
				JOURNAL_VIEW_TYPE
			)[0];
			if (existingLeaf && existingLeaf.view instanceof JournalView) {
				this.view = existingLeaf.view;
			}
		});
	}

	private registerFolderContextMenu(): void {
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				// 只对文件夹显示菜单
				if (file instanceof TFolder) {
					menu.addItem((item) => {
						item.setTitle('手记').setIcon('calendar');
						// @ts-ignore - setSubmenu 可能不在类型定义中，但实际存在
						const submenu = item.setSubmenu();

						// 选项1: 创建文件夹手记视图
						submenu.addItem((subItem: MenuItem) => {
							subItem
								.setTitle('创建文件夹手记视图')
								.setIcon('link')
								.onClick(async () => {
									await this.createFolderJournalView(file);
								});
						});

						// 选项2: 创建子文件手记视图
						submenu.addItem((subItem: MenuItem) => {
							subItem
								.setTitle('创建子文件手记视图')
								.setIcon('file-plus')
								.onClick(async () => {
									await this.createSubFileJournalView(file);
								});
						});
					});
				}
			})
		);
	}

	private async createFolderJournalView(folder: TFolder): Promise<void> {
		// 将文件夹与手记视图关联
		// 保存配置到插件设置
		this.settings.folderJournalViews[folder.path] = folder.path;
		await this.saveSettings();

		// 显示成功提示
		new Notice(`已为文件夹 "${folder.name}" 创建手记视图关联。点击文件夹时将自动打开手记视图。`);

		// 立即打开手记视图
		await this.openFolderJournalView(folder);
	}

	private async createSubFileJournalView(folder: TFolder): Promise<void> {
		// 在文件夹下创建手记视图文件
		const viewFileName = `${folder.name}手记视图.md`;
		const viewPath = `${folder.path}/${viewFileName}`;

		const viewContent = `---
journal-view: true
folder-path: ${folder.path}
type: sub-file
---

# ${folder.name} 手记视图

此文件显示文件夹 "${folder.name}" 下的所有手记条目。

## 使用说明

- 此文件会自动扫描当前文件夹下的所有 Markdown 文件
- 按日期组织显示
- 支持图片预览和内容预览
`;

		try {
			// 检查文件是否已存在
			const existingFile = this.app.vault.getAbstractFileByPath(viewPath);
			if (existingFile instanceof TFile) {
				new Notice(`文件 "${viewFileName}" 已存在`);
				// 打开手记视图而不是文件本身
				await this.openFolderJournalView(folder);
			} else {
				// 创建新文件
				await this.app.vault.create(viewPath, viewContent);
				// 打开手记视图
				await this.openFolderJournalView(folder);
				new Notice(`已创建手记视图文件: ${viewFileName}`);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			new Notice(`创建失败: ${errorMessage}`);
		}
	}

	private handleFileExplorerClick(evt: MouseEvent): void {
		const target = evt.target;
		if (!(target instanceof HTMLElement)) return;

		// 查找文件夹标题元素
		const folderTitleEl = target.closest('.nav-folder-title');
		if (!folderTitleEl) return;

		// 获取文件夹路径
		const folderPath = folderTitleEl.getAttribute('data-path');
		if (!folderPath) return;

		// 检查是否有关联的手记视图
		const viewPath = this.settings.folderJournalViews[folderPath];
		if (viewPath) {
			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (folder instanceof TFolder) {
				// 阻止默认行为
				evt.preventDefault();
				evt.stopImmediatePropagation();
				// 打开手记视图
				this.openFolderJournalView(folder);
			}
		}
	}

	private async handleFileOpen(file: TFile | null): Promise<void> {
		if (!file) return;

		// 检查文件是否是手记视图配置文件
		if (file.basename.endsWith('手记视图')) {
			const metadata = this.app.metadataCache.getFileCache(file);
			if (metadata?.frontmatter?.['journal-view']) {
				const folderPath = metadata.frontmatter['folder-path'];
				if (folderPath) {
					const folder = this.app.vault.getAbstractFileByPath(folderPath);
					if (folder instanceof TFolder) {
						// 阻止打开文件，改为打开手记视图
						// 注意：这里需要在文件打开之前拦截，所以需要延迟处理
						// 使用 requestAnimationFrame 代替 setTimeout 以获得更好的性能
						requestAnimationFrame(async () => {
							await new Promise(resolve => setTimeout(resolve, 100));
							await this.openFolderJournalView(folder);
						});
					}
				}
			}
		}
	}

	/**
	 * 创建或获取手记视图的 leaf
	 */
	private async createOrGetJournalViewLeaf(): Promise<WorkspaceLeaf | null> {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(JOURNAL_VIEW_TYPE)[0];

		if (!leaf) {
			// 在主内容区域打开（而不是侧边栏）
			const newLeaf = workspace.getLeaf(true);
			if (newLeaf) {
				await newLeaf.setViewState({ type: JOURNAL_VIEW_TYPE, active: true });
				leaf = newLeaf;
			}
		}

		return leaf;
	}

	private async openFolderJournalView(folder: TFolder): Promise<void> {
		const leaf = await this.createOrGetJournalViewLeaf();

		if (leaf && leaf.view instanceof JournalView) {
			// 设置视图的文件夹路径
			leaf.view.targetFolderPath = folder.path;
			// 刷新视图
			await leaf.view.refresh();
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async onunload() {
		// 清理资源
	}

	async activateView() {
		const leaf = await this.createOrGetJournalViewLeaf();
		if (leaf && leaf.view instanceof JournalView) {
			// 关键修复：先激活 leaf，确保切换到已存在的 tab
			// 使用 setActiveLeaf 而不是只使用 revealLeaf，确保 tab 被激活
			this.app.workspace.setActiveLeaf(leaf, { focus: true });

			// 检查视图是否已经有状态（已经加载过）
			const currentState = leaf.view.getState();
			const hasLoaded = currentState?.hasLoaded || false;

			// 如果设置了默认文件夹，使用默认文件夹
			if (this.settings.defaultFolderPath) {
				const defaultFolder = this.app.vault.getAbstractFileByPath(this.settings.defaultFolderPath);
				if (defaultFolder instanceof TFolder) {
					// 只有当目标文件夹改变时才刷新
					if (leaf.view.targetFolderPath !== defaultFolder.path) {
						leaf.view.targetFolderPath = defaultFolder.path;
						await leaf.view.refresh();
					} else if (!hasLoaded) {
						// 如果目标文件夹相同但还没有加载过，才刷新
						await leaf.view.refresh();
					}
				} else {
					// 如果默认文件夹不存在，清空路径（扫描整个vault）
					if (leaf.view.targetFolderPath !== null) {
						leaf.view.targetFolderPath = null;
						await leaf.view.refresh();
					} else if (!hasLoaded) {
						await leaf.view.refresh();
					}
				}
			} else {
				// 如果没有设置默认文件夹，使用旧的 folderPath 设置（向后兼容）
				if (this.settings.folderPath) {
					const folder = this.app.vault.getAbstractFileByPath(this.settings.folderPath);
					if (folder instanceof TFolder) {
						if (leaf.view.targetFolderPath !== folder.path) {
							leaf.view.targetFolderPath = folder.path;
							await leaf.view.refresh();
						} else if (!hasLoaded) {
							await leaf.view.refresh();
						}
					}
				} else if (!hasLoaded) {
					// 如果没有设置任何文件夹且还没有加载过，显示空状态（不自动刷新）
					// 让用户手动点击"开始扫描"
				}
			}

			// 再次确保 leaf 被激活（在某些情况下可能需要）
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class JournalSettingTab extends PluginSettingTab {
	plugin: JournalPlugin;

	constructor(app: App, plugin: JournalPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: '手记视图设置' });

		// 获取所有文件夹列表（递归获取所有子文件夹）
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
			// 从根目录开始，递归处理所有文件夹
			const rootFolders = this.app.vault.getAllFolders();
			for (const folder of rootFolders) {
				processFolder(folder);
			}
			// 按路径排序
			return folders.sort((a, b) => a.path.localeCompare(b.path));
		};

		// 从文件夹中提取所有 frontmatter 字段
		const extractFrontmatterFields = (folderPath: string | null): Set<string> => {
			const fields = new Set<string>();
			if (!folderPath) return fields;

			const folder = this.app.vault.getAbstractFileByPath(folderPath);
			if (!(folder instanceof TFolder)) return fields;

			// 递归获取文件夹下的所有 Markdown 文件
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
					// 提取所有 frontmatter 字段名
					for (const key in metadata.frontmatter) {
						if (metadata.frontmatter.hasOwnProperty(key)) {
							fields.add(key);
						}
					}
				}
			}
			return fields;
		};

		// 日期字段配置（仅在选择了文件夹时显示）
		const dateFieldSetting = new Setting(containerEl)
			.setName('日期字段')
			.setDesc('指定该文件夹下文件使用的日期字段（frontmatter 中的字段名）。如果文件没有该字段，将使用文件创建时间。选择"使用默认字段"则使用默认字段（date, Date, created, created_time）。')
			.addDropdown((dropdown) => {
				// 添加常用日期字段选项
				dropdown.addOption('', '使用默认字段');
				dropdown.addOption('date', 'date');
				dropdown.addOption('Date', 'Date');
				dropdown.addOption('created', 'created');
				dropdown.addOption('created_time', 'created_time');
				dropdown.addOption('created_at', 'created_at');
				dropdown.addOption('publish_date', 'publish_date');
				dropdown.addOption('publishDate', 'publishDate');

				// 从文件夹中提取所有 frontmatter 字段并添加到下拉列表
				let currentPath = this.plugin.settings.defaultFolderPath || this.plugin.settings.folderPath || '';
				if (currentPath) {
					const folderFields = extractFrontmatterFields(currentPath);
					const commonFields = new Set(['', 'date', 'Date', 'created', 'created_time', 'created_at', 'publish_date', 'publishDate']);

					// 添加文件夹中实际使用的字段（排除已添加的常用字段）
					const sortedFields = Array.from(folderFields)
						.filter(field => !commonFields.has(field))
						.sort();

					if (sortedFields.length > 0) {
						// 添加分隔线（使用特殊值）
						dropdown.addOption('---separator---', '──────────');
						// 添加文件夹中的字段
						for (const field of sortedFields) {
							dropdown.addOption(field, field);
						}
					}
				}

				dropdown.addOption('custom', '自定义...');

				// 设置当前值
				currentPath = this.plugin.settings.defaultFolderPath || this.plugin.settings.folderPath || '';
				const currentDateField = currentPath ? (this.plugin.settings.folderDateFields[currentPath] || '') : '';

				// 如果当前值在下拉选项中存在，直接设置；否则设置为"custom"
				if (currentDateField) {
					// 检查选项是否存在
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
					// 忽略分隔线选项
					if (value === '---separator---') {
						dropdown.setValue(currentDateField || '');
						return;
					}

					const folderPath = this.plugin.settings.defaultFolderPath || this.plugin.settings.folderPath || '';
					if (folderPath) {
						if (value === 'custom') {
							// 如果选择"自定义"，显示输入框让用户输入
							const customInput = document.createElement('input');
							customInput.type = 'text';
							customInput.placeholder = '输入自定义字段名';
							const currentDateField = folderPath ? (this.plugin.settings.folderDateFields[folderPath] || '') : '';
							// 检查当前值是否在下拉选项中
							const optionExists = Array.from(dropdown.selectEl.options).some(opt => opt.value === currentDateField && opt.value !== '---separator---');
							customInput.value = currentDateField && !optionExists ? currentDateField : '';
							customInput.style.width = '200px';
							customInput.style.marginLeft = '10px';

							// 移除之前的自定义输入框（如果存在）
							const existingInput = dateFieldSetting.settingEl.querySelector('.custom-date-field-input') as HTMLInputElement;
							if (existingInput) {
								existingInput.remove();
							}

							customInput.classList.add('custom-date-field-input');
							dateFieldSetting.settingEl.appendChild(customInput);

							// 聚焦输入框
							customInput.focus();

							// 监听输入框变化
							const handleCustomInput = async () => {
								const customValue = customInput.value.trim();
								if (customValue) {
									this.plugin.settings.folderDateFields[folderPath] = customValue;
								} else {
									delete this.plugin.settings.folderDateFields[folderPath];
								}
								await this.plugin.saveSettings();

								// 如果视图已打开，自动刷新
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
							// 移除自定义输入框（如果存在）
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

							// 如果视图已打开，自动刷新
							if (this.plugin.view) {
								await this.plugin.view.refresh();
							}
						}
					}
				});
			});

		// 更新下拉选择器的选项（当文件夹改变时）
		const updateDropdownOptions = (dropdown: HTMLSelectElement, folderPath: string | null) => {
			// 保存当前选中的值
			const currentValue = dropdown.value;

			// 清除除默认选项外的所有选项（包括分隔线）
			const defaultOptions = ['', 'date', 'Date', 'created', 'created_time', 'created_at', 'publish_date', 'publishDate', 'custom'];
			const optionsToKeep = new Set(defaultOptions);

			// 移除不在默认列表中的选项（包括分隔线）
			for (let i = dropdown.options.length - 1; i >= 0; i--) {
				const option = dropdown.options[i];
				if (!optionsToKeep.has(option.value)) {
					dropdown.remove(i);
				}
			}

			// 从新文件夹中提取字段
			if (folderPath) {
				const folderFields = extractFrontmatterFields(folderPath);
				const commonFields = new Set(['', 'date', 'Date', 'created', 'created_time', 'created_at', 'publish_date', 'publishDate']);

				// 添加文件夹中实际使用的字段（排除已添加的常用字段）
				const sortedFields = Array.from(folderFields)
					.filter(field => !commonFields.has(field))
					.sort();

				if (sortedFields.length > 0) {
					// 找到"custom"选项的位置
					const customOptionIndex = Array.from(dropdown.options).findIndex(opt => opt.value === 'custom');

					// 在"custom"之前插入分隔线和字段
					if (customOptionIndex >= 0) {
						// 检查是否已有分隔线
						const hasSeparator = Array.from(dropdown.options).some(opt => opt.value === '---separator---');
						if (!hasSeparator) {
							const separatorOption = new Option('──────────', '---separator---');
							separatorOption.disabled = true;
							dropdown.insertBefore(separatorOption, dropdown.options[customOptionIndex]);
						}

						// 插入字段选项
						for (let i = sortedFields.length - 1; i >= 0; i--) {
							const field = sortedFields[i];
							const option = new Option(field, field);
							dropdown.insertBefore(option, dropdown.options[customOptionIndex + (hasSeparator ? 1 : 2)]);
						}
					}
				}
			}

			// 恢复之前选中的值（如果仍然存在）
			if (currentValue && Array.from(dropdown.options).some(opt => opt.value === currentValue)) {
				dropdown.value = currentValue;
			} else {
				// 如果之前的值不存在了，检查是否应该设置为"custom"
				const currentPath = this.plugin.settings.defaultFolderPath || this.plugin.settings.folderPath || '';
				const currentDateField = currentPath ? (this.plugin.settings.folderDateFields[currentPath] || '') : '';
				if (currentDateField && currentDateField !== currentValue) {
					dropdown.value = 'custom';
				} else {
					dropdown.value = '';
				}
			}
		};

		// 根据当前选择的文件夹显示/隐藏日期字段设置
		const updateDateFieldVisibility = () => {
			const currentPath = this.plugin.settings.defaultFolderPath || this.plugin.settings.folderPath || '';
			if (currentPath) {
				dateFieldSetting.settingEl.style.display = '';
				// 更新下拉选择器的值和选项
				const dropdown = dateFieldSetting.settingEl.querySelector('select') as HTMLSelectElement;
				if (dropdown) {
					// 更新选项列表
					updateDropdownOptions(dropdown, currentPath);

					const currentDateField = this.plugin.settings.folderDateFields[currentPath] || '';
					// 如果当前值在下拉选项中存在，直接设置；否则设置为"custom"
					if (currentDateField) {
						const optionExists = Array.from(dropdown.options).some(opt => opt.value === currentDateField && opt.value !== '---separator---');
						if (optionExists) {
							dropdown.value = currentDateField;
						} else {
							dropdown.value = 'custom';
							// 如果选择的是自定义，确保输入框存在并更新值
							let customInput = dateFieldSetting.settingEl.querySelector('.custom-date-field-input') as HTMLInputElement;
							if (!customInput) {
								customInput = document.createElement('input');
								customInput.type = 'text';
								customInput.placeholder = '输入自定义字段名';
								customInput.style.width = '200px';
								customInput.style.marginLeft = '10px';
								customInput.classList.add('custom-date-field-input');
								dateFieldSetting.settingEl.appendChild(customInput);

								// 监听输入框变化
								const handleCustomInput = async () => {
									const customValue = customInput.value.trim();
									if (customValue) {
										this.plugin.settings.folderDateFields[currentPath] = customValue;
									} else {
										delete this.plugin.settings.folderDateFields[currentPath];
									}
									await this.plugin.saveSettings();

									// 如果视图已打开，自动刷新
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
						// 移除自定义输入框（如果存在）
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

		// 默认模板配置
		new Setting(containerEl)
			.setName('默认模板')
			.setDesc('创建新笔记时使用的模板。支持变量：{{date}}（日期 YYYY-MM-DD）、{{year}}、{{month}}、{{day}}、{{title}}（标题）。留空则使用默认格式。')
			.addTextArea((text) => {
				text.setPlaceholder('例如：---\ndate: {{date}}\ntags: [日记]\n---\n\n# {{title}}\n\n');
				text.setValue(this.plugin.settings.defaultTemplate || '');
				text.inputEl.rows = 6;
				text.inputEl.style.width = '100%';
				text.onChange(async (value) => {
					this.plugin.settings.defaultTemplate = value;
					await this.plugin.saveSettings();
				});
			});

		// 默认文件夹选择（下拉）
		new Setting(containerEl)
			.setName('默认文件夹')
			.setDesc('选择默认的日记文件夹。使用 Ctrl+P 打开手记视图时将自动打开此文件夹的视图。')
			.addDropdown((dropdown) => {
				// 添加"扫描整个 Vault"选项
				dropdown.addOption('', '扫描整个 Vault');

				// 添加所有文件夹选项
				const folders = getAllFolders();
				for (const folder of folders) {
					dropdown.addOption(folder.path, folder.path);
				}

				// 设置当前值
				const currentPath = this.plugin.settings.defaultFolderPath || this.plugin.settings.folderPath || '';
				dropdown.setValue(currentPath);

				dropdown.onChange(async (value) => {
					this.plugin.settings.defaultFolderPath = value || null;
					// 同时更新旧的 folderPath 以保持向后兼容
					this.plugin.settings.folderPath = value;
					await this.plugin.saveSettings();

					// 更新日期字段下拉选择器的选项（从新文件夹中提取字段）
					const dateFieldDropdown = dateFieldSetting.settingEl.querySelector('select') as HTMLSelectElement;
					if (dateFieldDropdown) {
						updateDropdownOptions(dateFieldDropdown, value || null);
					}

					// 更新日期字段设置的显示状态和值
					updateDateFieldVisibility();

					// 如果视图已打开，自动刷新
					if (this.plugin.view) {
						if (value) {
							const folder = this.app.vault.getAbstractFileByPath(value);
							if (folder instanceof TFolder) {
								this.plugin.view.targetFolderPath = folder.path;
							} else {
								this.plugin.view.targetFolderPath = null;
							}
						} else {
							this.plugin.view.targetFolderPath = null;
						}
						await this.plugin.view.refresh();
					}
				});
			});

		// 初始显示状态
		updateDateFieldVisibility();

		// 是否在手记视图文件夹中启用自动布局
		new Setting(containerEl)
			.setName('是否在手记视图文件夹中启用自动布局')
			.setDesc('启用后，仅在默认文件夹中的文件会应用自动图片布局。默认为否。')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableAutoLayout)
					.onChange(async (value) => {
						this.plugin.settings.enableAutoLayout = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName('图片显示限制')
			.setDesc('每个手记卡片最多显示的图片数量')
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 1)
					.setValue(this.plugin.settings.imageLimit)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.imageLimit = value;
						await this.plugin.saveSettings();
						// 刷新视图
						if (this.plugin.view) {
							this.plugin.view.refresh();
						}
					})
			);
	}
}
