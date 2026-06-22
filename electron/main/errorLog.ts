import { app } from 'electron'
import { existsSync, mkdirSync, statSync, renameSync, appendFileSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Renderer 错误日志：把 React/全局 JS 错误持久化到 %APPDATA%/super-king-agent/logs/renderer-errors.log。
 *
 * 目的：用户碰到「页面渲染错误」时不需要看清错误页就能给我们日志，
 *      直接打开日志文件粘给开发者即可定位 bug。
 *
 * 滚动策略：单文件 1MB，到顶后改名为 .1.log（最多 1 个备份），新写入从空文件开始。
 */

const MAX_LOG_BYTES = 1 * 1024 * 1024 // 1MB

let logDirCached: string | null = null
let rendererLogPathCached: string | null = null
let mainLogPathCached: string | null = null

function ensureLogDir(): string {
  if (logDirCached) return logDirCached
  const dir = join(app.getPath('userData'), 'logs')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  logDirCached = dir
  return dir
}

function ensureLogPaths(): { dir: string; path: string } {
  if (logDirCached && rendererLogPathCached) return { dir: logDirCached, path: rendererLogPathCached }
  const dir = ensureLogDir()
  rendererLogPathCached = join(dir, 'renderer-errors.log')
  return { dir, path: rendererLogPathCached }
}

function ensureMainLogPaths(): { dir: string; path: string } {
  if (logDirCached && mainLogPathCached) return { dir: logDirCached, path: mainLogPathCached }
  const dir = ensureLogDir()
  mainLogPathCached = join(dir, 'main-errors.log')
  return { dir, path: mainLogPathCached }
}

function rotateIfNeeded(path: string) {
  try {
    if (!existsSync(path)) return
    const sz = statSync(path).size
    if (sz < MAX_LOG_BYTES) return
    const backup = path + '.1'
    try {
      // Windows 上 rename 到已存在路径会失败，需要先删除旧备份
      if (existsSync(backup)) {
        unlinkSync(backup)
      }
      renameSync(path, backup)
    } catch (err) {
      console.warn('[errorLog] rotate failed, will overwrite:', err)
    }
  } catch (err) {
    console.warn('[errorLog] rotateIfNeeded probe failed:', err)
  }
}

export interface RendererErrorPayload {
  source?: string           // 'ErrorBoundary' | 'MessageErrorBoundary' | 'window.onerror' | 'unhandledrejection' | ...
  message?: string
  stack?: string
  componentStack?: string
  url?: string
  userAgent?: string
  sessionId?: string | null
  contentLength?: number
  extra?: Record<string, unknown>
}

export function appendRendererError(payload: RendererErrorPayload): { ok: boolean; path?: string; error?: string } {
  try {
    const { path } = ensureLogPaths()
    rotateIfNeeded(path)
    const now = new Date().toISOString()
    const block = [
      `========== ${now} ==========`,
      `source: ${payload.source ?? '(unknown)'}`,
      payload.message ? `message: ${payload.message}` : '',
      payload.sessionId ? `sessionId: ${payload.sessionId}` : '',
      payload.contentLength != null ? `contentLength: ${payload.contentLength}` : '',
      payload.url ? `url: ${payload.url}` : '',
      payload.userAgent ? `ua: ${payload.userAgent}` : '',
      payload.extra ? `extra: ${safeStringify(payload.extra)}` : '',
      payload.stack ? `stack:\n${payload.stack}` : '',
      payload.componentStack ? `componentStack:\n${payload.componentStack}` : '',
      '',
    ].filter(Boolean).join('\n')
    appendFileSync(path, block + '\n', 'utf8')
    return { ok: true, path }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // 不要把这个 throw 上抛，否则会触发更多错误
    console.error('[errorLog] appendRendererError failed:', msg)
    return { ok: false, error: msg }
  }
}

export function readRendererErrorTail(maxBytes = 64 * 1024): { ok: boolean; path?: string; content?: string; error?: string } {
  try {
    const { path } = ensureLogPaths()
    if (!existsSync(path)) return { ok: true, path, content: '' }
    const sz = statSync(path).size
    if (sz <= maxBytes) {
      return { ok: true, path, content: readFileSync(path, 'utf8') }
    }
    // 读尾部：粗糙做法（小文件用），直接 readFileSync 全读再 slice
    const full = readFileSync(path, 'utf8')
    return { ok: true, path, content: '…(truncated)…\n' + full.slice(-maxBytes) }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

export function getRendererErrorLogPath(): string {
  return ensureLogPaths().path
}

export function appendMainError(err: unknown): { ok: boolean; path?: string; error?: string } {
  try {
    const { path } = ensureMainLogPaths()
    rotateIfNeeded(path)
    const now = new Date().toISOString()
    const message = err instanceof Error ? err.message : String(err)
    const stack = err instanceof Error && err.stack ? err.stack : ''
    const block = [
      `========== ${now} ==========`,
      `message: ${message}`,
      stack ? `stack:\n${stack}` : '',
      '',
    ].filter(Boolean).join('\n')
    appendFileSync(path, block + '\n', 'utf8')
    return { ok: true, path }
  } catch (logErr) {
    const msg = logErr instanceof Error ? logErr.message : String(logErr)
    console.error('[errorLog] appendMainError failed:', msg)
    return { ok: false, error: msg }
  }
}

export function getMainErrorLogPath(): string {
  return ensureMainLogPaths().path
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}
