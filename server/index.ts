import './loadEnv.ts'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { URL } from 'node:url'
import { addSseClient } from './sse.ts'
import { selectDirectoryWithWindowsDialog } from './directoryDialog.ts'
import { createProjectSkill, type CreateSkillPayload } from './skillsManager.ts'
import { listRecentPaths, upsertRecentPath, removeRecentPath, closeRecentPathsDb } from './recentPathsManager.ts'
import { listPendingPermissions, resolvePermissionRequest } from './permissionManager.ts'
import { assertUserProjectPath, filterUserProjectPaths, isSystemProjectPath } from './pathGuards.ts'
import { closeSessionTitleDb } from './sessionTitleManager.ts'
import type { PromptPayload } from './types.ts'
import {
  abortSession,
  createWebSession,
  deleteSession,
  disposeAllSessions,
  getMessages,
  listSessions,
  listSkills,
  listTools,
  openWebSession,
  renameSession,
  sendPrompt,
  setTools,
} from './piSessionManager.ts'

const PORT = Number(process.env.V3_WEB_SERVER_PORT ?? 30142)

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  res.end(JSON.stringify(body))
}

function sendNotFound(res: ServerResponse): void {
  sendJson(res, 404, { error: 'Not found' })
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  return (raw ? JSON.parse(raw) : {}) as T
}

function safeRecentPaths() {
  const paths = listRecentPaths()
  for (const item of paths) {
    if (isSystemProjectPath(item.path)) removeRecentPath(item.path)
  }
  return filterUserProjectPaths(paths)
}

function getSessionAction(pathname: string, suffix: string): string | undefined {
  if (!pathname.startsWith('/api/sessions/') || !pathname.endsWith(suffix)) return undefined
  return decodeURIComponent(pathname.slice('/api/sessions/'.length, -suffix.length))
}

