import { useState } from 'react'
import type { QuestionInfo } from '../lib/piApi'

interface Props {
  question: QuestionInfo
  onSubmit: (answers: string[][]) => void
  onReject: () => void
}

export function QuestionDialog({ question, onSubmit, onReject }: Props) {
  const [answers, setAnswers] = useState<string[][]>(() => {
    return (question.questions ?? []).map((group) =>
      group.map((q) => q.value ?? '')
    )
  })

  const handleChange = (groupIndex: number, itemIndex: number, value: string) => {
    setAnswers((prev) => {
      const next = prev.map((g) => [...g])
      if (!next[groupIndex]) next[groupIndex] = []
      next[groupIndex][itemIndex] = value
      return next
    })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.45)',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onReject()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: '80vh',
          overflow: 'auto',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl, 0 20px 60px rgba(0,0,0,0.35))',
          padding: '20px 22px',
        }}
      >
        <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          AI 需要你回答
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
          {(question.questions ?? []).map((group, groupIndex) => (
            <div key={groupIndex} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.map((q, itemIndex) => (
                <div key={itemIndex}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 'var(--font-sm)',
                      color: 'var(--text-muted)',
                      marginBottom: 6,
                    }}
                  >
                    {q.label || `问题 ${groupIndex + 1}-${itemIndex + 1}`}
                  </label>
                  <input
                    type="text"
                    value={answers[groupIndex]?.[itemIndex] ?? ''}
                    onChange={(e) => handleChange(groupIndex, itemIndex, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      fontSize: 'var(--font-base)',
                      outline: 'none',
                    }}
                    placeholder="请输入回答"
                    autoFocus={groupIndex === 0 && itemIndex === 0}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onReject}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              fontSize: 'var(--font-base)',
              cursor: 'pointer',
            }}
          >
            拒绝
          </button>
          <button
            onClick={() => onSubmit(answers)}
            style={{
              padding: '8px 14px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 'var(--font-base)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            提交
          </button>
        </div>
      </div>
    </div>
  )
}
