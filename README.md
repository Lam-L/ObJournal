# Obsidian 手记视图插件

一个 Obsidian 插件，将 Markdown 文件按日历组织，生成类似手记应用的视图。

## 功能特性

- ✅ 自动扫描 Markdown 文件并按日期组织
- ✅ 从正文中提取图片（支持 `![[image]]` 和 `![](path)` 格式）
- ✅ 手记卡片式展示
- ✅ 统计信息（连续记录天数、总字数、写手记天数）
- ✅ 按月份分组显示
- ✅ 点击卡片打开原始文件

## 安装

### 手动安装

1. 将插件文件夹复制到 `.obsidian/plugins/obsidian-journal-view/`
2. 在 Obsidian 设置中启用插件

### 开发模式

```bash
cd .obsidian/plugins/obsidian-journal-view
npm install
npm run dev
```

## 使用方法

1. 在命令面板中搜索"打开手记视图"
2. 或者使用快捷键（可在设置中配置）

## 日期识别策略

插件会按以下顺序尝试提取日期：

1. **文件名**：支持格式
   - `2026-01-12.md`
   - `2026年1月12日.md`
   - `2026.01.12.md`

2. **Frontmatter**：支持字段
   - `date`
   - `Date`
   - `created`
   - `created_time`

3. **正文内容**：支持格式
   - `2026年1月12日`
   - `2026-01-12`
   - `2026/01/12`

4. **文件创建时间**：如果以上都找不到，使用文件创建时间

## 图片支持

插件支持两种图片格式：

- **Wikilink**: `![[image.png]]`
- **Markdown**: `![](path/to/image.png)`

图片会从正文中提取，不需要放在 frontmatter 中。

## 设置

- **文件夹路径**：指定要扫描的文件夹（留空则扫描整个 vault）
- **图片显示限制**：每个卡片最多显示的图片数量（1-10）

## 开发

### 项目结构

```
obsidian-journal-view/
├── main.ts           # 插件主入口
├── JournalView.ts    # 手记视图实现
├── utils.ts          # 工具函数
├── styles.css        # 样式文件
├── manifest.json     # 插件清单
└── package.json      # 依赖配置
```

### 构建

```bash
npm run build  # 生产构建
npm run dev    # 开发模式（watch）
```

## 许可证

MIT
