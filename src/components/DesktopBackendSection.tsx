import { useEffect, useState } from 'react'
import { getDesktopBridge, isDesktop, type DesktopSettingsShape, type SuperKingStatus } from '../lib/desktopBridge'

interface Props {
  // 当本地/远程切换或密码变化时，通知 SettingsPanel 同步到 localStorage（serverUrl/password）
  onApplyBackendUrl?: (url: string, password: string) => void
}

export function DesktopBackendSection({ onApplyBackendUrl }: Props) {
  const [settings, setSettings] = useState<DesktopSettingsShape | null>(null)
  const [status, setStatus] = useState<SuperKingStatus | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [busy, setBusy] = useState<'start' | 'stop' | 'restart' | null>(null)

  useEffect(() => {
    if (!isDesktop) return
    const bridge = getDesktopBridge()!
    let cancelled = false

    bridge.settings.get().then((s) => { if (!cancelled) setSettings(s) }).catch(() => {})
    bridge.superking.status().then((s) => { if (!cancelled) setStatus(s) }).catch(() => {})

    const unsub = bridge.superking.onStatusChange((s) => {
      setStatus(s)
      if (s.state === 'running' || s.state === 'external' || s.state === 'error' || s.state === 'stopped') {
        setBusy(null)
      }
    })
    return () => { cancelled = true; unsub() }
  }, [])

  if (!isDesktop || !settings) return null
  const bridge = getDesktopBridge()!

  function patchSettings(patch: Partial<DesktopSettingsShape>) {
    setSettings((cur) => (cur ? { ...cur, ...patch } : cur))
  }

  async function handleSave() {
    if (!settings) return
    const saved = await bridge.settings.set(settings)
    setSettings(saved)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1500)
    // 同步到渲染端的 serverUrl/password
    if (onApplyBackendUrl) {
      if (saved.useRemote && saved.remoteUrl) {
        onApplyBackendUrl(saved.remoteUrl, saved.superKingPassword)
      } else {
        // Electron 打包后没有 vite 代理，必须用绝对 http URL 直连本机 super-king
        onApplyBackendUrl(`http://127.0.0.1:${saved.superKingPort}`, saved.superKingPassword)
      }
    }
  }

  async function handlePickExe() {
    const p = await bridge.superking.pickExe()
    if (p) patchSettings({ superKingExePath: p })
  }

  async function handleStart() {
    if (busy) return
    setBusy('start')
    await handleSave()
    await bridge.superking.start()
  }

  async function handleStop() {
    if (busy) return
    setBusy('stop')
    await bridge.superking.stop()
  }

  async function handleRestart() {
    if (busy) return
    setBusy('restart')
    await handleSave()
    await bridge.superking.restart()
  }

  const state = status?.state ?? 'stopped'
  const running = state === 'running'
  const external = state === 'external'
  const starting = state === 'starting' || busy === 'start' || busy === 'restart'
  const errored = state === 'error'
  const exeMissing = !settings.useRemote && (!settings.superKingExePath || !settings.superKingExePath.trim())

  const statusDot = running
    ? 'var(--streaming)'
    : external
      ? 'var(--accent)'
      : errored
        ? 'var(--danger)'
        : starting
          ? 'var(--warning)'
          : 'var(--text-dim)'
  const statusText = running
    ? `运行中 · PID ${status?.pid ?? '?'} · :${status?.port ?? settings.superKingPort}`
    : external
      ? `已连接（外部进程） · :${status?.port ?? settings.superKingPort}`
      : starting
        ? '启动中…'
        : errored
          ? `错误：${status?.error ?? '未知'}`
          : exeMissing
            ? '未配置：请先选择 super-king.exe 路径'
            : '未启动'

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        桌面后端
      </div>

      {exeMissing && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--warning)',
            background: 'var(--warning-bg)',
            marginBottom: 12,
            fontSize: 13,
            color: 'var(--text)',
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>首次使用请配置：</div>
          <div style={{ color: 'var(--text-muted)' }}>
            <b>super-king 可执行文件路径</b>：选择你电脑上 super-king.exe 的位置。<br />
            配置完成后点「保存后端设置」→「启动」。
          </div>
        </div>
      )}

      {/* 状态条 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          marginBottom: 12,
        }}
      >
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: statusDot, boxShadow: running ? `0 0 6px ${statusDot}` : 'none' }} />
        <span style={{ fontSize: 13, color: 'var(--text)' }}>{statusText}</span>
        <div style={{ flex: 1 }} />
        {!running && !external && (
          <button onClick={handleStart} disabled={!!busy} className="btn-text" style={btnStyle}>
            启动
          </button>
        )}
        {(running || starting) && (
          <button onClick={handleStop} disabled={!!busy} className="btn-text" style={btnStyle}>
            停止
          </button>
        )}
        {running && (
          <button onClick={handleRestart} disabled={!!busy} className="btn-text" style={btnStyle}>
            重启
          </button>
        )}
        {errored && (
          <button onClick={async () => { await bridge.superking.clearError() }} className="btn-text" style={btnStyle}>
            清除错误
          </button>
        )}
      </div>

      {/* 本地/远程切换 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <ModeButton
          active={!settings.useRemote}
          onClick={() => patchSettings({ useRemote: false })}
          label="本地 super-king"
          desc="客户端启动 .exe 子进程"
        />
        <ModeButton
          active={settings.useRemote}
          onClick={() => patchSettings({ useRemote: true })}
          label="远程服务器"
          desc="连接已部署的 super-king"
        />
      </div>

      {settings.useRemote ? (
        <div style={{ marginBottom: 12 }}>
          <div style={lblStyle}>远程服务器地址</div>
          <input
            type="text"
            value={settings.remoteUrl}
            onChange={(e) => patchSettings({ remoteUrl: e.target.value })}
            placeholder="https://your-server.example.com"
            style={inputStyle}
          />
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={lblStyle}>super-king 可执行文件路径</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                value={settings.superKingExePath}
                onChange={(e) => patchSettings({ superKingExePath: e.target.value })}
                placeholder="例如 D:\\tools\\super-king\\super-king.exe"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button onClick={handlePickExe} className="btn-text" style={btnStyle}>浏览...</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={lblStyle}>端口</div>
              <input
                type="number"
                value={settings.superKingPort}
                onChange={(e) => patchSettings({ superKingPort: Number(e.target.value) || 30142 })}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 2 }}>
              <div style={lblStyle}>访问密码（用于客户端鉴权）</div>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={settings.superKingPassword}
                  onChange={(e) => patchSettings({ superKingPassword: e.target.value })}
                  style={inputStyle}
                />
                <button
                  onClick={() => setShowPwd((v) => !v)}
                  style={{
                    position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                    background: 'transparent', border: 'none', color: 'var(--text-dim)',
                    cursor: 'pointer', fontSize: 12,
                  }}
                >
                  {showPwd ? '隐藏' : '显示'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-dim)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.autoStartSuperKing}
                onChange={(e) => patchSettings({ autoStartSuperKing: e.target.checked })}
              />
              客户端启动时自动拉起 super-king
            </label>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handleSave} className="btn-text" style={{ ...btnStyle, fontWeight: 600 }}>
          保存后端设置
        </button>
        {savedFlash && (
          <span style={{ fontSize: 12, color: 'var(--success)', alignSelf: 'center' }}>已保存</span>
        )}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px', borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
  fontSize: 13, fontFamily: 'var(--font-mono)',
  outline: 'none',
}

const lblStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)', marginBottom: 4,
}

const btnStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 'var(--radius-md)',
  fontSize: 12,
}

function ModeButton({ active, onClick, label, desc }: { active: boolean; onClick: () => void; label: string; desc: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: 'left',
        padding: '10px 12px',
        borderRadius: 'var(--radius-lg)',
        border: `1px solid ${active ? 'var(--accent, #3b82f6)' : 'var(--border)'}`,
        background: active ? 'var(--bg-hover)' : 'var(--bg)',
        color: 'var(--text)',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{desc}</div>
    </button>
  )
}
