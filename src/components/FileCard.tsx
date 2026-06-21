import { useEffect, useState } from 'react'
import { getFileIcon } from './FileIcons'
import { AlertTriangleIcon, DownloadIcon, PlayIcon } from './Icon'
import type { ArtifactInfo, MessageAttachment } from '../mockData'
import { artifactDownloadUrl, type ArtifactInfo as ApiArtifactInfo } from '../lib/piApi'
import { getDesktopBridge, isDesktop } from '../lib/desktopBridge'

function formatBytes(size?: number): string {
  if (!size && size !== 0) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function extLabel(name: string): string {
  const ext = name.split('.').pop()?.toUpperCase()
  return ext || 'FILE'
}

function kindLabel(kind: ArtifactInfo['kind'], name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  switch (kind) {
    case 'word': return 'Word 文档'
    case 'spreadsheet': return ext === 'csv' ? 'CSV 表格' : 'Excel 表格'
    case 'presentation': return 'PPT 演示文稿'
    case 'pdf': return 'PDF 文档'
    case 'image': {
      if (ext === 'svg') return 'SVG 矢量图'
      if (ext === 'gif') return 'GIF 动图'
      return `${ext.toUpperCase()} 图片`
    }
    case 'text': {
      if (ext === 'md' || ext === 'mdx') return 'Markdown 文档'
      if (ext === 'json' || ext === 'jsonl') return 'JSON 文件'
      if (ext === 'html' || ext === 'htm') return 'HTML 文件'
      if (ext === 'csv') return 'CSV 表格'
      if (ext === 'txt' || ext === 'log') return '文本文件'
      return `${ext.toUpperCase()} 文件`
    }
    default: {
      if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return `${ext.toUpperCase()} 压缩包`
      if (['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'].includes(ext)) return `${ext.toUpperCase()} 音频`
      if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return `${ext.toUpperCase()} 视频`
      return extLabel(name)
    }
  }
}

export function AttachmentCard({ attachment, compact = false }: { attachment: MessageAttachment; compact?: boolean }) {
  if (attachment.type === 'image') {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer" style={{ display: 'block', width: compact ? 54 : 160, height: compact ? 54 : 160, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid rgba(59,130,246,0.2)', background: 'rgba(0,0,0,0.04)' }}>
        <img src={attachment.url} alt={attachment.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </a>
    )
  }
  return (
    <a href={attachment.url} download={attachment.name} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: compact ? 130 : 220, maxWidth: compact ? 180 : 320, padding: compact ? '6px 8px' : '9px 10px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', textDecoration: 'none' }}>
      <span style={{ flexShrink: 0 }}>{getFileIcon(attachment.name, compact ? 22 : 28)}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: compact ? 'var(--font-xs)' : 'calc(var(--font-base) * 0.929)', fontWeight: 650 }}>{attachment.name}</span>
        <span style={{ display: 'block', fontSize: 'var(--font-xs)', color: 'var(--text-dim)', marginTop: 1 }}>{extLabel(attachment.name)} {attachment.size ? `· ${formatBytes(attachment.size)}` : ''}</span>
      </span>
    </a>
  )
}

export function ArtifactCard({ artifact, hideActions = false }: { artifact: ArtifactInfo; hideActions?: boolean }) {
  // 区分两种 artifact：
  // - localPath 存在 = 启发式扫描出来的本地文件，走 Electron IPC（保存/打开/定位）
  // - 否则 = backend artifact，走 HTTP 下载（保留旧行为）
  const hasLocalPath = !!artifact.localPath
  const bridge = getDesktopBridge()

  // 探测文件是否还在（仅本地路径需要）
  const [exists, setExists] = useState<boolean>(artifact.exists ?? true)
  const [busy, setBusy] = useState<null | 'save' | 'open' | 'reveal'>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!hasLocalPath || !isDesktop || !bridge?.file?.stat) return
    let cancelled = false
    bridge.file.stat(artifact.localPath!).then((s) => {
      if (!cancelled) setExists(!!s.exists)
    }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [hasLocalPath, artifact.localPath, bridge])

  function flashToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  async function handleSaveAs() {
    if (busy) return
    setBusy('save')
    try {
      if (hasLocalPath && bridge?.file?.saveAs) {
        const res = await bridge.file.saveAs(artifact.localPath!)
        if (res.ok) flashToast(`已保存到 ${res.savedTo}`)
        else if (!res.canceled && res.error) flashToast(`保存失败：${res.error}`)
      } else {
        // backend artifact：通过 HTTP 下载 + showSaveFilePicker
        const url = artifactDownloadUrl(artifact as ApiArtifactInfo)
        if ('showSaveFilePicker' in window) {
          const picker = (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker
          const handle = await picker({ suggestedName: artifact.name })
          const writable = await handle.createWritable()
          const res = await fetch(url)
          await writable.write(await res.blob())
          await writable.close()
          flashToast('已保存')
        } else {
          const a = document.createElement('a')
          a.href = url
          a.download = artifact.name
          a.click()
        }
      }
    } finally {
      setBusy(null)
    }
  }

  async function handleOpen() {
    if (busy || !hasLocalPath || !bridge?.file?.openLocal) return
    setBusy('open')
    try {
      const r = await bridge.file.openLocal(artifact.localPath!)
      if (!r.ok) flashToast(`打开失败：${r.error ?? '未知错误'}`)
    } finally {
      setBusy(null)
    }
  }

  const disabled = hasLocalPath && !exists
  const opacity = disabled ? 0.55 : 1

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-panel)',
        maxWidth: 560,
        opacity,
        position: 'relative',
      }}
    >
      <span style={{ flexShrink: 0 }}>{getFileIcon(artifact.name, 38)}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 'calc(var(--font-base) * 0.95)',
            fontWeight: 700,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={artifact.localPath ?? artifact.path ?? artifact.name}
        >
          {artifact.name}
        </div>
        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', marginTop: 3 }}>
          {disabled ? (
            <span style={{ color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangleIcon width={12} height={12} /> 文件已不存在</span>
          ) : (
            <>
              {kindLabel(artifact.kind, artifact.name)}
              {artifact.size > 0 && ` · ${formatBytes(artifact.size)}`}
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        {!hideActions && (
          <>
            <button
              onClick={handleSaveAs}
              disabled={disabled || !!busy}
              title="保存到电脑"
              style={primaryBtn(disabled || !!busy)}
            >
              <DownloadIcon width={13} height={13} /> 保存到电脑
            </button>
            {hasLocalPath && (
              <button
                onClick={handleOpen}
                disabled={disabled || !!busy}
                title="用系统默认程序打开"
                style={ghostBtn(disabled || !!busy)}
              >
                <PlayIcon width={12} height={12} /> 打开
              </button>
            )}
          </>
        )}
      </div>

      {toast && (
        <div
          style={{
            position: 'absolute',
            top: -32,
            right: 8,
            padding: '6px 10px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--text)',
            color: 'var(--bg)',
            fontSize: 12,
            whiteSpace: 'nowrap',
            zIndex: 10,
            maxWidth: 380,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 12px',
    borderRadius: 'var(--radius-md)',
    border: 'none',
    background: disabled ? 'var(--border)' : 'var(--accent)',
    color: disabled ? 'var(--text-dim)' : '#fff',
    fontSize: 'var(--font-sm)',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }
}

function ghostBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '7px 10px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text)',
    fontSize: 'var(--font-sm)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }
}
