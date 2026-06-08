# web 模拟版本1 SDK 接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `v3-web` 中实现“web 模拟版本1”，通过 Pi SDK 接入真实 Agent，保留语音、图片、历史记录、skill 与工具调用能力。

**Architecture:** `v3-web` 保留 Vite/React 前端，新增本地 Node SDK 后端。前端通过 HTTP 与 SSE 调用后端，后端通过 `@earendil-works/pi-coding-agent` SDK 创建和管理 AgentSession，并开放 read/grep/find/ls/bash/edit/write 工具。

**Tech Stack:** React 19, Vite 8, TypeScript 6, Node.js, Pi SDK, Server-Sent Events, Git.

---

## File Structure

- Create: `server/index.ts` — 本地 Node HTTP 服务入口，注册 API 路由和 SSE。
- Create: `server/types.ts` — 前后端共享 API 类型。
- Create: `server/sse.ts` — SSE client 管理和事件广播。
- Create: `server/image.ts` — 图片 payload 校验与 SDK ImageContent 转换。
- Create: `server/piSessionManager.ts` — Pi SDK session 生命周期、prompt、abort、工具事件订阅。
- Create: `src/lib/piApi.ts` — 前端调用本地 SDK 后端。
- Create: `src/lib/image.ts` — 前端图片转换为 base64 payload。
- Create: `src/components/SkillsPanel.tsx` — skill 只读展示。
- Modify: `package.json` — 项目名、server 脚本、依赖。
- Modify: `src/App.tsx` — 产品名、从后端加载 session/cwd，传入 ChatArea。
- Modify: `src/components/Sidebar.tsx` — 显示 `web 模拟版本1`。
- Modify: `src/components/ChatArea.tsx` — 去掉 mock 响应，接 SDK/SSE 流式回复。
- Modify: `src/components/ChatInput.tsx` — 附件保留 File 引用，发送时传给 ChatArea。
- Modify: `src/mockData.ts` — 类型更新，mock 只作为 fallback。

---

## Task 1: Git 初始化与基线提交

**Files:**
- Create: `.git/`

- [ ] **Step 1: 初始化 Git**

Run:

```powershell
git init
git switch -c web-mock-v1
```

- [ ] **Step 2: 基线提交**

Run:

```powershell
git status --short
git add .
git commit -m "chore: 初始化 web 模拟版本1 基线"
```

---

## Task 2: 项目命名

**Files:**
- Modify: `package.json`
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/ChatArea.tsx`

- [ ] **Step 1:** `package.json` 的 `name` 改为 `v3-web`。
- [ ] **Step 2:** 将产品标题位置的 `教育智能体` 改为 `web 模拟版本1`。
- [ ] **Step 3:** 运行 `npx tsc --noEmit`，预期无输出。
- [ ] **Step 4:** 显式 stage 相关文件并提交：`chore: 命名 web 模拟版本1`。

---

## Task 3: 添加 SDK 后端骨架

**Files:**
- Create: `server/types.ts`
- Create: `server/sse.ts`
- Create: `server/image.ts`
- Create: `server/index.ts`
- Modify: `package.json`

- [ ] **Step 1:** 创建 `server/types.ts`，定义 `ApiImagePayload`、`PromptPayload`、`WebSessionInfo`、`WebAgentEvent`。
- [ ] **Step 2:** 创建 `server/sse.ts`，实现 `addSseClient()` 与 `broadcastAgentEvent()`。
- [ ] **Step 3:** 创建 `server/image.ts`，实现 `toSdkImages()`。
- [ ] **Step 4:** 创建 `server/index.ts`，先实现 `/api/health` 和基础路由工具。
- [ ] **Step 5:** `package.json` 增加 `dev:server` 与 `typecheck` 脚本。
- [ ] **Step 6:** 运行类型检查并提交：`feat: 添加 SDK 后端骨架`。

---

## Task 4: 接入 Pi SDK Session Manager

**Files:**
- Create: `server/piSessionManager.ts`
- Modify: `server/index.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1:** 添加本地 Pi SDK file 依赖：`@earendil-works/pi-coding-agent`、`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`、`@earendil-works/pi-tui`。
- [ ] **Step 2:** 运行 `npm install --ignore-scripts`。
- [ ] **Step 3:** 实现 `createWebSession()`、`getWebSession()`、`sendPrompt()`、`abortSession()`、`listSessions()`、`getMessages()`。
- [ ] **Step 4:** 启用默认工具：`read`、`grep`、`find`、`ls`、`bash`、`edit`、`write`。
- [ ] **Step 5:** 在 `server/index.ts` 注册 session、events、prompt、abort、messages API。
- [ ] **Step 6:** 运行类型检查并提交：`feat: 接入 Pi SDK session 管理`。

