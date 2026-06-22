import { useState, useCallback, useRef, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { ChatArea } from './components/ChatArea'
import type { SessionInfo } from './mockData'
import { ChatInput, type ChatInputHandle } from './components/ChatInput'
import { SettingsPanel } from './components/SettingsPanel'
import { SkillsPanel } from './components/SkillsPanel'
import { SuperKingBadge } from './components/SuperKingBadge'
import { Typewriter } from './components/Typewriter'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  listSessions, listRecentPaths, addRecentPath, deleteSession, renameSession,
  listLocalSkills, listModels, getConfig, switchModel,
  type ModelProviderInfo,
  type ConfigInfo,
} from './lib/piApi'
import { upsertSession } from './lib/sessionState'
import { isDesktop, getDesktopBridge } from './lib/desktopBridge'

// Electron 打包后没有 vite 代理，/superking-api 这种相对路径会解析成 file:///superking-api 而失败。
// 必须用绝对地址 http://127.0.0.1:<port> 直连本机的 super-king 进程。
function pickDefaultServerUrl(): string {
  if (isDesktop) {
    // 打包模式：默认走 30142（与 electron-store 默认 port 保持一致）。
    // 真正的 port 会在挂载后通过 superking.status() 异步纠正。
    return 'http://127.0.0.1:30142'
  }
  // 浏览器/dev：走 vite 代理
  return '/superking-api'
}

