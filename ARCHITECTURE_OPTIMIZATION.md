# 代码架构优化方案

## 当前问题分析

### 1. 代码组织和模块化问题
- **JournalView.ts 文件过大**（1138行）：包含过多职责
  - DOM 创建逻辑
  - 图片布局逻辑
  - 数据加载逻辑
  - 统计计算逻辑
  - 渲染逻辑

- **建议**：拆分为多个模块
  - `ImageLayoutBuilder.ts` - 图片布局构建器
  - `JournalCardBuilder.ts` - 卡片构建器
  - `StatisticsCalculator.ts` - 统计计算器
  - `DOMHelpers.ts` - DOM 辅助函数

### 2. 重复代码
- **main.ts**：
  - `activateView()` 和 `openFolderJournalView()` 有重复的创建 leaf 逻辑
  - 可以提取为 `createOrGetJournalViewLeaf()` 方法

- **JournalView.ts**：
  - 图片创建逻辑有重复
  - 可以进一步优化图片布局构建器

### 3. 类型安全问题
- `@ts-ignore` 注释（2处）：
  - `main.ts:36` - `app` 属性
  - `main.ts:86` - `setSubmenu()` 方法
- `handleFileOpen` 中使用 `setTimeout`，不是最佳实践
- 一些 `any` 类型应该更具体

### 4. 调试代码过多
- 大量 `console.log`（30+ 处）
- 应该：
  - 移除生产环境的调试日志
  - 或使用日志系统（可配置日志级别）

### 5. 魔法数字
- 硬编码的数字应该提取为常量：
  - `itemsPerPage: 20`
  - `batchSize: 10`
  - `maxPreviewLength: 200`
  - `imageLimit: 5`
  - `rootMargin: '50px'`
  - `setTimeout` 延迟时间

### 6. 错误处理
- 缺少统一的错误处理机制
- 一些异步操作没有 try-catch
- 错误信息不够友好

### 7. 性能优化机会
- `createLazyImage` 中的 `IntersectionObserver` 可以复用
- 可以添加防抖/节流机制
- 可以缓存一些计算结果

## 优化优先级

### 高优先级（立即实施）
1. ✅ **提取常量** - 提高可维护性
2. ✅ **消除重复代码** - 减少维护成本
3. ✅ **移除调试日志** - 清理代码

### 中优先级（后续优化）
4. **模块化拆分** - 提高代码可读性
5. **类型安全改进** - 提高代码质量
6. **统一错误处理** - 提高健壮性

### 低优先级（可选）
7. **性能微优化** - 边际收益较小

## 实施计划

### Phase 1: 快速优化（当前）
- [x] 提取常量到 `constants.ts`
- [x] 消除 `main.ts` 中的重复代码
- [x] 移除或条件化调试日志

### Phase 2: 模块化重构（后续）
- [ ] 创建 `ImageLayoutBuilder.ts`
- [ ] 创建 `JournalCardBuilder.ts`
- [ ] 创建 `StatisticsCalculator.ts`

### Phase 3: 类型和错误处理（后续）
- [ ] 修复类型问题
- [ ] 统一错误处理机制
