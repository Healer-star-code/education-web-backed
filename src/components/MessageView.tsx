import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { Message } from '../mockData'

interface Props {
  message: Message
  isStreaming?: boolean
  showTimestamp?: boolean
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

export function MessageView({ message, isStreaming }: Props) {
  if (message.role === 'user') {
    return <UserMessageView message={message} />
  }
  if (message.role === 'assistant') {
    return <AssistantMessageView message={message} isStreaming={isStreaming} />
  }
  return null
}

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
            border: '1px solid rgba(59,130,246,0.2)',
            borderRadius: '12px 12px 4px 12px',
            padding: hasAttachments ? '6px' : '8px 12px',
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--text)',
            wordBreak: 'break-word',
          }}
        >
          {hasAttachments && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: hasContent ? 6 : 0 }}>
              {message.attachments!.map((att) => (
                <a
                  key={att.id}
                  href={att.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'block',
                    width: 160,
                    height: 160,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid rgba(59,130,246,0.2)',
                    background: 'rgba(0,0,0,0.04)',
                  }}
                >
                  <img
                    src={att.url}
                    alt={att.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </a>
              ))}
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
            title="Copy message"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', height: 22,
              background: 'none', border: 'none',
              borderRadius: 5,
              color: copied ? 'var(--accent)' : 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: 11, fontWeight: 400,
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
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {message.timestamp && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{formatTime(message.timestamp)}</span>
        )}
      </div>
    </div>
  )
}

function AssistantMessageView({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
  const [hovered, setHovered] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyContent = () => {
    copyText(message.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div
      style={{ marginBottom: 16 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="markdown-body">
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
                      borderRadius: 3,
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
            {message.content}
          </ReactMarkdown>
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginTop: 4,
      }}>
        <button
          onClick={copyContent}
          title="Copy message"
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', height: 22,
            background: 'none', border: 'none',
            borderRadius: 5,
            color: copied ? 'var(--accent)' : 'var(--text-dim)',
            cursor: 'pointer',
            fontSize: 11, fontWeight: 400,
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
          {copied ? 'Copied' : 'Copy'}
        </button>
        {!isStreaming && message.timestamp && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
            {formatTime(message.timestamp)}
          </span>
        )}
      </div>
    </div>
  )
}

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    copyText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div
      style={{
        position: 'relative',
        marginTop: 8,
        marginBottom: 8,
        borderRadius: 10,
        overflow: 'hidden',
        background: '#1a1a2e',
      }}
    >
      <div
        style={{
          padding: '6px 14px',
          background: 'rgba(255,255,255,0.06)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          fontSize: 11,
          color: 'rgba(255,255,255,0.5)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>{lang || 'text'}</span>
        <button
          onClick={copy}
          title={copied ? '已复制' : '复制代码'}
          style={{
            background: 'none',
            border: 'none',
            color: copied ? '#4ade80' : 'rgba(255,255,255,0.45)',
            cursor: 'pointer',
            padding: '2px 4px',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
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
      <SyntaxHighlighter
        language={lang || 'text'}
        style={oneDark}
        showLineNumbers={false}
        customStyle={{
          margin: 0,
          padding: '14px 16px',
          fontSize: 13,
          lineHeight: 1.65,
          borderRadius: 0,
          background: '#1a1a2e',
        }}
        codeTagProps={{ style: { fontFamily: 'var(--font-mono)' } }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
