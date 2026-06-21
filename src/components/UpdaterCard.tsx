import { useEffect, useState } from 'react'
import { getDesktopBridge, isDesktop, type UpdaterState } from '../lib/desktopBridge'

export function UpdaterCard() {
  const [state, setState] = useState<UpdaterState | null>(null)

  useEffect(() => {
    if (!isDesktop) return
    const bridge = getDesktopBridge()!
    let cancelled = false

    bridge.updater.state().then((s) => { if (!cancelled) setState(s) }).catch(() => {})
    const unsub = bridge.updater.onChange(setState)
    return () => { cancelled = true; unsub() }
  }, [])

  if (!isDesktop || !state) return null
  const bridge = getDesktopBridge()!

  const phase = state.phase
  const current = state.currentVersion
  const latest = state.latestVersion

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        软件更新
      </div>
      <div
        style={{
          padding: '14px 14px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          background: 'var(--bg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>当前版本 v{current}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
              {phase === 'idle' && '尚未检查'}
              {phase === 'checking' && '检查中…'}
              {phase === 'not-available' && '已是最新版本'}
              {phase === 'available' && `发现新版本 v${latest}`}
              {phase === 'downloading' && `下载中 ${state.percent.toFixed(1)}%`}
              {phase === 'downloaded' && `v${latest} 已下载，等待重启安装`}
              {phase === 'error' && `错误：${state.error ?? '未知'}`}
            </div>
          </div>

          {(phase === 'idle' || phase === 'not-available' || phase === 'error') && (
            <button onClick={() => bridge.updater.check()} className="btn-text" style={btnStyle}>
              检查更新
            </button>
          )}
          {phase === 'checking' && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>检查中…</span>
          )}
          {phase === 'available' && (
            <button onClick={() => bridge.updater.download()} className="btn-text" style={btnStyle}>
              下载
            </button>
          )}
          {phase === 'downloading' && (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              {state.bytesPerSecond ? `${(state.bytesPerSecond / 1024).toFixed(0)} KB/s` : '…'}
            </span>
          )}
          {phase === 'downloaded' && (
            <button
              onClick={() => bridge.updater.install()}
              className="btn-text"
              style={{ ...btnStyle, fontWeight: 600 }}
            >
              重启并安装
            </button>
          )}
        </div>

        {phase === 'downloading' && (
          <div
            style={{
              height: 4,
              background: 'var(--bg-hover)',
              borderRadius: 2,
              marginTop: 10,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${state.percent}%`,
                height: '100%',
                background: 'var(--accent)',
                transition: 'width 0.2s',
              }}
            />
          </div>
        )}

        {state.releaseNotes && (phase === 'available' || phase === 'downloaded') && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>更新说明</summary>
            <pre style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', marginTop: 6 }}>
              {state.releaseNotes}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--radius-md)',
  fontSize: 12,
}
