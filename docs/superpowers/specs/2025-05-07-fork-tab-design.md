# Fork Tab (克隆标签)

**Date:** 2025-05-07
**Status:** draft

## 概述

标签页右键菜单增加「Clone tab」选项，在同面板创建一个指向相同目录的新标签，两个标签各自独立导航。

## 行为

- 右键标签 → 菜单新增 **「📋 Clone tab / 克隆标签」**
- 新标签追加到标签栏末尾，**后台创建，不自动激活**（不打断当前浏览）
- 新标签与原标签指向同一路径，但之后各自独立导航
- 即使已有指向同一路径的标签，仍然允许创建（同一目录可开多个标签）
- Fork 出来的标签**不自动 pin**，关闭即销毁

## 不改的

- 不涉及跨面板操作（发送到对侧面板）
- 不改变已有 Pin/Unpin/Close 行为
- Fork 标签不做持久化

## 改动点

### 1. `store.ts` — 新增 `forkTab` 方法

```
forkTab(side, tabId)
  1. 根据 tabId 找到标签，获取其 path
  2. 调用 addTab(side, path) 创建新标签（复用已有逻辑）
```

### 2. `tab-bar.tsx` — 右键菜单增加 Clone 项

- 在 Pin/Unpin 和 Close 之间插入 Clone 菜单项
- 调用 `forkTab` → `persistPinnedTabs`（维持 pin 状态不变）
- 新 tab 创建后不调用 navigateTo（后台创建不切换）

## 涉及文件

| 文件 | 改动 |
|------|------|
| `apps/desktop/src/renderer/plugins/file-explorer/store.ts` | 新增 `forkTab` |
| `apps/desktop/src/renderer/plugins/file-explorer/components/tab-bar.tsx` | 右键菜单 +1 项 |

## 菜单最终效果

```
┌─────────────────────┐
│ C:\Users\Example  │  ← 路径提示
├─────────────────────┤
│ 📌 Pin tab          │
│ 📋 Clone tab        │  ← 新增
│ ✕ Close tab         │
└─────────────────────┘
```
