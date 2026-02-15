# Release v0.1.0 - 手记视图插件

## 📦 下载文件

Release 文件位于 `release/` 目录，包含三个必需文件：

1. ✅ `manifest.json` - 插件元数据
2. ✅ `main.js` - 编译后的主程序
3. ✅ `styles.css` - 样式表

## 🚀 功能特性

### 核心功能
- ✅ 将 Markdown 文件按日历组织显示
- ✅ 支持从正文中提取图片（`![[image]]` 和 `![](path)` 格式）
- ✅ 按月份分组显示手记条目
- ✅ 卡片式布局，类似手记应用

### 性能优化
- ✅ 分页加载（每页 20 个条目）
- ✅ 图片懒加载
- ✅ 使用 Obsidian Metadata Cache 优化
- ✅ 增量渲染

### 用户体验
- ✅ 现代化的欢迎界面（应用 UI/UX Pro Max 设计原则）
- ✅ 右键菜单快速创建文件夹手记视图
- ✅ 支持文件夹和子文件两种手记视图模式
- ✅ 在主内容区域显示视图

### UI/UX 优化
- ✅ SVG 图标（非 emoji）
- ✅ 平滑过渡动画（150-300ms）
- ✅ 无障碍支持（焦点状态、aria-label）
- ✅ 响应式设计

## 📥 安装方法

### 方法 1：手动安装（推荐）

1. **下载文件**
   - 从 `release/` 目录下载三个文件：
     - `manifest.json`
     - `main.js`
     - `styles.css`

2. **复制到 Obsidian 插件目录**
   - 打开 Obsidian
   - 进入 `设置` → `第三方插件` → `已安装的插件`
   - 点击文件夹图标打开插件目录
   - 创建新文件夹 `obsidian-journal-view`
   - 将下载的 3 个文件复制到该文件夹

3. **启用插件**
   - 在 Obsidian 设置中，找到 `第三方插件`
   - 找到 `手记视图` 插件
   - 启用插件

### 方法 2：从源码构建

```bash
# 克隆仓库
git clone https://github.com/Lam-L/ObJournal.git
cd ObJournal

# 安装依赖
npm install

# 构建插件
npm run build

# 构建后的文件在根目录：
# - manifest.json
# - main.js
# - styles.css
```

## 📖 使用方法

### 1. 打开手记视图

- 使用命令面板（`Ctrl+P` / `Cmd+P`）
- 输入 `打开手记视图`
- 点击"开始扫描"按钮加载手记条目

### 2. 创建文件夹手记视图

- 右键文件夹 → 选择"手记" → "创建文件夹手记视图"
- 之后点击该文件夹会自动打开手记视图

### 3. 创建子文件手记视图

- 右键文件夹 → 选择"手记" → "创建子文件手记视图"
- 会在文件夹下创建一个手记视图文件
- 点击该文件会自动打开手记视图

## 🔧 系统要求

- **Obsidian 版本**: >= 0.15.0
- **平台**: 桌面端和移动端都支持

## 📝 更新日志

### v0.1.0 (2026-02-15)

#### 🎉 初始版本发布

**新增功能：**
- ✨ 基础手记视图功能
- ✨ 图片提取和显示
- ✨ 右键菜单集成
- ✨ 性能优化
- ✨ UI/UX 优化

**技术细节：**
- TypeScript 4.7.4
- esbuild 0.17.3
- 使用 Obsidian Metadata Cache 优化性能

## 🐛 已知问题

- 首次加载大量文件时可能需要几秒钟
- 图片路径解析依赖 Obsidian 的 metadata cache

## 📚 文档

- [快速开始指南](QUICKSTART.md)
- [安装说明](INSTALLATION.md)
- [性能分析](PERFORMANCE_ANALYSIS.md)
- [故障排除](TROUBLESHOOTING.md)

## 🔗 相关链接

- GitHub 仓库: https://github.com/Lam-L/ObJournal
- 问题反馈: https://github.com/Lam-L/ObJournal/issues

## 📄 许可证

MIT License

---

**注意**: 首次运行插件时，`data.json` 文件会自动创建，用于存储插件设置。
