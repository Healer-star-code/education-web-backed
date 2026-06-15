import { useState, useRef, useEffect, useCallback } from 'react'
import type { SessionInfo, Message, MessageAttachment, LocalAttachment, AgentStep } from '../mockData'
import { MessageView } from './MessageView'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { Typewriter } from './Typewriter'
import { ToolCallRow } from './ToolCallCard'
import { ThinkingBlock } from './ThinkingBlock'
import { fileToBase64 } from '../lib/image'
import { connectSessionEvents, createSession, getMessages, sendPrompt, type WebAgentEvent } from '../lib/piApi'

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

export function ChatArea({ session, selectedCwd, newSessionCwd, chatInputRef, onSessionCreated }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMessages, setHasMessages] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sdkSessionIdRef = useRef<string | null>(null)
  const sdkSessionInfoRef = useRef<SessionInfo | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const currentAssistantIdRef = useRef<string | null>(null)
  const currentThinkingRef = useRef<string>('')
  const currentThinkingStartRef = useRef<number>(0)
  const currentThinkingStepIdRef = useRef<string | null>(null)

  const handleAgentEvent = useCallback((event: WebAgentEvent) => {
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
        setMessages((prev) => prev.map((msg) => {
          if (msg.id !== assistantId || !msg.steps) return msg
          return { ...msg, steps: msg.steps.map((s) => (
            s.type === 'tool' && s.id === event.toolCallId ? { ...s, partialResult: event.partialResult } : s
          )) }
        }))
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
      steps: [],
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setHasMessages(true)
    setStreaming(true)
    setError(null)
    currentAssistantIdRef.current = assistantId
    currentThinkingRef.current = ''
    currentThinkingStartRef.current = 0
    currentThinkingStepIdRef.current = null

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
    currentThinkingStepIdRef.current = null
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
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              timestamp: msg.timestamp,
              steps: [],
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
  }, [messages])

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
            请从侧边栏选择会话
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
          {session?.name || session?.firstMessage?.slice(0, 50) || '会话'}
        </span>
        {effectiveCwd && (
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {effectiveCwd}
          </span>
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
                {hasSteps && m.steps!.map((step) => {
                  if (step.type === 'thinking') {
                    return (
                      <ThinkingBlock
                        key={step.id}
                        content={step.content}
                        durationMs={step.durationMs}
                        isThinking={step.isThinking}
                      />
                    )
                  }
                  return (
                    <ToolCallRow key={step.id} tool={step} />
                  )
                })}
                {!hasSteps && isActiveAssistant && !m.content && (
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
