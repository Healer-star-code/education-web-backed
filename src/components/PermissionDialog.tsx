import { useState } from 'react'
import type { PermissionRequestInfo } from '../lib/piApi'

interface Props {
  request: PermissionRequestInfo
  onResolve: (decision: 'allow_once' | 'allow_session' | 'deny') => void
}

function formatOptions(options: unknown): string {
  if (!options || typeof options !== 'object') return ''
  try {
    const s = JSON.stringify(options, null, 2)
    return s.length > 600 ? s.slice(0, 600) + '…' : s
  } catch {
    return String(options)
  }
}

export function PermissionDialog({ request, onResolve }: Props) {
  const [decision, setDecision] = useState<'allow_once' | 'allow_session' | 'deny'>('allow_once')

  const titleMap: Record<string, string> = {
    read: '读取文件',
    write: '写入文件',
    edit: '编辑文件',
    bash: '执行命令',
    execute: '执行命令',
  }

  const title = titleMap[request.kind] ?? `执行工具 ${request.kind}`

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
        if (e.target === e.currentTarget) onResolve('deny')
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
          borderRadius: 14,
          boxShadow: 'var(--shadow-xl, 0 20px 60px rgba(0,0,0,0.35))',
          padding: '20px 22px',
        }}
      >
        <div style={{ fontSize: 'var(--font-lg)', fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          {title}
        </div>

        <div
          style={{
            fontSize: 'var(--font-base)',
            color: 'var(--text-muted)',
            lineHeight: 1.55,
            marginBottom: 16,
          }}
        >
          {request.message || `AI 请求使用工具 ${request.kind}，需要你授权。`}
        </div>

        {request.options !== undefined && (
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', marginBottom: 6 }}>参数</div>
            <pre
              style={{
                margin: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-sm)',
                color: 'var(--text)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {formatOptions(request.options)}
            </pre>
          </div>
        )}

        {request.diff !== undefined && (
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', marginBottom: 6 }}>变更预览</div>
            <pre
              style={{
                margin: 0,
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--font-sm)',
                color: 'var(--text)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {request.diff}
            </pre>
          </div>
        )}

        <div style={{ marginBottom: 18 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: decision === 'allow_once' ? 'rgba(59,130,246,0.08)' : 'transparent',
              cursor: 'pointer',
              marginBottom: 8,
            }}
          >
            <input
              type="radio"
              name={`perm-${request.permissionId}`}
              checked={decision === 'allow_once'}
              onChange={() => setDecision('allow_once')}
            />
            <span style={{ fontSize: 'var(--font-base)', color: 'var(--text)' }}>允许一次</span>
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: decision === 'allow_session' ? 'rgba(59,130,246,0.08)' : 'transparent',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name={`perm-${request.permissionId}`}
              checked={decision === 'allow_session'}
              onChange={() => setDecision('allow_session')}
            />
            <span style={{ fontSize: 'var(--font-base)', color: 'var(--text)' }}>本会话允许</span>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={() => onResolve('deny')}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
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
            onClick={() => onResolve(decision)}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 'var(--font-base)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            允许
          </button>
        </div>
      </div>
    </div>
  )
}
