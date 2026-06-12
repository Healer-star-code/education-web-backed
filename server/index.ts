import './loadEnv.ts'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { URL } from 'node:url'
import { addSseClient } from './sse.ts'
import { selectDirectoryWithWindowsDialog } from './directoryDialog.ts'
import { createProjectSkill, type CreateSkillPayload } from './skillsManager.ts'
import { listRecentPaths, upsertRecentPath, removeRecentPath, closeRecentPathsDb } from './recentPathsManager.ts'
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
      sendJson(res, 200, { paths: listRecentPaths() })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/recent-paths') {
      const body = await readJson<{ path?: string; action?: 'add' | 'remove' }>(req)
      if (body.action === 'remove' && body.path) {
        removeRecentPath(body.path)
        sendJson(res, 200, { paths: listRecentPaths() })
      } else if (body.path) {
        upsertRecentPath(body.path)
        sendJson(res, 200, { paths: listRecentPaths() })
      } else {
        sendJson(res, 400, { error: 'path is required' })
      }
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/dialog/select-directory') {
      const selectedPath = await selectDirectoryWithWindowsDialog()
      sendJson(res, 200, { path: selectedPath })
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/sessions') {
      const body = await readJson<{ cwd?: string; sessionFile?: string }>(req)
      const session = body.sessionFile ? await openWebSession(body.sessionFile) : await createWebSession(body.cwd)
      sendJson(res, 200, { session })
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
      const dir = body.path ?? process.cwd()
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
      const cwd = body.cwd ?? process.env.V3_WEB_DEFAULT_CWD ?? process.cwd()
      const skill = await createProjectSkill(cwd, body)
      sendJson(res, 200, { skill })
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
  disposeAllSessions()
  process.exit(0)
})
process.once('SIGTERM', () => {
  closeRecentPathsDb()
  disposeAllSessions()
  process.exit(0)
})
