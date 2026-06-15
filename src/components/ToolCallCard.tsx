import { useState, useEffect } from 'react'
import type { ToolCallInfo } from '../mockData'

interface Props {
  toolCalls: ToolCallInfo[]
}

const TOOL_META: Record<string, { label: string; pastTense: string }> = {
  grep: { label: '搜索', pastTense: '已搜索' },
  find: { label: '查找', pastTense: '已查找' },
  glob: { label: '查找', pastTense: '已查找' },
  read: { label: '读取', pastTense: '已读取' },
  ls: { label: '浏览', pastTense: '已浏览' },
  bash: { label: '运行', pastTense: '已运行' },
  edit: { label: '编辑', pastTense: '已编辑' },
  write: { label: '写入', pastTense: '已写入' },
}

function getToolMeta(name: string) {
  return TOOL_META[name] ?? { label: name, pastTense: name }
}

const TOOL_ICON: Record<string, string> = {
  grep: '🔍', find: '🔍', glob: '🔍',
  read: '📖', ls: '📁', bash: '▶',
  edit: '✏️', write: '📝',
}

function extractContext(name: string, args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const a = args as Record<string, unknown>
  switch (name) {
    case 'read':
    case 'edit':
    case 'write':
      return String(a.filePath ?? a.path ?? '')
    case 'bash':
      return String(a.command ?? '')
    case 'grep':
    case 'find':
    case 'glob':
      return String(a.pattern ?? a.path ?? '')
    case 'ls':
      return String(a.path ?? '')
    default:
      if (a.filePath) return String(a.filePath)
      if (a.path) return String(a.path)
      if (a.command) return String(a.command)
      if (a.pattern) return String(a.pattern)
      return ''
  }
}

function truncateContext(ctx: string, max = 50): string {
  if (!ctx) return ''
  if (ctx.length <= max) return ctx
  return ctx.slice(0, max - 1) + '…'
}

function formatResult(result: unknown): string {
  if (result === undefined || result === null) return ''
  if (typeof result === 'string') return result.length > 500 ? result.slice(0, 500) + '…' : result
  try {
    const s = JSON.stringify(result, null, 2)
    return s.length > 500 ? s.slice(0, 500) + '…' : s
  } catch {
    return String(result)
  }
}

export function ToolCallRow({ tool }: { tool: ToolCallInfo }) {
  const [expanded, setExpanded] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (tool.status === 'running') {
      setExpanded(true)
      const start = Date.now()
      const timer = setInterval(() => {
        setElapsedMs(Date.now() - start)
      }, 200)
      return () => clearInterval(timer)
    } else {
      setExpanded(false)
      setElapsedMs(0)
    }
  }, [tool.status])

  const meta = getToolMeta(tool.name)
  const icon = TOOL_ICON[tool.name] ?? '⚙️'
  const ctx = truncateContext(extractContext(tool.name, tool.args))
  const resultText = formatResult(tool.result ?? tool.partialResult)

  const durationText = elapsedMs >= 1000
    ? ` ⏱ ${(elapsedMs / 1000).toFixed(1)}秒`
    : elapsedMs > 0
      ? ` ⏱ ${elapsedMs}毫秒`
      : ''

  let label = ''
  if (tool.status === 'running') {
    label = `正在${meta.label}${ctx ? ' ' + ctx : ''}...${durationText}`
  } else if (tool.status === 'done') {
    label = `${meta.pastTense}${ctx ? ' ' + ctx : ''}`
  } else {
    label = `${meta.label}失败${ctx ? ' ' + ctx : ''}`
  }

  return (
    <div style={{       fontSize: 'var(--font-sm)', marginBottom: 2 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '4px 8px',
          background: 'none', border: 'none',
          borderRadius: 5,
          color: tool.status === 'running' ? 'var(--accent)' : 'var(--text-dim)',
          fontSize: 'var(--font-sm)', fontWeight: tool.status === 'running' ? 500 : 400,
          cursor: 'pointer', textAlign: 'left',
          fontFamily: 'inherit',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        {tool.status === 'running' ? (
          <span style={{
            width: 12, height: 12, borderRadius: '50%',
            border: '1.5px solid var(--accent)',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
            display: 'inline-block', flexShrink: 0,
          }} />
        ) : tool.status === 'done' ? (
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="var(--text-dim)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <polyline points="2.5 7.5 5.5 10.5 11.5 4.5" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="#f97316" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" />
            <line x1="10.5" y1="3.5" x2="3.5" y2="10.5" />
          </svg>
        )}
        <span style={{ flexShrink: 0 }}>{icon}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
        <svg
          width="9" height="9" viewBox="0 0 10 10" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
            flexShrink: 0, opacity: 0.4,
          }}
        >
          <polyline points="2 3.5 5 6.5 8 3.5" />
        </svg>
      </button>

      {expanded && resultText && (
        <div style={{
          margin: '2px 8px 4px 30px',
          padding: '6px 10px',
          background: 'rgba(0,0,0,0.03)',
          borderRadius: 6,
          fontSize: 'var(--font-xs)', lineHeight: 1.5,
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 200, overflowY: 'auto',
        }}>
          {resultText}
        </div>
      )}
    </div>
  )
}

export function ToolCallCard({ toolCalls }: Props) {
  if (toolCalls.length === 0) return null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 0,
      margin: '4px 0 8px',
    }}>
      {toolCalls.map((tool) => (
        <ToolCallRow key={tool.id} tool={tool} />
      ))}
    </div>
  )
}

export type { ToolCallInfo as ToolEventView }
