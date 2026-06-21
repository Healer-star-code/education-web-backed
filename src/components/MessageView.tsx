import { memo, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Message } from '../mockData'
import { ArtifactCard, AttachmentCard } from './FileCard'

interface Props {
  message: Message
  isStreaming?: boolean
  showTimestamp?: boolean
}

/**
 * 单条 assistant 消息超过此阈值时（且非流式状态），默认只渲染前 N 字 + 折叠按钮。
 *
 * 原因：长任务（生成 Word/Excel 等）流式期间，每个 SSE delta 都会让 ReactMarkdown
 * 重新解析整段文本，几千字以上的 markdown 会让主线程卡顿，最终窗口白屏。
 * 截断后超长尾部需要用户点开才完整渲染，平时只渲染头部足够展示。
 *
 * 注意：流式期间永远不截断（性能保护靠 memo + delta 节流就够了）。
 * 流式中截断 = 砍在 markdown token 中间 → react-markdown 解析炸 → 渲染错误页。
 */
const LONG_MESSAGE_THRESHOLD = 50_000

/**
 * 在段落/行/句子边界做安全截断，避免砍在 markdown token 中间
 * 导致 react-markdown 解析失败（未闭合代码围栏、半截链接、半截 HTML 等）。
 *
 * 策略：从 hardLimit 位置向前找最近的安全边界。
 * 优先级：双换行（段落）> 单换行 > 中文句号 > 英文句号+空格 > 空格 > 兜底硬切。
 */
function safeTruncateAtBoundary(text: string, hardLimit: number): string {
  if (text.length <= hardLimit) return text
  const SAFE_MARGIN = 2000  // 在 hardLimit 前 2KB 内找边界
  const start = Math.max(0, hardLimit - SAFE_MARGIN)
  const window = text.slice(start, hardLimit)
  const candidates: { sep: string; len: number }[] = [
    { sep: '\n\n', len: 2 },
    { sep: '\n', len: 1 },
    { sep: '。', len: 1 },
    { sep: '. ', len: 2 },
    { sep: ' ', len: 1 },
  ]
  for (const { sep, len } of candidates) {
    const idx = window.lastIndexOf(sep)
    if (idx >= 0) return text.slice(0, start + idx + len)
  }
  // 兜底：实在找不到边界（罕见，如超长无空白字符串）就硬切
  return text.slice(0, hardLimit)
}

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text)
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return Promise.resolve()
  } catch {
    return Promise.reject()
  }
}

function MessageViewInner({ message, isStreaming }: Props) {
  if (message.role === 'user') {
    return <UserMessageView message={message} />
  }
  if (message.role === 'assistant') {
    return <AssistantMessageView message={message} isStreaming={isStreaming} />
  }
  return null
}

/**
 * 自定义浅比较：只在真正影响显示的字段变化时才重渲染。
 *
 * 之前每次 setMessages(prev => prev.map(...)) 都会让所有 MessageView 重渲染，
 * 长会话 + 流式 delta 高频更新时是性能灾难。
 */
function arePropsEqual(prev: Props, next: Props): boolean {
  if (prev.isStreaming !== next.isStreaming) return false
  if (prev.showTimestamp !== next.showTimestamp) return false
  const a = prev.message
  const b = next.message
  if (a === b) return true
  if (a.id !== b.id) return false
  if (a.role !== b.role) return false
  if (a.content !== b.content) return false
  if (a.timestamp !== b.timestamp) return false
  if ((a.attachments?.length ?? 0) !== (b.attachments?.length ?? 0)) return false
  if ((a.artifacts?.length ?? 0) !== (b.artifacts?.length ?? 0)) return false
  // 附件 / artifact 的引用变化也视为变化（FileCard 的 localPath 回填会换引用）
  if (a.attachments !== b.attachments) return false
  if (a.artifacts !== b.artifacts) return false
  // steps 也需要比较：流式 thinking_delta / tool_update / skill_load 都会换 steps 数组
  if ((a.steps?.length ?? 0) !== (b.steps?.length ?? 0)) return false
  if (a.steps !== b.steps) return false
  // pendingTask 切换（生成 word 的提示卡片显示/隐藏）也要触发重渲染
  if (a.pendingTask !== b.pendingTask) return false
  return true
}

