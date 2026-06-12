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
  type ExtensionAPI,
  type SessionInfo as PiSessionInfo,
} from '@earendil-works/pi-coding-agent'
import { broadcastAgentEvent } from './sse.ts'
import { toSdkImages } from './image.ts'
import type { ApiImagePayload, SkillInfo, WebSessionInfo } from './types.ts'
import { removeSessionArtifacts, scanArtifacts } from './artifactManager.ts'
import { ensureGlobalSkillsDir, globalSkillsDir } from './skillsManager.ts'
import { unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { assertUserProjectPath } from './pathGuards.ts'
import { getSessionTitleMeta, markAiTitleGenerated, markUserTitle } from './sessionTitleManager.ts'
import {
  isCommandAllowed,
  isPathAllowed,
  registerSessionPermissions,
  removeSessionPermissions,
  requestCommandPermission,
  requestPathPermission,
  resolveForSession,
} from './permissionManager.ts'

const DEFAULT_TOOLS = ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write']
const DEFAULT_PROVIDER = process.env.PI_PROVIDER ?? 'deepseek'
const DEFAULT_MODEL_ID = process.env.PI_MODEL ?? 'deepseek-v4-pro'

interface ManagedSession {
  session: AgentSession
  unsubscribe: () => void
  cwd: string
  suppressEvents?: boolean
  autoNaming?: boolean
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

function requireCwd(cwd?: string): string {
  return assertUserProjectPath(cwd)
}

function createSandboxGuardExtension(root: string, getSessionId: () => string | null) {
  return (pi: ExtensionAPI) => {
    pi.on('tool_call', (event) => {
      const sessionId = getSessionId()
      if (!sessionId) return { block: true, reason: '会话尚未初始化' }

      const input = event.input as Record<string, unknown>
      const toolName = event.toolName
      const pathValue = typeof input.path === 'string' ? input.path : undefined

      if (toolName === 'bash') {
        const command = typeof input.command === 'string' ? input.command : ''
        if (!isCommandAllowed(sessionId, root, command)) {
          return { block: true, reason: requestCommandPermission(sessionId, root, toolName, command) }
        }
        return undefined
      }

      if (toolName === 'read' || toolName === 'grep' || toolName === 'find' || toolName === 'ls' || toolName === 'write' || toolName === 'edit') {
        const targetPath = resolveForSession(root, pathValue)
        if (!isPathAllowed(sessionId, root, targetPath)) {
          const operation = toolName === 'write' || toolName === 'edit' ? 'write'
            : toolName === 'grep' || toolName === 'find' ? 'search'
              : toolName === 'ls' ? 'list'
                : 'read'
          return { block: true, reason: requestPathPermission(sessionId, root, toolName, operation, targetPath) }
        }
      }

      return undefined
    })
  }
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
  const meta = getSessionTitleMeta(info.path)
  return {
    id: info.id,
    cwd: info.cwd,
    sessionFile: info.path,
    created: info.created.toISOString(),
    modified: info.modified.toISOString(),
    firstMessage: info.firstMessage,
    messageCount: info.messageCount,
    name: info.name,
    titleSource: meta?.titleSource,
    aiTitleGenerated: meta?.aiTitleGenerated ?? false,
    parentSessionId: info.parentSessionPath,
  }
}

function handleSessionEvent(sessionId: string, event: AgentSessionEvent): void {
  if (sessions.get(sessionId)?.suppressEvents) return
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
      } else if (event.assistantMessageEvent.type === 'thinking_delta') {
        broadcastAgentEvent(sessionId, {
          type: 'thinking_delta',
          delta: event.assistantMessageEvent.delta,
        })
      } else if (event.assistantMessageEvent.type === 'thinking_start') {
        broadcastAgentEvent(sessionId, { type: 'thinking_start' })
      } else if (event.assistantMessageEvent.type === 'thinking_end') {
        broadcastAgentEvent(sessionId, {
          type: 'thinking_end',
          content: event.assistantMessageEvent.content,
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

export async function createWebSession(cwd?: string): Promise<WebSessionInfo> {
  const root = requireCwd(cwd)
  const sessionManager = SessionManager.create(root)
  await ensureGlobalSkillsDir()
  let sessionId: string | null = null
  const resourceLoader = new DefaultResourceLoader({
    cwd: root,
    agentDir: getAgentDir(),
    settingsManager: SettingsManager.create(root, getAgentDir()),
    additionalSkillPaths: [globalSkillsDir()],
    extensionFactories: [createSandboxGuardExtension(root, () => sessionId)],
  })
  await resourceLoader.reload()
  const { session } = await createAgentSession({
    cwd: root,
    authStorage,
    modelRegistry,
    model: getDefaultModel(),
    sessionManager,
    resourceLoader,
    tools: DEFAULT_TOOLS,
  })
  sessionId = session.sessionId
  registerSessionPermissions(sessionId, root)
  const unsubscribe = session.subscribe((event) => handleSessionEvent(sessionId, event))
  sessions.set(sessionId, { session, unsubscribe, cwd: root })
  return {
    id: sessionId,
    cwd: root,
    sessionFile: session.sessionFile,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    firstMessage: '',
    messageCount: 0,
    name: session.sessionName,
    aiTitleGenerated: false,
  }
}

export async function openWebSession(sessionFile: string): Promise<WebSessionInfo> {
  const sessionManager = SessionManager.open(sessionFile)
  const cwd = requireCwd(sessionManager.getCwd() ?? undefined)
  await ensureGlobalSkillsDir()
  let sessionId: string | null = null
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    settingsManager: SettingsManager.create(cwd, getAgentDir()),
    additionalSkillPaths: [globalSkillsDir()],
    extensionFactories: [createSandboxGuardExtension(cwd, () => sessionId)],
  })
  await resourceLoader.reload()
  const { session } = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    model: getDefaultModel(),
    sessionManager,
    resourceLoader,
    tools: DEFAULT_TOOLS,
  })
  sessionId = session.sessionId
  registerSessionPermissions(sessionId, cwd)
  const unsubscribe = session.subscribe((event) => handleSessionEvent(sessionId, event))
  sessions.set(sessionId, { session, unsubscribe, cwd })
  const meta = getSessionTitleMeta(session.sessionFile)
  return {
    id: sessionId,
    cwd,
    sessionFile: session.sessionFile,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    firstMessage: '',
    messageCount: session.messages.length,
    name: session.sessionName,
    titleSource: meta?.titleSource,
    aiTitleGenerated: meta?.aiTitleGenerated ?? false,
  }
}

export function getWebSession(sessionId: string): ManagedSession | undefined {
  return sessions.get(sessionId)
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/^#+\s*/, '')
    .replace(/["'“”‘’]/g, '')
    .split(/\r?\n/)[0]
    .trim()
    .slice(0, 30)
}

async function autoNameSessionIfNeeded(sessionId: string, firstUserMessage: string): Promise<void> {
  const managed = sessions.get(sessionId)
  const sessionFile = managed?.session.sessionFile
  if (!managed || !sessionFile || managed.autoNaming) return
  const meta = getSessionTitleMeta(sessionFile)
  if (meta?.titleSource === 'user' || meta?.aiTitleGenerated) return

  managed.autoNaming = true
  managed.suppressEvents = true
  try {
    await managed.session.prompt(`请根据用户的第一条消息，为这个会话生成一个简短标题。\n要求：只输出标题，不要解释；中文优先；不超过12个汉字或30个英文字符。\n\n用户第一条消息：${firstUserMessage}`)
    const lastAssistant = [...managed.session.messages].reverse().find((msg) => isRecord(msg) && msg.role === 'assistant')
    const title = cleanTitle(isRecord(lastAssistant) ? extractTextContent(lastAssistant.content) : '')
    if (!title) return
    managed.session.setSessionName(title)
    const titleMeta = markAiTitleGenerated(sessionFile)
    broadcastAgentEvent(sessionId, {
      type: 'session_renamed',
      sessionId,
      name: title,
      titleSource: 'ai',
      aiTitleGenerated: titleMeta.aiTitleGenerated,
    })
  } finally {
    managed.suppressEvents = false
    managed.autoNaming = false
  }
}

export async function sendPrompt(sessionId: string, message: string, images?: ApiImagePayload[]): Promise<void> {
  const managed = sessions.get(sessionId)
  if (!managed) throw new Error(`Session not found: ${sessionId}`)
  const shouldAutoName = managed.session.messages.length === 0
  const startedAt = Date.now()
  const sdkImages = toSdkImages(images)
  await managed.session.prompt(message, sdkImages ? { images: sdkImages } : undefined)
  const artifacts = await scanArtifacts(sessionId, managed.cwd, startedAt)
  for (const artifact of artifacts) {
    broadcastAgentEvent(sessionId, { type: 'artifact_created', artifact })
  }
  if (shouldAutoName) {
    await autoNameSessionIfNeeded(sessionId, message)
  }
}

export async function abortSession(sessionId: string): Promise<void> {
  const managed = sessions.get(sessionId)
  if (!managed) throw new Error(`Session not found: ${sessionId}`)
  await managed.session.abort()
}

export async function listSessions(cwd?: string): Promise<WebSessionInfo[]> {
  if (!cwd?.trim()) return []
  const infos = await SessionManager.list(assertUserProjectPath(cwd))
  return infos.map(toWebSessionInfo)
}

export async function deleteSession(sessionFile: string): Promise<void> {
  const resolvedPath = resolve(sessionFile)
  const sessionsDir = resolve(getAgentDir(), 'sessions')
  if (!resolvedPath.startsWith(sessionsDir)) {
    throw new Error('Invalid session file path')
  }
  const managed = [...sessions.values()].find(m => m.session.sessionFile === sessionFile)
  if (managed) {
    managed.unsubscribe()
    managed.session.dispose()
    const entry = [...sessions.entries()].find(([, m]) => m === managed)
    if (entry) {
      sessions.delete(entry[0])
        removeSessionPermissions(entry[0])
        removeSessionArtifacts(entry[0])
    }
  }
  await unlink(resolvedPath)
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

export function renameSession(sessionId: string, name: string): WebSessionInfo {
  const managed = sessions.get(sessionId)
  if (!managed) throw new Error(`Session not found: ${sessionId}`)
  const nextName = name.trim()
  if (!nextName) throw new Error('会话名称不能为空')
  managed.session.setSessionName(nextName)
  const sessionFile = managed.session.sessionFile
  const meta = sessionFile ? markUserTitle(sessionFile) : undefined
  broadcastAgentEvent(sessionId, {
    type: 'session_renamed',
    sessionId,
    name: nextName,
    titleSource: 'user',
    aiTitleGenerated: meta?.aiTitleGenerated ?? true,
  })
  return {
    id: sessionId,
    cwd: managed.cwd,
    sessionFile,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    firstMessage: '',
    messageCount: managed.session.messages.length,
    name: nextName,
    titleSource: 'user',
    aiTitleGenerated: meta?.aiTitleGenerated ?? true,
  }
}

export async function listSkills(cwd?: string): Promise<SkillInfo[]> {
  if (!cwd?.trim()) return []
  const root = assertUserProjectPath(cwd)
  await ensureGlobalSkillsDir()
  const agentDir = getAgentDir()
  const settingsManager = SettingsManager.create(root, agentDir)
  const loader = new DefaultResourceLoader({ cwd: root, agentDir, settingsManager, additionalSkillPaths: [globalSkillsDir()] })
  await loader.reload()
  const { skills } = loader.getSkills()
  const globalRoot = globalSkillsDir().replace(/[/\\]+/g, '\\').toLowerCase()
  return skills.map((skill) => {
    const filePath = skill.filePath.replace(/[/\\]+/g, '\\').toLowerCase()
    return {
      name: skill.name,
      description: skill.description,
      source: filePath.startsWith(globalRoot) ? 'global' : (skill.sourceInfo.scope ?? skill.sourceInfo.source ?? skill.filePath),
      enabled: !skill.disableModelInvocation,
    }
  })
}

export function disposeAllSessions(): void {
  for (const [sessionId, managed] of sessions.entries()) {
    managed.unsubscribe()
    managed.session.dispose()
    removeSessionPermissions(sessionId)
    removeSessionArtifacts(sessionId)
  }
  sessions.clear()
}
