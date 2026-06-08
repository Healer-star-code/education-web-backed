import type { ServerResponse } from 'node:http'
import type { WebAgentEvent } from './types.ts'

const clientsBySession = new Map<string, Set<ServerResponse>>()

export function addSseClient(sessionId: string, res: ServerResponse): () => void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  })
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`)

  let clients = clientsBySession.get(sessionId)
  if (!clients) {
    clients = new Set()
    clientsBySession.set(sessionId, clients)
  }
  clients.add(res)

  const heartbeat = setInterval(() => {
    res.write(':\n\n')
  }, 30_000)

  return () => {
    clearInterval(heartbeat)
    clients?.delete(res)
    if (clients?.size === 0) clientsBySession.delete(sessionId)
    res.end()
  }
}

export function broadcastAgentEvent(sessionId: string, event: WebAgentEvent): void {
  const clients = clientsBySession.get(sessionId)
  if (!clients) return
  const payload = `data: ${JSON.stringify(event)}\n\n`
  for (const client of clients) client.write(payload)
}
