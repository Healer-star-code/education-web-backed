import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import type { ApiImagePayload } from './types.ts'
import { extractTextFromFile } from './documentExtractor.ts'

const SAFE_NAME = /[^\p{L}\p{N}._ -]/gu

function safeFileName(name: string): string {
  const cleaned = basename(name).replace(SAFE_NAME, '_').trim()
  return cleaned || `upload-${Date.now()}`
}

export interface SavedUpload {
  name: string
  path: string
  mimeType: string
  extractedText?: string
  extractionError?: string
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
    try {
      const extractedText = await extractTextFromFile(filePath, upload.mimeType)
      saved.push({ name: upload.name, path: filePath, mimeType: upload.mimeType, extractedText })
    } catch (err) {
      saved.push({ name: upload.name, path: filePath, mimeType: upload.mimeType, extractionError: err instanceof Error ? err.message : String(err) })
    }
  }
  return saved
}

export function buildUploadContext(uploads: SavedUpload[]): string {
  if (uploads.length === 0) return ''
  const fileList = uploads.map((item) => `- ${item.name} (${item.mimeType}): ${item.path}`).join('\n')
  const extracted = uploads
    .map((item) => {
      if (item.extractedText?.trim()) {
        return `## ${item.name}\n路径：${item.path}\n\n${item.extractedText}`
      }
      if (item.extractionError) {
        return `## ${item.name}\n路径：${item.path}\n\n【自动提取失败：${item.extractionError}】`
      }
      return `## ${item.name}\n路径：${item.path}\n\n【未能自动提取文本，请使用工具读取该文件本身。】`
    })
    .join('\n\n---\n\n')
  return `\n\n用户上传了以下文件，必须优先基于这些上传文件本身回答，不要猜测目录里的其他文件内容：\n${fileList}\n\n以下是系统已从上传文件自动提取出的正文内容。用户要求总结/分析上传文件时，必须直接依据这些正文内容回答；如果正文为空或提取失败，再使用工具读取上述路径。\n\n${extracted}`
}
