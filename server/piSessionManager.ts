import {
  AuthStorage,
  createAgentSession,
  createBashTool,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type BashOperations,
  type ExtensionAPI,
  type SessionInfo as PiSessionInfo,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent'
import { broadcastAgentEvent } from './sse.ts'
import { toSdkImages } from './image.ts'
import type { ApiImagePayload, ArtifactInfo, SkillInfo, WebSessionInfo } from './types.ts'
import { listArtifacts, removeSessionArtifacts, restoreFromDisk, saveToDisk, scanArtifacts } from './artifactManager.ts'
import { allGlobalSkillPaths, ensureOfficeSkillsInstalled, globalSkillsDir } from './skillsManager.ts'
import { buildUploadContext, saveUploads } from './uploadManager.ts'
import { unlink } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { assertUserProjectPath, userHomePath } from './pathGuards.ts'
import { getSessionTitleMeta, markUserTitle } from './sessionTitleManager.ts'
import {
  registerSessionPermissions,
  removeSessionPermissions,
} from './permissionManager.ts'

const DEFAULT_TOOLS = ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write']
const DEFAULT_PROVIDER = process.env.PI_PROVIDER ?? 'deepseek'
const DEFAULT_MODEL_ID = process.env.PI_MODEL ?? 'deepseek-v4-pro'

const isWindows = process.platform === 'win32'

function createWindowsBashOperations(): BashOperations {
  return {
    exec: async (command, cwd, { onData, signal, timeout, env }) => {
      const { spawn } = await import('child_process')
      const { constants } = await import('fs')
      const { access } = await import('fs/promises')
      try { await access(cwd, constants.F_OK) } catch { throw new Error(`Working directory does not exist: ${cwd}`) }
      if (signal?.aborted) throw new Error('aborted')
      const child = spawn('cmd.exe', ['/c', 'chcp 65001 >nul && ' + command], {
        cwd,
        env: env ?? { ...process.env, COMSPEC: 'cmd.exe' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      })
      let timedOut = false
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined
      const onAbort = () => { if (child.pid) process.kill(child.pid) }
      try {
        if (timeout !== undefined && timeout > 0) {
          timeoutHandle = setTimeout(() => { timedOut = true; if (child.pid) process.kill(child.pid) }, timeout * 1000)
        }
        child.stdout?.on('data', (data: Buffer) => { onData(Buffer.from(data.toString('utf8'), 'utf8')) })
        child.stderr?.on('data', (data: Buffer) => { onData(Buffer.from(data.toString('utf8'), 'utf8')) })
        if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }) }
        const exitCode = await new Promise<number | null>((resolve) => { child.on('close', resolve) })
        if (timeoutHandle) clearTimeout(timeoutHandle)
        signal?.removeEventListener('abort', onAbort)
        return { exitCode: timedOut ? null : exitCode }
      } catch (err) {
        if (timeoutHandle) clearTimeout(timeoutHandle)
        signal?.removeEventListener('abort', onAbort)
        throw err
      }
    },
  }
}

function createBashToolForPlatform(cwd: string): ToolDefinition | null {
  if (!isWindows) return null
  return createBashTool(cwd, { operations: createWindowsBashOperations() }) as unknown as ToolDefinition
}

