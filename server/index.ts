import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { URL } from 'node:url'

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

    if (req.method === 'POST' && url.pathname === '/api/echo') {
      const body = await readJson<unknown>(req)
      sendJson(res, 200, { ok: true, body })
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
