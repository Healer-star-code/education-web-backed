import { useState, useEffect, useRef } from 'react'

interface Props {
  content: string
  durationMs: number
  isThinking: boolean
}

export function ThinkingBlock({ content, durationMs, isThinking }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isThinking || durationMs > 0) return
    const start = Date.now()
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - start)
    }, 200)
    return () => clearInterval(timer)
  }, [isThinking, durationMs])

  useEffect(() => {
    if (isThinking && content) {
      setExpanded(true)
    }
    if (!isThinking && durationMs > 0) {
      setExpanded(false)
    }
  }, [isThinking, durationMs, content])

  // Auto-scroll thinking content to bottom when expanded or content updates
  useEffect(() => {
    if (expanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [expanded, content])

  if (!content) return null

  const displayMs = durationMs > 0 ? durationMs : elapsedMs
  const durationText = displayMs >= 1000
    ? `${(displayMs / 1000).toFixed(1)}秒`
    : displayMs > 0
      ? `${displayMs}毫秒`
      : ''

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px',
          background: 'none', border: 'none',
          color: 'var(--text-dim)', fontSize: 'var(--font-sm)',
          cursor: 'pointer', fontWeight: 500,
          textAlign: 'left',
          borderRadius: 'var(--radius-sm)',
          transition: 'background 0.12s, opacity 0.3s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        {isThinking ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, animation: 'pulse-opacity 1.5s ease-in-out infinite' }}>
            <path d="M12 2a8 8 0 0 1 8 8c0 3.4-2.1 6.3-5 7.5V19a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1.5C6.1 16.3 4 13.4 4 10a8 8 0 0 1 8-8z" />
            <line x1="9" y1="22" x2="15" y2="22" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M12 2a8 8 0 0 1 8 8c0 3.4-2.1 6.3-5 7.5V19a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1.5C6.1 16.3 4 13.4 4 10a8 8 0 0 1 8-8z" />
            <line x1="9" y1="22" x2="15" y2="22" />
          </svg>
        )}
        <span style={{ flex: 1 }}>
          {isThinking ? '思考中' : `思考了 ${durationText}`}
        </span>
        <svg
          width="11" height="11" viewBox="0 0 12 12" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
            flexShrink: 0,
            opacity: 0.5,
          }}
        >
          <polyline points="2 4 6 8 10 4" />
        </svg>
      </button>

      {expanded && (
        <div ref={contentRef} style={{
          padding: '6px 12px 8px',
          fontSize: 'calc(var(--font-base) * 0.929)', lineHeight: 'var(--msg-line-height, 1.7)',
          color: 'var(--text-muted)',
          whiteSpace: 'pre-line', wordBreak: 'break-word',
          maxHeight: 300, overflowY: 'auto',
          background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-sm)',
          marginTop: 2,
        }}>
          {content}
        </div>
      )}
    </div>
  )
}
