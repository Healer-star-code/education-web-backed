import { useState, useRef, useEffect, useCallback } from 'react'
import type { SessionInfo, Message, FileNode, MessageAttachment } from '../mockData'
import { mockMessages } from '../mockData'
import { MessageView } from './MessageView'
import { ChatInput, type ChatInputHandle } from './ChatInput'
import { Typewriter } from './Typewriter'

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

function generateResponse(userInput: string): string {
  const responses = [
    `好的，关于"${userInput.slice(0, 30)}${userInput.length > 30 ? '...' : ''}"这个问题，我来给你详细分析一下：

## 核心概念

1. **基础原理**：这个问题涉及教育领域的关键知识点
2. **教学建议**：可以通过互动式教学来帮助学生理解
3. **实践应用**：结合实际案例进行讲解效果更好

\`\`\`python
def explain_concept():
    print("这是一个概念演示")
    return {"status": "ok", "message": "理解成功"}
\`\`\`

> **教学提示**：建议使用分步讲解的方式，让学生逐步理解。

需要我进一步展开某个部分吗？`,

    `这是一个很好的问题。从教育角度来看：

## 教学方法建议

| 方法 | 适用场景 | 效果 |
|------|----------|------|
| 案例教学 | 概念引入 | 很好 |
| 小组讨论 | 深入理解 | 较好 |
| 实践操作 | 技能掌握 | 很好 |

**关键点**：
- 先理解概念
- 再动手实践
- 最后总结归纳

有什么具体的方面需要我详细展开吗？`,

    `关于这个问题，我有以下几点建议：

### 1. 教学设计
- **引入阶段**：用生活实例激发兴趣
- **讲解阶段**：分步骤、有层次
- **练习阶段**：由浅入深

### 2. 示例代码
\`\`\`typescript
function createQuiz(questions: string[]) {
  return {
    title: "课堂测验",
    questions: questions.map(q => ({
      text: q,
      difficulty: 'medium'
    }))
  };
}
\`\`\`

### 3. 总结
通过以上方法，可以有效帮助学生理解和掌握知识点。`,
  ]

  return responses[Math.floor(Math.random() * responses.length)]
}

export function ChatArea({ session, selectedCwd, newSessionCwd, chatInputRef }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [hasSent, setHasSent] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleSend = useCallback((text: string, attachments?: MessageAttachment[]) => {
    const userMsg: Message = {
      id: 'u' + Date.now(),
      role: 'user',
      content: text,
      attachments,
      timestamp: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMsg])
    setHasSent(true)
    setStreaming(true)

    setTimeout(() => {
      const aiMsg: Message = {
        id: 'a' + Date.now(),
        role: 'assistant',
        content: generateResponse(text || (attachments && attachments.length > 0 ? '这张图片' : '')),
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, aiMsg])
      setStreaming(false)
    }, 600 + Math.random() * 1000)
  }, [])

  useEffect(() => {
    if (session) {
      setMessages(mockMessages)
      setHasSent(true)
    } else {
      setMessages([])
      setHasSent(false)
    }
  }, [session?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const effectiveCwd = newSessionCwd ?? session?.cwd ?? selectedCwd
  const showChat = session !== null || newSessionCwd !== null
  const isEmptyNew = !!(session === null && newSessionCwd)
  const isNewSession = !!(session && !hasSent)

  // State A: No session, no cwd - initial empty
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

  // State B: Cwd selected, no session - ready for new session
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

  // State C: Welcome screen for new session or session with no messages
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
                  web <span style={{ color: 'var(--text)' }}>v0.6.13</span>
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  pi <span style={{ color: 'var(--text)' }}>v0.78.0</span>
                </span>
              </div>
            </div>
            <ChatInput ref={chatInputRef} onSend={handleSend} />
          </div>
        </div>
      </div>
    )
  }

  // State D: Session with messages
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Header */}
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

      {/* Messages */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', paddingTop: 16 }}>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 16px' }}>
          {messages.map((m) => (
            <MessageView key={m.id} message={m} />
          ))}
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
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <ChatInput ref={chatInputRef} onSend={handleSend} isStreaming={streaming} />
    </div>
  )
}
