export interface ApiImagePayload {
  name: string
  mimeType: string
  data: string
}

// Side-effect import 注册 window.piDesktop 类型
import './desktopBridge'

export interface PromptPayload {
  message: string
  images?: ApiImagePayload[]
}

export interface WebSessionInfo {
  id: string
  cwd: string
  sessionFile?: string
  created: string
  modified: string
  firstMessage: string
  messageCount: number
  name?: string
  titleSource?: 'ai' | 'user'
  aiTitleGenerated?: boolean
  parentSessionId?: string
  /** super-king 扩展字段 */
  active?: boolean
  model?: { provider: string; modelId: string } | null
  cost?: number
  tokens?: { input: number; output: number; total: number }
}

export interface WebToolCall {
  id: string
  name: string
  status: 'running' | 'done' | 'error' | 'waiting_permission'
  args?: unknown
  result?: unknown
}

export interface WebMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  thinkingContent?: string
  thinkingDurationMs?: number
  toolCalls?: WebToolCall[]
  artifacts?: ArtifactInfo[]
}

export interface SkillInfo {
  name: string
  description: string
  source: string
  enabled: boolean
}

export interface ToolInfo {
  name: string
  description: string
  active: boolean
}

export interface ArtifactInfo {
  id: string
  sessionId: string
  name: string
  path: string
  mimeType: string
  size: number
  kind: 'word' | 'presentation' | 'spreadsheet' | 'pdf' | 'image' | 'text' | 'file'
  timeCreated: number
  messageIndex?: number
  /** 仅本地启发式提取的 artifact 才有：文件在用户磁盘上的绝对路径 */
  localPath?: string
  /** 文件是否仍存在（来自 file:stat 验证）。未验证时 undefined。 */
  exists?: boolean
  /** 来源标记：'backend' = super-king SSE 推送；'local-scan' = 前端文本扫描兜底 */
  source?: 'backend' | 'local-scan'
}

export interface PermissionRequestInfo {
  permissionId: string
  sessionId: string
  kind: string
  message: string
  options?: unknown
  diff?: string
}

export interface QuestionInfo {
  questionId: string
  sessionId: string
  questions: { label: string; value?: string }[][]
}

export type WebAgentEvent =
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
  | { type: 'permission_requested'; request: PermissionRequestInfo }
  | { type: 'permission_resolved'; permissionId: string; approved: boolean }
  | { type: 'question'; question: QuestionInfo }
  | { type: 'question_resolved'; questionId: string; answer?: string }
  | { type: 'session_renamed'; sessionId: string; name: string; titleSource: 'ai' | 'user'; aiTitleGenerated: boolean }
  | { type: 'artifact_created'; artifact: ArtifactInfo }
  | { type: 'agent_end' }
  | { type: 'error'; message: string }

const DEFAULT_API_BASE = '/superking-api'
const LS_SERVER_URL = 'pi-server-url'
const LS_PASSWORD = 'pi-server-password'

function isDevFrontend(): boolean {
  return typeof window !== 'undefined' && window.location.host === 'localhost:5173'
}

function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { piDesktop?: unknown }).piDesktop
}

function shouldUseProxy(savedUrl: string): boolean {
  return isDevFrontend() && /^https?:\/\/(127\.0\.0\.1|localhost):30142\/?$/.test(savedUrl.trim())
}

export function getApiBase(): string {
  try {
    const fromLs = localStorage.getItem(LS_SERVER_URL)
    if (fromLs) {
      if (shouldUseProxy(fromLs)) return DEFAULT_API_BASE
      // Electron 打包后用 file:// 加载页面，"/superking-api" 这种相对路径会拼成
      // file:///superking-api 而失败。强制改为直连 127.0.0.1:30142。
      if (isElectronRuntime() && fromLs === '/superking-api') {
        return 'http://127.0.0.1:30142'
      }
      return fromLs
    }
  } catch { /* ignore */ }
  const envBase = import.meta.env.VITE_PI_API_BASE as string | undefined
  if (envBase) return envBase
  if (isElectronRuntime()) return 'http://127.0.0.1:30142'
  return DEFAULT_API_BASE
}

export function getPassword(): string {
  try {
    return localStorage.getItem(LS_PASSWORD) ?? ''
  } catch { return '' }
}

