import { useState, useCallback } from 'react'
import type { FileNode } from '../mockData'
import { getFileIcon, FolderIcon } from './FileIcons'

interface Props {
  tree: FileNode[]
  onOpenFile?: (filePath: string, fileName: string) => void
}

function TreeNode({ node, depth, onOpenFile, expandedPaths, onToggle }: {
  node: FileNode
  depth: number
  onOpenFile?: (filePath: string, fileName: string) => void
  expandedPaths: Set<string>
  onToggle: (path: string) => void
}) {
  const open = expandedPaths.has(node.path)
  const [hovered, setHovered] = useState(false)

  const handleClick = useCallback(() => {
    if (node.type === 'directory') {
      onToggle(node.path)
    } else {
      onOpenFile?.(node.path, node.name)
    }
  }, [node, onToggle, onOpenFile])

  return (
    <div>
      <div
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          paddingLeft: 8 + depth * 14,
          paddingRight: 8,
          height: 24,
          cursor: 'pointer',
          background: hovered ? 'var(--bg-hover)' : 'transparent',
          borderRadius: 'var(--radius-xs)',
          userSelect: 'none',
        }}
      >
        {node.type === 'directory' && (
          <svg
            width="10" height="10" viewBox="0 0 10 10" fill="none"
            stroke="var(--text-dim)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.1s' }}
          >
            <polyline points="3 2 7 5 3 8" />
          </svg>
        )}
        {node.type === 'file' && <span style={{ width: 10, flexShrink: 0 }} />}
        <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {node.type === 'directory' ? <FolderIcon size={14} open={open} /> : getFileIcon(node.name, 14)}
        </span>
        <span
          style={{
            fontSize: 'var(--font-sm)',
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
          title={node.path}
        >
          {node.name}
        </span>
      </div>
      {node.type === 'directory' && open && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onOpenFile={onOpenFile}
              expandedPaths={expandedPaths}
              onToggle={onToggle}
            />
          ))}
          {node.children.length === 0 && (
              <div style={{ paddingLeft: 8 + (depth + 1) * 14, fontSize: 'var(--font-xs)', color: 'var(--text-dim)', height: 22, display: 'flex', alignItems: 'center' }}>
              empty
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function FileExplorer({ tree, onOpenFile }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())

  const handleToggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }, [])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <button
          onClick={() => setExpanded((v) => !v)}
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
            fontSize: 'var(--font-xs)',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            textAlign: 'left',
          }}
        >
          <svg
            width="9" height="9" viewBox="0 0 10 10" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
          >
            <polyline points="3 2 7 5 3 8" />
          </svg>
          Explorer
        </button>
      </div>
      {expanded && (
        <div style={{ padding: '2px 4px', overflow: 'auto' }}>
          {tree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              onOpenFile={onOpenFile}
              expandedPaths={expandedPaths}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}
