import { useState, useRef, useEffect, useCallback } from 'react'
import type { SessionInfo, Message, MessageAttachment, LocalAttachment } from '../mockData'
import { MessageView } from './MessageView'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { Typewriter } from './Typewriter'
import { ToolCallCard, type ToolEventView } from './ToolCallCard'
import { ThinkingBlock } from './ThinkingBlock'
import { fileToBase64 } from '../lib/image'
import { connectSessionEvents, createSession, getMessages, listPermissionRequests, resolvePermission, sendPrompt, type PermissionRequestInfo, type WebAgentEvent } from '../lib/piApi'

interface Props {
  session: SessionInfo | null
  selectedCwd: string | null
  newSessionCwd: string | null
  chatInputRef: React.RefObject<ChatInputHandle | null>
  onSessionCreated?: (session: SessionInfo) => void
}

const APP_INSTITUTION = (import.meta.env.VITE_APP_INSTITUTION as string | undefined) ?? '武汉船院'

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
    type: 'image',
  }))
}

export function ChatArea({ session, selectedCwd, newSessionCwd, chatInputRef, onSessionCreated }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMessages, setHasMessages] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [toolEvents, setToolEvents] = useState<ToolEventView[]>([])
  const [permissionRequests, setPermissionRequests] = useState<PermissionRequestInfo[]>([])
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sdkSessionIdRef = useRef<string | null>(null)
  const sdkSessionInfoRef = useRef<SessionInfo | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const currentAssistantIdRef = useRef<string | null>(null)
  const currentThinkingRef = useRef<string>('')
  const currentThinkingStartRef = useRef<number>(0)

  const handleAgentEvent = useCallback((event: WebAgentEvent) => {
    switch (event.type) {
      case 'agent_start':
        setStreaming(true)
        setError(null)
        break
      case 'thinking_start':
        currentThinkingRef.current = ''
        currentThinkingStartRef.current = Date.now()
        break
      case 'thinking_delta': {
        currentThinkingRef.current += event.delta
        const assistantId = currentAssistantIdRef.current
        if (!assistantId) return
        setMessages((prev) => prev.map((msg) => (
          msg.id === assistantId ? { ...msg, thinkingContent: currentThinkingRef.current } : msg
        )))
        break
      }
      case 'thinking_end': {
        const content = event.content || currentThinkingRef.current
        currentThinkingRef.current = content
        const durationMs = Date.now() - currentThinkingStartRef.current
        const assistantId = currentAssistantIdRef.current
        if (assistantId) {
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantId ? { ...msg, thinkingContent: content, thinkingDurationMs: durationMs } : msg
          )))
        }
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
      case 'tool_start':
        setToolEvents((prev) => [...prev, { id: event.toolCallId, label: event.toolName, status: 'running' }])
        break
      case 'tool_end':
        setToolEvents((prev) => prev.map((tool) => (
          tool.id === event.toolCallId ? { ...tool, status: event.isError ? 'error' : 'done' } : tool
        )))
        break
      case 'permission_request':
        setPermissionRequests((prev) => prev.some((item) => item.id === event.request.id) ? prev : [...prev, event.request])
        break
      case 'permission_resolved':
        setPermissionRequests((prev) => prev.filter((item) => item.id !== event.requestId))
        break
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
      case 'agent_end':
        setStreaming(false)
        currentAssistantIdRef.current = null
        break
      case 'error':
        setError(event.message)
        setStreaming(false)
        break
    }
  }, [onSessionCreated, selectedCwd])

  const connectEvents = useCallback((sessionId: string) => {
    if (eventSourceRef.current) return
    listPermissionRequests(sessionId)
      .then(setPermissionRequests)
      .catch(() => {})
    eventSourceRef.current = connectSessionEvents(sessionId, handleAgentEvent)
    eventSourceRef.current.onerror = () => {
      setError('与 SDK 后端的事件连接已断开')
    }
  }, [handleAgentEvent])

  const ensureSdkSession = useCallback(async () => {
    if (sdkSessionIdRef.current && sdkSessionInfoRef.current) return sdkSessionInfoRef.current
    const cwd = newSessionCwd ?? session?.cwd ?? selectedCwd ?? undefined
    const created = await createSession(cwd)
    sdkSessionIdRef.current = created.id
    sdkSessionInfoRef.current = created
    connectEvents(created.id)
    return created
  }, [connectEvents, newSessionCwd, selectedCwd, session?.cwd])

  const handlePermissionDecision = useCallback(async (request: PermissionRequestInfo, decision: 'allow_once' | 'allow_session' | 'deny') => {
    try {
      await resolvePermission(request.sessionId, request.id, decision)
      setPermissionRequests((prev) => prev.filter((item) => item.id !== request.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

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
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setHasMessages(true)
    setStreaming(true)
    setToolEvents([])
    setError(null)
    currentAssistantIdRef.current = assistantId
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0

    try {
      const sdkSession = await ensureSdkSession()
      const updatedSession = {
        ...sdkSession,
        firstMessage: sdkSession.firstMessage || text,
        messageCount: Math.max(sdkSession.messageCount, 1),
        modified: new Date().toISOString(),
      }
      sdkSessionInfoRef.current = updatedSession
      onSessionCreated?.(updatedSession)
      const images = attachments ? await Promise.all(attachments.map((att) => fileToBase64(att.file))) : undefined
      await sendPrompt(sdkSession.id, { message: text, images })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStreaming(false)
      currentAssistantIdRef.current = null
      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantId ? { ...msg, content: `调用 Pi SDK 失败：${message}` } : msg
      )))
    }
  }, [ensureSdkSession, onSessionCreated])

  useEffect(() => {
    let cancelled = false
    sdkSessionIdRef.current = null
    sdkSessionInfoRef.current = null
    currentAssistantIdRef.current = null
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0
    setPermissionRequests([])
    eventSourceRef.current?.close()
    eventSourceRef.current = null

    // 使用 queueMicrotask 延迟同步状态重置，避免 react-hooks/set-state-in-effect
    queueMicrotask(() => {
      if (session?.sessionFile) {
        setMessages([])
        setHasMessages(true)
        createSession(undefined, session.sessionFile)
          .then(async (opened) => {
            if (cancelled) return
            sdkSessionIdRef.current = opened.id
            sdkSessionInfoRef.current = opened
            connectEvents(opened.id)
            const loadedMessages = await getMessages(opened.id)
            if (cancelled) return
            setMessages(loadedMessages.map((msg) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp,
            })))
          })
          .catch((err) => {
            if (!cancelled) {
              const message = err instanceof Error ? err.message : String(err)
              setError(`加载真实会话失败：${message}`)
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, toolEvents])

  const effectiveCwd = newSessionCwd ?? session?.cwd ?? selectedCwd
  const showChat = session !== null || newSessionCwd !== null
  const isEmptyNew = !!(session === null && newSessionCwd && !hasMessages)
  const isNewSession = !!(session && !hasMessages)

  if (!showChat && !selectedCwd) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 12 }}>
            教育智能体
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            请从侧边栏选择项目目录开始
          </div>
        </div>
      </div>
    )
  }

  if (!showChat && selectedCwd) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 15, color: 'var(--text-muted)' }}>
            Select a session from the sidebar
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0, flex: 1, lineHeight: 1.4 }}>
                <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>教育智能体</span>
                <span style={{ fontSize: 14, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  <Typewriter phrases={TYPEWRITER_PHRASES} />
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  教育智能体
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {APP_INSTITUTION}
                </span>
              </div>
            </div>
            <ChatInput ref={chatInputRef} onSend={handleSend} />
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
        fontSize: 13,
      }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>
          {session?.name || session?.firstMessage?.slice(0, 50) || 'Session'}
        </span>
        {effectiveCwd && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {effectiveCwd}
          </span>
        )}
      </div>

      {permissionRequests.length > 0 && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(245,158,11,0.10)' }}>
          {permissionRequests.map((request) => (
            <div key={request.id} style={{ maxWidth: 820, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>需要授权访问沙盒外资源</div>
                <div style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={request.path ?? request.command ?? request.reason}>
                  {request.operation} · {request.path ?? request.command ?? request.reason}
                </div>
              </div>
              <button onClick={() => handlePermissionDecision(request, 'allow_once')} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}>允许一次</button>
              <button onClick={() => handlePermissionDecision(request, 'allow_session')} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: 12 }}>本会话允许</button>
              <button onClick={() => handlePermissionDecision(request, 'deny')} style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(220,38,38,0.35)', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 12 }}>拒绝</button>
            </div>
          ))}
        </div>
      )}

      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', paddingTop: 16 }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 16px' }}>
          {messages.map((m, index) => {
            const isLast = index === messages.length - 1
            const isActiveAssistant = isLast && m.role === 'assistant' && streaming
            const isThinking = isActiveAssistant && !!m.thinkingContent && !m.content
            const hasText = !!m.content
            const showToolSummary = isLast && m.role === 'assistant' && toolEvents.length > 0
            return (
              <div key={m.id} style={{ marginBottom: m.role === 'user' ? 16 : 0 }}>
                {showToolSummary && (
                  <div style={{ marginBottom: 8 }}>
                    <ToolCallCard
                      tools={toolEvents}
                      collapsed={hasText}
                    />
                  </div>
                )}
                {m.thinkingContent && (
                  <div style={{ marginBottom: hasText ? 8 : 0 }}>
                    <ThinkingBlock
                      content={m.thinkingContent}
                      durationMs={m.thinkingDurationMs ?? 0}
                      isThinking={isThinking}
                    />
                  </div>
                )}
                {isActiveAssistant && !m.thinkingContent && !m.content && !toolEvents.length && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ display: 'inline-flex', gap: 3 }}>
                      {[0, 1, 2].map((i) => (
                        <span key={i} style={{
                          width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)',
                          animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                        }} />
                      ))}
                    </span>
                    <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>正在思考...</span>
                  </div>
                )}
                {hasText && (
                  <MessageView message={m} isStreaming={isLast && streaming} />
                )}
              </div>
            )
          })}
          {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput ref={chatInputRef} onSend={handleSend} isStreaming={streaming} />
    </div>
  )
}
