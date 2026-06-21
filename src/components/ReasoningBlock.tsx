import { useEffect, useRef, useState } from 'react'
import type { AgentStep } from '../mockData'
import { ToolCallRow } from './ToolCallCard'
import { ThinkingBlock } from './ThinkingBlock'
import { SkillLoadRow } from './SkillLoadRow'

interface Props {
  steps: AgentStep[]
  onResolveToolPermission?: (toolStepId: string, decision: 'allow_once' | 'allow_session' | 'deny') => void
}

export function ReasoningBlock({ steps, onResolveToolPermission }: Props) {
  const thinkingSteps = steps.filter((s) => s.type === 'thinking')
  const toolSteps = steps.filter((s) => s.type === 'tool')
  const skillSteps = steps.filter((s) => s.type === 'skill_load')

  const runningTools = toolSteps.filter((t) => t.status === 'running').length
  const thinkingActive = thinkingSteps.some((s) => s.isThinking)
  const skillLoading = skillSteps.some((s) => s.isLoading)
  const isActive = thinkingActive || runningTools > 0 || skillLoading

  const totalDurationMs = thinkingSteps.reduce((sum, step) => sum + (step.durationMs || 0), 0)

  function formatDuration(ms: number) {
    if (ms <= 0) return ''
    if (ms < 1000) return `${ms}毫秒`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}秒`
    const minutes = Math.floor(ms / 60000)
    const seconds = Math.round((ms % 60000) / 1000)
    return seconds > 0 ? `${minutes}分${seconds}秒` : `${minutes}分钟`
  }

  let summary = ''
  if (isActive) {
    summary = '正在处理'
  } else {
    const durationText = formatDuration(totalDurationMs)
    summary = durationText
      ? `已处理 ${durationText}`
      : '已处理'
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
      borderRadius: 'var(--radius-lg)',
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
        {/* 「正在处理 / 已处理」图标：原子球轨道 SVG。
            isActive 时电子在轨道上旋转，否则静止。视觉上与 Electron 默认 app
            图标风格相似（原子/电子轨道），是"思考运转"的自然隐喻。 */}
        <span
          aria-hidden
          style={{
            width: 16, height: 16, flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ overflow: 'visible' }}>
            {/* 原子核 */}
            <circle cx="12" cy="12" r="2" fill="var(--accent)" />
            {/* 三条轨道椭圆，依次旋转 60 度 */}
            <ellipse cx="12" cy="12" rx="10" ry="4" stroke="var(--accent)" strokeWidth="1.2" opacity="0.55" />
            <ellipse cx="12" cy="12" rx="10" ry="4" stroke="var(--accent)" strokeWidth="1.2" opacity="0.55" transform="rotate(60 12 12)" />
            <ellipse cx="12" cy="12" rx="10" ry="4" stroke="var(--accent)" strokeWidth="1.2" opacity="0.55" transform="rotate(120 12 12)" />
            {/* 三个电子（小圆点）：active 时各自沿轨道旋转 */}
            {isActive ? (
              <>
                <g style={{ transformOrigin: '12px 12px', animation: 'spin 1.4s linear infinite' }}>
                  <circle cx="22" cy="12" r="1.4" fill="var(--accent)" />
                </g>
                <g style={{ transformOrigin: '12px 12px', animation: 'spin 1.8s linear infinite reverse' }}>
                  <circle cx="22" cy="12" r="1.4" fill="var(--accent)" transform="rotate(60 12 12)" />
                </g>
                <g style={{ transformOrigin: '12px 12px', animation: 'spin 2.2s linear infinite' }}>
                  <circle cx="22" cy="12" r="1.4" fill="var(--accent)" transform="rotate(120 12 12)" />
                </g>
              </>
            ) : (
              <>
                <circle cx="22" cy="12" r="1.4" fill="var(--accent)" opacity="0.7" />
                <circle cx="22" cy="12" r="1.4" fill="var(--accent)" opacity="0.7" transform="rotate(60 12 12)" />
                <circle cx="22" cy="12" r="1.4" fill="var(--accent)" opacity="0.7" transform="rotate(120 12 12)" />
              </>
            )}
          </svg>
        </span>
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
            if (step.type === 'skill_load') {
              return (
                <div key={step.id} style={{ marginTop: idx > 0 ? 4 : 0 }}>
                  <SkillLoadRow
                    name={step.name}
                    baseDir={step.baseDir}
                    content={step.content}
                    isLoading={step.isLoading}
                  />
                </div>
              )
            }
            return (
              <div key={step.id} style={{ marginTop: idx > 0 ? 4 : 0 }}>
                <ToolCallRow tool={step} onResolvePermission={onResolveToolPermission} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
