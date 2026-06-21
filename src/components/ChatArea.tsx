import { useState, useRef, useEffect, useCallback } from 'react'
import type { SessionInfo, Message, MessageAttachment, LocalAttachment, AgentStep, ArtifactInfo } from '../mockData'

type ChatSessionState = {
  messages: Message[]
  hasMessages: boolean
  streaming: boolean
  error: string | null
  pendingPermissions: import('../lib/piApi').PermissionRequestInfo[]
  pendingQuestions: import('../lib/piApi').QuestionInfo[]
  sdkSessionId: string | null
  sdkSessionInfo: SessionInfo | null
  eventSource: EventSource | null
  eventReadySessionId: string | null
  eventReadyResolve: (() => void) | null
  eventReadyTimeout: ReturnType<typeof setTimeout> | null
  currentAssistantId: string | null
  currentThinking: string
  currentThinkingStart: number
  currentThinkingStepId: string | null
  pendingToolUpdate: { toolCallId: string; partialResult: unknown } | null
  toolUpdateTimer: ReturnType<typeof setTimeout> | null
  pendingTextDelta: string
  textDeltaTimer: ReturnType<typeof setTimeout> | null
  pendingThinkingDelta: string
  thinkingDeltaTimer: ReturnType<typeof setTimeout> | null
  skillParser: SkillStreamParser | null
  pendingSkillFreeText: string
  normalizeSessionId: string | null
  toolPermissionMap: Map<string, import('../lib/piApi').PermissionRequestInfo>
  allowedSessionPermissions: Map<string, Set<string>>
  scannedForArtifacts: Map<string, number>
  fallbackScanTimer: ReturnType<typeof setTimeout> | null
  /** 该会话是否已完成首次历史消息加载 */
  loaded?: boolean
}
import { MessageView } from './MessageView'
import { MessageErrorBoundary } from './MessageErrorBoundary'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { Typewriter } from './Typewriter'
import { ReasoningBlock } from './ReasoningBlock'

import { PermissionDialog } from './PermissionDialog'
import { QuestionDialog } from './QuestionDialog'
import { XiaojinLogo } from './XiaojinLogo'

import {
  connectSessionEvents,
  createSession,
  getMessages,
  sendPrompt,
  abortSession,
  resolvePermission,
  answerQuestion,
  rejectQuestion,
  type WebAgentEvent,
  type PermissionRequestInfo,
  type QuestionInfo,
  type ModelProviderInfo,
  type ConfigInfo,
  type ApiImagePayload,
} from '../lib/piApi'
import { detectLocalArtifacts } from '../lib/artifactDetector'
import { getDesktopBridge, isDesktop } from '../lib/desktopBridge'
import { createSkillStreamParser, extractSkillBlocks, type SkillStreamParser } from '../lib/skillContentParser'

interface Props {
  session: SessionInfo | null
  selectedCwd: string | null
  newSessionCwd: string | null
  chatInputRef: React.RefObject<ChatInputHandle | null>
  onSessionCreated?: (session: SessionInfo) => void
  modelProviders: ModelProviderInfo[]
  config: ConfigInfo | null
  onSwitchModel: (sessionId: string, provider: string, modelId: string) => void
  /** YOLO mode: 收到 permission_requested 时自动允许，不弹窗 */
  autoApproveAllTools?: boolean
}

const APP_INSTITUTION = (import.meta.env.VITE_APP_INSTITUTION as string | undefined) ?? `v${__APP_VERSION__}`

function mergeConsecutiveAssistantMessages(messages: Message[]): Message[] {
  const merged: Message[] = []
  for (const msg of messages) {
    if (msg.role === 'assistant' && merged.length > 0) {
      const prev = merged[merged.length - 1]
      if (prev.role === 'assistant') {
        merged[merged.length - 1] = {
          ...prev,
          content: [prev.content, msg.content].filter(Boolean).join('\n'),
          steps: [...(prev.steps ?? []), ...(msg.steps ?? [])],
          artifacts: [...(prev.artifacts ?? []), ...(msg.artifacts ?? [])],
          pendingTask: msg.pendingTask ?? prev.pendingTask,
        }
        continue
      }
    }
    merged.push({ ...msg })
  }
  return merged
}

function convertWebMessagesToUi(loadedMessages: import('../lib/piApi').WebMessage[]): Message[] {
  return loadedMessages.map((msg) => {
    const steps: AgentStep[] = []
    if (msg.thinkingContent) {
      steps.push({
        type: 'thinking',
        id: `think-${msg.id}`,
        content: msg.thinkingContent,
        durationMs: msg.thinkingDurationMs ?? 0,
        isThinking: false,
      })
    }
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        steps.push({
          type: 'tool',
          id: tc.id,
          name: tc.name,
          status: tc.status,
          args: tc.args,
          result: tc.result,
        })
      }
    }
    return {
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
      timestamp: msg.timestamp,
      steps,
      artifacts: msg.artifacts,
      // user 消息从 stripSystemPrompt 区块重建出来的附件（让刷新/切回会话后仍能显示文件卡片）
      attachments: msg.attachments,
    }
  })
}

function normalizeLoadedMessages(loadedMessages: import('../lib/piApi').WebMessage[]): Message[] {
  return mergeConsecutiveAssistantMessages(convertWebMessagesToUi(loadedMessages))
}

