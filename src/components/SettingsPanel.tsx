import { useState, useEffect, useCallback } from 'react'
import { testConnection } from '../lib/piApi'
import { isDesktop } from '../lib/desktopBridge'
import { DesktopBackendSection } from './DesktopBackendSection'

interface Props {
  isDark: boolean
  onThemeChange: (dark: boolean) => void
  fontSize: number
  onFontSizeChange: (size: number) => void
  mode: 'young' | 'senior'
  onModeChange: (mode: 'young' | 'senior') => void
  serverUrl: string
  onServerUrlChange: (url: string) => void
  password: string
  onPasswordChange: (password: string) => void
  localHelperUrl: string
  onLocalHelperUrlChange: (url: string) => void
  onClose: () => void
}

export function SettingsPanel({ isDark, onThemeChange, fontSize, onFontSizeChange, mode, onModeChange, serverUrl, onServerUrlChange, password, onPasswordChange, localHelperUrl, onLocalHelperUrlChange, onClose }: Props) {
  const [draftTheme, setDraftTheme] = useState(isDark)
  const [draftFontSize, setDraftFontSize] = useState(fontSize)
  const [draftMode, setDraftMode] = useState(mode)
  const [draftServerUrl, setDraftServerUrl] = useState(serverUrl)
  const [draftPassword, setDraftPassword] = useState(password)
  const [draftLocalHelperUrl, setDraftLocalHelperUrl] = useState(localHelperUrl)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [testStatus, setTestStatus] = useState<{ loading: boolean; ok?: boolean; message?: string } | null>(null)

  useEffect(() => {
    queueMicrotask(() => {
      setDraftTheme(isDark)
      setDraftFontSize(fontSize)
      setDraftMode(mode)
      setDraftServerUrl(serverUrl)
      setDraftPassword(password)
      setDraftLocalHelperUrl(localHelperUrl)
      setPasswordError(null)
    })
  }, [isDark, fontSize, mode, serverUrl, password, localHelperUrl])

  const saveAndClose = useCallback(() => {
    if (!draftPassword) {
      setPasswordError('必须设置访问密码才能连接 super-king 后端')
      return
    }
    const trimmedUrl = draftServerUrl.trim()
    const trimmedLocalHelperUrl = draftLocalHelperUrl.trim()
    try {
      localStorage.setItem('pi-server-url', trimmedUrl)
      localStorage.setItem('pi-server-password', draftPassword)
      localStorage.setItem('pi-local-helper-url', trimmedLocalHelperUrl)
    } catch (err) {
      console.error('Failed to save server settings to localStorage:', err)
      setPasswordError('保存失败，请检查浏览器是否允许 localStorage')
      return
    }
    setPasswordError(null)
    onThemeChange(draftTheme)
    onFontSizeChange(draftFontSize)
    onModeChange(draftMode)
    onServerUrlChange(trimmedUrl)
    onPasswordChange(draftPassword)
    onLocalHelperUrlChange(trimmedLocalHelperUrl)
    onClose()
  }, [draftPassword, draftServerUrl, draftLocalHelperUrl, draftTheme, draftFontSize, draftMode, onThemeChange, onFontSizeChange, onModeChange, onServerUrlChange, onPasswordChange, onLocalHelperUrlChange, onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') saveAndClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saveAndClose])

  const ALL_FONT_SIZES = [14, 16, 18, 20, 22]
  const DEFAULT_SIZE = 16

  const handleModeChange = (newMode: 'young' | 'senior') => {
    setDraftMode(newMode)
    // Keep user's font size choice; only reset if current size is not in valid range
    if (!ALL_FONT_SIZES.includes(draftFontSize)) {
      setDraftFontSize(DEFAULT_SIZE)
    }
  }

  const accentColor = draftMode === 'senior' ? '#ea580c' : 'var(--accent)'
  const accentHover = draftMode === 'senior' ? '#c2410c' : 'var(--accent-hover)'

  return (
    <div onClick={saveAndClose} style={{ 
      position: 'fixed', inset: 0, zIndex: 299,
      background: 'var(--overlay-bg)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.15s ease',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 460, maxWidth: '90vw',
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 16, boxShadow: 'var(--shadow-xl)',
        position: 'relative',
        overflow: 'hidden',
        padding: '24px 28px 20px',
        animation: 'fadeIn 0.2s ease',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>设置</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 22, padding: 0, lineHeight: 1,
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 8, transition: 'background 0.15s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
          >×</button>
        </div>

        {/* Desktop-only backend control */}
        <DesktopBackendSection
          onApplyBackendUrl={(url, pwd) => {
            setDraftServerUrl(url)
            setDraftPassword(pwd)
            try {
              localStorage.setItem('pi-server-url', url)
              localStorage.setItem('pi-server-password', pwd)
            } catch { /* ignore */ }
            onServerUrlChange(url)
            onPasswordChange(pwd)
          }}
        />

        {/* Server Connection */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>服务器连接</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>服务器地址</div>
              <input
                type="text"
                value={draftServerUrl}
                onChange={(e) => setDraftServerUrl(e.target.value)}
                placeholder="http://127.0.0.1:30142"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 12px', borderRadius: 10,
                  border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                  fontSize: 14, fontFamily: 'var(--font-mono)',
                  outline: 'none',
                }}
              />
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>访问密码</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={draftPassword}
                  onChange={(e) => { setDraftPassword(e.target.value); setPasswordError(null) }}
                  placeholder="SUPER_KING_SERVER_PASSWORD"
                  autoFocus={!draftPassword}
                  style={{
                    flex: 1, boxSizing: 'border-box',
                    padding: '10px 12px', borderRadius: 10,
                    border: passwordError ? '1px solid #ef4444' : '1px solid var(--border)',
                    background: 'var(--bg)', color: 'var(--text)',
                    fontSize: 14, fontFamily: 'var(--font-mono)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={() => setShowPassword((v) => !v)}
                  type="button"
                  style={{
                    padding: '0 12px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--bg-hover)',
                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
                  }}
                >
                  {showPassword ? '隐藏' : '显示'}
                </button>
              </div>
              {passwordError && (
                <div style={{ marginTop: 6, fontSize: 12, color: '#ef4444', lineHeight: 1.4 }}>
                  {passwordError}
                </div>
              )}
              {!passwordError && !draftPassword && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                  当前后端已启用认证，必须填写密码才能连接
                </div>
              )}
              <button
                onClick={async () => {
                  if (!draftPassword) {
                    setPasswordError('必须设置访问密码才能测试连接')
                    setTestStatus(null)
                    return
                  }
                  setPasswordError(null)
                  setTestStatus({ loading: true })
                  try {
                    localStorage.setItem('pi-server-url', draftServerUrl.trim())
                    localStorage.setItem('pi-server-password', draftPassword)
                    await testConnection()
                    setTestStatus({ loading: false, ok: true, message: '连接成功' })
                  } catch (err) {
                    const message = err instanceof Error ? err.message : String(err)
                    setTestStatus({ loading: false, ok: false, message })
                  }
                }}
                disabled={testStatus?.loading}
                style={{
                  marginTop: 10,
                  padding: '8px 14px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'var(--bg-hover)',
                  color: 'var(--text)',
                  fontSize: 13,
                  cursor: testStatus?.loading ? 'wait' : 'pointer',
                }}
              >
                {testStatus?.loading ? '测试中...' : '测试连接'}
              </button>
              {testStatus && !testStatus.loading && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: testStatus.ok ? '#16a34a' : '#ef4444',
                  }}
                >
                  {testStatus.ok ? '✓ ' : '✗ '}{testStatus.message}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>本地增强服务地址</div>
              {isDesktop ? (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px dashed var(--border)',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-dim)',
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  桌面客户端已内置本地增强服务（Skills 扫描、打开文件夹），无需单独运行 helper 进程。
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    value={draftLocalHelperUrl}
                    onChange={(e) => setDraftLocalHelperUrl(e.target.value)}
                    placeholder="http://127.0.0.1:30143"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      padding: '10px 12px', borderRadius: 10,
                      border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
                      fontSize: 14, fontFamily: 'var(--font-mono)',
                      outline: 'none',
                    }}
                  />
                  <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                    用于读取本地 Skills、Artifacts 等 super-king 文档未定义的增强能力
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mode Selection */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>使用模式</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={() => handleModeChange('young')} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 18px', borderRadius: 12,
              textAlign: 'left', width: '100%',
              background: draftMode === 'young' ? 'rgba(37,99,235,0.08)' : 'var(--bg-hover)',
              border: draftMode === 'young' ? '2px solid var(--accent)' : '2px solid transparent',
              color: 'var(--text)', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: draftMode === 'young' ? 'var(--accent)' : 'var(--bg-selected)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={draftMode === 'young' ? '#fff' : 'var(--accent)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c0 1.66 4 3 9 3s9-1.34 9-3v-5" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                  青年教师版
                  {draftMode === 'young' && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: 'var(--accent)',
                      background: 'rgba(37,99,235,0.12)', padding: '2px 8px',
                      borderRadius: 10,
                    }}>当前</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  现代化界面，标准字体，功能完整
                </div>
              </div>
              {draftMode === 'young' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
            <button onClick={() => handleModeChange('senior')} style={{
              display: 'flex', alignItems: 'center', gap: 14,
              padding: '16px 18px', borderRadius: 12,
              textAlign: 'left', width: '100%',
              background: draftMode === 'senior' ? 'rgba(234,88,12,0.08)' : 'var(--bg-hover)',
              border: draftMode === 'senior' ? '2px solid #ea580c' : '2px solid transparent',
              color: 'var(--text)', cursor: 'pointer',
              transition: 'all 0.15s',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: draftMode === 'senior' ? '#ea580c' : 'var(--bg-selected)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={draftMode === 'senior' ? '#fff' : '#ea580c'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                  <path d="M12 18v-3" />
                  <path d="M12 8v1" />
                  <circle cx="12" cy="12" r="1" />
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 8 }}>
                  老教师版本
                  {draftMode === 'senior' && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: '#ea580c',
                      background: 'rgba(234,88,12,0.12)', padding: '2px 8px',
                      borderRadius: 10,
                    }}>当前</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  大字体、高对比度、简洁布局，更适合年长教师
                </div>
              </div>
              {draftMode === 'senior' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Font Size */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>字体大小</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {ALL_FONT_SIZES.map((size) => {
              const isSelected = draftFontSize === size
              const isStandard = size === DEFAULT_SIZE
              return (
                <button key={size} onClick={() => setDraftFontSize(size)} style={{
                  flex: 1, padding: '12px 0 8px', borderRadius: 10,
                  background: isSelected ? accentColor : 'var(--bg-hover)',
                  color: isSelected ? '#fff' : 'var(--text-muted)',
                  border: isSelected ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer', fontWeight: isSelected ? 700 : 500,
                  transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  position: 'relative',
                }}>
                  <div style={{ fontSize: size, fontWeight: 700, marginBottom: 2, lineHeight: 1.2 }}>Aa</div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{size}px</div>
                  {isStandard && (
                    <div style={{
                      position: 'absolute', bottom: -10,
                      fontSize: 10, fontWeight: 600,
                      color: isSelected ? accentColor : 'var(--text-dim)',
                      background: isSelected ? '#fff' : 'var(--bg)',
                      padding: '1px 6px', borderRadius: 8,
                      border: `1px solid ${isSelected ? accentColor : 'var(--border)'}`,
                      whiteSpace: 'nowrap',
                    }}>标准</div>
                  )}
                </button>
              )
            })}
          </div>
          {/* Preview */}
          <div style={{
            marginTop: 18, padding: '12px 14px',
            background: 'var(--bg)', borderRadius: 10,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 500 }}>预览效果</div>
            <div style={{ fontSize: draftFontSize, lineHeight: 1.6, color: 'var(--text)' }}>
              教育智能体可以帮助您备课、批改作业、生成教案，让教学工作更加轻松高效。
            </div>
          </div>
        </div>

        {/* Theme */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>主题外观</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setDraftTheme(true)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 0', borderRadius: 10, fontSize: 14,
              background: draftTheme ? '#1e293b' : 'var(--bg-hover)',
              color: draftTheme ? '#fff' : 'var(--text-muted)',
              border: draftTheme ? '2px solid var(--accent)' : '1px solid var(--border)',
              cursor: 'pointer', fontWeight: draftTheme ? 700 : 500,
              transition: 'all 0.15s',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              深色
            </button>
            <button onClick={() => setDraftTheme(false)} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '12px 0', borderRadius: 10, fontSize: 14,
              background: !draftTheme ? '#f8fafc' : 'var(--bg-hover)',
              color: !draftTheme ? '#1e293b' : 'var(--text-muted)',
              border: !draftTheme ? '2px solid #cbd5e1' : '1px solid var(--border)',
              cursor: 'pointer', fontWeight: !draftTheme ? 700 : 500,
              transition: 'all 0.15s',
            }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
              浅色
            </button>
          </div>
        </div>

        {/* Save button */}
        <button onClick={saveAndClose} disabled={!draftPassword} style={{
          width: '100%', padding: '14px 0', borderRadius: 10,
          background: draftPassword ? accentColor : 'var(--bg-hover)',
          border: 'none', color: draftPassword ? '#fff' : 'var(--text-dim)', fontSize: 15, fontWeight: 700,
          cursor: draftPassword ? 'pointer' : 'not-allowed',
          transition: 'background 0.15s, color 0.15s',
        }}
          onMouseEnter={(e) => { if (draftPassword) e.currentTarget.style.background = accentHover }}
          onMouseLeave={(e) => { if (draftPassword) e.currentTarget.style.background = accentColor }}
        >
          {draftPassword ? '保存并连接' : '请先填写访问密码'}
        </button>
      </div>
    </div>
  )
}
