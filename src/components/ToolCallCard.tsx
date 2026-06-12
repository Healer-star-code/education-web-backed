import { useState } from 'react'

export interface ToolEventView {
  id: string
  label: string
  status: 'running' | 'done' | 'error'
}

interface Props {
  tools: ToolEventView[]
  collapsed?: boolean
}

const TOOL_LABEL_MAP: Record<string, string> = {
  grep: '搜索',
  find: '查找',
  read: '读取',
  ls: '浏览',
  bash: '运行',
  edit: '编辑',
  write: '写入',
}

function getToolVerb(label: string): string {
  return TOOL_LABEL_MAP[label] ?? label
}

function ToolIcon({ status }: { status: ToolEventView['status'] }) {
  if (status === 'running') {
    return (
      <span style={{
        width: 12, height: 12, borderRadius: '50%',
        border: '1.5px solid var(--accent)',
        borderTopColor: 'transparent',
        animation: 'spin 0.8s linear infinite',
        display: 'inline-block',
        flexShrink: 0,
      }} />
    )
  }
  if (status === 'done') {
    return (
      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="var(--text-dim)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <polyline points="2.5 7.5 5.5 10.5 11.5 4.5" />
      </svg>
    )
  }
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#f97316" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" />
      <line x1="10.5" y1="3.5" x2="3.5" y2="10.5" />
    </svg>
  )
}

function buildSummary(tools: ToolEventView[]): string {
  const byLabel = new Map<string, { running: number; done: number; error: number }>()
  for (const t of tools) {
    const entry = byLabel.get(t.label) ?? { running: 0, done: 0, error: 0 }
    entry[t.status]++
    byLabel.set(t.label, entry)
  }

  const parts: string[] = []
  for (const [label, counts] of byLabel) {
    const verb = getToolVerb(label)
    const total = counts.running + counts.done + counts.error
    if (counts.running > 0) {
      parts.push(`正在${verb}...`)
    } else {
      parts.push(`已${verb} ${total} 次`)
    }
  }
  return parts.join(' · ')
}

export function ToolCallCard({ tools, collapsed: forceCollapsed }: Props) {
  const [expanded, setExpanded] = useState(false)

  if (tools.length === 0) return null

  const hasRunning = tools.some((t) => t.status === 'running')
  const autoCollapsed = forceCollapsed ?? !hasRunning
  const isExpanded = expanded && !autoCollapsed

  const summary = buildSummary(tools)

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 4,
      margin: '6px 0',
    }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: hasRunning ? 'rgba(37,99,235,0.06)' : 'var(--bg-hover)',
          border: 'none',
          borderRadius: 6,
          padding: '3px 8px',
          color: hasRunning ? 'var(--accent)' : 'var(--text-dim)',
          fontSize: 12,
          cursor: 'pointer',
          textAlign: 'left',
          maxWidth: '100%',
          fontWeight: hasRunning ? 500 : 400,
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        {hasRunning ? (
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            border: '1.5px solid var(--accent)',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
            display: 'inline-block',
            flexShrink: 0,
          }} />
        ) : (
          <svg width="10" height="10" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.5 }}>
            <polyline points="2.5 7.5 5.5 10.5 11.5 4.5" />
          </svg>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary}
        </span>
        <svg
          width="8" height="8" viewBox="0 0 10 10" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{
            transform: isExpanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
            marginLeft: 'auto',
            flexShrink: 0,
            opacity: 0.4,
          }}
        >
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {isExpanded && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 2,
          paddingLeft: 18,
          borderLeft: '1px solid var(--border)',
          marginLeft: 14,
        }}>
          {tools.map((tool) => (
            <div key={tool.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '1px 0' }}>
              <ToolIcon status={tool.status} />
              <span style={{
                color: tool.status === 'running' ? 'var(--text-muted)' : tool.status === 'error' ? '#f97316' : 'var(--text-dim)',
                fontWeight: tool.status === 'running' ? 500 : 400,
              }}>
                {getToolVerb(tool.label)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
