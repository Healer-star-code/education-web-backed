import { useState, useRef, useEffect, useMemo } from 'react'
import type { SessionInfo } from '../mockData'
import { getMessages, selectDirectory } from '../lib/piApi'
import type { WebMessage } from '../lib/piApi'
import { XiaojinLogo } from './XiaojinLogo'

interface Props {
  sessions: SessionInfo[]
  selectedId: string | null
  onSelectSession: (s: SessionInfo) => void
  onDeleteSession: (s: SessionInfo) => void
  onRenameSession?: (s: SessionInfo, name: string) => void
  onPinSession?: (s: SessionInfo) => void
  pinnedIds?: Set<string>
  onNewSession: () => void
  selectedCwd: string | null
  recentCwds: string[]
  onCwdChange: (cwd: string | null) => void
  sessionLoadError?: string | null
  sessionsLoading?: boolean
  onOpenSkills?: () => void
  onToast?: (message: string, type?: 'success' | 'error') => void
  onRefreshSessions?: () => void
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}

function shortenCwd(cwd: string): string {
  const normalized = cwd.replace(/\\+/g, '/')
  const prefix = /^[A-Za-z]:/.test(normalized) ? normalized.slice(0, 2) : ''
  const parts = normalized.replace(/^[A-Za-z]:/, '').split('/').filter(Boolean)
  if (parts.length <= 2) return cwd
  return (prefix ? `${prefix}/` : '') + '\u2026/' + parts.slice(-2).join('/')
}

interface SessionTreeNode {
  session: SessionInfo
  children: SessionTreeNode[]
}

function buildSessionTree(sessions: SessionInfo[], pinnedIds?: Set<string>): SessionTreeNode[] {
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
    nodes.sort((a, b) => {
      const aPinned = pinnedIds?.has(a.session.id) ? 1 : 0
      const bPinned = pinnedIds?.has(b.session.id) ? 1 : 0
      if (aPinned !== bPinned) return bPinned - aPinned
      return b.session.modified.localeCompare(a.session.modified)
    })
    nodes.forEach((n) => sort(n.children))
  }
  sort(roots)
  return roots
}

function PiAgentTitle() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {/* 超级小金动态吉祥物 logo（亮/暗主题双版本，详见 XiaojinLogo.tsx） */}
      <XiaojinLogo size={28} />
      <span style={{ fontWeight: 750, fontSize: 'var(--font-md)', letterSpacing: '-0.02em', color: 'var(--text)' }}>
        超级小金
      </span>
    </span>
  )
}