function toBase64(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function ensurePassword(): string {
  const password = getPassword()
  if (!password) {
    throw new Error('未设置访问密码，请先在设置面板中填写并保存服务器密码')
  }
  return password
}

export function getAuthHeader(): string {
  return 'Basic ' + toBase64('super-king:' + ensurePassword())
}

export function getAuthToken(): string {
  return toBase64('super-king:' + ensurePassword())
}

function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err
  return new Error(String(err))
}

function extractErrorMessage(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const err = (data as Record<string, unknown>).error
  if (!err || typeof err !== 'object') return undefined
  const e = err as Record<string, unknown>
  if (typeof e.message === 'string') return e.message
  if (typeof e.code === 'string') return e.code
  return undefined
}

async function requestJson<T>(path: string, init?: RequestInit, options?: { timeoutMs?: number | null }): Promise<T> {
  const timeoutMs = options?.timeoutMs === undefined ? 60000 : options.timeoutMs
  const controller = timeoutMs === null ? undefined : new AbortController()
  const timer = timeoutMs === null ? undefined : setTimeout(() => controller?.abort(), timeoutMs)
  const base = getApiBase()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('Authorization', getAuthHeader())
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller?.signal,
      headers,
    })
    let data: unknown
    try {
      data = await res.json()
    } catch {
      data = undefined
    }
    if (!res.ok) {
      const msg = extractErrorMessage(data) ?? `HTTP ${res.status}`
      if (res.status === 401) {
        throw new Error(`认证失败：请检查设置面板中的「访问密码」是否正确并已保存。当前服务器：${getApiBase()}`)
      }
      throw new Error(msg)
    }
    return data as T
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试')
    }
    const message = err instanceof Error ? err.message : String(err)
    if (message.toLowerCase().includes('fetch') || message.toLowerCase().includes('network') || err instanceof TypeError) {
      throw new Error(`无法连接到服务器 ${getApiBase()}。请检查：1. 后端是否已启动；2. 服务器地址是否正确；3. 当前后端是否为 super-king（旧版 v3-web 后端不支持当前 API 认证头）。`)
    }
    throw normalizeError(err)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Local helper (文档未定义，由前端本地服务补充)
// ---------------------------------------------------------------------------

const DEFAULT_LOCAL_HELPER_BASE = 'http://127.0.0.1:30143'
const LS_LOCAL_HELPER_URL = 'pi-local-helper-url'

export function getLocalHelperBase(): string {
  try {
    const fromLs = localStorage.getItem(LS_LOCAL_HELPER_URL)
    if (fromLs) return fromLs
  } catch { /* ignore */ }
  return (import.meta.env.VITE_LOCAL_HELPER_BASE as string | undefined) ?? DEFAULT_LOCAL_HELPER_BASE
}

