# "去年今日"功能调研报告

## 一、功能设计

### 1.1 核心功能定义

**"去年今日"（On This Day）** 功能是指：
- 显示用户在**过去同一天**（或同月同日）创建的手记条目
- 支持查看多年历史（去年、前年、N年前）
- 帮助用户回顾和对比不同年份的同一时期

### 1.2 功能场景

#### 场景1：日常回顾
- 用户打开手记视图，看到"去年今日"卡片
- 显示去年同一天的手记内容
- 点击可查看详情

#### 场景2：多年对比
- 显示"2年前今日"、"3年前今日"等多个时间点
- 用户可以对比不同年份的同一时期

#### 场景3：情感共鸣
- 看到过去的美好回忆
- 对比成长和变化

### 1.3 数据匹配逻辑

#### 匹配规则
1. **精确匹配**（推荐）
   - 匹配同月同日（忽略年份）
   - 例如：2026-01-12 匹配 2025-01-12, 2024-01-12, ...

2. **范围匹配**（可选）
   - 匹配前后N天（如±3天）
   - 适用于用户可能记错日期的情况

3. **时间范围**
   - 默认显示：1年前、2年前、3年前（最多3年）
   - 可配置：用户选择显示多少年的历史

#### 数据筛选
- 只显示有内容的条目（排除空文件）
- 按时间倒序排列（最新的年份在前）
- 限制显示数量（如每个年份最多显示5条）

### 1.4 功能配置

#### 用户可配置项
1. **启用/禁用**：是否显示"去年今日"功能
2. **显示年限**：显示多少年的历史（1-10年）
3. **匹配精度**：精确匹配 vs 范围匹配
4. **显示数量**：每个年份最多显示多少条
5. **自动展开**：是否默认展开所有年份

---

## 二、UI设计

### 2.1 展示位置

#### 方案A：独立区域（推荐）
- 位置：在统计信息下方，手记列表上方
- 优点：独立展示，不干扰主列表
- 缺点：占用垂直空间

#### 方案B：侧边栏
- 位置：右侧固定侧边栏
- 优点：不占用主内容区
- 缺点：移动端体验差

#### 方案C：弹窗/模态框
- 位置：点击按钮后弹出
- 优点：不占用空间
- 缺点：需要额外操作

**推荐：方案A** - 独立区域展示

### 2.2 视觉设计

#### 卡片设计
```
┌─────────────────────────────────────┐
│  📅 去年今日 (2025年1月12日)        │
│  ─────────────────────────────────  │
│  [图片] 标题                        │
│  内容预览...                        │
│  2025年1月12日                      │
└─────────────────────────────────────┘
```

#### 设计要点
1. **时间标签**
   - 显示"X年前今日"
   - 使用不同颜色区分年份（1年前：蓝色，2年前：绿色，3年前：橙色）
   - 图标：日历或时钟图标

2. **卡片样式**
   - 与主列表卡片保持一致的设计语言
   - 添加特殊边框或背景色以示区别
   - 支持点击查看详情

3. **空状态**
   - 如果没有历史记录，显示友好提示
   - "还没有去年的记录，开始记录吧！"

### 2.3 交互设计

#### 展开/折叠
- 默认：折叠状态，只显示标题和数量
- 点击：展开显示所有历史条目
- 动画：平滑的展开/折叠动画

#### 年份分组
```
┌─────────────────────────────────────┐
│  📅 去年今日                        │
│  ─────────────────────────────────  │
│  ▼ 1年前 (2025年1月12日) - 3条     │
│    [卡片1] [卡片2] [卡片3]          │
│  ▼ 2年前 (2024年1月12日) - 2条     │
│    [卡片1] [卡片2]                  │
│  ▼ 3年前 (2023年1月12日) - 1条     │
│    [卡片1]                          │
└─────────────────────────────────────┘
```

#### 响应式设计
- **桌面端**：横向排列，每行2-3个卡片
- **移动端**：纵向排列，每个卡片全宽
- **平板端**：根据屏幕宽度自适应