export function Sidebar({ sessions, selectedId, onSelectSession, onNewSession, selectedCwd, recentCwds, onCwdChange, sessionLoadError, sessionsLoading, onOpenSkills, onDeleteSession, onRenameSession, onPinSession, pinnedIds, onToast, onRefreshSessions }: Props) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [selectingDirectory, setSelectingDirectory] = useState(false)
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const cwdButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filteredSessions = useMemo(() => {
    let list = selectedCwd
      ? sessions.filter((s) => s.cwd.replace(/[/\\]+/g, '/') === selectedCwd.replace(/[/\\]+/g, '/'))
      : sessions
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((s) => {
        const text = `${s.name ?? ''} ${s.firstMessage ?? ''} ${s.cwd ?? ''} ${s.model?.provider ?? ''} ${s.model?.modelId ?? ''}`.toLowerCase()
        return text.includes(q)
      })
    }
    return list
  }, [sessions, selectedCwd, search])

  const sessionTree = useMemo(() => buildSessionTree(filteredSessions, pinnedIds), [filteredSessions, pinnedIds])

  async function handleCustomPath() {
    if (selectingDirectory) return
    setSelectingDirectory(true)
    setDirectoryError(null)
    try {
      const selectedPath = await selectDirectory()
      if (selectedPath) {
        onCwdChange(selectedPath)
        setDropdownOpen(false)
        return
      }
      // 用户取消选择对话框：什么都不做，保持下拉打开让用户从历史里选。
      // 注意：不能调 window.prompt() —— Electron 渲染进程禁用了 prompt/alert/confirm，
      // 会抛 "prompt() is not supported"。
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setDirectoryError(message)
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
              onClick={() => {
                if (!selectedCwd) {
                  setDropdownOpen(true)
                  cwdButtonRef.current?.focus()
                  return
                }
                onNewSession()
              }}
              className="btn-text"
              title={selectedCwd ? '在当前项目中新建对话' : '请先选择项目目录'}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="6" y1="1" x2="6" y2="11" />
                <line x1="1" y1="6" x2="11" y2="6" />
              </svg>
              新建对话
            </button>

          </div>
        </div>

        {/* Search */}
        <div style={{ marginTop: 10, marginBottom: 8, position: 'relative' }}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text-dim)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索会话..."
            style={{
              width: '100%',
              padding: '6px 10px 6px 28px',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: 'var(--font-sm)',
              outline: 'none',
            }}
          />
          {search && (
            <button
              onClick={() => { setSearch(''); searchRef.current?.focus() }}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 18,
                height: 18,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          )}
        </div>

        {/* CWD picker */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            ref={cwdButtonRef}
            onClick={() => setDropdownOpen((v) => !v)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              padding: '6px 10px',
              background: selectedCwd ? 'var(--bg-hover)' : 'var(--user-bg)',
              border: selectedCwd ? '1px solid var(--border)' : '1px dashed var(--accent)',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontSize: 'var(--font-sm)',
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
                fontSize: 'var(--font-xs)',
                color: selectedCwd ? 'var(--text)' : 'var(--text-dim)',
              }}
              title={selectedCwd ?? ''}
            >
              {selectedCwd ? shortenCwd(selectedCwd) : '选择项目...'}
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
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-md)',
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
                    fontSize: 'var(--font-xs)',
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
                  fontSize: 'var(--font-xs)',
                }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" style={{ flexShrink: 0 }}>
                  <line x1="5" y1="1" x2="5" y2="9" />
                  <line x1="1" y1="5" x2="9" y2="5" />
                </svg>
                <span>{selectingDirectory ? '正在打开...' : '自定义路径...'}</span>
              </button>
            </div>
          )}
        </div>
        {directoryError && (
          <div style={{ marginTop: 6, color: 'var(--danger)', fontSize: 'var(--font-xs)', lineHeight: 1.4 }}>
            {directoryError}
          </div>
        )}
      </div>

      {/* Session list */}
      <div style={{ flex: '1 1 0', overflowY: 'auto', padding: '0', minHeight: 80 }}>
        {sessionsLoading && (
          <div style={{ padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...Array(5)].map((_, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
                <div style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', background: 'var(--bg-hover)', animation: 'shimmer 1.5s ease-in-out infinite' }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ width: '60%', height: 10, borderRadius: 'var(--radius-xs)', background: 'var(--bg-hover)', animation: 'shimmer 1.5s ease-in-out infinite', animationDelay: `${i * 80}ms` }} />
                  <div style={{ width: '40%', height: 8, borderRadius: 'var(--radius-xs)', background: 'var(--bg-hover)', animation: 'shimmer 1.5s ease-in-out infinite', animationDelay: `${i * 80 + 40}ms` }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {!sessionsLoading && filteredSessions.length === 0 && (
          <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px', opacity: 0.5 }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <div style={{ fontSize: 'var(--font-sm)', fontWeight: 500, marginBottom: 4, color: 'var(--text)' }}>
              {sessionLoadError ? '暂时连接不上' : '暂无会话'}
            </div>
            <div style={{ fontSize: 'var(--font-xs)', lineHeight: 1.5, marginBottom: sessionLoadError ? 10 : 0 }}>
              {sessionLoadError
                ? '还没连上超级小金服务。请检查服务是否已启动、地址和密码是否填对。'
                : '点击上方「新建对话」开始'}
            </div>
            {sessionLoadError && onRefreshSessions && (
              <button
                onClick={onRefreshSessions}
                disabled={sessionsLoading}
                className="btn-sidebar-reload"
                style={{ cursor: sessionsLoading ? 'wait' : 'pointer' }}
              >
                {sessionsLoading ? '正在刷新…' : '重新加载'}
              </button>
            )}
          </div>
        )}
        {!sessionsLoading && sessionTree.map((node) => (
          <SessionTreeItem
            key={node.session.id}
            node={node}
            selectedId={selectedId}
            onSelectSession={onSelectSession}
            onDeleteSession={onDeleteSession}
            onRenameSession={onRenameSession}
            onPinSession={onPinSession}
            pinnedIds={pinnedIds}
            depth={0}
            onToast={onToast}
          />
        ))}
      </div>


      {/* Bottom Skills button */}
      <div style={{ padding: '8px', flexShrink: 0, borderTop: '1px solid var(--border)' }}>
        <button
          title="技能库"
          onClick={() => onOpenSkills?.()}
          className="btn-sidebar-footer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          技能库
        </button>
      </div>
    </div>
  )
}

function SessionTreeItem({ node, selectedId, onSelectSession, onDeleteSession, onRenameSession, onPinSession, pinnedIds, depth, onToast }: {
  node: SessionTreeNode
  selectedId: string | null
  onSelectSession: (s: SessionInfo) => void
  onDeleteSession: (s: SessionInfo) => void
  onRenameSession?: (s: SessionInfo, name: string) => void
  onPinSession?: (s: SessionInfo) => void
  pinnedIds?: Set<string>
  depth: number
  onToast?: (message: string, type?: 'success' | 'error') => void
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
          onRename={(name) => onRenameSession?.(node.session, name)}
          onPin={() => onPinSession?.(node.session)}
          isPinned={pinnedIds?.has(node.session.id) ?? false}
          depth={depth}
          hasChildren={hasChildren}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          onToast={onToast}
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
              onRenameSession={onRenameSession}
              onPinSession={onPinSession}
              pinnedIds={pinnedIds}
              depth={depth + 1}
              onToast={onToast}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function getSessionTitle(session: SessionInfo): string {
  return session.name || session.firstMessage.slice(0, 50) || session.id.slice(0, 12)
}

function formatSessionToMarkdown(session: SessionInfo, messages: WebMessage[]): string {
  const title = getSessionTitle(session)
  const lines: string[] = []
  lines.push(`# ${title}`)
  lines.push('')
  lines.push(`> 项目：\`${session.cwd}\``)
  lines.push(`> 时间：${formatDateTime(session.modified)}`)
  if (session.model) {
    lines.push(`> 模型：${session.model.provider}/${session.model.modelId}`)
  }
  lines.push(`> 消息数：${messages.length} 条`)
  lines.push('')
  lines.push('---')
  lines.push('')

  messages.forEach((message, idx) => {
    const speaker = message.role === 'user' ? '用户' : '超级小金'
    lines.push(`## ${idx + 1}. ${speaker}`)
    lines.push('')
    if (message.content) {
      // 用围栏代码块包裹消息原文，避免内容中的 Markdown 特殊字符破坏整体结构，同时保留原文格式。
      lines.push('```')
      lines.push(message.content)
      lines.push('```')
    } else {
      lines.push('（无内容）')
    }
    if (message.role === 'assistant' && message.thinkingContent) {
      lines.push('')
      const duration = message.thinkingDurationMs ? `（${message.thinkingDurationMs.toLocaleString()}ms）` : ''
      lines.push(`**思考过程**${duration}`)
      lines.push('')
      lines.push('```thinking')
      lines.push(message.thinkingContent)
      lines.push('```')
    }
    lines.push('')
  })

  return lines.join('\n')
}

function formatSessionToTxt(session: SessionInfo, messages: WebMessage[]): string {
  const title = getSessionTitle(session)
  const lines: string[] = []
  lines.push(`会话：${title}`)
  lines.push(`项目：${session.cwd}`)
  lines.push(`时间：${formatDateTime(session.modified)}`)
  if (session.model) {
    lines.push(`模型：${session.model.provider}/${session.model.modelId}`)
  }
  lines.push(`消息数：${messages.length} 条`)
  lines.push('')
  lines.push('='.repeat(60))
  lines.push('')

  messages.forEach((message, idx) => {
    const speaker = message.role === 'user' ? '用户' : '超级小金'
    lines.push(`--- ${idx + 1}. ${speaker} ---`)
    lines.push('')
    lines.push(message.content || '（无内容）')
    if (message.role === 'assistant' && message.thinkingContent) {
      lines.push('')
      const duration = message.thinkingDurationMs ? `（${message.thinkingDurationMs.toLocaleString()}ms）` : ''
      lines.push(`--- 思考过程${duration} ---`)
      lines.push('')
      lines.push(message.thinkingContent)
    }
    lines.push('')
  })

  return lines.join('\n')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

function formatSessionToHtml(session: SessionInfo, messages: WebMessage[]): string {
  const title = getSessionTitle(session)
  const meta: string[] = [
    `项目：${escapeHtml(session.cwd)}`,
    `时间：${formatDateTime(session.modified)}`,
  ]
  if (session.model) {
    meta.push(`模型：${escapeHtml(`${session.model.provider}/${session.model.modelId}`)}`)
  }
  meta.push(`消息数：${messages.length} 条`)

  const messageHtml = messages.map((message, idx) => {
    const isUser = message.role === 'user'
    const speaker = isUser ? '用户' : '超级小金'
    const content = escapeHtml(message.content || '（无内容）')
    const thinking = !isUser && message.thinkingContent
      ? `
        <div class="thinking">
          <div class="thinking-header">思考过程${message.thinkingDurationMs ? `（${message.thinkingDurationMs.toLocaleString()}ms）` : ''}</div>
          <div class="thinking-body"><pre>${escapeHtml(message.thinkingContent)}</pre></div>
        </div>
      `
      : ''
    return `
      <div class="message ${isUser ? 'user' : 'assistant'}">
        <div class="message-header">${idx + 1}. ${speaker}</div>
        <div class="message-body"><pre>${content}</pre></div>
        ${thinking}
      </div>
    `
  }).join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} - 超级小金</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #1a1a1a; line-height: 1.6; }
  .container { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 28px; }
  h1 { margin: 0 0 12px; font-size: 22px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #eee; }
  .message { margin-bottom: 20px; }
  .message-header { font-size: 12px; font-weight: 600; color: #666; margin-bottom: 6px; text-transform: uppercase; }
  .message-body { background: #f8f9fa; border-radius: 8px; padding: 14px; }
  .message.user .message-body { background: #eef4ff; }
  .thinking { margin-top: 10px; border-left: 3px solid #f59e0b; padding-left: 12px; }
  .thinking-header { font-size: 11px; font-weight: 600; color: #b45309; margin-bottom: 4px; }
  .thinking-body { background: #fffbeb; border-radius: 6px; padding: 10px; }
  .thinking-body pre { color: #78350f; }
  .message.assistant .message-body { background: #f6f6f6; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 14px; }
</style>
</head>
<body>
<div class="container">
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${meta.join(' · ')}</div>
  ${messageHtml}
</div>
</body>
</html>`
}

function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'share'
}

function SessionItem({ session, isSelected, onClick, onDelete, onRename, onPin, isPinned, depth = 0, hasChildren = false, collapsed = false, onToggleCollapse, onToast }: {
  session: SessionInfo
  isSelected: boolean
  onClick: () => void
  onDelete: () => void
  onRename?: (name: string) => void
  onPin?: () => void
  isPinned?: boolean
  depth?: number
  hasChildren?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
  onToast?: (message: string, type?: 'success' | 'error') => void
}) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [shareMode, setShareMode] = useState(false)
  const title = getSessionTitle(session)
  const [draftTitle, setDraftTitle] = useState(title)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setConfirming(false)
        setShareMode(false)
      }
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setConfirming(false)
        setShareMode(false)
      }
    }
    const resizeHandler = () => {
      setMenuOpen(false)
      setConfirming(false)
      setShareMode(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', keyHandler)
    window.addEventListener('resize', resizeHandler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', keyHandler)
      window.removeEventListener('resize', resizeHandler)
    }
  }, [menuOpen])

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect) return
    const MENU_WIDTH = 150
    const MENU_HEIGHT = 180
    const GAP = 6
    const PAD = 8
    let left = rect.right + GAP
    let top = rect.top
    if (left + MENU_WIDTH > window.innerWidth - PAD) {
      left = rect.left - MENU_WIDTH - GAP
    }
    if (left < PAD) left = PAD
    if (top + MENU_HEIGHT > window.innerHeight - PAD) {
      top = window.innerHeight - MENU_HEIGHT - PAD
    }
    if (top < PAD) top = PAD
    setMenuPos({ top, left })
    setMenuOpen(true)
  }

  function submitRename() {
    const next = draftTitle.trim()
    setEditing(false)
    if (next && next !== title) onRename?.(next)
  }

  const detailTitle = [
    `项目：${session.cwd}`,
    session.model ? `模型：${session.model.provider}/${session.model.modelId}` : null,
    session.tokens?.total ? `tokens：${session.tokens.total.toLocaleString()}` : null,
    session.cost && session.cost > 0 ? `费用：$${session.cost.toFixed(4)}` : null,
    `时间：${session.modified}`,
    `消息：${session.messageCount} 条`,
  ].filter(Boolean).join('\n')

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!menuOpen) setConfirming(false) }}
      style={{
        minHeight: 48,
        display: 'flex',
        alignItems: 'center',
        paddingTop: 6,
        paddingBottom: 6,
        paddingLeft: depth > 0 ? depth * 12 + 14 : 14,
        paddingRight: 8,
        cursor: 'pointer',
        background: isSelected ? 'var(--bg-selected)' : hovered ? 'var(--bg-hover)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.1s',
        gap: 6,
        overflow: 'hidden',
      }}
      title={detailTitle}
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
            fontSize: 'var(--sidebar-title-size, 12px)',
            fontWeight: isSelected ? 500 : 400,
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          title={title}
        >
          {isPinned && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--accent)" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-2.4a1 1 0 0 0-.3-.7l-2.1-1.9V7.5a1 1 0 0 1 .3-.7l1.5-1.4a1 1 0 0 0 .3-.7V3H5v1.7a1 1 0 0 0 .3.7l1.5 1.4a1 1 0 0 1 .3.7V12l-2.1 1.9a1 1 0 0 0-.3.7Z" />
            </svg>
          )}
          {editing ? (
            <input
              value={draftTitle}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename()
                if (e.key === 'Escape') { setDraftTitle(title); setEditing(false) }
              }}
              style={{
                flex: 1, minWidth: 0, boxSizing: 'border-box',
                fontSize: 'var(--font-sm)', lineHeight: 1.4,
                border: '1px solid var(--accent)', borderRadius: 'var(--radius-xs)',
                padding: '2px 5px', background: 'var(--bg-panel)', color: 'var(--text)',
                outline: 'none',
              }}
            />
          ) : (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title}
            </span>
          )}
          {!editing && session.orphaned && (
            <span style={{
              padding: '1px 5px',
              background: 'var(--danger-bg)',
              borderRadius: 'var(--radius-xs)', fontSize: 'var(--font-xs)',
              color: 'var(--danger)', fontWeight: 500,
              flexShrink: 0,
            }}>
              incomplete
            </span>
          )}
        </div>
        <div style={{ marginTop: 2, display: 'flex', gap: 8, color: 'var(--text-dim)', fontSize: 'var(--sidebar-meta-size, 11px)', overflow: 'hidden' }}>
          <span title={session.modified} style={{ flexShrink: 0 }}>{formatRelativeTime(session.modified)}</span>
          <span style={{ flexShrink: 0 }}>{session.messageCount} 条消息</span>
          {session.model && (
            <span title={`${session.model.provider}/${session.model.modelId}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {session.model.modelId}
            </span>
          )}
        </div>
        <div style={{
          marginTop: 1, fontSize: 'var(--sidebar-path-size, 10px)', color: 'var(--text-dim)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {shortenCwd(session.cwd)}
        </div>
      </div>

      {/* Three-dot menu */}
      <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }}>
        {(hovered || menuOpen) && !editing && (
          <button
            ref={triggerRef}
            onClick={(e) => {
              e.stopPropagation()
              if (menuOpen) {
                setMenuOpen(false)
                setConfirming(false)
                setShareMode(false)
              } else {
                openMenu()
              }
            }}
            title="更多选项"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, padding: 0,
              background: menuOpen ? 'var(--bg-selected)' : 'none',
              border: 'none', borderRadius: 'var(--radius-xs)',
              color: menuOpen ? 'var(--text)' : 'var(--text-dim)',
              cursor: 'pointer',
              transition: 'background 0.1s',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
        )}
        {menuOpen && menuPos && (
          <div
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              zIndex: 1000,
              minWidth: 140,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
              padding: 4,
            }}
          >
            {!shareMode ? (
              <>
                <MenuButton onClick={(e) => { e.stopPropagation(); onPin?.(); setMenuOpen(false) }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="17" x2="12" y2="22" />
                    <path d="M5 17h14v-2.4a1 1 0 0 0-.3-.7l-2.1-1.9V7.5a1 1 0 0 1 .3-.7l1.5-1.4a1 1 0 0 0 .3-.7V3H5v1.7a1 1 0 0 0 .3.7l1.5 1.4a1 1 0 0 1 .3.7V12l-2.1 1.9a1 1 0 0 0-.3.7Z" />
                  </svg>
                  {isPinned ? '取消顶置' : '顶置'}
                </MenuButton>
                <MenuButton onClick={(e) => { e.stopPropagation(); setShareMode(true) }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  分享
                </MenuButton>
                <MenuButton onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setDraftTitle(title); setEditing(true) }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                  重命名
                </MenuButton>
                <div style={{ height: 1, background: 'var(--border)', margin: '2px 6px' }} />
                {!confirming ? (
                  <MenuButton onClick={(e) => { e.stopPropagation(); setConfirming(true) }} style={{ color: 'var(--danger)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    删除
                  </MenuButton>
                ) : (
                  <div style={{ display: 'flex', gap: 4, padding: '2px 6px' }}>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); setConfirming(false) }} style={{ flex: 1, padding: '3px 0', fontSize: 'var(--font-xs)', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}>
                      确认
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setConfirming(false) }} style={{ flex: 1, padding: '3px 0', fontSize: 'var(--font-xs)', background: 'var(--bg-hover)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', cursor: 'pointer' }}>
                      取消
                    </button>
                  </div>
                )}
              </>
            ) : (
              <SharePanel
                session={session}
                onToast={onToast}
                onClose={() => { setMenuOpen(false); setShareMode(false) }}
              />
            )}
          </div>
        )}
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

const MAX_SHARE_BYTES = 2 * 1024 * 1024

type ShareFormat = 'markdown' | 'html' | 'txt'

function SharePanel({ session, onToast, onClose }: { session: SessionInfo; onToast?: (message: string, type?: 'success' | 'error') => void; onClose: () => void }) {
  const [loading, setLoading] = useState(false)

  async function loadMessages(): Promise<WebMessage[] | null> {
    try {
      return await getMessages(session.id, session.cwd)
    } catch (err) {
      console.warn('[SharePanel] getMessages failed', err)
      onToast?.('加载对话失败：' + (err instanceof Error ? err.message : String(err)), 'error')
      return null
    }
  }

  async function withLoadedMessages<T>(action: (messages: WebMessage[]) => Promise<T> | T): Promise<void> {
    setLoading(true)
    try {
      const messages = await loadMessages()
      if (!messages) return
      await action(messages)
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    await withLoadedMessages(async (messages) => {
      const markdown = formatSessionToMarkdown(session, messages)
      if (markdown.length > MAX_SHARE_BYTES) {
        const mb = (markdown.length / (1024 * 1024)).toFixed(1)
        onToast?.(`对话内容太长（${mb} MB），无法复制到剪贴板，请先导出为文件`, 'error')
        return
      }

      if (!navigator.clipboard) {
        onToast?.('当前环境不支持剪贴板操作，请使用导出为文件功能', 'error')
        return
      }

      try {
        await navigator.clipboard.writeText(markdown)
        onToast?.(`已复制完整对话（${messages.length} 条消息）`, 'success')
        onClose()
      } catch (err) {
        console.warn('[SharePanel] clipboard write failed', err)
        onToast?.('复制到剪贴板失败：' + (err instanceof Error ? err.message : String(err)), 'error')
      }
    })
  }

  async function handleExport(format: ShareFormat) {
    if (typeof window === 'undefined' || !window.piDesktop?.file?.saveText) {
      onToast?.('当前环境不支持导出文件', 'error')
      return
    }
    const bridge = window.piDesktop

    await withLoadedMessages(async (messages) => {
      const title = safeFileName(getSessionTitle(session))
      const config = (() => {
        switch (format) {
          case 'markdown':
            return {
              content: formatSessionToMarkdown(session, messages),
              defaultFileName: `${title}.md`,
              filters: [{ name: 'Markdown', extensions: ['md'] }, { name: 'Text', extensions: ['txt'] }],
            }
          case 'html':
            return {
              content: formatSessionToHtml(session, messages),
              defaultFileName: `${title}.html`,
              filters: [{ name: 'HTML', extensions: ['html'] }],
            }
          case 'txt':
          default:
            return {
              content: formatSessionToTxt(session, messages),
              defaultFileName: `${title}.txt`,
              filters: [{ name: 'Text', extensions: ['txt'] }],
            }
        }
      })()

      if (config.content.length > MAX_SHARE_BYTES) {
        const mb = (config.content.length / (1024 * 1024)).toFixed(1)
        onToast?.(`对话内容太长（${mb} MB），无法导出`, 'error')
        return
      }

      try {
        const result = await bridge.file.saveText(config)
        if (result.canceled) return
        if (result.ok && result.savedTo) {
          onToast?.(`已保存到 ${result.savedTo}`, 'success')
          onClose()
        } else {
          onToast?.('保存失败：' + (result.error || '未知错误'), 'error')
        }
      } catch (err) {
        console.warn('[SharePanel] saveText failed', err)
        onToast?.('保存失败：' + (err instanceof Error ? err.message : String(err)), 'error')
      }
    })
  }

  return (
    <div style={{ minWidth: 170 }}>
      <div style={{ padding: '4px 8px 8px', fontSize: 'var(--font-xs)', color: 'var(--text-dim)', fontWeight: 600 }}>
        导出方式
      </div>
      <MenuButton onClick={(e) => { e.stopPropagation(); void handleCopy() }} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        {loading ? '加载中...' : '复制到剪贴板'}
      </MenuButton>
      <MenuButton onClick={(e) => { e.stopPropagation(); void handleExport('markdown') }} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
        Markdown 文件
      </MenuButton>
      <MenuButton onClick={(e) => { e.stopPropagation(); void handleExport('html') }} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="10" y1="9" x2="8" y2="9" />
          <line x1="16" y1="13" x2="8" y2="13" />
        </svg>
        HTML 文件
      </MenuButton>
      <MenuButton onClick={(e) => { e.stopPropagation(); void handleExport('txt') }} disabled={loading}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
        </svg>
        TXT 文件
      </MenuButton>
      <div style={{ height: 1, background: 'var(--border)', margin: '2px 6px' }} />
      <MenuButton onClick={(e) => { e.stopPropagation(); onClose() }} style={{ color: 'var(--text-dim)' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        返回
      </MenuButton>
    </div>
  )
}

function MenuButton({ onClick, style, disabled, children }: { onClick: (e: React.MouseEvent) => void; style?: React.CSSProperties; disabled?: boolean; children: React.ReactNode }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...menuItemStyle,
        ...style,
        background: hovered && !disabled ? 'var(--bg-hover)' : 'none',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 7,
  width: '100%', padding: '6px 8px',
  background: 'none', border: 'none', borderRadius: 'var(--radius-xs)',
  color: 'var(--text)', cursor: 'pointer',
  fontSize: 'var(--font-sm)', textAlign: 'left' as const,
  fontFamily: 'inherit', fontWeight: 400,
  transition: 'background 0.08s',
}
