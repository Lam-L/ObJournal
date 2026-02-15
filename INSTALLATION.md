# 手记视图插件 - 安装指南

## 用户安装所需文件

如果您是**最终用户**，只需要以下文件即可使用插件：

### 必需文件（4个）

1. **`manifest.json`** - 插件元数据文件
   - 包含插件名称、版本、描述等信息
   - Obsidian 通过此文件识别插件

2. **`main.js`** - 编译后的主程序文件
   - 这是插件的核心代码（已编译）
   - 由 TypeScript 源文件编译生成

3. **`styles.css`** - 样式表文件
   - 包含插件的所有 CSS 样式
   - 控制界面外观和布局

4. **`data.json`** - 数据存储文件（可选，首次运行会自动创建）
   - 存储插件设置和配置
   - 如果不存在，插件会自动创建

### 文件结构

```
obsidian-journal-view/
├── manifest.json    ✅ 必需
├── main.js          ✅ 必需
├── styles.css       ✅ 必需
└── data.json        ⚠️  可选（首次运行会自动创建）
```

## 安装步骤

### 方法 1：手动安装（推荐）

1. **下载插件文件**
   - 下载上述 4 个文件（或整个插件文件夹）

2. **复制到 Obsidian 插件目录**
   - 打开 Obsidian
   - 进入 `设置` → `第三方插件` → `已安装的插件`
   - 点击文件夹图标打开插件目录
   - 将 `obsidian-journal-view` 文件夹复制到此目录

3. **启用插件**
   - 在 Obsidian 设置中，找到 `第三方插件`
   - 找到 `手记视图` 插件
   - 启用插件

### 方法 2：从源码构建（开发者）

如果您是开发者，需要从源码构建：

```bash
# 1. 克隆或下载源码
cd .obsidian/plugins/obsidian-journal-view

# 2. 安装依赖
npm install

# 3. 构建插件
npm run build

# 构建完成后，会生成 main.js 文件
```

## 文件说明

### manifest.json
```json
{
  "id": "obsidian-journal-view",
  "name": "手记视图",
  "version": "0.1.0",
  "minAppVersion": "0.15.0",
  "description": "将 Markdown 文件按日历组织，生成类似手记应用的视图",
  "author": "Your Name"
}
```

### main.js
- 编译后的 JavaScript 代码
- 包含所有插件逻辑
- 由 `main.ts` 和 `JournalView.ts` 编译生成

### styles.css
- 所有 UI 样式定义
- 包括卡片、按钮、布局等样式
- 支持 Obsidian 主题变量

### data.json
- 存储插件设置
- 首次运行会自动创建
- 包含用户配置和文件夹关联信息

## 不需要的文件

以下文件是**开发文件**，用户不需要：

- ❌ `main.ts` - TypeScript 源文件
- ❌ `JournalView.ts` - TypeScript 源文件
- ❌ `utils.ts` - TypeScript 源文件
- ❌ `package.json` - 项目配置
- ❌ `tsconfig.json` - TypeScript 配置
- ❌ `esbuild.config.mjs` - 构建配置
- ❌ `node_modules/` - 依赖包
- ❌ `README.md`, `QUICKSTART.md` 等 - 文档文件

## 验证安装

安装完成后，验证插件是否正常工作：

1. **检查插件是否启用**
   - `设置` → `第三方插件` → 确认 `手记视图` 已启用

2. **打开手记视图**
   - 使用命令面板（`Ctrl+P` / `Cmd+P`）
   - 输入 `打开手记视图`
   - 或通过右键菜单创建文件夹手记视图

3. **检查控制台**
   - 如果遇到问题，打开开发者工具（`Ctrl+Shift+I`）
   - 查看控制台是否有错误信息

## 更新插件

更新插件时，只需要替换以下文件：
- `manifest.json`（如果版本号有变化）
- `main.js`（新版本代码）
- `styles.css`（如果有样式更新）

**注意**：更新后需要重新加载插件或重启 Obsidian。

## 故障排除

如果插件无法正常工作，请检查：

1. **文件完整性**
   - 确认所有必需文件都存在
   - 确认 `main.js` 文件不是空的

2. **文件权限**
   - 确认文件有读取权限
   - 确认 Obsidian 可以访问插件目录

3. **版本兼容性**
   - 确认 Obsidian 版本 >= 0.15.0
   - 检查 `manifest.json` 中的 `minAppVersion`

4. **控制台错误**
   - 打开开发者工具查看错误信息
   - 参考 `TROUBLESHOOTING.md` 文档

## 分发插件

如果您要分发插件给其他用户，建议打包以下文件：

```
obsidian-journal-view/
├── manifest.json
├── main.js
├── styles.css
└── README.md（可选，帮助文档）
```

**不要包含**：
- TypeScript 源文件（.ts）
- node_modules 文件夹
- 构建配置文件
- 开发文档

## 总结

**用户只需要 4 个文件**：
1. ✅ `manifest.json`
2. ✅ `main.js`
3. ✅ `styles.css`
4. ✅ `data.json`（可选，会自动创建）

其他所有文件都是开发文件，用户不需要。
