import { useState, useRef, useEffect } from 'react'
import type { SessionInfo, FileNode } from '../mockData'
import { FileExplorer } from './FileExplorer'

interface Props {
  sessions: SessionInfo[]
  selectedId: string | null
  onSelectSession: (s: SessionInfo) => void
  onNewSession: () => void
  fileTree: FileNode[]
  selectedCwd: string | null
  onCwdChange: (cwd: string | null) => void
  onOpenFile: (path: string, name: string) => void
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

function getRecentCwds(sessions: SessionInfo[]): string[] {
  const latestByCwd = new Map<string, string>()
  for (const s of sessions) {
    if (!s.cwd) continue
    const prev = latestByCwd.get(s.cwd)
    if (!prev || s.modified > prev) {
      latestByCwd.set(s.cwd, s.modified)
    }
  }
  return [...latestByCwd.entries()]
    .sort((a, b) => b[1].localeCompare(a[1]))
    .slice(0, 5)
    .map(([cwd]) => cwd)
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
      web 模拟版本1
    </span>
  )
}

export function Sidebar({ sessions, selectedId, onSelectSession, onNewSession, fileTree, selectedCwd, onCwdChange, onOpenFile }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [explorerOpen, setExplorerOpen] = useState(true)
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

  const recentCwds = getRecentCwds(sessions)
  const filteredSessions = selectedCwd
    ? sessions.filter((s) => s.cwd === selectedCwd)
    : sessions

  const sessionTree = buildSessionTree(filteredSessions)

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
                onClick={() => setDropdownOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  width: '100%',
                  padding: '8px 10px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 11,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <line x1="5" y1="1" x2="5" y2="9" />
                  <line x1="1" y1="5" x2="9" y2="5" />
                </svg>
                <span>Custom path...</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Session list */}
      <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '0', minHeight: 80 }}>
        {filteredSessions.length === 0 && (
          <div style={{ padding: '16px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
            No sessions found
          </div>
        )}
        {sessionTree.map((node) => (
          <SessionTreeItem
            key={node.session.id}
            node={node}
            selectedId={selectedId}
            onSelectSession={onSelectSession}
            depth={0}
          />
        ))}
      </div>

      {/* File Explorer section */}
      {selectedCwd && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            flex: explorerOpen ? '1 1 0' : '0 0 auto',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <button
              onClick={() => setExplorerOpen((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                flex: 1,
                padding: '6px 10px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                textAlign: 'left',
              }}
            >
              <svg
                width="9" height="9" viewBox="0 0 10 10" fill="none"
                stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: explorerOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
              >
                <polyline points="3 2 7 5 3 8" />
              </svg>
              Explorer
            </button>
          </div>
          {explorerOpen && (
            <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
              <FileExplorer tree={fileTree} onOpenFile={onOpenFile} />
            </div>
          )}
        </div>
      )}

      {/* Bottom Skills button */}
      <div style={{ padding: '8px', flexShrink: 0 }}>
        <button
          title="Skills"
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

function SessionTreeItem({ node, selectedId, onSelectSession, depth }: {
  node: SessionTreeNode
  selectedId: string | null
  onSelectSession: (s: SessionInfo) => void
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
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SessionItem({ session, isSelected, onClick, depth = 0, hasChildren = false, collapsed = false, onToggleCollapse }: {
  session: SessionInfo
  isSelected: boolean
  onClick: () => void
  depth?: number
  hasChildren?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
}) {
  const [hovered, setHovered] = useState(false)
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
