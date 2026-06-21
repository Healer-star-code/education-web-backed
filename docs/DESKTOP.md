# EducationalAgent 桌面客户端

> v4 = v3-web 的 Electron 桌面版本。  
> 本仓库目录：`E:\EducationalAgent\v4`  
> 分支：`feat/desktop-p0`  
> 当前版本：`0.1.0`

---

## 1. 一句话定位

把现在跑在浏览器里的 v3-web 教育智能体前端，打包成一个 **Windows 双击即用的 .exe 客户端**：

- 内置本地增强服务（skills 扫描、打开文件夹），**不再依赖 30143 helper**
- 状态栏托盘常驻 + 一键启动/停止 super-king 子进程
- 设置面板里直接管理 super-king.exe 路径 / 端口 / 密码 / 模型环境变量
- 支持「本地 super-king」与「远程服务器」一键切换
- 含 electron-updater 自动更新（用户点检查 → 下载 → 重启安装）

---

## 2. 三个角色的快速上手

### 2.1 终端用户（拿到 .exe 的人）

```text
1. 下载 EducationalAgent-X.Y.Z-setup.exe  （或 -portable.exe 免安装版）
2. 双击安装 / 双击启动
3. 第一次启动会弹出窗口，并自动检测本机 :30142 端口是否已经有 super-king 在跑：
     ● 蓝点「已连接」  → 直接用
     ⚪ 灰点「未启动」  → 点顶栏徽章，或托盘菜单 → 启动 super-king
4. 点右上角齿轮 → 设置 → 填密码 / 模型 API Key 等，保存
5. 开始聊天
```

### 2.2 开发者（继续改代码）

```powershell
# 第一次
cd E:\EducationalAgent\v4
npm install

# 起 dev（自动启 vite + 编译 main/preload + 启 electron 窗口）
npm run dev

# 仅起浏览器版（不要 electron 壳）
npm run dev:web

# 类型检查
npm run typecheck
```

### 2.3 发版者（打包并发布新版本）

```powershell
cd E:\EducationalAgent\v4

# 1) 改版本号
#    package.json -> "version": "0.1.1"

# 2) 重新打包（约 1 分钟）
npm run build:win

# 3) 产物在 release\ ：
#    - EducationalAgent-0.1.1-setup.exe          ← 一键安装包
#    - EducationalAgent-0.1.1-setup.exe.blockmap ← 差分更新元数据
#    - EducationalAgent-0.1.1-portable.exe       ← 免安装版
#    - latest.yml                                ← 自动更新清单

# 4) 把这 3 个文件上传到 electron-builder.yml 里 publish.url 指向的静态目录
#    （示例：https://your-cdn/educational-agent/updates/）
#    用户客户端启动 5 秒后会请求 latest.yml 检测新版本
```

---

## 3. 仓库目录速查

```text
v4/
├── electron/                      ← Electron 主进程 + preload（仅本端，不进 renderer bundle）
│   ├── main/
│   │   ├── index.ts               ← 入口：窗口、托盘、IPC 注册、updater 启动
│   │   ├── superking.ts           ← spawn/stop/restart super-king.exe；端口探测；状态广播
│   │   ├── helper.ts              ← 本地 skills 扫描（替代旧 30143 helper）
│   │   ├── tray.ts                ← 状态栏图标 + 菜单
│   │   ├── store.ts               ← electron-store 持久化设置
│   │   └── updater.ts             ← electron-updater 状态机
│   └── preload/
│       └── index.ts               ← contextBridge 暴露 window.piDesktop
├── electron.vite.config.ts        ← electron-vite 三段配置（main / preload / renderer）
├── electron-builder.yml           ← 打包配置（nsis + portable + linux AppImage）
├── build/                         ← 打包资源（图标等），可放空
├── src/                           ← Renderer（React + Vite，沿用 v3-web）
│   ├── lib/
│   │   ├── desktopBridge.ts       ← window.piDesktop 类型 + 检测 isDesktop
│   │   └── piApi.ts               ← 双模式：Electron → IPC；浏览器 → HTTP
│   └── components/
│       ├── SuperKingBadge.tsx     ← 顶栏后端状态药丸（绿=自启／蓝=外部／红=错／灰=未启）
│       ├── DesktopBackendSection.tsx ← 设置面板「桌面后端」整块
│       └── UpdaterCard.tsx        ← 设置面板「软件更新」整块
├── server/                        ← 旧的 30143 helper（保留：浏览器开发模式仍可用）
└── release/                       ← npm run build:win 产物（不入库）
```