async function localRequestJson<T>(path: string, init?: RequestInit, options?: { timeoutMs?: number | null }): Promise<T> {
  const timeoutMs = options?.timeoutMs === undefined ? 10000 : options.timeoutMs
  const controller = timeoutMs === null ? undefined : new AbortController()
  const timer = timeoutMs === null ? undefined : setTimeout(() => controller?.abort(), timeoutMs)
  const base = getLocalHelperBase()
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  try {
    const res = await fetch(`${base}${path}`, {
      ...init,
      signal: controller?.signal,
      headers,
    })
    let data: unknown
    try {
      data = await res.json()
    } catch {
      data = undefined
    }
    if (!res.ok) {
      const msg = extractErrorMessage(data) ?? `HTTP ${res.status}`
      throw new Error(msg)
    }
    return data as T
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('本地助手服务请求超时')
    }
    throw normalizeError(err)
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function getLocalSkillsRoot(): Promise<{ path: string }> {
  if (typeof window !== 'undefined' && window.piDesktop?.local?.getSkillsRoot) {
    return window.piDesktop.local.getSkillsRoot()
  }
  return localRequestJson<{ path: string }>('/api/local/skills/root')
}

const LS_SKILLS_CACHE = 'pi-local-skills-cache'

export interface LocalSkillsCache {
  root: string
  skills: SkillInfo[]
  updatedAt: number
}

export function getCachedLocalSkills(): LocalSkillsCache | null {
  try {
    const raw = localStorage.getItem(LS_SKILLS_CACHE)
    if (!raw) return null
    return JSON.parse(raw) as LocalSkillsCache
  } catch { return null }
}

function setCachedLocalSkills(root: string, skills: SkillInfo[]) {
  try {
    localStorage.setItem(LS_SKILLS_CACHE, JSON.stringify({ root, skills, updatedAt: Date.now() }))
  } catch { /* ignore */ }
}

export async function listLocalSkills(): Promise<{ skills: SkillInfo[]; root: string }> {
  if (typeof window !== 'undefined' && window.piDesktop?.local?.listSkills) {
    const data = await window.piDesktop.local.listSkills()
    const skills: SkillInfo[] = data.skills.map((s) => ({
      name: s.name,
      description: s.description,
      source: s.source,
      enabled: s.enabled,
    }))
    setCachedLocalSkills(data.root, skills)
    return { skills, root: data.root }
  }
  const data = await localRequestJson<{ skills: SkillInfo[]; root: string }>('/api/local/skills')
  setCachedLocalSkills(data.root, data.skills)
  return data
}

export async function listLocalSkillsWithCache(): Promise<{ skills: SkillInfo[]; root: string; fromCache: boolean }> {
  try {
    const data = await listLocalSkills()
    return { ...data, fromCache: false }
  } catch (err) {
    const cached = getCachedLocalSkills()
    if (cached) {
      return { skills: cached.skills, root: cached.root, fromCache: true }
    }
    throw err
  }
}

export async function openLocalFolder(path?: string): Promise<void> {
  if (typeof window !== 'undefined' && window.piDesktop?.local?.openFolder) {
    const result = await window.piDesktop.local.openFolder(path)
    if (!result.ok) {
      throw new Error(result.error ?? '无法打开文件夹')
    }
    return
  }
  await localRequestJson<{ ok: true }>('/api/local/open-folder', {
    method: 'POST',
    body: JSON.stringify(path ? { path } : {}),
  })
}

// ---------------------------------------------------------------------------
// Super-king internal types
// ---------------------------------------------------------------------------

interface SuperKingSessionListItem {
  id: string
  cwd: string
  name: string | null
  created: string
  modified: string
  messageCount: number
  preview: string
  active: boolean
  model: { provider: string; modelId: string } | null
  cost: number
  tokens: { input: number; output: number; total: number }
}

interface SuperKingSessionCreateResponse {
  id: string
  cwd: string
}

type SuperKingContent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; redacted?: boolean }
  | { type: 'toolCall'; id: string; name: string; arguments: unknown }
  | { type: 'image'; data: string; mimeType: string }

interface SuperKingMessage {
  role: 'user' | 'assistant' | 'toolResult'
  content: SuperKingContent[]
  timestamp: number
  provider?: string
  model?: string
  usage?: {
    input: number
    output: number
    totalTokens: number
    cost: { total: number }
  }
  stopReason?: string
  toolCallId?: string
  toolName?: string
  isError?: boolean
}

// ---------------------------------------------------------------------------
// Directory selection (Electron 优先；浏览器中 fallback 到旧的后端接口/手动输入)
// ---------------------------------------------------------------------------

export async function selectDirectory(): Promise<string | null> {
  // Electron 桌面客户端：调用原生目录选择
  if (typeof window !== 'undefined' && window.piDesktop?.dialog?.selectDirectory) {
    try {
      return await window.piDesktop.dialog.selectDirectory()
    } catch (err) {
      console.warn('[selectDirectory] electron dialog failed', err)
      return null
    }
  }
  // 浏览器：尝试调一个可能不存在的后端接口；失败由调用方 fallback 手动输入
  try {
    const data = await requestJson<{ path: string | null }>('/api/dialog/select-directory', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (data.path) return data.path
  } catch {
    // fallback: 返回 null，由调用方弹出手动输入
  }
  return null
}

// ---------------------------------------------------------------------------
// Session APIs (按 super-king 文档)
// ---------------------------------------------------------------------------

export async function createSession(cwd?: string, _sessionFile?: string): Promise<WebSessionInfo> {
  if (_sessionFile) {
    // super-king 没有 open_existing 模式，忽略旧 sessionFile 参数
    console.warn('createSession with sessionFile is not supported by super-king, creating new session instead')
  }
  const data = await requestJson<SuperKingSessionCreateResponse>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(cwd ? { cwd } : {}),
  })
  return {
    id: data.id,
    cwd: data.cwd,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    firstMessage: '',
    messageCount: 0,
  }
}