### 2.4 UI组件设计

#### 组件1：年份标题栏
```typescript
interface YearHeaderProps {
  year: number;        // 年份
  count: number;       // 条目数量
  isExpanded: boolean; // 是否展开
  onToggle: () => void;
}
```

#### 组件2：历史条目卡片
- 复用现有的 `JournalCard` 组件
- 添加年份标签
- 添加"X年前"标识

---

## 三、架构设计

### 3.1 数据查询策略

#### 方案A：实时查询（推荐）
```typescript
// 在 loadEntries 时同时查询历史数据
async loadOnThisDayEntries(): Promise<Map<number, JournalEntry[]>> {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  
  const historyEntries = new Map<number, JournalEntry[]>();
  
  // 查询过去N年的同月同日数据
  for (let yearOffset = 1; yearOffset <= MAX_YEARS; yearOffset++) {
    const targetYear = today.getFullYear() - yearOffset;
    const entries = this.entries.filter(entry => {
      const entryDate = entry.date;
      return entryDate.getMonth() + 1 === currentMonth &&
             entryDate.getDate() === currentDay &&
             entryDate.getFullYear() === targetYear;
    });
    
    if (entries.length > 0) {
      historyEntries.set(yearOffset, entries);
    }
  }
  
  return historyEntries;
}
```

#### 方案B：索引优化
- 创建日期索引：`Map<month-day, JournalEntry[]>`
- 快速查找同月同日的条目
- 需要维护索引的更新

**推荐：方案A** - 简单直接，易于维护

### 3.2 性能优化

#### 优化策略
1. **延迟加载**
   - "去年今日"区域默认折叠
   - 只在展开时加载数据
   - 使用懒加载，按需渲染

2. **缓存机制**
   - 缓存查询结果（当天有效）
   - 文件变化时清除缓存
   - 使用 `Map<date, entries>` 结构

3. **数据预过滤**
   - 在 `loadEntries` 时标记日期
   - 避免重复遍历所有条目

#### 实现示例
```typescript
class OnThisDayManager {
  private cache: Map<string, Map<number, JournalEntry[]>> = new Map();
  private cacheDate: string = '';
  
  getOnThisDayEntries(
    entries: JournalEntry[], 
    maxYears: number = 3
  ): Map<number, JournalEntry[]> {
    const today = new Date().toDateString();
    
    // 检查缓存
    if (this.cacheDate === today && this.cache.has(today)) {
      return this.cache.get(today)!;
    }
    
    // 计算历史条目
    const result = this.calculateOnThisDayEntries(entries, maxYears);
    
    // 更新缓存
    this.cache.set(today, result);
    this.cacheDate = today;
    
    return result;
  }
  
  private calculateOnThisDayEntries(
    entries: JournalEntry[],
    maxYears: number
  ): Map<number, JournalEntry[]> {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
    
    const historyEntries = new Map<number, JournalEntry[]>();
    
    for (let yearOffset = 1; yearOffset <= maxYears; yearOffset++) {
      const targetYear = today.getFullYear() - yearOffset;
      const filtered = entries.filter(entry => {
        const d = entry.date;
        return d.getMonth() + 1 === currentMonth &&
               d.getDate() === currentDay &&
               d.getFullYear() === targetYear;
      });
      
      if (filtered.length > 0) {
        historyEntries.set(yearOffset, filtered);
      }
    }
    
    return historyEntries;
  }
  
  invalidateCache(): void {
    this.cache.clear();
    this.cacheDate = '';
  }
}
```

### 3.3 模块设计

#### 模块结构
```
OnThisDay/
├── OnThisDayManager.ts      # 核心逻辑：数据查询和缓存
├── OnThisDayRenderer.ts     # UI渲染：卡片和布局
└── OnThisDayTypes.ts        # 类型定义
```

