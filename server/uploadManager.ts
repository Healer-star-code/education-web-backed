import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { ApiImagePayload } from './types.ts'

const SAFE_NAME = /[^\p{L}\p{N}._ -]/gu

function safeFileName(name: string): string {
  const cleaned = basename(name).replace(SAFE_NAME, '_').trim()
  return cleaned || `upload-${Date.now()}`
}

export interface SavedUpload {
  name: string
  path: string
  mimeType: string
}

export async function saveUploads(root: string, sessionId: string, uploads: ApiImagePayload[] | undefined): Promise<SavedUpload[]> {
  if (!uploads?.length) return []
  const dir = resolve(root, '.educational-agent', 'uploads', sessionId)
  await mkdir(dir, { recursive: true })
  const saved: SavedUpload[] = []
  for (const upload of uploads) {
    if (!upload.data) continue
    const fileName = `${Date.now()}-${safeFileName(upload.name)}`
    const filePath = join(dir, fileName)
    await writeFile(filePath, Buffer.from(upload.data, 'base64'))
    saved.push({ name: upload.name, path: filePath, mimeType: upload.mimeType })
  }
  return saved
}

export function buildUploadContext(uploads: SavedUpload[]): string {
  if (uploads.length === 0) return ''
  return `\n\n用户上传了以下文件，必须优先读取这些文件本身，不要猜测目录里的其他文件内容：\n${uploads.map((item) => `- ${item.name} (${item.mimeType}): ${item.path}`).join('\n')}\n如果用户要求总结/分析上传文件，请使用合适工具读取这些路径。`
}
