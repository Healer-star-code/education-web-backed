import { useState, useEffect, useCallback } from 'react'
import { testConnection } from '../lib/piApi'
import { isDesktop, getDesktopBridge } from '../lib/desktopBridge'
import { DesktopBackendSection } from './DesktopBackendSection'
import { UpdaterCard } from './UpdaterCard'
import { ZapIcon, AlertTriangleIcon } from './Icon'

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
  autoApproveAllTools: boolean
  onAutoApproveAllToolsChange: (v: boolean) => void
  onClose: () => void
}

export function SettingsPanel({ isDark, onThemeChange, fontSize, onFontSizeChange, mode, onModeChange, serverUrl, onServerUrlChange, password, onPasswordChange, localHelperUrl, onLocalHelperUrlChange, autoApproveAllTools, onAutoApproveAllToolsChange, onClose }: Props) {
  const [draftTheme, setDraftTheme] = useState(isDark)
  const [draftFontSize, setDraftFontSize] = useState(fontSize)
  const [draftMode, setDraftMode] = useState(mode)
  const [draftServerUrl, setDraftServerUrl] = useState(serverUrl)
  const [draftPassword, setDraftPassword] = useState(password)
  const [draftLocalHelperUrl, setDraftLocalHelperUrl] = useState(localHelperUrl)
  const [draftAutoApproveAll, setDraftAutoApproveAll] = useState(autoApproveAllTools)
  const [showRiskConfirm, setShowRiskConfirm] = useState(false)
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
      setDraftAutoApproveAll(autoApproveAllTools)
      setPasswordError(null)
    })
  }, [isDark, fontSize, mode, serverUrl, password, localHelperUrl, autoApproveAllTools])

  // 把服务器地址/密码立即应用到 App state 并持久化，不关闭设置面板。
  // 测试连接成功和保存时都会调用。
  const applyServerSettings = useCallback((url: string, pwd: string, helperUrl?: string) => {
    const trimmedUrl = url.trim()
    const trimmedHelperUrl = (helperUrl ?? draftLocalHelperUrl).trim()
    try {
      localStorage.setItem('pi-server-url', trimmedUrl)
      localStorage.setItem('pi-server-password', pwd)
      localStorage.setItem('pi-local-helper-url', trimmedHelperUrl)
    } catch (err) {
      console.error('Failed to save server settings to localStorage:', err)
      setPasswordError('保存失败，请检查浏览器是否允许本地存储')
      return false
    }
    // Electron 模式下，同步把密码 / URL 写回 electron-store（权威数据源）。
    // 失败不阻塞，因为 localStorage 已经写成功了。
    if (isDesktop) {
      const bridge = getDesktopBridge()
      if (bridge) {
        // 解析 trimmedUrl：远程地址 (非 127.0.0.1/localhost) 视为 remoteUrl + useRemote=true
        const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(trimmedUrl)
        const patch: Record<string, unknown> = {
          superKingPassword: pwd,
        }
        if (isLocal) {
          patch.useRemote = false
          patch.remoteUrl = ''
          const m = trimmedUrl.match(/:(\d+)/)
          if (m) patch.superKingPort = parseInt(m[1], 10)
        } else if (trimmedUrl) {
          patch.useRemote = true
          patch.remoteUrl = trimmedUrl
        }
        bridge.settings.set(patch).catch(err => {
          console.warn('[settings] failed to persist to electron-store:', err)
        })
      }
    }
    setPasswordError(null)
    onServerUrlChange(trimmedUrl)
    onPasswordChange(pwd)
    onLocalHelperUrlChange(trimmedHelperUrl)
    return true
  }, [draftLocalHelperUrl, onServerUrlChange, onPasswordChange, onLocalHelperUrlChange])

  const saveAndClose = useCallback(() => {
    if (!draftPassword) {
      setPasswordError('必须设置访问密码才能连接超级小金')
      return
    }
    if (!applyServerSettings(draftServerUrl, draftPassword, draftLocalHelperUrl)) return
    setPasswordError(null)
    onThemeChange(draftTheme)
    onFontSizeChange(draftFontSize)
    onModeChange(draftMode)
    onAutoApproveAllToolsChange(draftAutoApproveAll)
    onClose()
  }, [draftPassword, draftServerUrl, draftLocalHelperUrl, draftTheme, draftFontSize, draftMode, draftAutoApproveAll, applyServerSettings, onThemeChange, onFontSizeChange, onModeChange, onAutoApproveAllToolsChange, onClose])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // 风险确认对话框打开时，ESC 只关风险对话框，不关整个设置面板
      if (showRiskConfirm) {
        setShowRiskConfirm(false)
        return
      }
      saveAndClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [saveAndClose, showRiskConfirm])

  const ALL_FONT_SIZES = [14, 16, 18, 20, 22]
  const DEFAULT_SIZE = 16

  const handleModeChange = (newMode: 'young' | 'senior') => {
    setDraftMode(newMode)
    // Keep user's font size choice; only reset if current size is not in valid range
    if (!ALL_FONT_SIZES.includes(draftFontSize)) {
      setDraftFontSize(DEFAULT_SIZE)
    }
  }



  return (
    <div onClick={() => {
      // 二次确认对话框打开时，禁用外层 backdrop 的 saveAndClose
      if (showRiskConfirm) return
      saveAndClose()
    }} style={{ 
      position: 'fixed', inset: 0, zIndex: 299,
      background: 'var(--overlay-bg)',
      backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.15s ease',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 460, maxWidth: '90vw',
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-xl)',
        position: 'relative',
        overflow: 'hidden',
        padding: '24px 28px 20px',
        animation: 'fadeIn 0.2s ease',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>设置</span>
          <button onClick={onClose} className="btn-close">×</button>
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

        {/* Desktop-only updater */}
        <UpdaterCard />

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
                className="input-field"
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
                  className="input-field"
                  style={{ flex: 1, borderColor: passwordError ? 'var(--danger)' : undefined }}
                />
                <button
                  onClick={() => setShowPassword((v) => !v)}
                  type="button"
                  style={{
                    padding: '0 12px', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border)', background: 'var(--bg-hover)',
                    color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13,
                  }}
                >
                  {showPassword ? '隐藏' : '显示'}
                </button>
              </div>
              {passwordError && (
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)', lineHeight: 1.4 }}>
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
                    // 先把草稿设置写下去再测试，确保 testConnection 读到最新地址/密码
                    localStorage.setItem('pi-server-url', draftServerUrl.trim())
                    localStorage.setItem('pi-server-password', draftPassword)
                    await testConnection()
                    // 测试通过立即应用到 App state，让侧边栏会话列表自动刷新
                    const applied = applyServerSettings(draftServerUrl, draftPassword)
                    setTestStatus({
                      loading: false,
                      ok: true,
                      message: applied ? '连接成功，设置已应用' : '连接成功，但保存设置时出错',
                    })
                  } catch (err) {
                    const message = err instanceof Error ? err.message : String(err)
                    setTestStatus({ loading: false, ok: false, message })
                  }
                }}
                disabled={testStatus?.loading}
                className="btn-test"
              >
                {testStatus?.loading ? '测试中...' : '测试连接'}
              </button>
              {testStatus && !testStatus.loading && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: testStatus.ok ? 'var(--success)' : 'var(--danger)',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  {testStatus.ok ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  )}
                  {testStatus.message}
                </div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>本地增强服务地址</div>
              {isDesktop ? (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-lg)',
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
                    className="input-field"
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
            <button onClick={() => handleModeChange('young')} className={`btn-mode ${draftMode === 'young' ? 'active' : ''}`}>
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-lg)',
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
                      background: 'var(--accent-bg)', padding: '2px 8px',
                      borderRadius: 'var(--radius-lg)',
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
            <button
              onClick={() => handleModeChange('senior')}
              className={`btn-mode ${draftMode === 'senior' ? 'active senior' : ''}`}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-lg)',
                background: draftMode === 'senior' ? 'var(--accent-senior)' : 'var(--bg-selected)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={draftMode === 'senior' ? '#fff' : 'var(--accent-senior)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                      fontSize: 11, fontWeight: 600, color: 'var(--accent-senior)',
                      background: 'var(--warning-bg)', padding: '2px 8px',
                      borderRadius: 'var(--radius-lg)',
                    }}>当前</span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  大字体、高对比度、简洁布局，更适合年长教师
                </div>
              </div>
              {draftMode === 'senior' && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-senior)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
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
                <button key={size} onClick={() => setDraftFontSize(size)} className={`btn-font-size ${isSelected ? 'active' : ''} ${draftMode === 'senior' ? 'senior' : ''}`}>
                  <div style={{ fontSize: size, fontWeight: 700, marginBottom: 2, lineHeight: 1.2 }}>Aa</div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{size}px</div>
                  {isStandard && (
                    <div className={`font-size-badge ${isSelected ? 'active' : ''} ${draftMode === 'senior' ? 'senior' : ''}`}>标准</div>
                  )}
                </button>
              )
            })}
          </div>
          {/* Preview */}
          <div style={{
            marginTop: 18, padding: '12px 14px',
            background: 'var(--bg)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, fontWeight: 500 }}>预览效果</div>
            <div style={{ fontSize: draftFontSize, lineHeight: 1.6, color: 'var(--text)' }}>
              超级小金可以帮助您备课、批改作业、生成教案，让教学工作更加轻松高效。
            </div>
          </div>
        </div>

        {/* Theme */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>主题外观</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setDraftTheme(true)} className={`btn-theme ${draftTheme ? 'active' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
              深色
            </button>
            <button onClick={() => setDraftTheme(false)} className={`btn-theme ${!draftTheme ? 'active' : ''}`}>
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

        {/* Permissions / YOLO mode */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>权限设置</div>
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--radius-lg)',
              border: draftAutoApproveAll ? '2px solid var(--accent-senior)' : '1px solid var(--border)',
              background: draftAutoApproveAll ? 'var(--accent-senior-bg)' : 'var(--bg-hover)',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <ZapIcon width={18} height={18} style={{ color: 'var(--accent-senior)' }} />
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                  自动允许所有工具调用
                </div>
              </div>
              {/* macOS-style toggle */}
              <button
                role="switch"
                aria-checked={draftAutoApproveAll}
                onClick={(e) => {
                  e.stopPropagation()
                  if (draftAutoApproveAll) {
                    // 关闭：直接生效，不二次确认
                    setDraftAutoApproveAll(false)
                  } else {
                    // 开启：先弹二次确认
                    setShowRiskConfirm(true)
                  }
                }}
                style={{
                  flexShrink: 0,
                  position: 'relative',
                  width: 44,
                  height: 24,
                  borderRadius: 999,
                  border: 'none',
                  background: draftAutoApproveAll ? 'var(--accent-senior)' : 'var(--bg-selected)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  padding: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    left: draftAutoApproveAll ? 22 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                    transition: 'left 0.15s',
                  }}
                />
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55, marginTop: 10 }}>
              开启后 AI 调用 read / write / edit / bash 等工具时不再弹窗询问，直接放行。
            </div>
            <div
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--warning-bg)',
                border: '1px solid var(--accent-senior)',
                fontSize: 12,
                color: 'var(--accent-senior)',
                lineHeight: 1.5,
              }}
            >
              <AlertTriangleIcon width={13} height={13} /> 风险提示：AI 将能直接读写文件、运行命令。仅推荐在你完全信任 AI 输出时开启。
            </div>
          </div>
        </div>

        {/* Save button */}
        <button onClick={saveAndClose} disabled={!draftPassword} className={`btn-save ${draftMode === 'senior' ? 'senior' : ''}`}>
          {draftPassword ? '保存并连接' : '请先填写访问密码'}
        </button>
      </div>

      {/* 二次风险确认对话框 */}
      {showRiskConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.55)',
            padding: 16,
          }}
          // 关键：阻止任何点击冒泡到外层 SettingsPanel 的 saveAndClose
          onClick={(e) => {
            e.stopPropagation()
            if (e.target === e.currentTarget) setShowRiskConfirm(false)
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div
            // 内层卡片也阻止冒泡，防止任何子按钮 onClick 冒泡触发 backdrop 关闭
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 480,
              background: 'var(--bg-panel)',
              border: '2px solid var(--accent-senior)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              padding: '22px 24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <AlertTriangleIcon width={28} height={28} style={{ color: 'var(--accent-senior)' }} />
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>
                确认开启「自动允许所有工具」？
              </div>
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: 12 }}>
              开启后 AI 将能：
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 22px', fontSize: 14, color: 'var(--text)', lineHeight: 1.8, marginBottom: 14 }}>
              <li>直接读写你电脑上的任意文件</li>
              <li>直接运行命令行（包括删除、网络请求）</li>
              <li>直接修改代码，不再向你询问</li>
            </ul>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--accent-senior-bg)',
                border: '1px solid var(--accent-senior)',
                fontSize: 13,
                color: 'var(--accent-senior)',
                lineHeight: 1.55,
                marginBottom: 18,
              }}
            >
              仅在你完全信任 AI 输出时开启。你可以随时回到设置关闭此选项。
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowRiskConfirm(false)
                }}
                className="btn-ghost"
              >
                取消
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDraftAutoApproveAll(true)
                  setShowRiskConfirm(false)
                }}
                className="btn-accent-senior"
              >
                我已了解风险，开启
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
