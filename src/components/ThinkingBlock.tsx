import { useState, useEffect } from 'react'

interface Props {
  content: string
  durationMs: number
  isThinking: boolean
}

export function ThinkingBlock({ content, durationMs, isThinking }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)

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

  if (!content) return null

  const displayMs = durationMs > 0 ? durationMs : elapsedMs
  const durationText = displayMs >= 1000
    ? `${(displayMs / 1000).toFixed(1)}s`
    : displayMs > 0
      ? `${displayMs}ms`
      : '...'

  return (
    <div style={{
      marginBottom: 8,
      background: 'var(--bg-hover)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%',
          padding: '8px 12px',
          background: 'none', border: 'none',
          color: 'var(--text-dim)', fontSize: 12,
          cursor: 'pointer', fontWeight: 500,
          textAlign: 'left',
          transition: 'background 0.12s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-selected)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        {isThinking ? (
          <span style={{
            width: 14, height: 14, borderRadius: '50%',
            border: '2px solid var(--accent)',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
            display: 'inline-block', flexShrink: 0,
          }} />
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        )}
        <span style={{ flex: 1 }}>
          {isThinking ? `思考中... ${durationText}` : `思考了 ${durationText}`}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
            flexShrink: 0,
          }}
        >
          <polyline points="2 4 6 8 10 4" />
        </svg>
      </button>

      {expanded && (
        <div style={{
          padding: '0 12px 10px',
          fontSize: 12, lineHeight: 1.6,
          color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 300, overflowY: 'auto',
          borderTop: '1px solid var(--border)',
          paddingTop: 8,
        }}>
          {content}
        </div>
      )}
    </div>
  )
}
