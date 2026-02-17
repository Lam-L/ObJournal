# 手机版图片容器突然往下跳问题分析

## 问题描述
在手机版插入图片时（如插入3张图片），图片容器组件会突然往下跑，看起来像是被空白换行往下顶。这个问题之前电脑版也出现过，但现在电脑版没有复现。

## 根本原因分析

### 1. **插入位置计算错误 - 使用 `nextSibling` 而非 `nextElementSibling`**

**问题代码**（第 955 行）：
```typescript
const insertBefore = firstImg.nextSibling;
```

**问题分析**：
- `nextSibling` 可能返回**文本节点**（空白字符、换行符等）
- 在 Obsidian 的 Live Preview 模式下，CodeMirror 会在元素之间插入文本节点
- 当使用文本节点作为 `insertBefore` 的参考时，插入位置可能不准确
- 在手机端，DOM 结构可能更复杂，文本节点更多

**影响**：
- 容器被插入到错误的位置
- 导致布局跳动，容器"突然往下跑"

### 2. **图片移动后未清理空的父元素**

**问题分析**：
- 图片通常被包装在 `<p>` 标签或 `internal-embed` 中
- 当图片被移动到 `.diary-gallery` 容器后，原来的父元素可能变成空的
- 空的 `<p>` 标签仍然占据空间，导致布局跳动
- 在手机端，空的元素可能更明显

**当前代码缺失**：
- `wrapImageGroup` 方法中没有清理空父元素的逻辑
- `organizeImagesInContainer` 方法中也没有清理逻辑

### 3. **插入位置选择不够智能**

**问题分析**：
- 代码优先使用 `firstImg.nextSibling` 作为插入位置
- 但如果图片在 `internal-embed` 中，应该考虑 `internal-embed` 的位置
- 在手机端，图片可能被包装在多层容器中，需要找到正确的插入位置

### 4. **手机端 DOM 结构差异**

**可能的原因**：
- 手机端的 CodeMirror 可能使用不同的 DOM 结构
- 文本节点和元素节点的分布可能不同
- 触摸事件可能触发额外的 DOM 更新

## 解决方案

### 方案 1：使用 `nextElementSibling` 替代 `nextSibling`（推荐）

**修改位置**：`wrapImageGroup` 方法，第 955 行

**修改前**：
```typescript
const insertBefore = firstImg.nextSibling;
```

**修改后**：
```typescript
// 优先使用 nextElementSibling，跳过文本节点
let insertBefore: Node | null = firstImg.nextElementSibling;
// 如果没有元素兄弟节点，再尝试 nextSibling
if (!insertBefore) {
    insertBefore = firstImg.nextSibling;
}
```

### 方案 2：找到更合适的插入位置（配合方案 1）

**修改逻辑**：
```typescript
// 找到最合适的插入位置
let insertBefore: Node | null = null;

// 策略1：如果图片在 internal-embed 中，使用 internal-embed 的位置
const internalEmbed = firstImg.closest('.internal-embed');
if (internalEmbed) {
    insertBefore = internalEmbed.nextElementSibling || internalEmbed.nextSibling;
}

// 策略2：如果图片在 <p> 中，使用 <p> 的位置
if (!insertBefore) {
    const paragraph = firstImg.closest('p');
    if (paragraph) {
        insertBefore = paragraph.nextElementSibling || paragraph.nextSibling;
    }
}

// 策略3：使用图片的直接位置
if (!insertBefore) {
    insertBefore = firstImg.nextElementSibling || firstImg.nextSibling;
}
```

### 方案 3：清理空的父元素（重要）

**新增方法**：
```typescript
/**
 * 清理空的父元素
 * 当图片被移动后，如果父元素（如 <p>）变成空的，应该移除它
 */
private cleanupEmptyParents(img: HTMLImageElement): void {
    let current: HTMLElement | null = img.parentElement;
    
    while (current) {
        // 检查是否是应该清理的元素
        const shouldCleanup = 
            current.tagName === 'P' || 
            current.classList.contains('internal-embed') ||
            current.classList.contains('cm-line');
        
        if (shouldCleanup) {
            // 检查是否为空（只有空白文本节点）
            const hasContent = Array.from(current.childNodes).some(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    return true; // 有子元素
                }
                if (node.nodeType === Node.TEXT_NODE) {
                    return (node.textContent || '').trim() !== ''; // 有非空白文本
                }
                return false;
            });
            
            if (!hasContent) {
                // 保存父元素的父元素，用于继续向上清理
                const parent = current.parentElement;
                current.remove();
                current = parent;
                continue;
            }
        }
        
        // 如果当前元素有内容，停止清理
        break;
    }
}
```

**调用位置**：在 `organizeImagesInContainer` 方法中，移动图片后调用

### 方案 4：优化插入逻辑，考虑容器层级

**修改 `wrapImageGroup` 方法**：
```typescript
// 找到最合适的父元素和插入位置
let targetParent: HTMLElement = parent;
let insertPosition: Node | null = null;

// 如果图片在 internal-embed 中，考虑使用更上层的容器
const internalEmbed = firstImg.closest('.internal-embed');
if (internalEmbed && internalEmbed.parentElement) {
    // 检查是否应该在上层容器插入
    const embedParent = internalEmbed.parentElement;
    if (embedParent.classList.contains('cm-content') || 
        embedParent.classList.contains('cm-line')) {
        targetParent = embedParent;
        insertPosition = internalEmbed.nextElementSibling || internalEmbed.nextSibling;
    }
}

// 如果没有找到更好的位置，使用原来的逻辑
if (!insertPosition) {
    insertPosition = firstImg.nextElementSibling || firstImg.nextSibling;
}
```

## 推荐实施顺序

1. **方案 1**（使用 `nextElementSibling`）- 最简单，直接解决问题
2. **方案 3**（清理空父元素）- 防止布局跳动
3. **方案 2**（优化插入位置）- 提升稳定性
4. **方案 4**（考虑容器层级）- 处理复杂情况

## 注意事项

- 清理空元素时要小心，不要删除 CodeMirror 需要的结构
- 在手机端测试时，要注意触摸事件可能触发的额外 DOM 更新
- 考虑添加日志，帮助调试插入位置问题
