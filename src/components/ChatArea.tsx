import { useState, useRef, useEffect, useCallback } from 'react'
import type { SessionInfo, Message, FileNode, MessageAttachment, LocalAttachment } from '../mockData'
import { mockMessages } from '../mockData'
import { MessageView } from './MessageView'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { Typewriter } from './Typewriter'
import { fileToBase64 } from '../lib/image'
import { connectSessionEvents, createSession, getMessages, sendPrompt, type WebAgentEvent } from '../lib/piApi'

interface Props {
  session: SessionInfo | null
  selectedCwd: string | null
  newSessionCwd: string | null
  fileTree: FileNode[]
  chatInputRef: React.RefObject<ChatInputHandle | null>
}

const TYPEWRITER_PHRASES = [
  'ready when you are.',
  'ask me anything.',
  "let's build something cool.",
  'explore your codebase.',
  'draft a lesson plan.',
  'summarize that paper.',
  'plan your curriculum.',
  'explain it like I\'m five.',
  'pair-program with me.',
  'fix that pesky bug.',
  'translate to 中文.',
  'write a haiku.',
  'brainstorm ideas.',
  'review my pull request.',
  'ship it.',
  'make it pretty.',
  'rubber-duck with me.',
]

interface ToolEventView {
  id: string
  label: string
  status: 'running' | 'done' | 'error'
}

function toMessageAttachments(attachments: LocalAttachment[] | undefined): MessageAttachment[] | undefined {
  if (!attachments || attachments.length === 0) return undefined
  return attachments.map((att) => ({
    id: att.id,
    name: att.name,
    url: att.url,
    type: 'image',
  }))
}

export function ChatArea({ session, selectedCwd, newSessionCwd, chatInputRef }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [hasSent, setHasSent] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [toolEvents, setToolEvents] = useState<ToolEventView[]>([])
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const sdkSessionIdRef = useRef<string | null>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const currentAssistantIdRef = useRef<string | null>(null)

  const handleAgentEvent = useCallback((event: WebAgentEvent) => {
    switch (event.type) {
      case 'agent_start':
        setStreaming(true)
        setError(null)
        break
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
      case 'agent_end':
        setStreaming(false)
        currentAssistantIdRef.current = null
        break
      case 'error':
        setError(event.message)
        setStreaming(false)
        break
    }
  }, [])

  const connectEvents = useCallback((sessionId: string) => {
    if (eventSourceRef.current) return
    eventSourceRef.current = connectSessionEvents(sessionId, handleAgentEvent)
    eventSourceRef.current.onerror = () => {
      setError('与 SDK 后端的事件连接已断开')
    }
  }, [handleAgentEvent])

  const ensureSdkSession = useCallback(async () => {
    if (sdkSessionIdRef.current) return sdkSessionIdRef.current
    const cwd = newSessionCwd ?? session?.cwd ?? selectedCwd ?? undefined
    const created = await createSession(cwd)
    sdkSessionIdRef.current = created.id
    connectEvents(created.id)
    return created.id
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
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setHasSent(true)
    setStreaming(true)
    setToolEvents([])
    setError(null)
    currentAssistantIdRef.current = assistantId

    try {
      const sessionId = await ensureSdkSession()
      const images = attachments ? await Promise.all(attachments.map((att) => fileToBase64(att.file))) : undefined
      await sendPrompt(sessionId, { message: text, images })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setStreaming(false)
      currentAssistantIdRef.current = null
      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantId ? { ...msg, content: `调用 Pi SDK 失败：${message}` } : msg
      )))
    }
  }, [ensureSdkSession])

  useEffect(() => {
    let cancelled = false
    sdkSessionIdRef.current = null
    currentAssistantIdRef.current = null
    eventSourceRef.current?.close()
    eventSourceRef.current = null

    if (session?.sessionFile) {
      setMessages([])
      setHasSent(true)
      createSession(undefined, session.sessionFile)
        .then(async (opened) => {
          if (cancelled) return
          sdkSessionIdRef.current = opened.id
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
        .catch(() => {
          if (!cancelled) setMessages(mockMessages)
        })
    } else if (session) {
      setMessages(mockMessages)
      setHasSent(true)
    } else {
      setMessages([])
      setHasSent(false)
    }

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
  const isEmptyNew = !!(session === null && newSessionCwd)
  const isNewSession = !!(session && !hasSent)

  if (!showChat && !selectedCwd) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', marginBottom: 12 }}>
            web 模拟版本1
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
                <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)' }}>web 模拟版本1</span>
                <span style={{ fontSize: 14, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  <Typewriter phrases={TYPEWRITER_PHRASES} />
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  web <span style={{ color: 'var(--text)' }}>mock-v1</span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  sdk <span style={{ color: 'var(--text)' }}>pi</span>
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

      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', paddingTop: 16 }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 16px' }}>
          {messages.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
          {toolEvents.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginBottom: 10 }}>
              {toolEvents.map((tool) => (
                <span key={tool.id} style={{ fontSize: 12, color: tool.status === 'error' ? '#ef4444' : 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {tool.status === 'running' ? '正在调用' : tool.status === 'done' ? '已完成' : '调用失败'} {tool.label}
                </span>
              ))}
            </div>
          )}
          {streaming && (
            <div style={{ padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>Thinking...</span>
              <span style={{ display: 'inline-flex', gap: 3 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{
                    width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)',
                    animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </span>
            </div>
          )}
          {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput ref={chatInputRef} onSend={handleSend} isStreaming={streaming} />
    </div>
  )
}