export const MessageView = memo(MessageViewInner, arePropsEqual)

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function UserMessageView({ message }: { message: Message }) {
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyContent = () => {
    copyText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const hasAttachments = !!(message.attachments && message.attachments.length > 0)
  const hasContent = message.content.trim().length > 0

  return (
    <div
      style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, maxWidth: '85%' }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            background: 'var(--user-bg)',
            border: '1px solid var(--user-border)',
            borderRadius: '12px 12px 4px 12px',
            padding: hasAttachments ? '6px' : '8px 12px',
            fontSize: 'var(--msg-font-size, var(--font-base))',
            lineHeight: 'var(--msg-line-height, 1.6)',
            color: 'var(--text)',
            wordBreak: 'break-word',
          }}
        >
          {hasAttachments && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: hasContent ? 6 : 0 }}>
              {message.attachments!.map((att) => {
                // 已经被上传/复制到 <cwd>/.uploads/ 的附件 → 走 ArtifactCard 三按钮（保存/打开/文件夹）
                // 没有 localPath 的（浏览器旧消息 / 失败 fallback）→ 走旧的 AttachmentCard（点击下载）
                if (att.localPath) {
                  const kind = att.type === 'image' ? 'image'
                    : att.type === 'pdf' ? 'pdf'
                    : att.type === 'spreadsheet' ? 'spreadsheet'
                    : att.type === 'presentation' ? 'presentation'
                    : att.type === 'document' ? 'word'
                    : att.type === 'text' ? 'text'
                    : 'file'
                  return (
                    <ArtifactCard
                      key={att.id}
                      hideActions
                      artifact={{
                        id: 'upload-' + att.id,
                        sessionId: '',
                        name: att.name,
                        path: att.localPath,
                        localPath: att.localPath,
                        mimeType: att.mimeType ?? 'application/octet-stream',
                        size: att.size ?? 0,
                        kind,
                        timeCreated: Date.now(),
                        source: 'local-scan',
                      }}
                    />
                  )
                }
                return <AttachmentCard key={att.id} attachment={att} />
              })}
            </div>
          )}
          {hasContent && (
            <div style={{ padding: hasAttachments ? '4px 6px 6px' : 0, whiteSpace: 'pre-wrap' }}>
              {message.content}
            </div>
          )}
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 6, marginTop: 3,
      }}>
        <div style={{
          display: 'flex', gap: 3,
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? 'auto' : 'none',
          transition: 'opacity 0.12s',
        }}>
          <button
            onClick={copyContent}
            title="复制消息"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', height: 'var(--toolbar-btn-height, 22px)',
              background: 'none', border: 'none',
              borderRadius: 'var(--radius-xs)',
              color: copied ? 'var(--accent)' : 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: 'var(--toolbar-font-size, var(--font-xs))', fontWeight: 400,
              whiteSpace: 'nowrap',
              transition: 'color 0.12s',
            }}
            onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-dim)' }}
          >
            {copied ? (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
            {copied ? '已复制' : '复制'}
          </button>
        </div>
        {message.timestamp && (
          <span style={{ fontSize: 'var(--timestamp-size, var(--font-xs))', color: 'var(--text-dim)' }}>{formatTime(message.timestamp)}</span>
        )}
      </div>
    </div>
  )
}

