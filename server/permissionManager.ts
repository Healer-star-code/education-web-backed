import { resolve, relative, isAbsolute } from 'node:path'
import { broadcastAgentEvent } from './sse.ts'

export type PermissionOperation = 'read' | 'write' | 'search' | 'list' | 'execute'

export interface PendingPermissionRequest {
  id: string
  sessionId: string
  toolName: string
  operation: PermissionOperation
  path?: string
  command?: string
  reason: string
  timeCreated: number
}

interface PendingDecision {
  resolve: (decision: 'allow_once' | 'allow_session' | 'deny') => void
  timer: NodeJS.Timeout
}

interface SessionPermissions {
  root: string
  allowedPaths: Set<string>
  allowedCommands: Set<string>
  pending: Map<string, PendingPermissionRequest>
  waiters: Map<string, PendingDecision>
}

const permissionsBySession = new Map<string, SessionPermissions>()

function normalizePath(path: string): string {
  return resolve(path).replace(/[/\\]+/g, '\\').toLowerCase()
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel))
}

function getOrCreate(sessionId: string, root: string): SessionPermissions {
  const existing = permissionsBySession.get(sessionId)
  if (existing) return existing
  const normalizedRoot = normalizePath(root)
  const entry: SessionPermissions = {
    root: normalizedRoot,
    allowedPaths: new Set([normalizedRoot]),
    allowedCommands: new Set(),
    pending: new Map(),
    waiters: new Map(),
  }
  permissionsBySession.set(sessionId, entry)
  return entry
}

export function registerSessionPermissions(sessionId: string, root: string): void {
  getOrCreate(sessionId, root)
}

export function removeSessionPermissions(sessionId: string): void {
  permissionsBySession.delete(sessionId)
}

export function resolveForSession(root: string, inputPath?: string): string {
  if (!inputPath || inputPath.trim() === '') return resolve(root)
  return isAbsolute(inputPath) ? resolve(inputPath) : resolve(root, inputPath)
}

export function isPathAllowed(sessionId: string, root: string, targetPath: string): boolean {
  const entry = getOrCreate(sessionId, root)
  const normalizedTarget = normalizePath(targetPath)
  for (const allowedPath of entry.allowedPaths) {
    if (isInside(allowedPath, normalizedTarget)) return true
  }
  return false
}

function waitForDecision(entry: SessionPermissions, request: PendingPermissionRequest): Promise<'allow_once' | 'allow_session' | 'deny'> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      entry.pending.delete(request.id)
      entry.waiters.delete(request.id)
      broadcastAgentEvent(request.sessionId, { type: 'permission_resolved', requestId: request.id, decision: 'deny' })
      resolve('deny')
    }, 5 * 60 * 1000)
    entry.waiters.set(request.id, { resolve, timer })
  })
}

export async function requestPathPermissionAndWait(
  sessionId: string,
  root: string,
  toolName: string,
  operation: PermissionOperation,
  targetPath: string,
): Promise<'allow_once' | 'allow_session' | 'deny'> {
  const entry = getOrCreate(sessionId, root)
  const normalizedTarget = normalizePath(targetPath)
  const existing = [...entry.pending.values()].find((request) => (
    request.toolName === toolName && request.operation === operation && request.path && normalizePath(request.path) === normalizedTarget
  ))
  if (existing) return waitForDecision(entry, existing)

  const request: PendingPermissionRequest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    sessionId,
    toolName,
    operation,
    path: targetPath,
    reason: `工具 ${toolName} 请求访问会话目录外路径：${targetPath}`,
    timeCreated: Date.now(),
  }
  entry.pending.set(request.id, request)
  broadcastAgentEvent(sessionId, { type: 'permission_request', request })
  return waitForDecision(entry, request)
}

export function requestPathPermission(
  sessionId: string,
  root: string,
  toolName: string,
  operation: PermissionOperation,
  targetPath: string,
): string {
  void requestPathPermissionAndWait(sessionId, root, toolName, operation, targetPath)
  return `工具 ${toolName} 请求访问会话目录外路径：${targetPath}`
}

export function isCommandAllowed(sessionId: string, root: string, command: string): boolean {
  const entry = getOrCreate(sessionId, root)
  return entry.allowedCommands.has(command)
}

export async function requestCommandPermissionAndWait(sessionId: string, root: string, toolName: string, command: string): Promise<'allow_once' | 'allow_session' | 'deny'> {
  const entry = getOrCreate(sessionId, root)
  const existing = [...entry.pending.values()].find((request) => request.toolName === toolName && request.command === command)
  if (existing) return waitForDecision(entry, existing)

  const request: PendingPermissionRequest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    sessionId,
    toolName,
    operation: 'execute',
    command,
    reason: `工具 ${toolName} 请求执行命令：${command}`,
    timeCreated: Date.now(),
  }
  entry.pending.set(request.id, request)
  broadcastAgentEvent(sessionId, { type: 'permission_request', request })
  return waitForDecision(entry, request)
}

export function requestCommandPermission(sessionId: string, root: string, toolName: string, command: string): string {
  void requestCommandPermissionAndWait(sessionId, root, toolName, command)
  return `工具 ${toolName} 请求执行命令：${command}`
}

export function listPendingPermissions(sessionId: string): PendingPermissionRequest[] {
  const entry = permissionsBySession.get(sessionId)
  return entry ? [...entry.pending.values()] : []
}

export function resolvePermissionRequest(sessionId: string, requestId: string, decision: 'allow_once' | 'allow_session' | 'deny'): boolean {
  const entry = permissionsBySession.get(sessionId)
  const request = entry?.pending.get(requestId)
  if (!entry || !request) return false

  entry.pending.delete(requestId)
  if (decision === 'allow_session') {
    if (request.path) entry.allowedPaths.add(normalizePath(request.path))
    if (request.command) entry.allowedCommands.add(request.command)
  }
  const waiter = entry.waiters.get(requestId)
  if (waiter) {
    clearTimeout(waiter.timer)
    entry.waiters.delete(requestId)
    waiter.resolve(decision)
  }
  broadcastAgentEvent(sessionId, { type: 'permission_resolved', requestId, decision })
  return true
}
