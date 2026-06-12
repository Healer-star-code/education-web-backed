import { useState, useCallback, useRef, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import type { SessionInfo } from './mockData'
import type { ChatInputHandle } from './components/ChatInput'
import { SettingsPanel } from './components/SettingsPanel'
import { SkillsPanel } from './components/SkillsPanel'
import { listSessions, listRecentPaths, addRecentPath, deleteSession, renameSession } from './lib/piApi'
import { upsertSession } from './lib/sessionState'

const STREAM_TEXT = '教育智能体'

function StreamTitle() {
  const [chars, setChars] = useState(0)
  const [started, setStarted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setStarted(true), 300)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (!started) return
    if (chars >= STREAM_TEXT.length) return
    const t = setTimeout(() => setChars((c) => c + 1), 120)
    return () => clearTimeout(t)
  }, [chars, started])

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', cursor: 'pointer' }} onClick={() => { setChars(0); setStarted(true) }}>
      <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text)', minHeight: 44 }}>
        {STREAM_TEXT.slice(0, chars)}
        {chars < STREAM_TEXT.length && started && (
          <span style={{ color: 'var(--accent)', animation: 'blink 1s step-end infinite' }}>|</span>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [sessionLoadError, setSessionLoadError] = useState<string | null>(null)
  const [selectedSession, setSelectedSession] = useState<SessionInfo | null>(null)
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null)
  const [recentCwds, setRecentCwds] = useState<string[]>([])
  useEffect(() => {
    listRecentPaths()
      .then((paths) => setRecentCwds(paths.map((p) => p.path)))
      .catch(() => {})
  }, [])

  const [newSessionCwd, setNewSessionCwd] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [isDark, setIsDark] = useState(false)
  const [fontSize, setFontSize] = useState(14)
  const [mode, setMode] = useState<'young' | 'senior'>('young')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
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
    document.documentElement.style.setProperty('--font-size', `${fontSize}px`)
  }, [fontSize])

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
  }, [selectedCwd])

  const handleCwdChange = useCallback((cwd: string | null) => {
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
  }, [])

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

  const handleDeleteSession = useCallback(async (session: SessionInfo) => {
    if (!session.sessionFile) return
    try {
      await deleteSession(session.sessionFile)
      if (selectedSession?.id === session.id) {
        setSelectedSession(null)
        setNewSessionCwd(session.cwd ?? selectedCwd)
      }
      setSessions((current) => current.filter((s) => s.id !== session.id))
    } catch (err) {
      setToast('删除失败：' + (err instanceof Error ? err.message : String(err)))
    }
  }, [selectedSession, selectedCwd])

  const showChat = selectedSession !== null || newSessionCwd !== null

  return (
    <>
      <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', background: 'var(--bg)' }}>
        {/* Left sidebar - always visible */}
        <div style={{
          width: sidebarOpen ? 230 : 0,
          minWidth: sidebarOpen ? 230 : 0,
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'width 0.2s ease, min-width 0.2s ease',
        }}>
          <div style={{ width: 230, minWidth: 230, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <Sidebar
              sessions={sessions}
              selectedId={selectedSession?.id ?? null}
              onSelectSession={handleSelectSession}
              onNewSession={handleNewSession}
              onDeleteSession={handleDeleteSession}
              onRenameSession={handleRenameSession}
              selectedCwd={selectedCwd}
              recentCwds={recentCwds}
              onCwdChange={handleCwdChange}
              sessionLoadError={sessionLoadError}
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
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, padding: 0,
                background: 'none', border: 'none', borderRight: '1px solid var(--border)',
                color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, transition: 'color 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
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
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, padding: 0,
                background: 'none', border: 'none', borderRight: '1px solid var(--border)',
                color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0, transition: 'color 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
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
            <button
              onClick={() => setSkillsOpen(!skillsOpen)}
              title="Skills"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 32, padding: '0 10px', marginRight: 4,
                background: skillsOpen ? 'var(--bg-selected)' : 'var(--bg-hover)',
                border: skillsOpen ? '1px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 7, color: skillsOpen ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer', flexShrink: 0, transition: 'all 0.12s',
                fontSize: 12, fontWeight: 600,
              }}
            >
              Skills
            </button>
            <button
              onClick={() => setSettingsOpen(!settingsOpen)}
              title="设置"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, padding: 0, marginRight: 4,
                background: settingsOpen ? 'var(--bg-selected)' : 'var(--bg-hover)',
                border: settingsOpen ? '1px solid var(--accent)' : '1px solid var(--border)',
                borderRadius: 7, color: settingsOpen ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer', flexShrink: 0, transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={(e) => { if (!settingsOpen) e.currentTarget.style.color = 'var(--text-muted)' }}
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
                session={selectedSession}
                selectedCwd={selectedCwd}
                newSessionCwd={newSessionCwd}
                chatInputRef={chatInputRef}
                onSessionCreated={handleSessionCreated}
              />
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <StreamTitle />
                <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                  请先从左侧选择项目目录，智能体只能在该目录内工作
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
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', borderRadius: 10, background: '#dc2626', color: '#fff',
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          zIndex: 999, transition: 'opacity 0.3s',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