---

## 4. 双模式（Electron / 浏览器）

`src/lib/desktopBridge.ts` 提供 `isDesktop` 布尔：

```ts
import { isDesktop } from './desktopBridge'

if (isDesktop) {
  // window.piDesktop 在 preload 注入
  window.piDesktop.dialog.selectDirectory()
}
```

`src/lib/piApi.ts` 对 4 个本地能力做了双模式：

| 函数 | Electron | 浏览器 |
|---|---|---|
| `selectDirectory()` | `piDesktop.dialog.selectDirectory` | 调后端 `/api/dialog/select-directory`，失败弹 `prompt` |
| `getLocalSkillsRoot()` | `piDesktop.local.getSkillsRoot` | 调 30143 `/api/local/skills/root` |
| `listLocalSkills()` | `piDesktop.local.listSkills` | 调 30143 `/api/local/skills` |
| `openLocalFolder()` | `piDesktop.local.openFolder` | 调 30143 `/api/local/open-folder` |

---

## 5. IPC 全表

主进程 `electron/main/index.ts` 暴露的 IPC：

| 命名 | 作用 | 返回 |
|---|---|---|
| `dialog:selectDirectory` | 弹原生目录选择 | `string \| null` |
| `dialog:selectFile` | 弹原生文件选择 | `string \| null` |
| `shell:openPath` | 用资源管理器打开 | `{ ok, error? }` |
| `shell:openExternal` | 调默认浏览器打开 URL | `{ ok, error? }` |
| `local:health` | 桥健康检查 | `{ ok: true }` |
| `local:getSkillsRoot` | super-king skills 根目录 | `{ path }` |
| `local:listSkills` | 扫描本地 skills | `{ skills[], root }` |
| `local:openFolder` | 打开本地 skills 根（或指定目录） | `{ ok, error? }` |
| `superking:status` | 查 super-king 状态 | `SuperKingStatus` |
| `superking:start` | 启动 super-king.exe | `SuperKingStatus` |
| `superking:stop` | 停止 super-king | `SuperKingStatus` |
| `superking:restart` | 重启 | `SuperKingStatus` |
| `superking:clearError` | 清掉 error 状态 | `SuperKingStatus` |
| `superking:pickExe` | 弹文件选择 super-king.exe | `string \| null` |
| `superking:logs` | 取子进程最近输出 | `{ stdout, stderr }` |
| `superking:status` (event) | 状态变更广播 | `SuperKingStatus` |
| `settings:get` | 读取设置 | `DesktopSettingsShape` |
| `settings:set` | 保存设置 | `DesktopSettingsShape` |
| `updater:state` | 当前更新状态 | `UpdaterState` |
| `updater:check` | 主动检查 | `UpdaterState` |
| `updater:download` | 下载新版本 | `UpdaterState` |
| `updater:install` | 重启并安装 | `{ ok }` |
| `updater:state` (event) | 状态变更广播 | `UpdaterState` |
| `app:openSettings` (event) | 托盘菜单"设置..." → 通知 renderer 开面板 | — |

---

## 6. super-king 状态机

```text
stopped   ⚪  未启动（默认）
starting  🟡  spawn 中
running   🟢  我们自己 spawn 的子进程在跑
external  🔵  非本客户端启动，但 :30142 健康检查能过
error     🔴  spawn 失败 / 异常退出
```

`external` 是为了适配「用户自己在终端跑了 super-king.exe」的情况——客户端不接管它，但显示为蓝色"已连接"，并禁用"停止"按钮。

主进程 `setupTrayCallbacks()` 每 2 秒探测一次 `127.0.0.1:port/api/health`，自动在 stopped/error ↔ external 之间切换。

---

## 7. 持久化设置

`electron-store` 文件位置：

```text
%APPDATA%\EducationalAgent\desktop-settings.json
```

字段 (`DesktopSettingsShape`)：

| 字段 | 含义 |
|---|---|
| `superKingExePath` | super-king.exe 路径 |
| `superKingPort` | 监听端口（默认 30142）|
| `superKingPassword` | 启动时注入 `SUPER_KING_SERVER_PASSWORD` |
| `superKingEnv` | 模型相关环境变量字典（API_KEY/URL/MODEL_ID/PROVIDER_NAME） |
| `autoStartSuperKing` | 客户端启动时自动拉起 |
| `remoteUrl` | 远程后端 URL |
| `useRemote` | 切换到远程模式 |

