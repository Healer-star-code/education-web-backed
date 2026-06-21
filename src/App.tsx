import { useState, useCallback, useRef, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import type { SessionInfo } from './mockData'
import { ChatInput, type ChatInputHandle } from './components/ChatInput'
import { SettingsPanel } from './components/SettingsPanel'
import { SkillsPanel } from './components/SkillsPanel'
import { SuperKingBadge } from './components/SuperKingBadge'
import { Typewriter } from './components/Typewriter'
import {
  listSessions, listRecentPaths, addRecentPath, deleteSession, renameSession,
  listLocalSkills, listModels, getConfig, switchModel,
  type ModelProviderInfo,
  type ConfigInfo,
} from './lib/piApi'
import { upsertSession } from './lib/sessionState'

const APP_INSTITUTION = (import.meta.env.VITE_APP_INSTITUTION as string | undefined) ?? '武汉船院'

const TYPEWRITER_PHRASES = [
  '准备好了吗？',
  '有什么想问的？',
  '一起来做点酷的事。',
  '探索你的代码库。',
  '起草一份教案。',
  '总结这篇论文。',
  '规划你的课程。',
  '用简单的话解释一下。',
  '和我结对编程。',
  '修复那个烦人的 bug。',
  '翻译成中文。',
  '写一首俳句。',
  '头脑风暴一下。',
  '帮我审查代码。',
  '发布上线！',
  '让它更好看。',
  '和我一起理清思路。',
]

export default function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null)
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null)
  const [recentCwds, setRecentCwds] = useState<string[]>([])
  useEffect(() => {
    listRecentPaths()
      .then((paths) => setRecentCwds(paths.map((p) => p.path)))
      .catch(() => {})
  }, [])

  // 预加载本地 Skills 到缓存，打开 Skills 面板时可立即显示
  useEffect(() => {
    listLocalSkills().catch(() => {})
  }, [])

  // 托盘菜单 "设置..." -> 打开设置面板
  useEffect(() => {
    const bridge = typeof window !== 'undefined' ? window.piDesktop : undefined
    if (!bridge) return
    const unsub = bridge.events.onOpenSettings(() => setSettingsOpen(true))
    return () => { unsub() }
  }, [])

  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null)
  const [newSessionToken, setNewSessionToken] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isDark, setIsDark] = useState(() => {
    try { return localStorage.getItem('pi-theme') === 'dark' } catch { return false }
  })
  const [fontSize, setFontSize] = useState(() => {
    try {
      const saved = localStorage.getItem('pi-font-size')
      if (saved !== null) {
        const v = Number(saved)
        if (v >= 12 && v <= 24) return v
      }
      const m = localStorage.getItem('pi-mode')
      return m === 'senior' ? 18 : 14
    } catch { return 14 }
  })
  const [mode, setMode] = useState<'young' | 'senior'>(() => {
    try { const v = localStorage.getItem('pi-mode'); return v === 'senior' ? 'senior' : 'young' } catch { return 'young' }
  })
  const [settingsOpen, setSettingsOpen] = useState(() => {
    // 未设置密码时自动打开设置面板
    try { return !localStorage.getItem('pi-server-password') } catch { return true }
  })
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [serverUrl, setServerUrl] = useState(() => {
    try {
      const saved = localStorage.getItem('pi-server-url')
      if (saved && typeof window !== 'undefined' && window.location.host === 'localhost:5173' && /^https?:\/\/(127\.0\.0\.1|localhost):30142\/?$/.test(saved.trim())) {
        localStorage.setItem('pi-server-url', '/superking-api')
        return '/superking-api'
      }
      return saved || (import.meta.env.VITE_PI_API_BASE as string | undefined) || '/superking-api'
    } catch { return '/superking-api' }
  })
  const [password, setPassword] = useState(() => {
    try { return localStorage.getItem('pi-server-password') || '' } catch { return '' }
  })
  const [localHelperUrl, setLocalHelperUrl] = useState(() => {
    try { return localStorage.getItem('pi-local-helper-url') || (import.meta.env.VITE_LOCAL_HELPER_BASE as string | undefined) || 'http://127.0.0.1:30143' } catch { return 'http://127.0.0.1:30143' }
  })
  const [modelProviders, setModelProviders] = useState<ModelProviderInfo[]>([])
  const [config, setConfig] = useState<ConfigInfo | null>(null)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('pi-pinned-sessions')
      return new Set(raw ? JSON.parse(raw) as string[] : [])
    } catch { return new Set<string>() }
  })
  const chatInputRef = useRef<ChatInputHandle | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    localStorage.setItem('pi-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  useEffect(() => {
    document.documentElement.classList.toggle('senior-mode', mode === 'senior')
    localStorage.setItem('pi-mode', mode)
  }, [mode])

  useEffect(() => {
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`)
    localStorage.setItem('pi-font-size', String(fontSize))
  }, [fontSize])

  useEffect(() => {
    localStorage.setItem('pi-server-url', serverUrl)
  }, [serverUrl])

  useEffect(() => {
    localStorage.setItem('pi-server-password', password)
  }, [password])

  useEffect(() => {
    localStorage.setItem('pi-local-helper-url', localHelperUrl)
  }, [localHelperUrl])

  // 加载模型列表与全局配置
  useEffect(() => {
    let cancelled = false
    Promise.all([
      listModels().then((providers) => { if (!cancelled) setModelProviders(providers) }),
      getConfig().then((cfg) => { if (!cancelled) setConfig(cfg) }),
    ]).catch((err) => {
      console.error('Failed to load models/config:', err)
    })
    return () => { cancelled = true }
  }, [serverUrl, password])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        setSidebarOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const loadSessionsForCwd = useCallback((cwd: string | null) => {
    let cancelled = false
    setSessionsLoading(true)
    listSessions(cwd ?? undefined)
      .then((loaded) => {
        if (cancelled) return
        setSessions(loaded)
        setSessionLoadError(null)
        if (cwd) {
          setSelectedCwd(cwd)
          setSelectedSession(null)
          setNewSessionCwd(cwd)
        }
      })
      .catch((error) => {
        if (cancelled) return
        setSessions([])
        setSessionLoadError(error instanceof Error ? error.message : '无法连接真实 Pi SDK 后端')
      })
      .finally(() => {
        if (!cancelled) setSessionsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => loadSessionsForCwd(selectedCwd), [loadSessionsForCwd, selectedCwd])

  const handleSelectSession = useCallback((session: SessionInfo) => {
    setNewSessionCwd(null)
    setSelectedSession(session)
  }, [])

  const handleNewSession = useCallback(() => {
    if (!selectedCwd) return
    setSelectedSession(null)
    setNewSessionCwd(selectedCwd)
    setNewSessionToken((v) => v + 1)
  }, [selectedCwd])

  const handleCwdChange = useCallback((cwd: string | null) => {
    if (cwd === selectedCwd) return
    setSelectedCwd(cwd)
    setSessions([])
    setSessionLoadError(null)
    setSelectedSession(null)
    setNewSessionCwd(cwd)
    if (cwd) {
      addRecentPath(cwd)
        .then((paths) => setRecentCwds(paths.map((p) => p.path)))
      .catch((err) => { console.error('Failed to load recent paths:', err) })
    }
  }, [selectedCwd])

  const handleSessionCreated = useCallback((session: SessionInfo) => {
    setSessions((current) => upsertSession(current, session))
  }, [])

  const handleRenameSession = useCallback(async (session: SessionInfo, name: string) => {
    try {
      const renamed = await renameSession(session.id, name)
      setSessions((current) => upsertSession(current, { ...session, ...renamed, modified: session.modified }))
      setSelectedSession((current) => current?.id === session.id ? { ...current, ...renamed, modified: current.modified } : current)
    } catch (err) {
      setToast('重命名失败：' + (err instanceof Error ? err.message : String(err)))
    }
  }, [])

  const handlePinSession = useCallback((session: SessionInfo) => {
    setPinnedIds((prev) => {
      const next = new Set(prev)
      if (next.has(session.id)) {
        next.delete(session.id)
      } else {
        next.add(session.id)
      }
      localStorage.setItem('pi-pinned-sessions', JSON.stringify([...next]))
      return next
    })
  }, [])

  const handleDeleteSession = useCallback(async (session: SessionInfo) => {
    try {
      await deleteSession(session.id)
      if (selectedSession?.id === session.id) {
        setSelectedSession(null)
        setNewSessionCwd(session.cwd ?? selectedCwd)
      }
      setSessions((current) => current.filter((s) => s.id !== session.id))
    } catch (err) {
      setToast('删除失败：' + (err instanceof Error ? err.message : String(err)))
    }
  }, [selectedSession, selectedCwd])

  const handleSwitchModel = useCallback(async (sessionId: string, provider: string, modelId: string) => {
    try {
      await switchModel(sessionId, provider, modelId)
      const updated: Partial<SessionInfo> = { model: { provider, modelId } }
      setSessions((current) => current.map((s) => s.id === sessionId ? { ...s, ...updated } : s))
      setSelectedSession((current) => current?.id === sessionId ? { ...current, ...updated } : current)
    } catch (err) {
      setToast('切换模型失败：' + (err instanceof Error ? err.message : String(err)))
    }
  }, [])

  const showChat = selectedSession !== null || newSessionCwd !== null

  return (
    <>
      <div className="noise-overlay" aria-hidden="true" />
      <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--bg)' }}>
        {/* Left sidebar - always visible */}
        <div style={{
          width: sidebarOpen ? 260 : 0,
          minWidth: sidebarOpen ? 260 : 0,
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'width 0.2s ease, min-width 0.2s ease',
        }}>
          <div style={{ width: 260, minWidth: 260, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Sidebar
              sessions={sessions}
              selectedId={selectedSession?.id ?? null}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewSession}
              onDeleteSession={handleDeleteSession}
              onRenameSession={handleRenameSession}
              onPinSession={handlePinSession}
              pinnedIds={pinnedIds}
              selectedCwd={selectedCwd}
              recentCwds={recentCwds}
              onCwdChange={handleCwdChange}
              sessionLoadError={sessionLoadError}
              sessionsLoading={sessionsLoading}
              onOpenSkills={() => setSkillsOpen(true)}
            />
          </div>
        </div>

        {/* Center: chat */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          {/* Top bar */}
          <div style={{
            display: 'flex', alignItems: 'center', flexShrink: 0,
            borderBottom: '1px solid var(--border)', height: 36, background: 'var(--bg)',
          }}>
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? '收起侧边栏 (Ctrl+B)' : '展开侧边栏 (Ctrl+B)'}
              className="btn-ghost-icon"
              style={{ width: 36, height: 36 }}
            >
              {sidebarOpen ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setIsDark((v) => !v)}
              title={isDark ? '切换到浅色模式' : '切换到深色模式'}
              className="btn-ghost-icon"
              style={{ width: 36, height: 36 }}
            >
              {isDark ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
            </button>
            <div style={{ flex: 1 }} />
            <div style={{ marginRight: 8 }}>
              <SuperKingBadge onOpenSettings={() => setSettingsOpen(true)} />
            </div>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="设置"
              className={`btn-icon ${settingsOpen ? 'active' : ''}`}
              style={{ width: 32, height: 32, marginRight: 4 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>

          {/* Chat content */}
          <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
            {showChat ? (
              <ChatArea
                key={selectedSession?.id ?? `new-${newSessionCwd ?? selectedCwd ?? 'none'}-${newSessionToken}`}
                session={selectedSession}
                selectedCwd={selectedCwd}
                newSessionCwd={newSessionCwd}
                chatInputRef={chatInputRef}
                onSessionCreated={handleSessionCreated}
                modelProviders={modelProviders}
                config={config}
                onSwitchModel={handleSwitchModel}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: '20px 16px' }}>
                  <div style={{ width: '100%', maxWidth: 820, transform: 'translateY(-30px)' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      marginLeft: 16,
                      marginRight: 52,
                      marginBottom: 16,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0, flex: 1, lineHeight: 1.2 }}>
                        <span style={{ fontSize: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)' }}>教育智能体</span>
                        <span style={{ fontSize: 'var(--font-base)', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          <Typewriter phrases={TYPEWRITER_PHRASES} />
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                          教育智能体
                        </span>
                        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                          {APP_INSTITUTION}
                        </span>
                      </div>
                    </div>
                    <ChatInput
                      ref={chatInputRef}
                      placeholder="先选择项目目录后即可开始对话..."
                      onSend={() => setToast('请先从左侧选择项目目录')}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {skillsOpen && (
        <SkillsPanel
          cwd={selectedCwd}
          onClose={() => setSkillsOpen(false)}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          isDark={isDark}
          onThemeChange={setIsDark}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          mode={mode}
          onModeChange={setMode}
          serverUrl={serverUrl}
          onServerUrlChange={setServerUrl}
          password={password}
          onPasswordChange={setPassword}
          localHelperUrl={localHelperUrl}
          onLocalHelperUrlChange={setLocalHelperUrl}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', borderRadius: 10, background: '#dc2626', color: '#fff',
          fontSize: 'calc(var(--font-base) * 0.929)', fontWeight: 600, boxShadow: 'var(--shadow-lg)',
          zIndex: 999, transition: 'opacity 0.3s',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
