# 故障排除指南

## 插件黑屏问题

如果插件视图显示为黑屏，请按以下步骤排查：

### 1. 检查控制台错误

1. 按 `Ctrl+Shift+I` (Windows) 或 `Cmd+Option+I` (Mac) 打开开发者工具
2. 切换到 "Console" 标签
3. 查看是否有错误信息
4. 查找以 `[JournalView]` 开头的日志信息

### 2. 重新加载插件

1. 打开 Obsidian 设置
2. 进入"第三方插件"
3. 禁用"手记视图"插件
4. 重新启用插件
5. 或者按 `Ctrl+R` 重新加载 Obsidian

### 3. 检查文件是否有日期信息

插件需要从文件中提取日期。确保文件满足以下条件之一：

- **文件名包含日期**：`2026-01-12.md`、`2026年1月12日.md`、`2026.01.12.md`
- **Frontmatter 包含日期字段**：
  ```yaml
  ---
  date: 2026-01-12
  ---
  ```
- **正文包含日期**：`2026年1月12日`、`2026-01-12`、`2026/01/12`
- **使用文件创建时间**：如果以上都没有，会使用文件创建时间

### 4. 验证插件文件

确保以下文件存在：
- `.obsidian/plugins/obsidian-journal-view/main.js`
- `.obsidian/plugins/obsidian-journal-view/styles.css`
- `.obsidian/plugins/obsidian-journal-view/manifest.json`

### 5. 手动测试

在控制台中运行以下命令来测试：

```javascript
// 检查视图是否存在
const leaves = app.workspace.getLeavesOfType('journal-view');
console.log('找到的视图数量:', leaves.length);

// 如果视图存在，尝试刷新
if (leaves.length > 0) {
  const view = leaves[0].view;
  if (view && view.refresh) {
    view.refresh();
  }
}
```

### 6. 常见问题

#### 问题：视图完全黑屏
**可能原因**：
- 容器选择错误（已修复）
- 样式未加载
- 数据加载失败

**解决方案**：
1. 检查控制台是否有错误
2. 确认 `styles.css` 文件存在
3. 尝试重新构建插件

#### 问题：显示"没有找到手记条目"
**可能原因**：
- 文件没有日期信息
- 日期格式不被识别

**解决方案**：
1. 检查文件名或 frontmatter 中的日期格式
2. 查看控制台日志，看哪些文件被跳过了
3. 尝试在文件名中添加日期，如 `2026-01-12.md`

#### 问题：图片不显示
**可能原因**：
- 图片路径错误
- 图片格式不支持

**解决方案**：
1. 确认使用 `![[image.png]]` 或 `![](path/to/image.png)` 格式
2. 检查图片文件是否存在
3. 确认图片路径相对于文件位置正确

### 7. 重新构建插件

如果问题持续存在，尝试重新构建：

```bash
cd .obsidian/plugins/obsidian-journal-view
npm run build
```

然后在 Obsidian 中重新加载插件。

### 8. 报告问题

如果以上方法都无法解决问题，请提供以下信息：

1. Obsidian 版本
2. 操作系统版本
3. 控制台错误信息（截图或复制）
4. 插件版本（在 manifest.json 中）
5. 问题描述和复现步骤
