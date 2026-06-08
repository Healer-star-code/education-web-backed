# 教育智能体

基于 React + TypeScript + Vite 构建的教育智能助手前端界面。

## 功能特性

- **智能对话**：与 AI 教学助手实时交互，支持 Markdown 渲染和代码高亮
- **会话管理**：多会话切换，保留历史对话记录
- **文件浏览**：树形文件结构展示，模拟项目目录
- **教学主题**：预设数学教学、英语辅导、物理实验、编程入门等场景

## 技术栈

- React 19
- TypeScript
- Vite
- react-markdown（Markdown 渲染）
- react-syntax-highlighter（代码高亮）

## 快速开始

```bash
npm install
npm run dev
```

访问 http://localhost:5173 查看效果。

## 项目结构

```
src/
├── App.tsx                    # 主应用布局
├── index.css                  # 全局样式（深色主题）
├── main.tsx                   # 应用入口
├── mockData.ts                # 模拟数据
└── components/
    ├── Sidebar.tsx            # 侧边栏（会话列表 + 文件树 + Skills）
    ├── ChatArea.tsx           # 聊天区域（欢迎页 + 消息列表）
    ├── ChatInput.tsx          # 输入框
    ├── MessageView.tsx        # 消息渲染
    └── FileExplorer.tsx       # 文件浏览器
```

## 数据说明

当前版本使用模拟数据，包括：
- 会话列表（Python教学、React开发、数学题库等）
- 聊天消息（三角函数教学方案示例）
- 文件树结构

后续将接入实际 API 接口。
