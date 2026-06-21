import { useEffect, useState } from 'react'
import { getDesktopBridge, isDesktop, type SuperKingStatus } from '../lib/desktopBridge'

interface Props {
  onOpenSettings: () => void
}

export function SuperKingBadge({ onOpenSettings }: Props) {
  const [status, setStatus] = useState<SuperKingStatus | null>(null)
  const [busy, setBusy] = useState<'starting' | 'stopping' | null>(null)

  useEffect(() => {
    if (!isDesktop) return
    const bridge = getDesktopBridge()!
    let cancelled = false

    const refresh = () => {
      bridge.superking
        .status()
        .then((s) => { if (!cancelled) setStatus(s) })
        .catch(() => {})
    }
    refresh()

    const unsub = bridge.superking.onStatusChange((s) => {
      setStatus(s)
      if (s.state === 'running' || s.state === 'external' || s.state === 'error' || s.state === 'stopped') {
        setBusy(null)
      }
    })
    // 兜底轮询：2.5s 一次，确保即使丢了 broadcast 也能恢复
    const timer = window.setInterval(refresh, 2500)
    return () => { cancelled = true; unsub(); window.clearInterval(timer) }
  }, [])

  if (!isDesktop) return null

  const bridge = getDesktopBridge()!
  const state = status?.state ?? 'stopped'
  const running = state === 'running'
  const external = state === 'external'
  const starting = state === 'starting' || busy === 'starting'
  const stopping = busy === 'stopping'
  const errored = state === 'error'

  async function handleClick() {
    if (busy) return
    if (external) return  // 外部 super-king 不允许从 UI 停止
    try {
      if (running) {
        setBusy('stopping')
        await bridge.superking.stop()
      } else {
        setBusy('starting')
        await bridge.superking.start()
      }
    } catch {
      setBusy(null)
    }
  }

  const color = running
    ? 'var(--streaming)'
    : external
      ? 'var(--accent)'
      : errored
        ? 'var(--danger)'
        : starting
          ? 'var(--warning)'
          : 'var(--text-dim)'
  const label = starting
    ? '启动中…'
    : stopping
      ? '停止中…'
      : running
        ? `super-king :${status?.port ?? 30142}`
        : external
          ? `已连接 :${status?.port ?? 30142}`
          : errored
            ? '后端错误'
            : '后端未启动'
  const tooltip = errored && status?.error
    ? status.error
    : running
      ? `点击停止；PID ${status?.pid ?? '?'}`
      : external
        ? '检测到外部 super-king 在该端口运行（非客户端启动，无法从此处停止）'
        : '点击启动 super-king'

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        borderRadius: 999,
        border: '1px solid var(--border)',
        background: 'var(--bg)',
        fontSize: 'var(--font-xs, 12px)',
        color: 'var(--text)',
      }}
    >
      <button
        onClick={handleClick}
        disabled={!!busy || external}
        title={tooltip}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          cursor: external ? 'default' : busy ? 'wait' : 'pointer',
          color: 'inherit',
          padding: 0,
          font: 'inherit',
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: color,
            boxShadow: running ? `0 0 6px ${color}` : 'none',
            transition: 'all 0.2s',
          }}
        />
        <span>{label}</span>
      </button>
      {errored && (
        <button
          onClick={() => { void bridge.superking.clearError() }}
          title="清除错误状态（确认 super-king 已外部启动后点击）"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-dim)',
            padding: 0,
            display: 'inline-flex',
            fontSize: 11,
          }}
        >
          清除
        </button>
      )}
      <button
        onClick={onOpenSettings}
        title="后端设置"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-dim)',
          padding: 0,
          display: 'inline-flex',
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    </div>
  )
}