function formatPendingElapsed(ms: number) {
  if (ms <= 0) return ''
  if (ms < 1000) return `${ms}毫秒`
  if (ms < 60000) return `${Math.round(ms / 1000)}秒`
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分钟`
}

function PendingTaskCard({ task }: { task?: 'word' | 'default' }) {
  const [elapsedMs, setElapsedMs] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    startRef.current = Date.now()
    setElapsedMs(0)
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startRef.current)
    }, 1000)
    return () => clearInterval(timer)
  }, [task])

  const label = task === 'word' ? '正在生成 Word 文档' : '正在处理'
  const timeText = formatPendingElapsed(elapsedMs)

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 12px', borderRadius: 'var(--radius-lg)',
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      color: 'var(--text-muted)', fontSize: 'var(--font-sm)',
      marginBottom: 8,
    }}>
      <span style={{
        width: 12, height: 12, borderRadius: '50%',
        border: '1.5px solid var(--accent)',
        borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite',
        display: 'inline-block', flexShrink: 0,
      }} />
      <span>{timeText ? `${label} · 已耗时 ${timeText}` : label}</span>
    </div>
  )
}

const TYPEWRITER_PHRASES = [
  '准备好了吗？',
  '有什么想问的？',
  '一起来做点酷的事。',
  '探索你的代码库。',
  '起草一份教案。',
  '总结这篇论文。',
  '规划你的课程。',
  '用简单的话解释一下。',
  '和我结对编程。',
  '修复那个烦人的 bug。',
  '翻译成中文。',
  '写一首俳句。',
  '头脑风暴一下。',
  '帮我审查代码。',
  '发布上线！',
  '让它更好看。',
  '和我一起理清思路。',
]

function toMessageAttachments(attachments: LocalAttachment[] | undefined): MessageAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined
  return attachments.map((att) => ({
    id: att.id,
    name: att.name,
    url: att.url,
    type: att.file.type.startsWith('image/') ? 'image'
      : att.name.toLowerCase().endsWith('.pdf') ? 'pdf'
        : /\.(doc|docx)$/i.test(att.name) ? 'document'
          : /\.(ppt|pptx)$/i.test(att.name) ? 'presentation'
            : /\.(xls|xlsx|csv)$/i.test(att.name) ? 'spreadsheet'
              : /\.(txt|md)$/i.test(att.name) ? 'text'
                : 'file',
    mimeType: att.file.type,
    size: att.file.size,
  }))
}

export function ChatArea({ session, selectedCwd, newSessionCwd, chatInputRef, onSessionCreated, modelProviders, config, onSwitchModel, autoApproveAllTools = false }: Props) {
  const [messages, _setMessages] = useState<Message[]>([])
  const [hasMessages, setHasMessages] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequestInfo[]>([])
  const [pendingQuestions, setPendingQuestions] = useState<QuestionInfo[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sdkSessionIdRef = useRef<string | null>(null)
  const sdkSessionInfoRef = useRef<SessionInfo | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const eventReadySessionIdRef = useRef<string | null>(null)
  const eventReadyResolveRef = useRef<(() => void) | null>(null)
  // 当前 UI 正在显示的会话 id；SSE 事件按来源会话过滤，保证切会话时后台任务不污染当前显示
  const activeSessionIdRef = useRef<string | null>(null)
  const eventSourceSessionMapRef = useRef<Map<EventSource, string>>(new Map())
  const staleEventSourcesRef = useRef<Array<{ es: EventSource; sessionId: string; closeTimer: ReturnType<typeof setTimeout> }>>([])
  const currentAssistantIdRef = useRef<string | null>(null)
  const currentThinkingRef = useRef<string>('')
  const currentThinkingStartRef = useRef<number>(0)
  const currentThinkingStepIdRef = useRef<string | null>(null)
  const pendingToolUpdateRef = useRef<{ toolCallId: string; partialResult: unknown } | null>(null)
  const toolUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 流式 delta 缓冲（修复白屏：之前每个 SSE delta 都触发一次 setState + Markdown 重渲染）
  const pendingTextDeltaRef = useRef<string>('')
  const textDeltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingThinkingDeltaRef = useRef<string>('')
  const thinkingDeltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // skill_content 流式解析器：从 assistant_delta 中识别并抽出 <skill_content>...</skill_content>
  // 块，避免它们被当作普通文本拼进 message.content。
  const skillParserRef = useRef<SkillStreamParser | null>(null)
  // 流式中临时缓存当前一段普通文本（解析器 onText 回调收集），下次 flush 时拼进
  // pendingTextDeltaRef，由原有 60ms 节流接管渲染。
  const pendingSkillFreeTextRef = useRef<string>('')
  const isUserNearBottomRef = useRef(true)
  const forceScrollRef = useRef(false)
  const normalizeSessionIdRef = useRef<string | null>(null)
  const toolPermissionMapRef = useRef<Map<string, PermissionRequestInfo>>(new Map())

  // 本会话自动允许的权限规则：{ sessionId -> { kindKey -> true } }
  const allowedSessionPermissionsRef = useRef<Map<string, Set<string>>>(new Map())

  // YOLO mode：autoApproveAllTools 的 ref 镜像（handleAgentEvent 是稳定闭包，state 拿不到最新值）
  const autoApproveAllToolsRef = useRef(autoApproveAllTools)
  // 记录已扫描过 artifact 的消息 id + content 长度，避免对同一条消息重复扫描
  const scannedForArtifactsRef = useRef<Map<string, number>>(new Map())
  // 兜底扫描 200ms debounce timer：高频 setMessages 时合并成一次扫描
  const fallbackScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 多会话运行时状态：切会话时保存/恢复，后台 SSE 保持连接继续运行
  const sessionStatesRef = useRef<Map<string, ChatSessionState>>(new Map())
  // messages 的 ref 镜像，saveSessionState 时直接读取，避免闭包 stale
  const messagesRef = useRef<Message[]>([])

  // 所有 setMessages 调用都同步更新 messagesRef，确保 saveSessionState 读取到最新值
  function setMessages(updater: React.SetStateAction<Message[]>) {
    _setMessages((prev) => {
      const next = typeof updater === 'function' ? (updater as (prev: Message[]) => Message[])(prev) : updater
      messagesRef.current = next
      return next
    })
  }

  function createDefaultSessionState(sessionId: string): ChatSessionState {
    return {
      messages: [],
      hasMessages: false,
      streaming: false,
      error: null,
      pendingPermissions: [],
      pendingQuestions: [],
      sdkSessionId: sessionId,
      sdkSessionInfo: session ?? null,
      eventSource: null,
      eventReadySessionId: null,
      eventReadyResolve: null,
      eventReadyTimeout: null,
      currentAssistantId: null,
      currentThinking: '',
      currentThinkingStart: 0,
      currentThinkingStepId: null,
      pendingToolUpdate: null,
      toolUpdateTimer: null,
      pendingTextDelta: '',
      textDeltaTimer: null,
      pendingThinkingDelta: '',
      thinkingDeltaTimer: null,
      skillParser: null,
      pendingSkillFreeText: '',
      normalizeSessionId: sessionId,
      toolPermissionMap: new Map(),
      allowedSessionPermissions: new Map(),
      scannedForArtifacts: new Map(),
      fallbackScanTimer: null,
      loaded: false,
    }
  }

  function getOrCreateSessionState(sessionId: string): ChatSessionState {
    let state = sessionStatesRef.current.get(sessionId)
    if (!state) {
      state = createDefaultSessionState(sessionId)
      sessionStatesRef.current.set(sessionId, state)
    }
    return state
  }

  function flushPendingDeltas() {
    const assistantId = currentAssistantIdRef.current
    if (textDeltaTimerRef.current) {
      clearTimeout(textDeltaTimerRef.current)
      textDeltaTimerRef.current = null
      const toFlush = pendingTextDeltaRef.current
      pendingTextDeltaRef.current = ''
      if (toFlush && assistantId) {
        messagesRef.current = messagesRef.current.map((msg) => (
          msg.id === assistantId ? { ...msg, content: msg.content + toFlush } : msg
        ))
      }
    }
    if (thinkingDeltaTimerRef.current) {
      clearTimeout(thinkingDeltaTimerRef.current)
      thinkingDeltaTimerRef.current = null
      const content = pendingThinkingDeltaRef.current
      pendingThinkingDeltaRef.current = ''
      const stepId = currentThinkingStepIdRef.current
      if (assistantId && stepId) {
        messagesRef.current = messagesRef.current.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'thinking' && s.id === stepId ? { ...s, content } : s
          )) }
        })
      }
    }
    if (toolUpdateTimerRef.current) {
      clearTimeout(toolUpdateTimerRef.current)
      toolUpdateTimerRef.current = null
      const pending = pendingToolUpdateRef.current
      pendingToolUpdateRef.current = null
      if (pending && assistantId) {
        messagesRef.current = messagesRef.current.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'tool' && s.id === pending.toolCallId ? { ...s, partialResult: pending.partialResult } : s
          )) }
        })
      }
    }
    if (skillParserRef.current) {
      skillParserRef.current.flush()
      skillParserRef.current = null
      if (pendingSkillFreeTextRef.current) {
        pendingTextDeltaRef.current += pendingSkillFreeTextRef.current
        pendingSkillFreeTextRef.current = ''
      }
      const toFlush = pendingTextDeltaRef.current
      pendingTextDeltaRef.current = ''
      if (toFlush && assistantId) {
        messagesRef.current = messagesRef.current.map((msg) => (
          msg.id === assistantId ? { ...msg, content: msg.content + toFlush } : msg
        ))
      }
    }
  }

  function saveSessionState(sessionId: string) {
    // 只有当前正在显示的会话才 flush 全局 refs 中的 pending delta；
    // 若 rapid switching 导致 cleanup 延迟，避免把当前活跃会话的缓冲刷进其他会话快照。
    if (activeSessionIdRef.current === sessionId) {
      flushPendingDeltas()
    }
    if (fallbackScanTimerRef.current) {
      clearTimeout(fallbackScanTimerRef.current)
      fallbackScanTimerRef.current = null
    }
    const state: ChatSessionState = {
      messages: messagesRef.current,
      hasMessages,
      streaming,
      error,
      pendingPermissions,
      pendingQuestions,
      sdkSessionId: sdkSessionIdRef.current,
      sdkSessionInfo: sdkSessionInfoRef.current,
      eventSource: eventSourceRef.current,
      eventReadySessionId: eventReadySessionIdRef.current,
      eventReadyResolve: eventReadyResolveRef.current,
      eventReadyTimeout: null,
      currentAssistantId: currentAssistantIdRef.current,
      currentThinking: currentThinkingRef.current,
      currentThinkingStart: currentThinkingStartRef.current,
      currentThinkingStepId: currentThinkingStepIdRef.current,
      pendingToolUpdate: pendingToolUpdateRef.current,
      toolUpdateTimer: null,
      pendingTextDelta: pendingTextDeltaRef.current,
      textDeltaTimer: null,
      pendingThinkingDelta: pendingThinkingDeltaRef.current,
      thinkingDeltaTimer: null,
      skillParser: skillParserRef.current,
      pendingSkillFreeText: pendingSkillFreeTextRef.current,
      normalizeSessionId: normalizeSessionIdRef.current,
      toolPermissionMap: new Map(toolPermissionMapRef.current),
      allowedSessionPermissions: new Map(allowedSessionPermissionsRef.current),
      scannedForArtifacts: new Map(scannedForArtifactsRef.current),
      fallbackScanTimer: null,
      loaded: true,
    }
    sessionStatesRef.current.set(sessionId, state)
  }

  async function loadSessionState(sessionId: string) {
    const saved = sessionStatesRef.current.get(sessionId)
    if (saved?.loaded) {
      if (saved.eventSource && !eventSourceSessionMapRef.current.has(saved.eventSource)) {
        saved.eventSource = null
        saved.eventReadySessionId = null
        saved.eventReadyResolve = null
      }
      // 恢复前先把后台累积的 skill/parser 缓冲 flush 进 messages，并丢弃旧的解析器
      // （它的回调闭包指向旧的 state 对象，恢复为 active 后无法正确更新 UI）
      if (saved.skillParser) {
        saved.skillParser.flush()
        saved.skillParser = null
        if (saved.pendingSkillFreeText) {
          saved.pendingTextDelta += saved.pendingSkillFreeText
          saved.pendingSkillFreeText = ''
        }
        const toFlush = saved.pendingTextDelta
        saved.pendingTextDelta = ''
        if (toFlush && saved.currentAssistantId) {
          saved.messages = saved.messages.map((msg) => (
            msg.id === saved.currentAssistantId ? { ...msg, content: msg.content + toFlush } : msg
          ))
        }
      }
      messagesRef.current = saved.messages
      _setMessages(saved.messages)
      setHasMessages(saved.hasMessages)
      setStreaming(saved.streaming)
      setError(saved.error)
      setPendingPermissions(saved.pendingPermissions)
      setPendingQuestions(saved.pendingQuestions)
      sdkSessionIdRef.current = saved.sdkSessionId
      sdkSessionInfoRef.current = saved.sdkSessionInfo
      eventSourceRef.current = saved.eventSource
      eventReadySessionIdRef.current = saved.eventReadySessionId
      eventReadyResolveRef.current = saved.eventReadyResolve
      // 不恢复旧的 eventReadyTimeout：它的 closure 引用旧的 state，恢复后无法正确清理；
      // 若连接仍未就绪，让后续 connectEvents 重新创建新的 timeout。
      currentAssistantIdRef.current = saved.currentAssistantId
      currentThinkingRef.current = saved.currentThinking
      currentThinkingStartRef.current = saved.currentThinkingStart
      currentThinkingStepIdRef.current = saved.currentThinkingStepId
      pendingToolUpdateRef.current = saved.pendingToolUpdate
      toolUpdateTimerRef.current = saved.toolUpdateTimer
      pendingTextDeltaRef.current = saved.pendingTextDelta
      textDeltaTimerRef.current = saved.textDeltaTimer
      pendingThinkingDeltaRef.current = saved.pendingThinkingDelta
      thinkingDeltaTimerRef.current = saved.thinkingDeltaTimer
      skillParserRef.current = saved.skillParser
      pendingSkillFreeTextRef.current = saved.pendingSkillFreeText
      normalizeSessionIdRef.current = saved.normalizeSessionId
      toolPermissionMapRef.current = saved.toolPermissionMap
      allowedSessionPermissionsRef.current = saved.allowedSessionPermissions
      scannedForArtifactsRef.current = saved.scannedForArtifacts
      fallbackScanTimerRef.current = saved.fallbackScanTimer
      forceScrollRef.current = true
      if (!saved.eventSource) {
        void connectEvents(sessionId)
      }
      if (autoApproveAllTools && saved.pendingPermissions.length > 0) {
        for (const req of saved.pendingPermissions) {
          const sid = req.sessionId || sdkSessionIdRef.current
          if (!sid) continue
          void resolvePermission(sid, req.permissionId, true).catch((err) => {
            console.error('[YOLO] flush restored permission failed:', err)
          })
        }
        setPendingPermissions([])
      }
      return
    }

    // 丢弃未完成的占位快照（如上次初始化被切走）
    sessionStatesRef.current.delete(sessionId)

    messagesRef.current = []
    _setMessages([])
    setHasMessages(false)
    setStreaming(false)
    setError(null)
    setPendingPermissions([])
    setPendingQuestions([])
    sdkSessionIdRef.current = sessionId
    sdkSessionInfoRef.current = session ?? null
    eventSourceRef.current = null
    eventReadySessionIdRef.current = null
    eventReadyResolveRef.current = null
    currentAssistantIdRef.current = null
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0
    currentThinkingStepIdRef.current = null
    pendingToolUpdateRef.current = null
    toolUpdateTimerRef.current = null
    pendingTextDeltaRef.current = ''
    textDeltaTimerRef.current = null
    pendingThinkingDeltaRef.current = ''
    thinkingDeltaTimerRef.current = null
    skillParserRef.current = null
    pendingSkillFreeTextRef.current = ''
    normalizeSessionIdRef.current = sessionId
    toolPermissionMapRef.current = new Map()
    allowedSessionPermissionsRef.current = new Map()
    scannedForArtifactsRef.current = new Map()
    if (fallbackScanTimerRef.current) {
      clearTimeout(fallbackScanTimerRef.current)
      fallbackScanTimerRef.current = null
    }

    try {
      await connectEvents(sessionId)
      const cwd = sdkSessionInfoRef.current?.cwd ?? session?.cwd
      const loadedMessages = await getMessages(sessionId, cwd)
      const normalized = normalizeLoadedMessages(loadedMessages)
      const state = getOrCreateSessionState(sessionId)
      state.messages = normalized
      state.hasMessages = normalized.length > 0
      state.sdkSessionId = sessionId
      state.sdkSessionInfo = sdkSessionInfoRef.current
      state.loaded = true
      if (activeSessionIdRef.current === sessionId) {
        messagesRef.current = normalized
        _setMessages(normalized)
        setHasMessages(normalized.length > 0)
        forceScrollRef.current = true
      }
    } catch (err) {
      const state = getOrCreateSessionState(sessionId)
      const message = err instanceof Error ? err.message : String(err)
      state.error = message
      if (activeSessionIdRef.current === sessionId) {
        setError(`加载会话失败：${message}`)
        setMessages([])
      }
    }
  }

  function closeAllEventSources() {
    for (const [es] of eventSourceSessionMapRef.current) {
      es.close()
    }
    eventSourceSessionMapRef.current.clear()
    eventSourceRef.current = null
    for (const entry of staleEventSourcesRef.current) {
      clearTimeout(entry.closeTimer)
      entry.es.close()
    }
    staleEventSourcesRef.current = []
    for (const state of sessionStatesRef.current.values()) {
      if (state.eventReadyTimeout) {
        clearTimeout(state.eventReadyTimeout)
        state.eventReadyTimeout = null
      }
      state.eventSource = null
      state.eventReadySessionId = null
      state.eventReadyResolve = null
    }
  }

  useEffect(() => {
    autoApproveAllToolsRef.current = autoApproveAllTools
  }, [autoApproveAllTools])

  // YOLO 开启时立刻 flush 所有 pending permissions：直接 resolve(true) 并清空队列
  // 防止开启前已有 pending dialog 在屏幕上继续渲染（可能因 diff 对象等历史 bug 崩溃）
  useEffect(() => {
    if (!autoApproveAllTools) return
    setPendingPermissions((prev) => {
      if (prev.length === 0) return prev
      for (const req of prev) {
        const sid = req.sessionId || sdkSessionIdRef.current
        if (!sid) continue
        void resolvePermission(sid, req.permissionId, true).catch((err) => {
          console.error('[YOLO] flush pending permission failed:', err)
        })
      }
      return []
    })
  }, [autoApproveAllTools])

  function getPermissionKey(kind: string, options: unknown): string {
    return `${kind}:${JSON.stringify(options ?? {})}`
  }

  function isSessionAllowed(sessionId: string, kind: string, options: unknown): boolean {
    const set = allowedSessionPermissionsRef.current.get(sessionId)
    if (!set) return false
    return set.has(getPermissionKey(kind, options))
  }

  function addSessionAllowed(sessionId: string, kind: string, options: unknown) {
    let set = allowedSessionPermissionsRef.current.get(sessionId)
    if (!set) {
      set = new Set()
      allowedSessionPermissionsRef.current.set(sessionId, set)
    }
    set.add(getPermissionKey(kind, options))
  }

  const normalizeMessagesForSession = useCallback(async (sessionId: string) => {
    if (!sessionId) return
    normalizeSessionIdRef.current = sessionId
    try {
      const cwd = sdkSessionInfoRef.current?.cwd ?? session?.cwd
      const loadedMessages = await getMessages(sessionId, cwd)
      if (normalizeSessionIdRef.current !== sessionId) return
      setMessages((currentMessages) => {
        // 保留当前 UI 中正在等待授权的 tool step 状态，避免 normalize 把它覆盖回 running
        const waitingMap = new Map<string, string>()
        for (const msg of currentMessages) {
          for (const step of msg.steps ?? []) {
            if (step.type === 'tool' && step.status === 'waiting_permission' && step.permissionId) {
              waitingMap.set(step.id, step.permissionId)
            }
          }
        }

        // 保留前端独有的字段（后端不知道，normalize 会丢）：
        // 1) 用户消息的 attachments（上传文件卡片）
        // 2) assistant 消息的 source==='local-scan' artifacts（AI 生成文件卡片）
        // 用「同 role 出现顺序」匹配（id 在 normalize 前后会变，content 也可能略有差异，
        // 但顺序最稳定）。
        const userAttachmentsByOrder: (MessageAttachment[] | undefined)[] = []
        const assistantLocalArtifactsByOrder: ArtifactInfo[][] = []
        for (const msg of currentMessages) {
          if (msg.role === 'user') {
            userAttachmentsByOrder.push(msg.attachments)
          } else if (msg.role === 'assistant') {
            const localOnes = (msg.artifacts ?? []).filter((a) => a.source === 'local-scan')
            assistantLocalArtifactsByOrder.push(localOnes)
          }
        }

        let normalized = normalizeLoadedMessages(loadedMessages)
        if (waitingMap.size > 0) {
          normalized = normalized.map((msg) => {
            if (msg.role !== 'assistant' || !msg.steps) return msg
            return {
              ...msg,
              steps: msg.steps.map((s) => {
                if (s.type === 'tool' && waitingMap.has(s.id)) {
                  return { ...s, status: 'waiting_permission' as const, permissionId: waitingMap.get(s.id) }
                }
                return s
              }),
            }
          })
        }
        // 按同 role 出现顺序回填前端独有字段
        {
          let userIdx = 0
          let assistantIdx = 0
          normalized = normalized.map((msg) => {
            if (msg.role === 'user') {
              const carry = userAttachmentsByOrder[userIdx++]
              if (carry && carry.length > 0) {
                console.info(`[normalize] carry user attachments: ${carry.length} item(s) → ${msg.id}`)
                return { ...msg, attachments: carry }
              }
              return msg
            }
            if (msg.role === 'assistant') {
              const carry = assistantLocalArtifactsByOrder[assistantIdx++]
              if (carry && carry.length > 0) {
                const existingPaths = new Set((msg.artifacts ?? []).map((a) => (a.localPath ?? a.path ?? '').toLowerCase()))
                const keep = carry.filter((a) => !existingPaths.has((a.localPath ?? a.path ?? '').toLowerCase()))
                if (keep.length > 0) {
                  console.info(`[normalize] carry assistant local-scan artifacts: ${keep.length} item(s) → ${msg.id}`)
                  return { ...msg, artifacts: [...(msg.artifacts ?? []), ...keep] }
                }
              }
              return msg
            }
            return msg
          })
        }
        return normalized
      })
      forceScrollRef.current = true
      // 历史消息加载完后，对每条 assistant 消息跑本地路径扫描，让"重新打开会话"也能看到文件卡片
      if (isDesktop) {
        const bridge = getDesktopBridge()
        if (bridge?.file?.stat) {
          void (async () => {
            try {
              let snapshot: Message[] = []
              setMessages((prev) => { snapshot = prev; return prev })
              const updates = new Map<string, ArtifactInfo[]>()
              for (const msg of snapshot) {
                if (msg.role !== 'assistant' || !msg.content) continue
                const detected = await detectLocalArtifacts(
                  msg.content,
                  sessionId,
                  msg.artifacts ?? [],
                  (p) => bridge.file.stat(p),
                )
                if (detected.length > 0) updates.set(msg.id, detected)
              }
              if (updates.size === 0) return
              if (normalizeSessionIdRef.current !== sessionId) return
              setMessages((prev) => prev.map((m) => {
                const add = updates.get(m.id)
                return add ? { ...m, artifacts: [...(m.artifacts ?? []), ...add] } : m
              }))
            } catch (err) {
              console.warn('[artifactDetector] history scan failed', err)
            }
          })()
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Normalize messages failed:', err)
      setError(`整理会话消息失败：${message}`)
    }
  }, [])

  function applyBackgroundAgentEvent(event: WebAgentEvent, sessionId: string) {
    const state = getOrCreateSessionState(sessionId)

    switch (event.type) {
      case 'connected': {
        if (state.eventReadyResolve) {
          state.eventReadyResolve()
          state.eventReadyResolve = null
        }
        state.eventReadySessionId = event.sessionId
        break
      }
      case 'agent_start': {
        state.streaming = true
        state.error = null
        state.hasMessages = true
        break
      }
      case 'thinking_start': {
        state.currentThinking = ''
        state.currentThinkingStart = Date.now()
        const assistantId = state.currentAssistantId
        if (!assistantId) break
        const stepId = 'think-' + Date.now()
        state.currentThinkingStepId = stepId
        const step: AgentStep = { type: 'thinking', id: stepId, content: '', durationMs: 0, isThinking: true }
        state.messages = state.messages.map((msg) => (
          msg.id === assistantId ? { ...msg, steps: [...(msg.steps ?? []), step] } : msg
        ))
        break
      }
      case 'thinking_delta': {
        state.currentThinking += event.delta
        const assistantId = state.currentAssistantId
        const stepId = state.currentThinkingStepId
        if (!assistantId || !stepId) return
        const content = state.currentThinking
        state.pendingThinkingDelta = ''
        state.messages = state.messages.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'thinking' && s.id === stepId ? { ...s, content } : s
          )) }
        })
        break
      }
      case 'thinking_end': {
        const content = event.content || state.currentThinking
        state.currentThinking = content
        const durationMs = Date.now() - state.currentThinkingStart
        const assistantId = state.currentAssistantId
        const stepId = state.currentThinkingStepId
        state.pendingThinkingDelta = ''
        if (assistantId && stepId) {
          state.messages = state.messages.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'thinking' && s.id === stepId ? { ...s, content, durationMs, isThinking: false } : s
            )) }
          })
        }
        state.currentThinkingStepId = null
        break
      }
      case 'assistant_delta': {
        const assistantId = state.currentAssistantId
        if (!assistantId) return
        if (!state.skillParser) {
          state.skillParser = createSkillStreamParser({
            onText: (text) => { state.pendingSkillFreeText += text },
            onSkillStart: (id, name, baseDir) => {
              const step: AgentStep = { type: 'skill_load', id, name, baseDir, content: '', isLoading: true }
              state.messages = state.messages.map((msg) => (
                msg.id === assistantId ? { ...msg, steps: [...(msg.steps ?? []), step] } : msg
              ))
            },
            onSkillDelta: (id, content) => {
              state.messages = state.messages.map((msg) => {
                if (msg.id !== assistantId || !msg.steps) return msg
                return { ...msg, steps: msg.steps.map((s) => (
                  s.type === 'skill_load' && s.id === id ? { ...s, content: s.content + content } : s
                )) }
              })
            },
            onSkillEnd: (id) => {
              state.messages = state.messages.map((msg) => {
                if (msg.id !== assistantId || !msg.steps) return msg
                return { ...msg, steps: msg.steps.map((s) => (
                  s.type === 'skill_load' && s.id === id ? { ...s, isLoading: false } : s
                )) }
              })
            },
          })
        }
        state.skillParser.push(event.delta)
        const buffered = state.pendingSkillFreeText
        state.pendingSkillFreeText = ''
        if (buffered) state.pendingTextDelta += buffered
        const toFlush = state.pendingTextDelta
        state.pendingTextDelta = ''
        if (toFlush) {
          state.messages = state.messages.map((msg) => (
            msg.id === assistantId ? { ...msg, content: msg.content + toFlush } : msg
          ))
        }
        break
      }
      case 'tool_start': {
        const assistantId = state.currentAssistantId
        if (!assistantId) break
        const step: AgentStep = { type: 'tool', id: event.toolCallId, name: event.toolName, status: 'running', args: event.args }
        state.messages = state.messages.map((msg) => (
          msg.id === assistantId ? { ...msg, steps: [...(msg.steps ?? []), step] } : msg
        ))
        break
      }
      case 'tool_update': {
        const assistantId = state.currentAssistantId
        if (!assistantId) break
        state.pendingToolUpdate = { toolCallId: event.toolCallId, partialResult: event.partialResult }
        const pending = state.pendingToolUpdate
        state.pendingToolUpdate = null
        if (pending) {
          state.messages = state.messages.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'tool' && s.id === pending.toolCallId ? { ...s, partialResult: pending.partialResult } : s
            )) }
          })
        }
        break
      }
      case 'tool_end': {
        const assistantId = state.currentAssistantId
        if (!assistantId) break
        state.messages = state.messages.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'tool' && s.id === event.toolCallId ? { ...s, status: event.isError ? 'error' : 'done', result: event.result } : s
          )) }
        })
        break
      }
      case 'artifact_created': {
        const assistantId = state.currentAssistantId
        const targetId = assistantId ?? [...state.messages].reverse().find((msg) => msg.role === 'assistant')?.id
        if (!targetId) break
        state.messages = state.messages.map((msg) => (
          msg.id === targetId ? { ...msg, artifacts: [...(msg.artifacts ?? []), event.artifact] } : msg
        ))
        break
      }
      case 'session_renamed': {
        if (state.sdkSessionInfo) {
          state.sdkSessionInfo = { ...state.sdkSessionInfo, name: event.name, titleSource: event.titleSource, aiTitleGenerated: event.aiTitleGenerated }
        }
        onSessionCreated?.({
          id: event.sessionId,
          cwd: state.sdkSessionInfo?.cwd ?? selectedCwd ?? '',
          sessionFile: state.sdkSessionInfo?.sessionFile,
          created: state.sdkSessionInfo?.created ?? new Date().toISOString(),
          modified: new Date().toISOString(),
          firstMessage: state.sdkSessionInfo?.firstMessage ?? '',
          messageCount: state.sdkSessionInfo?.messageCount ?? 0,
          name: event.name,
          titleSource: event.titleSource,
          aiTitleGenerated: event.aiTitleGenerated,
        })
        break
      }
      case 'agent_end': {
        state.streaming = false
        const finishedAssistantId = state.currentAssistantId
        state.currentAssistantId = null
        if (state.skillParser) {
          state.skillParser.flush()
          state.skillParser = null
        }
        if (state.pendingSkillFreeText) {
          state.pendingTextDelta += state.pendingSkillFreeText
          state.pendingSkillFreeText = ''
        }
        const tailText = state.pendingTextDelta
        state.pendingTextDelta = ''
        state.pendingThinkingDelta = ''
        if (tailText && finishedAssistantId) {
          state.messages = state.messages.map((msg) => (
            msg.id === finishedAssistantId ? { ...msg, content: msg.content + tailText } : msg
          ))
        }
        break
      }
      case 'error': {
        state.error = event.message
        state.streaming = false
        break
      }
    }
  }

  const handleAgentEvent = useCallback((event: WebAgentEvent & { target?: EventSource }) => {
    const sourceSessionId = event.target
      ? eventSourceSessionMapRef.current.get(event.target)
      : activeSessionIdRef.current
    if (!sourceSessionId) return
    const isActiveSession = sourceSessionId === activeSessionIdRef.current

    // 连接事件：始终处理，用于释放 connectEvents 的 ready Promise。
    if (event.type === 'connected') {
      if (eventReadyResolveRef.current && isActiveSession) {
        eventReadyResolveRef.current()
        eventReadyResolveRef.current = null
      }
      eventReadySessionIdRef.current = event.sessionId
      if (!isActiveSession) {
        const state = getOrCreateSessionState(sourceSessionId)
        if (state.eventReadyResolve) {
          state.eventReadyResolve()
          state.eventReadyResolve = null
        }
        state.eventReadySessionId = event.sessionId
      }
      return
    }

    // 非当前会话的流式/状态事件：更新该会话快照，不污染当前 UI。
    // 权限/提问弹窗需要全局处理（因为 ChatArea 常驻，弹窗不应随切会话消失）。
    const isDialogEvent = event.type === 'permission_requested' || event.type === 'permission_resolved' || event.type === 'question' || event.type === 'question_resolved'
    if (!isActiveSession && !isDialogEvent) {
      applyBackgroundAgentEvent(event, sourceSessionId)
      return
    }

    switch (event.type) {
      case 'agent_start':
        setStreaming(true)
        setError(null)
        break
      case 'thinking_start': {
        currentThinkingRef.current = ''
        currentThinkingStartRef.current = Date.now()
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) break
        const stepId = 'think-' + Date.now()
        currentThinkingStepIdRef.current = stepId
        const step: AgentStep = { type: 'thinking', id: stepId, content: '', durationMs: 0, isThinking: true }
        setMessages((prev) => prev.map((msg) => (
          msg.id === assistantId ? { ...msg, steps: [...(msg.steps ?? []), step] } : msg
        )))
        break
      }
      case 'thinking_delta': {
        currentThinkingRef.current += event.delta
        const assistantId = currentAssistantIdRef.current
        const stepId = currentThinkingStepIdRef.current
        if (!assistantId || !stepId) return
        // 节流 60ms：避免每个 SSE delta 都触发一次 React 重渲染（白屏修复的核心）
        pendingThinkingDeltaRef.current = currentThinkingRef.current
        if (thinkingDeltaTimerRef.current) break
        thinkingDeltaTimerRef.current = setTimeout(() => {
          thinkingDeltaTimerRef.current = null
          const latestContent = pendingThinkingDeltaRef.current
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'thinking' && s.id === stepId ? { ...s, content: latestContent } : s
            )) }
          }))
        }, 60)
        break
      }
      case 'thinking_end': {
        const content = event.content || currentThinkingRef.current
        currentThinkingRef.current = content
        const durationMs = Date.now() - currentThinkingStartRef.current
        const assistantId = currentAssistantIdRef.current
        const stepId = currentThinkingStepIdRef.current
        // 立刻 flush pending thinking delta（保证 thinking_end 不被节流的 setTimeout 覆盖）
        if (thinkingDeltaTimerRef.current) {
          clearTimeout(thinkingDeltaTimerRef.current)
          thinkingDeltaTimerRef.current = null
        }
        pendingThinkingDeltaRef.current = ''
        if (assistantId && stepId) {
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'thinking' && s.id === stepId ? { ...s, content, durationMs, isThinking: false } : s
            )) }
          }))
        }
        currentThinkingStepIdRef.current = null
        break
      }
      case 'assistant_delta': {
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) return

        // 懒初始化 skill 解析器
        if (!skillParserRef.current) {
          skillParserRef.current = createSkillStreamParser({
            onText: (text) => {
              pendingSkillFreeTextRef.current += text
            },
            onSkillStart: (id, name, baseDir) => {
              const step: AgentStep = {
                type: 'skill_load',
                id,
                name,
                baseDir,
                content: '',
                isLoading: true,
              }
              setMessages((prev) => prev.map((msg) => (
                msg.id === assistantId
                  ? { ...msg, steps: [...(msg.steps ?? []), step] }
                  : msg
              )))
            },
            onSkillDelta: (id, content) => {
              setMessages((prev) => prev.map((msg) => {
                if (msg.id !== assistantId || !msg.steps) return msg
                return {
                  ...msg,
                  steps: msg.steps.map((s) =>
                    s.type === 'skill_load' && s.id === id
                      ? { ...s, content: s.content + content }
                      : s,
                  ),
                }
              }))
            },
            onSkillEnd: (id) => {
              setMessages((prev) => prev.map((msg) => {
                if (msg.id !== assistantId || !msg.steps) return msg
                return {
                  ...msg,
                  steps: msg.steps.map((s) =>
                    s.type === 'skill_load' && s.id === id
                      ? { ...s, isLoading: false }
                      : s,
                  ),
                }
              }))
            },
          })
        }
        // 把原始 delta 喂给解析器；纯文本部分会累积到 pendingSkillFreeTextRef
        skillParserRef.current.push(event.delta)

        // 60ms 节流：把累积的"非 skill 文本"刷新到 message.content（保留白屏修复）
        const buffered = pendingSkillFreeTextRef.current
        pendingSkillFreeTextRef.current = ''
        if (buffered) pendingTextDeltaRef.current += buffered
        if (textDeltaTimerRef.current) break
        textDeltaTimerRef.current = setTimeout(() => {
          textDeltaTimerRef.current = null
          // 节流到期前可能又有新的 onText 回调进来，再合并一次
          const moreBuf = pendingSkillFreeTextRef.current
          pendingSkillFreeTextRef.current = ''
          if (moreBuf) pendingTextDeltaRef.current += moreBuf
          const toFlush = pendingTextDeltaRef.current
          pendingTextDeltaRef.current = ''
          if (!toFlush) return
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantId ? { ...msg, content: msg.content + toFlush } : msg
          )))
        }, 60)
        break
      }
      case 'tool_start': {
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) break
        const step: AgentStep = {
          type: 'tool',
          id: event.toolCallId,
          name: event.toolName,
          status: 'running',
          args: event.args,
        }
        setMessages((prev) => prev.map((msg) => (
          msg.id === assistantId ? { ...msg, steps: [...(msg.steps ?? []), step] } : msg
        )))
        break
      }
      case 'tool_update': {
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) break
        pendingToolUpdateRef.current = { toolCallId: event.toolCallId, partialResult: event.partialResult }
        if (toolUpdateTimerRef.current) return
        toolUpdateTimerRef.current = setTimeout(() => {
          toolUpdateTimerRef.current = null
          const pending = pendingToolUpdateRef.current
          if (!pending) return
          pendingToolUpdateRef.current = null
          setMessages((prev) => prev.map((msg) => {
            if (msg.id !== assistantId || !msg.steps) return msg
            return { ...msg, steps: msg.steps.map((s) => (
              s.type === 'tool' && s.id === pending.toolCallId ? { ...s, partialResult: pending.partialResult } : s
            )) }
          }))
        }, 200)
        break
      }
      case 'tool_end': {
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) break
        setMessages((prev) => prev.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'tool' && s.id === event.toolCallId ? { ...s, status: event.isError ? 'error' : 'done', result: event.result } : s
          )) }
        }))
        break
      }
      case 'artifact_created': {
        const assistantId = currentAssistantIdRef.current
        setMessages((prev) => {
          const targetId = assistantId ?? [...prev].reverse().find((msg) => msg.role === 'assistant')?.id
          if (!targetId) return prev
          return prev.map((msg) => (
            msg.id === targetId ? { ...msg, artifacts: [...(msg.artifacts ?? []), event.artifact] } : msg
          ))
        })
        break
      }
      case 'session_renamed':
        sdkSessionInfoRef.current = sdkSessionInfoRef.current
          ? { ...sdkSessionInfoRef.current, name: event.name, titleSource: event.titleSource, aiTitleGenerated: event.aiTitleGenerated }
          : sdkSessionInfoRef.current
        onSessionCreated?.({
          id: event.sessionId,
          cwd: sdkSessionInfoRef.current?.cwd ?? selectedCwd ?? '',
          sessionFile: sdkSessionInfoRef.current?.sessionFile,
          created: sdkSessionInfoRef.current?.created ?? new Date().toISOString(),
          modified: new Date().toISOString(),
          firstMessage: sdkSessionInfoRef.current?.firstMessage ?? '',
          messageCount: sdkSessionInfoRef.current?.messageCount ?? 0,
          name: event.name,
          titleSource: event.titleSource,
          aiTitleGenerated: event.aiTitleGenerated,
        })
        break
      case 'agent_end': {
        setStreaming(false)
        const sessionId = sdkSessionIdRef.current
        const finishedAssistantId = currentAssistantIdRef.current
        currentAssistantIdRef.current = null

        // 流结束：把 skill 解析器剩余缓冲全部 flush。把任何剩余的「非 skill 纯文本」
        // 也并入 pendingTextDeltaRef，下面的 tailText 会一起写到 message.content。
        if (skillParserRef.current) {
          skillParserRef.current.flush()
          skillParserRef.current = null
        }
        if (pendingSkillFreeTextRef.current) {
          pendingTextDeltaRef.current += pendingSkillFreeTextRef.current
          pendingSkillFreeTextRef.current = ''
        }

        // 立刻 flush 所有 pending delta，防止节流的 setTimeout 在 setStreaming(false) 之后才落地，
        // 造成"看上去结束了但末尾字符没写进消息"或与 normalize 抢覆盖。
        if (textDeltaTimerRef.current) {
          clearTimeout(textDeltaTimerRef.current)
          textDeltaTimerRef.current = null
        }
        const tailText = pendingTextDeltaRef.current
        pendingTextDeltaRef.current = ''
        if (thinkingDeltaTimerRef.current) {
          clearTimeout(thinkingDeltaTimerRef.current)
          thinkingDeltaTimerRef.current = null
        }
        pendingThinkingDeltaRef.current = ''
        if (tailText && finishedAssistantId) {
          setMessages((prev) => prev.map((msg) => (
            msg.id === finishedAssistantId ? { ...msg, content: msg.content + tailText } : msg
          )))
        }
        if (sessionId) {
          void normalizeMessagesForSession(sessionId)
        }
        // 启发式扫描：从 assistant 消息文本里抓本地路径，验证存在后追加 artifact 卡片
        // 仅桌面端（需要 file:stat IPC）；后端已发 backend artifact 的会自动去重
        console.info(`[artifactDetector] agent_end entry: isDesktop=${isDesktop} sessionId=${sessionId ? 'ok' : 'null'} assistantId=${finishedAssistantId ?? 'null'}`)
        if (isDesktop && sessionId && finishedAssistantId) {
          const bridge = getDesktopBridge()
          console.info(`[artifactDetector] bridge.file.stat available=${!!bridge?.file?.stat}`)
          if (bridge?.file?.stat) {
            void (async () => {
              try {
                // 用 setMessages(prev => prev) 拿到最新 messages 快照（避免 stale closure）
                let snapshot: Message[] = []
                setMessages((prev) => { snapshot = prev; return prev })
                const target = snapshot.find((m) => m.id === finishedAssistantId)
                if (!target) {
                  console.warn(`[artifactDetector] msg=${finishedAssistantId} not found in snapshot (len=${snapshot.length})`)
                  return
                }
                // ⚠️ React setState 是异步的：上面的 flush(setMessages prev.map content+tailText)
                // 还没真正落地到 state，这里读 target.content 可能是不含 tailText 的旧内容。
                // 路径文本（"位置: E:\xxx\file.docx"）通常出现在消息末尾，正好在 tailText 里。
                // 因此必须手动拼接 tailText 再丢给 detector，否则正则匹配不到 → 卡片不出现。
                const fullText = (target.content ?? '') + (tailText ?? '')
                console.info(`[artifactDetector] msg=${finishedAssistantId} content.len=${(target.content ?? '').length} tailText.len=${(tailText ?? '').length} fullText.len=${fullText.length}`)
                console.info(`[artifactDetector] fullText preview: ${fullText.slice(0, 200).replace(/\n/g, '\\n')}${fullText.length > 200 ? '…' : ''}`)
                const detected = await detectLocalArtifacts(
                  fullText,
                  sessionId,
                  target.artifacts ?? [],
                  (p) => bridge.file.stat(p),
                )
                console.info(`[artifactDetector] msg=${finishedAssistantId} found ${detected.length} local artifact(s)`)
                if (detected.length === 0) return
                setMessages((prev) => prev.map((msg) => (
                  msg.id === finishedAssistantId
                    ? { ...msg, artifacts: [...(msg.artifacts ?? []), ...detected] }
                    : msg
                )))
              } catch (err) {
                console.warn('[artifactDetector] scan failed', err)
              }
            })()
          }
        }
        break
      }
      case 'permission_requested': {
        const request = event.request
        const targetSessionId = request.sessionId || sdkSessionIdRef.current
        if (!targetSessionId) break

        // YOLO mode：全局自动允许（优先级最高，跳过一切兜底逻辑）
        if (autoApproveAllToolsRef.current) {
          void resolvePermission(targetSessionId, request.permissionId, true).catch((err) => {
            console.error('[YOLO] auto-approve permission failed:', err)
          })
          break
        }

        if (isSessionAllowed(targetSessionId, request.kind, request.options)) {
          void resolvePermission(targetSessionId, request.permissionId, true)
          break
        }

        setPendingPermissions((prev) => {
          if (prev.some((p) => p.permissionId === request.permissionId)) return prev
          return [...prev, request]
        })

        // 将当前正在运行的对应工具标记为等待授权，并记录 toolStepId -> permission 映射
        setMessages((prev) => prev.map((msg) => {
          if (msg.role !== 'assistant' || !msg.steps) return msg
          return {
            ...msg,
            steps: msg.steps.map((s) => {
              if (s.type === 'tool' && s.name === request.kind && s.status === 'running') {
                toolPermissionMapRef.current.set(s.id, request)
                return { ...s, status: 'waiting_permission' as const, permissionId: request.permissionId }
              }
              return s
            }),
          }
        }))

        // 后台会话：同步更新快照，切回时仍能看到等待授权状态
        if (!isActiveSession) {
          const bgState = getOrCreateSessionState(sourceSessionId)
          if (!bgState.pendingPermissions.some((p) => p.permissionId === request.permissionId)) {
            bgState.pendingPermissions = [...bgState.pendingPermissions, request]
          }
          bgState.messages = bgState.messages.map((msg) => {
            if (msg.role !== 'assistant' || !msg.steps) return msg
            return {
              ...msg,
              steps: msg.steps.map((s) => {
                if (s.type === 'tool' && s.name === request.kind && s.status === 'running') {
                  bgState.toolPermissionMap.set(s.id, request)
                  return { ...s, status: 'waiting_permission' as const, permissionId: request.permissionId }
                }
                return s
              }),
            }
          })
        }
        break
      }
      case 'permission_resolved': {
        setPendingPermissions((prev) => prev.filter((p) => p.permissionId !== event.permissionId))
        if (!isActiveSession) {
          const bgState = getOrCreateSessionState(sourceSessionId)
          bgState.pendingPermissions = bgState.pendingPermissions.filter((p) => p.permissionId !== event.permissionId)
        }
        break
      }
      case 'question': {
        const q = event.question
        setPendingQuestions((prev) => {
          if (prev.some((x) => x.questionId === q.questionId)) return prev
          return [...prev, q]
        })
        if (!isActiveSession) {
          const bgState = getOrCreateSessionState(sourceSessionId)
          if (!bgState.pendingQuestions.some((x) => x.questionId === q.questionId)) {
            bgState.pendingQuestions = [...bgState.pendingQuestions, q]
          }
        }
        break
      }
      case 'question_resolved': {
        setPendingQuestions((prev) => prev.filter((q) => q.questionId !== event.questionId))
        if (!isActiveSession) {
          const bgState = getOrCreateSessionState(sourceSessionId)
          bgState.pendingQuestions = bgState.pendingQuestions.filter((q) => q.questionId !== event.questionId)
        }
        break
      }
      case 'error':
        setError(event.message)
        setStreaming(false)
        break
    }
  }, [onSessionCreated, selectedCwd])

  const connectEvents = useCallback(async (sessionId: string): Promise<void> => {
    // 查找该会话是否已有 SSE 连接
    let existingEs: EventSource | undefined
    for (const [es, sid] of eventSourceSessionMapRef.current) {
      if (sid === sessionId) {
        existingEs = es
        break
      }
    }
    const state = getOrCreateSessionState(sessionId)
    if (existingEs) {
      // 该会话已有 SSE 连接（可能正在后台运行），直接复用
      if (sessionId === activeSessionIdRef.current) {
        eventSourceRef.current = existingEs
      }
      return
    }

    return new Promise((resolve) => {
      // SSE 连接应尽快就绪，但不应阻塞用户发送消息。
      // 2 秒内收到 open/connected 即认为就绪；否则也放行，由后续 prompt 调用自己报错。
      const timeout = setTimeout(() => {
        if (state.eventReadyResolve === readyResolve) {
          state.eventReadyResolve = null
        }
        state.eventReadyTimeout = null
        if (sessionId === activeSessionIdRef.current) {
          eventReadyResolveRef.current = null
        }
        resolve()
      }, 2000)

      const readyResolve = () => {
        clearTimeout(timeout)
        if (state.eventReadyResolve === readyResolve) {
          state.eventReadyResolve = null
        }
        state.eventReadyTimeout = null
        if (sessionId === activeSessionIdRef.current) {
          eventReadyResolveRef.current = null
        }
        resolve()
      }

      state.eventReadyResolve = readyResolve
      state.eventReadyTimeout = timeout
      if (sessionId === activeSessionIdRef.current) {
        eventReadyResolveRef.current = readyResolve
      }

      try {
        const es = connectSessionEvents(sessionId, (event) => handleAgentEvent({ ...event, target: es }))
        eventSourceSessionMapRef.current.set(es, sessionId)
        state.eventSource = es
        if (sessionId === activeSessionIdRef.current) {
          eventSourceRef.current = es
        }
      } catch (err) {
        clearTimeout(timeout)
        state.eventReadyResolve = null
        state.eventReadyTimeout = null
        if (sessionId === activeSessionIdRef.current) {
          eventReadyResolveRef.current = null
        }
        console.error('Failed to connect session events:', err)
        resolve()
      }
    })
  }, [handleAgentEvent])

  const ensureSdkSession = useCallback(async () => {
    if (sdkSessionIdRef.current && sdkSessionInfoRef.current) return sdkSessionInfoRef.current
    const cwd = newSessionCwd ?? session?.cwd ?? selectedCwd ?? undefined
    const created = await createSession(cwd)
    sdkSessionIdRef.current = created.id
    sdkSessionInfoRef.current = created
    activeSessionIdRef.current = created.id
    const state = getOrCreateSessionState(created.id)
    state.sdkSessionId = created.id
    state.sdkSessionInfo = created
    await connectEvents(created.id)
    return created
  }, [connectEvents, newSessionCwd, selectedCwd, session?.cwd])

  const handleSend = useCallback(async (text: string, attachments?: LocalAttachment[]) => {
    const userAttachments = toMessageAttachments(attachments)
    const userMsg: Message = {
      id: 'u' + Date.now(),
      role: 'user',
      content: text,
      attachments: userAttachments,
      timestamp: new Date().toISOString(),
    }
    const assistantId = 'a' + Date.now()
    const lower = text.toLowerCase()
    const isWordTask = lower.includes('word') || lower.includes('docx') || lower.includes('文档') || lower.includes('word文档') || lower.includes('word文件')
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      steps: [],
      pendingTask: isWordTask ? 'word' : 'default',
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setHasMessages(true)
    forceScrollRef.current = true
    setStreaming(true)
    setError(null)
    currentAssistantIdRef.current = assistantId
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0
    currentThinkingStepIdRef.current = null

    try {
      const sdkSession = await ensureSdkSession()
      // 必须等 SSE 连接就绪再发 prompt，否则权限事件可能丢失
      await connectEvents(sdkSession.id)
      const updatedSession = {
        ...sdkSession,
        firstMessage: sdkSession.firstMessage || text,
        messageCount: Math.max(sdkSession.messageCount, 1),
        modified: new Date().toISOString(),
      }
      sdkSessionInfoRef.current = updatedSession
      onSessionCreated?.(updatedSession)

      // ---- 附件处理：图片 base64 / 文档复制到 <cwd>/.uploads/ ----
      const ready = (attachments ?? []).filter((a) => a.status === 'ready' && a.tempPath)
      const images: ApiImagePayload[] = []
      const docFiles: { name: string; relPath: string; absPath: string }[] = []
      let uploadFailedNotice: string[] = []

      if (ready.length > 0 && isDesktop) {
        const bridge = getDesktopBridge()
        if (bridge?.file) {
          for (const att of ready) {
            const isImg = att.file.type.startsWith('image/')
            if (isImg) {
              const r = await bridge.file.readAsBase64(att.tempPath!)
              if (r.ok && r.data && r.mimeType) {
                images.push({ name: att.name, mimeType: r.mimeType, data: r.data })
              } else {
                uploadFailedNotice.push(`${att.name}（读取失败：${r.error ?? '未知'}）`)
              }
            } else {
              const r = await bridge.file.copyToSession({
                tempPath: att.tempPath!,
                cwd: sdkSession.cwd,
                fileName: att.name,
              })
              if (r.ok && r.absPath && r.relPath) {
                docFiles.push({ name: att.name, relPath: r.relPath, absPath: r.absPath })
              } else {
                uploadFailedNotice.push(`${att.name}（复制失败：${r.error ?? '未知'}）`)
              }
            }
          }
        }
      }

      // ---- 拼接 message：透明插入附件指引，让 agent 知道去 .uploads/ 读 ----
      let finalMessage = text
      const promptLines: string[] = []
      if (docFiles.length > 0) {
        promptLines.push('')
        promptLines.push('[系统：已为你上传以下附件到本会话工作目录]')
        for (const f of docFiles) promptLines.push(`- ${f.name} → ${f.relPath}`)
        promptLines.push('请使用 read 等工具读取文件内容后回答用户问题。')
      }
      if (images.length > 0) {
        promptLines.push('')
        promptLines.push(`[系统：用户附了 ${images.length} 张图片，请使用视觉能力分析。]`)
      }
      if (uploadFailedNotice.length > 0) {
        promptLines.push('')
        promptLines.push('[系统：以下附件上传失败，请告知用户：' + uploadFailedNotice.join('；') + ']')
      }
      if (promptLines.length > 0) {
        finalMessage = text + '\n' + promptLines.join('\n')
      }

      // ---- 把 absPath 回填进 userMsg.attachments[i].localPath，让历史卡片走 ArtifactCard ----
      if (docFiles.length > 0 || images.length > 0) {
        const docMap = new Map(docFiles.map((d) => [d.name, d.absPath]))
        setMessages((prev) => prev.map((m) => {
          if (m.id !== userMsg.id) return m
          if (!m.attachments) return m
          return {
            ...m,
            attachments: m.attachments.map((a) => ({
              ...a,
              localPath: docMap.get(a.name) ?? a.localPath,
              isImage: a.type === 'image' ? true : a.isImage,
            })),
          }
        }))
      }

      await sendPrompt(sdkSession.id, {
        message: finalMessage,
        images: images.length > 0 ? images : undefined,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStreaming(false)
      currentAssistantIdRef.current = null
      if (skillParserRef.current) {
        skillParserRef.current = null
      }
      pendingSkillFreeTextRef.current = ''
      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantId ? { ...msg, content: `调用 Pi SDK 失败：${message}` } : msg
      )))
    }
  }, [ensureSdkSession, connectEvents, onSessionCreated])

  const handleAbort = useCallback(async () => {
    const sdkSessionId = sdkSessionIdRef.current
    const assistantId = currentAssistantIdRef.current
    if (!sdkSessionId) return

    // Close SSE connection for the active session only
    const es = eventSourceRef.current
    if (es) {
      es.close()
      eventSourceSessionMapRef.current.delete(es)
      eventSourceRef.current = null
    }
    eventReadySessionIdRef.current = null
    eventReadyResolveRef.current = null
    const state = sessionStatesRef.current.get(sdkSessionId)
    if (state) {
      state.eventSource = null
      state.eventReadySessionId = null
      state.eventReadyResolve = null
    }

    // Call backend abort
    try {
      await abortSession(sdkSessionId)
    } catch (err) {
      console.error('Abort failed:', err)
    }

    // Clear any pending tool update timer
    if (toolUpdateTimerRef.current) {
      clearTimeout(toolUpdateTimerRef.current)
      toolUpdateTimerRef.current = null
    }
    pendingToolUpdateRef.current = null

    // Remove incomplete assistant message
    if (assistantId) {
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantId))
    }

    // Reset state
    setStreaming(false)
    currentAssistantIdRef.current = null
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0
    currentThinkingStepIdRef.current = null
    if (skillParserRef.current) {
      skillParserRef.current = null
    }
    pendingSkillFreeTextRef.current = ''
  }, [])

  const handleResolvePermission = useCallback(async (request: PermissionRequestInfo, decision: 'allow_once' | 'allow_session' | 'deny') => {
    const sessionId = request.sessionId || sdkSessionIdRef.current
    if (!sessionId) return

    setPendingPermissions((prev) => prev.filter((p) => p.permissionId !== request.permissionId))

    if (decision === 'deny') {
      try {
        await resolvePermission(sessionId, request.permissionId, false)
      } catch (err) {
        console.error('Resolve permission failed:', err)
      }
      return
    }

    if (decision === 'allow_session') {
      addSessionAllowed(sessionId, request.kind, request.options)
      // 如果允许的是非当前会话，同步更新该会话快照，避免切回后丢失 allow_session 决策
      if (sessionId !== activeSessionIdRef.current) {
        const bgState = sessionStatesRef.current.get(sessionId)
        if (bgState) {
          const key = getPermissionKey(request.kind, request.options)
          let set = bgState.allowedSessionPermissions.get(sessionId)
          if (!set) {
            set = new Set<string>()
            bgState.allowedSessionPermissions.set(sessionId, set)
          }
          set.add(key)
        }
      }
    }

    try {
      await resolvePermission(sessionId, request.permissionId, true)
    } catch (err) {
      console.error('Resolve permission failed:', err)
    }
  }, [])

  const handleResolveToolPermission = useCallback((toolStepId: string, decision: 'allow_once' | 'allow_session' | 'deny') => {
    const request = toolPermissionMapRef.current.get(toolStepId)
    if (!request) return
    void handleResolvePermission(request, decision)
  }, [handleResolvePermission])

  const handleAnswerQuestion = useCallback(async (question: QuestionInfo, answers: string[][]) => {
    try {
      await answerQuestion(question.questionId, answers)
      setPendingQuestions((prev) => prev.filter((q) => q.questionId !== question.questionId))
    } catch (err) {
      console.error('Answer question failed:', err)
    }
  }, [])

  const handleRejectQuestion = useCallback(async (question: QuestionInfo) => {
    try {
      await rejectQuestion(question.questionId)
      setPendingQuestions((prev) => prev.filter((q) => q.questionId !== question.questionId))
    } catch (err) {
      console.error('Reject question failed:', err)
    }
  }, [])

  useEffect(() => {
    const previousActiveId = activeSessionIdRef.current
    activeSessionIdRef.current = session?.id ?? null

    // 切走前先把上一个活跃会话的状态保存下来，避免 cleanup 延迟导致快照丢失或错乱
    if (previousActiveId && previousActiveId !== session?.id) {
      saveSessionState(previousActiveId)
    }

    if (!session?.id) {
      // 新会话占位状态：清空 active refs + UI
      messagesRef.current = []
      setMessages([])
      setHasMessages(!!session)
      setStreaming(false)
      setError(null)
      setPendingPermissions([])
      setPendingQuestions([])
      sdkSessionIdRef.current = null
      sdkSessionInfoRef.current = session
      eventSourceRef.current = null
      eventReadySessionIdRef.current = null
      eventReadyResolveRef.current = null
      currentAssistantIdRef.current = null
      currentThinkingRef.current = ''
      currentThinkingStartRef.current = 0
      currentThinkingStepIdRef.current = null
      pendingToolUpdateRef.current = null
      toolUpdateTimerRef.current = null
      pendingTextDeltaRef.current = ''
      textDeltaTimerRef.current = null
      pendingThinkingDeltaRef.current = ''
      thinkingDeltaTimerRef.current = null
      if (skillParserRef.current) {
        skillParserRef.current = null
      }
      pendingSkillFreeTextRef.current = ''
      normalizeSessionIdRef.current = null
      toolPermissionMapRef.current = new Map()
      allowedSessionPermissionsRef.current = new Map()
      scannedForArtifactsRef.current.clear()
      if (fallbackScanTimerRef.current) {
        clearTimeout(fallbackScanTimerRef.current)
        fallbackScanTimerRef.current = null
      }
      return
    }

    const sid = session.id
    void loadSessionState(sid)

    return () => {
      // 切走前保存当前会话状态；后台 SSE 保持连接
      if (activeSessionIdRef.current === sid) {
        saveSessionState(sid)
      }
    }
  }, [session, newSessionCwd])

  useEffect(() => {
    return () => {
      // 组件卸载：关闭所有会话的 SSE，清理所有节流定时器
      closeAllEventSources()
      if (textDeltaTimerRef.current) {
        clearTimeout(textDeltaTimerRef.current)
        textDeltaTimerRef.current = null
      }
      if (thinkingDeltaTimerRef.current) {
        clearTimeout(thinkingDeltaTimerRef.current)
        thinkingDeltaTimerRef.current = null
      }
      if (toolUpdateTimerRef.current) {
        clearTimeout(toolUpdateTimerRef.current)
        toolUpdateTimerRef.current = null
      }
      if (fallbackScanTimerRef.current) {
        clearTimeout(fallbackScanTimerRef.current)
        fallbackScanTimerRef.current = null
      }
    }
  }, [])

  // ⭐ 兜底扫描：监听 messages 变化，对任意非流式的 assistant 消息跑 detector。
  // 这是终极保底——不管 agent_end / normalize / 历史加载哪条路径走对走错，
  // 只要 message.content 里有路径，最终都会被这里扫到并显示卡片。
  // 用 scannedForArtifactsRef 按 (msgId + content.length) 去重，避免无限循环。
  // 200ms debounce：高频 setMessages（流式 delta、normalize、新消息）合并成一次扫描，
  // 避免 stat 风暴。
  useEffect(() => {
    if (!isDesktop || streaming) return
    const bridge = getDesktopBridge()
    if (!bridge?.file?.stat) return
    const sessionId = sdkSessionIdRef.current
    if (!sessionId) return

    // 取消上一次未触发的 debounce（旧 effect 留下的）
    if (fallbackScanTimerRef.current) {
      clearTimeout(fallbackScanTimerRef.current)
      fallbackScanTimerRef.current = null
    }

    let cancelled = false
    // 用局部 timerId 持有定时器引用：即使回调内已经把 ref 置 null，
    // cleanup 仍能通过 timerId 准确取消（避免 ref 漂移导致的清理漏洞）。
    const timerId = setTimeout(() => {
      // 回调真正执行时清掉 ref（ref 仅用于"被新 effect 抢占时取消上一次"）
      if (fallbackScanTimerRef.current === timerId) {
        fallbackScanTimerRef.current = null
      }
      if (cancelled) return

      const tasks: Array<{ id: string; content: string; existing: ArtifactInfo[] }> = []
      for (const msg of messages) {
        if (msg.role !== 'assistant') continue
        if (!msg.content || msg.content.length < 4) continue
        const seen = scannedForArtifactsRef.current.get(msg.id)
        if (seen === msg.content.length) continue
        tasks.push({ id: msg.id, content: msg.content, existing: msg.artifacts ?? [] })
      }
      if (tasks.length === 0) return

      void (async () => {
        const updates = new Map<string, ArtifactInfo[]>()
        for (const t of tasks) {
          // 每次循环开头检查 cancelled：组件 unmount 后立刻退出，
          // 避免继续做无用 stat，更避免把"已扫描"标记写入但又永远应用不到 UI。
          if (cancelled) return
          try {
            const detected = await detectLocalArtifacts(
              t.content,
              sessionId,
              t.existing,
              (p) => bridge.file.stat(p),
            )
            if (cancelled) return
            // OCR 建议：先把结果放进 updates，确认 cancelled 后再标记"已扫描"；
            // 否则 unmount 时机刚好夹在 set 和 setMessages 之间，
            // 会把消息永久标记为"已扫描"但卡片永远不出现（重 mount 也跳过）。
            if (detected.length > 0) updates.set(t.id, detected)
            scannedForArtifactsRef.current.set(t.id, t.content.length)
          } catch (err) {
            console.warn('[fallback-scan] failed for', t.id, err)
          }
        }
        if (cancelled || updates.size === 0) return
        console.info(`[fallback-scan] applying ${updates.size} update(s)`)
        setMessages((prev) => prev.map((m) => {
          const add = updates.get(m.id)
          if (!add) return m
          const existingPaths = new Set((m.artifacts ?? []).map((a) => (a.localPath ?? a.path ?? '').toLowerCase()))
          const keep = add.filter((a) => !existingPaths.has((a.localPath ?? a.path ?? '').toLowerCase()))
          if (keep.length === 0) return m
          return { ...m, artifacts: [...(m.artifacts ?? []), ...keep] }
        }))
      })()
    }, 200)
    fallbackScanTimerRef.current = timerId

    return () => {
      cancelled = true
      // ⭐ 直接清局部 timerId，不依赖 ref（ref 可能已被回调置 null）
      clearTimeout(timerId)
      if (fallbackScanTimerRef.current === timerId) {
        fallbackScanTimerRef.current = null
      }
    }
  }, [messages, streaming])

  useEffect(() => {
    // Auto-scroll to bottom only when user is near bottom
    const container = scrollContainerRef.current
    if (!container) return

    // Force scroll: user just sent a message, or history just loaded
    if (forceScrollRef.current) {
      forceScrollRef.current = false
      isUserNearBottomRef.current = true
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight
        })
      })
      return
    }

    const threshold = 100
    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold
    isUserNearBottomRef.current = nearBottom
    if (nearBottom) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight
      })
    }
  }, [messages])

  const effectiveCwd = newSessionCwd ?? session?.cwd ?? selectedCwd
  const showChat = session !== null || newSessionCwd !== null
  const isEmptyNew = !!(session === null && newSessionCwd && !hasMessages)
  const isNewSession = !!(session && !hasMessages)

  if (!showChat && !selectedCwd) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 'var(--radius-xl)',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 18,
            boxShadow: 'var(--shadow-md)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" />
            </svg>
          </div>
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 8 }}>
            选择一个项目目录
          </div>
          <div style={{ fontSize: 'var(--font-base)', color: 'var(--text-muted)', textAlign: 'center', maxWidth: 320 }}>
            从左侧边栏选择或添加一个项目，开始与智能体对话
          </div>
        </div>
      </div>
    )
  }

  if (!showChat && selectedCwd) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', padding: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 'var(--radius-xl)',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 18,
            boxShadow: 'var(--shadow-md)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 8 }}>
            开始新对话
          </div>
          <div style={{ fontSize: 'var(--font-base)', color: 'var(--text-muted)', textAlign: 'center' }}>
            点击左侧「新建对话」开始
          </div>
        </div>
      </div>
    )
  }

  if (isEmptyNew || isNewSession) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: '20px 16px' }}>
          <div style={{ width: '100%', maxWidth: 820 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginLeft: 16,
              marginRight: 52,
              marginBottom: 16,
              fontFamily: 'var(--font-mono)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1, lineHeight: 1.2 }}>
                {/* 超级小金动态吉祥物（亮/暗主题双版本，详见 XiaojinLogo.tsx） */}
                <XiaojinLogo size={56} />
                <span style={{ fontSize: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)' }}>超级小金</span>
                <span style={{ fontSize: 'var(--font-base)', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  <Typewriter phrases={TYPEWRITER_PHRASES} />
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                  超级小金
                </span>
                <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                  {APP_INSTITUTION}
                </span>
              </div>
            </div>
            <ChatInput ref={chatInputRef} onSend={handleSend} onAbort={handleAbort} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'var(--bg-panel)', flexShrink: 0,
        fontSize: 'calc(var(--font-base) * 0.929)',
      }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
          {session?.name || session?.firstMessage?.slice(0, 50) || '会话'}
        </span>
        {effectiveCwd && (
          <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {effectiveCwd}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {session?.id && modelProviders.length > 0 && (
          <select
            value={`${session.model?.provider ?? config?.defaultModel?.provider ?? ''}/${session.model?.modelId ?? config?.defaultModel?.id ?? ''}`}
            onChange={(e) => {
              const [provider, modelId] = e.target.value.split('/')
              if (provider && modelId && session.id) {
                onSwitchModel(session.id, provider, modelId)
              }
            }}
            style={{
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--bg)',
              color: 'var(--text-dim)',
              fontSize: 'var(--font-xs)',
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              cursor: 'pointer',
              maxWidth: 180,
            }}
          >
            {modelProviders.flatMap((provider) =>
              provider.models.map((model) => (
                <option key={`${provider.id}/${model.id}`} value={`${provider.id}/${model.id}`}>
                  {provider.name}/{model.name}
                </option>
              ))
            )}
          </select>
        )}
      </div>

      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', paddingTop: 16 }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 16px' }}>
          {messages.map((m, index) => {
            const isLast = index === messages.length - 1
            const isActiveAssistant = isLast && m.role === 'assistant' && streaming
            // 历史消息可能在 content 中嵌有 <skill_content>...</skill_content>（流式拦截器是 0.1.22 之后才加的），
            // 这里再做一次防御性 sanitize：把 XML 块抽出作为虚拟 skill_load steps，
            // content 显示 sanitize 后的干净版本。流式期间不做（避免和实时解析器双重 emit）。
            let displayContent = m.content
            let displaySteps = m.steps
            if (m.role === 'assistant' && !isActiveAssistant && m.content && m.content.includes('<skill_content')) {
              const { cleanContent, skills } = extractSkillBlocks(m.content)
              if (skills.length > 0) {
                displayContent = cleanContent
                const histSkillSteps: AgentStep[] = skills.map((s) => ({
                  type: 'skill_load' as const,
                  id: `hist-${m.id}-${s.id}`,
                  name: s.name,
                  baseDir: s.baseDir,
                  content: s.content,
                  isLoading: false,
                }))
                displaySteps = [...(m.steps ?? []), ...histSkillSteps]
              }
            }
            const hasText = !!displayContent
            const hasSteps = !!(displaySteps && displaySteps.length > 0)
            // 用派生后的对象给 MessageView 渲染（保持原 m 不变以维持 memo 引用）
            const messageForView = displayContent === m.content && displaySteps === m.steps
              ? m
              : { ...m, content: displayContent, steps: displaySteps }
            return (
              <div key={m.id} style={{ marginBottom: m.role === 'user' ? 16 : 0 }}>
                {hasSteps && (
                  <ReasoningBlock steps={displaySteps!} onResolveToolPermission={handleResolveToolPermission} />
                )}
                {!hasSteps && isActiveAssistant && !m.content && (
                  <PendingTaskCard task={m.pendingTask} />
                )}
                {hasText && (
                  <MessageErrorBoundary
                    content={displayContent}
                    sessionId={sdkSessionIdRef.current ?? session?.id ?? null}
                    messageId={m.id}
                  >
                    <MessageView message={messageForView} isStreaming={isLast && streaming} />
                  </MessageErrorBoundary>
                )}
              </div>
            )
          })}
          {error && <div style={{ color: 'var(--danger)', fontSize: 'var(--font-sm)', marginBottom: 10 }}>{error}</div>}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput ref={chatInputRef} onSend={handleSend} onAbort={handleAbort} isStreaming={streaming} />

      {pendingPermissions.length > 0 && (
        <PermissionDialog
          request={pendingPermissions[0]}
          onResolve={(decision) => handleResolvePermission(pendingPermissions[0], decision)}
        />
      )}

      {pendingQuestions.length > 0 && (
        <QuestionDialog
          question={pendingQuestions[0]}
          onSubmit={(answers) => handleAnswerQuestion(pendingQuestions[0], answers)}
          onReject={() => handleRejectQuestion(pendingQuestions[0])}
        />
      )}
    </div>
  )
}
