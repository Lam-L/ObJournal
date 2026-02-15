# 调试步骤

如果插件仍然黑屏，请按以下步骤操作：

## 1. 打开开发者工具
- 按 `Ctrl+Shift+I` (Windows) 或 `Cmd+Option+I` (Mac)
- 切换到 Console 标签

## 2. 查看日志
查找以下日志信息：
- `[JournalView] 构造函数调用`
- `[JournalView] onOpen 被调用`
- `[JournalView] contentEl:` 或 `[JournalView] containerEl:`
- `[JournalView] 找到 X 个 Markdown 文件`
- `[JournalView] 成功加载 X 个手记条目`

## 3. 检查错误
查看是否有红色错误信息

## 4. 手动测试
在控制台中运行：

```javascript
// 检查视图
const leaves = app.workspace.getLeavesOfType('journal-view');
console.log('视图数量:', leaves.length);

if (leaves.length > 0) {
  const view = leaves[0].view;
  console.log('视图对象:', view);
  console.log('contentEl:', view.contentEl);
  console.log('containerEl:', view.containerEl);
  
  // 手动设置内容测试
  view.contentEl.innerHTML = '<div style="padding: 20px; background: red; color: white; font-size: 20px;">测试内容 - 如果你看到这个，说明容器是正常的</div>';
}
```

## 5. 如果看到测试内容
说明容器正常，问题可能在数据加载或渲染逻辑

## 6. 如果看不到测试内容
可能是：
- 视图没有正确创建
- 容器选择错误
- CSS 覆盖问题