function getToolsSessionId(pathname: string): string | undefined {
  if (!pathname.startsWith('/api/tools/')) return undefined
  const id = pathname.slice('/api/tools/'.length)
  return id ? decodeURIComponent(id) : undefined
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, null)
      return
    }

    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, service: 'v3-web-sdk-server' })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/recent-paths') {
      sendJson(res, 200, { paths: safeRecentPaths() })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/recent-paths') {
      const body = await readJson<{ path?: string; action?: 'add' | 'remove' }>(req)
      if (body.action === 'remove' && body.path) {
        removeRecentPath(body.path)
        sendJson(res, 200, { paths: safeRecentPaths() })
      } else if (body.path) {
        if (isSystemProjectPath(body.path)) {
          removeRecentPath(body.path)
          sendJson(res, 200, { paths: safeRecentPaths() })
          return
        }
        upsertRecentPath(body.path)
        sendJson(res, 200, { paths: safeRecentPaths() })
      } else {
        sendJson(res, 400, { error: 'path is required' })
      }
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/dialog/select-directory') {
      const selectedPath = await selectDirectoryWithWindowsDialog()
      if (selectedPath && isSystemProjectPath(selectedPath)) {
        sendJson(res, 400, { error: '不能选择系统安装目录作为项目目录' })
        return
      }
      sendJson(res, 200, { path: selectedPath })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/sessions') {
      const body = await readJson<{ mode?: 'new_isolated' | 'open_existing'; cwd?: string; sessionFile?: string }>(req)
      const mode = body.mode ?? (body.sessionFile ? 'open_existing' : 'new_isolated')
      if (mode === 'new_isolated') {
        const session = await createWebSession(assertUserProjectPath(body.cwd))
        sendJson(res, 200, { session })
      } else {
        if (!body.sessionFile) {
          sendJson(res, 400, { error: 'sessionFile is required' })
          return
        }
        const session = await openWebSession(body.sessionFile)
        sendJson(res, 200, { session })
      }
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/sessions') {
      const cwd = url.searchParams.get('cwd') ?? undefined
      sendJson(res, 200, { sessions: await listSessions(cwd) })
      return
    }

    if (req.method === 'GET') {
      const sessionId = getSessionAction(url.pathname, '/events')
      if (sessionId) {
        const cleanup = addSseClient(sessionId, res)
        req.on('close', cleanup)
        return
      }
    }

    if (req.method === 'GET') {
      const sessionId = getSessionAction(url.pathname, '/messages')
      if (sessionId) {
        sendJson(res, 200, { messages: getMessages(sessionId) })
        return
      }
    }

    if (req.method === 'POST') {
      const sessionId = getSessionAction(url.pathname, '/prompt')
      if (sessionId) {
        const body = await readJson<PromptPayload>(req)
        await sendPrompt(sessionId, body.message, body.images)
        sendJson(res, 200, { ok: true })
        return
      }
    }

    if (req.method === 'POST') {
      const sessionId = getSessionAction(url.pathname, '/abort')
      if (sessionId) {
        await abortSession(sessionId)
        sendJson(res, 200, { ok: true })
        return
      }
    }

    if (req.method === 'POST') {
      const sessionId = getSessionAction(url.pathname, '/name')
      if (sessionId) {
        const body = await readJson<{ name?: string }>(req)
        if (!body.name?.trim()) {
          sendJson(res, 400, { error: 'name is required' })
          return
        }
        sendJson(res, 200, { session: renameSession(sessionId, body.name) })
        return
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/sessions/delete') {
      const body = await readJson<{ sessionFile?: string }>(req)
      if (!body.sessionFile) {
        sendJson(res, 400, { error: 'sessionFile is required' })
        return
      }
      await deleteSession(body.sessionFile)
      sendJson(res, 200, { ok: true })
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/skills') {
      const cwd = url.searchParams.get('cwd') ?? undefined
      sendJson(res, 200, { skills: await listSkills(cwd) })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/open-folder') {
      const body = await readJson<{ path?: string }>(req)
      if (!body.path?.trim()) {
        sendJson(res, 400, { error: 'path is required' })
        return
      }
      if (isSystemProjectPath(body.path)) {
        sendJson(res, 400, { error: '不能打开系统安装目录' })
        return
      }
      const dir = body.path
      try {
        await promisify(execFile)('explorer.exe', [dir])
        sendJson(res, 200, { ok: true })
      } catch (err) {
        sendJson(res, 500, { error: `Failed to open folder: ${err instanceof Error ? err.message : String(err)}` })
      }
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/skills') {
      const body = await readJson<CreateSkillPayload & { cwd?: string }>(req)
      const cwd = assertUserProjectPath(body.cwd)
      const skill = await createProjectSkill(cwd, body)
      sendJson(res, 200, { skill })
      return
    }

    const permissionMatch = url.pathname.match(/^\/api\/permissions\/([^/]+)$/)
    if (permissionMatch && req.method === 'GET') {
      sendJson(res, 200, { requests: listPendingPermissions(decodeURIComponent(permissionMatch[1])) })
      return
    }
    if (permissionMatch && req.method === 'POST') {
      const body = await readJson<{ requestId?: string; decision?: 'allow_once' | 'allow_session' | 'deny' }>(req)
      if (!body.requestId || !body.decision) {
        sendJson(res, 400, { error: 'requestId and decision are required' })
        return
      }
      const ok = resolvePermissionRequest(decodeURIComponent(permissionMatch[1]), body.requestId, body.decision)
      sendJson(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'permission request not found' })
      return
    }

    const toolsSessionId = getToolsSessionId(url.pathname)
    if (toolsSessionId && req.method === 'GET') {
      sendJson(res, 200, { tools: listTools(toolsSessionId) })
      return
    }
    if (toolsSessionId && req.method === 'POST') {
      const body = await readJson<{ toolNames?: string[] }>(req)
      setTools(toolsSessionId, body.toolNames ?? [])
      sendJson(res, 200, { ok: true })
      return
    }

    sendNotFound(res)
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})

server.listen(PORT, () => {
  console.log(`v3-web SDK server listening on http://localhost:${PORT}`)
})

process.once('SIGINT', () => {
  closeRecentPathsDb()
  closeSessionTitleDb()
  disposeAllSessions()
  process.exit(0)
})
process.once('SIGTERM', () => {
  closeRecentPathsDb()
  closeSessionTitleDb()
  disposeAllSessions()
  process.exit(0)
})
