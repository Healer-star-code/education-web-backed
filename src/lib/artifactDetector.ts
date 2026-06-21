// 启发式：从 assistant 消息文本里提取「小金刚写出来的本地文件路径」，
// 通过 IPC 验证存在后，包装成 ArtifactInfo 注入消息底部 → 卡片自动出现。
//
// 设计原则：
// - 宁可漏不可错。only Windows 绝对路径（盘符开头）+ 白名单扩展名。
// - 同一条消息多次出现同一路径只算一次。
// - 路径中允许中文、空格（路径用引号 / 反引号包裹时）。
// - 兜底使用：如果 super-king 后端已经通过 SSE 发了 backend artifact，前端就跳过同路径的 local-scan。

import type { ArtifactInfo } from './piApi'

// 我们关心的「成果文件」扩展名
const ARTIFACT_EXTS = [
  // Office
  'docx', 'doc',
  'xlsx', 'xls', 'csv',
  'pptx', 'ppt',
  'pdf',
  // 文本
  'md', 'mdx', 'txt', 'log', 'rtf',
  // 图片
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif', 'avif',
  // 音视频
  'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac',
  'mp4', 'mov', 'avi', 'mkv', 'webm',
  // 压缩
  'zip', 'rar', '7z', 'tar', 'gz',
  // 数据
  'json', 'jsonl', 'yaml', 'yml', 'toml', 'xml', 'html', 'htm',
] as const

const EXT_GROUP = ARTIFACT_EXTS.join('|')

// 三种匹配模式（均同时认 Windows 反斜杠 `\` 与 Node/AI 常用正斜杠 `/`）：
// 1) 引号 / 反引号 / 方括号包裹 —— 允许任意字符（含空格中文）
const REGEX_QUOTED = new RegExp(
  `["\`'\\[]?\\s*([A-Za-z]:[\\\\/][^"'\\\`\\[\\]<>|?*\\n\\r]+?\\.(?:${EXT_GROUP}))\\s*["\`'\\]]?`,
  'gi',
)
// 2) 裸路径 —— 不带引号，不允许空格（避免吃到后面的标点）
const REGEX_BARE = new RegExp(
  `(?<![A-Za-z0-9_/\\\\])([A-Za-z]:[\\\\/][^\\s"'\`<>|?*\\n\\r]+?\\.(?:${EXT_GROUP}))(?![A-Za-z0-9])`,
  'gi',
)
// 3) Markdown 链接 [name](path)
const REGEX_MD_LINK = new RegExp(
  `\\[[^\\]]+\\]\\(([A-Za-z]:[\\\\/][^)]+?\\.(?:${EXT_GROUP}))\\)`,
  'gi',
)

function pickKind(name: string): ArtifactInfo['kind'] {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['docx', 'doc'].includes(ext)) return 'word'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'spreadsheet'
  if (['pptx', 'ppt'].includes(ext)) return 'presentation'
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif', 'avif'].includes(ext)) return 'image'
  if (['md', 'mdx', 'txt', 'log', 'rtf', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'xml', 'html', 'htm'].includes(ext)) return 'text'
  return 'file'
}

function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    tiff: 'image/tiff',
    tif: 'image/tiff',
    avif: 'image/avif',
    txt: 'text/plain',
    md: 'text/markdown',
    mdx: 'text/markdown',
    csv: 'text/csv',
    log: 'text/plain',
    rtf: 'application/rtf',
    json: 'application/json',
    jsonl: 'application/json',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    toml: 'application/toml',
    xml: 'application/xml',
    html: 'text/html',
    htm: 'text/html',
    zip: 'application/zip',
    rar: 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    tar: 'application/x-tar',
    gz: 'application/gzip',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    flac: 'audio/flac',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    avi: 'video/x-msvideo',
    mkv: 'video/x-matroska',
    webm: 'video/webm',
  }
  return map[ext] ?? 'application/octet-stream'
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] || p
}

/** 从一段 assistant 文本里抽出所有"看起来像被生成的文件路径"。
 *  返回值按路径在 text 中**首次出现的位置升序**排列，保证文件卡片顺序
 *  与 AI 在消息里写出路径的顺序一致（用户期望"文档要按顺序来"）。 */
export function extractCandidatePaths(text: string): string[] {
  if (!text) return []
  // 用 Map 保存"路径 -> 首次出现的 index"，保证去重 + 保序
  const firstSeen = new Map<string, number>()
  for (const re of [REGEX_MD_LINK, REGEX_QUOTED, REGEX_BARE]) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const path = m[1]?.trim()
      if (!path) continue
      // 取 capture group 在 text 中的起始位置（近似：用 m.index 即可，
      // 即使 m.index 指向匹配头部而非 capture 头部，仍能保证相对顺序）
      const pos = m.index
      const prev = firstSeen.get(path)
      if (prev === undefined || pos < prev) firstSeen.set(path, pos)
    }
  }
  const out = [...firstSeen.entries()].sort((a, b) => a[1] - b[1]).map(([p]) => p)
  if (out.length > 0) {
    console.info(`[artifactDetector] extractCandidatePaths: text.length=${text.length}, found ${out.length} path(s)`)
  }
  return out
}

/**
 * 给定一段消息文本 + sessionId + 已经存在的 backend artifacts，
 * 返回需要追加的 local-scan artifacts（已经通过 file:stat 验证存在）。
 *
 * 调用方需要传入 file:stat 接口（保持与 Electron bridge 解耦）。
 */
export async function detectLocalArtifacts(
  text: string,
  sessionId: string,
  existing: ArtifactInfo[],
  stat: (target: string) => Promise<{ exists: boolean; size?: number; mtime?: number; isFile?: boolean }>,
): Promise<ArtifactInfo[]> {
  const candidates = extractCandidatePaths(text)
  console.info(`[artifactDetector] extractCandidatePaths got ${candidates.length} candidate(s):`, candidates)
  if (candidates.length === 0) return []

  // 已经被后端 artifact 占用的路径就跳过（避免重复卡片）
  const existingPaths = new Set<string>()
  for (const a of existing) {
    if (a.localPath) existingPaths.add(a.localPath.toLowerCase())
    if (a.path) existingPaths.add(a.path.toLowerCase())
  }

  const results: ArtifactInfo[] = []
  for (const path of candidates) {
    if (existingPaths.has(path.toLowerCase())) {
      console.info(`[artifactDetector] skip (duplicate of existing artifact): ${path}`)
      continue
    }
    try {
      const info = await stat(path)
      console.info(`[artifactDetector] stat(${path}) =>`, info)
      if (!info.exists || info.isFile === false) continue
      const name = basename(path)
      results.push({
        id: 'local-' + Math.abs(hashCode(path)).toString(36) + '-' + (info.mtime ?? Date.now()),
        sessionId,
        name,
        path,
        localPath: path,
        mimeType: mimeFor(name),
        size: info.size ?? 0,
        kind: pickKind(name),
        timeCreated: info.mtime ?? Date.now(),
        exists: true,
        source: 'local-scan',
      })
    } catch (err) {
      console.warn(`[artifactDetector] stat(${path}) failed:`, err)
    }
  }
  return results
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i)
    h |= 0
  }
  return h
}
