import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { basename, extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ArtifactInfo } from './types.ts'
import { isPathAllowed } from './permissionManager.ts'

const OFFICE_EXTS = new Set(['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.csv', '.pdf'])
const artifactsBySession = new Map<string, ArtifactInfo[]>()

function kindFromExt(ext: string): ArtifactInfo['kind'] {
  switch (ext.toLowerCase()) {
    case '.doc': case '.docx': return 'word'
    case '.ppt': case '.pptx': return 'presentation'
    case '.xls': case '.xlsx': case '.csv': return 'spreadsheet'
    case '.pdf': return 'pdf'
    default: return 'file'
  }
}

function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case '.pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case '.pdf': return 'application/pdf'
    case '.csv': return 'text/csv'
    default: return 'application/octet-stream'
  }
}

async function walk(dir: string, startedAt: number, out: ArtifactInfo[], sessionId: string, root: string): Promise<void> {
  let entries: Array<{ name: string; isDirectory: () => boolean }>
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: 'utf8' }) as Array<{ name: string; isDirectory: () => boolean }>
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.pi' || entry.name === '.educational-agent') continue
    const full = join(dir, entry.name)
    if (!isPathAllowed(sessionId, root, full)) continue
    if (entry.isDirectory()) {
      await walk(full, startedAt, out, sessionId, root)
      continue
    }
    const ext = extname(entry.name).toLowerCase()
    if (!OFFICE_EXTS.has(ext)) continue
    try {
      const info = await stat(full)
      if (info.mtimeMs < startedAt - 1000) continue
      out.push({
        id: randomUUID(),
        sessionId,
        name: basename(full),
        path: resolve(full),
        mimeType: mimeFromExt(ext),
        size: info.size,
        kind: kindFromExt(ext),
        timeCreated: Date.now(),
      })
    } catch {
      // ignore unreadable file
    }
  }
}

export async function scanArtifacts(sessionId: string, root: string, startedAt: number): Promise<ArtifactInfo[]> {
  const found: ArtifactInfo[] = []
  await walk(root, startedAt, found, sessionId, root)
  if (found.length === 0) return []
  const existing = artifactsBySession.get(sessionId) ?? []
  const existingPaths = new Set(existing.map((item) => item.path.toLowerCase()))
  const next = found.filter((item) => !existingPaths.has(item.path.toLowerCase()))
  if (next.length > 0) artifactsBySession.set(sessionId, [...existing, ...next])
  return next
}

export function listArtifacts(sessionId: string): ArtifactInfo[] {
  return artifactsBySession.get(sessionId) ?? []
}

export function getArtifact(sessionId: string, artifactId: string): ArtifactInfo | undefined {
  return listArtifacts(sessionId).find((item) => item.id === artifactId)
}

export function artifactStream(artifact: ArtifactInfo) {
  return createReadStream(artifact.path)
}

export function removeSessionArtifacts(sessionId: string): void {
  artifactsBySession.delete(sessionId)
}
