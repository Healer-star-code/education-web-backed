# v3-web 后端 API 文档

> 本文档由 `server/index.ts`、`server/types.ts`、`server/sse.ts`、`src/lib/piApi.ts` 推导整理。
> 描述 v3-web 后端为前端提供的全部 HTTP / SSE 接口，仅包含**当前实装**的接口。

---

## 一、概览

### Base URL

| 场景       | 值                                          |
| ---------- | ------------------------------------------- |
| 默认       | `http://localhost:30142`                    |
| 服务端配置 | 环境变量 `V3_WEB_SERVER_PORT`（默认 30142） |
| 前端配置   | 环境变量 `VITE_PI_API_BASE`                 |

### 协议

- **HTTP/JSON**：所有请求/响应均为 UTF-8 编码 JSON（除文件下载和 SSE 外）。
- **SSE（Server-Sent Events）**：实时事件流通过 `text/event-stream` 推送。

### CORS

服务器对所有 JSON 接口返回：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Methods: GET,POST,OPTIONS
```

预检请求 `OPTIONS` 始终返回 `204 No Content`。

### 错误格式

所有错误响应均为：

```json
{ "error": "错误描述字符串" }
```

常见状态码：

| 状态码 | 含义                                   |
| ------ | -------------------------------------- |
| 400    | 请求参数缺失或非法（如系统目录被拒绝） |
| 404    | 资源不存在（如 artifact 不存在）       |
| 500    | 服务端异常                             |

### 路径安全

后端会拒绝把系统安装目录（如 `C:\Windows`、`C:\Program Files` 等）作为项目目录。
触发该校验的接口在被拒绝时返回 `400 { "error": "不能选择系统安装目录作为项目目录" }`。

---

## 二、数据结构（TypeScript）

### `WebSessionInfo` — 会话信息

```ts
interface WebSessionInfo {
  id: string                    // 会话运行时 UUID
  cwd: string                   // 工作目录（项目路径）
  sessionFile?: string          // 持久化文件路径（.jsonl）
  created: string               // ISO 时间戳
  modified: string              // ISO 时间戳
  firstMessage: string          // 首条消息预览，用于无标题时显示
  messageCount: number          // 消息数
  name?: string                 // 显示名称（AI 自动生成或用户重命名）
  titleSource?: 'ai' | 'user'   // 标题来源
  aiTitleGenerated?: boolean    // AI 是否已生成过标题
  parentSessionId?: string      // 派生会话的父 ID
}
```

### `WebMessage` — 历史消息

```ts
interface WebMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  thinkingContent?: string      // 思考链文本（可选）
  thinkingDurationMs?: number   // 思考时长（毫秒）
  toolCalls?: WebToolCall[]     // 工具调用列表
  artifacts?: ArtifactInfo[]    // 关联 artifact（仅最后一条 assistant）
}

interface WebToolCall {
  id: string
  name: string
  status: 'running' | 'done' | 'error'
  args?: unknown
  result?: unknown
}
```

### `ArtifactInfo` — 产物文件

```ts
interface ArtifactInfo {
  id: string
  sessionId: string
  name: string
  path: string                  // 服务端绝对路径
  mimeType: string
  size: number                  // 字节
  kind: 'word' | 'presentation' | 'spreadsheet' | 'pdf' | 'image' | 'text' | 'file'
  timeCreated: number           // Unix ms
}
```

### `SkillInfo` / `CreateSkillPayload` — 技能

```ts
interface SkillInfo {
  name: string
  description: string
  source: string                // 来源标识（global / project / 内置等）
  enabled: boolean
}

interface CreateSkillPayload {
  cwd?: string
  name: string
  description: string
  content: string
}
```

### `ToolInfo` — 工具开关

```ts
interface ToolInfo {
  name: string
  description: string
  active: boolean               // 是否在该会话中启用
}
```

### `RecentPathInfo` — 最近使用项目路径

```ts
interface RecentPathInfo {
  path: string
  name: string
  timeCreated: number           // Unix ms
  timeUpdated: number           // Unix ms
}
```

### `ApiImagePayload` / `PromptPayload` — 发送消息

```ts
interface ApiImagePayload {
  name: string
  mimeType: string
  data: string                  // base64 编码（不含 data: 前缀）
}

