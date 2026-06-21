import { spawn, type ChildProcess } from 'node:child_process'
import { BrowserWindow } from 'electron'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import treeKill from 'tree-kill'

export type SuperKingState = 'stopped' | 'starting' | 'running' | 'external' | 'error'

export interface SuperKingStatus {
  state: SuperKingState
  pid: number | null
  port: number
  error: string | null
  exePath: string | null
  startedAt: number | null
}

export interface StartOptions {
  exePath: string
  port: number
  password: string
  env?: Record<string, string>
  workingDir?: string
}

let proc: ChildProcess | null = null
let status: SuperKingStatus = {
  state: 'stopped',
  pid: null,
  port: 30142,
  error: null,
  exePath: null,
  startedAt: null,
}
let bufferedStdout = ''
let bufferedStderr = ''

// 给外部一个清除 error 的入口（用户点了 "清除错误" / 探测到外部时）
export function clearError(): void {
  if (status.state === 'error') {
    setStatus({ state: 'stopped', error: null, pid: null })
  }
}

function broadcast(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('superking:status', status)
    }
  }
}

function setStatus(patch: Partial<SuperKingStatus>): void {
  status = { ...status, ...patch }
  broadcast()
}

export function getStatus(): SuperKingStatus {
  return status
}

// 由外部探测器调用：把 status 设为 external（保持广播一致性）
export function setExternalStatus(port: number): void {
  if (proc) return // 自己启的子进程优先
  if (status.state !== 'external') {
    setStatus({
      state: 'external',
      pid: null,
      port,
      error: null,
      exePath: null,
      startedAt: status.startedAt ?? Date.now(),
    })
  }
}

// 由外部探测器调用：外部 super-king 消失（且无自启子进程）
export function clearExternalStatus(): void {
  if (proc) return
  if (status.state === 'external' || status.state === 'error') {
    setStatus({
      state: 'stopped',
      pid: null,
      error: null,
      exePath: null,
      startedAt: null,
    })
  }
}

export function getLogTail(): { stdout: string; stderr: string } {
  return { stdout: bufferedStdout.slice(-4000), stderr: bufferedStderr.slice(-4000) }
}

// 探测端口上是否有外部 super-king 在跑（不依赖我们 spawn 的子进程）
export async function probeExternalSuperKing(port: number, password: string): Promise<boolean> {
  const token = Buffer.from(`super-king:${password}`).toString('base64')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 2500)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      headers: { Authorization: `Basic ${token}` },
      signal: ctrl.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export async function startSuperKing(opts: StartOptions): Promise<SuperKingStatus> {
  if (proc) {
    return status
  }

  const exePath = resolve(opts.exePath)
  if (!existsSync(exePath)) {
    setStatus({ state: 'error', error: `super-king 可执行文件不存在: ${exePath}`, exePath })
    return status
  }

  bufferedStdout = ''
  bufferedStderr = ''
  setStatus({ state: 'starting', error: null, exePath, port: opts.port, startedAt: Date.now() })

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SUPER_KING_SERVER_PASSWORD: opts.password,
    ...(opts.env ?? {}),
  }

  try {
    const child = spawn(exePath, ['serve', '--port', String(opts.port)], {
      cwd: opts.workingDir ?? resolve(exePath, '..'),
      env,
      windowsHide: true,
    })
    proc = child
    setStatus({ pid: child.pid ?? null })

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')

    child.stdout?.on('data', (chunk: string) => {
      bufferedStdout += chunk
      if (status.state === 'starting' && /listening|started|port/i.test(chunk)) {
        setStatus({ state: 'running' })
      }
    })

    child.stderr?.on('data', (chunk: string) => {
      bufferedStderr += chunk
    })

    child.on('error', (err) => {
      setStatus({ state: 'error', error: err.message, pid: null })
      proc = null
    })

    child.on('exit', (code, signal) => {
      const reason = signal ? `signal ${signal}` : `code ${code}`
      const wasRunning = status.state === 'running' || status.state === 'starting'
      setStatus({
        state: wasRunning && code !== 0 ? 'error' : 'stopped',
        pid: null,
        error: wasRunning && code !== 0 ? `super-king 退出: ${reason}` : null,
      })
      proc = null
    })

    // 兜底：3 秒后还在 starting，按 running 处理（super-king 通常不打印明显日志）
    setTimeout(() => {
      if (status.state === 'starting') {
        setStatus({ state: 'running' })
      }
    }, 3000)

    return status
  } catch (err) {
    proc = null
    setStatus({
      state: 'error',
      error: err instanceof Error ? err.message : String(err),
      pid: null,
    })
    return status
  }
}

export async function stopSuperKing(): Promise<SuperKingStatus> {
  if (!proc) {
    setStatus({ state: 'stopped', pid: null })
    return status
  }
  const pid = proc.pid
  return new Promise((res) => {
    const finish = () => {
      proc = null
      setStatus({ state: 'stopped', pid: null, error: null })
      res(status)
    }
    if (pid) {
      treeKill(pid, 'SIGTERM', (err) => {
        if (err) {
          // 兜底硬杀
          treeKill(pid, 'SIGKILL', () => finish())
        } else {
          finish()
        }
      })
    } else {
      const p = proc
      try { p?.kill('SIGTERM') } catch { /* ignore */ }
      finish()
    }
  })
}

export async function restartSuperKing(opts: StartOptions): Promise<SuperKingStatus> {
  await stopSuperKing()
  return startSuperKing(opts)
}

export function killOnExit(): void {
  if (proc?.pid) {
    try {
      treeKill(proc.pid, 'SIGKILL')
    } catch {
      // ignore
    }
    proc = null
  }
}
