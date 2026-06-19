import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { URL } from 'node:url'
import { readdir, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve } from 'node:path'
import './loadEnv.ts'

const PORT = Number(process.env.LOCAL_HELPER_PORT ?? 30143)
const DEFAULT_SKILLS_ROOT = process.env.LOCAL_SKILLS_ROOT ?? 'E:\\super-king\\skills'

export interface LocalSkillInfo {
  name: string
  description: string
  source: string
  enabled: boolean
  path: string
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': 'http://localhost:5173',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  res.end(body === null ? undefined : JSON.stringify(body))
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return (raw ? JSON.parse(raw) : {}) as T
}

function parseSkill(name: string, content: string, path: string): LocalSkillInfo {
  const lines = content.split(/\r?\n/)
  let description = ''
  let enabled = true

  // YAML frontmatter
  if (lines[0]?.trim() === '---') {
    const endIdx = lines.slice(1).findIndex((l) => l.trim() === '---')
    if (endIdx >= 0) {
      const frontmatter = lines.slice(1, endIdx + 1).join('\n')
      const descMatch = frontmatter.match(/description:\s*(.+)/)
      if (descMatch) description = descMatch[1].trim()
      const enabledMatch = frontmatter.match(/enabled:\s*(.+)/)
      if (enabledMatch) enabled = enabledMatch[1].trim().toLowerCase() !== 'false'
    }
  }

  if (!description) {
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('---')) {
        description = trimmed.slice(0, 200)
        break
      }
    }
  }

  return {
    name,
    description,
    source: 'super-king',
    enabled,
    path,
  }
}

async function scanSkills(root: string): Promise<LocalSkillInfo[]> {
  const skills: LocalSkillInfo[] = []
  const resolvedRoot = resolve(root)
  try {
    const entries = await readdir(resolvedRoot, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(resolvedRoot, entry.name)
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = await readFile(fullPath, 'utf8')
        skills.push(parseSkill(entry.name.replace(/\.md$/, ''), content, fullPath))
      } else if (entry.isDirectory()) {
        const skillMdPath = join(fullPath, 'SKILL.md')
        try {
          const content = await readFile(skillMdPath, 'utf8')
          skills.push(parseSkill(entry.name, content, skillMdPath))
        } catch {
          // no SKILL.md, skip
        }
      }
    }
  } catch {
    // root may not exist
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, null)
    return
  }

  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/local/skills/root') {
      sendJson(res, 200, { path: resolve(DEFAULT_SKILLS_ROOT) })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/local/skills') {
      const skills = await scanSkills(DEFAULT_SKILLS_ROOT)
      sendJson(res, 200, { skills, root: resolve(DEFAULT_SKILLS_ROOT) })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/local/open-folder') {
      const body = await readJson<{ path?: string }>(req)
      const targetPath = body.path ? resolve(body.path) : resolve(DEFAULT_SKILLS_ROOT)
      try {
        await promisify(execFile)('explorer.exe', [targetPath])
        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 500, { error: `Failed to open folder: ${err instanceof Error ? err.message : String(err)}` })
      }
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, () => {
  console.log(`Local helper listening on http://localhost:${PORT}`)
})
