import { useState, useEffect } from 'react'
import type { ToolCallInfo } from '../mockData'

interface Props {
  toolCalls: ToolCallInfo[]
}

type PermissionDecision = 'allow_once' | 'allow_session' | 'deny'

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

function ToolIcon({ name }: { name: string }) {
  const common = { width: 13, height: 13, stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const
  if (name === 'grep' || name === 'find' || name === 'glob') {
    return (
      <svg {...common} viewBox="0 0 24 24">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    )
  }
  if (name === 'read') {
    return (
      <svg {...common} viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    )
  }
  if (name === 'ls') {
    return (
      <svg {...common} viewBox="0 0 24 24">
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    )
  }
  if (name === 'bash') {
    return (
      <svg {...common} viewBox="0 0 24 24">
        <polyline points="4 17 10 11 4 5" />
        <line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    )
  }
  if (name === 'edit') {
    return (
      <svg {...common} viewBox="0 0 24 24">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    )
  }
  if (name === 'write') {
    return (
      <svg {...common} viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="18" />
      </svg>
    )
  }
  // Fallback gear icon
  return (
    <svg {...common} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function ToolStatusIcon({ status }: { status: ToolCallInfo['status'] }) {
  if (status === 'running') {
    return <span className="tool-call-spinner" aria-hidden="true" />
  }
  if (status === 'waiting_permission') {
    return (
      <svg className="tool-call-status-icon tool-call-status-waiting" width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="7" cy="7" r="5" />
        <path d="M7 4v3l2 2" />
      </svg>
    )
  }
  if (status === 'done') {
    return (
      <svg className="tool-call-status-icon tool-call-status-done" width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="2.5 7.5 5.5 10.5 11.5 4.5" />
      </svg>
    )
  }
  return (
    <svg className="tool-call-status-icon tool-call-status-error" width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" />
      <line x1="10.5" y1="3.5" x2="3.5" y2="10.5" />
    </svg>
  )
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className="tool-call-chevron"
      data-expanded={expanded}
      width="9" height="9" viewBox="0 0 10 10" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="2 3.5 5 6.5 8 3.5" />
    </svg>
  )
}

export function ToolCallRow({ tool, onResolvePermission }: { tool: ToolCallInfo; onResolvePermission?: (toolStepId: string, decision: PermissionDecision) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    if (tool.status === 'running') {
      const start = Date.now()
      const timer = setInterval(() => {
        setElapsedMs(Date.now() - start)
      }, 200)
      return () => clearInterval(timer)
    } else {
      setElapsedMs(0)
    }
  }, [tool.status])

  const meta = getToolMeta(tool.name)
  const ctx = truncateContext(extractContext(tool.name, tool.args))
  const resultText = formatResult(tool.result ?? tool.partialResult)
  const hasResult = !!resultText

  const durationText = elapsedMs >= 1000
    ? ` · ${(elapsedMs / 1000).toFixed(1)}秒`
    : elapsedMs > 0
      ? ` · ${elapsedMs}毫秒`
      : ''

  let label = ''
  if (tool.status === 'running') {
    label = `正在${meta.label}${ctx ? ' · ' + ctx : ''}${durationText}`
  } else if (tool.status === 'waiting_permission') {
    label = `等待授权 · ${meta.label}${ctx ? ' · ' + ctx : ''}`
  } else if (tool.status === 'done') {
    label = `${meta.pastTense}${ctx ? ' · ' + ctx : ''}${hasResult ? ' · 点击查看输出' : ''}`
  } else {
    label = `${meta.label}失败${ctx ? ' · ' + ctx : ''}${hasResult ? ' · 点击查看详情' : ''}`
  }

  const stuckHint = (tool.status === 'running' && elapsedMs > 10000) || tool.status === 'waiting_permission'
    ? '（若长时间无响应，可能是授权事件丢失，请点击下方允许或拒绝）'
    : ''

  const canResolveInline = tool.status === 'waiting_permission' && !!onResolvePermission

  return (
    <div className="tool-call-row">
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`tool-call-button tool-call-button--${tool.status}`}
        aria-expanded={expanded}
      >
        <ToolStatusIcon status={tool.status} />
        <span className="tool-call-type-icon"><ToolIcon name={tool.name} /></span>
        <span className="tool-call-label">{label}</span>
        <ChevronIcon expanded={expanded} />
      </button>

      {canResolveInline && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, paddingLeft: 28 }}>
          <button
            onClick={() => onResolvePermission?.(tool.id, 'allow_once')}
            style={{
              padding: '5px 12px', borderRadius: 'var(--radius-sm)', border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 'var(--font-sm)', cursor: 'pointer',
            }}
          >
            允许一次
          </button>
          <button
            onClick={() => onResolvePermission?.(tool.id, 'allow_session')}
            style={{
              padding: '5px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'var(--bg)', color: 'var(--text)', fontSize: 'var(--font-sm)', cursor: 'pointer',
            }}
          >
            本会话允许
          </button>
          <button
            onClick={() => onResolvePermission?.(tool.id, 'deny')}
            style={{
              padding: '5px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text)', fontSize: 'var(--font-sm)', cursor: 'pointer',
            }}
          >
            拒绝
          </button>
        </div>
      )}

      {expanded && (
        <div className="tool-call-result">
          {stuckHint && (
            <div style={{ color: 'var(--danger)', fontSize: 'var(--font-xs)', marginBottom: 6, lineHeight: 1.4 }}>
              {stuckHint}
            </div>
          )}
          {resultText}
        </div>
      )}
    </div>
  )
}

export function ToolCallCard({ toolCalls }: Props) {
  if (toolCalls.length === 0) return null

  return (
    <div className="tool-call-card">
      {toolCalls.map((tool) => (
        <ToolCallRow key={tool.id} tool={tool} />
      ))}
    </div>
  )
}


export type { ToolCallInfo as ToolEventView }