#### 类设计
```typescript
// OnThisDayManager.ts
export class OnThisDayManager {
  getOnThisDayEntries(entries: JournalEntry[], maxYears: number): Map<number, JournalEntry[]>;
  invalidateCache(): void;
}

// OnThisDayRenderer.ts
export class OnThisDayRenderer {
  render(container: HTMLElement, historyEntries: Map<number, JournalEntry[]>): void;
  renderYearSection(yearOffset: number, entries: JournalEntry[]): HTMLElement;
}
```

### 3.4 集成点

#### 在 JournalView 中集成
```typescript
// JournalView.ts
private onThisDayManager: OnThisDayManager;
private onThisDayRenderer: OnThisDayRenderer;

async loadEntries(): Promise<void> {
  // ... 现有逻辑
  
  // 加载"去年今日"数据
  const historyEntries = this.onThisDayManager.getOnThisDayEntries(
    this.entries,
    this.settings.maxHistoryYears || 3
  );
  
  this.historyEntries = historyEntries;
}

renderToContainer(container: HTMLElement): void {
  // ... 现有渲染逻辑
  
  // 渲染"去年今日"区域
  if (this.historyEntries.size > 0) {
    const onThisDayContainer = contentWrapper.createDiv('journal-on-this-day');
    this.onThisDayRenderer.render(onThisDayContainer, this.historyEntries);
  }
}
```

### 3.5 数据流

```
用户打开视图
    ↓
loadEntries() - 加载所有条目
    ↓
OnThisDayManager.getOnThisDayEntries() - 筛选历史条目
    ↓
缓存结果（当天有效）
    ↓
OnThisDayRenderer.render() - 渲染UI
    ↓
用户交互（展开/折叠、查看详情）
```

### 3.6 性能考虑

#### 查询复杂度
- **时间复杂度**：O(n * m)
  - n: 总条目数
  - m: 查询的年份数（通常1-3年）
- **空间复杂度**：O(k)
  - k: 历史条目数量（通常很少）

#### 优化建议
1. **索引优化**：使用日期索引加速查询
2. **分页加载**：如果历史条目很多，支持分页
3. **虚拟滚动**：使用虚拟滚动优化渲染性能

---

## 四、实现建议

### 4.1 实施步骤

#### Phase 1: 核心功能
1. 创建 `OnThisDayManager` 类
2. 实现数据查询逻辑
3. 添加缓存机制

#### Phase 2: UI实现
1. 创建 `OnThisDayRenderer` 类
2. 实现年份分组展示
3. 实现展开/折叠交互

#### Phase 3: 集成和优化
1. 集成到 `JournalView`
2. 添加配置选项
3. 性能优化和测试

### 4.2 配置项设计

```typescript
interface OnThisDaySettings {
  enabled: boolean;           // 是否启用
  maxYears: number;           // 最多显示多少年（1-10）
  matchPrecision: 'exact' | 'range'; // 匹配精度
  rangeDays: number;          // 范围匹配的天数（±N天）
  maxEntriesPerYear: number;  // 每年最多显示多少条
  autoExpand: boolean;        // 是否默认展开
}
```

### 4.3 边界情况处理

1. **无历史记录**
   - 显示友好提示
   - 不显示"去年今日"区域

2. **日期边界**
   - 处理闰年2月29日的情况
   - 处理时区问题

3. **大量历史记录**
   - 限制显示数量
   - 支持"查看更多"

---

## 五、参考案例

### 5.1 类似产品

1. **Facebook "On This Day"**
   - 显示过去同一天的照片和动态
   - 支持多年历史
   - 卡片式展示

2. **Apple Photos "Memories"**
   - 自动生成回忆相册
   - 按日期匹配
   - 精美的视觉设计

3. **Day One 日记应用**
   - "On This Day"功能
   - 显示多年历史
   - 支持对比查看

### 5.2 设计灵感

- **时间轴设计**：垂直时间轴展示多年历史
- **卡片流**：类似主列表的卡片展示
- **对比视图**：并排显示不同年份的同一天

---

## 六、技术实现细节

### 6.1 日期匹配算法

#### 精确匹配实现
```typescript
function isSameMonthDay(date1: Date, date2: Date): boolean {
  return date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

function getYearOffset(date1: Date, date2: Date): number {
  return date1.getFullYear() - date2.getFullYear();
}
```