设置面板「桌面后端」区保存时会同步 `serverUrl`、`password` 到 localStorage，让 v3-web 的 `piApi` 直接拿到。

---

## 8. 自动更新

### 8.1 客户端行为

```text
app.whenReady() + 5s
    └→ autoUpdater.checkForUpdates() （仅 app.isPackaged）
        └→ 发现新版本 → 状态变 'available'
            └→ 用户点 [下载] 才开始下载（autoDownload=false 省流量）
                └→ 状态机：downloading -> downloaded
                    └→ 用户点 [重启并安装] = quitAndInstall(false, true)
```

### 8.2 发布服务器

`electron-builder.yml`：

```yaml
publish:
  - provider: generic
    url: https://example.com/educational-agent/updates
    channel: latest
```

把以下文件上传到该 URL 即可：

```text
EducationalAgent-X.Y.Z-setup.exe
EducationalAgent-X.Y.Z-setup.exe.blockmap   ← 差分更新需要
latest.yml
```

### 8.3 代码签名（暂未启用）

未签名包用户首次打开会有 SmartScreen 警告。如需启用：

1. 买 Windows 代码签名证书（一年约 ¥600）
2. 在 `electron-builder.yml` 里加 `win.signtoolOptions` 或 `signingHashAlgorithms`
3. 把证书 .pfx + 密码注入 CI

---

## 9. 已知坑（已修）

| 坑 | 现象 | 修复 |
|---|---|---|
| Windows GBK 环境下 esbuild 输出中文乱码 | 窗口标题、对话框 title 变 `????` | 所有 `electron/main/*.ts` 和 `preload/index.ts` 加 UTF-8 BOM |
| index.html 内中文 title 经过 Rollup 打包乱码 | 窗口标题显示 "Error" | 改用 HTML 实体 `&#xxxx;` |
| electron-vite 重复注入 `__dirname` shim | main 进程 SyntaxError "已声明" | 源码改用 `import.meta.dirname` |
| ESM main 加载失败弹 "Error" 对话框 | 难以排查 | `--enable-logging` + 看 stderr |
| super-king 子进程没杀干净 | 退出客户端后 super-king.exe 仍在 | `before-quit` + `tree-kill` |

---

## 10. P0–P6 完成度回顾

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | electron-vite 脚手架 + 加载现有 v3-web | ✅ |
| P0+ | 接入 dialog/shell IPC，选择目录走原生 | ✅ |
| P1 | localHelper 合并进 main，piApi 双模式 | ✅ |
| P2 | tray + super-king 子进程 + 状态广播 + 外部探测 | ✅ |
| P3 | 设置面板「桌面后端」整块（本地/远程/env/密码） | ✅ |
| P4 | electron-builder 打 .exe（setup + portable，78MB） | ✅ |
| P5 | electron-updater 接入 + UpdaterCard | ✅ |
| P6 | 本文档 | ✅ |

---

## 11. 维护人速查

```powershell
# 完整刷新（删 out + node_modules + 重装）
Remove-Item -Recurse -Force E:\EducationalAgent\v4\node_modules,E:\EducationalAgent\v4\out
cd E:\EducationalAgent\v4
npm install
npm run build

# 仅看打包包能不能跑
.\release\EducationalAgent-0.1.0-portable.exe

# 杀掉所有客户端进程
Get-Process -Name 'electron','EducationalAgent' -ErrorAction SilentlyContinue | Stop-Process -Force

# super-king 推荐启动
$env:SUPER_KING_SERVER_PASSWORD='123456'
$env:SUPER_KING_API_KEY='sk-...'
$env:SUPER_KING_API_URL='http://124.222.156.158:3000/v1/'
$env:SUPER_KING_MODEL_ID='Qwen3.6-27B'
$env:SUPER_KING_PROVIDER_NAME='custom-local'
Start-Process -FilePath 'E:\super-king\super-king.exe' -ArgumentList 'serve','--port','30142'
```

---

## 12. Remote

```text
gitea   http://124.222.156.158:3004/YuXing/EducationalAgent.git
origin  https://github.com/Healer-star-code/education-web-backed.git

分支: feat/desktop-p0
```
