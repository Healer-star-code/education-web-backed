# 超级小金（桌面客户端 v4）

基于 React + TypeScript + Vite + Electron 构建的超级小金桌面客户端。

> **本仓库是 v4 桌面客户端**。Web 版（v3-web）见 `E:\EducationalAgent\v3-web`。  
> 完整设计、IPC 表、发版流程见 [`docs/DESKTOP.md`](./docs/DESKTOP.md)。

## 功能特性

- **智能对话**：与 AI 教学助手实时交互，支持 Markdown 渲染和代码高亮
- **会话管理**：多会话切换，保留历史对话记录
- **桌面集成**：状态栏托盘、原生目录选择、一键启停 super-king 后端
- **本地/远程**双模式：客户端可启本地 super-king.exe，也可连远程服务器
- **自动更新**：electron-updater 接入，发现新版本可一键下载+重启安装

## 技术栈

- React 19 + TypeScript + Vite 8
- Electron 33 + electron-vite + electron-builder
- electron-store（持久化设置）
- electron-updater（自动更新）
- tree-kill（彻底干掉 super-king 子进程）

## 快速开始

```bash
npm install
npm run dev
```

Electron 桌面客户端会自动弹出窗口（Vite dev server 同时启）。

如只想看浏览器版本：

```bash
npm run dev:web   # 仅起 Vite，访问 http://localhost:5173
```

## 打包

```bash
# 完整 build（main + preload + renderer）
npm run build

# 打 Windows .exe（含 nsis installer + portable）
npm run build:win
# 产物在 release/

# 打 Linux AppImage
npm run build:linux
```

更详细的安装、配置、发版、自动更新流程见 [`docs/DESKTOP.md`](./docs/DESKTOP.md)。

## 项目结构（v4 桌面版）

```
electron/
├── main/
│   ├── index.ts          # 主进程入口
│   ├── superking.ts      # super-king 子进程管理
│   ├── helper.ts         # 本地 skills 扫描（替代旧 30143 helper）
│   ├── tray.ts           # 系统托盘
│   ├── store.ts          # electron-store 持久化设置
│   └── updater.ts        # electron-updater 状态机
└── preload/
    └── index.ts          # contextBridge → window.piDesktop

src/                      # Renderer，沿用 v3-web
├── App.tsx
├── lib/
│   ├── desktopBridge.ts  # window.piDesktop 类型 + isDesktop 检测
│   └── piApi.ts          # 双模式：Electron 走 IPC，浏览器走 HTTP
└── components/
    ├── SuperKingBadge.tsx        # 顶栏后端状态药丸
    ├── DesktopBackendSection.tsx # 设置面板「桌面后端」整块
    ├── UpdaterCard.tsx           # 设置面板「软件更新」整块
    ├── Sidebar.tsx
    ├── ChatArea.tsx
    └── ...
```

## 数据说明

`mockData.ts` 内置一些演示数据，真实数据来自 super-king 后端（默认 `127.0.0.1:30142`）。