interface PromptPayload {
  message: string
  images?: ApiImagePayload[]
}
```

### `WebAgentEvent` — SSE 事件类型（13 种）

```ts
type WebAgentEvent =
  | { type: 'connected'; sessionId: string }
  | { type: 'agent_start' }
  | { type: 'thinking_start' }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'thinking_end'; content: string }
  | { type: 'assistant_delta'; delta: string }
  | { type: 'assistant_message_end' }
  | { type: 'tool_start'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool_update'; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: 'tool_end'; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: 'session_renamed'; sessionId: string; name: string; titleSource: 'ai' | 'user'; aiTitleGenerated: boolean }
  | { type: 'artifact_created'; artifact: ArtifactInfo }
  | { type: 'agent_end' }
  | { type: 'error'; message: string }
```

---

## 三、接口列表

### 3.1 健康检查

#### `GET /api/health`

健康探测，前端无业务调用，可用于运维。

**响应 200**

```json
{ "ok": true, "service": "v3-web-sdk-server" }
```

---

### 3.2 目录与最近路径

#### `POST /api/dialog/select-directory` — 弹出 Windows 目录选择对话框

调用 PowerShell `FolderBrowserDialog`，默认起始路径为 `C:\Users\<用户>`。

**请求体**：`{}`

**响应 200**

```json
{ "path": "C:\\Users\\xxx\\my-project" }
```

或用户取消时：

```json
{ "path": null }
```

**错误 400** — 选中系统安装目录时拒绝：

```json
{ "error": "不能选择系统安装目录作为项目目录" }
```

**前端调用**：`selectDirectory()`

---

#### `GET /api/recent-paths` — 获取最近使用的项目路径

后端会自动剥离已变成系统目录的条目。

**响应 200**

```json
{
  "paths": [
    { "path": "C:\\Users\\xxx\\proj1", "name": "proj1", "timeCreated": 1718000000000, "timeUpdated": 1718001000000 }
  ]
}
```

**前端调用**：`listRecentPaths()`

---

#### `POST /api/recent-paths` — 添加 / 移除最近路径

**请求体**

```ts
{
  path: string,
  action?: 'add' | 'remove'   // 默认 add
}
```

**响应 200**：返回更新后的 `paths` 数组（结构同上）。

**错误 400**：未提供 `path`。

**前端调用**：

- `addRecentPath(path)`
- `removeRecentPath(path)`

---

#### `POST /api/open-folder` — 用资源管理器打开目录

服务端调用 `explorer.exe <path>`。

**请求体**

```json
{ "path": "C:\\Users\\xxx\\proj1" }
```

**响应 200**：`{ "ok": true }`

**错误**

| 状态码 | 含义                    |
| ------ | ----------------------- |
| 400    | `path` 缺失或为系统目录 |
| 500    | 调用 explorer 失败      |

**前端调用**：`openFolder(path)`

---

### 3.3 会话管理

#### `POST /api/sessions` — 创建或打开会话

支持两种模式：

- `new_isolated`：在指定 `cwd` 下创建一个新会话。
- `open_existing`：打开已存在的 `.jsonl` 会话文件。

**请求体（新建）**

```json
{ "mode": "new_isolated", "cwd": "C:\\Users\\xxx\\proj1" }
```

**请求体（打开已有）**

```json
{ "mode": "open_existing", "sessionFile": "C:\\Users\\xxx\\.pi\\agent\\sessions\\xxxx.jsonl" }
```

> 若省略 `mode`：当 `sessionFile` 存在时按 `open_existing` 处理，否则按 `new_isolated`。

**响应 200**

```json
{ "session": { "id": "...", "cwd": "...", "sessionFile": "...", "created": "...", "modified": "...", "firstMessage": "", "messageCount": 0 } }
```

字段定义见 `WebSessionInfo`。

**错误**

| 状态码 | 含义                                                              |
| ------ | ----------------------------------------------------------------- |
| 400    | `cwd` 缺失或为系统目录；`open_existing` 模式下 `sessionFile` 缺失 |

**前端调用**：`createSession(cwd?, sessionFile?)`

---

#### `GET /api/sessions?cwd=<可选>` — 列出会话

不传 `cwd` 返回全部最近会话；传 `cwd` 仅返回该项目下的会话。

**响应 200**

```json
{ "sessions": [ /* WebSessionInfo[] */ ] }
```

**前端调用**：`listSessions(cwd?)`

---

#### `GET /api/sessions/:sessionId/messages` — 获取会话历史消息

返回当前会话已持久化的消息列表，用于刷新后恢复 UI。
最后一条 assistant 消息会附加 `artifacts`（产物文件清单）。

**响应 200**

```json
{ "messages": [ /* WebMessage[] */ ] }
```

**前端调用**：`getMessages(sessionId)`

---

#### `POST /api/sessions/:sessionId/prompt` — 发送一条消息（异步）

接收消息后立即返回 `{ ok: true }`，模型实际输出通过 SSE（见 3.4）流式推送。

> 该接口**无业务超时**。前端 `sendPrompt` 显式禁用了 fetch 超时（`timeoutMs: null`），因为模型生成可能持续数十秒至数分钟。

**请求体**

```ts
PromptPayload  // { message, images? }
```

示例：

```json
{
  "message": "帮我写一份课程设计方案",
  "images": [
    { "name": "ref.png", "mimeType": "image/png", "data": "iVBORw0KGgo..." }
  ]
}
```

**响应 200**

```json
{ "ok": true }
```

**前端调用**：`sendPrompt(sessionId, payload)`

**典型时序**

```
client → POST /prompt                  (HTTP 200 立即返回)
       ← SSE: agent_start
       ← SSE: thinking_start / thinking_delta* / thinking_end
       ← SSE: tool_start → tool_update* → tool_end   (可重复多次)
       ← SSE: assistant_delta* / assistant_message_end
       ← SSE: artifact_created                       (若生成了产物)
       ← SSE: session_renamed                        (首轮 AI 自动起标题)
       ← SSE: agent_end
```

---

#### `POST /api/sessions/:sessionId/abort` — 中止当前生成

立即停止该会话正在进行的 AI 生成。

**请求体**：`{}`

**响应 200**：`{ "ok": true }`

**前端调用**：`abortSession(sessionId)`

---

#### `POST /api/sessions/:sessionId/name` — 重命名会话

**请求体**

```json
{ "name": "我的课程方案" }
```

**响应 200**

```json
{ "session": { /* WebSessionInfo, titleSource = 'user' */ } }
```

**错误 400**：`name` 为空。

**前端调用**：`renameSession(sessionId, name)`

---

#### `POST /api/sessions/delete` — 删除会话

通过 `sessionFile` 路径删除（运行时 `id` 不再有效，因此用文件路径）。
后端会同时清理对应的 `${sessionFile}.artifacts.json` sidecar。

**请求体**

```json
{ "sessionFile": "C:\\Users\\xxx\\.pi\\agent\\sessions\\xxxx.jsonl" }
```

**响应 200**：`{ "ok": true }`

**错误 400**：`sessionFile` 缺失。

**前端调用**：`deleteSession(sessionFile)`

---
### 3.4 实时事件流（SSE）

#### `GET /api/sessions/:sessionId/events` — 订阅会话事件流

**响应头**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
Access-Control-Allow-Origin: *
```

**首帧**：连接建立后立即推送

```
data: {"type":"connected","sessionId":"<id>"}

```

**心跳**：每 30 秒一个 SSE 注释行（`:\n\n`），用于保持连接。
**消息格式**：每条事件都是一行 `data: <JSON>\n\n`，JSON 即 `WebAgentEvent`。

#### 事件总览（按生命周期顺序）

| 事件类型                | 触发时机                             | 关键字段                                                |
| ----------------------- | ------------------------------------ | ------------------------------------------------------- |
| `connected`             | SSE 连接建立                         | `sessionId`                                             |
| `agent_start`           | 一次 agent run 开始                  | —                                                       |
| `thinking_start`        | 模型进入思考阶段                     | —                                                       |
| `thinking_delta`        | 思考链增量                           | `delta`                                                 |
| `thinking_end`          | 思考结束                             | `content`（完整思考）                                   |
| `tool_start`            | 工具调用开始                         | `toolCallId` `toolName` `args`                          |
| `tool_update`           | 工具调用过程中流式输出（部分结果）   | `toolCallId` `toolName` `partialResult`                 |
| `tool_end`              | 工具调用结束                         | `toolCallId` `toolName` `result` `isError`              |
| `assistant_delta`       | 模型主回复增量                       | `delta`                                                 |
| `assistant_message_end` | 主回复完整结束                       | —                                                       |
| `artifact_created`      | 服务端检测到新生成的产物文件         | `artifact: ArtifactInfo`                                |
| `session_renamed`       | 首轮 AI 起标题或用户重命名           | `sessionId` `name` `titleSource` `aiTitleGenerated`     |
| `agent_end`             | 一次 agent run 结束                  | —                                                       |
| `error`                 | 异常                                 | `message`                                               |

> `tool_*` 与 `thinking_*` 可在一次 run 中多次出现并交错。
> 单条 user 消息可能触发多轮 `agent_start ... agent_end`（多步推理）。

**前端调用**：`connectSessionEvents(sessionId, onEvent)`，返回 `EventSource`。

---

### 3.5 Skills（技能）

#### `GET /api/skills?cwd=<可选>` — 列出技能

合并返回项目级（`<cwd>/.skills/`）+ 全局技能。

**响应 200**

```json
{ "skills": [ /* SkillInfo[] */ ] }
```

**前端调用**：`listSkills(cwd?)`

---

#### `GET /api/skills/installed` — 仅列出全局已安装技能

**响应 200**

```json
{
  "skills": [ /* SkillInfo[] */ ],
  "root": "C:\\Users\\xxx\\.pi\\agent\\skills"
}
```

**前端调用**：`listInstalledSkills()`

---

#### `GET /api/skills/root` — 获取全局技能根目录

调用前会自动确保 Office 内置技能已安装。

**响应 200**

```json
{ "path": "C:\\Users\\xxx\\.pi\\agent\\skills" }
```

**前端调用**：`getSkillsRoot()`

---

#### `POST /api/skills` — 创建一个全局技能

**请求体**

```ts
{
  cwd?: string,
  name: string,         // 唯一标识
  description: string,  // 简短描述
  content: string       // 技能 markdown 内容
}
```

**响应 200**

```json
{ "skill": { /* SkillInfo */ } }
```

**前端调用**：`createSkill(payload)`

---

#### `POST /api/skills/delete` — 删除全局技能

**请求体**

```json
{ "name": "my-skill" }
```

**响应 200**：`{ "ok": true }`

**错误 400**：`name` 缺失。

**前端调用**：`deleteSkill(name)`

---

#### `POST /api/skills/reinstall-office` — 强制重新安装内置 Office 技能

用于修复或更新内置 docx/pptx/xlsx 技能。

**请求体**：`{}`

**响应 200**

```json
{
  "skills": [ /* SkillInfo[] */ ],
  "root": "C:\\Users\\xxx\\.pi\\agent\\skills"
}
```

**前端调用**：`reinstallOfficeSkills()`

---

### 3.6 Tools（工具开关）

每个会话可独立配置启用哪些工具（如 read / grep / find / ls / bash / edit / write / 等）。

#### `GET /api/tools/:sessionId` — 列出当前会话的工具及启用状态

**响应 200**

```json
{ "tools": [ /* ToolInfo[] */ ] }
```

**前端调用**：`listTools(sessionId)`

---

#### `POST /api/tools/:sessionId` — 设置当前会话启用的工具

**请求体**

```json
{ "toolNames": ["read", "grep", "bash"] }
```

未列出的工具会被禁用。

**响应 200**：`{ "ok": true }`

**前端调用**：`setTools(sessionId, toolNames)`

---

### 3.7 Artifacts（产物文件）

AI 在会话中生成的文件（docx/pptx/xlsx/pdf/image/text 等）。
持久化方式：每个会话对应 sidecar JSON 文件 `${sessionFile}.artifacts.json`。

#### `GET /api/artifacts/:sessionId` — 列出该会话的所有产物

**响应 200**

```json
{ "artifacts": [ /* ArtifactInfo[] */ ] }
```

> 实际前端通常不直接调用此接口，而是通过 `getMessages` 拿到 `artifacts` 字段或通过 SSE `artifact_created` 接收新增。

---

#### `GET /api/artifacts/:sessionId/:artifactId/download` — 下载产物文件

返回二进制流，浏览器会触发下载。

**响应头**

```
Content-Type: <artifact.mimeType>
Content-Disposition: attachment; filename*=UTF-8''<URL 编码的文件名>
Access-Control-Allow-Origin: *
```

**响应体**：文件原始字节流。

**错误 404**：

```json
{ "error": "artifact not found" }
```

**前端拼接 URL**：`artifactDownloadUrl(artifact)`，返回完整 URL，可直接 `<a href="...">` 或 `window.open()`。

---
## 四、附录

### A. 端到端时序（一次完整对话）

```
[1] GET  /api/recent-paths                      -> { paths }
[2] POST /api/dialog/select-directory           -> { path }
[3] POST /api/sessions { mode, cwd }            -> { session }
[4] GET  /api/sessions/:id/events  (SSE 长连接) -> connected
[5] POST /api/sessions/:id/prompt { message }   -> { ok: true }

[6] SSE 推送序列：
        agent_start
        thinking_start
        thinking_delta (× N)
        thinking_end
        tool_start            \
        tool_update (× N)      | 可重复多次
        tool_end              /
        assistant_delta (× N)
        assistant_message_end
        artifact_created      (若生成产物)
        session_renamed       (首轮 AI 自动起标题)
        agent_end

[7] GET /api/artifacts/:id/:aid/download        -> 二进制流（下载）
```

### B. `sessionId` vs `sessionFile`

| 字段          | 用途                                          | 出现接口                                                                        |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| `sessionId`   | 运行时 UUID，所有路由 `:sessionId` 占位符     | `/prompt` `/abort` `/messages` `/events` `/name` `/tools/:id` `/artifacts/:id`  |
| `sessionFile` | 磁盘 JSONL 文件绝对路径                       | `POST /api/sessions {mode:'open_existing'}`、`POST /api/sessions/delete`        |

> 删除会话只能用 `sessionFile`（运行时 id 已失效）。
> 打开历史会话用 `sessionFile`，得到新的 `sessionId` 后用于后续对话。

### C. 路径安全规则

- `assertUserProjectPath(cwd)`：拒绝系统盘安装目录、`C:\Windows`、`C:\Program Files` 等。
- `isSystemProjectPath(path)`：用于过滤最近路径列表，自动剔除已变成系统目录的旧条目。
- 拒绝时 HTTP `400 { "error": "..." }`。

### D. 环境变量

| 变量                 | 作用范围 | 默认值                     | 说明                    |
| -------------------- | -------- | -------------------------- | ----------------------- |
| `V3_WEB_SERVER_PORT` | 服务端   | `30142`                    | HTTP 监听端口           |
| `VITE_PI_API_BASE`   | 前端构建 | `http://localhost:30142`   | 前端访问的后端 base URL |
| `PI_PROVIDER`        | 服务端   | `deepseek`                 | 默认模型 provider       |
| `PI_MODEL`           | 服务端   | `deepseek-v4-pro`          | 默认模型 ID             |

### E. 文件位置

- 会话主文件：`C:\Users\<用户>\.pi\agent\sessions\*.jsonl`
- 产物 sidecar：`<sessionFile>.artifacts.json`
- 全局技能：`C:\Users\<用户>\.pi\agent\skills\<skill-name>\SKILL.md`

### F. 前端封装函数对照表

| 前端函数（`src/lib/piApi.ts`）              | 接口                                                  |
| ------------------------------------------- | ----------------------------------------------------- |
| `selectDirectory()`                         | `POST /api/dialog/select-directory`                   |
| `listRecentPaths()`                         | `GET  /api/recent-paths`                              |
| `addRecentPath(path)` / `removeRecentPath`  | `POST /api/recent-paths`                              |
| `openFolder(path)`                          | `POST /api/open-folder`                               |
| `createSession(cwd?, sessionFile?)`         | `POST /api/sessions`                                  |
| `listSessions(cwd?)`                        | `GET  /api/sessions`                                  |
| `getMessages(sessionId)`                    | `GET  /api/sessions/:id/messages`                     |
| `sendPrompt(sessionId, payload)`            | `POST /api/sessions/:id/prompt`                       |
| `abortSession(sessionId)`                   | `POST /api/sessions/:id/abort`                        |
| `renameSession(sessionId, name)`            | `POST /api/sessions/:id/name`                         |
| `deleteSession(sessionFile)`                | `POST /api/sessions/delete`                           |
| `connectSessionEvents(sessionId, onEvent)`  | `GET  /api/sessions/:id/events`  (EventSource)        |
| `listSkills(cwd?)`                          | `GET  /api/skills`                                    |
| `listInstalledSkills()`                     | `GET  /api/skills/installed`                          |
| `getSkillsRoot()`                           | `GET  /api/skills/root`                               |
| `createSkill(payload)`                      | `POST /api/skills`                                    |
| `deleteSkill(name)`                         | `POST /api/skills/delete`                             |
| `reinstallOfficeSkills()`                   | `POST /api/skills/reinstall-office`                   |
| `listTools(sessionId)`                      | `GET  /api/tools/:id`                                 |
| `setTools(sessionId, toolNames)`            | `POST /api/tools/:id`                                 |
| `artifactDownloadUrl(artifact)`             | `GET  /api/artifacts/:id/:aid/download`               |

### G. 健康检查

| 接口             | 用途                       |
| ---------------- | -------------------------- |
| `GET /api/health` | 探活，返回 `{ ok, service }` |

---

## 五、变更记录

- v1.0 (2026-06-16) — 初版整理，覆盖 23 个接口 + 13 种 SSE 事件。