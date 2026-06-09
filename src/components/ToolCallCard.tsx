import { useState } from 'react'

export interface ToolEventView {
  id: string
  label: string
  status: 'running' | 'done' | 'error'
}

interface Props {
  tools: ToolEventView[]
}

function ToolIcon({ status }: { status: ToolEventView['status'] }) {
  if (status === 'running') {
    return (
      <span style={{
        width: 14, height: 14, borderRadius: '50%',
        border: '2px solid var(--accent)',
        borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite',
        display: 'inline-block',
        flexShrink: 0,
      }} />
    )
  }
  if (status === 'done') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <polyline points="2.5 7.5 5.5 10.5 11.5 4.5" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#f97316" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" />
      <line x1="10.5" y1="3.5" x2="3.5" y2="10.5" />
    </svg>
  )
}

export function ToolCallCard({ tools }: Props) {
  const [expanded, setExpanded] = useState(false)

  const doneCount = tools.filter((t) => t.status === 'done').length
  const errorCount = tools.filter((t) => t.status === 'error').length
  const runningCount = tools.filter((t) => t.status === 'running').length

  const summaryParts: string[] = []
  if (doneCount > 0) summaryParts.push(`✓ ${doneCount}`)
  if (errorCount > 0) summaryParts.push(`✗ ${errorCount}`)
  if (runningCount > 0) summaryParts.push(`◌ ${runningCount}`)

  const uniqueLabels = [...new Set(tools.map((t) => t.label))]
  const labelText = uniqueLabels.slice(0, 3).join(', ') + (uniqueLabels.length > 3 ? '...' : '')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'none', border: 'none', padding: 0,
          color: 'var(--text-dim)', fontSize: 12,
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500 }}>
          {summaryParts.join('  ')}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>{labelText}</span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
            marginLeft: 'auto',
            flexShrink: 0,
          }}
        >
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 4 }}>
          {tools.map((tool) => (
            <div key={tool.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <ToolIcon status={tool.status} />
              <span style={{
                color: tool.status === 'error' ? '#f97316' : 'var(--text-dim)',
                fontWeight: tool.status === 'running' ? 500 : 400,
              }}>
                {tool.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
