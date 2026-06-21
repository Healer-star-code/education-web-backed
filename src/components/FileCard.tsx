import { getFileIcon } from './FileIcons'
import type { ArtifactInfo, MessageAttachment } from '../mockData'
import { artifactDownloadUrl, type ArtifactInfo as ApiArtifactInfo } from '../lib/piApi'

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

export function AttachmentCard({ attachment, compact = false }: { attachment: MessageAttachment; compact?: boolean }) {
  if (attachment.type === 'image') {
    return (
      <a href={attachment.url} target="_blank" rel="noreferrer" style={{ display: 'block', width: compact ? 54 : 160, height: compact ? 54 : 160, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(59,130,246,0.2)', background: 'rgba(0,0,0,0.04)' }}>
        <img src={attachment.url} alt={attachment.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </a>
    )
  }
  return (
    <a href={attachment.url} download={attachment.name} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: compact ? 130 : 220, maxWidth: compact ? 180 : 320, padding: compact ? '6px 8px' : '9px 10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', textDecoration: 'none' }}>
      <span style={{ flexShrink: 0 }}>{getFileIcon(attachment.name, compact ? 22 : 28)}</span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: compact ? 'var(--font-xs)' : 'calc(var(--font-base) * 0.929)', fontWeight: 650 }}>{attachment.name}</span>
        <span style={{ display: 'block', fontSize: 'var(--font-xs)', color: 'var(--text-dim)', marginTop: 1 }}>{extLabel(attachment.name)} {attachment.size ? `· ${formatBytes(attachment.size)}` : ''}</span>
      </span>
    </a>
  )
}

export function ArtifactCard({ artifact }: { artifact: ArtifactInfo }) {
  const url = artifactDownloadUrl(artifact as ApiArtifactInfo)
  async function saveAs() {
    if ('showSaveFilePicker' in window) {
      const picker = (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker
      const handle = await picker({ suggestedName: artifact.name })
      const writable = await handle.createWritable()
      const res = await fetch(url)
      await writable.write(await res.blob())
      await writable.close()
      return
    }
    const a = document.createElement('a')
    a.href = url
    a.download = artifact.name
    a.click()
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-panel)', maxWidth: 520 }}>
      <span style={{ flexShrink: 0 }}>{getFileIcon(artifact.name, 34)}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 'calc(var(--font-base) * 0.929)', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{artifact.name}</div>
        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-dim)', marginTop: 2 }}>{extLabel(artifact.name)} · {formatBytes(artifact.size)}</div>
      </div>
      <a href={url} download={artifact.name} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text)', textDecoration: 'none', fontSize: 'var(--font-sm)' }}>下载</a>
      <button onClick={saveAs} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 'var(--font-sm)', cursor: 'pointer' }}>另存为</button>
    </div>
  )
}