export async function listSessions(cwd?: string): Promise<WebSessionInfo[]> {
  const params = new URLSearchParams()
  if (cwd) params.set('directory', cwd)
  const data = await requestJson<{ sessions: SuperKingSessionListItem[] }>(`/api/sessions?${params.toString()}`)
  return data.sessions.map((s) => convertSession(s))
}

export async function getSession(sessionId: string): Promise<WebSessionInfo> {
  const data = await requestJson<SuperKingSessionListItem>(`/api/sessions/${encodeURIComponent(sessionId)}`)
  return convertSession(data)
}

function convertSession(s: SuperKingSessionListItem): WebSessionInfo {
  return {
    id: s.id,
    cwd: s.cwd,
    name: s.name ?? undefined,
    created: s.created,
    modified: s.modified,
    firstMessage: s.preview ?? s.name ?? '',
    messageCount: s.messageCount,
    active: s.active,
    model: s.model,
    cost: s.cost,
    tokens: s.tokens,
  }
}

export async function getMessages(sessionId: string): Promise<WebMessage[]> {
  const data = await requestJson<{ messages: SuperKingMessage[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  return convertSuperKingMessages(data.messages)
}

export async function sendPrompt(sessionId: string, payload: PromptPayload): Promise<void> {
  // 按 super-king /prompt 文档：支持 { message, images? }
  // images 走 base64（ApiImagePayload），文档类附件由前端复制到 cwd 后通过 message 文本注入路径提示
  const body: Record<string, unknown> = { message: payload.message }
  if (payload.images && payload.images.length > 0) {
    body.images = payload.images
  }
  await requestJson<{ ok: true }>(`/api/sessions/${encodeURIComponent(sessionId)}/prompt`, {
    method: 'POST',
    body: JSON.stringify(body),
  }, { timeoutMs: null })
}

export async function abortSession(sessionId: string): Promise<void> {
  await requestJson<{ ok: true }>(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function deleteSession(sessionId: string): Promise<void> {
  await requestJson<{ ok: true }>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

export async function renameSession(sessionId: string, name: string): Promise<WebSessionInfo> {
  const data = await requestJson<SuperKingSessionListItem>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
  return convertSession(data)
}

export async function switchModel(sessionId: string, provider: string, modelId: string): Promise<void> {
  await requestJson<{ ok: true }>(`/api/sessions/${encodeURIComponent(sessionId)}/model`, {
    method: 'PATCH',
    body: JSON.stringify({ provider, modelId }),
  })
}

// ---------------------------------------------------------------------------
// Health / connection test (按 super-king 文档)
// ---------------------------------------------------------------------------

export async function testConnection(): Promise<{ ok: true }> {
  return requestJson<{ ok: true }>('/api/health', { method: 'GET' }, { timeoutMs: 10000 })
}

// ---------------------------------------------------------------------------
// Models & config (按 super-king 文档)
// ---------------------------------------------------------------------------

export interface ModelProviderInfo {
  id: string
  name: string
  models: {
    id: string
    name: string
    reasoning: boolean
    input: string[]
    contextWindow: number
    maxTokens: number
  }[]
}

export async function listModels(): Promise<ModelProviderInfo[]> {
  const data = await requestJson<{ providers: ModelProviderInfo[] }>('/api/models')
  return data.providers
}

export interface ConfigInfo {
  defaultModel: { id: string; provider: string; modelId?: string } | null
}

export async function getConfig(): Promise<ConfigInfo> {
  return requestJson<ConfigInfo>('/api/config')
}

// ---------------------------------------------------------------------------
// Permissions (按 super-king 文档)
// ---------------------------------------------------------------------------

export async function listPermissions(sessionId: string): Promise<PermissionRequestInfo[]> {
  const data = await requestJson<{ permissions: PermissionRequestInfo[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/permissions`)
  return data.permissions
}

export async function resolvePermission(sessionId: string, permissionId: string, approved: boolean): Promise<void> {
  await requestJson<{ ok: true }>(`/api/sessions/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`, {
    method: 'POST',
    body: JSON.stringify({ approved }),
  })
}

// ---------------------------------------------------------------------------
// Questions (按 super-king 文档)
// ---------------------------------------------------------------------------

export async function listQuestions(): Promise<QuestionInfo[]> {
  const data = await requestJson<{ questions: QuestionInfo[] }>('/api/questions')
  return data.questions
}

export async function answerQuestion(questionId: string, answers: string[][]): Promise<void> {
  await requestJson<{ ok: true }>(`/api/questions/${encodeURIComponent(questionId)}`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  })
}

export async function rejectQuestion(questionId: string): Promise<void> {
  await requestJson<{ ok: true }>(`/api/questions/${encodeURIComponent(questionId)}/reject`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

// ---------------------------------------------------------------------------
// SSE (按 super-king 文档 named events；内部转换为前端 WebAgentEvent)
// ---------------------------------------------------------------------------

/**
 * 工具流式 partialResult 在白屏修复中需要截断：某些工具（write/edit/bash）
 * 在生成 docx/excel/视频等大文件时 partialResult 可能是几 MB 的二进制转字符串，
 * 直接塞进 React state 会触发主线程长时间 GC + 重渲染卡死。
 *
 * - tool_execution_update 截断到 2KB，确保流式预览不至于太重
 * - tool_execution_end 截断到 200KB，最终结果仍然能放进 state（避免完全丢失）
 */
function truncateForUi(value: unknown, limit: number): unknown {
  if (typeof value !== 'string') return value
  if (value.length <= limit) return value
  return value.slice(0, limit) + `\n…（已省略 ${value.length - limit} 字符以保护渲染性能）`
}

export function connectSessionEvents(sessionId: string, onEvent: (event: WebAgentEvent) => void): EventSource {
  const base = getApiBase()
  const token = getAuthToken()
  const es = new EventSource(`${base}/api/sessions/${encodeURIComponent(sessionId)}/events?auth_token=${encodeURIComponent(token)}`)

  const state = {
    assistantText: '',
    assistantThinking: '',
    thinkingOpen: false,
  }

  function reset() {
    state.assistantText = ''
    state.assistantThinking = ''
    state.thinkingOpen = false
  }

  function emitTextDelta(fullText: string) {
    const delta = fullText.slice(state.assistantText.length)
    if (delta) {
      state.assistantText = fullText
      onEvent({ type: 'assistant_delta', delta })
    }
  }

  function emitThinkingDelta(fullThinking: string) {
    if (!fullThinking) {
      if (state.thinkingOpen) {
        onEvent({ type: 'thinking_end', content: state.assistantThinking })
        state.assistantThinking = ''
        state.thinkingOpen = false
      }
      return
    }
    if (!state.thinkingOpen) {
      state.thinkingOpen = true
      onEvent({ type: 'thinking_start' })
    }
    const delta = fullThinking.slice(state.assistantThinking.length)
    if (delta) {
      state.assistantThinking = fullThinking
      onEvent({ type: 'thinking_delta', delta })
    }
  }

  function flushFinal(message?: { content?: SuperKingContent[] }) {
    const content = message?.content ?? []
    let text = ''
    let thinking = ''
    for (const c of content) {
      if (c.type === 'text') text += c.text
      if (c.type === 'thinking') thinking += c.thinking
    }
    emitTextDelta(text)
    emitThinkingDelta(thinking)
    if (state.thinkingOpen) {
      onEvent({ type: 'thinking_end', content: state.assistantThinking })
    }
    reset()
  }

  es.addEventListener('open', () => {
    onEvent({ type: 'connected', sessionId })
  })

  // 兜底：某些环境/代理下 open 事件不可靠，首次收到任意命名事件也视为已连接
  let anyEventReceived = false
  const markConnectedOnce = () => {
    if (anyEventReceived) return
    anyEventReceived = true
    onEvent({ type: 'connected', sessionId })
  }

  es.addEventListener('agent_start', () => {
    markConnectedOnce()
    reset()
    onEvent({ type: 'agent_start' })
  })

  es.addEventListener('message_start', (event) => {
    markConnectedOnce()
    try {
      const data = JSON.parse((event as MessageEvent).data)
      const content = data.message?.content ?? []
      let text = ''
      let thinking = ''
      for (const c of content) {
        if (c.type === 'text') text += c.text
        if (c.type === 'thinking') thinking += c.thinking
      }
      // 以当前内容作为基准，避免后续 delta 把 message_start 中的内容重复追加
      state.assistantText = text
      state.assistantThinking = thinking
      if (thinking) state.thinkingOpen = true
      if (text) onEvent({ type: 'assistant_delta', delta: text })
      if (thinking) onEvent({ type: 'thinking_start' })
      if (thinking) onEvent({ type: 'thinking_delta', delta: thinking })
    } catch {
      // ignore
    }
  })

  es.addEventListener('message_update', (event) => {
    markConnectedOnce()
    try {
      const data = JSON.parse((event as MessageEvent).data)
      const content: SuperKingContent[] = data.message?.content ?? []
      let text = ''
      let thinking = ''
      for (const c of content) {
        if (c.type === 'text') text += c.text
        if (c.type === 'thinking') thinking += c.thinking
      }
      emitTextDelta(text)
      emitThinkingDelta(thinking)
    } catch {
      // ignore
    }
  })

  es.addEventListener('message_end', (event) => {
    markConnectedOnce()
    try {
      const data = JSON.parse((event as MessageEvent).data)
      flushFinal(data.message)
      onEvent({ type: 'assistant_message_end' })
    } catch {
      // ignore
    }
  })

  es.addEventListener('tool_execution_start', (event) => {
    markConnectedOnce()
    try {
      const data = JSON.parse((event as MessageEvent).data)
      onEvent({
        type: 'tool_start',
        toolCallId: data.toolCallId,
        toolName: data.toolName,
        args: data.args,
      })
    } catch {
      // ignore
    }
  })

  es.addEventListener('tool_execution_update', (event) => {
    markConnectedOnce()
    try {
      const data = JSON.parse((event as MessageEvent).data)
      onEvent({
        type: 'tool_update',
        toolCallId: data.toolCallId,
        toolName: data.toolName,
        partialResult: truncateForUi(data.partialResult, 2000),
      })
    } catch {
      // ignore
    }
  })

  es.addEventListener('tool_execution_end', (event) => {
    markConnectedOnce()
    try {
      const data = JSON.parse((event as MessageEvent).data)
      onEvent({
        type: 'tool_end',
        toolCallId: data.toolCallId,
        toolName: data.toolName,
        result: truncateForUi(data.result, 200_000),
        isError: data.isError,
      })
    } catch {
      // ignore
    }
  })

  es.addEventListener('agent_end', () => {
    markConnectedOnce()
    flushFinal()
    onEvent({ type: 'agent_end' })
  })

  // ---- artifact_created：super-king 在生成文件后发的事件 ----
  // 文档里 SSE 协议层定义了这个 named event，但之前前端漏接，导致文件卡片无法显示。
  // 后端可能发的 payload 两种：
  //   1) { artifact: { id, sessionId, name, path, ... } }       <- 标准
  //   2) { id, sessionId, name, path, ... }                     <- 简化（直接平铺）
  es.addEventListener('artifact_created', (event) => {
    markConnectedOnce()
    try {
      const data = JSON.parse((event as MessageEvent).data)
      const raw = (data && typeof data === 'object' && 'artifact' in data && data.artifact)
        ? data.artifact
        : data
      if (raw && typeof raw === 'object') {
        const artifact: ArtifactInfo = {
          ...(raw as ArtifactInfo),
          source: 'backend',
        }
        onEvent({ type: 'artifact_created', artifact })
      }
    } catch {
      // ignore
    }
  })

  // super-king 实际也会把权限/问题作为独立 named event 发送
  es.addEventListener('permission_requested', (event) => {
    markConnectedOnce()
    try {
      const data = JSON.parse((event as MessageEvent).data)
      onEvent({
        type: 'permission_requested',
        request: {
          permissionId: data.permissionId,
          sessionId: data.sessionId,
          kind: data.kind,
          message: data.message,
          options: data.options,
          diff: data.diff,
        },
      })
    } catch {
      // ignore
    }
  })

  es.addEventListener('permission_resolved', (event) => {
    markConnectedOnce()
    try {
      const data = JSON.parse((event as MessageEvent).data)
      onEvent({
        type: 'permission_resolved',
        permissionId: data.permissionId ?? data.requestId,
        approved: data.approved ?? (data.decision === 'allow_once' || data.decision === 'allow_session'),
      })
    } catch {
      // ignore
    }
  })

  es.addEventListener('question', (event) => {
    markConnectedOnce()
    try {
      const data = JSON.parse((event as MessageEvent).data)
      onEvent({
        type: 'question',
        question: {
          questionId: data.questionId,
          sessionId: data.sessionId,
          questions: data.questions ?? [],
        },
      })
    } catch {
      // ignore
    }
  })

  es.addEventListener('question_resolved', (event) => {
    markConnectedOnce()
    try {
      const data = JSON.parse((event as MessageEvent).data)
      onEvent({
        type: 'question_resolved',
        questionId: data.questionId,
        answer: data.answer,
      })
    } catch {
      // ignore
    }
  })

  // 保留 custom event 兜底（某些版本/代理可能仍走这里）
  es.addEventListener('custom', (event) => {
    markConnectedOnce()
    try {
      const data = JSON.parse((event as MessageEvent).data)
      if (!data || typeof data !== 'object' || !data.type) return

      if (data.type === 'permission_requested') {
        onEvent({
          type: 'permission_requested',
          request: {
            permissionId: data.permissionId,
            sessionId: data.sessionId,
            kind: data.kind,
            message: data.message,
            options: data.options,
            diff: data.diff,
          },
        })
      } else if (data.type === 'permission_resolved') {
        onEvent({
          type: 'permission_resolved',
          permissionId: data.permissionId ?? data.requestId,
          approved: data.approved ?? (data.decision === 'allow_once' || data.decision === 'allow_session'),
        })
      } else if (data.type === 'question' || data.type === 'question_requested') {
        onEvent({
          type: 'question',
          question: {
            questionId: data.questionId,
            sessionId: data.sessionId,
            questions: data.questions ?? [],
          },
        })
      } else if (data.type === 'question_resolved') {
        onEvent({
          type: 'question_resolved',
          questionId: data.questionId,
          answer: data.answer,
        })
      }
    } catch {
      // ignore
    }
  })

  es.addEventListener('server.heartbeat', () => {
    // 心跳，无需处理
  })

  // 兜底：旧式默认 message 事件（兼容非文档实现）
  es.onmessage = (message) => {
    try {
      const data = JSON.parse(message.data)
      if (data && typeof data === 'object' && 'type' in data) {
        onEvent(data as WebAgentEvent)
      }
    } catch {
      // ignore
    }
  }

  es.onerror = () => {
    onEvent({ type: 'error', message: '与服务器的事件连接已断开' })
  }

  return es
}

// ---------------------------------------------------------------------------
// Message conversion
// ---------------------------------------------------------------------------

function convertSuperKingMessages(messages: SuperKingMessage[]): WebMessage[] {
  const result: WebMessage[] = []
  let runningToolCalls = new Map<string, WebToolCall>()

  function appendToolCall(tc: WebToolCall) {
    runningToolCalls.set(tc.id, tc)
  }

  function findLastAssistant(): WebMessage | null {
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i].role === 'assistant') return result[i]
    }
    return null
  }

  function extractText(content: SuperKingContent[]): string {
    return content.filter((c): c is { type: 'text'; text: string } => c.type === 'text').map((c) => c.text).join('')
  }

  for (const msg of messages) {
    if (msg.role === 'toolResult') {
      const assistant = findLastAssistant()
      if (assistant && assistant.toolCalls) {
        const tc = assistant.toolCalls.find((t) => t.id === msg.toolCallId)
        if (tc) {
          tc.status = msg.isError ? 'error' : 'done'
          tc.result = extractText(msg.content)
        }
      }
      continue
    }

    const webMsg: WebMessage = {
      id: generateMessageId(msg.timestamp),
      role: msg.role,
      content: '',
      timestamp: new Date(msg.timestamp).toISOString(),
      thinkingContent: '',
      thinkingDurationMs: 0,
      toolCalls: [],
      artifacts: [],
    }

    for (const c of msg.content) {
      if (c.type === 'text') webMsg.content += c.text
      if (c.type === 'thinking') webMsg.thinkingContent += c.thinking
      if (c.type === 'toolCall') {
        const tc: WebToolCall = {
          id: c.id,
          name: c.name,
          status: 'running',
          args: c.arguments,
        }
        webMsg.toolCalls!.push(tc)
        appendToolCall(tc)
      }
    }

    result.push(webMsg)
  }

  return result
}

function generateMessageId(timestamp?: number): string {
  if (timestamp === undefined) return 'm' + Date.now() + Math.random().toString(36).slice(2, 7)
  return 'm' + timestamp
}

// ---------------------------------------------------------------------------
// Skills (文档未定义，保留前端接口；后端无接口时会优雅失败)
// ---------------------------------------------------------------------------

export interface CreateSkillPayload {
  cwd?: string
  name: string
  description: string
  content: string
}

export async function listSkills(cwd?: string): Promise<SkillInfo[]> {
  const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
  const data = await requestJson<{ skills: SkillInfo[] }>(`/api/skills${query}`)
  return data.skills
}

export async function listInstalledSkills(): Promise<{ skills: SkillInfo[]; root: string }> {
  return requestJson<{ skills: SkillInfo[]; root: string }>('/api/skills/installed')
}

export async function reinstallOfficeSkills(): Promise<{ skills: SkillInfo[]; root: string }> {
  return requestJson<{ skills: SkillInfo[]; root: string }>('/api/skills/reinstall-office', { method: 'POST', body: JSON.stringify({}) })
}

export async function createSkill(payload: CreateSkillPayload): Promise<SkillInfo> {
  const data = await requestJson<{ skill: SkillInfo }>('/api/skills', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return data.skill
}

export async function deleteSkill(name: string): Promise<void> {
  await requestJson<{ ok: true }>('/api/skills/delete', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function getSkillsRoot(): Promise<string> {
  const data = await requestJson<{ path: string }>('/api/skills/root')
  return data.path
}

// ---------------------------------------------------------------------------
// Recent paths (文档未定义，保留前端能力；后端无接口时 fallback 到 localStorage)
// ---------------------------------------------------------------------------

const LS_RECENT_PATHS = 'pi-recent-paths'

export interface RecentPathInfo {
  path: string
  name: string
  timeCreated: number
  timeUpdated: number
}

function loadRecentPathsFromStorage(): RecentPathInfo[] {
  try {
    const raw = localStorage.getItem(LS_RECENT_PATHS)
    return raw ? (JSON.parse(raw) as RecentPathInfo[]) : []
  } catch { return [] }
}

function saveRecentPathsToStorage(paths: RecentPathInfo[]) {
  try {
    localStorage.setItem(LS_RECENT_PATHS, JSON.stringify(paths))
  } catch { /* ignore */ }
}

// super-king 文档未定义 /api/recent-paths，完全由前端 localStorage 管理
export async function listRecentPaths(): Promise<RecentPathInfo[]> {
  return loadRecentPathsFromStorage()
}

export async function addRecentPath(path: string): Promise<RecentPathInfo[]> {
  const paths = loadRecentPathsFromStorage()
  const existing = paths.find((p) => p.path === path)
  const now = Date.now()
  if (existing) {
    existing.timeUpdated = now
  } else {
    paths.unshift({ path, name: path, timeCreated: now, timeUpdated: now })
  }
  const trimmed = paths.slice(0, 20)
  saveRecentPathsToStorage(trimmed)
  return trimmed
}

export async function removeRecentPath(path: string): Promise<RecentPathInfo[]> {
  const paths = loadRecentPathsFromStorage().filter((p) => p.path !== path)
  saveRecentPathsToStorage(paths)
  return paths
}

// ---------------------------------------------------------------------------
// Misc (文档未定义，保留前端能力)
// ---------------------------------------------------------------------------

export async function openFolder(path: string): Promise<void> {
  await requestJson<{ ok: true }>('/api/open-folder', {
    method: 'POST',
    body: JSON.stringify({ path }),
  })
}

export async function listTools(sessionId: string): Promise<ToolInfo[]> {
  const data = await requestJson<{ tools: ToolInfo[] }>(`/api/tools/${encodeURIComponent(sessionId)}`)
  return data.tools
}

export async function setTools(sessionId: string, toolNames: string[]): Promise<void> {
  await requestJson<{ ok: true }>(`/api/tools/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    body: JSON.stringify({ toolNames }),
  })
}

export function artifactDownloadUrl(artifact: ArtifactInfo): string {
  const base = getApiBase()
  return `${base}/api/artifacts/${encodeURIComponent(artifact.sessionId)}/${encodeURIComponent(artifact.id)}/download?auth_token=${encodeURIComponent(getAuthToken())}`
}
