import { Plugin, PluginSettingTab, Setting, App, TFolder, TFile, Menu, MenuItem, Notice } from 'obsidian';
import { JournalView, JOURNAL_VIEW_TYPE } from './JournalView';

interface JournalPluginSettings {
	folderPath: string;
	imageLimit: number;
	folderJournalViews: Record<string, string>; // 文件夹路径 -> 视图文件路径
}

const DEFAULT_SETTINGS: JournalPluginSettings = {
	folderPath: '',
	imageLimit: 3,
	folderJournalViews: {},
};

export default class JournalPlugin extends Plugin {
	settings: JournalPluginSettings;
	view: JournalView | null = null;

	async onload() {
		await this.loadSettings();

		// 注册视图
		this.registerView(JOURNAL_VIEW_TYPE, (leaf) => {
			const view = new JournalView(leaf, this.app);
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
			console.error('[JournalView] 创建子文件手记视图失败:', error);
			new Notice(`创建失败: ${error.message}`);
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
						// 注意：这里需要在文件打开之前拦截，所以可能需要延迟处理
						setTimeout(async () => {
							await this.openFolderJournalView(folder);
						}, 100);
					}
				}
			}
		}
	}

	private async openFolderJournalView(folder: TFolder): Promise<void> {
		// 创建或获取手记视图，并设置文件夹路径
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

		if (leaf && leaf.view instanceof JournalView) {
			// 设置视图的文件夹路径
			leaf.view.targetFolderPath = folder.path;
			// 刷新视图
			await leaf.view.refresh();
			workspace.revealLeaf(leaf);
		}
	}

	async onunload() {
		// 清理资源
	}

	async activateView() {
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

		if (leaf) {
			workspace.revealLeaf(leaf);
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

		new Setting(containerEl)
			.setName('文件夹路径')
			.setDesc('要扫描的文件夹路径（留空则扫描整个 vault）')
			.addText((text) =>
				text
					.setPlaceholder('例如: 日记/')
					.setValue(this.plugin.settings.folderPath)
					.onChange(async (value) => {
						this.plugin.settings.folderPath = value;
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