---

## Task 5: 前端 API Client 与图片转换

**Files:**
- Create: `src/lib/piApi.ts`
- Create: `src/lib/image.ts`

- [ ] **Step 1:** `src/lib/image.ts` 实现 `fileToBase64(file)`。
- [ ] **Step 2:** `src/lib/piApi.ts` 实现 `createSession()`、`listSessions()`、`getMessages()`、`sendPrompt()`、`abortSession()`、`connectSessionEvents()`、`listSkills()`。
- [ ] **Step 3:** 运行类型检查并提交：`feat: 添加前端 Pi API client`。

---

## Task 6: 改造 ChatInput 附件结构

**Files:**
- Modify: `src/components/ChatInput.tsx`
- Modify: `src/mockData.ts`

- [ ] **Step 1:** 新增 `LocalAttachment` 类型，保留 `MessageAttachment` 用于消息展示。
- [ ] **Step 2:** 上传图片时保存原始 `File` 引用。
- [ ] **Step 3:** `ChatInput` 的 `onSend` 改为 `(message, attachments?: LocalAttachment[])`。
- [ ] **Step 4:** 运行类型检查并提交：`feat: 保留发送图片文件数据`。

---

## Task 7: ChatArea 接真实 SDK 流式回复

**Files:**
- Modify: `src/components/ChatArea.tsx`

- [ ] **Step 1:** 移除 mock `generateResponse()` 发送路径。
- [ ] **Step 2:** 发送时创建或复用 SDK session。
- [ ] **Step 3:** 建立 SSE 并处理 `assistant_delta`、`tool_start`、`tool_end`、`agent_end`。
- [ ] **Step 4:** 将图片附件转 base64 后随 prompt 发送。
- [ ] **Step 5:** 运行类型检查并提交：`feat: 聊天接入 Pi SDK 流式回复`。

---

## Task 8: 历史记录与 Sidebar 对接

**Files:**
- Modify: `src/App.tsx`
- Modify: `server/piSessionManager.ts`
- Modify: `server/index.ts`

- [ ] **Step 1:** 后端使用 `SessionManager.list(cwd)` 获取历史记录。
- [ ] **Step 2:** App 启动从后端加载 sessions，API 失败时保留 mock fallback。
- [ ] **Step 3:** 点击 session 后加载真实历史消息。
- [ ] **Step 4:** 运行类型检查并提交：`feat: 接入真实历史记录`。

---

## Task 9: Tool 状态与 Skill 只读展示

**Files:**
- Create: `src/components/SkillsPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/ChatArea.tsx`
- Modify: `server/piSessionManager.ts`
- Modify: `server/index.ts`

- [ ] **Step 1:** ChatArea 显示工具 start/end 状态。
- [ ] **Step 2:** 后端提供 `/api/skills` 只读 skill 列表。
- [ ] **Step 3:** 前端新增 SkillsPanel 展示 name、description、source、enabled。
- [ ] **Step 4:** 运行类型检查并提交：`feat: 展示工具状态和 skill 列表`。

---

## Task 10: 最终验证

- [ ] **Step 1:** 运行 `npx tsc --noEmit`。
- [ ] **Step 2:** 运行 `npm run build`。
- [ ] **Step 3:** 检查 `git status --short` 与最近提交。
- [ ] **Step 4:** 如有剩余修改，显式 stage 并提交：`chore: 完成 web 模拟版本1 SDK 接入`。
