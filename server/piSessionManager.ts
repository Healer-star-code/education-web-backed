import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type SessionInfo as PiSessionInfo,
} from '@earendil-works/pi-coding-agent'
import { broadcastAgentEvent } from './sse.ts'
import { toSdkImages } from './image.ts'
import type { ApiImagePayload, SkillInfo, WebSessionInfo } from './types.ts'

const DEFAULT_TOOLS = ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write']
const DEFAULT_CWD = process.env.V3_WEB_DEFAULT_CWD ?? process.cwd()
const DEFAULT_PROVIDER = process.env.PI_PROVIDER ?? 'deepseek'
const DEFAULT_MODEL_ID = process.env.PI_MODEL ?? 'deepseek-v4-pro'

interface ManagedSession {
  session: AgentSession
  unsubscribe: () => void
  cwd: string
}

export interface WebMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

const sessions = new Map<string, ManagedSession>()
const authStorage = AuthStorage.create()
const modelRegistry = ModelRegistry.create(authStorage)

const deepseekApiKey = process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY
if (deepseekApiKey) {
  authStorage.setRuntimeApiKey('deepseek', deepseekApiKey)
}

function getDefaultModel() {
  const model = modelRegistry.find(DEFAULT_PROVIDER, DEFAULT_MODEL_ID)
  if (!model) {
    throw new Error(`Model not found: ${DEFAULT_PROVIDER}/${DEFAULT_MODEL_ID}`)
  }
  return model
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (!isRecord(part)) return ''
      const text = part.text
      return typeof text === 'string' ? text : ''
    })
    .join('')
}

function toWebMessage(message: unknown, index: number): WebMessage | null {
  if (!isRecord(message)) return null
  const role = message.role
  if (role !== 'user' && role !== 'assistant') return null
  return {
    id: `${role}-${index}`,
    role,
    content: extractTextContent(message.content),
  }
}

function toWebSessionInfo(info: PiSessionInfo): WebSessionInfo {
  return {
    id: info.id,
    cwd: info.cwd,
    sessionFile: info.path,
    created: info.created.toISOString(),
    modified: info.modified.toISOString(),
    firstMessage: info.firstMessage,
    messageCount: info.messageCount,
    name: info.name,
    parentSessionId: info.parentSessionPath,
  }
}

function handleSessionEvent(sessionId: string, event: AgentSessionEvent): void {
  switch (event.type) {
    case 'agent_start':
      broadcastAgentEvent(sessionId, { type: 'agent_start' })
      break
    case 'message_update':
      if (event.assistantMessageEvent.type === 'text_delta') {
        broadcastAgentEvent(sessionId, {
          type: 'assistant_delta',
          delta: event.assistantMessageEvent.delta,
        })
      }
      break
    case 'message_end':
      if (event.message.role === 'assistant') {
        broadcastAgentEvent(sessionId, { type: 'assistant_message_end' })
      }
      break
    case 'tool_execution_start':
      broadcastAgentEvent(sessionId, {
        type: 'tool_start',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
      })
      break
    case 'tool_execution_update':
      broadcastAgentEvent(sessionId, {
        type: 'tool_update',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        partialResult: event.partialResult,
      })
      break
    case 'tool_execution_end':
      broadcastAgentEvent(sessionId, {
        type: 'tool_end',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: event.result,
        isError: event.isError,
      })
      break
    case 'agent_end':
      broadcastAgentEvent(sessionId, { type: 'agent_end' })
      break
  }
}

export async function createWebSession(cwd = DEFAULT_CWD): Promise<WebSessionInfo> {
  const sessionManager = SessionManager.create(cwd)
  const { session } = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    model: getDefaultModel(),
    sessionManager,
    tools: DEFAULT_TOOLS,
  })
  const sessionId = session.sessionId
  const unsubscribe = session.subscribe((event) => handleSessionEvent(sessionId, event))
  sessions.set(sessionId, { session, unsubscribe, cwd })
  return {
    id: sessionId,
    cwd,
    sessionFile: session.sessionFile,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    firstMessage: '',
    messageCount: 0,
    name: session.sessionName,
  }
}

export async function openWebSession(sessionFile: string): Promise<WebSessionInfo> {
  const sessionManager = SessionManager.open(sessionFile)
  const cwd = sessionManager.getCwd() || DEFAULT_CWD
  const { session } = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    model: getDefaultModel(),
    sessionManager,
    tools: DEFAULT_TOOLS,
  })
  const sessionId = session.sessionId
  const unsubscribe = session.subscribe((event) => handleSessionEvent(sessionId, event))
  sessions.set(sessionId, { session, unsubscribe, cwd })
  return {
    id: sessionId,
    cwd,
    sessionFile: session.sessionFile,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    firstMessage: '',
    messageCount: session.messages.length,
    name: session.sessionName,
  }
}

export function getWebSession(sessionId: string): ManagedSession | undefined {
  return sessions.get(sessionId)
}

export async function sendPrompt(sessionId: string, message: string, images?: ApiImagePayload[]): Promise<void> {
  const managed = sessions.get(sessionId)
  if (!managed) throw new Error(`Session not found: ${sessionId}`)
  const sdkImages = toSdkImages(images)
  await managed.session.prompt(message, sdkImages ? { images: sdkImages } : undefined)
}

export async function abortSession(sessionId: string): Promise<void> {
  const managed = sessions.get(sessionId)
  if (!managed) throw new Error(`Session not found: ${sessionId}`)
  await managed.session.abort()
}

export async function listSessions(cwd = DEFAULT_CWD): Promise<WebSessionInfo[]> {
  const infos = await SessionManager.list(cwd)
  return infos.map(toWebSessionInfo)
}

export function getMessages(sessionId: string): WebMessage[] {
  const managed = sessions.get(sessionId)
  if (!managed) return []
  return managed.session.messages
    .map((message, index) => toWebMessage(message, index))
    .filter((message): message is WebMessage => message !== null)
}

export function listTools(sessionId: string): Array<{ name: string; description: string; active: boolean }> {
  const managed = sessions.get(sessionId)
  if (!managed) throw new Error(`Session not found: ${sessionId}`)
  const active = new Set(managed.session.getActiveToolNames())
  return managed.session.getAllTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    active: active.has(tool.name),
  }))
}

export function setTools(sessionId: string, toolNames: string[]): void {
  const managed = sessions.get(sessionId)
  if (!managed) throw new Error(`Session not found: ${sessionId}`)
  managed.session.setActiveToolsByName(toolNames)
}

export async function listSkills(cwd = DEFAULT_CWD): Promise<SkillInfo[]> {
  const agentDir = getAgentDir()
  const settingsManager = SettingsManager.create(cwd, agentDir)
  const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager })
  await loader.reload()
  const { skills } = loader.getSkills()
  return skills.map((skill) => ({
    name: skill.name,
    description: skill.description,
    source: skill.sourceInfo.scope ?? skill.sourceInfo.source ?? skill.filePath,
    enabled: !skill.disableModelInvocation,
  }))
}

export function disposeAllSessions(): void {
  for (const managed of sessions.values()) {
    managed.unsubscribe()
    managed.session.dispose()
  }
  sessions.clear()
}