const APP_INSTITUTION = (import.meta.env.VITE_APP_INSTITUTION as string | undefined) ?? `v${__APP_VERSION__}`

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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [toast, setToast] = useState<{ message: string; type?: 'success' | 'error' } | null>(null)
  const [serverUrl, setServerUrl] = useState(() => {
    try {
      const saved = localStorage.getItem('pi-server-url')
      const fallback = pickDefaultServerUrl()
      // dev 模式残留旧地址清理：如果当前在 vite dev server 上但 localStorage 里存的是 127.0.0.1:30142，
      // 修正回 /superking-api 走代理。
      if (saved && typeof window !== 'undefined' && window.location.host === 'localhost:5173' && /^https?:\/\/(127\.0\.0\.1|localhost):30142\/?$/.test(saved.trim())) {
        localStorage.setItem('pi-server-url', '/superking-api')
        return '/superking-api'
      }
      // Electron 打包模式：如果之前残留 '/superking-api'（相对路径在 file:// 下用不了），
      // 强制改为绝对地址。
      if (isDesktop && saved === '/superking-api') {
        localStorage.setItem('pi-server-url', fallback)
        return fallback
      }
      return saved || (import.meta.env.VITE_PI_API_BASE as string | undefined) || fallback
    } catch { return pickDefaultServerUrl() }
  })
  const [password, setPassword] = useState(() => {
    try { return localStorage.getItem('pi-server-password') || '' } catch { return '' }
  })
  const [localHelperUrl, setLocalHelperUrl] = useState(() => {
    try { return localStorage.getItem('pi-local-helper-url') || (import.meta.env.VITE_LOCAL_HELPER_BASE as string | undefined) || 'http://127.0.0.1:30143' } catch { return 'http://127.0.0.1:30143' }
  })
  const [autoApproveAllTools, setAutoApproveAllToolsState] = useState<boolean>(() => {
    try { return localStorage.getItem('pi-auto-approve-all-tools') === '1' } catch { return false }
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

  // Electron 模式：监听 super-king 状态变化，端口变了就纠正 serverUrl，
  // 同时第一次启动时也用 status().port 对齐一次。
  useEffect(() => {
    if (!isDesktop) return
    const bridge = getDesktopBridge()
    if (!bridge) return
    const align = (port: number) => {
      const target = `http://127.0.0.1:${port}`
      setServerUrl(prev => {
        // 用户自己配的远程地址（不是 127.0.0.1/localhost）就不要覆盖
        if (prev && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(prev.trim()) && prev !== '/superking-api') {
          return prev
        }
        return prev === target ? prev : target
      })
    }
    bridge.superking.status().then(s => align(s.port)).catch(() => {})
    const off = bridge.superking.onStatusChange(s => align(s.port))
    return () => { off() }
  }, [])

  // Electron 模式：启动时从 electron-store 拉取持久化的密码 / URL，
  // electron-store 是 Electron 模式下的权威数据源（localStorage 只是 renderer 缓存）。
  // 新用户开箱即用：electron-store defaults 有 superKingPassword=123456 + port=30142，
  // 与外部 super-king 默认配置一致，直接能连上。
  useEffect(() => {
    if (!isDesktop) return
    const bridge = getDesktopBridge()
    if (!bridge) return
    bridge.settings.get().then(s => {
      // 密码：electron-store 有值就用它覆盖（确保跨版本/重装持久化的密码立即生效）
      if (s.superKingPassword) {
        setPassword(prev => (prev === s.superKingPassword ? prev : s.superKingPassword))
      }
      // URL：远程模式用 remoteUrl，本地模式用 127.0.0.1:port
      const target = s.useRemote && s.remoteUrl
        ? s.remoteUrl
        : `http://127.0.0.1:${s.superKingPort}`
      setServerUrl(prev => (prev === target ? prev : target))
    }).catch(err => {
      console.warn('[settings hydration] failed to read electron-store:', err)
    })
  }, [])

  useEffect(() => {
    localStorage.setItem('pi-server-password', password)
  }, [password])

  useEffect(() => {
    localStorage.setItem('pi-local-helper-url', localHelperUrl)
  }, [localHelperUrl])

  // 启动时从 electron-store 同步 autoApproveAllTools（权威数据源），覆盖 localStorage 兜底值
  useEffect(() => {
    if (!isDesktop) return
    const bridge = getDesktopBridge()
    if (!bridge) return
    bridge.settings.get().then((s) => {
      const v = !!s?.autoApproveAllTools
      setAutoApproveAllToolsState(v)
      try { localStorage.setItem('pi-auto-approve-all-tools', v ? '1' : '0') } catch {}
    }).catch((err) => {
      console.warn('[autoApprove] failed to load from electron-store:', err)
    })
  }, [])

  const setAutoApproveAllTools = useCallback((v: boolean) => {
    setAutoApproveAllToolsState(v)
    try { localStorage.setItem('pi-auto-approve-all-tools', v ? '1' : '0') } catch {}
    if (isDesktop) {
      const bridge = getDesktopBridge()
      if (bridge?.settings?.set) {
        bridge.settings.set({ autoApproveAllTools: v }).catch((err) => {
          console.warn('[autoApprove] failed to persist to electron-store:', err)
        })
      }
    }
  }, [])

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
    // 密码还没就位时：不发请求，不显示「连接失败」红字，
    // 等 hydration effect 把密码灌进来后会通过 useEffect 依赖自动重试。
    if (!password) {
      setSessions([])
      setSessionLoadError(null)
      setSessionsLoading(false)
      return () => { cancelled = true }
    }
    setSessionsLoading(true)
    listSessions(cwd ?? undefined)
      .then((loaded) => {
        if (cancelled) return
        setSessions(loaded)
        setSessionLoadError(null)
        // 注意：故意不在这里 setSelectedSession(null) / setSelectedCwd(cwd) —— 
        // handleCwdChange 已经负责切目录时的状态重置；如果在这里再清一遍，
        // 用户点击某个会话会触发 effect 重跑 loadSessions 时把刚选中的会话清掉。
        // 把所有会话里出现过的 cwd 合并进 recentCwds，让首次启动的用户
        // 立刻在「选择项目」下拉里看到历史项目目录（不用等用户手动添加）。
        // 同时持久化到 localStorage，下次启动直接可见。
        const cwdsFromSessions = Array.from(
          new Set(loaded.map((s) => s.cwd).filter((c): c is string => !!c))
        )
        if (cwdsFromSessions.length > 0) {
          setRecentCwds((prev) => {
            const merged = Array.from(new Set([...prev, ...cwdsFromSessions]))
            return merged.length === prev.length ? prev : merged
          })
          // 异步持久化每一个 —— addRecentPath 内部会去重并维护最新顺序
          Promise.all(cwdsFromSessions.map((c) => addRecentPath(c)))
            .then((results) => {
              if (cancelled) return
              // 取最后一次调用返回的完整列表（包含所有 cwds，因为是叠加写）
              const last = results[results.length - 1]
              if (last) setRecentCwds(last.map((p) => p.path))
            })
            .catch(() => {})
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
  }, [password, serverUrl])

  // 依赖 password/serverUrl：用户在设置面板改了密码/地址，立即重试连接，
  // 不需要切目录、不需要刷新整个 App。
  useEffect(() => loadSessionsForCwd(selectedCwd), [loadSessionsForCwd, selectedCwd])

  // 连接失败后自动重试：用户可能正在启动 super-king，
  // 每隔 5 秒刷新一次会话列表，直到连接成功。
  const refreshSessions = useCallback(() => loadSessionsForCwd(selectedCwd), [loadSessionsForCwd, selectedCwd])
  useEffect(() => {
    if (!sessionLoadError) return
    const intervalId = setInterval(() => {
      refreshSessions()
    }, 5000)
    return () => clearInterval(intervalId)
  }, [sessionLoadError, refreshSessions])

  const handleSelectSession = useCallback((session: SessionInfo) => {
    setNewSessionCwd(null)
    setSelectedSession(session)
    // 点了某个会话 -> 同步把 selectedCwd 设为该会话的 cwd，
    // 让左上角 CWD picker 立刻显示当前项目目录（之前会一直显示「选择项目...」）。
    if (session.cwd) {
      setSelectedCwd((prev) => (prev === session.cwd ? prev : session.cwd))
      // 顺手写进 recentCwds，确保下次启动也能在下拉里看到
      addRecentPath(session.cwd)
        .then((paths) => setRecentCwds(paths.map((p) => p.path)))
        .catch(() => {})
    }
  }, [])

  const handleNewSession = useCallback(() => {
    if (!selectedCwd) return
    setSelectedSession(null)
    setNewSessionCwd(selectedCwd)
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
      setToast({ message: '重命名失败：' + (err instanceof Error ? err.message : String(err)), type: 'error' })
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
      setToast({ message: '删除失败：' + (err instanceof Error ? err.message : String(err)), type: 'error' })
    }
  }, [selectedSession, selectedCwd])

  const handleSwitchModel = useCallback(async (sessionId: string, provider: string, modelId: string) => {
    try {
      await switchModel(sessionId, provider, modelId)
      const updated: Partial<SessionInfo> = { model: { provider, modelId } }
      setSessions((current) => current.map((s) => s.id === sessionId ? { ...s, ...updated } : s))
      setSelectedSession((current) => current?.id === sessionId ? { ...current, ...updated } : current)
    } catch (err) {
      setToast({ message: '切换模型失败：' + (err instanceof Error ? err.message : String(err)), type: 'error' })
    }
  }, [])

  const showChat = selectedSession !== null || newSessionCwd !== null

  return (
    <ErrorBoundary>
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
              onToast={(message, type) => setToast({ message, type })}
              onRefreshSessions={refreshSessions}
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
                session={selectedSession}
                selectedCwd={selectedCwd}
                newSessionCwd={newSessionCwd}
                chatInputRef={chatInputRef}
                onSessionCreated={handleSessionCreated}
                modelProviders={modelProviders}
                config={config}
                onSwitchModel={handleSwitchModel}
                autoApproveAllTools={autoApproveAllTools}
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
                        <span style={{ fontSize: 'var(--font-display)', fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--text)' }}>超级小金</span>
                        <span style={{ fontSize: 'var(--font-base)', minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          <Typewriter phrases={TYPEWRITER_PHRASES} />
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                          超级小金
                        </span>
                        <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                          {APP_INSTITUTION}
                        </span>
                      </div>
                    </div>
                    <ChatInput
                      ref={chatInputRef}
                      placeholder="先选择项目目录后即可开始对话..."
                      onSend={() => setToast({ message: '请先从左侧选择项目目录', type: 'error' })}
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
          autoApproveAllTools={autoApproveAllTools}
          onAutoApproveAllToolsChange={setAutoApproveAllTools}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', borderRadius: 'var(--radius-lg)',
          background: toast.type === 'success' ? 'var(--success)' : 'var(--danger)', color: '#fff',
          fontSize: 'calc(var(--font-base) * 0.929)', fontWeight: 600, boxShadow: 'var(--shadow-lg)',
          zIndex: 999, transition: 'opacity 0.3s',
        }}>
          {toast.message}
        </div>
      )}
    </>
    </ErrorBoundary>
  )
}
