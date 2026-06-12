import { useState, useRef, useEffect, useMemo } from 'react'
import type { SessionInfo } from '../mockData'
import { selectDirectory } from '../lib/piApi'

interface Props {
  sessions: SessionInfo[]
  selectedId: string | null
  onSelectSession: (s: SessionInfo) => void
  onDeleteSession: (s: SessionInfo) => void
  onNewSession: () => void
  selectedCwd: string | null
  recentCwds: string[]
  onCwdChange: (cwd: string | null) => void
  sessionLoadError?: string | null
  onOpenSkills?: () => void
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

function shortenCwd(cwd: string): string {
  const parts = cwd.split('/').filter(Boolean)
  if (parts.length <= 2) return cwd
  return '\u2026/' + parts.slice(-2).join('/')
}

interface SessionTreeNode {
  session: SessionInfo
  children: SessionTreeNode[]
}

function buildSessionTree(sessions: SessionInfo[]): SessionTreeNode[] {
  const byId = new Map<string, SessionTreeNode>()
  for (const s of sessions) {
    byId.set(s.id, { session: s, children: [] })
  }

  const parentOf = new Map<string, string>()
  for (const s of sessions) {
    if (s.parentSessionId) parentOf.set(s.id, s.parentSessionId)
  }

  function resolveAncestor(id: string): string | null {
    let cur = parentOf.get(id)
    const visited = new Set<string>()
    while (cur) {
      if (visited.has(cur)) return null
      visited.add(cur)
      if (byId.has(cur)) return cur
      cur = parentOf.get(cur)
    }
    return null
  }

  const roots: SessionTreeNode[] = []
  for (const node of byId.values()) {
    const ancestor = resolveAncestor(node.session.id)
    if (ancestor) {
      byId.get(ancestor)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sort = (nodes: SessionTreeNode[]) => {
    nodes.sort((a, b) => b.session.modified.localeCompare(a.session.modified))
    nodes.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}

function PiAgentTitle() {
  return (
    <span style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', color: 'var(--text)' }}>
      教育智能体
    </span>
  )
}

export function Sidebar({ sessions, selectedId, onSelectSession, onNewSession, selectedCwd, recentCwds, onCwdChange, sessionLoadError, onOpenSkills, onDeleteSession }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectingDirectory, setSelectingDirectory] = useState(false)
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredSessions = selectedCwd
    ? sessions.filter((s) => s.cwd.replace(/[/\\]+/g, '/') === selectedCwd.replace(/[/\\]+/g, '/'))
    : sessions

  const sessionTree = useMemo(() => buildSessionTree(filteredSessions), [filteredSessions])

  async function handleCustomPath() {
    if (selectingDirectory) return
    setSelectingDirectory(true)
    setDirectoryError(null)
    try {
      const selectedPath = await selectDirectory()
      if (selectedPath) {
        onCwdChange(selectedPath)
        setDropdownOpen(false)
      }
    } catch (err) {
      setDirectoryError(err instanceof Error ? err.message : String(err))
    } finally {
      setSelectingDirectory(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 10px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <PiAgentTitle />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={onNewSession}
              disabled={!selectedCwd}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                color: selectedCwd ? 'var(--text-muted)' : 'var(--text-dim)',
                cursor: selectedCwd ? 'pointer' : 'not-allowed',
                height: 32,
                paddingLeft: 10,
                paddingRight: 12,
                borderRadius: 7,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: '-0.01em',
                flexShrink: 0,
                transition: 'background 0.12s, color 0.12s, border-color 0.12s',
              }}
              title={selectedCwd ? `New session in ${selectedCwd}` : 'Select a project first'}
              onMouseEnter={(e) => {
                if (!selectedCwd) return
                e.currentTarget.style.background = 'var(--bg-selected)'
                e.currentTarget.style.color = 'var(--accent)'
                e.currentTarget.style.borderColor = 'rgba(37,99,235,0.35)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.color = selectedCwd ? 'var(--text-muted)' : 'var(--text-dim)'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="6" y1="1" x2="6" y2="11" />
                <line x1="1" y1="6" x2="11" y2="6" />
              </svg>
              New
            </button>
            <button
              title="Refresh"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                width: 32, height: 32,
                borderRadius: 7,
                padding: 0,
                flexShrink: 0,
                transition: 'background 0.12s, color 0.12s, border-color 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-selected)'
                e.currentTarget.style.color = 'var(--accent)'
                e.currentTarget.style.borderColor = 'rgba(37,99,235,0.35)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)'
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </div>
        </div>

        {/* CWD picker */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              padding: '6px 10px',
              background: selectedCwd ? 'var(--bg-hover)' : 'rgba(37,99,235,0.06)',
              border: selectedCwd ? '1px solid var(--border)' : '1px solid rgba(37,99,235,0.4)',
              borderRadius: 7,
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text)',
              textAlign: 'left',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                color: selectedCwd ? 'var(--text)' : 'var(--text-dim)',
              }}
              title={selectedCwd ?? ''}
            >
              {selectedCwd ? shortenCwd(selectedCwd) : 'Select project...'}
            </span>
          </button>

          {dropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                zIndex: 100,
                background: 'var(--bg)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
                overflow: 'hidden',
              }}
            >
              {recentCwds.map((cwd) => (
                <button
                  key={cwd}
                  onClick={() => {
                    onCwdChange(cwd)
                    setDropdownOpen(false)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    width: '100%',
                    padding: '8px 10px',
                    background: cwd === selectedCwd ? 'var(--bg-selected)' : 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    color: cwd === selectedCwd ? 'var(--text)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={cwd}
                >
                  {cwd === selectedCwd && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <polyline points="1.5 5 4 7.5 8.5 2.5" />
                    </svg>
                  )}
                  {cwd !== selectedCwd && <span style={{ width: 10, flexShrink: 0 }} />}
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {shortenCwd(cwd)}
                  </span>
                </button>
              ))}
              <button
                onClick={handleCustomPath}
                disabled={selectingDirectory}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  width: '100%',
                  padding: '8px 10px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: selectingDirectory ? 'wait' : 'pointer',
                  textAlign: 'left',
                  fontSize: 11,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <line x1="5" y1="1" x2="5" y2="9" />
                  <line x1="1" y1="5" x2="9" y2="5" />
                </svg>
                <span>{selectingDirectory ? 'Opening picker...' : 'Custom path...'}</span>
              </button>
            </div>
          )}
        </div>
        {directoryError && (
          <div style={{ marginTop: 6, color: '#dc2626', fontSize: 11, lineHeight: 1.4 }}>
            {directoryError}
          </div>
        )}
      </div>

      {/* Session list */}
      <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '0', minHeight: 80 }}>
        {filteredSessions.length === 0 && (
          <div style={{ padding: '16px 14px', color: sessionLoadError ? '#dc2626' : 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
            {sessionLoadError ? `后端连接失败：${sessionLoadError}` : '此目录下暂无历史会话'}
          </div>
        )}
        {sessionTree.map((node) => (
          <SessionTreeItem
            key={node.session.id}
            node={node}
            selectedId={selectedId}
            onSelectSession={onSelectSession}
            onDeleteSession={onDeleteSession}
            depth={0}
          />
        ))}
      </div>


      {/* Bottom Skills button */}
      <div style={{ padding: '8px', flexShrink: 0 }}>
        <button
          title="Skills"
          onClick={() => {
            if (selectedCwd) onOpenSkills?.()
          }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            height: 32, padding: 0, background: 'none', border: 'none',
            borderRadius: 9, color: 'var(--text-muted)', cursor: selectedCwd ? 'pointer' : 'default',
            fontSize: 12, opacity: selectedCwd ? 1 : 0.35,
            transition: 'background 0.12s, color 0.12s',
          }}
          onMouseEnter={(e) => {
            if (selectedCwd) {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.color = 'var(--text)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          Skills
        </button>
      </div>
    </div>
  )
}

function SessionTreeItem({ node, selectedId, onSelectSession, onDeleteSession, depth }: {
  node: SessionTreeNode
  selectedId: string | null
  onSelectSession: (s: SessionInfo) => void
  onDeleteSession: (s: SessionInfo) => void
  depth: number
}) {
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <div style={{ position: 'relative' }}>
        {depth > 0 && (
          <div style={{
            position: 'absolute',
            left: depth * 12 + 6,
            top: 0, bottom: 0,
            width: 1,
            background: 'var(--border)',
            pointerEvents: 'none',
          }} />
        )}
        <SessionItem
          session={node.session}
          isSelected={node.session.id === selectedId}
          onClick={() => onSelectSession(node.session)}
          onDelete={() => onDeleteSession(node.session)}
          depth={depth}
          hasChildren={hasChildren}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      </div>
      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <SessionTreeItem
              key={child.session.id}
              node={child}
              selectedId={selectedId}
              onSelectSession={onSelectSession}
              onDeleteSession={onDeleteSession}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionItem({ session, isSelected, onClick, onDelete, depth = 0, hasChildren = false, collapsed = false, onToggleCollapse }: {
  session: SessionInfo
  isSelected: boolean
  onClick: () => void
  onDelete: () => void
  depth?: number
  hasChildren?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const title = session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 54,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: depth > 0 ? depth * 12 + 14 : 14,
        paddingRight: 8,
        cursor: 'pointer',
        background: isSelected ? 'var(--bg-selected)' : hovered ? 'var(--bg-hover)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.1s',
        gap: 6,
        overflow: 'hidden',
      }}
    >
      {depth > 0 && (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </svg>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: isSelected ? 500 : 400,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--text)',
          }}
          title={title}
        >
          {title}
          {session.orphaned && (
            <span style={{
              marginLeft: 6, padding: '1px 5px',
              background: 'rgba(239,68,68,0.12)',
              borderRadius: 3, fontSize: 10,
              color: '#f87171', fontWeight: 500,
            }}>
              incomplete
            </span>
          )}
        </div>
        <div style={{ marginTop: 2, display: 'flex', gap: 8, color: 'var(--text-dim)', fontSize: 11 }}>
          <span title={session.modified}>{formatRelativeTime(session.modified)}</span>
          <span>{session.messageCount} msgs</span>
        </div>
        <div style={{
          marginTop: 1, fontSize: 10, color: 'var(--text-dim)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {session.cwd}
        </div>
      </div>
      {hovered && !confirming && (
        <button
          onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
          title="删除会话"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, padding: 0, flexShrink: 0,
            background: 'none', border: 'none',
            color: 'var(--text-dim)', cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-dim)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      )}
      {confirming && (
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete?.(); setConfirming(false) }}
            title="确认删除"
            style={{ padding: '2px 6px', fontSize: 10, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            删除
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setConfirming(false) }}
            title="取消"
            style={{ padding: '2px 6px', fontSize: 10, background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
          >
            取消
          </button>
        </div>
      )}
      {hasChildren && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleCollapse?.() }}
          title={collapsed ? 'Expand forks' : 'Collapse forks'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20, padding: 0, flexShrink: 0,
            background: 'none', border: 'none',
            color: 'var(--text-dim)', cursor: 'pointer',
            transform: collapsed ? 'rotate(-90deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="2 3.5 5 6.5 8 3.5" />
          </svg>
        </button>
      )}
    </div>
  )
}
