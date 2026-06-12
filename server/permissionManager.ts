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

interface SessionPermissions {
  root: string
  allowedPaths: Set<string>
  allowedCommands: Set<string>
  pending: Map<string, PendingPermissionRequest>
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

export function requestPathPermission(
  sessionId: string,
  root: string,
  toolName: string,
  operation: PermissionOperation,
  targetPath: string,
): string {
  const entry = getOrCreate(sessionId, root)
  const normalizedTarget = normalizePath(targetPath)
  const existing = [...entry.pending.values()].find((request) => (
    request.toolName === toolName && request.operation === operation && request.path && normalizePath(request.path) === normalizedTarget
  ))
  if (existing) return existing.reason

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
  return request.reason
}

export function isCommandAllowed(sessionId: string, root: string, command: string): boolean {
  const entry = getOrCreate(sessionId, root)
  return entry.allowedCommands.has(command)
}

export function requestCommandPermission(sessionId: string, root: string, toolName: string, command: string): string {
  const entry = getOrCreate(sessionId, root)
  const existing = [...entry.pending.values()].find((request) => request.toolName === toolName && request.command === command)
  if (existing) return existing.reason

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
  return request.reason
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
  } else if (decision === 'allow_once') {
    if (request.path) entry.allowedPaths.add(normalizePath(request.path))
    if (request.command) entry.allowedCommands.add(request.command)
  }
  broadcastAgentEvent(sessionId, { type: 'permission_resolved', requestId, decision })
  return true
}
