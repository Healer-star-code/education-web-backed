export interface ApiImagePayload {
  name: string
  mimeType: string
  data: string
}

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
}

export interface WebToolCall {
  id: string
  name: string
  status: 'running' | 'done' | 'error'
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
  | { type: 'session_renamed'; sessionId: string; name: string; titleSource: 'ai' | 'user'; aiTitleGenerated: boolean }
  | { type: 'artifact_created'; artifact: ArtifactInfo }
  | { type: 'agent_end' }
  | { type: 'error'; message: string }

const API_BASE = import.meta.env.VITE_PI_API_BASE ?? 'http://localhost:30142'

async function requestJson<T>(path: string, init?: RequestInit, options?: { timeoutMs?: number | null }): Promise<T> {
  const timeoutMs = options?.timeoutMs === undefined ? 60000 : options.timeoutMs
  const controller = timeoutMs === null ? undefined : new AbortController()
  const timer = timeoutMs === null ? undefined : setTimeout(() => controller?.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller?.signal,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
    const data = await res.json() as T & { error?: string }
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
    return data
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('请求超时，请稍后重试')
    }
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function selectDirectory(): Promise<string | null> {
  const data = await requestJson<{ path: string | null }>('/api/dialog/select-directory', {
    method: 'POST',
    body: JSON.stringify({}),
  })
  return data.path
}

export async function createSession(cwd?: string, sessionFile?: string): Promise<WebSessionInfo> {
  const data = await requestJson<{ session: WebSessionInfo }>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(sessionFile
      ? { mode: 'open_existing', sessionFile }
      : { mode: 'new_isolated', cwd }),
  })
  return data.session
}

export async function listSessions(cwd?: string): Promise<WebSessionInfo[]> {
  const query = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
  const data = await requestJson<{ sessions: WebSessionInfo[] }>(`/api/sessions${query}`)
  return data.sessions
}

export async function getMessages(sessionId: string): Promise<WebMessage[]> {
  const data = await requestJson<{ messages: WebMessage[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/messages`)
  return data.messages
}

export async function sendPrompt(sessionId: string, payload: PromptPayload): Promise<void> {
  await requestJson<{ ok: true }>(`/api/sessions/${encodeURIComponent(sessionId)}/prompt`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, { timeoutMs: null })
}

export async function abortSession(sessionId: string): Promise<void> {
  await requestJson<{ ok: true }>(`/api/sessions/${encodeURIComponent(sessionId)}/abort`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function deleteSession(sessionFile: string): Promise<void> {
  await requestJson<{ ok: true }>('/api/sessions/delete', {
    method: 'POST',
    body: JSON.stringify({ sessionFile }),
  })
}

export async function renameSession(sessionId: string, name: string): Promise<WebSessionInfo> {
  const data = await requestJson<{ session: WebSessionInfo }>(`/api/sessions/${encodeURIComponent(sessionId)}/name`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  return data.session
}

export function connectSessionEvents(sessionId: string, onEvent: (event: WebAgentEvent) => void): EventSource {
  const es = new EventSource(`${API_BASE}/api/sessions/${encodeURIComponent(sessionId)}/events`)
  es.onmessage = (message) => {
    onEvent(JSON.parse(message.data) as WebAgentEvent)
  }
  return es
}

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

export interface RecentPathInfo {
  path: string
  name: string
  timeCreated: number
  timeUpdated: number
}

export async function listRecentPaths(): Promise<RecentPathInfo[]> {
  const data = await requestJson<{ paths: RecentPathInfo[] }>('/api/recent-paths')
  return data.paths
}

export async function addRecentPath(path: string): Promise<RecentPathInfo[]> {
  const data = await requestJson<{ paths: RecentPathInfo[] }>('/api/recent-paths', {
    method: 'POST',
    body: JSON.stringify({ path, action: 'add' }),
  })
  return data.paths
}

export async function removeRecentPath(path: string): Promise<RecentPathInfo[]> {
  const data = await requestJson<{ paths: RecentPathInfo[] }>('/api/recent-paths', {
    method: 'POST',
    body: JSON.stringify({ path, action: 'remove' }),
  })
  return data.paths
}

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
  return `${API_BASE}/api/artifacts/${encodeURIComponent(artifact.sessionId)}/${encodeURIComponent(artifact.id)}/download`
}