function AssistantMessageView({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)
  const [expandFull, setExpandFull] = useState(false)

  const copyContent = () => {
    copyText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  // 超长消息保护：仅在「非流式 + 内容真的超长 + 用户没点展开」三个条件同时满足时截断。
  // 流式中绝对不截断（避免砍在 markdown token 中间炸 react-markdown 解析）。
  const fullContent = message.content ?? ''
  const shouldTruncate = !isStreaming && fullContent.length > LONG_MESSAGE_THRESHOLD && !expandFull
  const renderedContent = shouldTruncate
    ? safeTruncateAtBoundary(fullContent, LONG_MESSAGE_THRESHOLD)
    : fullContent
  const isTooLong = fullContent.length > LONG_MESSAGE_THRESHOLD

  // 缓存 ReactMarkdown 节点：只有 renderedContent 变了才重新解析高亮。
  // 这是性能修复的核心：之前每个 delta 都让整段重做 ReactMarkdown + Prism。
  const markdownNode = useMemo(() => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const lang = className?.replace('language-', '').toLowerCase() ?? ''
          const raw = String(children)
          const isBlock = className?.includes('language-') || raw.includes('\n')
          if (isBlock) {
            return <CodeBlock code={raw.replace(/\n$/, '')} lang={lang} />
          }
          return (
            <code
              style={{
                background: 'var(--bg-selected)',
                padding: '1px 4px',
                borderRadius: 'var(--radius-xs)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9em',
              }}
              {...props}
            >
              {children}
            </code>
          )
        },
        pre({ children }) {
          return <>{children}</>
        },
      }}
    >
      {renderedContent}
    </ReactMarkdown>
  ), [renderedContent])

  return (
    <div
      style={{ marginBottom: 16 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="markdown-body">
          {markdownNode}
        </div>
        {shouldTruncate && (
          <button
            onClick={() => setExpandFull(true)}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'var(--bg-panel)',
              color: 'var(--text)',
              fontSize: 'var(--font-xs)',
              cursor: 'pointer',
            }}
            title="超长消息默认折叠，避免卡顿"
          >
            展开剩余 {(fullContent.length - renderedContent.length).toLocaleString()} 字
          </button>
        )}
        {/* isStreaming 期间用 isTooLong 做提示但不截断 */}
        {isStreaming && isTooLong && (
          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', marginTop: 4 }}>
            消息较长（{fullContent.length.toLocaleString()} 字），完整生成后会自动优化显示
          </div>
        )}
        {message.artifacts && message.artifacts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {message.artifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} />)}
          </div>
        )}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
      }}>
        <button
          onClick={copyContent}
          title="复制消息"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', height: 22,
            background: 'none', border: 'none',
            borderRadius: 'var(--radius-xs)',
            color: copied ? 'var(--accent)' : 'var(--text-dim)',
            cursor: 'pointer',
              fontSize: 'var(--font-xs)', fontWeight: 400,
            whiteSpace: 'nowrap',
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? 'auto' : 'none',
            transition: 'opacity 0.12s, color 0.12s',
          }}
          onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'var(--text-dim)' }}
        >
          {copied ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          )}
          {copied ? '已复制' : '复制'}
        </button>
        {!isStreaming && message.timestamp && (
          <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', marginLeft: 'auto' }}>
            {formatTime(message.timestamp)}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * 代码块组件：Prism 高亮非常重，必须 memo。
 *
 * 之前同一条 assistant 消息的多个代码块在每次 delta 后都会重新高亮一遍。
 * memo 后只有 code 或 lang 真变化时才重做高亮。
 *
 * 此外，超长代码（> 20KB）禁用高亮以避免主线程长时间阻塞：直接用 <pre><code> 渲染。
 */
const CODE_HIGHLIGHT_MAX = 20_000

const CodeBlock = memo(function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    copyText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const tooLong = code.length > CODE_HIGHLIGHT_MAX

  return (
    <div
      style={{
        position: 'relative',
        marginTop: 8,
        marginBottom: 8,
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        background: 'var(--code-bg)',
      }}
    >
      <div
        style={{
          padding: '6px 14px',
          background: 'rgba(255,255,255,0.06)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          fontSize: 'var(--font-xs)',
          color: 'var(--text-dim)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>{lang || 'text'}{tooLong ? ' · 内容过长，已禁用高亮' : ''}</span>
        <button
          onClick={copy}
          title={copied ? '已复制' : '复制代码'}
          style={{
            background: 'none',
            border: 'none',
            color: copied ? 'var(--success)' : 'var(--text-dim)',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: 'var(--radius-xs)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 'var(--font-xs)',
          }}
          onMouseEnter={(e) => { if (!copied) e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
          onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}
        >
          {copied ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              已复制
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              复制
            </span>
          )}
        </button>
      </div>
      {tooLong ? (
        <pre
          style={{
            margin: 0,
            padding: '14px 16px',
            fontSize: '0.929rem',
            lineHeight: 1.65,
            background: 'var(--code-bg)',
            color: 'var(--code-text)',
            fontFamily: 'var(--font-mono)',
            overflow: 'auto',
            maxHeight: 480,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <code>{code}</code>
        </pre>
      ) : (
        <SyntaxHighlighter
          language={lang || 'text'}
          style={oneDark}
          showLineNumbers={false}
          customStyle={{
            margin: 0,
            padding: '14px 16px',
            fontSize: '0.929rem',
            lineHeight: 1.65,
            borderRadius: 0,
            background: 'var(--code-bg)',
          }}
          codeTagProps={{ style: { fontFamily: 'var(--font-mono)', color: 'var(--code-text)' } }}
        >
          {code}
        </SyntaxHighlighter>
      )}
    </div>
  )
})
