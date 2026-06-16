import { useEffect, useRef, useState } from 'react'
import type { AgentStep } from '../mockData'
import { ToolCallRow } from './ToolCallCard'
import { ThinkingBlock } from './ThinkingBlock'

interface Props {
  steps: AgentStep[]
}

export function ReasoningBlock({ steps }: Props) {
  const thinkingSteps = steps.filter((s) => s.type === 'thinking')
  const toolSteps = steps.filter((s) => s.type === 'tool')

  const hasThinking = thinkingSteps.length > 0
  const hasTools = toolSteps.length > 0
  const runningTools = toolSteps.filter((t) => t.status === 'running').length
  const doneTools = toolSteps.filter((t) => t.status === 'done').length
  const errorTools = toolSteps.filter((t) => t.status === 'error').length
  const thinkingActive = thinkingSteps.some((s) => s.isThinking)
  const isActive = thinkingActive || runningTools > 0

  let summary = ''
  if (hasThinking && hasTools) {
    if (runningTools > 0) {
      summary = `深度思考中 · 正在使用工具 (${runningTools}/${toolSteps.length})`
    } else if (errorTools > 0) {
      summary = `已深度思考 · ${doneTools} 个工具完成 · ${errorTools} 个失败`
    } else {
      summary = `已深度思考 · 使用了 ${toolSteps.length} 个工具`
    }
  } else if (hasThinking) {
    summary = thinkingActive ? '思考中...' : '已深度思考'
  } else if (hasTools) {
    if (runningTools > 0) {
      summary = `正在使用工具 (${runningTools}/${toolSteps.length})`
    } else {
      summary = `使用了 ${toolSteps.length} 个工具`
    }
  }

  const [expanded, setExpanded] = useState(isActive)
  const userToggledRef = useRef(false)

  useEffect(() => {
    if (userToggledRef.current) return
    setExpanded(isActive)
  }, [isActive])

  const handleToggle = () => {
    userToggledRef.current = true
    setExpanded((v) => !v)
  }

  return (
    <div style={{
      marginBottom: 8,
      border: '1px solid var(--border)',
      borderRadius: 10,
      background: 'var(--bg-panel)',
      overflow: 'hidden',
    }}>
      <button
        onClick={handleToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '8px 12px',
          background: 'none', border: 'none',
          color: 'var(--text-dim)', fontSize: 'var(--font-sm)',
          cursor: 'pointer', fontWeight: 500,
          textAlign: 'left',
          transition: 'background 0.12s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}>
          <path d="M12 2a8 8 0 0 1 8 8c0 3.4-2.1 6.3-5 7.5V19a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-1.5C6.1 16.3 4 13.4 4 10a8 8 0 0 1 8-8z" />
          <line x1="9" y1="22" x2="15" y2="22" />
        </svg>
        <span style={{ flex: 1 }}>{summary}</span>
        {runningTools > 0 && (
          <span style={{
            width: 12, height: 12, borderRadius: '50%',
            border: '1.5px solid var(--accent)',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
            display: 'inline-block', flexShrink: 0,
          }} />
        )}
        <svg
          width="11" height="11" viewBox="0 0 12 12" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
            flexShrink: 0, opacity: 0.5,
          }}
        >
          <polyline points="2 4 6 8 10 4" />
        </svg>
      </button>

      {expanded && (
        <div style={{ padding: '0 12px 10px' }}>
          {steps.map((step, idx) => {
            if (step.type === 'thinking') {
              return (
                <div key={step.id} style={{ marginTop: idx > 0 ? 4 : 0 }}>
                  <ThinkingBlock
                    content={step.content}
                    durationMs={step.durationMs}
                    isThinking={step.isThinking}
                  />
                </div>
              )
            }
            return (
              <div key={step.id} style={{ marginTop: idx > 0 ? 4 : 0 }}>
                <ToolCallRow tool={step} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