interface ManagedSession {
  session: AgentSession
  unsubscribe: () => void
  cwd: string
  suppressEvents?: boolean
  autoNaming?: boolean
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
  artifacts?: ArtifactInfo[]
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

function createSandboxGuardExtension(_root: string, _getSessionId: () => string | null) {
  return (_pi: ExtensionAPI) => {
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

function extractThinkingContent(content: unknown): string | undefined {
  if (typeof content === 'string') return undefined
  if (!Array.isArray(content)) return undefined
  for (const part of content) {
    if (!isRecord(part)) continue
    if (part.type === 'thinking' && typeof part.thinking === 'string') {
      return part.thinking
    }
  }
  return undefined
}

function extractToolCalls(content: unknown): WebToolCall[] | undefined {
  if (typeof content === 'string') return undefined
  if (!Array.isArray(content)) return undefined
  const calls: WebToolCall[] = []
  for (const part of content) {
    if (!isRecord(part)) continue
    if (part.type === 'toolCall' && typeof part.id === 'string' && typeof part.name === 'string') {
      calls.push({
        id: part.id,
        name: part.name,
        status: 'running',
        args: part.arguments,
      })
    }
  }
  return calls.length > 0 ? calls : undefined
}

function toWebMessage(message: unknown, index: number): WebMessage | null {
  if (!isRecord(message)) return null
  // Handle envelope format: { type: 'message', message: { role, content } }
  const inner = isRecord(message.message) ? message.message : message
  const role = inner.role
  if (role !== 'user' && role !== 'assistant') return null
  return {
    id: `${role}-${index}`,
    role,
    content: extractTextContent(inner.content),
    thinkingContent: extractThinkingContent(inner.content),
    toolCalls: extractToolCalls(inner.content),
  }
}

function getMessageRole(message: unknown): 'user' | 'assistant' | 'toolResult' | undefined {
  if (!isRecord(message)) return undefined
  const inner = isRecord(message.message) ? message.message : message
  const role = inner.role
  if (role === 'user' || role === 'assistant' || role === 'toolResult') return role
  return undefined
}

function findLastAssistantIndexAfter(messages: unknown[], startIndex: number): number | undefined {
  for (let i = messages.length - 1; i >= startIndex; i--) {
    if (getMessageRole(messages[i]) === 'assistant') {
      return i
    }
  }
  return undefined
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
  await ensureOfficeSkillsInstalled()
  let sessionId: string | null = null
  const resourceLoader = new DefaultResourceLoader({
    cwd: root,
    agentDir: getAgentDir(),
    settingsManager: SettingsManager.create(root, getAgentDir(), { projectTrusted: true }),
    additionalSkillPaths: allGlobalSkillPaths(),
    extensionFactories: [createSandboxGuardExtension(root, () => sessionId)],
  })
  await resourceLoader.reload()
  const customTools: ToolDefinition[] = []
  const psBash = createBashToolForPlatform(root)
  if (psBash) customTools.push(psBash)
  const { session } = await createAgentSession({
    cwd: root,
    authStorage,
    modelRegistry,
    model: getDefaultModel(),
    sessionManager,
    resourceLoader,
    tools: DEFAULT_TOOLS,
    customTools: customTools.length > 0 ? customTools : undefined,
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
  await ensureOfficeSkillsInstalled()
  let sessionId: string | null = null
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    settingsManager: SettingsManager.create(cwd, getAgentDir(), { projectTrusted: true }),
    additionalSkillPaths: allGlobalSkillPaths(),
    extensionFactories: [createSandboxGuardExtension(cwd, () => sessionId)],
  })
  await resourceLoader.reload()
  const customTools: ToolDefinition[] = []
  const psBash = createBashToolForPlatform(cwd)
  if (psBash) customTools.push(psBash)
  const { session } = await createAgentSession({
    cwd,
    authStorage,
    modelRegistry,
    model: getDefaultModel(),
    sessionManager,
    resourceLoader,
    tools: DEFAULT_TOOLS,
    customTools: customTools.length > 0 ? customTools : undefined,
  })
  sessionId = session.sessionId
  registerSessionPermissions(sessionId, cwd)
  const unsubscribe = session.subscribe((event) => handleSessionEvent(sessionId, event))
  sessions.set(sessionId, { session, unsubscribe, cwd })
  if (session.sessionFile) {
    await restoreFromDisk(sessionId, session.sessionFile)
  }
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

// Disabled: using the same SDK session for auto-naming pollutes the chat history
// with the title-generation prompt and its response, which then appear on reload.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function autoNameSessionIfNeeded(_sessionId: string, _firstUserMessage: string): Promise<void> {
  return
}

export async function sendPrompt(sessionId: string, message: string, images?: ApiImagePayload[]): Promise<void> {
  const managed = sessions.get(sessionId)
  if (!managed) throw new Error(`Session not found: ${sessionId}`)
  const shouldAutoName = managed.session.messages.length === 0
  const startedAt = Date.now()
  const beforeMessageCount = managed.session.messages.length
  const savedUploads = await saveUploads(managed.cwd, sessionId, images)
  const sdkImages = toSdkImages(images)
  const promptMessage = `${message}${buildUploadContext(savedUploads)}`
  await managed.session.prompt(promptMessage, sdkImages ? { images: sdkImages } : undefined)
  const targetAssistantIndex = findLastAssistantIndexAfter(managed.session.messages, beforeMessageCount)
  const artifacts = await scanArtifacts(sessionId, managed.cwd, startedAt, targetAssistantIndex)
  for (const artifact of artifacts) {
    broadcastAgentEvent(sessionId, { type: 'artifact_created', artifact })
  }
  if (managed.session.sessionFile) {
    await saveToDisk(sessionId, managed.session.sessionFile)
  }
  if (shouldAutoName) {
    autoNameSessionIfNeeded(sessionId, message).catch(() => {})
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
      await removeSessionArtifacts(entry[0], managed.session.sessionFile)
    }
  }
  await unlink(resolvedPath)
}

export function getMessages(sessionId: string): WebMessage[] {
  const managed = sessions.get(sessionId)
  if (!managed) return []
  const rawMessages = managed.session.messages
  const result: WebMessage[] = []
  const toolResults = new Map<string, { result?: unknown; isError?: boolean }>()

  // First pass: collect toolResults and build WebMessages
  for (let i = 0; i < rawMessages.length; i++) {
    const raw = rawMessages[i]
    if (!isRecord(raw)) continue
    // Handle envelope format: { type: 'message', message: { role, ... } }
    const inner = isRecord(raw.message) ? raw.message : raw
    const role = inner.role
    if (role === 'toolResult') {
      const toolCallId = typeof inner.toolCallId === 'string' ? inner.toolCallId : undefined
      if (toolCallId) {
        toolResults.set(toolCallId, {
          result: extractTextContent(inner.content),
          isError: inner.isError === true,
        })
      }
      continue
    }
    const webMsg = toWebMessage(raw, i)
    if (webMsg) result.push(webMsg)
  }

  // Second pass: merge toolResults into assistant messages' toolCalls
  for (const msg of result) {
    if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
      for (const tc of msg.toolCalls) {
        const tr = toolResults.get(tc.id)
        if (tr) {
          tc.status = tr.isError ? 'error' : 'done'
          tc.result = tr.result
        }
      }
    }
  }

  // Attach artifacts to their corresponding assistant messages
  attachArtifactsToMessages(result, listArtifacts(sessionId))

  return result
}

function attachArtifactsToMessages(messages: WebMessage[], artifacts: ArtifactInfo[]) {
  if (artifacts.length === 0) return

  const assistantIndices: number[] = []
  messages.forEach((msg, idx) => {
    if (msg.role === 'assistant') assistantIndices.push(idx)
  })

  const unmatched: ArtifactInfo[] = []

  for (const artifact of artifacts) {
    // Priority 1: exact messageIndex match
    if (typeof artifact.messageIndex === 'number' && messages[artifact.messageIndex]?.role === 'assistant') {
      const msg = messages[artifact.messageIndex]
      msg.artifacts = [...(msg.artifacts ?? []), artifact]
      continue
    }

    // Priority 2: content/name matching for legacy artifacts
    const matchedByContent = findArtifactMessageByContent(messages, artifact)
    if (matchedByContent != null) {
      const msg = messages[matchedByContent]
      if (!(msg.artifacts ?? []).some((a) => a.id === artifact.id)) {
        msg.artifacts = [...(msg.artifacts ?? []), artifact]
      }
      continue
    }

    unmatched.push(artifact)
  }

  // Priority 3: assign remaining artifacts to document-task assistants in order
  const documentTaskIndices = assistantIndices.filter((idx) => {
    const prevUser = messages[idx - 1]
    if (prevUser?.role !== 'user') return false
    const text = (prevUser.content ?? '').toLowerCase()
    return text.includes('word') || text.includes('docx') || text.includes('文档') || text.includes('ppt') || text.includes('xlsx') || text.includes('pdf') || text.includes('生成') || text.includes('写')
  })

  let docTaskPtr = 0
  for (const artifact of unmatched) {
    if (docTaskPtr < documentTaskIndices.length) {
      const idx = documentTaskIndices[docTaskPtr]
      const msg = messages[idx]
      if (!(msg.artifacts ?? []).some((a) => a.id === artifact.id)) {
        msg.artifacts = [...(msg.artifacts ?? []), artifact]
      }
      docTaskPtr++
    } else {
      // Fallback: attach to the last assistant message
      const lastAssistant = [...assistantIndices].reverse()[0]
      if (lastAssistant != null) {
        const msg = messages[lastAssistant]
        if (!(msg.artifacts ?? []).some((a) => a.id === artifact.id)) {
          msg.artifacts = [...(msg.artifacts ?? []), artifact]
        }
      }
    }
  }
}

function findArtifactMessageByContent(messages: WebMessage[], artifact: ArtifactInfo): number | undefined {
  const fileName = basename(artifact.path).toLowerCase()
  const lowerName = artifact.name.toLowerCase()
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'assistant') continue
    const text = (msg.content ?? '').toLowerCase()
    if (text.includes(fileName) || text.includes(lowerName)) {
      return i
    }
  }
  return undefined
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
  const root = cwd?.trim() ? assertUserProjectPath(cwd) : userHomePath()
  await ensureOfficeSkillsInstalled()
  const agentDir = getAgentDir()
  const settingsManager = SettingsManager.create(root, agentDir)
  const loader = new DefaultResourceLoader({ cwd: root, agentDir, settingsManager, additionalSkillPaths: allGlobalSkillPaths() })
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

export async function disposeAllSessions(): Promise<void> {
  for (const [sessionId, managed] of sessions.entries()) {
    managed.unsubscribe()
    managed.session.dispose()
    removeSessionPermissions(sessionId)
    await removeSessionArtifacts(sessionId, managed.session.sessionFile)
  }
  sessions.clear()
}
