import { useState, useRef, useEffect, useCallback } from 'react'
import type { SessionInfo, Message, MessageAttachment, LocalAttachment, AgentStep } from '../mockData'
import { MessageView } from './MessageView'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { Typewriter } from './Typewriter'
import { ReasoningBlock } from './ReasoningBlock'

import { PermissionDialog } from './PermissionDialog'
import { QuestionDialog } from './QuestionDialog'

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
} from '../lib/piApi'

interface Props {
  session: SessionInfo | null
  selectedCwd: string | null
  newSessionCwd: string | null
  chatInputRef: React.RefObject<ChatInputHandle | null>
  onSessionCreated?: (session: SessionInfo) => void
  modelProviders: ModelProviderInfo[]
  config: ConfigInfo | null
  onSwitchModel: (sessionId: string, provider: string, modelId: string) => void
}

const APP_INSTITUTION = (import.meta.env.VITE_APP_INSTITUTION as string | undefined) ?? '武汉船院'

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
      padding: '8px 12px', borderRadius: 10,
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

export function ChatArea({ session, selectedCwd, newSessionCwd, chatInputRef, onSessionCreated, modelProviders, config, onSwitchModel }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
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
  const currentAssistantIdRef = useRef<string | null>(null)
  const currentThinkingRef = useRef<string>('')
  const currentThinkingStartRef = useRef<number>(0)
  const currentThinkingStepIdRef = useRef<string | null>(null)
  const pendingToolUpdateRef = useRef<{ toolCallId: string; partialResult: unknown } | null>(null)
  const toolUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isUserNearBottomRef = useRef(true)
  const forceScrollRef = useRef(false)
  const normalizeSessionIdRef = useRef<string | null>(null)
  const toolPermissionMapRef = useRef<Map<string, PermissionRequestInfo>>(new Map())

  // 本会话自动允许的权限规则：{ sessionId -> { kindKey -> true } }
  const allowedSessionPermissionsRef = useRef<Map<string, Set<string>>>(new Map())

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
      const loadedMessages = await getMessages(sessionId)
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
        return normalized
      })
      forceScrollRef.current = true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Normalize messages failed:', err)
      setError(`整理会话消息失败：${message}`)
    }
  }, [])

  const handleAgentEvent = useCallback((event: WebAgentEvent) => {
    if (event.type === 'connected') {
      if (eventReadyResolveRef.current) {
        eventReadyResolveRef.current()
        eventReadyResolveRef.current = null
      }
      eventReadySessionIdRef.current = event.sessionId
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
        setMessages((prev) => prev.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'thinking' && s.id === stepId ? { ...s, content: currentThinkingRef.current } : s
          )) }
        }))
        break
      }
      case 'thinking_end': {
        const content = event.content || currentThinkingRef.current
        currentThinkingRef.current = content
        const durationMs = Date.now() - currentThinkingStartRef.current
        const assistantId = currentAssistantIdRef.current
        const stepId = currentThinkingStepIdRef.current
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
        setMessages((prev) => prev.map((msg) => (
          msg.id === assistantId ? { ...msg, content: msg.content + event.delta } : msg
        )))
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
        currentAssistantIdRef.current = null
        if (sessionId) {
          void normalizeMessagesForSession(sessionId)
        }
        break
      }
      case 'permission_requested': {
        const sessionId = sdkSessionIdRef.current
        const request = event.request
        if (!sessionId) break

        if (isSessionAllowed(sessionId, request.kind, request.options)) {
          void resolvePermission(sessionId, request.permissionId, true)
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
        break
      }
      case 'permission_resolved': {
        setPendingPermissions((prev) => prev.filter((p) => p.permissionId !== event.permissionId))
        break
      }
      case 'question': {
        const q = event.question
        setPendingQuestions((prev) => {
          if (prev.some((x) => x.questionId === q.questionId)) return prev
          return [...prev, q]
        })
        break
      }
      case 'question_resolved': {
        setPendingQuestions((prev) => prev.filter((q) => q.questionId !== event.questionId))
        break
      }
      case 'error':
        setError(event.message)
        setStreaming(false)
        break
    }
  }, [onSessionCreated, selectedCwd])

  const connectEvents = useCallback(async (sessionId: string): Promise<void> => {
    if (eventSourceRef.current && eventReadySessionIdRef.current === sessionId) {
      return
    }

    eventSourceRef.current?.close()
    eventSourceRef.current = null
    eventReadySessionIdRef.current = null
    eventReadyResolveRef.current = null

    return new Promise((resolve) => {
      // SSE 连接应尽快就绪，但不应阻塞用户发送消息。
      // 2 秒内收到 open/connected 即认为就绪；否则也放行，由后续 prompt 调用自己报错。
      const timeout = setTimeout(() => {
        eventReadyResolveRef.current = null
        resolve()
      }, 2000)

      eventReadyResolveRef.current = () => {
        clearTimeout(timeout)
        eventReadyResolveRef.current = null
        resolve()
      }

      try {
        eventSourceRef.current = connectSessionEvents(sessionId, handleAgentEvent)
      } catch (err) {
        clearTimeout(timeout)
        eventReadyResolveRef.current = null
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
      // super-king /prompt 文档只支持 { message }，附件暂由前端展示，不随消息发送
      await sendPrompt(sdkSession.id, { message: text })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStreaming(false)
      currentAssistantIdRef.current = null
      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantId ? { ...msg, content: `调用 Pi SDK 失败：${message}` } : msg
      )))
    }
  }, [ensureSdkSession, connectEvents, onSessionCreated])

  const handleAbort = useCallback(async () => {
    const sdkSessionId = sdkSessionIdRef.current
    const assistantId = currentAssistantIdRef.current
    if (!sdkSessionId) return

    // Close SSE connection first
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    eventReadySessionIdRef.current = null
    eventReadyResolveRef.current = null

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
    let cancelled = false
    sdkSessionIdRef.current = null
    sdkSessionInfoRef.current = null
    currentAssistantIdRef.current = null
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0
    currentThinkingStepIdRef.current = null
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    eventReadySessionIdRef.current = null
    eventReadyResolveRef.current = null

        // 使用 queueMicrotask 延迟同步状态重置，避免 react-hooks/set-state-in-effect
    queueMicrotask(() => {
      if (session?.id) {
        // 已有会话：直接使用 session.id（super-king 没有 open_existing/sessionFile）
        setMessages([])
        setHasMessages(true)
        sdkSessionIdRef.current = session.id
        sdkSessionInfoRef.current = session
        normalizeSessionIdRef.current = session.id
        void connectEvents(session.id)
        getMessages(session.id)
          .then((loadedMessages) => {
            if (cancelled) return
            setMessages(normalizeLoadedMessages(loadedMessages))
            forceScrollRef.current = true
          })
          .catch((err) => {
            if (!cancelled) {
              const message = err instanceof Error ? err.message : String(err)
              setError(`加载会话失败：${message}`)
              setMessages([])
            }
          })
      } else if (session) {
        setMessages([])
        setHasMessages(true)
      } else {
        setMessages([])
        setHasMessages(false)
      }
    })

    return () => { cancelled = true }
  }, [connectEvents, session, newSessionCwd])

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close()
      eventSourceRef.current = null
    }
  }, [])

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
            width: 64, height: 64, borderRadius: 18,
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
            width: 64, height: 64, borderRadius: 18,
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0, flex: 1, lineHeight: 1.2 }}>
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
              borderRadius: 6,
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
            const hasText = !!m.content
            const hasSteps = !!(m.steps && m.steps.length > 0)
            return (
              <div key={m.id} style={{ marginBottom: m.role === 'user' ? 16 : 0 }}>
                {hasSteps && (
                  <ReasoningBlock steps={m.steps!} onResolveToolPermission={handleResolveToolPermission} />
                )}
                {!hasSteps && isActiveAssistant && !m.content && (
                  <PendingTaskCard task={m.pendingTask} />
                )}
                {hasText && (
                  <MessageView message={m} isStreaming={isLast && streaming} />
                )}
              </div>
            )
          })}
          {error && <div style={{ color: '#ef4444', fontSize: 'calc(var(--font-base) * 0.929)', marginBottom: 10 }}>{error}</div>}
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