#### 范围匹配实现
```typescript
function isWithinRange(date1: Date, date2: Date, rangeDays: number): boolean {
  const diff = Math.abs((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));
  return diff <= rangeDays && isSameMonthDay(date1, date2);
}
```

### 6.2 数据结构设计

```typescript
interface OnThisDayEntry {
  yearOffset: number;      // 年份偏移（1=去年，2=前年）
  year: number;            // 具体年份
  entries: JournalEntry[]; // 该年份的条目列表
}

interface OnThisDayData {
  today: Date;                           // 今天的日期
  historyEntries: Map<number, JournalEntry[]>; // 按年份偏移分组
  totalCount: number;                    // 总条目数
}
```

### 6.3 UI组件结构

```html
<div class="journal-on-this-day">
  <div class="journal-on-this-day-header">
    <h2>📅 去年今日</h2>
    <button class="journal-toggle-all">展开全部</button>
  </div>
  
  <div class="journal-on-this-day-content">
    <!-- 1年前 -->
    <div class="journal-year-section" data-year-offset="1">
      <div class="journal-year-header">
        <span class="journal-year-label">1年前 (2025年1月12日)</span>
        <span class="journal-year-count">3条</span>
        <button class="journal-year-toggle">▼</button>
      </div>
      <div class="journal-year-entries">
        <!-- 卡片列表 -->
      </div>
    </div>
    
    <!-- 2年前 -->
    <!-- ... -->
  </div>
</div>
```

### 6.4 CSS样式设计

```css
.journal-on-this-day {
  margin: 24px 0;
  padding: 20px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.journal-on-this-day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.journal-year-section {
  margin-bottom: 16px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
}

.journal-year-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: #f5f5f5;
  cursor: pointer;
  user-select: none;
}

.journal-year-entries {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 16px;
}

.journal-year-entries.collapsed {
  display: none;
}
```

### 6.5 性能优化策略

#### 1. 索引构建
```typescript
// 构建日期索引，加速查询
private buildDateIndex(entries: JournalEntry[]): Map<string, JournalEntry[]> {
  const index = new Map<string, JournalEntry[]>();
  
  for (const entry of entries) {
    const date = entry.date;
    const key = `${date.getMonth() + 1}-${date.getDate()}`; // "1-12"
    
    if (!index.has(key)) {
      index.set(key, []);
    }
    index.get(key)!.push(entry);
  }
  
  return index;
}
```

#### 2. 懒加载实现
```typescript
// 只在展开时加载数据
private async loadYearEntries(yearOffset: number): Promise<JournalEntry[]> {
  if (this.yearEntriesCache.has(yearOffset)) {
    return this.yearEntriesCache.get(yearOffset)!;
  }
  
  const entries = await this.queryYearEntries(yearOffset);
  this.yearEntriesCache.set(yearOffset, entries);
  return entries;
}
```

### 6.6 错误处理

```typescript
try {
  const historyEntries = await this.onThisDayManager.getOnThisDayEntries(
    this.entries,
    this.settings.maxHistoryYears
  );
  
  if (historyEntries.size === 0) {
    this.renderEmptyState(container);
    return;
  }
  
  this.onThisDayRenderer.render(container, historyEntries);
} catch (error) {
  logger.error('加载"去年今日"数据失败:', error);
  this.renderErrorState(container, error);
}
```

## 七、总结

### 6.1 核心要点

1. **功能价值**：帮助用户回顾历史，增强情感连接
2. **实现复杂度**：中等，主要是数据查询和UI渲染
3. **性能影响**：较小，通过缓存和延迟加载优化

### 6.2 推荐方案

- **展示位置**：独立区域，在统计信息下方
- **数据查询**：实时查询 + 缓存机制
- **UI设计**：年份分组，可展开/折叠
- **性能优化**：延迟加载 + 缓存 + 索引

### 6.3 下一步

1. 确认功能需求细节
2. 设计UI原型
3. 实现核心逻辑
4. 集成和测试
